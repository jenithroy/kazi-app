import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteRow, fetchAll, insertRow, subscribe, updateRow } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { useRegion } from "../context/RegionContext";
import { useReward } from "../context/RewardContext";
import { sectionCanEdit } from "../utils/permissions";
import { countUntagged, filterByRegion } from "../utils/region";
import { kathmanduDate } from "../utils/date";
import { TASK_CATEGORIES } from "../constants";
import { RegionSwitch } from "../components/RegionSwitch";
import { BentoPage, EmptyNote } from "../components/bento/Bento";
import { Archive, Lock } from "../components/bento/icons";
import { useReveal } from "../hooks/useReveal";
import { refreshPoints, useMyPoints } from "../hooks/usePoints";
import { Avatar, Icons, cn, hueFromName } from "../components/ui";
import Select from "../components/Select";
import { useClearedTasks } from "../hooks/useClearedTasks";
import TaskColumn from "../components/tasks/TaskColumn";
import TaskMenu from "../components/tasks/TaskMenu";
import TaskPanel from "../components/tasks/TaskPanel";
import SectionDialog from "../components/tasks/SectionDialog";
import DoneTile from "../components/tasks/DoneTile";
import ArchiveDialog from "../components/tasks/ArchiveDialog";
import ConfirmDialog from "../components/tasks/ConfirmDialog";
import { LeaderboardTile, PointsTile } from "../components/tasks/RailPoints";
import { DEFAULT_SECTIONS } from "../components/tasks/tones";
import {
  BEHIND_MSG, DONE, byDoneDate, byUrgency, databaseBehind, deleteTasks,
  isArchived, isDone, sameName, setTaskDone,
} from "../lib/tasks";
import "../components/tasks/tasks.css";

/**
 * Tasks: a board of sections the team makes and names, tasks as cards, and a rail with the
 * week's finished work and the points.
 *
 * You land on your own tasks (Everyone is one press away, unless your position only sees
 * its own). A task is ticked off with the circle on its card and lands in Done; a week later
 * it moves to the Archive by itself, and "Clear" sends the lot there at once. Clearing is
 * personal: it is remembered on this device only (hooks/useClearedTasks.js), so each person
 * and each device has an Archive of their own. Finishing a task pays the person it is
 * assigned to (the database does that, see migration 0057).
 *
 * Who may do what:
 *   edit Tasks      make, change, move and delete tasks and sections; finish anyone's
 *   the assignee    finish and reopen their own tasks, even without edit rights
 *   everyone        clear their own Done list (it changes nothing for anyone else)
 *   everyone else   otherwise read only
 *
 * Everything that writes goes through one of the helpers below, so a failure is explained in
 * one place. A write the database refuses because a migration has not been run shows a
 * notice at the top ("migration 0058") instead of a cryptic error.
 */

const SCOPE_KEY = "kazi.tasks.scope";
const readScope = () => { try { return localStorage.getItem(SCOPE_KEY) === "all" ? "all" : "mine"; } catch { return "mine"; } };

function Tasks() {
  const { profile } = useAuth();
  const me = profile?.personId || null;
  const canEdit = sectionCanEdit(profile, "tasks");
  const role = profile?.appRole || profile?.role;
  // Staff see only their own tasks unless they have been given Tasks permission.
  const ownTasksOnly = (role === "employee" || role === "nepal_staff") && !canEdit;
  const { region } = useRegion();
  const { showPointsToast } = useReward();
  const points = useMyPoints();

  /* ── data ───────────────────────────────────────────────── */
  const [columns, setColumns] = useState([]);
  const [allTasks, setTasks] = useState([]);
  const [allCustomers, setCustomers] = useState([]);
  const [people, setPeople] = useState([]);
  const [load, setLoad] = useState({ status: "loading", error: "" });
  const [behind, setBehind] = useState(false);          // the database is missing a migration this page needs

  // What this person has cleared away, kept on this device (hooks/useClearedTasks.js).
  const { cleared, clear: clearHere, restore: restoreHere, prune } = useClearedTasks(me);
  useEffect(() => {
    // forget cleared tasks that were deleted or reopened since, so the list does not pile up
    if (load.status === "ready") prune(new Set(allTasks.filter(isDone).map((t) => t.id)));
  }, [allTasks, load.status, prune]);

  const tasks = useMemo(() => filterByRegion(allTasks, region), [allTasks, region]);
  const customers = useMemo(() => filterByRegion(allCustomers, region), [allCustomers, region]);

  const loadColumns = useCallback(async () => {
    let cols = await fetchAll("task_columns");
    // Two sections with one name would be tidied away: keep the first of each.
    const seen = new Map();
    const dupes = [];
    for (const c of cols) {
      const key = (c.label || "").trim().toLowerCase();
      if (seen.has(key)) dupes.push(c.id); else seen.set(key, c);
    }
    if (dupes.length) await Promise.allSettled(dupes.map((id) => deleteRow("task_columns", id)));
    cols = [...seen.values()];
    if (cols.length === 0 && canEdit) {
      await Promise.all(DEFAULT_SECTIONS.map((c) => insertRow("task_columns", c)));
      cols = await fetchAll("task_columns");
    }
    cols.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    setColumns(cols);
  }, [canEdit]);

  const loadTasks = useCallback(async () => {
    const rows = await fetchAll("tasks");
    setTasks(rows);
    // The newer columns are missing from the view until the migration has been run.
    if (rows.length && rows.every((r) => !("sectionId" in r))) setBehind(true);
  }, []);

  const loadAll = useCallback(async () => {
    setLoad({ status: "loading", error: "" });
    try {
      await Promise.all([
        loadColumns(),
        loadTasks(),
        fetchAll("customers", { orderBy: "name", orderDir: "asc" }).then(setCustomers).catch(() => setCustomers([])),
        fetchAll("employees")
          .then((rows) => setPeople(
            rows.filter((e) => e.status !== "Inactive" && e.name)
              .map((e) => ({ id: String(e.id), name: e.name, email: e.email || "" }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          ))
          .catch(() => setPeople([])),
      ]);
      setLoad({ status: "ready", error: "" });
    } catch (err) {
      console.error("Tasks failed to load:", err);
      setLoad({ status: "error", error: err?.message || "Something went wrong." });
    }
  }, [loadColumns, loadTasks]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // A teammate's change shows up without a refresh (once migration 0058 has published the tables).
  const reloadTimer = useRef(null);
  useEffect(() => {
    const again = () => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => { loadTasks().catch(() => {}); loadColumns().catch(() => {}); }, 500);
    };
    let offs = [];
    try { offs = [subscribe("tasks", again), subscribe("task_columns", again)]; } catch { /* live updates are a nicety */ }
    return () => { clearTimeout(reloadTimer.current); offs.forEach((off) => off && off()); };
  }, [loadTasks, loadColumns]);

  /* ── who and when ──────────────────────────────────────── */
  const today = kathmanduDate();
  const personByName = useMemo(() => {
    const seen = new Map();
    for (const p of people) {
      const k = p.name.trim().toLowerCase();
      seen.set(k, seen.has(k) ? null : p);   // a name two people share finds nobody
    }
    return seen;
  }, [people]);
  /** The person a task is assigned to: by id, else by its typed name when that names exactly one person. */
  const personOf = useCallback((t) => (
    t.assignee_id ? people.find((p) => p.id === String(t.assignee_id)) || null
      : personByName.get(String(t.assignee || "").trim().toLowerCase()) || null
  ), [people, personByName]);
  /** Is it assigned to me as a person? Only this lets someone who cannot edit tasks finish one, and only this earns points. */
  const assignedToMe = useCallback((t) => Boolean(t.assignee_id && me && String(t.assignee_id) === String(me)), [me]);
  /** Is it mine to look at? That is assigned to me, or an old task that only carries my name. */
  const isMine = useCallback((t) => (
    assignedToMe(t) || (!t.assignee_id && sameName(t.assignee, profile?.name))
  ), [assignedToMe, profile?.name]);
  /**
   * May this person finish (and reopen, archive) this task? Editors any; the assignee their own.
   * The database enforces the same rule by the person, not the typed name, so an old task that
   * only carries a name can be finished by an editor but not by the person it names.
   */
  const canTick = useCallback((t) => canEdit || assignedToMe(t), [canEdit, assignedToMe]);

  /* ── what is on screen ─────────────────────────────────── */
  const [scope, setScopeState] = useState(readScope);
  const setScope = (s) => { setScopeState(s); try { localStorage.setItem(SCOPE_KEY, s); } catch { /* it just is not remembered */ } };
  const effectiveScope = ownTasksOnly ? "mine" : scope;
  const [personFilter, setPersonFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [custFilter, setCustFilter] = useState("");
  const [query, setQuery] = useState("");
  const filtersOn = [personFilter, catFilter, custFilter, query.trim()].some(Boolean);
  const [moreFilters, setMoreFilters] = useState(false);   // on a phone the selects fold away behind a button
  const selectsOn = [effectiveScope === "all" && personFilter, catFilter, custFilter].filter(Boolean).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (effectiveScope === "mine" && !isMine(t)) return false;
      if (effectiveScope === "all" && personFilter) {
        const p = personOf(t);
        if (!(p && p.id === personFilter)) return false;
      }
      if (catFilter && t.category !== catFilter) return false;
      if (custFilter && t.customer !== custFilter) return false;
      if (q && ![t.title, t.assignee, t.customer, t.orderRef, t.description].some((v) => String(v || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [tasks, effectiveScope, personFilter, catFilter, custFilter, query, isMine, personOf]);

  const firstId = columns[0]?.id;
  const sectionIds = useMemo(() => new Set(columns.map((c) => c.id)), [columns]);
  const sectionByName = useMemo(() => new Map(columns.map((c) => [c.label.trim().toLowerCase(), c.id])), [columns]);
  /** A task with no section (or whose section has gone) shows where its old status says, else in the first one: nothing is ever hidden. */
  const sectionOf = useCallback((t) => (
    sectionIds.has(t.sectionId) ? t.sectionId : sectionByName.get(String(t.status || "").trim().toLowerCase()) ?? firstId
  ), [sectionIds, sectionByName, firstId]);

  const byColumn = useMemo(() => {
    const acc = Object.fromEntries(columns.map((c) => [c.id, []]));
    for (const t of visible) if (!isDone(t)) acc[sectionOf(t)]?.push(t);
    for (const id of Object.keys(acc)) acc[id].sort(byUrgency);
    return acc;
  }, [visible, columns, sectionOf]);

  const openBySection = useMemo(() => {
    const acc = Object.fromEntries(columns.map((c) => [c.id, 0]));
    for (const t of allTasks) if (!isDone(t) && sectionOf(t) in acc) acc[sectionOf(t)] += 1;
    return acc;
  }, [allTasks, columns, sectionOf]);

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNowTick(Date.now()), 5 * 60000); return () => clearInterval(id); }, []);
  const doneRecent = useMemo(() => visible.filter((t) => isDone(t) && !isArchived(t, nowTick, cleared)).sort(byDoneDate), [visible, nowTick, cleared]);
  const archived = useMemo(() => visible.filter((t) => isArchived(t, nowTick, cleared)).sort(byDoneDate), [visible, nowTick, cleared]);

  const openVisible = useMemo(() => visible.filter((t) => !isDone(t)), [visible]);
  const dueToday = openVisible.filter((t) => t.dueDate === today).length;
  const late = openVisible.filter((t) => t.dueDate && t.dueDate < today).length;

  /* ── writing ───────────────────────────────────────────── */
  const [notice, setNotice] = useState("");   // a short message at the top, for what could not be saved
  const fail = useCallback((err, fallback) => {
    console.error(fallback, err);
    if (databaseBehind(err)) { setBehind(true); setNotice(BEHIND_MSG); }
    else setNotice(`${fallback}${err?.message ? ` (${err.message})` : ""}`);
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 9000);
    return () => clearTimeout(t);
  }, [notice]);

  const patchLocal = (id, patch) => setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  /** Change a task: show it now, put it back if the database says no. Resolves to whether it saved. */
  async function saveTask(task, patch) {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, task[k]]));
    patchLocal(task.id, patch);
    try {
      await updateRow("tasks", task.id, patch);
      return { ok: true };
    } catch (err) {
      patchLocal(task.id, before);
      const message = databaseBehind(err) ? BEHIND_MSG : "The database wouldn't save that. You may not have permission to edit tasks.";
      fail(err, "Couldn't save the change.");
      return { ok: false, message };
    }
  }

  async function createTask(data) {
    try {
      const row = await insertRow("tasks", {
        ...data,
        dueDate: data.dueDate || null,
        region: data.region || region,
        createdBy: profile?.name || "Unknown",
      });
      if (row) setTasks((cur) => [row, ...cur]);
      else await loadTasks();
      return { ok: true };
    } catch (err) {
      const message = databaseBehind(err) ? BEHIND_MSG : `Couldn't add the task. ${err?.message || ""}`.trim();
      fail(err, "Couldn't add the task.");
      return { ok: false, message };
    }
  }

  /** The one-line add under a section's + button. A new task is yours, unless you are looking at one person's. */
  async function quickAdd(col, title) {
    const owner = effectiveScope === "all" && personFilter ? people.find((p) => p.id === personFilter) : people.find((p) => p.id === me);
    const res = await createTask({
      title, sectionId: col.id, priority: "med",
      assignee_id: owner?.id || null,
      assignee: owner?.name || (effectiveScope === "mine" ? profile?.name || "" : ""),
    });
    return res.ok;
  }

  const [leavingId, setLeavingId] = useState(null);
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  async function finish(task) {
    if (!canTick(task) || leavingId) return;
    setLeavingId(task.id);
    if (!reduceMotion) await new Promise((r) => setTimeout(r, 170));
    const before = { status: task.status, completedAt: task.completedAt };
    const total = points.data?.total ?? null;
    patchLocal(task.id, { status: DONE, completedAt: new Date().toISOString() });
    restoreHere([task.id]);   // finished again: it belongs in my Done list, whatever I cleared before
    setLeavingId(null);
    try {
      await setTaskDone(task.id, true);
    } catch (err) {
      patchLocal(task.id, before);
      fail(err, "Couldn't mark it done.");
      return;
    }
    // The database paid the assignee; if that is me, say how much.
    if (assignedToMe(task) && total !== null) {
      const now = await refreshPoints();
      if (now && now.total > total) showPointsToast(now.total - total, task.title);
    } else {
      refreshPoints();
    }
  }

  async function reopen(task) {
    if (!canTick(task)) return;
    const before = { status: task.status, completedAt: task.completedAt };
    patchLocal(task.id, { status: null, completedAt: null });
    restoreHere([task.id]);
    try {
      await setTaskDone(task.id, false);
    } catch (err) {
      patchLocal(task.id, before);
      fail(err, "Couldn't reopen it.");
    }
  }

  // Clearing is personal and local: it hides tasks from this person's Done list on this
  // device and nothing else changes (the database is not touched, so there is nothing to fail).
  const [undo, setUndo] = useState(null);   // { ids, count }
  const undoTimer = useRef(null);
  function clearDone() {
    const ids = doneRecent.map((t) => t.id);
    if (!ids.length) return;
    clearHere(ids);
    setUndo({ ids, count: ids.length });
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 9000);
  }
  function undoClear() {
    if (!undo) return;
    restoreHere(undo.ids);
    setUndo(null);
    clearTimeout(undoTimer.current);
  }
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const [confirm, setConfirm] = useState(null);   // { title, text, label, run }
  function askDelete(task) {
    setConfirm({
      title: "Delete this task?",
      text: `"${task.title}" will be deleted for good. The points it earned stay.`,
      label: "Delete task",
      run: async () => {
        try {
          await deleteRow("tasks", task.id);
          setTasks((cur) => cur.filter((t) => t.id !== task.id));
          setPanel((p) => (p?.task?.id === task.id ? null : p));
          return true;
        } catch (err) {
          fail(err, "Couldn't delete the task.");
          return { ok: false, message: "The database wouldn't delete it. You may not have permission to edit tasks." };
        }
      },
    });
  }
  function askDeleteArchived() {
    const ids = archived.map((t) => t.id);
    setConfirm({
      title: `Delete ${ids.length} archived ${ids.length === 1 ? "task" : "tasks"}?`,
      text: `They will be deleted for good, for everyone: the Archive is only your view, but a deleted task is gone from the database and cannot be brought back. The points they earned stay.`,
      label: `Delete ${ids.length}`,
      run: async () => {
        try {
          await deleteTasks(ids);
          const gone = new Set(ids);
          setTasks((cur) => cur.filter((t) => !gone.has(t.id)));
          return true;
        } catch (err) {
          fail(err, "Couldn't delete them.");
          loadTasks().catch(() => {});
          return { ok: false, message: "The database wouldn't delete them all. You may not have permission to edit tasks." };
        }
      },
    });
  }

  /* ── sections ──────────────────────────────────────────── */
  const nameProblem = (label, exceptId) => {
    const key = label.trim().toLowerCase();
    if (key === DONE.toLowerCase()) return "Done is built in: it's the tile on the right.";
    if (columns.some((c) => c.id !== exceptId && c.label.trim().toLowerCase() === key)) return `There's already a section called "${label.trim()}".`;
    return null;
  };

  async function addSection(label, tone) {
    try {
      const maxOrder = columns.reduce((m, c) => Math.max(m, c.order ?? 0), 0);
      const row = await insertRow("task_columns", { label, tone: tone || "neutral", order: maxOrder + 1 });
      if (row) setColumns((cur) => [...cur, row]); else await loadColumns();
      setTimeout(() => document.querySelector(`[data-section="${row?.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }), 80);
      return null;
    } catch (err) {
      console.error("Could not add the section:", err);
      return "Couldn't add the section. You may not have permission to edit tasks.";
    }
  }

  async function updateSection(col, patch) {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, col[k]]));
    setColumns((cur) => cur.map((c) => (c.id === col.id ? { ...c, ...patch } : c)));
    try {
      await updateRow("task_columns", col.id, patch);
    } catch (err) {
      setColumns((cur) => cur.map((c) => (c.id === col.id ? { ...c, ...before } : c)));
      fail(err, "Couldn't change the section.");
    }
  }

  async function moveSection(col, dir) {
    const list = [...columns];
    const from = list.findIndex((c) => c.id === col.id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= list.length) return;
    const before = columns;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    const next = list.map((c, i) => ({ ...c, order: i }));
    setColumns(next);
    try {
      await Promise.all(next.map((c, i) => (before.find((b) => b.id === c.id)?.order === i ? null : updateRow("task_columns", c.id, { order: i }))));
    } catch (err) {
      setColumns(before);
      fail(err, "Couldn't move the section.");
    }
  }

  // Its open tasks move first, so none drops off the board; finished ones just lose their section.
  async function deleteSection(col, targetId) {
    if (columns.length <= 1) return false;
    const moving = allTasks.filter((t) => !isDone(t) && sectionOf(t) === col.id);
    try {
      if (moving.length && !columns.some((c) => c.id === targetId && c.id !== col.id)) throw new Error("no section to move the tasks to");
      await Promise.all(moving.map((t) => updateRow("tasks", t.id, { sectionId: targetId })));
      await deleteRow("task_columns", col.id);
    } catch (err) {
      fail(err, "Couldn't delete the section.");
      await Promise.allSettled([loadColumns(), loadTasks()]);
      return false;
    }
    const moved = new Set(moving.map((t) => t.id));
    setTasks((cur) => cur.map((t) => (moved.has(t.id) ? { ...t, sectionId: targetId } : t.sectionId === col.id ? { ...t, sectionId: null } : t)));
    setColumns((cur) => cur.filter((c) => c.id !== col.id));
    return true;
  }

  /* ── drag and drop (a mouse; a touch screen has the card's menu) ── */
  const [draggingId, setDraggingId] = useState(null);
  const onDragStart = (task) => setDraggingId(task.id);
  const onDragEnd = () => setDraggingId(null);
  function dropOnSection(col) {
    const task = allTasks.find((t) => t.id === draggingId);
    setDraggingId(null);
    if (!task || isDone(task) || sectionOf(task) === col.id) return;
    saveTask(task, { sectionId: col.id });
  }
  function dropOnDone() {
    const task = allTasks.find((t) => t.id === draggingId);
    setDraggingId(null);
    if (task && !isDone(task)) finish(task);
  }

  /* ── what is open on top of the page ───────────────────── */
  const [panel, setPanel] = useState(null);         // { mode: "create" | "edit", task?, sectionId? }
  const [menu, setMenu] = useState(null);           // { task, anchor }
  const [sectionDialog, setSectionDialog] = useState(null);   // { mode: "create" | "edit", col? }
  const [archiveOpen, setArchiveOpen] = useState(false);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [activeSection, setActiveSection] = useState(null);   // a phone shows one section at a time
  const shownSection = sectionIds.has(activeSection) ? activeSection : firstId;

  const openTask = (task) => setPanel({ mode: "edit", task });
  // who a new task is for to begin with: you, or the one person you are looking at
  const startOwnerId = effectiveScope === "all" ? personFilter : me;
  const startOwner = people.some((p) => p.id === startOwnerId) ? startOwnerId : undefined;
  const panelTask = panel?.task ? allTasks.find((t) => t.id === panel.task.id) || panel.task : null;

  /* ── the filter dropdowns ──────────────────────────────── */
  const personFilterOptions = useMemo(() => [
    { value: "", label: "All people" },
    ...people.map((p) => ({ value: p.id, label: p.name, icon: <Avatar name={p.name} personId={p.id} hue={hueFromName(p.name)} size={22} /> })),
  ], [people]);
  const categoryFilterOptions = useMemo(() => [{ value: "", label: "Any category" }, ...TASK_CATEGORIES.map((c) => ({ value: c.label, label: c.label }))], []);
  const customerFilterOptions = useMemo(() => [{ value: "", label: "Any customer" }, ...customers.map((c) => ({ value: c.name, label: c.name }))], [customers]);

  /* ── the glass: the pointer's light across every pane ─── */
  useReveal(() => document.querySelectorAll(".tk-page .kb-tile"));

  const sub = (
    <>
      <span>{openVisible.length} open</span>
      {dueToday > 0 && <span>{dueToday} due today</span>}
      {late > 0 && <span className="kb-bad">{late} late</span>}
    </>
  );

  const ready = load.status === "ready";

  return (
    <BentoPage className="tk-page">
      <>
        <header className="kb-head">
          <div className="kb-head-l">
            <h1>Tasks</h1>
            <p className="kb-head-sub">{ready ? sub : <span>Loading…</span>}</p>
          </div>
          <div className="kb-head-r">
            {!ownTasksOnly && (
              <div className="kregion-seg" role="radiogroup" aria-label="Whose tasks">
                {[["mine", "Mine"], ["all", "Everyone"]].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={effectiveScope === id}
                    className={cn("kregion-seg-btn", effectiveScope === id && "is-on")}
                    onClick={() => setScope(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <RegionSwitch untagged={countUntagged(allTasks)} size="sm" />
            {canEdit && (
              <>
                <button type="button" className="kb-pillbtn" onClick={() => setSectionDialog({ mode: "create" })}>
                  <Icons.Plus size={13} sw={2.2} /> Section
                </button>
                <button
                  type="button"
                  className="kb-btn kb-btn--primary tk-newbtn"
                  data-tour="new-task"
                  onClick={() => setPanel({ mode: "create", sectionId: firstId })}
                  disabled={!columns.length}
                >
                  <Icons.Plus size={13} sw={2.2} /> New task
                </button>
              </>
            )}
          </div>
        </header>

        {notice && (
          <div className="tk-banner" role="alert">
            <Lock size={16} sw={1.8} aria-hidden="true" />
            <span className="tk-banner-text">{notice}</span>
            <button type="button" className="tk-ibtn" onClick={() => setNotice("")} aria-label="Dismiss"><Icons.X size={15} /></button>
          </div>
        )}
        {behind && !notice && (
          <div className="tk-banner" role="status">
            <Lock size={16} sw={1.8} aria-hidden="true" />
            <span>{BEHIND_MSG}</span>
          </div>
        )}

        <div className="tk-bar">
          <label className="tk-search">
            <Icons.Search size={14} sw={1.9} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" />
          </label>
          <button type="button" className={cn("tk-filter-btn", selectsOn > 0 && "is-on")} aria-expanded={moreFilters} onClick={() => setMoreFilters((v) => !v)}>
            <Icons.Filter size={13} /> Filters{selectsOn > 0 ? ` (${selectsOn})` : ""}
          </button>
          <div className={cn("tk-bar-more", moreFilters && "is-open")}>
          {effectiveScope === "all" && (
            <Select variant="pill" label="Person" value={personFilter} onChange={setPersonFilter} options={personFilterOptions} placeholder="All people" searchPlaceholder="Find a person" />
          )}
          <Select variant="pill" label="Category" value={catFilter} onChange={setCatFilter} options={categoryFilterOptions} placeholder="Any category" />
          {customers.length > 0 && (
            <Select variant="pill" label="Customer" value={custFilter} onChange={setCustFilter} options={customerFilterOptions} placeholder="Any customer" searchPlaceholder="Find a customer" />
          )}
          </div>
          {filtersOn && (
            <button type="button" className="tk-clear" onClick={() => { setPersonFilter(""); setCatFilter(""); setCustFilter(""); setQuery(""); }}>Clear filters</button>
          )}
        </div>

        {load.status === "error" ? (
          <div className="kb-error" role="alert">
            <p>Tasks could not load: {load.error}</p>
            <button type="button" className="kb-btn kb-btn--ghost" onClick={loadAll}>Try again</button>
          </div>
        ) : (
          <div className="tk-layout">
            <div className="tk-board" data-tour="task-board">
              {ready && columns.length > 1 && (
                <div className="tk-tabs" role="tablist" aria-label="Sections">
                  {columns.map((c) => (
                    <button key={c.id} type="button" role="tab" className="tk-tab" aria-selected={shownSection === c.id} onClick={() => setActiveSection(c.id)}>
                      {c.label} <span className="tk-count">{byColumn[c.id]?.length || 0}</span>
                    </button>
                  ))}
                </div>
              )}

              {!ready && ["a", "b", "c"].map((k) => (
                <section key={k} className="kb-tile tk-col is-active" aria-hidden="true"><span className="kb-skel kb-skel--lg" /><span className="kb-skel" /><span className="kb-skel" /></section>
              ))}

              {ready && columns.length === 0 && (
                <section className="kb-tile tk-col is-active"><EmptyNote icon={<Archive size={20} />}>No sections yet. {canEdit ? "Add one to start the board." : "Someone who can edit tasks needs to add one."}</EmptyNote></section>
              )}

              {ready && columns.map((col) => (
                <TaskColumn
                  key={col.id}
                  col={col}
                  tasks={byColumn[col.id] || []}
                  today={today}
                  canEdit={canEdit}
                  canTick={canTick}
                  active={shownSection === col.id}
                  draggingId={draggingId}
                  leavingId={leavingId}
                  onQuickAdd={quickAdd}
                  onOpen={openTask}
                  onDone={finish}
                  onMenu={(task, anchor) => setMenu({ task, anchor })}
                  onSection={(c) => setSectionDialog({ mode: "edit", col: c })}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDropTask={dropOnSection}
                />
              ))}
            </div>

            <aside className="tk-rail" aria-label="Done and points">
              <PointsTile />
              <DoneTile
                tasks={doneRecent}
                archivedCount={archived.length}
                canClear={doneRecent.length > 0}
                canReopen={canTick}
                canFinishDrop
                draggingId={draggingId}
                undo={undo}
                onUndo={undoClear}
                onClear={clearDone}
                onReopen={reopen}
                onOpenArchive={() => setArchiveOpen(true)}
                onOpen={openTask}
                onDropTask={dropOnDone}
              />
              <LeaderboardTile />
            </aside>
          </div>
        )}
      </>

      {menu && (
        <TaskMenu
          anchor={menu.anchor}
          task={menu.task}
          sections={columns}
          sectionId={sectionOf(menu.task)}
          canEdit={canEdit}
          canTick={canTick(menu.task)}
          onClose={closeMenu}
          onOpen={openTask}
          onDone={finish}
          onMove={(task, col) => saveTask(task, { sectionId: col.id })}
          onDelete={askDelete}
        />
      )}

      {panel && (
        <TaskPanel
          key={panel.mode === "create" ? "new" : panel.task.id}
          mode={panel.mode}
          task={panelTask}
          personId={panel.mode === "edit" ? personOf(panelTask)?.id : startOwner}
          sectionId={panel.mode === "edit" ? sectionOf(panelTask) : panel.sectionId}
          columns={columns}
          people={people}
          customers={customers}
          canEdit={canEdit}
          canTick={panel.mode === "edit" && canTick(panelTask)}
          today={today}
          region={region}
          onSave={(patch) => (panel.mode === "create" ? createTask(patch) : saveTask(panelTask, patch))}
          onDelete={askDelete}
          onDone={(t) => { setPanel(null); finish(t); }}
          onReopen={(t) => { setPanel(null); reopen(t); }}
          onClose={() => setPanel(null)}
        />
      )}

      {sectionDialog && (
        <SectionDialog
          mode={sectionDialog.mode}
          col={sectionDialog.col}
          columns={columns}
          openCount={sectionDialog.col ? openBySection[sectionDialog.col.id] || 0 : 0}
          nameProblem={nameProblem}
          onAdd={addSection}
          onUpdate={updateSection}
          onMove={moveSection}
          onDelete={deleteSection}
          onClose={() => setSectionDialog(null)}
        />
      )}

      {archiveOpen && (
        <ArchiveDialog
          tasks={archived}
          canEdit={canEdit}
          canReopen={canTick}
          onReopen={(t) => reopen(t)}
          onDelete={askDelete}
          onDeleteAll={askDeleteArchived}
          onClose={() => setArchiveOpen(false)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          confirmLabel={confirm.label}
          onConfirm={confirm.run}
          onClose={() => setConfirm(null)}
        >
          {confirm.text}
        </ConfirmDialog>
      )}
    </BentoPage>
  );
}

export default Tasks;

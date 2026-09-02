import { useEffect, useMemo, useState } from "react";
import { deleteRow, fetchAll, insertRow, updateRow } from "../lib/db";
import { TEAM_MEMBERS } from "../constants";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import { cn, Avatar, Pill, Btn, Icons } from "../components/ui";
import { TASK_CATEGORIES } from "../constants";
import { awardPoints, resolveUidByName } from "../utils/rewardService";
import { useReward } from "../context/RewardContext";
import { useRegion } from "../context/RegionContext";
import { RegionSwitch, RegionSelect } from "../components/RegionSwitch";
import { countUntagged, filterByRegion } from "../utils/region";

const CAT_MAP = Object.fromEntries(TASK_CATEGORIES.map(c => [c.label, c.color]));

export const ASSIGNEE_COLORS = {
  "Anmol": { border: "#f1c40f", bg: "#fef9e7", text: "#b7950b" },     // Yellow
  "Anusha": { border: "#d64e8a", bg: "#faebf2", text: "#982055" },   // Pink
  "Wilson": { border: "#2d9b6f", bg: "#e6f5ef", text: "#1b5e43" },   // Green
  "Monika": { border: "#2980b9", bg: "#e5f0f8", text: "#1a4d70" },   // Blue
  "Finn": { border: "#7c6fcd", bg: "#eceaf9", text: "#483a9e" },     // Purple
  "Zen": { border: "#8e8e93", bg: "#f2f2f7", text: "#48484a" },       // Gray
};

/* ── Default columns ──────────────────────────────── */
const DEFAULT_COLUMNS = [
  { label: "To Do",       tone: "neutral", order: 0 },
  { label: "In Progress", tone: "mint",    order: 1 },
  { label: "Blocked",     tone: "terra",   order: 2 },
  { label: "Done",        tone: "ghost",   order: 3 },
];

const TONE_DOT = { neutral: "var(--ink-4)", mint: "var(--mint-2)", terra: "var(--terra)", ghost: "var(--ink-5)" };
const TONE_BG  = { neutral: "var(--bg-2)",  mint: "var(--mint-soft)", terra: "var(--terra-soft)", ghost: "var(--bg-2)" };

const PRIORITY_DOT = { high: "var(--terra)", med: "var(--amber)", medium: "var(--amber)", low: "var(--ink-5)", High: "var(--terra)", Medium: "var(--amber)", Low: "var(--ink-5)" };

function taskDisplayId(task, idx) {
  if (task.taskId) return task.taskId;
  return `T-${String(idx + 100).padStart(3, "0")}`;
}

function initials(name = "") {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
}

function hueFromName(name = "") {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/* ── Add-card inline form ─────────────────────────── */
function AddCardForm({ columnLabel, onAdd, onCancel, defaultAssignee, customers, assignees = [] }) {
  const [title, setTitle]           = useState("");
  const [assignee, setAssignee]     = useState(defaultAssignee || "");
  const [priority, setPriority]     = useState("med");
  const [dueDate, setDueDate]       = useState("");
  const [orderRef, setOrderRef]     = useState("");
  const [category, setCategory]     = useState("");
  const [customer, setCustomer]     = useState("");
  const [description, setDescription] = useState("");

  const submit = () => title.trim() && onAdd({ title, assignee, priority, dueDate, orderRef, category, customer, description, status: columnLabel });

  const sel = { border: "1px solid var(--line-strong)", borderRadius: 6, padding: "5px 7px", fontSize: 12, background: "#fff", fontFamily: "var(--font)", width: "100%" };

  return (
    <div className="ktasks-card" style={{ gap: 8 }}>
      <input
        autoFocus
        placeholder="Task title…"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape") onCancel(); if (e.key === "Enter") submit(); }}
        style={{ border: "1.5px solid var(--mint-2)", borderRadius: 6, padding: "6px 8px", fontSize: 13, fontFamily: "var(--font)", outline: "none", width: "100%" }}
      />
      <select value={customer} onChange={e => setCustomer(e.target.value)} style={sel}>
        <option value="">Customer…</option>
        {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
      </select>
      <textarea
        placeholder="Description (optional)…"
        value={description}
        onChange={e => setDescription(e.target.value)}
        rows={2}
        style={{ ...sel, resize: "vertical", padding: "5px 8px", lineHeight: 1.4 }}
      />
      <input
        placeholder="Order ref (e.g. KZ-2418)"
        value={orderRef}
        onChange={e => setOrderRef(e.target.value)}
        style={{ border: "1px solid var(--line-strong)", borderRadius: 6, padding: "5px 8px", fontSize: 12, fontFamily: "var(--font)", outline: "none", width: "100%" }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <select value={assignee} onChange={e => setAssignee(e.target.value)} style={sel}>
          <option value="">Assignee…</option>
          {(assignees.length > 0 ? assignees : TEAM_MEMBERS).map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
        </select>
        <select value={priority} onChange={e => setPriority(e.target.value)} style={sel}>
          <option value="high">High</option>
          <option value="med">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <select value={category} onChange={e => setCategory(e.target.value)} style={sel}>
        <option value="">Category…</option>
        {TASK_CATEGORIES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
      </select>
      <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
        style={{ border: "1px solid var(--line-strong)", borderRadius: 6, padding: "5px 8px", fontSize: 12, fontFamily: "var(--font)", width: "100%" }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={submit}
          style={{ flex: 1, background: "var(--mint-deep)", color: "#fff", border: "none", borderRadius: 6, padding: "7px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)" }}>
          Add Task
        </button>
        <button onClick={onCancel}
          style={{ background: "transparent", border: "1px solid var(--line-strong)", borderRadius: 6, padding: "7px 10px", fontSize: 12, cursor: "pointer", color: "var(--ink-3)", fontFamily: "var(--font)" }}>
          ✕
        </button>
      </div>
    </div>
  );
}

function dueDateTone(dueDate) {
  if (!dueDate) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(dueDate); due.setHours(0,0,0,0);
  const diff = Math.round((due - today) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, color: "var(--terra)", bg: "var(--terra-soft)" };
  if (diff === 0) return { label: "Due today", color: "var(--amber-deep)", bg: "var(--amber-soft)" };
  if (diff <= 3) return { label: `Due in ${diff}d`, color: "var(--amber-deep)", bg: "var(--amber-soft)" };
  return { label: `Due ${new Date(dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`, color: "var(--ink-4)", bg: "transparent" };
}

/* ── Task card ────────────────────────────────────── */
function TaskCard({ task, idx, canEdit, onDelete, onEdit, onDragStart }) {
  const [hover, setHover] = useState(false);
  const pDot = PRIORITY_DOT[task.priority] || "var(--ink-5)";
  const displayId = taskDisplayId(task, idx);
  const hue = hueFromName(task.assignee || "");
  const dueStr = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString("en-GB", { month: "short", day: "numeric" })
    : null;

  const assigneeName = task.assignee || "";
  const colorInfo = ASSIGNEE_COLORS[assigneeName] || ASSIGNEE_COLORS[Object.keys(ASSIGNEE_COLORS).find(k => k.toLowerCase() === assigneeName.toLowerCase())];
  const borderLeft = colorInfo 
    ? `3.5px solid ${colorInfo.border}` 
    : assigneeName 
      ? `3.5px solid oklch(55% .16 ${hue})` 
      : "1px solid var(--line)";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onEdit && onEdit(task)}
      className="ktasks-card"
      style={{ cursor: "pointer", position: "relative", borderLeft }}
    >
      <div className="ktasks-card-h">
        {task.customer ? (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
            background: "var(--mint-soft)", color: "var(--mint-deep)",
            letterSpacing: ".01em", maxWidth: 120, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{task.customer}</span>
        ) : (
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)", fontWeight: 600 }}>{displayId}</span>
        )}
        <span className="ktasks-prio" style={{ background: pDot, width: 8, height: 8, borderRadius: "50%", display: "inline-block" }} />
      </div>
      {task.category && (
        <div style={{ marginBottom: 2 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20,
            background: `${CAT_MAP[task.category] || "#8E8E93"}22`,
            color: CAT_MAP[task.category] || "#8E8E93",
          }}>{task.category}</span>
        </div>
      )}
      <div className="ktasks-card-t">{task.title}</div>
      {(() => {
        const tone = dueDateTone(task.dueDate);
        if (!tone) return null;
        return (
          <span style={{ fontSize: 10, fontWeight: 600, color: tone.color, background: tone.bg, padding: "2px 6px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 3 }}>
            ⏰ {tone.label}
          </span>
        );
      })()}
      {task.description && (
        <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4, marginTop: 2 }}>
          {task.description.length > 80 ? task.description.slice(0, 80) + "…" : task.description}
        </div>
      )}
      {task.notes && (
        <div style={{ fontSize: 11, background: "var(--bg-2)", padding: "6px 8px", borderRadius: 6, borderLeft: "2px solid var(--ink-3)", color: "var(--ink-2)", marginTop: 4, lineHeight: 1.4, wordBreak: "break-word" }}>
          <strong>Update:</strong> {task.notes}
        </div>
      )}
      {task.orderRef && <div className="ktasks-card-o">{task.orderRef}</div>}
      {task.order && <div className="ktasks-card-o">{task.order}</div>}
      <div className="ktasks-card-f">
        {task.assignee ? (
          <div title={task.assignee} style={{
            width: 24, height: 24, borderRadius: "50%",
            background: colorInfo ? colorInfo.border : `oklch(55% .16 ${hue})`, color: "#fff",
            fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {initials(task.assignee)}
          </div>
        ) : <span />}
        {dueStr && (
          <span className="ktasks-card-due">
            <Icons.Clock size={11} /> {dueStr}
          </span>
        )}
      </div>
      {canEdit && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(task.id); }}
          style={{ position: "absolute", top: 6, right: 6, background: "none", border: "none", cursor: "pointer", color: "var(--ink-5)", fontSize: 14, lineHeight: 1, padding: 2, display: "flex" }}
          title="Delete Task"
        >×</button>
      )}
    </div>
  );
}

/* ── Kanban column ────────────────────────────────── */
function KanbanColumn({ col, tasks, allTasks, canEdit, onAdd, onDelete, onEdit, onDrop, onDeleteColumn, onColumnDrop, defaultAssignee, customers, assignees = [] }) {
  const [adding, setAdding]       = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const [colDragOver, setColDragOver] = useState(false);
  const isDone = col.label === "Done";
  const dotColor = TONE_DOT[col.tone] || "var(--ink-4)";
  const doneCount = isDone ? allTasks.filter(t => t.status === "Done").length : 0;

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false); setColDragOver(false);
    const taskId   = e.dataTransfer.getData("taskId");
    const columnId = e.dataTransfer.getData("columnId");
    if (columnId && columnId !== col.id) onColumnDrop(columnId, col.id);
    else if (taskId) onDrop(taskId, col.label);
  }

  return (
    <div
      className="ktasks-col"
      onDragOver={e => { e.preventDefault(); if (e.dataTransfer.types.includes("columnid")) setColDragOver(true); else setDragOver(true); }}
      onDragLeave={() => { setDragOver(false); setColDragOver(false); }}
      onDrop={handleDrop}
      style={{
        background: colDragOver ? "var(--bg)" : dragOver ? TONE_BG[col.tone] : "var(--bg-2)",
        outline: dragOver ? `2px dashed ${dotColor}` : colDragOver ? "2px dashed var(--ink-4)" : "none",
      }}
    >
      {/* Header */}
      <div className="ktasks-col-h">
        <Pill tone={col.tone} dot>{col.label}</Pill>
        <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>{tasks.length || (isDone ? doneCount : 0)}</span>
        {canEdit && (
          <button
            draggable
            onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("columnId", col.id); }}
            style={{ background: "none", border: "none", cursor: "grab", color: "var(--ink-5)", fontSize: 14, padding: "1px 2px", lineHeight: 1 }}
            title="Drag to reorder"
          >⠿</button>
        )}
      </div>

      {/* Cards */}
      <div className="ktasks-col-body">
        {tasks.map((task, i) => (
          <TaskCard
            key={task.id} task={task} idx={i} canEdit={canEdit}
            onDelete={onDelete}
            onEdit={onEdit}
            onDragStart={e => e.dataTransfer.setData("taskId", task.id)}
          />
        ))}
        {adding && (
          <AddCardForm
            columnLabel={col.label}
            defaultAssignee={defaultAssignee}
            customers={customers}
            assignees={assignees}
            onAdd={data => { onAdd(data); setAdding(false); }}
            onCancel={() => setAdding(false)}
          />
        )}
        {isDone && tasks.length === 0 && (
          <div className="ktasks-empty">{doneCount} completed this week</div>
        )}
        {!isDone && tasks.length === 0 && !adding && (
          <div className="ktasks-empty">No tasks</div>
        )}
      </div>

      {canEdit && !adding && (
        <button
          onClick={() => setAdding(true)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", fontSize: 12, fontWeight: 500, padding: "6px 4px", textAlign: "left", display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font)" }}
        >
          <Icons.Plus size={13} sw={2} /> Add card
        </button>
      )}
    </div>
  );
}

/* ── Add Section panel ────────────────────────────── */
function AddSectionPanel({ onAdd }) {
  const [open, setOpen]   = useState(false);
  const [label, setLabel] = useState("");
  const [tone, setTone]   = useState("neutral");
  const TONES = ["neutral","mint","terra","ghost","amber","blue"];

  if (!open) return (
    <div style={{ width: 220, flexShrink: 0 }}>
      <button
        onClick={() => setOpen(true)}
        style={{ width: "100%", background: "rgba(255,255,255,.5)", border: "1.5px dashed var(--line-strong)", borderRadius: 12, padding: 14, cursor: "pointer", color: "var(--ink-3)", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "var(--font)" }}
      >
        <Icons.Plus size={14} sw={2} /> Add section
      </button>
    </div>
  );

  return (
    <div style={{ width: 240, flexShrink: 0, background: "var(--bg-2)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>New section</div>
      <input
        autoFocus placeholder="Section name…" value={label}
        onChange={e => setLabel(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && label.trim()) { onAdd(label.trim(), tone); setLabel(""); setOpen(false); } if (e.key === "Escape") setOpen(false); }}
        style={{ border: "1.5px solid var(--mint-2)", borderRadius: 6, padding: "7px 9px", fontSize: 13, fontFamily: "var(--font)", outline: "none" }}
      />
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".04em" }}>Tone</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TONES.map(t => (
            <button key={t} onClick={() => setTone(t)}
              style={{ width: 22, height: 22, borderRadius: "50%", background: TONE_DOT[t] || "var(--blue)", border: tone === t ? "3px solid var(--ink)" : "3px solid transparent", cursor: "pointer", padding: 0 }} />
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => { if (label.trim()) { onAdd(label.trim(), tone); setLabel(""); setOpen(false); } }}
          style={{ flex: 1, background: "var(--mint-deep)", color: "#fff", border: "none", borderRadius: 6, padding: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)" }}>
          Add
        </button>
        <button onClick={() => setOpen(false)}
          style={{ background: "transparent", border: "1px solid var(--line-strong)", borderRadius: 6, padding: "7px 10px", fontSize: 12, cursor: "pointer", color: "var(--ink-3)", fontFamily: "var(--font)" }}>
          ✕
        </button>
      </div>
    </div>
  );
}

/* ── Assign-to filter bar ─────────────────────────── */
function AssignFilter({ selected, onSelect, tasks, assignees = [] }) {
  const listToUse = assignees.length > 0 ? assignees : TEAM_MEMBERS;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em" }}>Assign to:</span>
      <button
        onClick={() => onSelect(null)}
        style={{ padding: "5px 12px", borderRadius: "var(--r-pill)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)", background: !selected ? "var(--mint-deep)" : "var(--card)", color: !selected ? "#fff" : "var(--ink-3)", border: !selected ? "none" : "1px solid var(--line-strong)" }}
      >All</button>
      {listToUse.map(m => {
        const active = selected === m.name;
        const count = tasks.filter(t => t.assignee === m.name).length;
        const mColorInfo = ASSIGNEE_COLORS[m.name] || ASSIGNEE_COLORS[Object.keys(ASSIGNEE_COLORS).find(k => k.toLowerCase() === m.name.toLowerCase())];
        const avatarBg = active 
          ? "rgba(255,255,255,.25)" 
          : mColorInfo 
            ? mColorInfo.border 
            : `oklch(55% .16 ${hueFromName(m.name)})`;
        return (
          <button key={m.name} onClick={() => onSelect(active ? null : m.name)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 5px", borderRadius: "var(--r-pill)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)", background: active ? "var(--mint-deep)" : "var(--card)", color: active ? "#fff" : "var(--ink-2)", border: active ? "none" : "1px solid var(--line-strong)" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: avatarBg, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {initials(m.name)}
            </div>
            {m.name}
            {count > 0 && <span style={{ fontSize: 11, opacity: .7 }}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ── Main ─────────────────────────────────────────── */
function Tasks() {
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "tasks");
  const role = profile?.appRole || profile?.role;
  const { showPointsToast } = useReward();

  const { region } = useRegion();

  const [allTasks, setTasks]    = useState([]);
  const [columns,  setColumns]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [allCustomers, setCustomers]   = useState([]);

  /* ── One region's board ────────────────────────────────────
     Cards and the customer dropdown narrow to the region on screen. The
     columns themselves deliberately do not: they are the shape of the board,
     shared by both arms, not work belonging to either. */
  const tasks     = useMemo(() => filterByRegion(allTasks,     region), [allTasks,     region]);
  const customers = useMemo(() => filterByRegion(allCustomers, region), [allCustomers, region]);
  const [assignees, setAssignees] = useState([]);
  // Fix 4: assignee filter — "all" means no filter, otherwise a name string
  const [filterAssignee, setFilterAssignee] = useState("all");
  // Alias: keep legacy `filter` in sync with `filterAssignee` for visibleTasks/AssignFilter
  const filter = filterAssignee === "all" ? null : filterAssignee;
  const setFilter = (val) => setFilterAssignee(val === null ? "all" : val);
  const [catFilter,    setCatFilter]   = useState(null);
  const [custFilter,   setCustFilter]  = useState(null);
  const [showFilters,  setShowFilters] = useState(false);
  const [showNew,      setShowNew]     = useState(false);
  const [newForm,      setNewForm]     = useState({ title: "", assignee: "", priority: "med", dueDate: "", orderRef: "", category: "", customer: "", description: "", notes: "", status: "To Do", region: "" });
  const [editTask,     setEditTask]    = useState(null);
  const [editForm,     setEditForm]    = useState({});
  const [editSaving,   setEditSaving]  = useState(false);

  async function loadColumns() {
    let cols = await fetchAll("task_columns");

    // Drop duplicate labels, keeping the first. Deleting is best-effort:
    // someone who can view the board but not edit it still gets a clean
    // list on screen rather than an error.
    const seen = new Map();
    const dupes = [];
    for (const c of cols) {
      const key = (c.label || "").toLowerCase();
      if (seen.has(key)) dupes.push(c.id);
      else seen.set(key, c);
    }
    if (dupes.length) {
      await Promise.allSettled(dupes.map(id => deleteRow("task_columns", id)));
    }
    cols = [...seen.values()];

    if (cols.length === 0) {
      await Promise.all(DEFAULT_COLUMNS.map(c => insertRow("task_columns", c)));
      cols = await fetchAll("task_columns");
    }
    cols.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    setColumns(cols);
  }

  async function loadTasks() {
    setTasks(await fetchAll("tasks"));
  }

  async function loadCustomers() {
    setCustomers(await fetchAll("customers", { orderBy: "name", orderDir: "asc" }));
  }

  async function loadAssignees() {
    try {
      const rows = await fetchAll("employees");
      const list = rows
        .filter(emp => emp.status !== "Inactive" && emp.name)
        .map(emp => ({ name: emp.name, email: emp.email || "" }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      setAssignees(list);
    } catch (err) {
      console.error("Failed to load assignees:", err);
    }
  }

  useEffect(() => {
    Promise.all([loadColumns(), loadTasks(), loadCustomers(), loadAssignees()]).then(() => setLoading(false)).catch(console.error);
  }, []);

  // Staff see only their own assigned tasks — unless they've been granted an
  // explicit tasks permission (canEdit), which promotes them to the full board.
  const ownTasksOnly = (role === "employee" || role === "nepal_staff") && !canEdit;

  const visibleTasks = useMemo(() => {
    let t = tasks;
    if (ownTasksOnly) t = t.filter(x => x.assignee === profile?.name);
    if (filter) t = t.filter(x => x.assignee === filter);
    if (catFilter) t = t.filter(x => x.category === catFilter);
    if (custFilter) t = t.filter(x => x.customer === custFilter);
    return t;
  }, [tasks, filter, catFilter, custFilter, ownTasksOnly, profile]);

  const byColumn = useMemo(() =>
    columns.reduce((acc, col) => { acc[col.label] = visibleTasks.filter(t => t.status === col.label); return acc; }, {}),
    [visibleTasks, columns]
  );

  async function handleAdd(data) {
    try {
      await insertRow("tasks", { ...data, region: data.region || region, createdBy: profile?.name || "Unknown" });
      await loadTasks();
    } catch (err) {
      console.error("Error adding task:", err);
      alert("Failed to add task: " + err.message);
      throw err;
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this task?")) return;
    try {
      await deleteRow("tasks", id);
      setTasks(cur => cur.filter(t => t.id !== id));
    } catch (err) {
      alert("Could not delete task — you may not have permission to edit tasks.");
      console.error(err);
    }
  }

  async function handleDrop(taskId, newStatus) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;
    await updateRow("tasks", taskId, { status: newStatus });
    setTasks(cur => cur.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    if (newStatus === "Done" && task.assignee) {
      const uid = await resolveUidByName(task.assignee);
      if (uid) {
        const eventType = task.priority === "high" ? "task_completed_high" : "task_completed";
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const isEarly = task.dueDate && today <= new Date(task.dueDate);
        const bonusPoints = isEarly ? 10 : 0;
        const pts = await awardPoints({
          uid,
          displayName: task.assignee,
          eventType,
          sourceId: taskId,
          reason: task.title,
          bonusPoints,
        });
        if (pts) showPointsToast(pts, task.title);
      }
    }
  }

  function handleOpenEdit(task) {
    setEditTask(task);
    setEditForm({
      title:       task.title       || "",
      description: task.description || "",
      assignee:    task.assignee    || "",
      priority:    task.priority    || "med",
      dueDate:     task.dueDate     || "",
      orderRef:    task.orderRef    || "",
      category:    task.category    || "",
      customer:    task.customer    || "",
      status:      task.status      || "To Do",
      notes:       task.notes       || "",
      region:      task.region      || "",
    });
  }

  async function handleEditSave() {
    if (!editTask || !editForm.title.trim()) return;
    setEditSaving(true);
    try {
      await updateRow("tasks", editTask.id, {
        title:       editForm.title.trim(),
        description: editForm.description,
        assignee:    editForm.assignee,
        priority:    editForm.priority,
        dueDate:     editForm.dueDate,
        orderRef:    editForm.orderRef,
        category:    editForm.category,
        customer:    editForm.customer,
        status:      editForm.status,
        notes:       editForm.notes || "",
        region:      editForm.region || null,
      });
      setTasks(cur => cur.map(t => t.id === editTask.id ? { ...t, ...editForm, title: editForm.title.trim() } : t));
      if (editForm.status === "Done" && editTask.status !== "Done" && editForm.assignee) {
        const uid = await resolveUidByName(editForm.assignee);
        if (uid) {
          const eventType = editForm.priority === "high" ? "task_completed_high" : "task_completed";
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const isEarly = editForm.dueDate && today <= new Date(editForm.dueDate);
          const bonusPoints = isEarly ? 10 : 0;
          const pts = await awardPoints({
            uid,
            displayName: editForm.assignee,
            eventType,
            sourceId: editTask.id,
            reason: editForm.title.trim(),
            bonusPoints,
          });
          if (pts) showPointsToast(pts, editForm.title.trim());
        }
      }
      setEditTask(null);
    } catch (err) {
      console.error("Failed to update task:", err);
      alert("Failed to save changes. Please try again.");
    }
    setEditSaving(false);
  }

  async function handleAddColumn(label, tone) {
    const maxOrder = columns.reduce((m, c) => Math.max(m, c.order ?? 0), 0);
    await insertRow("task_columns", { label, tone: tone || "neutral", order: maxOrder + 1 });
    await loadColumns();
  }

  async function handleDeleteColumn(colId) {
    await deleteRow("task_columns", colId);
    setColumns(cur => cur.filter(c => c.id !== colId));
  }

  async function handleColumnReorder(draggedColId, targetColId) {
    if (draggedColId === targetColId) return;
    const newCols = [...columns];
    const fromIdx = newCols.findIndex(c => c.id === draggedColId);
    const toIdx   = newCols.findIndex(c => c.id === targetColId);
    const [moved] = newCols.splice(fromIdx, 1);
    newCols.splice(toIdx, 0, moved);
    setColumns(newCols.map((c, i) => ({ ...c, order: i })));
    await Promise.all(newCols.map((c, i) => updateRow("task_columns", c.id, { order: i })));
  }

  return (
    <>
      <div className="kscr fade-in" style={{ padding: "4px 0 0", gap: 0 }}>

        {/* Page header */}
        {(() => {
          const activeCount = [filter, catFilter, custFilter].filter(Boolean).length;
          return (
            <div className="kph" style={{ padding: "8px 0 12px" }}>
              <div>
                <h2>Tasks</h2>
                <p>{ownTasksOnly ? "Your assigned work" : "Team task board"}</p>
              </div>
              <div className="kph-a">
                <RegionSwitch untagged={countUntagged(allTasks)} size="sm" />
                <button
                  onClick={() => setShowFilters(f => !f)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                    cursor: "pointer", fontFamily: "var(--font)",
                    background: showFilters ? "var(--mint-soft)" : "var(--card)",
                    color: showFilters ? "var(--mint-deep)" : "var(--ink-3)",
                    border: showFilters ? "1px solid var(--mint-2)" : "1px solid var(--line-strong)",
                    position: "relative",
                  }}
                >
                  <Icons.Filter size={13} /> Filter
                  {activeCount > 0 && (
                    <span style={{
                      background: "var(--mint-deep)", color: "#fff", borderRadius: "50%",
                      width: 16, height: 16, fontSize: 10, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{activeCount}</span>
                  )}
                </button>
                {canEdit && (
                  <button className="primary-button" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => setShowNew(true)}>
                    <Icons.Plus size={13} sw={2.2} /> New task
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {canEdit && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10, padding: "4px 0" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em" }}>Assignee:</span>
            <button
              onClick={() => setFilterAssignee("all")}
              style={{
                padding: "4px 12px", borderRadius: "var(--r-pill)", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "var(--font)",
                background: filterAssignee === "all" ? "var(--mint-deep)" : "var(--card)",
                color: filterAssignee === "all" ? "#fff" : "var(--ink-3)",
                border: filterAssignee === "all" ? "none" : "1px solid var(--line-strong)",
              }}
            >All</button>
            {(assignees.length > 0 ? assignees : TEAM_MEMBERS).map(m => {
              const active = filterAssignee === m.name;
              const count = tasks.filter(t => t.assignee === m.name).length;
              const mColorInfo = ASSIGNEE_COLORS[m.name] || ASSIGNEE_COLORS[Object.keys(ASSIGNEE_COLORS).find(k => k.toLowerCase() === m.name.toLowerCase())];
              const avatarBg = active 
                ? "rgba(255,255,255,.25)" 
                : mColorInfo 
                  ? mColorInfo.border 
                  : `oklch(55% .16 ${hueFromName(m.name)})`;
              return (
                <button key={m.name} onClick={() => setFilterAssignee(active ? "all" : m.name)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "3px 10px 3px 5px", borderRadius: "var(--r-pill)", fontSize: 12,
                    fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)",
                    background: active ? "var(--mint-deep)" : "var(--card)",
                    color: active ? "#fff" : "var(--ink-2)",
                    border: active ? "none" : "1px solid var(--line-strong)",
                  }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: avatarBg,
                    color: "#fff", fontSize: 9, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{initials(m.name)}</div>
                  {m.name}
                  {count > 0 && <span style={{ fontSize: 11, opacity: .7 }}>{count}</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Collapsible filter panel */}
        {showFilters && (
          <div style={{
            background: "var(--bg-2)", borderRadius: 10, padding: "14px 16px",
            marginBottom: 14, display: "flex", flexDirection: "column", gap: 12,
            border: "1px solid var(--line-strong)",
          }}>
            {/* Assignee */}
            {canEdit && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 7 }}>Assignee</div>
                <AssignFilter selected={filter} onSelect={setFilter} tasks={tasks} assignees={assignees} />
              </div>
            )}

            {/* Customer */}
            {customers.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 7 }}>Customer</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button onClick={() => setCustFilter(null)}
                    style={{ padding: "4px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)", background: !custFilter ? "var(--mint-deep)" : "var(--card)", color: !custFilter ? "#fff" : "var(--ink-3)", border: !custFilter ? "none" : "1px solid var(--line-strong)" }}>
                    All
                  </button>
                  {customers.map(c => {
                    const active = custFilter === c.name;
                    const count = tasks.filter(t => t.customer === c.name).length;
                    return (
                      <button key={c.id} onClick={() => setCustFilter(active ? null : c.name)}
                        style={{ padding: "4px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)", background: active ? "var(--mint-deep)" : "var(--mint-soft)", color: active ? "#fff" : "var(--mint-deep)", border: "none" }}>
                        {c.name}
                        {count > 0 && <span style={{ marginLeft: 5, opacity: .65, fontSize: 11 }}>{count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Category */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 7 }}>Category</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => setCatFilter(null)}
                  style={{ padding: "4px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)", background: !catFilter ? "var(--ink)" : "var(--card)", color: !catFilter ? "#fff" : "var(--ink-3)", border: !catFilter ? "none" : "1px solid var(--line-strong)" }}>
                  All
                </button>
                {TASK_CATEGORIES.map(c => {
                  const active = catFilter === c.label;
                  return (
                    <button key={c.label} onClick={() => setCatFilter(active ? null : c.label)}
                      style={{ padding: "4px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)", background: active ? c.color : `${c.color}18`, color: active ? "#fff" : c.color, border: "none" }}>
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {[filter, catFilter, custFilter].some(Boolean) && (
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <button
                  onClick={() => { setFilter(null); setCatFilter(null); setCustFilter(null); }}
                  style={{ fontSize: 12, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font)", padding: 0 }}
                >
                  ✕ Clear all filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Board */}
        {loading ? (
          <p style={{ color: "var(--ink-4)", padding: "32px 0" }}>Loading board…</p>
        ) : (
          <div className="ktasks-board" style={{ overflowX: "auto", alignItems: "flex-start", minHeight: 480 }}>
            {columns.map(col => (
              <KanbanColumn
                key={col.id} col={col}
                tasks={byColumn[col.label] || []}
                allTasks={tasks}
                canEdit={canEdit}
                defaultAssignee={filter}
                customers={customers}
                assignees={assignees}
                onAdd={handleAdd}
                onDelete={handleDelete}
                onEdit={handleOpenEdit}
                onDrop={handleDrop}
                onDeleteColumn={handleDeleteColumn}
                onColumnDrop={handleColumnReorder}
              />
            ))}
            {canEdit && <AddSectionPanel onAdd={handleAddColumn} />}
          </div>
        )}
      </div>

      {/* New task modal */}
      {showNew && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(10,28,20,.4)", backdropFilter: "blur(3px)", zIndex: 50 }} onClick={() => setShowNew(false)} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 51, background: "#fff", borderRadius: 14, padding: 24, width: "min(480px, 92vw)", boxShadow: "var(--shadow-pop)", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>New task</h3>
              <button onClick={() => setShowNew(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--ink-4)", lineHeight: 1 }}>×</button>
            </div>
            <div className="grid-form" style={{ gridTemplateColumns: "1fr" }}>
              <label>Title
                <input type="text" value={newForm.title} onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title…" />
              </label>
              <label>Customer
                <select value={newForm.customer} onChange={e => setNewForm(f => ({ ...f, customer: e.target.value }))}>
                  <option value="">— None —</option>
                  {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </label>
              <label>Description
                <textarea value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} placeholder="What needs to be done…" rows={3} style={{ resize: "vertical" }} />
              </label>
              <label>Order ref
                <input type="text" value={newForm.orderRef} onChange={e => setNewForm(f => ({ ...f, orderRef: e.target.value }))} placeholder="e.g. KZ-2418" />
              </label>
              <label>Progress Notes / Updates
                <textarea value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} placeholder="Add progress notes or updates here…" rows={2} style={{ resize: "vertical" }} />
              </label>
            </div>
            <div className="grid-form">
              <label>Assign to
                <select value={newForm.assignee} onChange={e => setNewForm(f => ({ ...f, assignee: e.target.value }))}>
                  <option value="">— Select —</option>
                  {(assignees.length > 0 ? assignees : TEAM_MEMBERS).map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                </select>
              </label>
              <label>Priority
                <select value={newForm.priority} onChange={e => setNewForm(f => ({ ...f, priority: e.target.value }))}>
                  <option value="high">High</option>
                  <option value="med">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label>Column
                <select value={newForm.status} onChange={e => setNewForm(f => ({ ...f, status: e.target.value }))}>
                  {columns.map(c => <option key={c.id} value={c.label}>{c.label}</option>)}
                </select>
              </label>
              <label>Category
                <select value={newForm.category} onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="">— None —</option>
                  {TASK_CATEGORIES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                </select>
              </label>
              <label>Due date
                <input type="date" value={newForm.dueDate} onChange={e => setNewForm(f => ({ ...f, dueDate: e.target.value }))} />
              </label>
              <label>Region
                <RegionSelect value={newForm.region} onChange={v => setNewForm(f => ({ ...f, region: v }))} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="ghost-button" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="primary-button" onClick={async () => {
                if (!newForm.title.trim()) return;
                await handleAdd({ title: newForm.title, assignee: newForm.assignee, priority: newForm.priority, dueDate: newForm.dueDate, orderRef: newForm.orderRef, category: newForm.category, customer: newForm.customer, description: newForm.description, notes: newForm.notes, status: newForm.status, region: newForm.region });
                setNewForm({ title: "", assignee: "", priority: "med", dueDate: "", orderRef: "", category: "", customer: "", description: "", notes: "", status: "To Do", region: "" });
                setShowNew(false);
              }}>Create task</button>
            </div>
          </div>
        </>
      )}

      {/* Edit task modal */}
      {editTask && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(10,28,20,.4)", backdropFilter: "blur(3px)", zIndex: 50 }} onClick={() => setEditTask(null)} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 51, background: "#fff", borderRadius: 14, padding: 24, width: "min(480px, 92vw)", boxShadow: "var(--shadow-pop)", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Edit task</h3>
              <button onClick={() => setEditTask(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--ink-4)", lineHeight: 1 }}>×</button>
            </div>
            <div className="grid-form" style={{ gridTemplateColumns: "1fr" }}>
              <label>Title
                <input type="text" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title…" autoFocus />
              </label>
              <label>Customer
                <select value={editForm.customer} onChange={e => setEditForm(f => ({ ...f, customer: e.target.value }))}>
                  <option value="">— None —</option>
                  {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </label>
              <label>Description
                <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="What needs to be done…" rows={3} style={{ resize: "vertical" }} />
              </label>
              <label>Order ref
                <input type="text" value={editForm.orderRef} onChange={e => setEditForm(f => ({ ...f, orderRef: e.target.value }))} placeholder="e.g. KZ-2418" />
              </label>
              <label>Progress Notes / Updates
                <textarea value={editForm.notes || ""} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Add progress notes or updates here…" rows={2} style={{ resize: "vertical" }} />
              </label>
            </div>
            <div className="grid-form">
              <label>Assign to
                <select value={editForm.assignee} onChange={e => setEditForm(f => ({ ...f, assignee: e.target.value }))}>
                  <option value="">— Select —</option>
                  {(assignees.length > 0 ? assignees : TEAM_MEMBERS).map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                </select>
              </label>
              <label>Priority
                <select value={editForm.priority} onChange={e => setEditForm(f => ({ ...f, priority: e.target.value }))}>
                  <option value="high">High</option>
                  <option value="med">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label>Column
                <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                  {columns.map(c => <option key={c.id} value={c.label}>{c.label}</option>)}
                </select>
              </label>
              <label>Category
                <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="">— None —</option>
                  {TASK_CATEGORIES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                </select>
              </label>
              <label>Due date
                <input type="date" value={editForm.dueDate} onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))} />
              </label>
              <label>Region
                <RegionSelect value={editForm.region} onChange={v => setEditForm(f => ({ ...f, region: v }))} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="ghost-button" onClick={() => setEditTask(null)}>Cancel</button>
              <button className="primary-button" disabled={editSaving} onClick={handleEditSave}>
                {editSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default Tasks;

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { deleteRow, fetchAll, insertRow, updateRow } from "../lib/db";
import { TEAM_MEMBERS } from "../constants";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import { cn, Avatar, Btn, Icons } from "../components/ui";
import { TASK_CATEGORIES } from "../constants";
import { awardPoints, resolveUidByName } from "../utils/rewardService";
import { useReward } from "../context/RewardContext";
import { useRegion } from "../context/RegionContext";
import { RegionSwitch, RegionSelect } from "../components/RegionSwitch";
import { countUntagged, filterByRegion } from "../utils/region";

const CAT_MAP = Object.fromEntries(TASK_CATEGORIES.map(c => [c.label, c.color]));

// A category chip: the category's own colour, tinted. One we don't know gets a neutral chip.
function catChip(category) {
  const c = CAT_MAP[category];
  return c ? { background: `${c}22`, color: c } : { background: "var(--bg-2)", color: "var(--ink-4)" };
}

export const ASSIGNEE_COLORS = {
  "Anmol": { border: "#f1c40f", bg: "#fef9e7", text: "#b7950b" },     // Yellow
  "Anusha": { border: "#d64e8a", bg: "#faebf2", text: "#982055" },   // Pink
  "Wilson": { border: "#2d9b6f", bg: "#e6f5ef", text: "#1b5e43" },   // Green
  "Monika": { border: "#2980b9", bg: "#e5f0f8", text: "#1a4d70" },   // Blue
  "Finn": { border: "#7c6fcd", bg: "#eceaf9", text: "#483a9e" },     // Purple
  "Zen": { border: "#8e8e93", bg: "#f2f2f7", text: "#48484a" },       // Gray
};

/* A task sits in one section: a lane of the board that the team makes and names.
   Done is the one place that is always there. It isn't a lane but the bar at the
   bottom of the page, where finished tasks collect, so no lane can be called Done. */
const DONE = "Done";
const isDone = t => String(t.status || "").trim().toLowerCase() === "done";

// What the database says when the app writes a column the table doesn't have
// yet: it is behind the app, because a migration hasn't been run.
const behindDatabase = err => /schema cache|could not find the .* column|column .* does not exist/i.test(String(err?.message || err));
const BEHIND_MSG = "The database hasn't had its latest update yet (migration 0041), so this can't be saved. Ask whoever looks after the database to run it.";
const saveFailed = (err, fallback) => (behindDatabase(err) ? BEHIND_MSG : fallback);

/* ── Default sections ─────────────────────────────── */
const DEFAULT_COLUMNS = [
  { label: "To Do",       tone: "neutral", order: 0 },
  { label: "In Progress", tone: "mint",    order: 1 },
  { label: "Blocked",     tone: "terra",   order: 2 },
];

const SECTION_TONES = ["neutral", "mint", "amber", "terra", "blue", "ghost"];
const TONE_DOT = { neutral: "var(--ink-4)", mint: "var(--mint-2)", amber: "var(--amber)", terra: "var(--terra)", blue: "var(--blue)", ghost: "var(--ink-5)" };
const TONE_BG  = { neutral: "var(--bg-2)",  mint: "var(--mint-soft)", amber: "var(--amber-soft)", terra: "var(--terra-soft)", blue: "var(--blue-soft)", ghost: "var(--bg-2)" };

/* A long section stops growing at about the height of the screen and scrolls
   inside itself, so one busy section doesn't stretch the whole page. What's
   taken off is the space the page needs above and below the board. */
const COL_CAP = "max(260px, calc(100vh - 390px))";

const EMPTY_TASK_FORM = { title: "", assignee: "", priority: "med", dueDate: "", orderRef: "", category: "", customer: "", description: "", notes: "", sectionId: "", region: "" };

// Which sections the person has folded away. Remembered on this device only.
const COLLAPSED_KEY = "kazi.tasks.collapsedSections";
function readCollapsed() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || "[]")); } catch { return new Set(); }
}
function writeCollapsed(set) {
  try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set])); } catch { /* storage blocked: it just isn't remembered */ }
}

function useMedia(query) {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

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

function avatarColor(name = "") {
  const key = Object.keys(ASSIGNEE_COLORS).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? ASSIGNEE_COLORS[key].border : `oklch(55% .16 ${hueFromName(name)})`;
}

/* A bare YYYY-MM-DD is that day locally; new Date() alone would read it as UTC. */
function asDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
}

function fmtDay(v) {
  const d = asDate(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Older rows say "Medium" / "medium"; the dropdowns only know high / med / low.
function normPriority(p) {
  const v = String(p || "").toLowerCase();
  return v === "high" ? "high" : v === "low" ? "low" : "med";
}

// Newest finish first. Tasks finished before completion dates were recorded
// have none: they go after the dated ones, newest-created first.
function byDoneDate(a, b) {
  const x = a.completedAt ? new Date(a.completedAt).getTime() : null;
  const y = b.completedAt ? new Date(b.completedAt).getTime() : null;
  if (x !== null && y !== null) return y - x;
  if (x !== null) return -1;
  if (y !== null) return 1;
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

/* ── Add-card inline form ─────────────────────────── */
function AddCardForm({ sectionId, onAdd, onCancel, defaultAssignee, customers, assignees = [] }) {
  const [title, setTitle]           = useState("");
  const [assignee, setAssignee]     = useState(defaultAssignee || "");
  const [priority, setPriority]     = useState("med");
  const [dueDate, setDueDate]       = useState("");
  const [orderRef, setOrderRef]     = useState("");
  const [category, setCategory]     = useState("");
  const [customer, setCustomer]     = useState("");
  const [description, setDescription] = useState("");

  const submit = () => title.trim() && onAdd({ title, assignee, priority, dueDate, orderRef, category, customer, description, sectionId });

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
function TaskCard({ task, idx, canEdit, expanded, sections, sectionId, assignees, onToggle, onDelete, onEdit, onQuick, onDragStart }) {
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
      // An opened card holds inputs, and some browsers won't let you place a
      // cursor or select text inside a draggable element.
      draggable={!expanded}
      onDragStart={onDragStart}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onToggle}
      className="ktasks-card"
      style={{ cursor: "pointer", position: "relative", borderLeft, boxShadow: expanded ? "var(--shadow-1)" : undefined }}
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
          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, ...catChip(task.category) }}>{task.category}</span>
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
        <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4, marginTop: 2, wordBreak: "break-word", whiteSpace: expanded ? "pre-wrap" : undefined }}>
          {!expanded && task.description.length > 80 ? task.description.slice(0, 80) + "…" : task.description}
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
      {expanded && (
        <TaskQuickEdit
          task={task} canEdit={canEdit}
          sections={sections} sectionId={sectionId} assignees={assignees}
          onQuick={onQuick} onEdit={onEdit}
        />
      )}
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

/* ── Quick options under an opened card ───────────────────
   Click a card and the few things people change every day are right there,
   like the order cards in Production. Edit opens the full form for the rest.
   Dropdowns save the moment they change. */
const QUICK_INPUT = { border: "1px solid var(--line-strong)", borderRadius: 6, padding: "5px 7px", fontSize: 12, background: "#fff", fontFamily: "var(--font)", width: "100%", boxSizing: "border-box" };
const QUICK_BTN   = { fontSize: 11, padding: "3px 8px" };

function QuickField({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</span>
      {children}
    </label>
  );
}

function TaskQuickEdit({ task, canEdit, sections, sectionId, assignees, onQuick, onEdit }) {
  // null = the person isn't typing in it, so show whatever the task says.
  // That keeps the field in step with the task (edit form, a save rolling
  // back) without copying it into state. A note draft remembers the note it
  // was typed over and stops counting once the saved one changes underneath it.
  const [dueDraft, setDueDraft]   = useState(null);
  const [noteDraft, setNoteDraft] = useState(null);   // { text, base }
  const savedNote = task.notes || "";
  const due  = dueDraft ?? (task.dueDate || "");
  const note = noteDraft && noteDraft.base === savedNote ? noteDraft.text : savedNote;
  const noteChanged = note.trim() !== savedNote.trim();
  const people = assignees.length > 0 ? assignees : TEAM_MEMBERS;

  // Finishing a task, or moving it to another section, takes the card out of
  // this spot and rebuilds it, which drops what was typed. So a note that's been
  // typed goes along with the change.
  const withNote = patch => (noteChanged ? { ...patch, notes: note.trim() } : patch);

  function changeDue(v) {
    setDueDraft(v);
    // Typing a year passes through 0002, 0020, 0202 on the way to 2026; only
    // save once it is a real one.
    if ((v === "" || Number(v.slice(0, 4)) >= 2000) && v !== (task.dueDate || "")) onQuick(task, { dueDate: v });
  }

  async function saveNote() {
    // Keep what was typed if the save fails, so it isn't lost with the error.
    if (await onQuick(task, { notes: note.trim() })) setNoteDraft(null);
  }

  return (
    <div style={{ marginTop: 4, borderTop: "1px solid var(--line)", paddingTop: 8, fontSize: 11 }} onClick={e => e.stopPropagation()}>
      {canEdit && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 6 }}>
            <QuickField label="Section">
              <select value={sectionId || ""} onChange={e => onQuick(task, withNote({ sectionId: e.target.value }))} style={QUICK_INPUT}>
                {sections.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </QuickField>
            <QuickField label="Priority">
              <select value={normPriority(task.priority)} onChange={e => onQuick(task, { priority: e.target.value })} style={QUICK_INPUT}>
                <option value="high">High</option>
                <option value="med">Medium</option>
                <option value="low">Low</option>
              </select>
            </QuickField>
            <QuickField label="Assignee">
              <select value={task.assignee || ""} onChange={e => onQuick(task, { assignee: e.target.value })} style={QUICK_INPUT}>
                <option value="">— None —</option>
                {task.assignee && !people.some(m => m.name === task.assignee) && <option value={task.assignee}>{task.assignee}</option>}
                {people.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
              </select>
            </QuickField>
            <QuickField label="Due">
              <input type="date" value={due} onChange={e => changeDue(e.target.value)} onBlur={() => setDueDraft(null)} style={QUICK_INPUT} />
            </QuickField>
          </div>
          <div style={{ marginTop: 6 }}>
            <QuickField label="Update">
              <textarea
                rows={2}
                value={note}
                onChange={e => setNoteDraft({ text: e.target.value, base: savedNote })}
                placeholder="Progress update…"
                style={{ ...QUICK_INPUT, resize: "vertical", lineHeight: 1.4 }}
              />
            </QuickField>
            {noteChanged && (
              <button className="primary-button" style={{ ...QUICK_BTN, marginTop: 6 }} onClick={saveNote}>Save update</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <button className="primary-button" style={QUICK_BTN} onClick={() => onQuick(task, withNote({ status: DONE }))}>Mark done</button>
            <button className="ghost-button" style={QUICK_BTN} onClick={() => onEdit(task)}>Edit</button>
          </div>
        </>
      )}
      <div style={{ color: "var(--ink-4)", marginTop: canEdit ? 8 : 0 }}>
        Created{task.createdBy ? ` by ${task.createdBy}` : ""}{task.createdAt ? ` · ${fmtDay(task.createdAt)}` : ""}
      </div>
    </div>
  );
}

/* ── Sections ─────────────────────────────────────────────
   A section is a lane of the board. Click its header and its options open right
   under it, the way a card's options do: rename it, colour it, move it, fold it
   away, or delete it. Long sections stop at about the height of the screen and
   scroll inside themselves. */
const SETTINGS_BTN   = { fontSize: 11, padding: "3px 8px" };
const DANGER_BTN     = { ...SETTINGS_BTN, color: "var(--terra)", borderColor: "color-mix(in srgb, var(--terra) 40%, transparent)" };
const SETTINGS_LABEL = { fontSize: 10, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em" };

function SectionPill({ tone, children }) {
  return (
    <span className={cn("kpill", `kpill--${tone}`)} style={{ minWidth: 0, maxWidth: "100%" }}>
      <span className="kpill-dot" style={{ flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{children}</span>
    </span>
  );
}

function ToneSwatches({ value, onPick }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {SECTION_TONES.map(t => (
        <button
          key={t} type="button" title={t} aria-label={`${t} colour`} aria-pressed={value === t}
          onClick={() => onPick(t)}
          style={{ width: 22, height: 22, borderRadius: "50%", background: TONE_DOT[t], border: value === t ? "3px solid var(--ink)" : "3px solid transparent", cursor: "pointer", padding: 0 }}
        />
      ))}
    </div>
  );
}

function SectionSettings({ col, index, total, phone, sections, openCount, collapsed, nameProblem, onUpdate, onMove, onDelete, onToggleCollapsed, onAddTask }) {
  const [nameDraft, setNameDraft]   = useState(null);   // null = not typing, show the saved name
  const [nameError, setNameError]   = useState("");
  const [confirming, setConfirming] = useState(false);
  const [target, setTarget]         = useState("");
  const [busy, setBusy]             = useState(false);
  const others = sections.filter(s => s.id !== col.id);
  const moveTo = others.some(s => s.id === target) ? target : others[0]?.id || "";
  const name   = nameDraft ?? col.label;

  function commitName() {
    if (nameDraft === null) return;
    const next = nameDraft.trim();
    if (!next || next === col.label) { setNameDraft(null); setNameError(""); return; }   // nothing to change: put the saved name back
    const problem = nameProblem(next, col.id);
    if (problem) { setNameError(problem); return; }   // keep what was typed so it can be fixed
    setNameDraft(null); setNameError("");
    onUpdate({ label: next });
  }

  return (
    <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 10, fontSize: 11 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={SETTINGS_LABEL}>Name</span>
        <input
          value={name} maxLength={40}
          onChange={e => { setNameDraft(e.target.value); setNameError(""); }}
          onBlur={commitName}
          onKeyDown={e => {
            if (e.key === "Enter") commitName();
            if (e.key === "Escape") { setNameDraft(null); setNameError(""); }
          }}
          style={{ ...QUICK_INPUT, fontSize: 13 }}
        />
        {nameError && <span style={{ color: "var(--terra)" }}>{nameError}</span>}
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={SETTINGS_LABEL}>Colour</span>
        <ToneSwatches value={col.tone} onPick={t => onUpdate({ tone: t })} />
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="ghost-button" style={SETTINGS_BTN} disabled={index === 0} onClick={() => onMove(-1)}>{phone ? "↑ Move up" : "← Move left"}</button>
        <button className="ghost-button" style={SETTINGS_BTN} disabled={index === total - 1} onClick={() => onMove(1)}>{phone ? "↓ Move down" : "Move right →"}</button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="ghost-button" style={SETTINGS_BTN} onClick={onAddTask}>+ Add task here</button>
        <button className="ghost-button" style={SETTINGS_BTN} onClick={onToggleCollapsed}>{collapsed ? "Expand" : "Collapse"}</button>
      </div>

      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
        {!confirming ? (
          <>
            <button className="ghost-button" style={DANGER_BTN} disabled={others.length === 0} onClick={() => setConfirming(true)}>Delete section</button>
            {others.length === 0 && <div style={{ color: "var(--ink-4)", marginTop: 4 }}>Keep at least one section. Add another before deleting this one.</div>}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ color: "var(--ink)", fontWeight: 600 }}>Delete "{col.label}"?</div>
            {openCount > 0 ? (
              <label style={{ display: "flex", flexDirection: "column", gap: 3, color: "var(--ink-3)" }}>
                <span>Its {openCount} open {openCount === 1 ? "task" : "tasks"} will move to:</span>
                <select value={moveTo} onChange={e => setTarget(e.target.value)} style={QUICK_INPUT}>
                  {others.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            ) : (
              <div style={{ color: "var(--ink-4)" }}>It has no open tasks.</div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="ghost-button" style={DANGER_BTN} disabled={busy}
                onClick={async () => { setBusy(true); if (!(await onDelete(moveTo))) setBusy(false); }}
              >{busy ? "Deleting…" : "Delete"}</button>
              <button className="ghost-button" style={SETTINGS_BTN} disabled={busy} onClick={() => setConfirming(false)}>Keep it</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Kanban column ────────────────────────────────────────
   A column is one of the team's sections. Its header renames, recolours, moves
   and deletes it; a card dropped on it moves into it. */
function KanbanColumn({
  col, index, total, sections, tasks, openCount, canEdit, phone, collapsed,
  onToggleCollapsed, onUpdateSection, onMoveSection, onDeleteSection, nameProblem,
  onAdd, onDelete, onEdit, onDrop, onColumnDrop, defaultAssignee, customers, assignees = [],
  expandedId, onToggle, onQuick,
}) {
  const [adding, setAdding]           = useState(false);
  const [editing, setEditing]         = useState(false);   // the section's own options are open
  const [hoverHead, setHoverHead]     = useState(false);
  const [dragOver, setDragOver]       = useState(false);
  const [colDragOver, setColDragOver] = useState(false);
  const dotColor = TONE_DOT[col.tone] || "var(--ink-4)";

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false); setColDragOver(false);
    const taskId   = e.dataTransfer.getData("taskId");
    const columnId = e.dataTransfer.getData("columnId");
    if (columnId && columnId !== col.id) onColumnDrop(columnId, col.id);
    else if (taskId) onDrop(taskId, col);
  }

  const addHere = () => { setAdding(true); if (collapsed) onToggleCollapsed(); };
  const foldBtn = { background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", padding: 2, display: "flex", borderRadius: 6 };

  return (
    <div
      id={`ktasks-section-${col.id}`}
      className="ktasks-col"
      onDragOver={e => { e.preventDefault(); if (e.dataTransfer.types.includes("columnid")) setColDragOver(true); else setDragOver(true); }}
      onDragLeave={() => { setDragOver(false); setColDragOver(false); }}
      onDrop={handleDrop}
      style={{
        background: colDragOver ? "var(--bg)" : dragOver ? TONE_BG[col.tone] : "var(--bg-2)",
        outline: dragOver ? `2px dashed ${dotColor}` : colDragOver ? "2px dashed var(--ink-4)" : "none",
        minHeight: collapsed ? 0 : undefined,
      }}
    >
      {/* Header: fold it away, open its options, or drag it to reorder */}
      <div className="ktasks-col-h" style={{ gap: 2 }}>
        <button
          type="button" onClick={onToggleCollapsed} aria-expanded={!collapsed} style={foldBtn}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${col.label}`} title={collapsed ? "Expand" : "Collapse"}
        >
          <span style={{ display: "flex", transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform .2s" }}><Icons.ChevronDown size={14} /></span>
        </button>
        <button
          type="button"
          onClick={canEdit ? () => setEditing(v => !v) : onToggleCollapsed}
          aria-expanded={canEdit ? editing : !collapsed}
          title={canEdit ? "Rename, recolour, move or delete this section" : undefined}
          onMouseEnter={() => setHoverHead(true)} onMouseLeave={() => setHoverHead(false)}
          style={{
            flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8,
            background: editing || hoverHead ? "var(--line)" : "transparent",
            border: 0, borderRadius: 8, padding: "3px 6px", cursor: "pointer",
            font: "inherit", color: "inherit", textAlign: "left",
          }}
        >
          <SectionPill tone={col.tone}>{col.label}</SectionPill>
          <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>{tasks.length}</span>
          {canEdit && <span style={{ marginLeft: "auto", color: "var(--ink-5)", display: "flex" }}><Icons.More size={14} /></span>}
        </button>
        {canEdit && (
          <button
            draggable
            onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("columnId", col.id); }}
            style={{ background: "none", border: "none", cursor: "grab", color: "var(--ink-5)", fontSize: 14, padding: "1px 2px", lineHeight: 1 }}
            title="Drag to reorder"
          >⠿</button>
        )}
      </div>

      {editing && canEdit && (
        <SectionSettings
          col={col} index={index} total={total} phone={phone} sections={sections}
          openCount={openCount} collapsed={collapsed} nameProblem={nameProblem}
          onUpdate={patch => onUpdateSection(col, patch)}
          onMove={dir => onMoveSection(col, dir)}
          onDelete={targetId => onDeleteSection(col, targetId)}
          onToggleCollapsed={onToggleCollapsed}
          onAddTask={addHere}
        />
      )}

      {!collapsed && (
        <>
          {/* Cards. A long list scrolls in here so the page doesn't have to. */}
          <div className="ktasks-col-body" style={phone ? undefined : { maxHeight: COL_CAP, overflowY: "auto" }}>
            {tasks.map((task, i) => (
              <TaskCard
                key={task.id} task={task} idx={i} canEdit={canEdit}
                expanded={expandedId === task.id}
                sections={sections} sectionId={col.id}
                assignees={assignees}
                onToggle={() => onToggle(task.id)}
                onDelete={onDelete}
                onEdit={onEdit}
                onQuick={onQuick}
                onDragStart={e => e.dataTransfer.setData("taskId", task.id)}
              />
            ))}
            {adding && (
              <AddCardForm
                sectionId={col.id}
                defaultAssignee={defaultAssignee}
                customers={customers}
                assignees={assignees}
                onAdd={data => { onAdd(data); setAdding(false); }}
                onCancel={() => setAdding(false)}
              />
            )}
            {tasks.length === 0 && !adding && (
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
        </>
      )}
    </div>
  );
}

/* ── New section ──────────────────────────────────────────
   One form, used in two places: the "Add section" button next to "New task",
   and the tile at the end of the board. onAdd hands back a sentence if it
   couldn't add the section, which is shown under the name. */
function NewSectionForm({ onAdd, onCancel, onDone, inline }) {
  const [label, setLabel] = useState("");
  const [tone, setTone]   = useState("neutral");
  const [error, setError] = useState("");
  const [busy, setBusy]   = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    const problem = await onAdd(label, tone);
    setBusy(false);
    if (problem) { setError(problem); return; }
    setLabel(""); setError("");
    onDone?.();
  }

  return (
    <div style={inline ? { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } : { display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        autoFocus maxLength={40} placeholder="Section name…" value={label}
        onChange={e => { setLabel(e.target.value); setError(""); }}
        onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
        style={{ border: "1.5px solid var(--mint-2)", borderRadius: 6, padding: "7px 9px", fontSize: 13, fontFamily: "var(--font)", outline: "none", ...(inline ? { flex: "1 1 200px", minWidth: 0 } : {}) }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {!inline && <div style={{ ...SETTINGS_LABEL, fontSize: 11, letterSpacing: ".04em" }}>Colour</div>}
        <ToneSwatches value={tone} onPick={setTone} />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={submit} disabled={busy}
          style={{ flex: 1, background: "var(--mint-deep)", color: "#fff", border: "none", borderRadius: 6, padding: inline ? "7px 16px" : 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)", opacity: busy ? .6 : 1 }}>
          {busy ? "Adding…" : "Add section"}
        </button>
        <button onClick={onCancel}
          style={{ background: "transparent", border: "1px solid var(--line-strong)", borderRadius: 6, padding: "7px 10px", fontSize: 12, cursor: "pointer", color: "var(--ink-3)", fontFamily: "var(--font)" }}>
          ✕
        </button>
      </div>
      {error && <div style={{ color: "var(--terra)", fontSize: 12, flexBasis: "100%" }}>{error}</div>}
    </div>
  );
}

/* ── Add Section tile at the end of the board ─────── */
function AddSectionPanel({ onAdd }) {
  const [open, setOpen] = useState(false);

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
      <NewSectionForm onAdd={onAdd} onCancel={() => setOpen(false)} onDone={() => setOpen(false)} />
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

/* ── Done dock ────────────────────────────────────────────
   Finished tasks collect here instead of piling up in a board column. The bar
   stays pinned to the bottom of the screen, and opening it slides the list up
   over the board. Same idea as Cancelled documents in Billing: a header that
   opens it, then a table. A card dropped on it is marked done, so dragging to
   Done still works.

   It is fixed to the screen and placed by hand rather than made sticky: on the
   phone layout the page sits inside wrappers that clip overflow, and a sticky
   element never sticks inside one of those. */
const DOCK_BAR  = 56;    // height of the closed bar
const DOCK_MS   = 300;
const DOCK_EASE = "cubic-bezier(.32,.72,0,1)";
// The list scrolls inside the dock, so its column heads have to stay put. They
// are a tinted band that runs edge to edge and starts right at the top of the
// dock, so there is no gap above them for rows to scroll through. The first and
// last cell carry the inset instead (see edge()).
const DONE_TH = { position: "sticky", top: 0, zIndex: 1, background: "var(--mint-wash)", boxShadow: "0 1px 0 var(--line)" };
const edge = (i, n) => (i === 0 ? { paddingLeft: 24 } : i === n - 1 ? { paddingRight: 24 } : null);

function DoneSection({ tasks, canEdit, onReopen, onEdit, onDelete, onDropTask }) {
  const [open, setOpen]         = useState(false);
  const [built, setBuilt]       = useState(false);   // the table is built the first time it opens, not on every page load
  const [dragOver, setDragOver] = useState(false);
  const [ring, setRing]         = useState(false);
  const [place, setPlace]      = useState({ left: 0, width: 0, bottom: 0 });
  const dock   = useRef(null);
  const listId = useId();
  const still  = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const heads  = ["Task", "Assignee", "Due", "Done on", ...(canEdit ? ["Actions"] : [])];

  // Line up with the page's column, and sit as far above the bottom of the
  // screen as the page's own bottom padding does (on the phone app that padding
  // is what clears the bottom nav). Watching the page's size also follows the
  // sidebar opening and closing, which is not a window resize.
  useLayoutEffect(() => {
    const page = dock.current?.closest(".kscroll");
    if (!page) return;
    const measure = () => {
      const css = getComputedStyle(page);
      const padL = parseFloat(css.paddingLeft) || 0;
      const padR = parseFloat(css.paddingRight) || 0;
      const left   = page.getBoundingClientRect().left + page.clientLeft + padL;
      const width  = page.clientWidth - padL - padR;
      const bottom = parseFloat(css.paddingBottom) || 0;
      setPlace(p => (p.left === left && p.width === width && p.bottom === bottom ? p : { left, width, bottom }));
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(page);
    window.addEventListener("resize", measure);
    return () => { watch.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  const toggle = () => { setBuilt(true); setOpen(v => !v); };
  // Once it has finished closing the list is hidden, so its buttons can't be
  // tabbed to; opening shows it straight away.
  const slide = still ? "none" : `grid-template-rows ${DOCK_MS}ms ${DOCK_EASE}, visibility 0s linear ${open ? 0 : DOCK_MS}ms`;

  return (
    <div
      ref={dock}
      className="kfin-block"
      style={{
        position: "fixed", left: place.left, width: place.width, bottom: place.bottom, zIndex: 30,
        // Clips the list to the dock's own rounded corners, so the tinted head row doesn't poke out of them.
        padding: 0, overflow: "hidden", borderColor: "var(--mint-2)",
        boxShadow: "0 -6px 24px rgba(15,46,34,.10), 0 2px 8px rgba(15,46,34,.06)",
        background: dragOver ? "var(--mint-soft)" : undefined,
        outline: dragOver ? "2px dashed var(--mint-2)" : "none",
      }}
      onDragOver={e => {
        if (!canEdit || !e.dataTransfer.types.includes("taskid")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        const taskId = e.dataTransfer.getData("taskId");
        if (taskId) onDropTask(taskId);
      }}
    >
      {/* Hides the page as it scrolls by in the gap under the bar. */}
      <div aria-hidden="true" style={{ position: "fixed", left: place.left, width: place.width, bottom: 0, height: place.bottom, background: "var(--bg)", zIndex: -1 }} />

      {/* The list sits above the bar, so opening grows the dock upward. */}
      <div id={listId} style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", visibility: open ? "visible" : "hidden", transition: slide }}>
        <div style={{ minHeight: 0, overflow: "hidden" }}>
          <div style={{ maxHeight: "min(50vh, 460px)", overflow: "auto" }}>
            {built && (tasks.length === 0 ? (
              <div className="ktasks-empty">No finished tasks</div>
            ) : (
              <table className="kfin-tbl" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    {heads.map((h, i) => <th key={h} style={{ ...DONE_TH, ...edge(i, heads.length) }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {tasks.map(t => (
                    <tr key={t.id}>
                      <td style={edge(0, heads.length)}>
                        <div style={{ fontWeight: 500, color: "var(--ink)" }}>{t.title}</div>
                        {(t.customer || t.category || t.orderRef) && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 3, fontSize: 10, color: "var(--ink-4)" }}>
                            {t.customer && (
                              <span style={{ fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "var(--mint-soft)", color: "var(--mint-deep)" }}>{t.customer}</span>
                            )}
                            {t.category && (
                              <span style={{ fontWeight: 600, padding: "1px 7px", borderRadius: 20, ...catChip(t.category) }}>{t.category}</span>
                            )}
                            {t.orderRef && <span>{t.orderRef}</span>}
                          </div>
                        )}
                      </td>
                      <td>
                        {t.assignee ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                            <div style={{ width: 20, height: 20, borderRadius: "50%", background: avatarColor(t.assignee), color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {initials(t.assignee)}
                            </div>
                            {t.assignee}
                          </div>
                        ) : "—"}
                      </td>
                      <td style={{ whiteSpace: "nowrap", color: "var(--ink-3)" }}>{t.dueDate ? fmtDay(t.dueDate) : "—"}</td>
                      <td
                        style={{ whiteSpace: "nowrap", fontWeight: 500, ...edge(3, heads.length) }}
                        title={t.completedAt ? new Date(t.completedAt).toLocaleString("en-GB") : "The finish date wasn't recorded for this task"}
                      >
                        {t.completedAt ? fmtDay(t.completedAt) : "—"}
                      </td>
                      {canEdit && (
                        <td style={edge(4, heads.length)}>
                          <div className="kbil-tbl-actions">
                            <button className="kbil-tbl-btn kbil-tbl-btn--ok" onClick={() => onReopen(t)}>Reopen</button>
                            <button className="kbil-tbl-btn kbil-tbl-btn--primary" onClick={() => onEdit(t)}>Edit</button>
                            <button className="kbil-tbl-btn kbil-tbl-btn--danger" onClick={() => onDelete(t.id)}>Delete</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="kfin-block-hd"
        aria-expanded={open} aria-controls={listId}
        onClick={toggle}
        onFocus={e => setRing(e.currentTarget.matches(":focus-visible"))}
        onBlur={() => setRing(false)}
        style={{
          width: "100%", height: DOCK_BAR, margin: 0, padding: "0 24px", background: "none", border: 0, borderRadius: 0,
          borderTop: "1px solid", borderTopColor: open ? "var(--line)" : "transparent",
          transition: still ? "none" : `border-color ${DOCK_MS}ms`,
          // The page's own focus ring would be cut off at the edge of the dock, so draw it inside.
          boxShadow: ring ? "inset 0 0 0 2px var(--mint-2)" : "none",
          font: "inherit", color: "inherit", cursor: "pointer",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: "var(--mint-deep)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="8 12.5 11 15.5 16 9.5"/></svg>
          Done
          <span className="kfin-block-sub">({tasks.length})</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--ink-4)" }}>
          {open ? "Hide" : "Show"}
          {/* Points up while closed, because that is the way it opens. */}
          <span style={{ display: "flex", transform: open ? "none" : "rotate(180deg)", transition: still ? "none" : `transform ${DOCK_MS}ms ${DOCK_EASE}` }}>
            <Icons.ChevronDown size={14} />
          </span>
        </span>
      </button>
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
  const [showAddSection, setShowAddSection] = useState(false);
  const [newForm,      setNewForm]     = useState(EMPTY_TASK_FORM);
  const [editTask,     setEditTask]    = useState(null);
  const [editForm,     setEditForm]    = useState({});
  const [editSaving,   setEditSaving]  = useState(false);
  const [expandedId,   setExpandedId]  = useState(null);
  const [collapsed,    setCollapsed]   = useState(readCollapsed);
  // On a phone the sections stack, so a section scrolling inside itself would
  // be a scroll area inside a scroll area. There they fold away instead.
  const phone = useMedia("(max-width: 768px)");

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

  // The counts on the filter chips are what is still open, like the board.
  const openTasks = useMemo(() => tasks.filter(t => !isDone(t)), [tasks]);

  // A task with no section (or one whose section has gone) shows in the section
  // named like its old status, so an "In Progress" task that was never filed
  // still lands in "In Progress". Failing that it sits in the first section.
  // Either way the board never hides a task.
  const sectionIds    = useMemo(() => new Set(columns.map(c => c.id)), [columns]);
  const sectionByName = useMemo(() => new Map(columns.map(c => [c.label.trim().toLowerCase(), c.id])), [columns]);
  const sectionOf = t => {
    if (sectionIds.has(t.sectionId)) return t.sectionId;
    return sectionByName.get(String(t.status || "").trim().toLowerCase()) ?? columns[0]?.id;
  };

  // What's on the board: open tasks, grouped by the section they sit in.
  // Finished ones are in the Done bar.
  const byColumn = useMemo(() => {
    const acc = Object.fromEntries(columns.map(c => [c.id, []]));
    for (const t of visibleTasks) {
      if (!isDone(t)) acc[sectionOf(t)]?.push(t);
    }
    return acc;
  }, [visibleTasks, columns, sectionIds, sectionByName]);

  // Open tasks per section across everything, unfiltered and both regions: what
  // a deleted section has to find a new home for.
  const openBySection = useMemo(() => {
    const acc = Object.fromEntries(columns.map(c => [c.id, 0]));
    for (const t of allTasks) {
      if (isDone(t)) continue;
      const id = sectionOf(t);
      if (id in acc) acc[id]++;
    }
    return acc;
  }, [allTasks, columns, sectionIds, sectionByName]);

  const doneTasks = useMemo(() => visibleTasks.filter(isDone).sort(byDoneDate), [visibleTasks]);

  async function handleAdd(data) {
    try {
      await insertRow("tasks", { ...data, region: data.region || region, createdBy: profile?.name || "Unknown" });
      await loadTasks();
    } catch (err) {
      console.error("Error adding task:", err);
      alert(saveFailed(err, "Failed to add task: " + err.message));
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

  async function awardCompletion(task) {
    if (!task.assignee) return;
    try {
      const uid = await resolveUidByName(task.assignee);
      if (!uid) return;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const isEarly = task.dueDate && today <= new Date(task.dueDate);
      const pts = await awardPoints({
        uid,
        displayName: task.assignee,
        eventType: task.priority === "high" ? "task_completed_high" : "task_completed",
        sourceId: task.id,
        reason: task.title,
        bonusPoints: isEarly ? 10 : 0,
      });
      if (pts) showPointsToast(pts, task.title);
    } catch (err) {
      // The task is already saved; a rewards hiccup shouldn't read as a failed save.
      console.error("Could not award points:", err);
    }
  }

  /* Every change to a task goes through here (a drag, the quick options under a
     card, the edit form), so finishing one is handled the same from each:
     stamped with the time, and the assignee rewarded. */
  async function saveTask(task, patch) {
    const changes = { ...patch };
    // No date is null: an empty string is not a date to the database.
    if ("dueDate" in changes && !changes.dueDate) changes.dueDate = null;
    // The view takes the name from the linked person first, so a new name only
    // sticks once that link is dropped.
    if ("assignee" in changes && changes.assignee !== task.assignee) changes.assignee_id = null;

    // Finishing or reopening a task never moves it between sections. One that
    // isn't filed yet is showing in one (see sectionOf), so file it there now,
    // and it comes back to the same place.
    if ("status" in changes && !("sectionId" in changes) && !sectionIds.has(task.sectionId)) changes.sectionId = sectionOf(task);

    const finished = changes.status === DONE && !isDone(task);
    const reopened = isDone(task) && "status" in changes && changes.status !== DONE;
    if (finished) changes.completedAt = new Date().toISOString();
    if (reopened) changes.completedAt = null;

    // Show it now and put it back if the save fails, so a dropdown doesn't sit
    // on its old value while the request is in flight.
    const before = Object.fromEntries(Object.keys(changes).map(k => [k, task[k]]));
    setTasks(cur => cur.map(t => t.id === task.id ? { ...t, ...changes } : t));
    try {
      await updateRow("tasks", task.id, changes);
    } catch (err) {
      setTasks(cur => cur.map(t => t.id === task.id ? { ...t, ...before } : t));
      throw err;
    }
    if (finished) awardCompletion({ ...task, ...changes });
  }

  // For the quick options and drag-and-drop, where there is no form to show an
  // error in. Resolves to whether it saved.
  async function quickUpdate(task, patch) {
    if (patch.status === DONE) setExpandedId(cur => cur === task.id ? null : cur);
    try {
      await saveTask(task, patch);
      return true;
    } catch (err) {
      console.error("Could not update task:", err);
      alert(saveFailed(err, "Could not update task — you may not have permission to edit tasks."));
      return false;
    }
  }

  // Dropped on a section: the task moves there. Nothing else about it changes.
  async function handleDropOnColumn(taskId, col) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || isDone(task) || sectionOf(task) === col.id) return;
    await quickUpdate(task, { sectionId: col.id });
  }

  // Dropped on the Done bar: it's finished, wherever it sits.
  async function handleDropOnDone(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || isDone(task)) return;
    await quickUpdate(task, { status: DONE });
  }

  // Back on the board, in the section it was finished from.
  const handleReopen = task => quickUpdate(task, { status: null });
  const toggleExpanded = id => setExpandedId(cur => cur === id ? null : id);

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
      sectionId:   sectionOf(task)  || "",
      notes:       task.notes       || "",
      region:      task.region      || "",
    });
  }

  async function handleEditSave() {
    if (!editTask || !editForm.title.trim()) return;
    setEditSaving(true);
    try {
      await saveTask(editTask, {
        title:       editForm.title.trim(),
        description: editForm.description,
        assignee:    editForm.assignee,
        priority:    editForm.priority,
        dueDate:     editForm.dueDate,
        orderRef:    editForm.orderRef,
        category:    editForm.category,
        customer:    editForm.customer,
        sectionId:   editForm.sectionId || null,
        notes:       editForm.notes || "",
        region:      editForm.region || null,
      });
      setEditTask(null);
    } catch (err) {
      console.error("Failed to update task:", err);
      alert(saveFailed(err, "Failed to save changes. Please try again."));
    }
    setEditSaving(false);
  }

  /* ── Sections ──────────────────────────────────────────── */

  // Why a section can't be called this, or nothing if it can. Done belongs to
  // the bar at the bottom. Two sections with one name would be tidied away
  // (loadColumns keeps one), so a name can only be used once.
  const nameProblem = (label, exceptId) => {
    const key = label.trim().toLowerCase();
    if (key === DONE.toLowerCase()) return "Done is built in: it's the bar at the bottom.";
    if (columns.some(c => c.id !== exceptId && c.label.trim().toLowerCase() === key)) return `There's already a section called "${label.trim()}".`;
    return null;
  };

  // Resolves to a sentence saying why it couldn't, or nothing when it worked.
  async function handleAddColumn(label, tone) {
    const name = (label || "").trim();
    if (!name) return "Give the section a name.";
    const problem = nameProblem(name);
    if (problem) return problem;
    try {
      const maxOrder = columns.reduce((m, c) => Math.max(m, c.order ?? 0), 0);
      const row = await insertRow("task_columns", { label: name, tone: tone || "neutral", order: maxOrder + 1 });
      if (!row) { await loadColumns(); return null; }
      setColumns(cur => [...cur, row]);
      // Put it in front of the person, whichever row of the board it landed on.
      setTimeout(() => document.getElementById(`ktasks-section-${row.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
      return null;
    } catch (err) {
      console.error("Could not add the section:", err);
      return "Could not add the section. You may not have permission to edit tasks.";
    }
  }

  async function handleUpdateSection(col, patch) {
    const before = Object.fromEntries(Object.keys(patch).map(k => [k, col[k]]));
    setColumns(cur => cur.map(c => c.id === col.id ? { ...c, ...patch } : c));
    try {
      await updateRow("task_columns", col.id, patch);
    } catch (err) {
      console.error("Could not change the section:", err);
      setColumns(cur => cur.map(c => c.id === col.id ? { ...c, ...before } : c));
      alert("Could not change the section — you may not have permission to edit tasks.");
    }
  }

  async function handleColumnReorder(draggedColId, targetColId) {
    if (draggedColId === targetColId) return;
    const before  = columns;
    const newCols = [...columns];
    const fromIdx = newCols.findIndex(c => c.id === draggedColId);
    const toIdx   = newCols.findIndex(c => c.id === targetColId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = newCols.splice(fromIdx, 1);
    newCols.splice(toIdx, 0, moved);
    setColumns(newCols.map((c, i) => ({ ...c, order: i })));
    try {
      await Promise.all(newCols.map((c, i) => c.order === i ? null : updateRow("task_columns", c.id, { order: i })));
    } catch (err) {
      console.error("Could not save the new order:", err);
      setColumns(before);
      alert("Could not move the section — you may not have permission to edit tasks.");
    }
  }

  // The arrows in a section's options: one place left or right (up or down on a phone).
  const handleMoveSection = (col, dir) => {
    const other = columns[columns.findIndex(c => c.id === col.id) + dir];
    return other && handleColumnReorder(col.id, other.id);
  };

  // Its open tasks move to another section first, so none of them drops off the
  // board; finished ones just lose their section. Resolves to whether it went.
  async function handleDeleteSection(col, targetId) {
    if (columns.length <= 1) return false;
    const moving = allTasks.filter(t => !isDone(t) && sectionOf(t) === col.id);
    try {
      if (moving.length && !columns.some(c => c.id === targetId && c.id !== col.id)) throw new Error("no section to move the tasks to");
      await Promise.all(moving.map(t => updateRow("tasks", t.id, { sectionId: targetId })));
      await deleteRow("task_columns", col.id);
    } catch (err) {
      console.error("Could not delete the section:", err);
      alert(saveFailed(err, "Could not delete the section — you may not have permission to edit tasks."));
      await Promise.allSettled([loadColumns(), loadTasks()]);
      return false;
    }
    const moved = new Set(moving.map(t => t.id));
    setTasks(cur => cur.map(t => moved.has(t.id) ? { ...t, sectionId: targetId } : t.sectionId === col.id ? { ...t, sectionId: null } : t));
    setColumns(cur => cur.filter(c => c.id !== col.id));
    return true;
  }

  function toggleCollapsed(id) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCollapsed(next);
    writeCollapsed(next);
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
                  <>
                    <button className="ghost-button" style={{ display: "flex", alignItems: "center", gap: 6 }} aria-expanded={showAddSection} onClick={() => setShowAddSection(v => !v)}>
                      <Icons.Plus size={13} sw={2.2} /> Add section
                    </button>
                    <button className="primary-button" data-tour="new-task" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => setShowNew(true)}>
                      <Icons.Plus size={13} sw={2.2} /> New task
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {canEdit && showAddSection && (
          <div style={{ background: "var(--bg-2)", border: "1px solid var(--line-strong)", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
            <NewSectionForm inline onAdd={handleAddColumn} onCancel={() => setShowAddSection(false)} onDone={() => setShowAddSection(false)} />
          </div>
        )}

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
              const count = openTasks.filter(t => t.assignee === m.name).length;
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
                <AssignFilter selected={filter} onSelect={setFilter} tasks={openTasks} assignees={assignees} />
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
                    const count = openTasks.filter(t => t.customer === c.name).length;
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
          <>
            <div className="ktasks-board" data-tour="task-board" style={{ overflowX: "auto", alignItems: "flex-start", minHeight: 480 }}>
              {columns.map((col, i) => (
                <KanbanColumn
                  key={col.id} col={col} index={i} total={columns.length}
                  sections={columns}
                  tasks={byColumn[col.id] || []}
                  openCount={openBySection[col.id] || 0}
                  canEdit={canEdit}
                  phone={phone}
                  collapsed={collapsed.has(col.id)}
                  onToggleCollapsed={() => toggleCollapsed(col.id)}
                  onUpdateSection={handleUpdateSection}
                  onMoveSection={handleMoveSection}
                  onDeleteSection={handleDeleteSection}
                  nameProblem={nameProblem}
                  defaultAssignee={filter}
                  customers={customers}
                  assignees={assignees}
                  expandedId={expandedId}
                  onToggle={toggleExpanded}
                  onAdd={handleAdd}
                  onDelete={handleDelete}
                  onEdit={handleOpenEdit}
                  onQuick={quickUpdate}
                  onDrop={handleDropOnColumn}
                  onColumnDrop={handleColumnReorder}
                />
              ))}
              {canEdit && <AddSectionPanel onAdd={handleAddColumn} />}
            </div>

            {/* Room at the end of the page for the Done bar, which floats over it. */}
            <div aria-hidden="true" style={{ height: DOCK_BAR + 16, flex: "none" }} />
          </>
        )}
      </div>

      {/* Outside .kscr on purpose: while its fade-in plays, .kscr has a transform,
          and that would become the bar's frame of reference instead of the screen. */}
      {!loading && (
        <DoneSection
          tasks={doneTasks}
          canEdit={canEdit}
          onReopen={handleReopen}
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
          onDropTask={handleDropOnDone}
        />
      )}

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
              <label>Section
                <select value={newForm.sectionId || columns[0]?.id || ""} onChange={e => setNewForm(f => ({ ...f, sectionId: e.target.value }))}>
                  {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
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
                await handleAdd({ title: newForm.title, assignee: newForm.assignee, priority: newForm.priority, dueDate: newForm.dueDate, orderRef: newForm.orderRef, category: newForm.category, customer: newForm.customer, description: newForm.description, notes: newForm.notes, sectionId: newForm.sectionId || columns[0]?.id, region: newForm.region });
                setNewForm(EMPTY_TASK_FORM);
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
              <label>{isDone(editTask) ? "Section if reopened" : "Section"}
                <select value={editForm.sectionId} onChange={e => setEditForm(f => ({ ...f, sectionId: e.target.value }))}>
                  {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
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

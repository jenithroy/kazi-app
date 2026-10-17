/**
 * The Tasks page's plain logic: what counts as finished or archived, how a due date
 * reads, how a column is ordered, and the calls that go past the ordinary read/write
 * helpers (migration 0058's `set_task_done`). The Archive is personal and lives on the
 * device, not in the database: the `archived_at` column and `archive_tasks()` that 0058
 * also made are no longer used by the app.
 *
 * Nothing here draws anything, so it can be reasoned about and tested on its own.
 */
import { supabase } from "../supabase";

export const DONE = "Done";

/** A finished task stays in the Done list for this many days, then moves to the Archive by itself. */
export const DONE_WINDOW_DAYS = 7;

const DAY = 86400000;

export const isDone = (t) => String(t?.status || "").trim().toLowerCase() === "done";

/**
 * A finished task is either "recent" (it shows in the Done list) or "archived" (only in
 * the Archive). Archived means: this person cleared it on this device (`cleared`, a Set of
 * task ids, see hooks/useClearedTasks.js: it is personal and never stored in the database),
 * or it finished more than a week ago, or it finished before completion dates were kept, in
 * which case nothing says when and the safe reading is "a long time ago".
 */
export function isArchived(t, now = Date.now(), cleared) {
  if (!isDone(t)) return false;
  if (cleared?.has(t.id)) return true;
  if (!t.completedAt) return true;
  return now - new Date(t.completedAt).getTime() > DONE_WINDOW_DAYS * DAY;
}

/** high | med | low. Older rows say "Medium" / "medium". */
export function normPriority(p) {
  const v = String(p || "").trim().toLowerCase();
  return v === "high" ? "high" : v === "low" ? "low" : "med";
}
const PRIORITY_RANK = { high: 0, med: 1, low: 2 };

/** A bare YYYY-MM-DD is that day here; `new Date("2026-10-17")` alone would read it as UTC. */
export function asDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(`${v}T00:00:00`) : new Date(v);
}

export function fmtDay(v, withYear = false) {
  const d = asDate(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}

/** Whole days from `today` to `due`, both "YYYY-MM-DD" (negative once it has passed). */
export function daysUntil(due, today) {
  const a = Date.UTC(...due.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  const b = Date.UTC(...today.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.round((a - b) / DAY);
}

/**
 * How a due date reads on a card: `{ label, tone }`, tone being "bad" (late), "warn"
 * (today or within three days) or "plain". `today` is the office's date (Kathmandu).
 */
export function dueInfo(dueDate, today) {
  if (!dueDate || !today) return null;
  const diff = daysUntil(dueDate, today);
  if (diff < 0) return { label: diff === -1 ? "1 day late" : `${-diff} days late`, tone: "bad", diff };
  if (diff === 0) return { label: "Due today", tone: "warn", diff };
  if (diff === 1) return { label: "Due tomorrow", tone: "warn", diff };
  if (diff <= 3) return { label: `Due in ${diff} days`, tone: "warn", diff };
  return { label: `Due ${fmtDay(dueDate)}`, tone: "plain", diff };
}

/** Most urgent first within a column: High before Medium before Low, then the soonest due date, then the newest. */
export function byUrgency(a, b) {
  const p = PRIORITY_RANK[normPriority(a.priority)] - PRIORITY_RANK[normPriority(b.priority)];
  if (p) return p;
  const x = a.dueDate || "9999-12-31";
  const y = b.dueDate || "9999-12-31";
  if (x !== y) return x < y ? -1 : 1;
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

/** Newest finish first; tasks with no finish date go last, newest-created first. */
export function byDoneDate(a, b) {
  const x = a.completedAt ? new Date(a.completedAt).getTime() : null;
  const y = b.completedAt ? new Date(b.completedAt).getTime() : null;
  if (x !== null && y !== null) return y - x;
  if (x !== null) return -1;
  if (y !== null) return 1;
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

/** Do two typed names mean the same person? (Old tasks only carry a name.) */
export const sameName = (a, b) => {
  const x = String(a || "").trim().toLowerCase();
  return x !== "" && x === String(b || "").trim().toLowerCase();
};

/** What the database says when a column or function the page needs is not there yet. */
export const databaseBehind = (err) =>
  /schema cache|could not find the .* (column|function)|column .* does not exist|function .* does not exist|PGRST20[0-9]|42883|42703/i
    .test(String(err?.message || err || ""));

export const BEHIND_MSG =
  "The database hasn't had its latest update yet (migration 0058), so this can't be saved. Ask whoever looks after the database to run it.";

/* ── calls past the ordinary read/write helpers ─────────────────────────────── */

/** Finish (done = true) or reopen a task. The assignee may do this to their own task even without edit rights. */
export async function setTaskDone(id, done) {
  const { error } = await supabase.rpc("set_task_done", { p_task_id: id, p_done: done });
  if (error) throw error;
}

/** Delete tasks for good, in batches a request can carry. Needs edit on Tasks (the database checks). */
export async function deleteTasks(ids) {
  for (let i = 0; i < ids.length; i += 80) {
    const { error } = await supabase.from("tasks").delete().in("id", ids.slice(i, i + 80));
    if (error) throw error;
  }
}

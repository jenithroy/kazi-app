/**
 * How points work, as the app shows them.
 *
 * The database is what awards them (migration 0057: a trigger on `tasks` pays the
 * person a task is assigned to, once, when it is finished). These numbers are only
 * for showing what a task is worth, and they have to match the trigger's.
 */

export const TASK_POINTS = {
  normal: 20,   // any task
  high: 30,     // a High priority task
  onTime: 10,   // extra, for finishing on or before the due date
};

const isHigh = (task) => String(task?.priority || "").trim().toLowerCase() === "high";

/**
 * What finishing a task is worth right now: `{ base, bonus, total }`.
 * The bonus only counts while the due date has not passed (`today` is "YYYY-MM-DD").
 */
export function taskPoints(task, today) {
  const base = isHigh(task) ? TASK_POINTS.high : TASK_POINTS.normal;
  const due = task?.dueDate || "";
  const bonus = due && today && today <= due ? TASK_POINTS.onTime : 0;
  return { base, bonus, total: base + bonus };
}

/**
 * Levels, by lifetime points. Purely for the profile: nothing is unlocked by them.
 * Change the numbers or the names here and every screen follows.
 */
export const LEVELS = [
  { at: 0,    name: "Starter" },
  { at: 250,  name: "Steady" },
  { at: 750,  name: "Reliable" },
  { at: 1500, name: "Expert" },
  { at: 3000, name: "Master" },
];

/**
 * Where a lifetime total puts someone:
 * `{ level, name, next, toNext, progress }`, `next` being null at the top level.
 */
export function levelFor(total) {
  const t = Math.max(0, Number(total) || 0);
  let i = 0;
  while (i + 1 < LEVELS.length && t >= LEVELS[i + 1].at) i += 1;
  const here = LEVELS[i];
  const next = LEVELS[i + 1] || null;
  return {
    level: i + 1,
    name: here.name,
    next: next ? next.name : null,
    toNext: next ? next.at - t : 0,
    progress: next ? (t - here.at) / (next.at - here.at) : 1,
  };
}

export const fmtPoints = (n) => (Number(n) || 0).toLocaleString("en-GB");

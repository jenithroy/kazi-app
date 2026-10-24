/**
 * How points are shown, for when they are switched on.
 *
 * POINTS ARE PAUSED (2026-10-22): no screen draws them and nothing awards them to anyone (the Leaderboard
 * page is only a preview). Tasks used to pay by priority (20, 30, +10 on time); that was taken out because a
 * priority is not a value and anyone could add small tasks to collect them. What will earn points has not
 * been decided yet (see DESIGN.md "Points"). The helpers below, `src/lib/points.js`, `hooks/usePoints.js`,
 * `components/PointsPanel.jsx` and the database functions of migration 0057 are what the real thing will use.
 */

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

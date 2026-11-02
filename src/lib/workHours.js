/**
 * The Leaderboard's numbers: everyone still Active ranked by the hours they were credited in a stretch of days. The ranking is
 * done by the database (migration 0064, `work_hours_leaderboard`) because it has to count everyone's clock-ins, which a person
 * cannot read for themselves. A person is credited the time between clocking in and out that falls inside THEIR OWN hours that
 * day (their weekday's hours, else their usual hours, else the memo's 10:00 to 18:00) plus overtime approved before they clocked
 * in, and nothing else: time beyond their hours or beyond an approval counts for nothing. A day marked by hand with no clock-in
 * counts as its hours, never more than their own.
 *
 * It only ever returns what the board shows. A database without the function yet reads as "not switched on".
 */
import { supabase } from "../supabase";

/** True when the error just means the leaderboard function has not been added yet. */
export function boardNotSetUp(err) {
  const text = String(err?.message || err || "");
  return /could not find the function|PGRST202|42883|does not exist|schema cache/i.test(text);
}

/** The board for the days from `from` to `to` (YYYY-MM-DD, both included): [{ rank, personId, name, minutes, overtime, days }], best first. */
export async function fetchBoard({ from, to, limit = 50 }) {
  const { data, error } = await supabase.rpc("work_hours_leaderboard", { p_from: from, p_to: to, p_limit: limit });
  if (error) throw error;
  return (data || []).map((r) => ({
    rank: Number(r.rank), personId: r.person_id, name: r.name, minutes: Number(r.minutes) || 0, overtime: Number(r.overtime_minutes) || 0, days: Number(r.days) || 0,
  }));
}

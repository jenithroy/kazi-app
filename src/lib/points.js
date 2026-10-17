/**
 * Reading points. They are only ever awarded by the database (migration 0057), so
 * this file only asks questions: how many do I have, who is ahead this week, what
 * did I earn lately.
 *
 * Every call fails quietly into "not available" when those functions are not on the
 * database yet, so the app can ship before the migration is run.
 */
import { supabase } from "../supabase";

/** True when the error just means the points functions have not been added yet. */
export function pointsNotSetUp(err) {
  const text = String(err?.message || err || "");
  return /could not find the function|does not exist|schema cache|PGRST202|42883/i.test(text);
}

/** { total, week, rankTotal, rankWeek, peopleTotal, peopleWeek }, or null if I am not a known person. */
export async function fetchMyPoints() {
  const { data, error } = await supabase.rpc("my_points");
  if (error) throw error;
  const r = Array.isArray(data) ? data[0] : data;
  if (!r) return null;
  return {
    total: r.total_points ?? 0,
    week: r.week_points ?? 0,
    rankTotal: r.rank_total ?? null,
    rankWeek: r.rank_week ?? null,
    peopleTotal: r.people_total ?? 0,
    peopleWeek: r.people_week ?? 0,
  };
}

/** The board: [{ rank, personId, name, points }], best first. `scope` is "week" or "all". */
export async function fetchLeaderboard(scope = "week", limit = 10) {
  const { data, error } = await supabase.rpc("points_leaderboard", { p_scope: scope, p_limit: limit });
  if (error) throw error;
  return (data || []).map((r) => ({ rank: r.rank, personId: r.person_id, name: r.name, points: r.points }));
}

/** My latest awards: [{ points, reason, eventType, awardedAt }], newest first. */
export async function fetchMyHistory(limit = 8) {
  const { data, error } = await supabase.rpc("my_point_history", { p_limit: limit });
  if (error) throw error;
  return (data || []).map((r) => ({ points: r.points, reason: r.reason, eventType: r.event_type, awardedAt: r.awarded_at }));
}

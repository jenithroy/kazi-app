import { supabase } from "../lib/db";

// Set to false to pause all point awards without removing the integration code
const REWARDS_ENABLED = false;

// ---------------------------------------------------------------------------
// Point values
// ---------------------------------------------------------------------------
export const POINT_VALUES = {
  task_completed:        20,
  task_completed_high:   30,  // high-priority task
  task_completed_early:  10,  // bonus — add on top of base value
  attendance_present:     5,  // on-time GPS clock-in
  order_stage_advanced:  15,
  order_delivered:       30,
  order_delivered_early: 20,  // bonus
  qc_batch_good:         10,  // ≥90% pass rate
  qc_batch_perfect:      25,  // 0 rejects
};

// ---------------------------------------------------------------------------
// resolveUidByName
// Looks up a user document where `name == name` and returns the uid field,
// or null if no matching user is found.
// ---------------------------------------------------------------------------
export async function resolveUidByName(name) {
  if (!name) return null;
  try {
    // Returns the person's id, not a sign-in uid — award_points() keys on the
    // `people` row, so someone keeps their points whichever provider they
    // signed in through.
    const { data, error } = await supabase
      .from("people").select("id").eq("full_name", name).maybeSingle();
    if (error) throw error;
    return data?.id || null;
  } catch (err) {
    console.error("resolveUidByName error:", err);
    return null;
  }
}

// The idempotency key ("person__event__source") is now built and enforced
// inside award_points() — see migration 0016 — so there is nothing to compose
// here any more.

// ---------------------------------------------------------------------------
// awardPoints
// Atomically awards points to a user, guarded by idempotency check.
// Returns the new totalPoints value, or null if already awarded.
// ---------------------------------------------------------------------------
export async function awardPoints({
  uid,
  displayName,
  eventType,
  sourceId,
  reason,
  bonusPoints = 0,
}) {
  if (!REWARDS_ENABLED) return null;
  if (!uid || !eventType || !sourceId) {
    console.error("awardPoints: uid, eventType, and sourceId are required.");
    return null;
  }

  const basePoints = POINT_VALUES[eventType] ?? 0;
  const totalAward = basePoints + bonusPoints;

  if (totalAward <= 0) {
    console.warn(`awardPoints: zero points for eventType "${eventType}" — skipping.`);
    return null;
  }

  try {
    // One call, one transaction. The database does the idempotency check, the
    // running totals and the leaderboard rebuild together — see migration 0016.
    // Doing it in steps from here would let two simultaneous awards read the
    // same total and one overwrite the other.
    const { data, error } = await supabase.rpc('award_points', {
      p_person_id:    uid,
      p_display_name: displayName || null,
      p_event_type:   eventType,
      p_source_id:    String(sourceId),
      p_points:       totalAward,
      p_reason:       reason || eventType,
    });
    if (error) throw error;
    return data; // null when already awarded, otherwise the new total
  } catch (err) {
    console.error('awardPoints failed:', err);
    throw err;
  }
}

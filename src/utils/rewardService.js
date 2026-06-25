import {
  collection,
  doc,
  getDocs,
  query,
  where,
  runTransaction,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

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
    const q = query(collection(db, "users"), where("name", "==", name));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const data = snap.docs[0].data();
    return data.uid || snap.docs[0].id || null;
  } catch (err) {
    console.error("resolveUidByName error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// _buildTransactionId
// Deterministic doc ID for idempotency: uid + eventType + sourceId
// ---------------------------------------------------------------------------
function _buildTransactionId(uid, eventType, sourceId) {
  return `${uid}__${eventType}__${sourceId}`;
}

// ---------------------------------------------------------------------------
// _updateLeaderboardArray
// Given an existing array entry list, increment the matching user's points,
// re-sort descending, re-assign ranks, and return the new array.
// Creates the user entry if it doesn't exist yet.
// ---------------------------------------------------------------------------
function _updateLeaderboardArray(arr, uid, displayName, delta) {
  const list = arr ? [...arr] : [];
  const idx = list.findIndex((e) => e.uid === uid);

  if (idx >= 0) {
    list[idx] = { ...list[idx], points: (list[idx].points || 0) + delta };
  } else {
    list.push({ uid, displayName, points: delta });
  }

  // Sort descending by points
  list.sort((a, b) => b.points - a.points);

  // Re-assign ranks (ties share the same rank)
  let rank = 1;
  for (let i = 0; i < list.length; i++) {
    if (i > 0 && list[i].points < list[i - 1].points) {
      rank = i + 1;
    }
    list[i] = { ...list[i], rank };
  }

  return list;
}

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

  const txId = _buildTransactionId(uid, eventType, sourceId);
  const txRef       = doc(db, "point_transactions", txId);
  const pointsRef   = doc(db, "user_points", uid);
  const leaderRef   = doc(db, "leaderboard", "current");

  try {
    const newTotal = await runTransaction(db, async (tx) => {
      // --- Idempotency guard ---
      const txSnap = await tx.get(txRef);
      if (txSnap.exists()) {
        return null; // already awarded
      }

      // --- Read current user_points doc (may not exist yet) ---
      const pointsSnap = await tx.get(pointsRef);
      const existing   = pointsSnap.exists() ? pointsSnap.data() : {};
      const newTotal   = (existing.totalPoints  || 0) + totalAward;
      const newWeekly  = (existing.weeklyPoints || 0) + totalAward;

      // --- Read current leaderboard doc (may not exist yet) ---
      const leaderSnap  = await tx.get(leaderRef);
      const leaderData  = leaderSnap.exists() ? leaderSnap.data() : {};
      const newAllTime  = _updateLeaderboardArray(leaderData.allTime,  uid, displayName, totalAward);
      const newWeeklyLb = _updateLeaderboardArray(leaderData.weekly,   uid, displayName, totalAward);

      // --- Write: user_points ---
      tx.set(pointsRef, {
        uid,
        displayName,
        totalPoints:  newTotal,
        weeklyPoints: newWeekly,
        lastUpdated:  serverTimestamp(),
      }, { merge: true });

      // --- Write: point_transactions (idempotency record) ---
      tx.set(txRef, {
        uid,
        displayName,
        eventType,
        sourceId,
        reason:      reason || eventType,
        basePoints,
        bonusPoints,
        totalAward,
        createdAt:   serverTimestamp(),
      });

      // --- Write: leaderboard/current ---
      tx.set(leaderRef, {
        allTime:     newAllTime,
        weekly:      newWeeklyLb,
        lastUpdated: serverTimestamp(),
      }, { merge: true });

      return newTotal;
    });

    return newTotal; // null if idempotency guard fired, otherwise new total
  } catch (err) {
    console.error("awardPoints transaction failed:", err);
    throw err;
  }
}

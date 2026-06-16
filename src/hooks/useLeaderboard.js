import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

/**
 * useLeaderboard
 *
 * Reads the `user_points` collection once on mount.
 * Each doc has: { totalPoints, weeklyPoints, displayName }
 * Returns:
 *   allTime  — [{uid, displayName, points, rank}, ...] sorted by totalPoints desc
 *   weekly   — [{uid, displayName, points, rank}, ...] sorted by weeklyPoints desc
 *   loading  — true until fetch resolves
 */
export function useLeaderboard() {
  const [allTime, setAllTime] = useState([]);
  const [weekly,  setWeekly]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const snap = await getDocs(collection(db, "user_points"));
        if (!active) return;
        const rows = snap.docs.map(d => ({ uid: d.id, ...d.data() }));

        const ranked = (sorted) =>
          sorted.map((entry, i) => ({ ...entry, rank: i + 1 }));

        setAllTime(ranked(
          [...rows].sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
        ));
        setWeekly(ranked(
          [...rows].sort((a, b) => (b.weeklyPoints || 0) - (a.weeklyPoints || 0))
        ));
      } catch (err) {
        console.error("useLeaderboard:", err);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  return { allTime, weekly, loading };
}

export default useLeaderboard;

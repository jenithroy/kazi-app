import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchHolidays, holidaysNotSetUp } from "../lib/holidays";

/**
 * The list of holidays, shared by everything that needs it (the Attendance page, the clock-in
 * circle, the dashboard's attendance tiles), so a holiday added on one screen is known to the
 * others without each asking again. `refreshHolidays()` is how a screen says "something just
 * changed". `status` is "idle" | "loading" | "ready" | "unavailable" (the database has not got the
 * table yet) | "error".
 */

const NONE = [];
const LOOK_AGAIN_MS = 60000;      // a screen opening, or the app coming back, looks again when the list is older than this
const KEEP_LOOKING_MS = 300000;   // and a screen that stays open checks this often, so a holiday added or removed mid-day reaches it
let state = { status: "idle", rows: NONE, error: "" };
let loadedFor = null;
let lastLook = 0;
let order = 0;                    // numbers each look, so a slow answer cannot put an older list over a newer one
const listeners = new Set();

function publish(next) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
}
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Ask again. Resolves to the new list, or null when there is none to show. */
export async function refreshHolidays() {
  const mine = ++order;
  lastLook = Date.now();
  if (state.status !== "ready") publish({ status: "loading", error: "" });
  try {
    const rows = await fetchHolidays();
    if (mine === order) publish({ status: "ready", rows, error: "" });
    return rows;
  } catch (err) {
    if (mine === order) {
      publish(holidaysNotSetUp(err)
        ? { status: "unavailable", rows: NONE, error: "" }
        : { status: state.rows.length ? "ready" : "error", error: err?.message || "Couldn't load the holidays." });
    }
    return null;
  }
}

/** Is it time to look again? (Not while the table is known to be missing: that would only repeat the same failure.) */
const due = () => state.status !== "unavailable" && Date.now() - lastLook > LOOK_AGAIN_MS;

export function useHolidays() {
  const { profile } = useAuth();
  const personId = profile?.personId || null;
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);

  useEffect(() => {
    if (!personId) {
      loadedFor = null;
      publish({ status: "idle", rows: NONE, error: "" });
      return;
    }
    if (loadedFor !== personId) {
      loadedFor = personId;
      publish({ status: "idle", rows: NONE, error: "" });
      refreshHolidays();
    } else if (due()) {
      refreshHolidays();       // a screen opening some time after the last look
    }
  }, [personId]);

  // A phone keeps the app open for days, and a holiday can be added or removed at any hour: look again when the app comes
  // back and every few minutes while it is open. (Every screen using the list adds these; the first to run refreshes and
  // the rest see that it just did. A look that failed is tried again the same way.)
  useEffect(() => {
    if (!personId) return undefined;
    const look = () => { if (!document.hidden && due()) refreshHolidays(); };
    const timer = setInterval(look, KEEP_LOOKING_MS);
    document.addEventListener("visibilitychange", look);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", look); };
  }, [personId]);

  return { ...snapshot, refresh: refreshHolidays };
}

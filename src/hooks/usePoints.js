import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchMyPoints, pointsNotSetUp } from "../lib/points";

/**
 * My points, shared by everything that shows them (the profile card, the Tasks page).
 *
 * One answer for the whole app, so finishing a task on one screen is reflected in the
 * other without each asking again; `refreshPoints()` is how a screen says "something
 * just changed". `status` is "idle" | "loading" | "ready" | "unavailable" (the
 * database has not got points yet, or I am not a known person) | "error".
 */

let state = { status: "idle", data: null, error: "" };
let loadedFor = null;
const listeners = new Set();

function publish(next) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
}
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export async function refreshPoints() {
  if (state.status !== "ready") publish({ status: "loading", error: "" });
  try {
    const data = await fetchMyPoints();
    publish(data ? { status: "ready", data, error: "" } : { status: "unavailable", data: null });
  } catch (err) {
    publish(pointsNotSetUp(err)
      ? { status: "unavailable", data: null, error: "" }
      : { status: state.data ? "ready" : "error", error: err?.message || "Couldn't load your points." });
  }
}

export function useMyPoints() {
  const { profile } = useAuth();
  const personId = profile?.personId || null;
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);

  useEffect(() => {
    if (!personId) {
      loadedFor = null;
      publish({ status: "idle", data: null, error: "" });
      return;
    }
    if (loadedFor !== personId) {
      loadedFor = personId;
      publish({ status: "idle", data: null, error: "" });
      refreshPoints();
    }
  }, [personId]);

  return { ...snapshot, refresh: refreshPoints };
}

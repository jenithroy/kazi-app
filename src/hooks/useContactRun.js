import { useSyncExternalStore } from "react";
import { getRun, subscribeRun } from "../lib/contactRun";

/** The Contact Finder's run (lib/contactRun.js): `{ phase, rows, notes, message, saved, … }`, re-drawn as it moves. It outlives the page that shows it. */
export default function useContactRun() {
  return useSyncExternalStore(subscribeRun, getRun, getRun);
}

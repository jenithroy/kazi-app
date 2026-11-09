import { useEffect, useState, useSyncExternalStore } from "react";
import { pingLocalFinder } from "../lib/localFinder";

/**
 * Whether this browser reads websites with the finder program on this computer (scripts/email-finder) when it can, instead of leaving it all
 * to the Worker. One choice for the Contact Finder's Sources, its by-hand website tab and every card that has the finder, remembered between visits.
 *
 *   const [local, setLocal] = useLocalFinder();
 *   const status = useLocalStatus(local);       // { checked, running, browser, search }: asked once when the choice is on, never when it is off
 *
 * The program is only ever asked when the choice is on: a browser asks the person for permission the first time a page reaches the program,
 * and nobody who never uses it should see that question.
 */

const KEY = "kazi.finderOnThisComputer";
const listeners = new Set();

function read() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
let current = read();

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function setLocalFinder(on) {
  const value = Boolean(on);
  if (value === current) return;
  current = value;
  try { if (value) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* a private window: it just isn't remembered */ }
  listeners.forEach((fn) => fn());
}

export default function useLocalFinder() {
  const local = useSyncExternalStore(subscribe, () => current, () => false);
  return [local, setLocalFinder];
}

/** { checked, running, browser, search } for the program on this computer (`search`: it is a version that can search), looked at once each time `on` turns on. */
export function useLocalStatus(on) {
  const [status, setStatus] = useState({ checked: false, running: false, browser: "", search: false });
  useEffect(() => {
    if (!on) { setStatus({ checked: false, running: false, browser: "", search: false }); return undefined; }
    let alive = true;
    pingLocalFinder().then((s) => { if (alive) setStatus({ checked: true, running: s.running, browser: s.browser || "", search: Boolean(s.search) }); });
    return () => { alive = false; };
  }, [on]);
  return status;
}

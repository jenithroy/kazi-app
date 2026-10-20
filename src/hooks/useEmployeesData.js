/**
 * Everything the Employees page reads: the people (the directory view) and the positions they can be given.
 *
 * `people` is in the realtime feed, but the feed carries only the rows the table's own row-level security lets the viewer read
 * (tier 2 and above, or their own row), which is not what the directory view shows everyone, so a page cannot rely on it. This
 * one looks again every minute while it is on screen and when the tab comes back; `reload()` is the page's own look after a
 * write. A failed look keeps what was on screen and says so; only the very first read has nothing to fall back on. A missing
 * list of positions is not fatal: the people still show (their position's name comes with them), only the dropdown that offers
 * positions is empty, and the page says so.
 *
 * Every look also hands the people to the attendance rules (constants.js keeps each person's hours by name for the lateness checks),
 * as the old page's loadData did.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAll } from "../lib/db";
import { setEmployeeScheduleOverrides } from "../constants";

const POLL_MS = 60000;
export const STALE = "Could not refresh just now. This is what was loaded last.";

const byName = (a, b) => (a.name || "").localeCompare(b.name || "");

export default function useEmployeesData() {
  const [rows, setRows] = useState([]);
  const [positions, setPositions] = useState([]);
  const [positionsFailed, setPositionsFailed] = useState(false);
  const [state, setState] = useState("loading");          // loading | ready | error
  const [stale, setStale] = useState("");
  const token = useRef(0);                                // every read takes one, so a slow answer cannot overwrite a newer one
  const applied = useRef(0);
  const ready = useRef(false);
  ready.current = state === "ready";

  const reload = useCallback(async () => {
    const mine = ++token.current;
    try {
      const [people, list] = await Promise.allSettled([fetchAll("employees"), fetchAll("positions")]);
      if (people.status === "rejected") throw people.reason;
      if (mine < applied.current) return;
      applied.current = mine;
      const sorted = people.value.slice().sort(byName);
      setEmployeeScheduleOverrides(sorted);
      setRows(sorted);
      if (list.status === "fulfilled") {
        setPositions(list.value);
        setPositionsFailed(false);
      } else {
        console.error("Failed to load positions:", list.reason);
        setPositionsFailed(true);
      }
      setStale("");
      setState("ready");
    } catch (err) {
      console.error("Failed to load employees:", err);
      if (mine < applied.current) return;
      if (ready.current) setStale(STALE);
      else setState("error");
    }
  }, []);

  // A read that is already under way began before a write the page now knows about, so whatever it brings back is older than what is
  // on screen: it is dropped (the same rule that drops a slow read when a newer one has been applied).
  const supersede = useCallback(() => { token.current += 1; applied.current = token.current; }, []);

  // What a write has just returned, put into the list at once (a new person is added to it): the page shows what is now true
  // without waiting for the next read, and still shows it if that read fails. The look-again that follows confirms it.
  const patch = useCallback((row) => {
    if (!row?.id) return;
    supersede();
    setEmployeeScheduleOverrides([row]);
    setRows((prev) => (prev.some((r) => r.id === row.id)
      ? prev.map((r) => (r.id === row.id ? { ...r, ...row } : r))
      : [...prev, row].sort(byName)));
  }, [supersede]);

  const drop = useCallback((id) => {
    supersede();
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, [supersede]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    // Only once it has loaded: a page showing "could not load" waits for Try again.
    const look = () => { if (!document.hidden && ready.current) reload(); };
    const id = setInterval(look, POLL_MS);
    document.addEventListener("visibilitychange", look);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", look); };
  }, [reload]);

  return { rows, positions, positionsFailed, state, stale, reload, patch, drop };
}

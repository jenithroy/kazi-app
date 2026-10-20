/**
 * Everything the content calendar page reads: the rows of `content_calendar`, as the database has them (the page turns them into
 * items with lib/contentCalendar.js `toItem`).
 *
 * Several people plan against this board at once, and the table is in the live feed (migration 0013), so the page follows it: a
 * change anyone makes asks for another look a moment later (one look for a burst of changes). It also looks again when the tab
 * comes back. A look that fails keeps what was on screen and says so; only the very first look has nothing to fall back on.
 *
 * No rows is a real answer. (The old page filled an empty board with five invented ideas, so a board could never be emptied.)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAll, subscribe } from "../lib/db";

export const STALE = "Could not refresh just now. This is what was loaded last.";
const LATER_MS = 600;

export default function useContentCalendar() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading");        // loading | ready | error
  const [stale, setStale] = useState(false);
  const seq = useRef(0);                                  // every look takes a number, so a slow answer cannot overwrite a newer one
  const applied = useRef(0);
  const ready = useRef(false);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const all = await fetchAll("content_calendar");
      if (mine < applied.current) return;
      applied.current = mine;
      ready.current = true;
      setRows(all);
      setStale(false);
      setStatus("ready");
    } catch (err) {
      console.error("Failed to load the content calendar:", err);
      if (mine < applied.current) return;
      if (ready.current) setStale(true);
      else setStatus("error");
    }
  }, []);

  /** What a write has just returned, put into the list at once (the look that follows confirms it). */
  const put = useCallback((row) => {
    if (!row?.id) return;
    setRows((prev) => (prev.some((r) => r.id === row.id) ? prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)) : [row, ...prev]));
  }, []);

  /** A change shown before the database has answered; `reload()` puts the truth back if the write failed. */
  const patch = useCallback((id, partial) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...partial } : r)));
  }, []);

  const drop = useCallback((id) => setRows((prev) => prev.filter((r) => r.id !== id)), []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = setTimeout(reload, LATER_MS); };
    const off = subscribe("content_calendar", later);
    const back = () => { if (!document.hidden && ready.current) later(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearTimeout(timer); off(); document.removeEventListener("visibilitychange", back); };
  }, [reload]);

  return { rows, status, stale, reload, put, patch, drop };
}

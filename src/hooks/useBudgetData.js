/**
 * Everything the Budget page reads: the requests, newest first (as the old page's `load()` had them).
 *
 * `budget_requests` is not in the live feed, so nobody else's change would ever reach an open page. It looks again
 * every minute while it is on screen and when the tab comes back; `reload()` is the page's own look after a write.
 * A failed look keeps what was on screen and says so; only the very first read has nothing to fall back on.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAll } from "../lib/db";
import { tsMillis } from "../utils/date";

const POLL_MS = 60000;
export const STALE = "Could not refresh just now. This is what was loaded last.";

export default function useBudgetData() {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");        // loading | ready | error
  const [stale, setStale] = useState("");
  const token = useRef(0);                              // every read takes one, so a slow answer cannot overwrite a newer one
  const applied = useRef(0);
  const ready = useRef(false);
  ready.current = state === "ready";

  const reload = useCallback(async () => {
    const mine = ++token.current;
    try {
      const all = await fetchAll("budget_requests");
      if (mine < applied.current) return;
      applied.current = mine;
      setRows(all.slice().sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt)));
      setStale("");
      setState("ready");
    } catch (err) {
      console.error("Failed to load budget requests:", err);
      if (mine < applied.current) return;
      if (ready.current) setStale(STALE);
      else setState("error");
    }
  }, []);

  // What a write has just returned, put into the list at once: the page shows what is now true without waiting for the next
  // read (and still shows it if that read fails). The look-again that follows confirms it.
  const patch = useCallback((row) => {
    if (!row?.id) return;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    // Only once it has loaded: a page showing "could not load" waits for Try again.
    const look = () => { if (!document.hidden && ready.current) reload(); };
    const id = setInterval(look, POLL_MS);
    document.addEventListener("visibilitychange", look);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", look); };
  }, [reload]);

  return { rows, state, stale, reload, patch };
}

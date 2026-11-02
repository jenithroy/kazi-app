/**
 * The Leaderboard's rows for a stretch of days (lib/workHours.js). `status` is "loading" | "ready" | "unavailable" (the database does
 * not have the function yet) | "error". It looks again every couple of minutes while the page is on screen and when the app comes
 * back, since people clock out all day; a look that fails keeps the rows it had.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { boardNotSetUp, fetchBoard } from "../lib/workHours";

const LOOK_AGAIN_MS = 120000;

export default function useWorkHours({ from, to }) {
  const [state, setState] = useState({ status: "loading", rows: [], key: "", error: "" });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const key = `${from}|${to}`;
    try {
      const rows = await fetchBoard({ from, to });
      if (mine === seq.current) setState({ status: "ready", rows, key, error: "" });
    } catch (err) {
      console.error("Leaderboard: could not read the hours:", err);
      if (mine !== seq.current) return;
      setState((s) => (boardNotSetUp(err)
        ? { status: "unavailable", rows: [], key, error: "" }
        : { status: s.key === key && s.rows.length ? "ready" : "error", rows: s.key === key ? s.rows : [], key, error: "Could not read the hours just now." }));
    }
  }, [from, to]);

  useEffect(() => {
    setState((s) => (s.key === `${from}|${to}` ? s : { status: "loading", rows: [], key: "", error: "" }));
    load();
  }, [load, from, to]);

  useEffect(() => {
    const look = () => { if (!document.hidden) load(); };
    const id = setInterval(look, LOOK_AGAIN_MS);
    document.addEventListener("visibilitychange", look);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", look); };
  }, [load]);

  return { ...state, reload: load };
}

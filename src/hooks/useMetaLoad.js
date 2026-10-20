/**
 * Runs one read for a Meta Ads view and says where it stands.
 *
 *   const { data, status, error, stale, refreshing, reload } = useMetaLoad(() => fetchSomething(range), `${range.dateFrom}|${range.dateTo}|${tick}`, `${range.dateFrom}|${range.dateTo}`);
 *
 * `status` is "loading" until the first answer, then "ready", or "error" when the first look failed. `key` is what the read depends on: it
 * looks again when the key changes, and `reload()` looks again by hand. A look that fails after a good one keeps what is on screen
 * (`stale` is set and `error` says why); a look that was overtaken by a newer one is dropped, so a slow answer cannot overwrite a fresh
 * one. While a later look is on its way `refreshing` is true and `data` is still the last answer.
 *
 * `subject` is what the answer is ABOUT (the date range, say), as opposed to `key`, which also changes when the same thing is simply read
 * again (after a sync). An answer about another subject is never handed back: while the new one loads `data` is empty and `status` is
 * "loading", and if that look fails `status` is "error". Without it, pressing "All" kept showing the last 30 days' spend under an "all
 * time" label until the answer came, and for good if the look failed. A key change with the same subject keeps the last answer on screen.
 *
 * The loader may throw to say the whole read failed; one that wants to survive a partial failure catches its own parts and returns what it
 * has (with a list of what it lost, say).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export default function useMetaLoad(loader, key = "", subject = "") {
  const [state, setState] = useState({ data: null, about: subject, status: "loading", error: "", stale: false, refreshing: false });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const subjectRef = useRef(subject);
  subjectRef.current = subject;
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    const about = subjectRef.current;
    setState((s) => (s.status === "ready" && s.about === about ? { ...s, refreshing: true } : s));
    try {
      const data = await loaderRef.current();
      if (mine !== seq.current) return;
      setState({ data, about, status: "ready", error: "", stale: false, refreshing: false });
    } catch (err) {
      console.error("Meta Ads: could not load:", err);
      if (mine !== seq.current) return;
      const message = err?.message || "Couldn't load this.";
      setState((s) => (s.status === "ready" && s.about === about
        ? { ...s, error: message, stale: true, refreshing: false }
        : { data: null, about, status: "error", error: message, stale: false, refreshing: false }));
    }
  }, []);

  useEffect(() => { reload(); }, [reload, key]);

  // what was read for another subject is not this one's answer, whatever it says
  if (state.about !== subject) return { data: null, status: "loading", error: "", stale: false, refreshing: false, reload };
  const { about, ...shown } = state;
  return { ...shown, reload };
}

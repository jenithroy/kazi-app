/**
 * What the person card reads, one hook per panel. Each one answers for the person it was asked about and no other: the card can be
 * switched to someone else while it is open (a "Reports to" link), and an answer for the first person must never be drawn
 * under the second one's name. A read that fails is a status the panel can say, never a blank that looks like "nothing there".
 *
 *   usePersonRow       the directory row (name, position, hours; phone, pay and join date only where the view lets them through)
 *   usePersonDays      their attendance and clock-in rows for a stretch of days (today, or a month), looked at again every minute
 *                      while the stretch includes today
 *   usePersonPoints    their place on the weekly and all-time boards
 *   usePersonPay       their payroll records
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAll, fetchOne } from "../lib/db";
import { fetchLeaderboard, pointsNotSetUp } from "../lib/points";
import { pointsOf } from "../lib/personProfile";
import { payrollOf } from "../lib/personPay";

const NONE = Object.freeze([]);
const LOOK_AGAIN_MS = 60000;

/* ── The directory row ─────────────────────────────────────────── */

export function usePersonRow(personId) {
  const [state, setState] = useState({ id: null, status: "loading", row: null, manager: null, error: "" });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setState({ id: personId, status: "loading", row: null, manager: null, error: "" });
    try {
      const row = await fetchOne("employees", personId);
      if (!row) throw new Error("This person isn't in the staff directory any more.");
      let manager = null;
      if (row.reportsTo) {
        // a name is a nicety; never fail the whole card over it
        try {
          const m = await fetchOne("employees", row.reportsTo);
          manager = m ? { id: String(m.id), name: m.name } : null;
        } catch { /* leave it blank */ }
      }
      if (mine === seq.current) setState({ id: personId, status: "ready", row, manager, error: "" });
    } catch (err) {
      if (mine === seq.current) setState({ id: personId, status: "error", row: null, manager: null, error: err?.message || "Couldn't load this profile." });
    }
  }, [personId]);

  useEffect(() => { load(); return () => { seq.current += 1; }; }, [load]);

  const mine = state.id === personId;
  return {
    status: mine ? state.status : "loading",
    row: mine ? state.row : null,
    manager: mine ? state.manager : null,
    error: mine ? state.error : "",
    reload: load,
  };
}

/* ── Attendance and clock-ins for a stretch of days ────────────── */

/**
 * `from` and `to` are "YYYY-MM-DD" (a month, or today alone). `poll` looks again every minute while the page is in front, for a
 * stretch that includes today (attendance is not in the live feed). `enabled` false asks nothing: the viewer may not read these rows.
 */
export function usePersonDays(personId, { enabled = true, from, to, poll = false }) {
  const key = `${personId}|${from}|${to}`;
  const [state, setState] = useState({ key: "", status: "idle", records: NONE, clocks: NONE, error: "" });
  const seq = useRef(0);

  const load = useCallback(async ({ quiet = false } = {}) => {
    const mine = ++seq.current;
    if (!quiet) setState({ key, status: "loading", records: NONE, clocks: NONE, error: "" });
    try {
      const filters = [
        { field: "person_id", value: personId },
        { field: "date", op: "gte", value: from },
        { field: "date", op: "lte", value: to },
      ];
      const [records, clocks] = await Promise.all([fetchAll("attendance", { filters }), fetchAll("clock_ins", { filters })]);
      if (mine !== seq.current) return;
      setState({ key, status: "ready", records, clocks, error: "" });
    } catch (err) {
      if (mine !== seq.current) return;
      // a quiet look that fails keeps what is on screen and says so; a first look that fails is an error
      setState((s) => (quiet && s.key === key && s.status === "ready"
        ? { ...s, error: "Couldn't refresh just now. This is what was loaded last." }
        : { key, status: "error", records: NONE, clocks: NONE, error: err?.message || "Couldn't load attendance." }));
    }
  }, [key, personId, from, to]);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    return () => { seq.current += 1; };
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled || !poll) return undefined;
    const look = () => { if (!document.hidden) load({ quiet: true }); };
    const timer = setInterval(look, LOOK_AGAIN_MS);
    document.addEventListener("visibilitychange", look);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", look); };
  }, [enabled, poll, load]);

  const mine = state.key === key;
  return {
    status: mine ? state.status : enabled ? "loading" : "idle",
    records: mine && state.status === "ready" ? state.records : NONE,
    clocks: mine && state.status === "ready" ? state.clocks : NONE,
    error: mine ? state.error : "",
    reload: () => load(),
  };
}

/* ── Points ────────────────────────────────────────────────────── */

// The two boards are the same for everybody, so cards opened one after another share one look.
let boardLook = { at: 0, promise: null };
const BOARD_KEEP_MS = 20000;
function boards() {
  if (boardLook.promise && Date.now() - boardLook.at < BOARD_KEEP_MS) return boardLook.promise;
  const promise = Promise.all([fetchLeaderboard("week", 1000), fetchLeaderboard("all", 1000)]).then(([week, all]) => ({ week, all }));
  boardLook = { at: Date.now(), promise };
  promise.catch(() => { if (boardLook.promise === promise) boardLook = { at: 0, promise: null }; });
  return promise;
}

/** status: "loading" | "ready" | "unavailable" (the database has no points yet) | "error" */
export function usePersonPoints(personId) {
  const [state, setState] = useState({ id: null, status: "loading", data: null });
  const seq = useRef(0);

  const load = useCallback(() => {
    const mine = ++seq.current;
    setState({ id: personId, status: "loading", data: null });
    boards().then(
      (b) => { if (mine === seq.current) setState({ id: personId, status: "ready", data: pointsOf(b, personId) }); },
      (err) => { if (mine === seq.current) setState({ id: personId, status: pointsNotSetUp(err) ? "unavailable" : "error", data: null }); },
    );
  }, [personId]);

  useEffect(() => { load(); return () => { seq.current += 1; }; }, [load]);

  const mine = state.id === personId;
  return { status: mine ? state.status : "loading", data: mine ? state.data : null, reload: load };
}

/* ── Pay ───────────────────────────────────────────────────────── */

export function usePersonPay(personId, { enabled = true } = {}) {
  const [state, setState] = useState({ id: null, status: "idle", rows: NONE, error: "" });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setState({ id: personId, status: "loading", rows: NONE, error: "" });
    try {
      const rows = await fetchAll("finance_payroll", { filters: [{ field: "person_id", value: personId }] });
      if (mine === seq.current) setState({ id: personId, status: "ready", rows: payrollOf(rows, personId), error: "" });
    } catch (err) {
      if (mine === seq.current) setState({ id: personId, status: "error", rows: NONE, error: err?.message || "Couldn't load the pay records." });
    }
  }, [personId]);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    return () => { seq.current += 1; };
  }, [enabled, load]);

  const mine = state.id === personId;
  return {
    status: mine ? state.status : enabled ? "loading" : "idle",
    rows: mine ? state.rows : NONE,
    error: mine ? state.error : "",
    reload: load,
  };
}

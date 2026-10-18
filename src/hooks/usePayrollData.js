/**
 * What the Payroll page reads: the payroll records and the people they can be entered for. A position that may not see payroll gets
 * nothing back from the database (the same row-level policies run on every query), so this does not ask unless the page says it may.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAll } from "../lib/db";

export default function usePayrollData({ enabled = true } = {}) {
  const [payroll, setPayroll] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [status, setStatus] = useState("loading");        // loading | ready | error
  const [failed, setFailed] = useState([]);
  const seq = useRef(0);

  // A list that cannot be read this time is simply left as it was (an open card keeps its row, and what was typed in it).
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    if (!enabled) { setStatus("ready"); return; }
    const names = ["finance_payroll", "employees"];
    const settled = await Promise.allSettled(names.map((n) => fetchAll(n)));
    if (mine !== seq.current) return;
    const lost = [];
    settled.forEach((r, i) => { if (r.status !== "fulfilled") { lost.push(names[i]); console.error(`Payroll: failed to load ${names[i]}:`, r.reason); } });
    if (lost.length === names.length) { setFailed(lost); setStatus((s) => (s === "ready" ? "ready" : "error")); return; }
    if (settled[0].status === "fulfilled") setPayroll(settled[0].value);
    if (settled[1].status === "fulfilled") setEmployees([...settled[1].value].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    setFailed(lost);
    setStatus("ready");
  }, [enabled]);

  useEffect(() => { reload().catch((err) => { console.error(err); setStatus((s) => (s === "ready" ? s : "error")); }); }, [reload]);

  useEffect(() => {
    let timer = 0;
    const back = () => { if (document.hidden) return; clearTimeout(timer); timer = setTimeout(() => reload().catch(console.error), 600); };
    document.addEventListener("visibilitychange", back);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", back); };
  }, [reload]);

  return { payroll, employees, status, failed, reload };
}

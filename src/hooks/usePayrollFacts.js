/**
 * What the attendance says about one person's month, for the payroll card: late days and cuts (the old rule), unapproved absences
 * (the new one) and the overtime that counted (lib/payrollFacts.js). It looks again a moment after the person, month or year changes
 * instead of on every keystroke.
 *
 * `facts.records` is how many attendance rows were read; with a salary and none, `warning` says so, since a person nobody can read
 * attendance for looks exactly like a month with nobody late.
 */
import { useEffect, useState } from "react";
import { loadMonthFacts } from "../lib/payrollFacts";
import { NO_FACTS } from "../lib/payrollMath";

const IDLE = { loading: false, ready: false, facts: NO_FACTS, overtimeReady: true, error: "" };

export default function usePayrollFacts({ personId, month, year }) {
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    if (!personId || !month || !year) { setState(IDLE); return undefined; }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    const timer = setTimeout(async () => {
      try {
        const res = await loadMonthFacts({ month, year, personId });
        if (live) setState({ loading: false, ready: true, facts: res.byPerson.get(personId) || NO_FACTS, overtimeReady: res.overtimeReady, error: "" });
      } catch (err) {
        console.error("Error reading the month's attendance:", err);
        if (live) setState((s) => ({ ...s, loading: false, error: "Could not read the attendance just now." }));
      }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [personId, month, year]);

  return state;
}

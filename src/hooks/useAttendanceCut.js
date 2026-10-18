/**
 * What the attendance says about one person's month: how many days they were late, how many of those cost them a quarter day's pay
 * (a clock-in 15 minutes or more late), and so what that cut comes to on their basic salary. The old Payroll form worked this out
 * every time the person, month, year or basic changed; so does this, a moment after the last keystroke instead of on every one.
 *
 * Attendance rows are matched to the person by name, as they always were; when a month has no rows for that name and there is a salary,
 * it says so, since a mismatched name looks exactly like a month with nobody late.
 */
import { useEffect, useState } from "react";
import { fetchAll } from "../lib/db";
import { MONTHS } from "../lib/finance";

const IDLE = { loading: false, ready: false, lateDays: 0, lateCutsCount: 0, cut: 0, warning: "" };

export default function useAttendanceCut({ staffName, month, year, basic }) {
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    if (!staffName || !month || !year) { setState(IDLE); return undefined; }
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    const timer = setTimeout(async () => {
      try {
        const monthIdx = MONTHS.indexOf(month);
        if (monthIdx < 0) { if (live) setState(IDLE); return; }
        const mm = String(monthIdx + 1).padStart(2, "0");
        const daysInMonth = new Date(Number(year), monthIdx + 1, 0).getDate();
        const rows = await fetchAll("attendance", { filters: [
          { field: "date", op: "gte", value: `${year}-${mm}-01` },
          { field: "date", op: "lte", value: `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}` },
        ] });
        if (!live) return;
        const logs = rows.filter((r) => r.staffName?.toLowerCase() === staffName.toLowerCase());
        const lateDays = logs.filter((r) => r.status === "Late").length;
        const lateCutsCount = logs.filter((r) => r.status === "Late" && r.lateCutApplied === true).length;
        const dailySalary = Number(basic || 0) / 30;
        const cut = Math.round(dailySalary * 0.25 * lateCutsCount);
        const warning = logs.length === 0 && Number(basic || 0) > 0
          ? `No attendance records found for ${staffName} in ${month}. Check that the name matches the attendance records exactly.`
          : "";
        setState({ loading: false, ready: true, lateDays, lateCutsCount, cut, warning });
      } catch (err) {
        console.error("Error auto-calculating deductions:", err);
        if (live) setState((s) => ({ ...s, loading: false }));
      }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [staffName, month, year, basic]);

  return state;
}

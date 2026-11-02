/**
 * What the person card's Pay panel reads off payroll records, kept apart from lib/personProfile.js because it pulls in the payroll
 * sums (and through them the finance maths), which the profile card in the top bar should not carry in the main script.
 */
import { sortPayroll } from "./payroll";

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** A person's payroll records, newest month first. (The read already asked for this person; this is the belt to that brace.) */
export const payrollOf = (rows, personId) => sortPayroll(rows.filter((r) => sameId(r.person_id, personId)));

/**
 * What the salary slip starts with for a payroll record. The Payroll page uses this too, so a slip opened from a person's card is the
 * slip opened from the Payroll page, and the same values are what the monthly run prints.
 */
export const slipOf = (r) => ({
  empName: r.staffName, designation: r.role, month: r.month, year: r.year,
  // somebody's own number on their slip (the last four of their id, as the card's "Pick someone" makes it), not the placeholder EMP-001
  ...(r.person_id ? { empId: `EMP-${String(r.person_id).slice(-4).toUpperCase()}` } : {}),
  basicNPR: r.basicNPR, bonusNPR: r.bonusNPR, lateDeductionNPR: r.lateDeductionNPR, pfDeductionNPR: r.pfDeductionNPR,
  // A record made by the monthly run keeps its overtime, receivable due, advance and TDS (and the rate), and the slip prints them as
  // they are. A record from before that carries no rate: its slip works the tax out as it always did.
  ...(r.tdsRatePct != null
    ? { otSalary: r.overtimeNPR, receivableDue: r.receivableDueNPR, advance: r.advanceNPR, taxRatePct: r.tdsRatePct, incomeTax: r.tdsNPR }
    : {}),
});

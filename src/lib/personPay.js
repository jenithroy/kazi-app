/**
 * What the person card's Pay panel reads off payroll records, kept apart from lib/personProfile.js because it pulls in the payroll
 * sums (and through them the finance maths), which the profile card in the top bar should not carry in the main script.
 */
import { sortPayroll } from "./payroll";

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** A person's payroll records, newest month first. (The read already asked for this person; this is the belt to that brace.) */
export const payrollOf = (rows, personId) => sortPayroll(rows.filter((r) => sameId(r.person_id, personId)));

/**
 * What the salary slip starts with for a payroll record: the same values the Payroll page hands it (pages/Payroll.jsx `slipOf`),
 * so a slip opened from a person's card is the slip opened from the Payroll page.
 */
export const slipOf = (r) => ({
  empName: r.staffName, designation: r.role, month: r.month, year: r.year,
  basicNPR: r.basicNPR, bonusNPR: r.bonusNPR, lateDeductionNPR: r.lateDeductionNPR, pfDeductionNPR: r.pfDeductionNPR,
});

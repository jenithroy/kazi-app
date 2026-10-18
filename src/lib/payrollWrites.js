/**
 * Saving and deleting a payroll record: the old Payroll tab's handlers moved here with the same payload, the same figures and the
 * same order, and (like the other finance writes) checked by reading the row back, since row-level security drops a refused write
 * without an error.
 */
import { insertRow } from "./db";
import { calcPayroll } from "./finance";
import { fail, removeChecked, updateChecked } from "./financeWrites";

export const emptyPayroll = (now = new Date()) => ({
  staffName: "", role: "",
  month: now.toLocaleString("en-US", { month: "long" }),
  year: now.getFullYear(),
  basicNPR: "", bonusNPR: "", pfDeductionNPR: "", lateAdjustmentNPR: 0, note: "",
});

export async function savePayroll({ id, form, late, profile }) {
  try {
    // `late` is what the attendance gives for this person and month: { lateDays, lateCutsCount, cut }
    const calc = calcPayroll({ ...form, lateSalaryCutDeduction: late.cut });
    const data = {
      staffName: form.staffName, role: form.role,
      month: form.month, year: Number(form.year),
      basicNPR: Number(form.basicNPR || 0),
      lateDays: Number(late.lateDays || 0),
      lateSalaryCutDeduction: Number(late.cut || 0),
      lateCutsCount: Number(late.lateCutsCount || 0),
      lateAdjustmentNPR: Number(form.lateAdjustmentNPR || 0),
      lateDeductionNPR: calc.late,
      pfDeductionNPR: calc.pf,
      bonusNPR: Number(form.bonusNPR || 0),
      grossNPR: calc.gross,
      totalDeductionsNPR: calc.totalDeductions,
      netNPR: calc.net,
      note: form.note,
      loggedBy: profile?.name || "Unknown",
    };
    if (id) await updateChecked("finance_payroll", id, data);
    else await insertRow("finance_payroll", data);
    return { ok: true };
  } catch (err) {
    console.error("Failed to save the payroll record:", err);
    return fail(err, "Not saved. Check your connection and try again.");
  }
}

export async function removePayroll(id) {
  try { await removeChecked("finance_payroll", id); return { ok: true }; }
  catch (err) { console.error(err); return fail(err, "Could not delete. Try again."); }
}

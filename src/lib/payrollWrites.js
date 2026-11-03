/**
 * Saving and deleting a payroll record, one at a time (the card) or a whole month at once (the run). The payloads are the old
 * tab's with the pay lines the monthly run keeps added (overtime, receivable due, advance, TDS and its rate, the absences counted),
 * and (like the other finance writes) checked by reading the row back, since row-level security drops a refused write without an error.
 *
 * The new lines are columns added by migration 0064. Until it has been run, a record with none of them in it still saves the old way,
 * and one that has them says so rather than losing them.
 */
import { insertRow } from "./db";
import { fail, removeChecked, updateChecked } from "./financeWrites";
import { BONUS_REASON_MAX, DEFAULT_TDS_PCT } from "./workRules";

export const emptyPayroll = (now = new Date()) => ({
  staffName: "", role: "", personId: "",
  month: now.toLocaleString("en-US", { month: "long" }),
  year: now.getFullYear(),
  basicNPR: "", bonusNPR: "", bonusReason: "", pfDeductionNPR: "", receivableDueNPR: "", advanceNPR: "", tdsRatePct: String(DEFAULT_TDS_PCT),
  leaveDays: "", lateAdjustmentNPR: 0, note: "",
});

/** The columns migrations 0064 and 0066 add. */
const NEW_LINES = ["receivableDueNPR", "advanceNPR", "tdsNPR", "tdsRatePct", "unapprovedAbsences", "overtimeMinutes", "bonusReason", "leaveDays"];

/** Whether a new line holds anything: a rate when there is one, a label when there is text, else any amount but nothing. */
const filledLine = (k, v) => (k === "tdsRatePct" ? v != null : k === "bonusReason" ? Boolean(v) : Number(v) !== 0);

const columnMissing = (err) => /could not find the .* column|PGRST204|column .* does not exist/i.test(String(err?.message || err || ""));

/**
 * One record as the table stores it. `line` is the maths (lib/payrollMath.js `payLine`), `facts` what the month's attendance gave
 * (lib/payrollFacts.js), `form` the person, month and note. `person_id` is only sent when it is known, so saving a record never
 * clears the person it already belongs to.
 */
export function payrollData({ form, line, facts, personId, profile }) {
  const data = {
    staffName: form.staffName, role: form.role,
    month: form.month, year: Number(form.year),
    basicNPR: line.basic,
    lateDays: Number(facts?.lateDays || 0),
    lateCutsCount: line.rules === "new" ? 0 : line.counts.cuts,                  // the counts USED (the accountant may have typed others over the attendance's)
    leaveDays: line.counts.leaveDays,
    lateDeductionNPR: line.late,
    pfDeductionNPR: line.pf,
    bonusNPR: line.bonus,
    bonusReason: line.bonus > 0 ? String(form.bonusReason || "").trim().slice(0, BONUS_REASON_MAX) : "",     // what it was for, kept only with a bonus
    overtimeNPR: line.overtime,
    receivableDueNPR: line.receivable,
    advanceNPR: line.advance,
    tdsNPR: line.tds,
    tdsRatePct: line.tdsRatePct,
    unapprovedAbsences: line.rules === "old" ? 0 : line.counts.absences,
    overtimeMinutes: Number(line.overtimeMinutes || 0),
    grossNPR: line.gross,
    totalDeductionsNPR: line.totalDeductions,
    netNPR: line.net,
    note: form.note || "",
    loggedBy: profile?.name || "Unknown",
  };
  if (personId) data.person_id = personId;
  return data;
}

async function write(id, data) {
  try {
    return id ? await updateChecked("finance_payroll", id, data) : await insertRow("finance_payroll", data);
  } catch (err) {
    if (!columnMissing(err)) throw err;
    // The database has not had migration 0064 yet.
    if (NEW_LINES.some((k) => filledLine(k, data[k]))) {
      throw new Error("Not saved. Payroll now keeps overtime, receivable due, advance, TDS, leave days and what a bonus was for, which needs migrations 0064 and 0066 on the database.");
    }
    const old = Object.fromEntries(Object.entries(data).filter(([k]) => !NEW_LINES.includes(k)));
    return id ? updateChecked("finance_payroll", id, old) : insertRow("finance_payroll", old);
  }
}

export async function savePayroll({ id, form, line, facts, personId, profile }) {
  try {
    await write(id, payrollData({ form, line, facts, personId: personId || form.personId, profile }));
    return { ok: true };
  } catch (err) {
    console.error("Failed to save the payroll record:", err);
    return fail(err, "Not saved. Check your connection and try again.");
  }
}

/**
 * Save a month: one record per entry ({ id, form, line, facts, personId }), changing the one that exists (`id`) or adding it, a
 * person at a time so one refused record does not hide the rest. Resolves to { ok, saved, failed: [{ name, message }], ids }, `ids`
 * being the record each person's line was saved as (person id -> record id), so a second save can change it even before the page's
 * list has caught up.
 */
export async function savePayrollRun({ entries, profile }) {
  let saved = 0;
  const failed = [];
  const ids = {};
  for (const e of entries) {
    try {
      const row = await write(e.id || null, payrollData({ form: e.form, line: e.line, facts: e.facts, personId: e.personId, profile }));
      if (e.personId && row?.id) ids[e.personId] = row.id;
      saved += 1;
    } catch (err) {
      console.error(`Failed to save ${e.form.staffName}'s payroll:`, err);
      failed.push({ name: e.form.staffName, message: fail(err, "Not saved.").message });
    }
  }
  return { ok: failed.length === 0, saved, failed, ids };
}

export async function removePayroll(id) {
  try { await removeChecked("finance_payroll", id); return { ok: true }; }
  catch (err) { console.error(err); return fail(err, "Could not delete. Try again."); }
}

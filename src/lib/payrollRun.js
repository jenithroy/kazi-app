/**
 * The monthly payroll run's logic, free of React: who a month's rows are, what each row starts with (a record already made for that
 * person and month, else the defaults), the figures of every row (lib/payrollMath.js), and the slip each one prints.
 *
 * A person is a row when they are not inactive and have a basic salary on their profile. A record made earlier for the same month is
 * the row's starting point, so running a month again does not lose what was typed the first time; the deduction is always worked out
 * afresh from the attendance (or the counts typed over it, which a saved record keeps), and the difference from what was stored is kept
 * as the row's adjustment, as the payroll card does.
 *
 * TDS: a row's rate starts at the rate that person was last taxed at (so an exemption is typed once, not every month), else 1%.
 * A blank rate on a run row means 0, never "the old default", so the slip prints exactly what the row says.
 */
import { MONTHS } from "./finance";
import { NO_FACTS, attendanceDeduction, bonusAmount, leaveAmountOf, payLine, round2 } from "./payrollMath";
import { periodKey } from "./payroll";
import { slipOf } from "./personPay";
import { slipView } from "./salarySlip";
import { DEFAULT_TDS_PCT, rulesOfMonth } from "./workRules";

const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const mine = (r, e) => (r.person_id ? String(r.person_id) === String(e.id) : same(r.staffName, e.name));
const text = (v) => (Number(v) ? String(Number(v)) : "");

/** The people a month is run for: still here, and with a basic salary to run it on. */
export const runPeople = (employees) => employees.filter((e) => e.status !== "Inactive" && Number(e.basicSalaryNPR) > 0).sort((a, b) => (a.name || "").localeCompare(b.name || ""));

/** The people who are left out of a run because their profile has no basic salary. */
export const runSkipped = (employees) => employees.filter((e) => e.status !== "Inactive" && !(Number(e.basicSalaryNPR) > 0)).map((e) => e.name).filter(Boolean);

/** The record already made for this person and month, or null. */
export const recordOf = (payroll, e, month, year) => payroll.find((r) => r.month === month && Number(r.year) === Number(year) && mine(r, e)) || null;

/** The rate this person was last taxed at (their latest record that kept one), else the default. */
export function lastRate(payroll, e) {
  const had = payroll.filter((r) => r.tdsRatePct != null && mine(r, e)).sort((a, b) => periodKey(b).localeCompare(periodKey(a)));
  return had.length ? String(Number(had[0].tdsRatePct)) : String(DEFAULT_TDS_PCT);
}

/**
 * What each person's typed fields start with, by person id: { bonus, bonusReason (what it was for), receivable, advance, other, tdsRate,
 * cuts, absences, leaveAmount, adjustment }. `cuts` and `absences` are blank (use what the attendance says) unless a saved record used a
 * different count, which stays typed; `leaveAmount` is what the record kept (the leave amount is typed, never read from the attendance).
 */
export function seedManual({ people, payroll, byPerson, month, year }) {
  const rules = rulesOfMonth(Number(year), MONTHS.indexOf(month));
  const out = {};
  for (const e of people) {
    const rec = recordOf(payroll, e, month, year);
    const f = byPerson.get(e.id) || NO_FACTS;
    const kept = (stored, fromAttendance) => (rec && stored != null && Number(stored) !== Number(fromAttendance) ? String(Number(stored)) : "");
    const typed = {
      cuts: rules !== "new" ? kept(rec?.lateCutsCount, f.cuts) : "",              // the old rule's count: old months and the days before the switch
      absences: rules !== "old" ? kept(rec?.unapprovedAbsences, f.absences) : "",   // the new rule's count: new months and the days from the switch
      leaveAmount: text(leaveAmountOf(rec)),
    };
    const auto = attendanceDeduction(rules, {
      cuts: typed.cuts === "" ? f.cuts : Number(typed.cuts),
      absences: typed.absences === "" ? f.absences : Number(typed.absences),
      leaveAmount: Number(typed.leaveAmount) || 0,
    }, e.basicSalaryNPR).amount;
    out[e.id] = {
      bonus: text(rec?.bonusNPR),
      bonusReason: rec?.bonusReason || "",
      receivable: text(rec?.receivableDueNPR),
      advance: text(rec?.advanceNPR),
      other: text(rec?.pfDeductionNPR),
      tdsRate: rec && rec.tdsRatePct != null ? String(Number(rec.tdsRatePct)) : lastRate(payroll, e),
      ...typed,
      adjustment: rec ? text(round2(Number(rec.lateDeductionNPR || 0) - auto)) : "",
    };
  }
  return out;
}

/** Every row of the run: { e (the person), f (their attendance facts), rec (the record already made, or null), line (the figures), manual (what is typed) }. */
export function runRows({ people, payroll, byPerson, manual, month, year }) {
  const rules = rulesOfMonth(Number(year), MONTHS.indexOf(month));
  return people.map((e) => {
    const f = byPerson.get(e.id) || NO_FACTS;
    const m = manual[e.id] || {};
    const line = payLine({ basic: e.basicSalaryNPR, rules, facts: f, manual: { ...m, tdsRate: m.tdsRate === "" || m.tdsRate == null ? "0" : m.tdsRate } });
    return { e, f, rec: recordOf(payroll, e, month, year), line, manual: m };
  });
}

/**
 * A bonus given to everyone, for each person by person id, as the text a field holds: `basis` "percent" is `value` per cent of
 * each one's basic, "amount" is `value` rupees to each.
 */
export const bonusFor = (people, { basis, value }) => Object.fromEntries(people.map((e) => [e.id, text(bonusAmount(e.basicSalaryNPR, basis, value))]));

/** The slip a row prints: what a record saved from this row would print. */
export function slipFor(row, month, year) {
  const { e, line } = row;
  return slipView(slipOf({
    staffName: e.name, role: e.role, month, year: Number(year), person_id: e.id,
    basicNPR: line.basic, bonusNPR: line.bonus, lateDeductionNPR: line.late, pfDeductionNPR: line.pf,
    overtimeNPR: line.overtime, receivableDueNPR: line.receivable, advanceNPR: line.advance,
    tdsRatePct: line.tdsRatePct, tdsNPR: line.tds,
  }));
}

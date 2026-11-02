/**
 * Payroll maths, free of React and the database. One person's pay for one month is built the way the monthly salary sheet builds it:
 *
 *   gross       basic + allowances (a bonus of any kind goes here) + approved overtime + receivable due
 *   taken off   the attendance deduction (and any manual adjustment to it), advance, PF or other, and TDS
 *   TDS         one rule for everyone: a percentage (1% unless a person's is set otherwise, 0 for an exemption) of what they earn after
 *               the attendance deduction, so of gross less that deduction. An advance repaid is not income, so it does not lower it.
 *   net         gross less everything taken off, never below nothing
 *
 * "Receivable due" is money the company owes the employee (the sheet adds it to the pay); an employee paying money back is the
 * Advance, which is taken off.
 *
 * The attendance deduction follows the rules of the month (lib/workRules.js): before them the old quarter-day cuts, after them
 * one day of salary for every ABSENCES_PER_DAY_CUT unapproved absences. Amounts are kept to the paisa; screens and the slip round
 * to the rupee when they show them.
 */
import { ABSENCES_PER_DAY_CUT, OT_RATE, PAY_DIVISOR, STANDARD_DAY_HOURS } from "./workRules";

const num = (v) => Number(v) || 0;

/** To the paisa, a half rounding away from zero (the same direction whole rupees are rounded elsewhere). */
export const round2 = (n) => {
  const x = num(n);
  return (Math.sign(x) * Math.round((Math.abs(x) + 1e-9) * 100)) / 100;
};

export const dayRate = (basic) => num(basic) / PAY_DIVISOR;
export const hourRate = (basic) => dayRate(basic) / STANDARD_DAY_HOURS;

/** What a month's attendance gave for one person when nothing has been read yet. */
export const NO_FACTS = Object.freeze({ records: 0, lateDays: 0, cuts: 0, absences: 0, missedClockOuts: 0, overtimeMinutes: 0 });

/**
 * The old rule: how many days were late and how many of those flagged a quarter-day cut, from one person's attendance rows for the
 * month (the rows as the app reads them: `status`, `lateCutApplied`).
 */
export function lateCounts(rows) {
  const late = rows.filter((r) => r.status === "Late");
  return { lateDays: late.length, cuts: late.filter((r) => r.lateCutApplied === true).length };
}

/**
 * What the month's attendance takes off the basic, under the rules of that month. `facts` carries `cuts` (old rules) and
 * `absences` (new rules). Resolves to { amount, days }: the deduction, and the days of salary it stands for.
 */
export function attendanceDeduction(rules, facts, basic) {
  if (rules === "new") {
    const days = Math.floor(num(facts?.absences) / ABSENCES_PER_DAY_CUT);
    return { amount: round2(days * dayRate(basic)), days };
  }
  const cuts = num(facts?.cuts);
  return { amount: Math.round(dayRate(basic) * 0.25 * cuts), days: cuts / 4 };
}

/** Approved overtime pays the hour's pay (basic over 30 days over 8 hours) times OT_RATE. */
export const overtimePay = (minutes, basic) => round2((num(minutes) / 60) * hourRate(basic) * OT_RATE);

/**
 * A bonus for one person, of any kind: `value` per cent of their basic (basis "percent", the default) or the same `value` in rupees
 * for everyone (basis "amount"). Dashain's, in the monthly sheet, is 50 per cent (salary x 1.5 - salary). Never below nothing.
 */
export const bonusAmount = (basic, basis, value) => Math.max(0, round2(basis === "amount" ? num(value) : (num(basic) * num(value)) / 100));

/**
 * A record's maths. Takes the money lines as they are stored (basicNPR, bonusNPR, overtimeNPR, receivableDueNPR, advanceNPR,
 * pfDeductionNPR), `autoLateNPR` (what the attendance gives), `lateAdjustmentNPR` (a manual amount on top, + more or - less) and
 * `tdsRatePct` (null or "" for a record that has no TDS in it, as the older records have none).
 */
export function computePayroll(f) {
  const basic = num(f.basicNPR);
  const bonus = num(f.bonusNPR);
  const overtime = num(f.overtimeNPR);
  const receivable = num(f.receivableDueNPR);
  const autoLate = num(f.autoLateNPR);
  const adjustment = num(f.lateAdjustmentNPR);
  const late = Math.max(0, round2(autoLate + adjustment));
  const advance = num(f.advanceNPR);
  const pf = num(f.pfDeductionNPR);

  const gross = round2(basic + bonus + overtime + receivable);
  const taxable = Math.max(0, round2(gross - late));
  const rate = f.tdsRatePct === null || f.tdsRatePct === undefined || f.tdsRatePct === "" ? null : num(f.tdsRatePct);
  const tds = rate === null ? 0 : round2((taxable * rate) / 100);
  const totalDeductions = round2(late + advance + pf + tds);
  const rawNet = round2(gross - totalDeductions);

  return {
    basic, bonus, overtime, receivable, gross,
    late, autoLate, adjustment, advance, pf,
    taxable, tdsRatePct: rate, tds,
    totalDeductions, net: Math.max(0, rawNet), deductionsExceedGross: rawNet < 0,
  };
}

/**
 * One person's line of a month: what the attendance gives, plus what somebody typed (`manual`: bonus, receivable, advance, other,
 * adjustment, tdsRate). The card and the monthly run both build their numbers here, so they cannot disagree.
 */
export function payLine({ basic, rules, facts, manual = {} }) {
  const f = facts || NO_FACTS;
  const att = attendanceDeduction(rules, f, basic);
  const overtimeNPR = overtimePay(f.overtimeMinutes, basic);
  const calc = computePayroll({
    basicNPR: basic,
    bonusNPR: manual.bonus,
    overtimeNPR,
    receivableDueNPR: manual.receivable,
    autoLateNPR: att.amount,
    lateAdjustmentNPR: manual.adjustment,
    advanceNPR: manual.advance,
    pfDeductionNPR: manual.other,
    tdsRatePct: manual.tdsRate,
  });
  return { ...calc, att, rules, overtimeMinutes: num(f.overtimeMinutes) };
}

/** The sums a monthly run shows at its foot. */
export function runTotals(lines) {
  const sum = (pick) => round2(lines.reduce((s, l) => s + num(pick(l)), 0));
  return {
    people: lines.length,
    basic: sum((l) => l.basic),
    bonus: sum((l) => l.bonus),
    overtime: sum((l) => l.overtime),
    receivable: sum((l) => l.receivable),
    gross: sum((l) => l.gross),
    attendance: sum((l) => l.late),
    advance: sum((l) => l.advance),
    pf: sum((l) => l.pf),
    tds: sum((l) => l.tds),
    deductions: sum((l) => l.totalDeductions),
    net: sum((l) => l.net),
  };
}

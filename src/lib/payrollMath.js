/**
 * Payroll maths, free of React and the database. One person's pay for one month is built the way the accountant's salary-slip
 * sheets build it (checked against them line by line, see the checks at the end of this comment):
 *
 *   day's pay   basic / 30, for every month whatever its length
 *   hour's pay  a day's pay over THAT PERSON'S OWN shift hours (25,000 over a 7.5 hour shift is 111.11 an hour, over 8 hours 104.17)
 *   gross       basic + allowances (a bonus of any kind goes here) + approved overtime + receivable due
 *   taken off   the attendance deduction (and any manual adjustment to it), advance, PF or other, and TDS
 *   TDS         a percentage (1% unless a person's is set otherwise, 0 for an exemption) of the basic salary and any bonus: the
 *               "Income Tax (1%)" on every slip is that, whatever else is added or taken off. Not of overtime, receivable due, or what
 *               the attendance took off.
 *   net         gross less everything taken off, never below nothing
 *
 * "Receivable due" is money the company owes the employee (the sheet adds it to the pay); an employee paying money back is the
 * Advance, which is taken off.
 *
 * The attendance deduction follows the rules of the month (lib/workRules.js). Before them: a quarter of a day's pay for each late
 * day flagged with the old cut ("Late Time" on the slips: every such line in the October slips is a whole number of quarter days).
 * From them: one day of salary for every ABSENCES_PER_DAY_CUT unapproved absences. In both: the LEAVE AMOUNT typed is taken off as it
 * is ("Leave Day" on the slips). The amount is typed, not read from the attendance: the attendance rows of October could not
 * reproduce the slips' leave lines (they are too thin), and the accountant's own register is where they come from. (Records made when
 * leave was typed in days hold the days: `leaveAmountOf` prices them at a day's pay each.)
 * Counts can be typed over what the attendance gave (`manual.cuts`, `manual.absences`), as the slips' lines are typed.
 *
 * Amounts are kept to the paisa; screens and the slip round to the rupee when they show them.
 *
 * Checked against the October slips: 20,000 basic, "Leave Day 4,000" = 6 days; 10,000 basic, "Leave Day 2,331" = 7 days at 333 (so a
 * leave amount of 4,000 and of 2,331);
 * 25,000 basic, "Late Time 1,872" = 9 quarter-day cuts (2.25 days); "Income Tax (1%)" = 1% of basic on all fourteen.
 */
import { ABSENCES_PER_DAY_CUT, OT_RATE, PAY_DIVISOR, STANDARD_DAY_HOURS } from "./workRules";

const num = (v) => Number(v) || 0;

/** To the paisa, a half rounding away from zero (the same direction whole rupees are rounded elsewhere). */
export const round2 = (n) => {
  const x = num(n);
  return (Math.sign(x) * Math.round((Math.abs(x) + 1e-9) * 100)) / 100;
};

/** A typed count (text from a box) when there is one, else the fallback. A blank box means "use what the attendance says". */
const typedOr = (typed, fallback) => (typed === "" || typed == null || !Number.isFinite(Number(typed)) ? num(fallback) : Math.max(0, Number(typed)));

export const dayRate = (basic) => num(basic) / PAY_DIVISOR;
/** An hour's pay: a day's pay over the person's own shift hours (8 when none is known), as the sheets price an hour. */
export const hourRate = (basic, shiftHours = STANDARD_DAY_HOURS) => dayRate(basic) / (num(shiftHours) > 0 ? num(shiftHours) : STANDARD_DAY_HOURS);

/**
 * The leave amount a saved record holds: the amount that was typed, or, for a record made while leave was typed in days, those days at a
 * day's pay of its own basic (what they cost then, so opening such a record changes no figure). 0 when it holds none.
 */
export function leaveAmountOf(rec) {
  if (!rec) return 0;
  const amount = num(rec.leaveAmountNPR);
  return amount > 0 ? round2(amount) : round2(num(rec.leaveDays) * dayRate(rec.basicNPR));
}

/** What a month's attendance gave for one person when nothing has been read yet. */
export const NO_FACTS = Object.freeze({ records: 0, lateDays: 0, cuts: 0, absences: 0, missedClockOuts: 0, leaveRecorded: 0, overtimeMinutes: 0, overtimeShifts: 0 });

/**
 * The old rule: how many days were late and how many of those flagged a quarter-day cut, from one person's attendance rows for the
 * month (the rows as the app reads them: `status`, `lateCutApplied`).
 */
export function lateCounts(rows) {
  const late = rows.filter((r) => r.status === "Late");
  return { lateDays: late.length, cuts: late.filter((r) => r.lateCutApplied === true).length };
}

/**
 * What the month takes off the basic for attendance, under the rules of that month ("old", "new", or "mixed": the month that holds
 * the switch day, whose `cuts` are those of the days before it and whose `absences` are those of the days from it, lib/workRules.js).
 * `counts` is { cuts, absences, leaveAmount }; the old rule reads cuts, the new one absences, a mixed month both, and the leave amount
 * (rupees, typed) always. Resolves to { amount, days, parts }: the deduction, the days of salary it stands for, and what each part
 * came to (`cuts`, `absences`, `late` the two together, `leave`).
 */
export function attendanceDeduction(rules, counts, basic) {
  const day = dayRate(basic);
  const leave = Math.max(0, round2(counts?.leaveAmount));
  const cutCount = rules === "new" ? 0 : num(counts?.cuts);
  const absentDays = rules === "old" ? 0 : Math.floor(num(counts?.absences) / ABSENCES_PER_DAY_CUT);
  const cuts = Math.round(day * 0.25 * cutCount);          // whole rupees, as the old rule always was
  const absences = round2(absentDays * day);
  return { amount: round2(cuts + absences + leave), days: cutCount / 4 + absentDays + (day > 0 ? leave / day : 0), parts: { cuts, absences, late: round2(cuts + absences), leave } };
}

/** Approved overtime pays the hour's pay times OT_RATE. `shifts` is the overtime in lengths of the person's own shift (minutes over their shift's minutes, day by day). */
export const overtimePay = (shifts, basic) => round2(num(shifts) * dayRate(basic) * OT_RATE);

/**
 * A bonus for one person, of any kind: `value` per cent of their basic (basis "percent", the default) or the same `value` in rupees
 * for everyone (basis "amount"). Never below nothing.
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
  const taxable = round2(basic + bonus);              // the slips' "Income Tax (1%)": the basic salary and any bonus, whatever is added or taken off
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
 * adjustment, tdsRate, and what the slips have typed lines for: leaveAmount, and cuts or absences to use instead of the
 * attendance's). The card and the monthly run both build their numbers here, so they cannot disagree.
 * `counts` in the answer is what was used, so it can be kept with the record.
 */
export function payLine({ basic, rules, facts, manual = {} }) {
  const f = facts || NO_FACTS;
  const counts = { cuts: typedOr(manual.cuts, f.cuts), absences: typedOr(manual.absences, f.absences), leaveAmount: typedOr(manual.leaveAmount, 0) };
  const att = attendanceDeduction(rules, counts, basic);
  const overtimeNPR = overtimePay(f.overtimeShifts, basic);
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
  return { ...calc, att, counts, rules, overtimeMinutes: num(f.overtimeMinutes) };
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

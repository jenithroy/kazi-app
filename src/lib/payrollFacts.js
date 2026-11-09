/**
 * What a month's attendance says about each person, for payroll: how many days were late and how many of those flagged the old
 * quarter-day cut, how many absences were counted, how many clock-ins have no clock-out, and the overtime minutes that counted.
 *
 * Absences are read from `personMonth`'s own days, so the number payroll uses is the number the Attendance page shows for that person
 * (a clock-in with no clock-out counts as absent there, and so here: `missedClockOuts` says how many of the absences are that, so
 * they can be fixed on the Attendance page first). THE DAY decides which rule a count belongs to (lib/workRules.js): the old rule's
 * cuts are the flagged late days BEFORE the switch (a flag a stale client wrote later is ignored), and the new rule's absences are
 * those FROM it (an earlier absence never counts toward the 7), so a month that holds the switch day (November 2026) has both and no
 * penalty is retroactive. Overtime is the database's: only time inside an approval made before the person clocked in (lib/overtime.js).
 *
 * `overtimeReady` is false when the overtime part of the database (migration 0064) is not there yet; overtime then reads as nothing.
 */
import { fetchAll } from "./db";
import { MONTHS } from "./finance";
import { isoFromDate, isoOf, monthOf, personMonth } from "./attendance";
import { fetchOvertimeDays, overtimeNotSetUp } from "./overtime";
import { lateCounts } from "./payrollMath";
import { STANDARD_DAY_HOURS, rulesOn } from "./workRules";

const group = (rows, key) => {
  const by = new Map();
  rows.forEach((r) => {
    const id = r[key];
    if (!id) return;
    if (!by.has(id)) by.set(id, []);
    by.get(id).push(r);
  });
  return by;
};

/** One person's facts for the month `mo` ({ y, m, days, start, end }) from their own rows. */
export function factsOf({ records, clocks, overtime, mo, today }) {
  const pm = personMonth({ records, clocks, month: mo, today });
  const fromSwitch = (d) => rulesOn(d.iso) === "new";
  return {
    records: records.length,
    lateDays: lateCounts(records).lateDays,
    cuts: lateCounts(records.filter((r) => rulesOn(String(r.date)) === "old")).cuts,
    absences: pm.days.filter((d) => fromSwitch(d) && d.record?.status === "Absent").length,
    missedClockOuts: pm.days.filter((d) => fromSwitch(d) && d.record?.missedClockOut).length,
    leaveRecorded: pm.leave,                                   // days somebody marked Leave: shown to whoever types the leave amount, never deducted by itself
    overtimeMinutes: overtime.reduce((sum, o) => sum + o.minutes, 0),
    // overtime in lengths of the person's own shift (minutes over that day's shift minutes), which is how the sheets price an hour
    overtimeShifts: overtime.reduce((sum, o) => sum + o.minutes / (o.shiftMinutes > 0 ? o.shiftMinutes : STANDARD_DAY_HOURS * 60), 0),
  };
}

/**
 * Everyone's facts for a month ({ byPerson: Map(personId -> facts), records, overtimeReady }), or just one person's when `personId`
 * is given. Rows the caller may not read are simply not there (a person sees only their own; Attendance at tier 2 sees everyone's),
 * which is why `records` is returned: no rows at all means "nothing was readable", not "nobody was late".
 */
export async function loadMonthFacts({ month, year, personId, today = isoFromDate(new Date()) }) {
  const monthIndex = MONTHS.indexOf(month);
  if (monthIndex < 0 || !Number(year)) return { byPerson: new Map(), records: 0, overtimeReady: true };

  const mo = monthOf(isoOf(Number(year), monthIndex, 1));
  const range = [{ field: "date", op: "gte", value: mo.start }, { field: "date", op: "lte", value: mo.end }];
  const who = personId ? [{ field: "person_id", value: personId }] : [];

  const [records, clocks, ot] = await Promise.all([
    fetchAll("attendance", { filters: [...range, ...who] }),
    fetchAll("clock_ins", { filters: [...range, ...who] }),
    fetchOvertimeDays({ from: mo.start, to: mo.end, personId }).then((rows) => ({ rows }), (error) => ({ error })),
  ]);
  if (ot.error && !overtimeNotSetUp(ot.error)) throw ot.error;     // a real failure must not read as "no overtime"
  const overtime = ot.rows || [];

  const recBy = group(records, "person_id");
  const clkBy = group(clocks, "person_id");
  const otBy = group(overtime, "personId");
  const ids = new Set([...recBy.keys(), ...clkBy.keys(), ...otBy.keys(), ...(personId ? [personId] : [])]);

  const byPerson = new Map();
  ids.forEach((id) => {
    byPerson.set(id, factsOf({ records: recBy.get(id) || [], clocks: clkBy.get(id) || [], overtime: otBy.get(id) || [], mo, today }));
  });
  return { byPerson, records: records.length, overtimeReady: !ot.error };
}

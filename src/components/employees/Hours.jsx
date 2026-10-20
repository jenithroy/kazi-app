/**
 * The parts of a person's card that are about their week: which days they work, the days that run on other hours, and the week
 * as the attendance rules will read it. The rules themselves are in constants.js (getEmployeeScheduleForDate); lib/employees.js
 * `effectiveWeek` is the same reading (own hours, else the built-in table's), so what the card shows is what Attendance will do.
 */
import { useEffect, useRef } from "react";
import { Icons } from "../ui";
import Select from "../Select";
import { WEEKDAYS } from "../../constants";
import { effectiveWeek, hhmm, hoursOf } from "../../lib/employees";

/** Which days count as working days. An unset list means every day counts (the attendance rules), so it reads as all seven on. */
export function DaysPicker({ value, onChange, disabled, label }) {
  const days = Array.isArray(value) && value.length ? value : null;
  const on = (d) => (days ? days.includes(d) : true);
  const toggle = (d) => {
    const cur = days || WEEKDAYS.slice();
    if (cur.includes(d) && cur.length === 1) return;            // the last working day stays: an empty list would mean every day
    onChange(cur.includes(d) ? cur.filter((x) => x !== d) : WEEKDAYS.filter((x) => x === d || cur.includes(x)));
  };
  return (
    <div className="em-days" role="group" aria-label={label}>
      {WEEKDAYS.map((d) => (
        <button key={d} type="button" className={on(d) ? "is-on" : undefined} aria-pressed={on(d)} disabled={disabled} onClick={() => toggle(d)}>
          {d}
        </button>
      ))}
    </div>
  );
}

/**
 * Days that run on other hours (a Tuesday that starts earlier). `value` is { Tue: { start, end } }; a blank start or end falls back
 * to the person's usual one. Only working days can have one, one each.
 */
export function Exceptions({ value, onChange, days, start, end, disabled, idBase }) {
  const ovr = value || {};
  const working = Array.isArray(days) && days.length ? days : WEEKDAYS;
  const entries = WEEKDAYS.filter((d) => ovr[d]);
  const free = WEEKDAYS.find((d) => working.includes(d) && !ovr[d]);
  const patch = (day, part) => onChange({ ...ovr, [day]: { ...ovr[day], ...part } });
  const remove = (day) => { const next = { ...ovr }; delete next[day]; onChange(next); };
  // A new row takes the cursor (it is where the next thing to type is), whichever place in the week it lands. A row whose day was
  // changed is drawn again under its new day, so the cursor goes back to that day's dropdown.
  const cursor = useRef(null);
  const add = (day) => { cursor.current = `${idBase}-${day}-s`; patch(day, { start, end }); };
  const move = (from, to) => { cursor.current = `${idBase}-${to}-d`; const next = { ...ovr }; next[to] = next[from]; delete next[from]; onChange(next); };
  useEffect(() => {
    if (!cursor.current) return;
    document.getElementById(cursor.current)?.focus();
    cursor.current = null;
  });

  return (
    <div className="em-exc">
      {entries.map((day) => {
        const v = ovr[day] || {};
        return (
          <div className="em-exc-row" key={day}>
            <Select
              id={`${idBase}-${day}-d`} label={`${day}: day`} value={day} onChange={(d) => move(day, d)} searchable={false} disabled={disabled}
              options={WEEKDAYS.filter((d) => working.includes(d) && (d === day || !ovr[d])).map((d) => ({ value: d, label: d }))}
            />
            <input id={`${idBase}-${day}-s`} type="time" aria-label={`${day}: starts`} value={v.start || ""} disabled={disabled} onChange={(e) => patch(day, { start: e.target.value })} />
            <input id={`${idBase}-${day}-e`} type="time" aria-label={`${day}: ends`} value={v.end || ""} disabled={disabled} onChange={(e) => patch(day, { end: e.target.value })} />
            {!disabled && (
              <button type="button" className="em-exc-x" aria-label={`Remove the ${day} exception`} onClick={() => remove(day)}>
                <Icons.X size={14} sw={2} aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
      {entries.length === 0 && <p className="em-exc-none">None. Every working day runs on the usual hours.</p>}
      {!disabled && (free ? (
        <button type="button" className="ghost-button em-exc-add" onClick={() => add(free)}>
          <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> Add an exception
        </button>
      ) : entries.length > 0 ? <p className="em-exc-none">Every working day already has one.</p> : null)}
    </div>
  );
}

/** Seven days, each with the hours it runs on (or "off"). A day with its own hours is marked; built-in hours are drawn the same way. */
export function WeekGlance({ form, name }) {
  const { week, builtin } = effectiveWeek(form, name);
  return (
    <ul className="em-week" aria-label={builtin ? "The week, day by day (the built-in hours)" : "The week, day by day"}>
      {week.map((d) => (
        <li key={d.day} className={`is-${d.state}`}>
          <b>{d.day}</b>
          <span>
            {d.state === "none" ? "—" : d.state === "off" ? "off" : `${d.start}–${d.end}`}
            {d.state === "exception" ? <small> other hours</small> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** What the attendance rules do for this form, in a sentence or two (shown under the week). */
export function RuleNote({ form, name }) {
  const own = Boolean(hhmm(form.scheduleStart) && hhmm(form.scheduleEnd));
  if (own) {
    return (
      <p className="ec-note ec-wide">
        Arriving after the start time is marked late. From <b>15 minutes</b> late it also flags a cut of a quarter of that day's pay.
        {Array.isArray(form.scheduleWorkingDays) && form.scheduleWorkingDays.length ? " Arrivals on a day off are judged by the 10:00 rule." : ""}
      </p>
    );
  }
  const built = hoursOf({ name });
  return (
    <p className="ec-note ec-wide">
      {built.source === "builtin"
        ? <>No hours are saved here, so the built-in <b>{built.time}</b> applies. Save hours here to replace them.</>
        : <>No hours set. Anyone clocking in at <b>10:00</b> or later is marked late, with no pay cut.</>}
    </p>
  );
}

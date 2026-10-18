import { dayShort, fmtClock, fmtMinutes, isSat, noteText, stateOf, workedMinutes } from "../../lib/attendance";
import { tsDate } from "../../utils/date";
import { cn } from "../ui";
import StatusTag from "./StatusTag";

/**
 * One day of one person's month: the date, how it went, when they came and went, how long they
 * worked. With `onPick` the whole row is a button (the staff page uses that to open a day);
 * without it the row is just text (the report). Days that have not happened yet are shown dim.
 */
export function DayRow({ day, today, onPick, active }) {
  const { iso, record, clock } = day;
  const future = iso > today;
  const state = stateOf(record, { closed: isSat(iso) });
  const inT = fmtClock(tsDate(clock?.clockedInAt));
  const outT = fmtClock(tsDate(clock?.clockedOutAt));
  const mins = workedMinutes(clock);

  const cells = (
    <>
      <span className="at-day-d">{dayShort(iso)}</span>
      <span className="at-day-s">
        {future ? <span className="at-dim">—</span> : <StatusTag state={state} />}
        {record?.status === "Late" && record.lateCutApplied === true && <span className="kb-tag kb-tag--bad">25% cut</span>}
      </span>
      <span className="at-day-in">{inT}</span>
      <span className="at-day-t kb-w-360">{inT ? `${inT} – ${outT || "…"}` : ""}</span>
      <b className="at-day-h kb-w-460">{mins != null ? fmtMinutes(mins) : ""}</b>
      <span className="at-day-n kb-w-520">{noteText(record)}</span>
    </>
  );

  if (!onPick) return <li className={cn("at-day", future && "is-future")}>{cells}</li>;
  return (
    <li className={cn("at-day-li", future && "is-future", active && "is-active")}>
      <button type="button" className="at-day at-day-btn" aria-pressed={active} onClick={() => onPick(iso)}>{cells}</button>
    </li>
  );
}

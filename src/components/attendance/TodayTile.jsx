import { Tile } from "../bento/Bento";
import { Icons, cn } from "../ui";
import { STATE_LABEL, dayShort, fmtClock, fmtMinutes } from "../../lib/attendance";

const ICON = {
  present: Icons.Check, late: Icons.Clock, half: Icons.Clock, leave: Icons.Calendar,
  absent: Icons.X, none: Icons.Clock, closed: Icons.Calendar,
};

/** One plain sentence under the headline: why the day reads the way it does. */
function why(row, isToday) {
  if (!row) return isToday ? "Not clocked in yet" : "Nothing was recorded";
  switch (row.state) {
    case "present": return row.inAt ? "You were on time" : "Marked present";
    case "late": {
      const by = row.lateMinutes
        ? `${row.lateMinutes} min after ${row.shift?.start || "the start"}`
        : row.inAt ? "Clocked in after the start time" : "Marked late";
      return `${by} · ${row.lateCut ? "25% salary cut" : "no salary cut"}`;
    }
    case "half": return "Half a day";
    case "leave": return "You were on leave";
    case "absent": return row.missedClockOut ? "A clock-in with no clock-out counts as absent" : "Marked absent";
    case "closed": return "Saturday: the office is closed";
    default: return isToday ? "Not clocked in yet" : "Nothing was recorded";
  }
}

/**
 * The signed-in person's day, in the page's words: how it went, when they came and went, how
 * long they have been in, how far from the workshop they pressed the button. Any day picked on
 * the calendar shows here; `row` is that day's line from buildRoster, or null before it loads.
 */
export default function TodayTile({ row, date, today, loading }) {
  const isToday = date === today;
  const state = row?.state || "none";
  const Icon = ICON[state];
  const inT = fmtClock(row?.inAt);
  const outT = fmtClock(row?.outAt);
  const length = row?.worked != null ? fmtMinutes(row.worked) : row?.sofar != null ? fmtMinutes(row.sofar) : "—";
  // what is known about the day; a shift only appears for someone who has one set
  const facts = [
    ["In", inT || "—", ""],
    ["Out", outT || (row?.sofar != null ? "…" : "—"), ""],
    [row?.sofar != null && row?.worked == null ? "So far" : "Worked", length, "is-h240"],
    ...(row?.shift ? [["Shift", `${row.shift.start}–${row.shift.end}`, "is-h240"]] : []),
    ["From the workshop", row?.distanceM != null ? `${row.distanceM} m` : "—", "is-h300"],
  ];

  return (
    <Tile area="today" icon={<Icons.Attendance size={14} sw={1.8} />} title={isToday ? "Today" : "That day"} note={dayShort(date)} loading={loading} align="top" className="at-today">
      <div className={cn("at-state", `at-state--${state}`)}>
        <span className="at-state-ic" aria-hidden="true"><Icon size={18} sw={2} /></span>
        <div>
          <b>{STATE_LABEL[state]}</b>
          <span>{why(row, isToday)}</span>
        </div>
      </div>
      <dl className="at-facts">
        {facts.map(([name, value, hide]) => <div key={name} className={hide || undefined}><dt>{name}</dt><dd>{value}</dd></div>)}
      </dl>
    </Tile>
  );
}

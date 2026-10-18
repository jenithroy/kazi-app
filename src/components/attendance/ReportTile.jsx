import { Icons } from "../ui";
import { EmptyNote, Tile } from "../bento/Bento";
import Select from "../Select";
import { fmtHoursShort, monthTitle } from "../../lib/attendance";
import { DayRow } from "./DayRows";
import ModeSwitch from "./ModeSwitch";

/**
 * One person's month, the way payroll reads it: the counts first, then every working day. It
 * shows the month the calendar is on, and the person is chosen from a list (searchable, with
 * faces), so there is no second month to keep in step.
 */
export default function ReportTile({ options, personId, onPerson, person, month, today, mode, onMode, loading }) {
  const sums = person && [
    { f: "Present", n: person.present },
    { f: "Late", n: person.late, tone: "warn" },
    { f: "Salary cuts", n: person.cuts, tone: person.cuts ? "bad" : "" },
    { f: "Absent", n: person.absent, tone: person.absent ? "bad" : "" },
    { f: "Leave", n: person.leave, tone: "info" },
    { f: "Hours", n: person.minutes ? fmtHoursShort(person.minutes) : "—" },
  ];
  return (
    <Tile area="roster" icon={<Icons.Calendar size={14} sw={1.8} />} title="Report" note={monthTitle(month)} loading={loading} align="top" className="at-report">
      <div className="at-bar">
        <div className="at-bar-l">
          <Select variant="pill" label="Employee" value={personId} onChange={onPerson} options={options} placeholder="Choose a person" searchPlaceholder="Find a person" minWidth={240} />
        </div>
        <div className="at-bar-r"><ModeSwitch mode={mode} onMode={onMode} /></div>
      </div>

      {!person ? (
        <EmptyNote icon={<Icons.Calendar size={24} sw={1.5} />}>Choose a person to see their month.</EmptyNote>
      ) : (
        <>
          <dl className="at-sums">
            {sums.map((s) => (
              <div key={s.f} className={s.tone ? `is-${s.tone}` : undefined}>
                <dt>{s.f}</dt>
                <dd>{s.n}</dd>
              </div>
            ))}
          </dl>
          <div className="at-th" aria-hidden="true">
            <span className="at-day-d">Date</span>
            <span className="at-day-s">Status</span>
            <span className="at-day-t kb-w-360">Clock in – out</span>
            <span className="at-day-h kb-w-460">Hours</span>
            <span className="at-day-n kb-w-520">Note</span>
          </div>
          <ul className="at-days kb-fill" tabIndex={0} aria-label={`Days of ${monthTitle(month)}`}>
            {person.days.map((d) => <DayRow key={d.iso} day={d} today={today} />)}
          </ul>
        </>
      )}
    </Tile>
  );
}

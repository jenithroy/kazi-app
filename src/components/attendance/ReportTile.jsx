import { Link } from "react-router-dom";
import { Avatar, Icons, cn, hueFromName } from "../ui";
import { EmptyNote, Tile } from "../bento/Bento";
import { ArrowUpRight } from "../bento/icons";
import PersonLink from "../profile/PersonLink";
import Select from "../Select";
import { fmtHoursShort, monthTitle } from "../../lib/attendance";
import { DayRow } from "./DayRows";
import ModeSwitch from "./ModeSwitch";

/** The six counts a month adds up to, as the cells at the top of a report. */
function Sums({ of }) {
  const cells = [
    { f: "Present", n: of.present },
    { f: "Late", n: of.late, tone: "warn" },
    { f: "Salary cuts", n: of.cuts, tone: of.cuts ? "bad" : "" },
    { f: "Absent", n: of.absent, tone: of.absent ? "bad" : "" },
    { f: "Leave", n: of.leave, tone: "info" },
    { f: "Hours", n: of.minutes ? fmtHoursShort(of.minutes) : "—" },
  ];
  return (
    <dl className="at-sums">
      {cells.map((s) => (
        <div key={s.f} className={s.tone ? `is-${s.tone}` : undefined}>
          <dt>{s.f}</dt>
          <dd>{s.n}</dd>
        </div>
      ))}
    </dl>
  );
}

const n = (v, tone) => <span className={cn("at-ev-n", !v && "is-zero", v && tone && `is-${tone}`)}>{v}</span>;

/**
 * The month on paper, two ways. "Everyone" is one line per person (what payroll reads off: present,
 * late, salary cuts, absent, leave, hours), and pressing a line opens that person. A person is the
 * counts and every working day of theirs, with the note on each. Both show the month the calendar
 * is on, so there is no second month to keep in step. The person is chosen from a list (searchable,
 * with faces); `payrollTo`, when the viewer may open Payroll, adds a way there.
 */
export default function ReportTile({ options, personId, onPerson, person, everyone, month, today, mode, onMode, loading, payrollTo }) {
  return (
    <Tile area="roster" icon={<Icons.Calendar size={14} sw={1.8} />} title="Report" note={monthTitle(month)} loading={loading} align="top" className="at-report">
      <div className="at-bar">
        <div className="at-bar-l">
          <Select variant="pill" label="Report for" value={personId} onChange={onPerson} options={options} placeholder="Choose a person" searchPlaceholder="Find a person" minWidth={240} />
        </div>
        <div className="at-bar-r">
          {payrollTo && (
            <Link className="kb-pillbtn at-small" to={payrollTo}>Payroll <ArrowUpRight size={12} sw={2} aria-hidden="true" /></Link>
          )}
          <ModeSwitch mode={mode} onMode={onMode} />
        </div>
      </div>

      {person ? (
        <>
          <Sums of={person} />
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
      ) : everyone.people.length === 0 ? (
        <EmptyNote icon={<Icons.Users size={24} sw={1.5} />}>No staff to report on yet.</EmptyNote>
      ) : (
        <>
          <Sums of={everyone.totals} />
          <div className="at-th at-ev-th" aria-hidden="true">
            <span className="at-c-name">Name</span>
            <span className="at-ev-n">Present</span>
            <span className="at-ev-n">Late</span>
            <span className="at-ev-n kb-w-400">Cuts</span>
            <span className="at-ev-n">Absent</span>
            <span className="at-ev-n kb-w-360">Leave</span>
            <span className="at-ev-h kb-w-460">Hours</span>
          </div>
          <ul className="at-days at-ev kb-fill" tabIndex={0} aria-label={`Everyone, ${monthTitle(month)}`}>
            {everyone.people.map((p) => (
              <li key={p.personId}>
                {/* The row opens the person's month (a stretched button underneath); their name and picture sit above it and open their profile. */}
                <div className="at-ev-row">
                  <button type="button" className="at-ev-hit" title={`Open ${p.name}'s report`} aria-label={`Open ${p.name}'s report`} onClick={() => onPerson(p.personId)} />
                  <span className="at-c-name">
                    <PersonLink decor personId={p.personId} name={p.name}>
                      <Avatar name={p.name} personId={p.personId} hue={hueFromName(p.name)} size={28} />
                    </PersonLink>
                    <span className="at-who"><b><PersonLink className="kpl--clip" personId={p.personId} name={p.name} /></b><span>{p.role}</span></span>
                  </span>
                  {n(p.present)}
                  {n(p.late, "warn")}
                  <span className={cn("at-ev-n kb-w-400", !p.cuts && "is-zero", p.cuts > 0 && "is-bad")}>{p.cuts}</span>
                  {n(p.absent, "bad")}
                  <span className={cn("at-ev-n kb-w-360", !p.leave && "is-zero", p.leave > 0 && "is-info")}>{p.leave}</span>
                  <span className="at-ev-h kb-w-460">{p.minutes ? fmtHoursShort(p.minutes) : "—"}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Tile>
  );
}

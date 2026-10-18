import { Avatar, Icons, hueFromName } from "../ui";
import { EmptyNote, Figure, RowList, Tile } from "../bento/Bento";
import { StackBar } from "../bento/charts";

const GOOD = "var(--kb-good-fill)";
const WARN = "var(--kb-warn-fill)";
const INFO = "var(--kb-info-fill)";
const BAD = "var(--kb-bad-fill)";

/**
 * The month in numbers. For one person it is their own days; for the team it is every working
 * day anyone was recorded, with the people who were late most often underneath when there is room.
 * `summary` is personMonth() or teamMonth() from lib/attendance.js: they have the same counts.
 */
export default function StatsTile({ kind, summary, label, loading }) {
  const { present, late, cuts, absent, leave, minutes } = summary;
  const arrived = present + late;
  const onTime = kind === "team" ? summary.onTimePct : (arrived ? Math.round((present / arrived) * 100) : null);
  const hours = Math.round(minutes / 60);
  const rows = [
    { label: "Present", n: present, color: GOOD },
    { label: "Late", n: late, color: WARN },
    { label: "On leave", n: leave, color: INFO },
    { label: "Absent", n: absent, color: BAD },
  ];
  const lateOnes = kind === "team"
    ? summary.people.filter((p) => p.late > 0).sort((a, b) => b.late - a.late || b.cuts - a.cuts || a.name.localeCompare(b.name)).slice(0, 8)
    : [];

  return (
    <Tile area="stats" icon={<Icons.Clock size={14} sw={1.8} />} title="This month" note={label} loading={loading} align="top" className="at-stats">
      <div className="at-stat-top">
        <div><span className="kb-lbl">On time</span><Figure unit={onTime == null ? undefined : "%"}>{onTime == null ? "—" : onTime}</Figure></div>
        <div><span className="kb-lbl">Hours</span><Figure unit="h">{hours.toLocaleString("en-GB")}</Figure></div>
      </div>
      <StackBar parts={rows.map((r) => ({ v: r.n, color: r.color }))} />
      <ul className="at-kv">
        {rows.map((r) => (
          <li key={r.label}>
            <span className="kb-dot" style={{ background: r.color }} />
            <span className="kb-att-l">{r.label}</span>
            <b>{r.n}</b>
          </li>
        ))}
        <li>
          <span className="kb-dot" style={{ background: "transparent", boxShadow: `inset 0 0 0 2px ${BAD}` }} />
          <span className="kb-att-l">Salary cuts</span>
          <b>{cuts}</b>
        </li>
      </ul>

      {kind === "team" && (
        <div className="at-late">
          <span className="kb-lbl">Late most often</span>
          {lateOnes.length === 0 ? (
            <EmptyNote icon={<Icons.Check size={20} sw={1.6} />}>No late arrivals this month</EmptyNote>
          ) : (
            <RowList className="kb-fill">
              {lateOnes.map((p) => (
                <li className="kb-row" key={p.personId}>
                  <Avatar name={p.name} personId={p.personId} hue={hueFromName(p.name)} size={22} />
                  <span className="kb-tk-t"><b>{p.name}</b></span>
                  <span className="kb-tag kb-tag--warn">{p.late} late</span>
                  {p.cuts > 0 && <span className="kb-tag kb-tag--bad kb-w-300">{p.cuts} cut{p.cuts > 1 ? "s" : ""}</span>}
                </li>
              ))}
            </RowList>
          )}
        </div>
      )}
    </Tile>
  );
}

import { Avatar, Icons, cn, hueFromName } from "../ui";
import PersonLink from "../profile/PersonLink";
import { EmptyNote, Figure, RowList, Tile } from "../bento/Bento";
import { Ring, StackBar } from "../bento/charts";
import { STATE_LABEL, dayShort } from "../../lib/attendance";

// Each state, in the order the ring and the key list them.
const KEY = [
  ["present", "Present", "var(--kb-good-fill)"],
  ["late", "Late", "var(--kb-warn-fill)"],
  ["half", "Half-day", "var(--kb-r2)"],
  ["leave", "On leave", "var(--kb-info-fill)"],
  ["absent", "Absent", "var(--kb-bad-fill)"],
  ["none", "No record", "var(--kb-mute-fill)"],
];

/**
 * How the chosen day stands for the whole team: a ring and a key, and the key is the filter for
 * the roll call next to it (press a line to see only those people, press it again to see all).
 * Tall enough, it also names the people who are not in.
 */
export default function DayTile({ rows, summary, filter, onFilter, date, today, loading }) {
  const isToday = date === today;
  const parts = KEY.map(([state, label, color]) => ({ state, label, color, v: summary[state] }));
  const listed = parts.filter((p) => p.state !== "half" || p.v > 0);
  const out = rows.filter((r) => r.state === "none" || r.state === "absent");
  const closed = summary.total === 0;
  const off = rows.find((r) => r.off)?.off;            // why nobody is expected, when nobody is

  return (
    <Tile area="day" icon={<Icons.Attendance size={14} sw={1.8} />} title={isToday ? "In today" : "That day"} note={dayShort(date)} loading={loading} align="top" className="at-daytile">
      {closed ? (
        <EmptyNote icon={<Icons.Calendar size={22} sw={1.5} />}>
          {off?.kind === "holiday" ? `${off.name} is a holiday: nobody is expected in.` : "Saturday is the office's day off."}
        </EmptyNote>
      ) : (
        <>
          <div className="kb-att kb-fill">
            <div className="kb-att-big">
              <div className="kb-att-ring">
                <Ring segments={parts.map((p) => ({ v: p.v, color: p.color }))} />
                <div className="kb-att-c"><b>{summary.here}<i>/{summary.total}</i></b><span>in</span></div>
              </div>
              <ul className="kb-att-key at-key">
                {listed.map((p) => (
                  <li key={p.state}>
                    <button type="button" className={cn("at-key-btn", filter === p.state && "is-on")} aria-pressed={filter === p.state} onClick={() => onFilter(filter === p.state ? "" : p.state)}>
                      <span className="kb-dot" style={{ background: p.color }} />
                      <span className="kb-att-l">{p.label}</span>
                      <b>{p.v}</b>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="kb-att-stat">
              <Figure unit={`/${summary.total}`}>{summary.here}</Figure>
              <div className="kb-att-stat-r">
                <StackBar parts={parts.map((p) => ({ v: p.v, color: p.color }))} />
                <p>{parts.filter((p) => p.v > 0).map((p) => `${p.v} ${p.label.toLowerCase()}`).join(" · ") || "No one marked yet"}</p>
              </div>
            </div>
          </div>

          {out.length > 0 && (
            <div className="at-notin">
              <span className="kb-lbl">{isToday ? "Not in yet" : "Out or unmarked"}</span>
              <RowList className="kb-fill">
                {out.map((r) => (
                  <li className="kb-row" key={r.personId}>
                    <PersonLink decor personId={r.personId} name={r.name}>
                      <Avatar name={r.name} personId={r.personId} hue={hueFromName(r.name)} size={24} />
                    </PersonLink>
                    <span className="kb-tk-t"><b><PersonLink className="kpl--clip" personId={r.personId} name={r.name} /></b></span>
                    {!(r.state === "none" && isToday) && <span className={cn("kb-tag", r.state === "absent" && "kb-tag--bad")}>{STATE_LABEL[r.state]}</span>}
                  </li>
                ))}
              </RowList>
            </div>
          )}
        </>
      )}
    </Tile>
  );
}

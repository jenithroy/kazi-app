import { useEffect, useRef, useState } from "react";
import { Tile } from "../bento/Bento";
import { Icons, cn } from "../ui";
import { STATE_LABEL, dayShort, fmtClock, fmtMinutes, humanNote } from "../../lib/attendance";
import NoteEditor from "./NoteEditor";

const ICON = {
  present: Icons.Check, late: Icons.Clock, half: Icons.Clock, leave: Icons.Calendar,
  absent: Icons.X, none: Icons.Clock, closed: Icons.Calendar,
};

/** What a closed day is called: the holiday's name, or just "Closed" for the weekly Saturday. */
const closedWord = (row) => (row?.off?.kind === "holiday" ? "Holiday" : STATE_LABEL.closed);

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
    case "closed": return row.off?.kind === "holiday" ? `${row.off.name}: the office is closed` : "Saturday: the office is closed";
    default: return isToday ? "Not clocked in yet" : "Nothing was recorded";
  }
}

/**
 * The signed-in person's day, in the page's words: how it went, when they came and went, how
 * long they have been in, how far from the workshop they pressed the button. Any day picked on
 * the calendar shows here; `row` is that day's line from buildRoster, or null before it loads.
 *
 * A day that has a record can carry a short note (the reason for a leave or an absence, or
 * anything else worth saying): `onSaveNote(text)` saves it and resolves to true, or to a sentence
 * saying what went wrong. The note shows in the report.
 */
export default function TodayTile({ row, date, today, loading, onSaveNote }) {
  const isToday = date === today;
  const state = row?.state || "none";
  const Icon = ICON[state];
  const inT = fmtClock(row?.inAt);
  const outT = fmtClock(row?.outAt);
  const length = row?.worked != null ? fmtMinutes(row.worked) : row?.sofar != null ? fmtMinutes(row.sofar) : "—";
  const record = row?.record || null;               // what is stored: a note needs a day somebody has recorded
  const note = humanNote(record);
  const reason = state === "leave" || state === "absent";
  const word = reason ? "reason" : "note";

  const [editing, setEditing] = useState(false);
  const btn = useRef(null);
  const giveBack = useRef(false);                                // the box was closed from inside (Save, Cancel, Escape): the keyboard goes back to the button
  useEffect(() => { setEditing(false); }, [date, record?.id]);   // another day: the box closes
  useEffect(() => {
    if (editing || !giveBack.current) return;
    giveBack.current = false;
    btn.current?.focus({ preventScroll: true });
  }, [editing]);
  const close = () => { giveBack.current = true; setEditing(false); };

  // what is known about the day; a shift only appears for someone who has one set
  const facts = [
    ["In", inT || "—", ""],
    ["Out", outT || (row?.sofar != null ? "…" : "—"), ""],
    [row?.sofar != null && row?.worked == null ? "So far" : "Worked", length, "is-h240"],
    ...(row?.shift ? [["Shift", `${row.shift.start}–${row.shift.end}`, "is-h240"]] : []),
    ["From the workshop", row?.distanceM != null ? `${row.distanceM} m` : "—", "is-h300"],
  ];

  async function save(text) {
    const result = await onSaveNote(text);
    if (result === true) close();
    return result;
  }

  return (
    <Tile area="today" icon={<Icons.Attendance size={14} sw={1.8} />} title={isToday ? "Today" : "That day"} note={dayShort(date)} loading={loading} align="top" className={cn("at-today", record && "has-notebar", editing && "is-noting")}>
      <div className={cn("at-state", `at-state--${state}`)}>
        <span className="at-state-ic" aria-hidden="true"><Icon size={18} sw={2} /></span>
        <div>
          <b>{state === "closed" ? closedWord(row) : STATE_LABEL[state]}</b>
          <span>{why(row, isToday)}</span>
        </div>
      </div>

      {editing ? (
        <NoteEditor
          value={note}
          label={`${word[0].toUpperCase()}${word.slice(1)} for ${dayShort(date)}`}
          placeholder={reason ? "Why were you away? (a few words)" : "Anything worth saying about this day"}
          onSave={save}
          onCancel={close}
        />
      ) : (
        <dl className="at-facts">
          {facts.map(([name, value, hide]) => <div key={name} className={hide || undefined}><dt>{name}</dt><dd>{value}</dd></div>)}
        </dl>
      )}

      {record && !editing && (
        <div className="at-notebar">
          {note && <p className="at-notetext" title={note}><span>{note}</span></p>}
          <button ref={btn} type="button" className="kb-btn kb-btn--ghost at-notebtn" onClick={() => setEditing(true)}>
            <Icons.Edit size={13} sw={1.9} aria-hidden="true" /> {note ? `Edit ${word}` : `Add a ${word}`}
          </button>
        </div>
      )}
    </Tile>
  );
}

import { useEffect, useRef, useState } from "react";
import { Avatar, Icons, cn, hueFromName } from "../ui";
import { EmptyNote, Tile } from "../bento/Bento";
import { Undo } from "../bento/icons";
import { STATE_LABEL, dayTitle, fmtClock, fmtMinutes, humanNote, isSat } from "../../lib/attendance";
import StatusTag from "./StatusTag";
import ModeSwitch from "./ModeSwitch";
import NoteEditor from "./NoteEditor";

// [what is saved, what the button says, the state it paints in]
const CHIPS = [
  ["Present", "Present", "present"],
  ["Late", "Late", "late"],
  ["Half-day", "Half", "half"],
  ["Leave", "Leave", "leave"],
  ["Absent", "Absent", "absent"],
];

/**
 * The five status buttons of a row in edit mode, then the 25% cut (for a late day) and the note.
 * Pressing a status saves at once (and offers Undo). While that row is saving the buttons are
 * `aria-disabled` rather than `disabled`, so the one that was pressed keeps the keyboard focus (a
 * disabled button drops it). A note needs a day somebody has recorded, so it waits for a status.
 */
function Chips({ row, busy, onSet, onCut, noting, onToggleNote, noteRef }) {
  const stored = row.missedClockOut ? null : row.status;
  const hasNote = Boolean(humanNote(row.record));
  return (
    <span className="at-chips" role="group" aria-label={`Status for ${row.name}`}>
      {CHIPS.map(([status, label, state]) => (
        <button
          key={status}
          type="button"
          className={cn("at-chip", `at-chip--${state}`, stored === status && "is-on")}
          aria-pressed={stored === status}
          aria-disabled={busy || undefined}
          onClick={() => { if (!busy) onSet(row, status); }}
        >
          {label}
        </button>
      ))}
      {row.state === "late" && (
        <button
          type="button"
          className={cn("at-chip at-chip--cut", row.lateCut && "is-on")}
          aria-pressed={row.lateCut}
          aria-disabled={busy || undefined}
          onClick={() => { if (!busy) onCut(row); }}
        >
          25% cut
        </button>
      )}
      <button
        ref={noteRef}
        type="button"
        className={cn("at-chip at-chip--note", (noting || hasNote) && "is-on")}
        aria-expanded={noting}
        aria-disabled={busy || !row.record || undefined}
        title={row.record ? (hasNote ? "Edit the note" : "Add a note") : "Mark a status first, then add a note"}
        onClick={() => { if (!busy && row.record) onToggleNote(); }}
      >
        <Icons.Edit size={12} sw={1.9} aria-hidden="true" /> Note
      </button>
    </span>
  );
}

/** The quieter second line under a status: what is worth knowing beyond the status itself. */
function detail(row) {
  const note = humanNote(row.record);
  let first = "";
  if (row.state === "late") first = `${row.lateMinutes ? `${row.lateMinutes} min late` : "late"} · ${row.lateCut ? "25% cut" : "no cut"}`;
  else if (row.missedClockOut) first = "no clock-out";
  return [first, note].filter(Boolean).join(" · ");
}

function Row({ row, date, edit, busy, onSet, onCut, onNote }) {
  const [noting, setNoting] = useState(false);
  const li = useRef(null);
  const noteBtn = useRef(null);
  const giveBack = useRef(false);                              // the box was closed from inside (Save, Cancel, Escape): the keyboard goes back to the Note button
  const live = row.worked == null && row.sofar != null;       // still clocked in: the time is running
  const hours = row.worked != null ? fmtMinutes(row.worked) : live ? fmtMinutes(row.sofar) : "";
  const sub = detail(row);
  const open = edit && noting;

  // another day, or leaving Edit: a box left open would save what was typed onto the wrong day
  useEffect(() => { setNoting(false); }, [date, edit]);
  // a box opened under a row near the foot of the list has to come into view, or pressing Note seems to do nothing
  useEffect(() => { if (open) li.current?.scrollIntoView({ block: "nearest" }); }, [open]);
  useEffect(() => {
    if (open || !giveBack.current) return;
    giveBack.current = false;
    noteBtn.current?.focus({ preventScroll: true });
  }, [open]);

  const close = () => { giveBack.current = true; setNoting(false); };
  async function saveNote(text) {
    const result = await onNote(row, text);
    if (result === true) close();
    return result;
  }

  return (
    <li ref={li} className={cn("at-row", busy && "is-busy", open && "is-noting")}>
      <span className="at-c-name">
        <Avatar name={row.name} personId={row.personId} hue={hueFromName(row.name)} size={30} />
        <span className="at-who">
          <b>{row.name}</b>
          <span>{row.role}{row.shift ? <span className="kb-w-520"> · {row.shift.start}–{row.shift.end}</span> : null}</span>
        </span>
      </span>
      <span className="at-c-st">
        {edit ? (
          <Chips row={row} busy={busy} onSet={onSet} onCut={onCut} noting={noting} onToggleNote={() => setNoting((v) => !v)} noteRef={noteBtn} />
        ) : (
          <>
            {row.state === "closed" ? <span className="at-dim">—</span> : <StatusTag state={row.state} />}
            {sub && <span className="at-sub" title={sub}>{sub}</span>}
          </>
        )}
      </span>
      <span className="at-c-time kb-w-400">{fmtClock(row.inAt) || "—"}</span>
      <span className="at-c-time kb-w-400">{fmtClock(row.outAt) || "—"}</span>
      <span className={cn("at-c-hrs kb-w-460", live && "is-live")} title={live ? "Still clocked in" : undefined}>{hours || "—"}</span>
      <span className="at-c-dist kb-w-520">{row.distanceM != null ? `${row.distanceM} m` : "—"}</span>
      {open && (
        <div className="at-rownote">
          <NoteEditor
            value={humanNote(row.record)}
            label={`Note for ${row.name}`}
            placeholder={row.state === "leave" || row.state === "absent" ? "The reason, in a few words" : "A note on this day"}
            rows={2}
            onSave={saveNote}
            onCancel={close}
          />
        </div>
      )}
    </li>
  );
}

/** One line above the list when the day is a day off: which one, and that marks still count. */
function dayOffNote(rows) {
  const off = rows.filter((r) => r.off);
  if (!off.length) return "";
  const first = off[0].off;
  const everyone = off.length === rows.length;
  const name = first.kind === "holiday" ? `${first.name} is a holiday` : "Saturday is the office's day off";
  return `${name}${everyone ? "" : " for some of the team"}. Anything marked on it still counts.`;
}

/**
 * The day's roll call: everyone, how their day went and when they came and went. With edit rights
 * an Edit button turns each status into buttons that save the one person straight away (and a Note
 * button for the reason behind a status); a toast says what changed and offers Undo. Nothing here
 * saves anyone else.
 */
export default function RosterTile({
  rows, shown, filter, onFilter, date, today, onStep, onToday,
  canEdit, edit, onEdit, busyIds, onSet, onCut, onNote, toast, mode, onMode, loading,
}) {
  const offNote = dayOffNote(rows) || (isSat(date) && rows.length === 0 ? "Saturday is the office's day off." : "");
  return (
    <Tile
      area="roster"
      icon={<Icons.Users size={14} sw={1.8} />}
      title="Roll call"
      note={filter ? `${shown.length} of ${rows.length}` : `${rows.length} people`}
      loading={loading}
      align="top"
      className={cn("at-roster", edit && "is-edit")}
    >
      <div className="at-bar">
        <div className="at-daynav">
          <button type="button" className="at-nav" aria-label="Previous day" onClick={() => onStep(-1)}><Icons.ChevronLeft size={16} sw={2} /></button>
          <b className="at-daynav-t" aria-live="polite">{dayTitle(date)}</b>
          <button type="button" className="at-nav" aria-label="Next day" onClick={() => onStep(1)}><Icons.ChevronRight size={16} sw={2} /></button>
          {date !== today && <button type="button" className="kb-pillbtn at-small" onClick={onToday}>Today</button>}
        </div>
        <div className="at-bar-r">
          {filter && (
            <button type="button" className="kb-pillbtn at-small is-on" onClick={() => onFilter("")} aria-label={`Showing only ${STATE_LABEL[filter].toLowerCase()}. Show everyone`}>
              {STATE_LABEL[filter]} <Icons.X size={12} sw={2.2} aria-hidden="true" />
            </button>
          )}
          {canEdit && (
            <button type="button" className={cn("kb-pillbtn at-small", edit && "is-on")} aria-pressed={edit} onClick={() => onEdit(!edit)}>
              <Icons.Edit size={13} sw={1.9} aria-hidden="true" /> {edit ? "Done" : "Edit"}
            </button>
          )}
          <ModeSwitch mode={mode} onMode={onMode} />
        </div>
      </div>

      {offNote && <p className="at-note">{offNote}</p>}

      <div className="at-th" aria-hidden="true">
        <span className="at-c-name">Name</span>
        <span className="at-c-st">Status</span>
        <span className="at-c-time kb-w-400">In</span>
        <span className="at-c-time kb-w-400">Out</span>
        <span className="at-c-hrs kb-w-460">Hours</span>
        <span className="at-c-dist kb-w-520">Distance</span>
      </div>

      {shown.length === 0 ? (
        <EmptyNote icon={<Icons.Users size={22} sw={1.5} />}>{rows.length === 0 ? "No staff to show yet." : filter ? `No one is ${STATE_LABEL[filter].toLowerCase()} on this day.` : "No one to show."}</EmptyNote>
      ) : (
        <ul className="at-list kb-fill" tabIndex={0} aria-label={`People, ${dayTitle(date)}`}>
          {shown.map((r) => (
            <Row key={r.personId} row={r} date={date} edit={edit} busy={busyIds.has(r.personId)} onSet={onSet} onCut={onCut} onNote={onNote} />
          ))}
        </ul>
      )}

      {toast && (
        <div className={cn("at-toast", toast.bad && "is-bad")} role="status">
          <span>{toast.text}</span>
          {toast.undo && <button type="button" onClick={toast.undo}><Undo size={13} sw={2} aria-hidden="true" /> Undo</button>}
        </div>
      )}
    </Tile>
  );
}

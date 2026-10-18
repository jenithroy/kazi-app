import { Avatar, Icons, cn, hueFromName } from "../ui";
import { EmptyNote, Tile } from "../bento/Bento";
import { Undo } from "../bento/icons";
import { STATE_LABEL, dayTitle, fmtClock, fmtMinutes, isSat } from "../../lib/attendance";
import StatusTag from "./StatusTag";
import ModeSwitch from "./ModeSwitch";

// [what is saved, what the button says, the state it paints in]
const CHIPS = [
  ["Present", "Present", "present"],
  ["Late", "Late", "late"],
  ["Half-day", "Half", "half"],
  ["Leave", "Leave", "leave"],
  ["Absent", "Absent", "absent"],
];

/**
 * The five status buttons of a row in edit mode. Pressing one saves at once (and offers Undo).
 * While that row is saving the buttons are `aria-disabled` rather than `disabled`, so the one
 * that was pressed keeps the keyboard focus (a disabled button drops it).
 */
function Chips({ row, busy, onSet, onCut }) {
  const stored = row.missedClockOut ? null : row.status;
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
    </span>
  );
}

/** The quieter second line under a status: what is worth knowing and is not the status itself. */
function detail(row) {
  if (row.state === "late") return `${row.lateMinutes ? `${row.lateMinutes} min late` : "late"} · ${row.lateCut ? "25% cut" : "no cut"}`;
  if (row.missedClockOut) return "no clock-out";
  const by = row.record?.loggedBy;
  if (by && by !== "GPS") return `set by ${by.split(" ")[0]}`;
  return "";
}

function Row({ row, edit, busy, onSet, onCut }) {
  const live = row.worked == null && row.sofar != null;       // still clocked in: the time is running
  const hours = row.worked != null ? fmtMinutes(row.worked) : live ? fmtMinutes(row.sofar) : "";
  const sub = detail(row);
  return (
    <li className={cn("at-row", busy && "is-busy")}>
      <span className="at-c-name">
        <Avatar name={row.name} personId={row.personId} hue={hueFromName(row.name)} size={30} />
        <span className="at-who">
          <b>{row.name}</b>
          <span>{row.role}{row.shift ? <span className="kb-w-520"> · {row.shift.start}–{row.shift.end}</span> : null}</span>
        </span>
      </span>
      <span className="at-c-st">
        {edit ? (
          <Chips row={row} busy={busy} onSet={onSet} onCut={onCut} />
        ) : (
          <>
            {row.state === "closed" ? <span className="at-dim">—</span> : <StatusTag state={row.state} />}
            {sub && <span className="at-sub">{sub}</span>}
          </>
        )}
      </span>
      <span className="at-c-time kb-w-400">{fmtClock(row.inAt) || "—"}</span>
      <span className="at-c-time kb-w-400">{fmtClock(row.outAt) || "—"}</span>
      <span className={cn("at-c-hrs kb-w-460", live && "is-live")} title={live ? "Still clocked in" : undefined}>{hours || "—"}</span>
      <span className="at-c-dist kb-w-520">{row.distanceM != null ? `${row.distanceM} m` : "—"}</span>
    </li>
  );
}

/**
 * The day's roll call: everyone, how their day went and when they came and went. With edit rights
 * an Edit button turns each status into buttons that save the one person straight away; a toast
 * says what changed and offers Undo. Nothing here saves anyone else.
 */
export default function RosterTile({
  rows, shown, filter, onFilter, date, today, onStep, onToday,
  canEdit, edit, onEdit, busyIds, onSet, onCut, toast, mode, onMode, loading,
}) {
  const closed = isSat(date);
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

      {closed && <p className="at-note">Saturday is the office's day off. Anything marked today still counts.</p>}

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
            <Row key={r.personId} row={r} edit={edit} busy={busyIds.has(r.personId)} onSet={onSet} onCut={onCut} />
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

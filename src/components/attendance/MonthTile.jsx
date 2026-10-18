import { useEffect, useRef } from "react";
import { Icons, cn } from "../ui";
import { Tile } from "../bento/Bento";
import { STATE_LABEL, addDays, dayTitle, fmtClock, fmtHoursShort, isSat, monthTitle, monthWeeks, stateOf, workedMinutes } from "../../lib/attendance";
import { parseLocalDate } from "../../constants";
import { tsDate } from "../../utils/date";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BAR = [["present", "var(--kb-good-fill)"], ["late", "var(--kb-warn-fill)"], ["leave", "var(--kb-info-fill)"], ["absent", "var(--kb-bad-fill)"]];

/** What a team day's button says out loud. */
function teamSpeech(iso, c) {
  const bits = BAR.filter(([k]) => c?.[k]).map(([k]) => `${c[k]} ${k === "leave" ? "on leave" : k}`);
  return `${dayTitle(iso)}: ${bits.length ? bits.join(", ") : "no records"}`;
}

/**
 * The month as a calendar you press days on. Two readings of the same grid:
 *   kind="team"  each day carries a little bar of how many were present, late, on leave, absent
 *   kind="me"    each day is painted with how that day went for you, with the times when there is room
 * The chosen day is outlined; the arrow keys move it, PageUp / PageDown change month.
 */
export default function MonthTile({ kind, month, onMonth, date, onPick, today, byDay, days, loading }) {
  const grid = useRef(null);
  const keyed = useRef(false);
  const weeks = monthWeeks(month);
  const inMonth = date >= month.start && date <= month.end;

  // after a key press moved the day (possibly into another month) put focus back on it
  useEffect(() => {
    if (!keyed.current) return;
    const el = grid.current?.querySelector('[data-sel="true"]');
    if (!el) return;                        // the grid is not drawn yet; try again when it is
    keyed.current = false;
    el.focus({ preventScroll: true });
  }, [date, month.start, loading]);

  function onKey(e) {
    const lead = (parseLocalDate(date).getDay() + 6) % 7;      // Monday is 0
    let to = null;
    if (e.key === "ArrowLeft") to = addDays(date, -1);
    else if (e.key === "ArrowRight") to = addDays(date, 1);
    else if (e.key === "ArrowUp") to = addDays(date, -7);
    else if (e.key === "ArrowDown") to = addDays(date, 7);
    else if (e.key === "Home") to = addDays(date, -lead);
    else if (e.key === "End") to = addDays(date, 6 - lead);
    else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      keyed.current = true;
      onMonth(e.key === "PageUp" ? -1 : 1);
      return;
    }
    if (to) { e.preventDefault(); keyed.current = true; onPick(to); }
  }

  const cell = (iso) => {
    const n = Number(iso.slice(8, 10));
    const sel = iso === date;
    const future = iso > today;
    let speech;
    let body = null;
    let tone = "";

    if (kind === "team") {
      const c = byDay[n];
      speech = teamSpeech(iso, c);
      const total = c ? BAR.reduce((s, [k]) => s + (c[k] || 0), 0) : 0;
      body = (
        <span className="at-cell-bar" aria-hidden="true">
          {total > 0 ? BAR.map(([k, color]) => (c[k] ? <i key={k} style={{ flexGrow: c[k], background: color }} /> : null)) : <i style={{ flexGrow: 1 }} className="is-none" />}
        </span>
      );
    } else {
      const d = days.get(iso);
      const state = future ? "none" : stateOf(d?.record, { closed: isSat(iso) });
      const inT = fmtClock(tsDate(d?.clock?.clockedInAt));
      const mins = workedMinutes(d?.clock);
      tone = d?.record || state === "closed" ? state : "";
      speech = `${dayTitle(iso)}: ${future ? "not yet" : STATE_LABEL[state]}${inT ? `, in ${inT}` : ""}${mins != null ? `, ${fmtHoursShort(mins)} worked` : ""}`;
      // the times are drawn from `data-v` by the stylesheet: the button's spoken name already says them
      // (a button's name has to contain the words seen on it, and a sentence cannot contain "08:58 9.7h" cut in two)
      body = (
        <>
          {inT && <span className="at-cell-t" data-v={inT} aria-hidden="true" />}
          {mins != null && <span className="at-cell-h" data-v={fmtHoursShort(mins)} aria-hidden="true" />}
        </>
      );
    }

    return (
      <button
        key={iso}
        type="button"
        data-sel={sel || undefined}
        tabIndex={sel || (!inMonth && iso === month.start) ? 0 : -1}
        className={cn("at-cell", tone && `at-cell--${tone}`, sel && "is-sel", iso === today && "is-today", isSat(iso) && "is-sat", future && "is-future")}
        aria-label={speech}
        aria-pressed={sel}
        aria-current={iso === today ? "date" : undefined}
        onClick={() => onPick(iso)}
      >
        <span className="at-cell-n">{n}</span>
        {body}
      </button>
    );
  };

  return (
    <Tile area="month" icon={<Icons.Calendar size={14} sw={1.8} />} title={kind === "team" ? "Calendar" : "Your month"} loading={loading} align="top" className={cn("at-month", `at-month--${kind}`)}>
      <div className="at-calnav">
        <button type="button" className="at-nav" aria-label="Previous month" onClick={() => onMonth(-1)}><Icons.ChevronLeft size={16} sw={2} /></button>
        <b className="at-calnav-t" aria-live="polite">{monthTitle(month)}</b>
        <button type="button" className="at-nav" aria-label="Next month" onClick={() => onMonth(1)}><Icons.ChevronRight size={16} sw={2} /></button>
      </div>

      <div className="at-cal kb-fill" role="group" aria-label={monthTitle(month)} ref={grid} onKeyDown={onKey} style={{ "--weeks": weeks.length }}>
        <div className="at-cal-dow" aria-hidden="true">
          {DOW.map((d) => <span key={d} className={cn(d === "Sat" && "is-sat")}><span className="kb-w-300">{d}</span><span className="at-d1">{d[0]}</span></span>)}
        </div>
        <div className="at-cal-grid">
          {weeks.flat().map((iso, i) => {
            return iso ? cell(iso) : <span key={`b${i}`} className="at-blank" aria-hidden="true" />;
          })}
        </div>
      </div>

      <div className="at-cal-key" aria-hidden="true">
        {kind === "team"
          ? BAR.map(([k, color]) => <span key={k}><i style={{ background: color }} />{k === "leave" ? "Leave" : k[0].toUpperCase() + k.slice(1)}</span>)
          : [["present", "Present"], ["late", "Late"], ["leave", "Leave"], ["absent", "Absent"]].map(([k, label]) => <span key={k}><i className={`at-sw at-sw--${k}`} />{label}</span>)}
      </div>
    </Tile>
  );
}

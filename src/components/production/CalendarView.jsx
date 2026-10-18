import { useEffect, useMemo, useRef, useState } from "react";
import { Icons, cn } from "../ui";
import { EmptyNote } from "../bento/Bento";
import { StageTag } from "./StageMark";
import { addDays, dayTitle, isSat, monthOf, monthTitle, monthWeeks, shiftMonth } from "../../lib/attendance";
import { dueByDay, isOpen, rampMix, shortDate } from "../../lib/production";
import { parseLocalDate } from "../../constants";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthName = (month) => new Date(month.y, month.m, 1).toLocaleDateString("en-GB", { month: "long" });

function DayRow({ order, when, onOpen }) {
  return (
    <li>
      <button type="button" className="pr-day-row" onClick={() => onOpen(order)}>
        <span className="pr-day-id">{when || order.orderId}</span>
        <span className="pr-day-main">
          <b>{order.customerName || "No customer"}</b>
          <span>{[when && order.orderId, order.styleName, `${Number(order.quantity || 0).toLocaleString()} pcs`].filter(Boolean).join(" · ")}</span>
        </span>
        <StageTag stage={order.stage} short />
      </button>
    </li>
  );
}

/**
 * The month by delivery date: each day shows how many orders are due and a little bar of how far
 * along they are; pressing a day lists them beside it. This is what the old "Timeline & Calendar"
 * tab became: a calendar that fits its tile instead of the whole screen.
 *
 * Orders with no delivery date cannot be on a calendar, so the page says how many there are and
 * offers to show them. The arrow keys move the chosen day, PageUp / PageDown change the month.
 */
export default function CalendarView({ rows, today, onOpen, onNoDate }) {
  const [month, setMonth] = useState(() => monthOf(today));
  const [date, setDate] = useState(today);
  const grid = useRef(null);
  const keyed = useRef(false);

  const byDay = useMemo(() => dueByDay(rows), [rows]);
  const undated = useMemo(() => rows.filter((o) => !o.deliveryDate).length, [rows]);
  const weeks = monthWeeks(month);
  const dayRows = byDay.get(date) || [];
  const inMonth = date >= month.start && date <= month.end;
  // When the chosen day has nothing, the pane lists what is due in the month instead of sitting empty.
  const monthRows = useMemo(
    () => [...byDay.entries()]
      .filter(([iso]) => iso >= month.start && iso <= month.end)
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([iso, list]) => list.map((o) => ({ o, iso }))),
    [byDay, month],
  );

  useEffect(() => {
    if (!keyed.current) return;
    const el = grid.current?.querySelector('[data-sel="true"]');
    if (!el) return;
    keyed.current = false;
    el.focus({ preventScroll: true });
  }, [date, month.start]);

  const goDate = (iso) => {
    setDate(iso);
    const m = monthOf(iso);
    if (m.start !== month.start) setMonth(m);
  };
  const stepMonth = (by) => {
    const m = shiftMonth(month, by);
    setMonth(m);
    const t = monthOf(today);
    setDate(t.y === m.y && t.m === m.m ? today : m.start);
  };

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
      stepMonth(e.key === "PageUp" ? -1 : 1);
      return;
    }
    if (to) { e.preventDefault(); keyed.current = true; goDate(to); }
  }

  const cell = (iso) => {
    const list = byDay.get(iso) || [];
    const n = Number(iso.slice(8, 10));
    const sel = iso === date;
    const mix = rampMix(list);
    const late = iso < today && list.some(isOpen);
    return (
      <button
        key={iso}
        type="button"
        data-sel={sel || undefined}
        tabIndex={sel || (!inMonth && iso === month.start) ? 0 : -1}
        className={cn("pr-day-c", sel && "is-sel", iso === today && "is-today", isSat(iso) && "is-sat", list.length > 0 && "has", late && "is-late")}
        aria-label={`${dayTitle(iso)}: ${list.length ? `${list.length} due` : "nothing due"}`}
        aria-pressed={sel}
        aria-current={iso === today ? "date" : undefined}
        onClick={() => goDate(iso)}
      >
        <span className="pr-day-n">{n}</span>
        {/* the count is drawn from data-v: the button's spoken name already says it, and a name has to contain the words seen on the button */}
        {list.length > 0 && <span className="pr-day-k" data-v={list.length} aria-hidden="true" />}
        {list.length > 0 && (
          <span className="pr-day-mix" aria-hidden="true">
            {mix.map((c, i) => (c ? <i key={i} className={`pr-r${i + 1}`} style={{ flexGrow: c }} /> : null))}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="pr-cal">
      <div className="pr-cal-main">
        <div className="pr-cal-nav">
          <button type="button" className="pr-nav" aria-label="Previous month" onClick={() => stepMonth(-1)}><Icons.ChevronLeft size={16} sw={2} /></button>
          <b aria-live="polite">{monthTitle(month)}</b>
          <button type="button" className="pr-nav" aria-label="Next month" onClick={() => stepMonth(1)}><Icons.ChevronRight size={16} sw={2} /></button>
          {month.start !== monthOf(today).start && (
            <button type="button" className="pr-pill" onClick={() => { setMonth(monthOf(today)); setDate(today); }}>Today</button>
          )}
        </div>

        <div className="pr-cal-grid-wrap" role="group" aria-label={monthTitle(month)} ref={grid} onKeyDown={onKey} style={{ "--weeks": weeks.length }}>
          <div className="pr-cal-dow" aria-hidden="true">
            {DOW.map((d) => <span key={d} className={cn(d === "Sat" && "is-sat")}><span className="pr-d3">{d}</span><span className="pr-d1">{d[0]}</span></span>)}
          </div>
          <div className="pr-cal-grid">
            {weeks.flat().map((iso, i) => (iso ? cell(iso) : <span key={`b${i}`} className="pr-blank" aria-hidden="true" />))}
          </div>
        </div>
      </div>

      <div className="pr-day">
        <div className="pr-day-h">
          <b>{dayTitle(date)}</b>
          <span>{dayRows.length ? `${dayRows.length} due` : "none due"}</span>
        </div>

        {dayRows.length > 0 ? (
          <ul className="pr-day-list" tabIndex={0} aria-label={`Orders due ${dayTitle(date)}`}>
            {dayRows.map((o) => <DayRow key={o.id} order={o} onOpen={onOpen} />)}
          </ul>
        ) : monthRows.length > 0 ? (
          <>
            <p className="pr-day-sub">Nothing is due on this day. Due in {monthName(month)}:</p>
            <ul className="pr-day-list" tabIndex={0} aria-label={`Orders due in ${monthTitle(month)}`}>
              {monthRows.map(({ o, iso }) => <DayRow key={o.id} order={o} when={shortDate(iso)} onOpen={onOpen} />)}
            </ul>
          </>
        ) : (
          <EmptyNote icon={<Icons.Calendar size={20} sw={1.5} />}>Nothing is due in {monthName(month)}.</EmptyNote>
        )}

        {undated > 0 && onNoDate && (
          <button type="button" className="pr-undated" onClick={onNoDate}>
            <span>{undated} order{undated === 1 ? " has" : "s have"} no delivery date</span>
            <Icons.ArrowRight size={13} sw={2} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

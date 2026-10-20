/**
 * The month on the content calendar: six rows of seven day boxes (fewer when the month needs fewer), each showing the work planned
 * that day as small chips.
 *
 * What a box is: the day number (a button, the one thing a keyboard stops at), the chips, and a small + that shows when the pointer
 * is over the box. The chips and the + are shortcuts for a mouse (a chip opens its card, the + starts a new one for that day) and
 * are kept out of the Tab order and the screen reader's reading: the same things are in the day pane beside the calendar, where
 * every row is a real button. The arrow keys move the chosen day, Home / End go to the week's ends, PageUp / PageDown change the
 * month (the same keys the date picker uses, the week starting on Sunday).
 *
 * How many chips a box shows depends on the room it was given (measured, so a tall screen shows more than a laptop); a day with
 * more work than fits shows "+N more", which selects the day. A phone's boxes are small squares: a row of coloured dots instead.
 *
 * Nothing here writes anything. Dragging a chip onto another day is reported to the page (`onDropDay`), which saves it.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icons, cn } from "../ui";
import { fmtWords } from "../../lib/calendar";
import { DRAG_TYPE, chipSplit, keyTarget, titleOf } from "../../lib/contentCalendar";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HEAD = 27;      // the day number's row and the box's own padding, in px
const LINE = 19;      // a chip and the gap under it

const typeClass = (item) => `mk-t-${item.type.toLowerCase()}`;
const chipName = (item) => [titleOf(item), item.type, item.timeSlot].filter(Boolean).join(" · ");

export default function MonthGrid({
  cells, byDate, today, date, label, canEdit, phone,
  onGo, onOpen, onAdd,
  drag, over, onDragStart, onDragEnd, onOver, onDropDay,
}) {
  const wrap = useRef(null);
  const keyed = useRef(false);
  const [room, setRoom] = useState(2);
  const rows = cells.length / 7;

  // how many chips a box can hold, from the room it was really given
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const box = el.querySelector(".mk-cell");
      if (box) setRoom(Math.floor((box.clientHeight - HEAD) / LINE));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows]);

  // after a key moved the chosen day, the cursor goes with it (and only then: a click must not steal it)
  useEffect(() => {
    if (!keyed.current) return;
    const el = wrap.current?.querySelector('[data-sel="true"]');
    if (!el) return;
    keyed.current = false;
    el.focus({ preventScroll: true });
  }, [date, label]);

  function onKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const to = keyTarget(date, e.key);
    if (!to) return;
    e.preventDefault();
    keyed.current = true;
    onGo(to);
  }

  const inGrid = cells.some((c) => c.iso === date);

  return (
    <div className="mk-gridwrap" role="group" aria-label={label} ref={wrap} onKeyDown={onKey} style={{ "--rows": rows }}>
      <div className="mk-dow" aria-hidden="true">
        {DOW.map((d, i) => <span key={d} className={cn(i === 6 && "is-sat")}><span className="mk-d3">{d}</span><span className="mk-d1">{d[0]}</span></span>)}
      </div>
      <div className="mk-grid">
        {cells.map(({ iso, day, inMonth }, at) => {
          const list = byDate.get(iso) || [];
          const sel = iso === date;
          const { shown, more } = chipSplit(list.length, room);
          return (
            <div
              key={iso}
              data-iso={iso}
              className={cn("mk-cell", !inMonth && "is-out", iso === today && "is-today", at % 7 === 6 && "is-sat", sel && "is-sel", list.length > 0 && "has", over === iso && "is-over")}
              onClick={() => onGo(iso)}
              onDragOver={(e) => { if (!drag) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== iso) onOver(iso); }}
              onDragLeave={(e) => { if (drag && !e.currentTarget.contains(e.relatedTarget)) onOver(null); }}
              onDrop={(e) => { if (!drag) return; e.preventDefault(); onDropDay(iso); }}
            >
              <div className="mk-cell-hd">
                <button
                  type="button"
                  className="mk-num"
                  data-sel={sel || undefined}
                  tabIndex={sel || (!inGrid && at === 0) ? 0 : -1}
                  aria-label={`${fmtWords(iso)}: ${list.length ? `${list.length} planned` : "nothing planned"}`}
                  aria-pressed={sel}
                  aria-current={iso === today ? "date" : undefined}
                  onClick={(e) => { e.stopPropagation(); onGo(iso); }}
                >
                  {day}
                </button>
                {canEdit && !phone && (
                  <button type="button" className="mk-plus" tabIndex={-1} aria-hidden="true" title="Add to this day" onClick={(e) => { e.stopPropagation(); onAdd(iso); }}>
                    <Icons.Plus size={12} sw={2.2} />
                  </button>
                )}
              </div>

              {phone ? (
                list.length > 0 && (
                  <span className="mk-dots" aria-hidden="true">
                    {list.slice(0, 4).map((it) => <i key={it.id} className={typeClass(it)} />)}
                  </span>
                )
              ) : (
                list.length > 0 && (
                  <ul className="mk-chips" aria-hidden="true">
                    {list.slice(0, shown).map((it) => (
                      <li
                        key={it.id}
                        className={cn("mk-chip", typeClass(it), drag?.id === it.id && "is-dragging")}
                        title={chipName(it)}
                        draggable={canEdit}
                        onClick={(e) => { e.stopPropagation(); onOpen(it.id); }}
                        onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, it.id); e.dataTransfer.effectAllowed = "move"; onDragStart(it.id, true); }}
                        onDragEnd={onDragEnd}
                      >
                        <i />
                        <span>{titleOf(it)}</span>
                      </li>
                    ))}
                    {more > 0 && <li className="mk-more">{shown === 0 ? `${more} planned` : `+${more} more`}</li>}
                  </ul>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

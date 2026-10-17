import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icons, cn } from "./ui";
import { useAnchoredPopover } from "../hooks/useAnchoredPopover";
import { kathmanduDate } from "../utils/date";
import {
  WEEKDAYS, WEEKDAY_NAMES, addDays, addMonths, fmtField, fmtWords, monthGrid, monthName, monthShort, parseISO, weekday, withMonth,
} from "../lib/calendar";
import "./controls.css";

/**
 * DatePicker: the date field the new look uses in place of <input type="date">.
 *
 * A button that shows the date, and a frosted-glass month under it with the shortcuts a due
 * date usually wants (today, tomorrow, in a week, none). The value is a plain "YYYY-MM-DD"
 * string, or "" for no date, exactly what the native input gave.
 *
 *   <DatePicker value={form.dueDate} onChange={(v) => …} label="Due date" />
 *
 * The button's spoken name is "<label>: <the date as shown>" (the visible words are part of
 * it); each day in the month is named in full ("Sunday 18 October 2026").
 *
 * Keyboard: arrow keys move by a day or a week, Home / End to the start / end of the week,
 * PageUp / PageDown by a month (with Shift, a year), Enter picks, Escape closes only the
 * calendar. "Today" is the office's today (Kathmandu), not the browser's, so it agrees with
 * the "due today" and "late" the Tasks page shows. Saturday, the day off, is drawn quieter.
 * Click the month's name to jump to another month or year.
 */

const FOCUSABLE = "button:not([disabled]), [tabindex]:not([tabindex='-1'])";

export default function DatePicker({
  value = "",
  onChange,
  label,
  id,
  placeholder = "No date",
  disabled = false,
  clearable = true,
  align = "start",
  today: todayProp,
  className,
}) {
  const uid = useId();
  const today = todayProp || kathmanduDate();
  const current = parseISO(value) ? value : "";

  const [open, setOpen] = useState(false);
  const [view, setView] = useState("days");            // "days" | "months"
  const [cursor, setCursor] = useState(current || today);   // the day the keyboard is on; its month is the one shown
  const [yearOf, setYearOf] = useState(parseISO(current || today).y);   // the year the month chooser shows
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const keyboard = useRef(false);

  const close = useCallback((refocus) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const { pos } = useAnchoredPopover({
    open, triggerRef, popRef, onDismiss: () => close(false), estimate: 380, exactWidth: 300, align, maxHeight: 440,
  });

  function openPicker() {
    if (disabled) return;
    const start = current || today;
    setCursor(start);
    setYearOf(parseISO(start).y);
    setView("days");
    keyboard.current = true;          // the picker is opened by someone who may be on the keyboard: put focus on the day
    setOpen(true);
  }

  // focus goes to the day the cursor is on, when the picker opens and as the keyboard moves
  useEffect(() => {
    if (!open || !pos || view !== "days" || !keyboard.current) return;
    popRef.current?.querySelector('[data-cursor="true"]')?.focus({ preventScroll: true });
  }, [open, pos, cursor, view]);

  const pick = (iso) => {
    if (iso !== current) onChange?.(iso);
    close(true);
  };

  const move = (to) => { keyboard.current = true; setCursor(to); };

  function onGridKey(e) {
    const k = e.key;
    let to = null;
    if (k === "ArrowLeft") to = addDays(cursor, -1);
    else if (k === "ArrowRight") to = addDays(cursor, 1);
    else if (k === "ArrowUp") to = addDays(cursor, -7);
    else if (k === "ArrowDown") to = addDays(cursor, 7);
    else if (k === "Home") to = addDays(cursor, -weekday(cursor));
    else if (k === "End") to = addDays(cursor, 6 - weekday(cursor));
    else if (k === "PageUp") to = addMonths(cursor, e.shiftKey ? -12 : -1);
    else if (k === "PageDown") to = addMonths(cursor, e.shiftKey ? 12 : 1);
    // Enter and Space press the focused day, which is the cursor's: a button does that by itself
    if (to) { e.preventDefault(); move(to); }
  }

  // Escape closes only the picker (marked handled so a dialog around it stays open); Tab out of it closes it too
  function onPopKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(true); return; }
    if (e.key !== "Tab") return;
    const nodes = [...popRef.current.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if ((!e.shiftKey && document.activeElement === last) || (e.shiftKey && document.activeElement === first)) close(true);
  }

  function onTriggerKey(e) {
    if (disabled || open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); openPicker(); }
  }

  const shown = parseISO(cursor);
  const grid = monthGrid(shown.y, shown.m);
  const rows = Array.from({ length: 6 }, (_, r) => grid.slice(r * 7, r * 7 + 7));
  const heading = `${monthName(shown.m)} ${shown.y}`;
  const shift = (n) => { keyboard.current = false; setCursor((c) => addMonths(c, n)); };

  return (
    <div className={cn("kdp", open && "is-open", disabled && "is-disabled", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="kdp-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${uid}-pop` : undefined}
        aria-label={label ? `${label}: ${current ? fmtField(current) : placeholder}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : openPicker())}
        onKeyDown={onTriggerKey}
      >
        <Icons.Calendar size={16} sw={1.8} aria-hidden="true" />
        <span className={cn("kdp-val", !current && "is-ph")}>{current ? fmtField(current) : placeholder}</span>
      </button>
      {current && !disabled && clearable && (
        <button type="button" className="kdp-clear" aria-label={`Clear the ${label ? label.toLowerCase() : "date"}`} onClick={() => { onChange?.(""); triggerRef.current?.focus({ preventScroll: true }); }}>
          <Icons.X size={14} sw={2} aria-hidden="true" />
        </button>
      )}

      {open && pos && createPortal(
        <div
          ref={popRef}
          id={`${uid}-pop`}
          role="dialog"
          aria-label={label || "Choose a date"}
          className={cn("kdp-pop", pos.up && "is-up")}
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
          onKeyDown={onPopKey}
        >
          <div className="kdp-head">
            <button type="button" className="kdp-nav" aria-label={view === "days" ? "Previous month" : "Previous year"} onClick={() => (view === "days" ? shift(-1) : setYearOf((y) => y - 1))}>
              <Icons.ChevronLeft size={16} sw={2} aria-hidden="true" />
            </button>
            <button type="button" className="kdp-title" aria-live="polite" onClick={() => { setYearOf(shown.y); setView((v) => (v === "days" ? "months" : "days")); }}>
              {view === "days" ? heading : yearOf}
              <Icons.ChevronDown size={14} sw={2} className={cn("kdp-title-chev", view === "months" && "is-up")} aria-hidden="true" />
            </button>
            <button type="button" className="kdp-nav" aria-label={view === "days" ? "Next month" : "Next year"} onClick={() => (view === "days" ? shift(1) : setYearOf((y) => y + 1))}>
              <Icons.ChevronRight size={16} sw={2} aria-hidden="true" />
            </button>
          </div>

          {view === "days" ? (
            <div className="kdp-cal" role="grid" aria-label={heading} onKeyDown={onGridKey}>
              <div className="kdp-dow" role="row">
                {WEEKDAYS.map((w, i) => (
                  <span key={i} role="columnheader" aria-label={WEEKDAY_NAMES[i]} className={cn(i === 6 && "is-off")}>{w}</span>
                ))}
              </div>
              {rows.map((row, r) => (
                <div className="kdp-week" role="row" key={r}>
                  {row.map((c, i) => {
                    const isCursor = c.iso === cursor;
                    return (
                      <div role="gridcell" key={c.iso} aria-selected={c.iso === current}>
                        <button
                          type="button"
                          tabIndex={isCursor ? 0 : -1}
                          data-cursor={isCursor || undefined}
                          aria-label={fmtWords(c.iso)}
                          aria-current={c.iso === today ? "date" : undefined}
                          className={cn("kdp-day", !c.inMonth && "is-out", i === 6 && "is-off", c.iso === today && "is-today", c.iso === current && "is-sel")}
                          onClick={() => pick(c.iso)}
                        >
                          {c.day}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="kdp-months" role="group" aria-label={`Months of ${yearOf}`}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={cn("kdp-mon", shown.y === yearOf && shown.m === m && "is-sel", parseISO(today).y === yearOf && parseISO(today).m === m && "is-today")}
                  aria-label={`${monthName(m)} ${yearOf}`}
                  onClick={() => { keyboard.current = true; setCursor(withMonth(cursor, yearOf, m)); setView("days"); }}
                >
                  {monthShort(m)}
                </button>
              ))}
            </div>
          )}

          <div className="kdp-foot">
            <button type="button" className="kdp-chip" onClick={() => pick(today)}>Today</button>
            <button type="button" className="kdp-chip" onClick={() => pick(addDays(today, 1))}>Tomorrow</button>
            <button type="button" className="kdp-chip" onClick={() => pick(addDays(today, 7))}>In a week</button>
            {clearable && current && <button type="button" className="kdp-chip kdp-chip--quiet" onClick={() => pick("")}>No date</button>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

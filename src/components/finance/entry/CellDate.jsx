/**
 * The date in a row of fields: typed, the way a spreadsheet takes one, in whichever calendar the page is set to.
 *
 * At rest it reads like the table's own dates ("22 Sept 2026" or "6 Kartik 2083"). Pressed or tabbed into, it shows the numeric
 * date ("2026-10-22") already selected, so typing replaces it; "22" is the 22nd of the month it is in and "22/10" adds the month
 * (see lib/entryDate.js). Up and Down move it a day, Page Up and Page Down a month. In A.D. a small calendar button opens the
 * date picker for anyone who would rather point; B.S. has no calendar to point at, so it is typed only (the A.D. day is the
 * tooltip). The value is always the A.D. "YYYY-MM-DD" the books keep.
 *
 * What is typed and is not a date is kept in the box, in red, with the reason under it; the row's date is then empty, so it cannot
 * be saved until the box holds a date (going back to the old one quietly would save a record on a day she did not mean).
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import DatePicker from "../../DatePicker";
import useDateMode from "../../../hooks/useDateMode";
import { editableDate, nudgeDate, readTypedDate } from "../../../lib/entryDate";
import { fmtDateBS } from "../../../utils/fiscalYear";
import { kathmanduDate } from "../../../utils/date";
import { fmtField } from "../../../lib/calendar";
import { Icons, cn } from "../../ui";

export default function CellDate({ id, value, onChange, label = "Date", disabled, invalid }) {
  const [mode, , show] = useDateMode();
  const input = useRef(null);
  const wrap = useRef(null);
  const msgId = useId();
  const fresh = useRef(false);                     // the box has just been pressed into: the mouse-up must not undo the selecting
  const reselect = useRef(false);                  // select what is in the box once it has been drawn with its new text
  const [text, setText] = useState(null);              // null: at rest, showing the date as the table writes it
  const [wrong, setWrong] = useState(null);            // why the text is not a date (null: it is, or nothing is typed)
  const [quiet, setQuiet] = useState(false);           // …and Escape has put that bubble away (the box stays red)
  const today = kathmanduDate();

  // Selecting is done as the new text lands, before the next key can arrive: a key typed the instant the box is pressed into must replace
  // the date, not be put after it (a frame later is too late for someone who tabs in and types).
  useLayoutEffect(() => {
    if (!reselect.current) return;
    reselect.current = false;
    input.current?.select();
  }, [text]);

  // the calendar was switched while this was being typed in: what was typed was for the other one
  useEffect(() => { setText(null); setWrong(null); }, [mode]);
  // the calendar button is for the mouse: a keyboard types the date (and Up / Down / Page Up / Page Down move it), so Tab goes straight on
  useEffect(() => { wrap.current?.querySelector(".kdp-trigger")?.setAttribute("tabindex", "-1"); });

  const other = value ? (mode === "ad" ? `${fmtDateBS(value)} B.S.` : `${fmtField(value)} A.D.`) : "";

  /** Take what is typed. Returns false (and says why) when it is not a date. */
  function commit() {
    if (text === null) return true;
    if (text.trim() === "") { setText(null); setWrong(null); return true; }
    const read = readTypedDate(text, { mode, base: value });
    if (!read.iso) {
      setWrong(read.why);
      setQuiet(false);
      if (value) onChange("");                  // the row no longer has a date: the text stays, and the row cannot be saved with it
      return false;
    }
    setWrong(null);
    setText(null);
    if (read.iso !== value) onChange(read.iso);
    return true;
  }

  function move(step) {
    const read = text !== null ? readTypedDate(text, { mode, base: value }) : null;
    const base = read?.iso || value;
    const next = nudgeDate(base || today, step, mode);
    onChange(next);
    setWrong(null);
    reselect.current = true;
    setText(editableDate(next, mode));
  }

  function onKeyDown(e) {
    if (disabled) return;
    fresh.current = false;
    reselect.current = false;
    if (e.key === "Escape" && wrong && !quiet) { e.preventDefault(); setQuiet(true); return; }
    if (e.key === "Enter" && !e.altKey && !e.shiftKey) {
      // what is typed is taken before the cursor moves on, or the row saves (Ctrl + Enter); a date that is not a date stops both,
      // and is selected, so that typing again replaces it
      if (!commit()) { e.preventDefault(); input.current?.select(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const step = { ArrowUp: { days: 1 }, ArrowDown: { days: -1 }, PageUp: { months: 1 }, PageDown: { months: -1 } }[e.key];
    if (step) { e.preventDefault(); move(step); }
  }

  function onFocus() {
    fresh.current = true;
    reselect.current = true;
    // text that was not a date is still there to be put right; otherwise the box shows the date to type over
    if (text !== null) input.current?.select();
    else setText(editableDate(value, mode));
  }

  const bad = Boolean(wrong) || invalid;
  const said = wrong && !quiet;
  return (
    <div ref={wrap} className={cn("fe-date", mode === "bs" && "is-bs", bad && "is-bad")}>
      <input
        ref={input}
        id={id}
        type="text"
        className="fe-in"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        placeholder="Date"
        aria-label={`${label}${value ? `: ${show(value)}` : ""}`}
        aria-invalid={bad || undefined}
        aria-describedby={said ? msgId : undefined}
        data-said={said ? "" : undefined}
        title={wrong || other || undefined}
        value={text !== null ? text : (value ? show(value) : "")}
        onFocus={onFocus}
        onMouseUp={(e) => { if (fresh.current) e.preventDefault(); fresh.current = false; }}
        onChange={(e) => { setText(e.target.value); setWrong(null); setQuiet(false); }}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      {said ? (
        <div id={msgId} className="fe-msg" role="alert">
          <Icons.Alert size={14} sw={1.9} aria-hidden="true" />
          <span>{wrong}</span>
        </div>
      ) : null}
      {mode === "ad" && (
        <span className="fe-cal" data-flow-skip>
          <DatePicker
            variant="pill" clearable={false} disabled={disabled} label="Pick the date" placeholder="Pick a date" value={value} shortcuts={[["Today", today]]}
            onChange={(iso) => { setText(null); setWrong(null); onChange(iso); requestAnimationFrame(() => input.current?.focus({ preventScroll: true })); }}
          />
        </span>
      )}
    </div>
  );
}

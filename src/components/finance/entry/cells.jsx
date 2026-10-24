/**
 * The controls a row of fields is made of. Each is one small, short box that fits a table column: a dropdown, a text box, an amount,
 * a tick, a paperclip. They are the same controls the cards use (Select, Suggest, the keyboard flow), drawn flat so a row of them
 * reads like a row of a spreadsheet. `invalid` is the box the row is complaining about.
 */
import { useRef } from "react";
import Select from "../../Select";
import { Seg } from "../../EditCard";
import { Icons, cn } from "../../ui";
import { advance, thenAdvance } from "../flow";
import { useCurrency } from "../../../context/CurrencyContext";
import { typedAmount } from "../../../lib/financeEntry";

/**
 * A dropdown cell. A choice moves the cursor on to the next field, as it does in the cards; so does keeping the choice that was there
 * (Enter to open, Enter to keep: the defaults are what most rows use). `then` says where to go instead when a choice makes a new field appear.
 */
export function Pick({ id, label, value, options, onChange, disabled, invalid, searchable = "auto", minWidth = 200, placeholder, className, then }) {
  const go = then || advance;
  return (
    <Select
      id={id} label={label} variant="pill" className={cn("fe-pick", invalid && "is-bad", className)} value={value} options={options} on={false}
      onChange={thenAdvance(onChange, go)} onKeep={go} disabled={disabled} searchable={searchable} minWidth={minWidth} placeholder={placeholder}
    />
  );
}

/**
 * Two boxes in one column (a category and a note, a supplier and what was bought). Side by side while the column has room for both; a column too
 * narrow for that stacks them, and the row grows by a line rather than hide a field. The outer box is what the width is asked of (a box cannot
 * query itself).
 */
export function Pair({ children }) {
  return <div className="fe-what"><div className="fe-what-in">{children}</div></div>;
}

/** A short choice between two or three things, one pill split in parts (Out | In). The arrow keys change it. */
export function Toggle({ label, value, options, onChange, disabled, className }) {
  return <Seg label={label} value={value} options={options} onChange={onChange} disabled={disabled} className={cn("fe-seg", className)} />;
}

/** A line of text. */
export function TextBox({ id, label, value, onChange, placeholder, disabled, invalid, className }) {
  return (
    <input
      id={id} type="text" className={cn("fe-in", invalid && "is-bad", className)} value={value} placeholder={placeholder} disabled={disabled}
      aria-label={label} aria-invalid={invalid || undefined} autoComplete="off" spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * An amount: right-aligned, tabular figures, no spinner and no mouse-wheel (a number box under a scrolling table changes its value
 * when the wheel passes over it). Text with a numeric keypad. What is not a number is not taken (`onRefuse` hears what was typed, so the
 * row can say so). While the table is showing money in another currency (pounds), the rupee sign is written in the box: the books, and
 * this box, are kept in rupees, and a figure typed in pounds would be saved as rupees. (In rupees it says nothing the table does not: and the
 * narrow amount boxes of Purchases and Journal, 88px beside the + button, need the room for a figure in lakhs.)
 */
export function AmountBox({ id, label, value, onChange, onRefuse, placeholder = "0", disabled, invalid, title }) {
  const { currency } = useCurrency();
  const sign = currency !== "NPR";
  return (
    <span className={cn("fe-amt", sign && "has-unit")}>
      {sign ? <span className="fe-unit" aria-hidden="true">₨</span> : null}
      <input
        id={id} type="text" inputMode="decimal" className={cn("fe-in fe-num", invalid && "is-bad")} value={value} placeholder={placeholder} disabled={disabled}
        aria-label={label} aria-invalid={invalid || undefined} title={title} autoComplete="off" spellCheck={false}
        onChange={(e) => {
          const next = typedAmount(e.target.value);
          if (next === null) onRefuse?.(e.target.value);
          else onChange(next);
        }}
      />
    </span>
  );
}

/**
 * A tick box with its word. It is a stop on the way through (`data-flow`): Enter on it ticks it (if it is not) and goes on to the next
 * field (`data-enter="tick"`, see flow.js); Tab goes on without ticking, and Space ticks and unticks as ever.
 */
export function Tick({ id, text, label, checked, onChange, disabled }) {
  return (
    <label className={cn("fe-chk", checked && "is-on")} title={`${text}: Enter or Space ticks it, Tab skips it`}>
      <input id={id} type="checkbox" data-flow data-enter="tick" checked={checked} disabled={disabled} aria-label={label || text} onChange={(e) => onChange(e.target.checked)} />
      <span>{text}</span>
    </label>
  );
}

/**
 * A paperclip that opens the file chooser (a photo or a PDF). It lights up and names the file once there is one.
 * `flow` makes it a stop on the way through (Enter from the field before it lands here), and `onEnter` is what Enter does on it once
 * there is a file: save (before there is one, Enter opens the chooser, which is what the button is for).
 */
export function Clip({ id, file, onFile, disabled, invalid, named, flow, onEnter, label = "Attach the bill" }) {
  const input = useRef(null);
  return (
    <>
      <button
        type="button" id={id} className={cn("fe-clip", file && "has-file", named && "is-named", invalid && "is-bad")} disabled={disabled}
        data-flow={flow ? "" : undefined} aria-invalid={invalid || undefined}
        title={file ? `${file.name}. Press to choose a different file.` : label} aria-label={file ? `${label}: ${file.name}` : label}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !file || !onEnter || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
          e.preventDefault();               // (this is also what stops the button from being "pressed", which would open the chooser again)
          onEnter();
        }}
      >
        <Icons.Paperclip size={14} sw={1.9} aria-hidden="true" />
        {named ? <span className="fe-clip-name">{file ? file.name : label}</span> : null}
      </button>
      <input ref={input} type="file" accept="image/*,application/pdf" hidden tabIndex={-1} onChange={(e) => { onFile(e.target.files?.[0] || null); e.target.value = ""; }} />
    </>
  );
}

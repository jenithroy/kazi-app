/**
 * The three kinds of document as tabs, each with how many there are in the period on screen. A row of pills at every width (there are
 * only three, and short): the arrow keys move between them, Home and End jump to the first and last.
 */
import { useRef } from "react";
import { KINDS, WORDS } from "../../lib/billing";

export default function DocTabs({ value, onChange, counts }) {
  const listRef = useRef(null);

  function onKey(e) {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    const at = KINDS.indexOf(value);
    const next = e.key === "Home" ? 0 : e.key === "End" ? KINDS.length - 1 : (at + (e.key === "ArrowRight" ? 1 : -1) + KINDS.length) % KINDS.length;
    e.preventDefault();
    onChange(KINDS[next]);
    requestAnimationFrame(() => listRef.current?.querySelector('[aria-selected="true"]')?.focus());
  }

  return (
    <div ref={listRef} className="dt-tabs bl-doctabs" role="tablist" aria-label="Kind of document" onKeyDown={onKey}>
      {KINDS.map((k) => (
        <button
          key={k} type="button" role="tab" id={`bl-tab-${k}`} aria-selected={value === k} aria-controls="fin-pane"
          tabIndex={value === k ? 0 : -1} className="dt-tab" onClick={() => onChange(k)}
        >
          {WORDS[k].tab}
          {counts[k] != null && <i>{counts[k]}</i>}
        </button>
      ))}
    </div>
  );
}

/**
 * The small controls the Digitizer's panels are made of. They are plain and compact, read the page's `--kb-*` tokens, and
 * never change a value on their own: a number is taken when Enter is pressed or the box is left, a slider reports as it moves.
 */
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPopover } from "../../hooks/useAnchoredPopover";
import { THREADS, hexToRgb } from "../../lib/embroidery/thread/chart";

const fmt = (v, digits = 1) => (v == null || Number.isNaN(v) ? "" : String(Math.round(v * 10 ** digits) / 10 ** digits));

/** A labelled row: the label on the left, the control on the right. */
export function Row({ label, children, hint, wide }) {
  return (
    <div className={`dz-row${wide ? " dz-row--wide" : ""}`}>
      <span className="dz-row-l">{label}</span>
      <div className="dz-row-c">{children}</div>
      {hint && <p className="dz-hint">{hint}</p>}
    </div>
  );
}

export function Group({ title, children, action }) {
  return (
    <section className="dz-group">
      <header><h3>{title}</h3>{action}</header>
      {children}
    </section>
  );
}

/** A number in a box, with an optional unit; Enter or leaving the box applies it, the arrow keys step it. */
export function NumberField({ value, onChange, min, max, step = 1, digits = 1, unit, disabled, label, placeholder, className }) {
  const [draft, setDraft] = useState(null);
  const ref = useRef(null);
  const handled = useRef(false); // Enter or Escape already dealt with the text, so the blur that follows must not apply it again
  const shown = draft ?? fmt(value, digits);
  const apply = (text) => {
    setDraft(null);
    const n = Number(String(text).replace(",", ".").trim());
    if (text.trim() === "" || Number.isNaN(n)) return;
    const v = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
    if (v !== value) onChange(v);
  };
  return (
    <label className={`dz-num${disabled ? " is-off" : ""} ${className || ""}`}>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={shown}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => {
          if (handled.current) { handled.current = false; return; }
          if (draft !== null) apply(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { handled.current = true; apply(e.currentTarget.value); e.currentTarget.blur(); }
          else if (e.key === "Escape") { handled.current = true; setDraft(null); e.currentTarget.blur(); }
          else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const cur = Number(String(draft ?? value).replace(",", ".")) || 0;
            const next = cur + (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const v = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, Math.round(next * 1e4) / 1e4));
            setDraft(null);
            onChange(v);
          }
        }}
      />
      {unit && <span className="dz-unit" aria-hidden="true">{unit}</span>}
    </label>
  );
}

/** A slider with its value beside it; `onChange` fires as it moves. */
export function Slider({ value, onChange, min = 0, max = 1, step = 0.01, label, format }) {
  return (
    <div className="dz-slider">
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{format ? format(value) : fmt(value, 2)}</output>
    </div>
  );
}

/** A row of buttons of which one is chosen. */
export function Segmented({ value, onChange, options, label, size }) {
  return (
    <div className={`dz-seg${size ? ` dz-seg--${size}` : ""}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? "is-on" : ""} onClick={() => onChange(o.value)} title={o.title} disabled={o.disabled}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, children, disabled }) {
  const id = useId();
  return (
    <label className={`dz-toggle${disabled ? " is-off" : ""}`} htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="dz-toggle-box" aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

/** A thread colour: a swatch that opens the chart (and a box for any colour). `used` lists the colours already in the design. */
export function ColorField({ value, onChange, onChangeEnd, used = [], label = "Colour", disabled }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const pop = useRef(null);
  const { pos } = useAnchoredPopover({ open, triggerRef: trigger, popRef: pop, onDismiss: () => setOpen(false), estimate: 330, exactWidth: 252, maxHeight: 420 });
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  const take = (c) => { onChange(c); };
  const shown = open && !!pos;
  // The chart is a dialog: when it opens, keyboard focus goes into it.
  useEffect(() => {
    if (!shown) return;
    pop.current?.querySelector(".dz-swatch.is-on, .dz-swatch, input")?.focus();
  }, [shown]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const onPopKey = (e) => {
    const root = pop.current;
    if (!root) return;
    if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); return; }
    if (e.key === "Tab") {
      // Keep Tab inside the chart: from the last control it goes to the first, and back.
      const items = [...root.querySelectorAll("button:not([disabled]), input:not([disabled])")];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if (e.key.startsWith("Arrow") && document.activeElement?.classList?.contains("dz-swatch")) {
      // Arrow keys move between the swatches (the nearest one in that direction).
      const all = [...root.querySelectorAll(".dz-swatch")];
      const cur = document.activeElement.getBoundingClientRect();
      const cx = cur.left + cur.width / 2, cy = cur.top + cur.height / 2;
      let best = null, bd = Infinity;
      for (const el of all) {
        if (el === document.activeElement) continue;
        const r = el.getBoundingClientRect();
        const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
        const ahead = e.key === "ArrowRight" ? dx > 2 && Math.abs(dy) < cur.height / 2 : e.key === "ArrowLeft" ? dx < -2 && Math.abs(dy) < cur.height / 2 : e.key === "ArrowDown" ? dy > 2 : dy < -2;
        if (!ahead) continue;
        const d = e.key === "ArrowRight" || e.key === "ArrowLeft" ? Math.abs(dx) + Math.abs(dy) * 4 : Math.abs(dy) * 4 + Math.abs(dx);
        if (d < bd) { bd = d; best = el; }
      }
      if (best) { e.preventDefault(); best.focus(); }
    }
  };
  return (
    <>
      <button type="button" ref={trigger} className="dz-color" aria-label={`${label}: ${value}`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        <span className="dz-color-sw" style={{ background: value }} />
        <span className="dz-color-hex">{value}</span>
      </button>
      {open && pos && createPortal(
        <div ref={pop} className="dz-pop dz-chart" role="dialog" aria-label="Thread colours" onKeyDown={onPopKey} style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxH }}>
          {used.length > 0 && (
            <>
              <p className="dz-pop-h">In this design</p>
              <div className="dz-swatches">
                {used.map((c) => (
                  <button key={c} type="button" className={`dz-swatch${c === value ? " is-on" : ""}`} style={{ background: c }} title={c} aria-label={c} onClick={() => { take(c); onChangeEnd?.(); }} />
                ))}
              </div>
            </>
          )}
          <p className="dz-pop-h">Thread colours</p>
          <div className="dz-swatches">
            {THREADS.map((t) => (
              <button key={t.hex} type="button" className={`dz-swatch${t.hex === value ? " is-on" : ""}`} style={{ background: t.hex }} title={t.name} aria-label={t.name} onClick={() => { take(t.hex); onChangeEnd?.(); setOpen(false); }} />
            ))}
          </div>
          <p className="dz-pop-h">Any colour</p>
          <div className="dz-hexrow">
            <input
              type="color"
              aria-label="Pick any colour"
              value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
              onChange={(e) => take(e.target.value)}
              onBlur={() => onChangeEnd?.()}
            />
            <input
              type="text"
              aria-label="Colour as hex"
              value={hex}
              maxLength={7}
              onChange={(e) => {
                setHex(e.target.value);
                if (/^#[0-9a-f]{6}$/i.test(e.target.value)) take(e.target.value.toLowerCase());
              }}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export { hexToRgb };

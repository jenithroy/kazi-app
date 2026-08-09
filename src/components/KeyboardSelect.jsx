import { useEffect, useRef, useState } from "react";

// Focus advances through a row the same way for every field: Enter moves to the
// next one. Native <select> breaks that chain — Enter does nothing, only arrow
// keys change the value. This drop-in replacement keeps the same Enter-to-advance
// feel: Enter opens the list, Tab (Shift+Tab reverses) cycles the highlighted
// option while it's open, Enter again confirms, closes, and hands focus onward —
// mirroring focusNextOnEnter in PurchaseRowGroup.jsx, which is why the trigger
// carries [data-kb-select]: that selector is what lets *other* fields' Enter
// presses land on this control instead of skipping over it.
export default function KeyboardSelect({ value, options, onChange, className, style, disabled, placeholder }) {
  const normalized = options.map(o => (typeof o === "string" ? { value: o, label: o } : o));
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  const selectedIndex = normalized.findIndex(o => o.value === value);
  const current = selectedIndex >= 0 ? normalized[selectedIndex] : null;

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.children[highlight]?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  function commit(idx) {
    const opt = normalized[idx];
    if (opt) onChange(opt.value);
    setOpen(false);
    requestAnimationFrame(() => {
      const container = triggerRef.current?.closest("tbody") || triggerRef.current?.closest("form") || document;
      const fields = Array.from(container.querySelectorAll("input, select, [data-kb-select]"))
        .filter(el => !el.disabled);
      const at = fields.indexOf(triggerRef.current);
      fields[at + 1]?.focus();
    });
  }

  function onKeyDown(e) {
    if (disabled) return;

    // Type-ahead, same as native <select>: a letter/digit jumps straight to the
    // next option starting with it, searching past the current selection and
    // wrapping — works whether the list is open or closed.
    if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const n = normalized.length;
      const start = selectedIndex >= 0 ? selectedIndex : -1;
      for (let i = 1; i <= n; i++) {
        const idx = (start + i) % n;
        if (normalized[idx].label.toLowerCase().startsWith(e.key.toLowerCase())) {
          e.preventDefault(); e.stopPropagation();
          onChange(normalized[idx].value);
          setHighlight(idx);
          setOpen(false);
          return;
        }
      }
    }

    if (!open) {
      if (e.key === "Enter") {
        e.preventDefault(); e.stopPropagation();
        setHighlight(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
      }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault(); e.stopPropagation();
      const dir = e.shiftKey ? -1 : 1;
      setHighlight(h => (h + dir + normalized.length) % normalized.length);
    } else if (e.key === "ArrowDown") {
      e.preventDefault(); e.stopPropagation();
      setHighlight(h => (h + 1) % normalized.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault(); e.stopPropagation();
      setHighlight(h => (h - 1 + normalized.length) % normalized.length);
    } else if (e.key === "Enter") {
      e.preventDefault(); e.stopPropagation();
      commit(highlight);
    } else if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%" }}>
      <button
        ref={triggerRef}
        type="button"
        data-kb-select
        className={className}
        disabled={disabled}
        onClick={() => { if (!disabled) { setHighlight(selectedIndex >= 0 ? selectedIndex : 0); setOpen(o => !o); } }}
        onKeyDown={onKeyDown}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
          width: "100%", textAlign: "left", cursor: disabled ? "not-allowed" : "pointer",
          appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
          font: "inherit", color: "inherit",
          ...style,
        }}
      >
        <span>{current ? current.label : (placeholder || "")}</span>
        <span style={{ fontSize: 10, opacity: .6, flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: "absolute", top: "calc(100% + 3px)", left: 0, zIndex: 40,
            minWidth: "100%", background: "#fff", border: "1.5px solid var(--line-strong)",
            borderRadius: 8, boxShadow: "0 6px 18px rgba(0,0,0,.14)", overflow: "hidden",
            maxHeight: 220, overflowY: "auto",
          }}
        >
          {normalized.map((o, i) => (
            <div
              key={o.value}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={e => { e.preventDefault(); commit(i); }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: "6px 10px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
                background: i === highlight ? "var(--mint-soft)" : "transparent",
                color: i === highlight ? "var(--mint-deep)" : "var(--ink)",
                fontWeight: o.value === value ? 600 : 400,
              }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

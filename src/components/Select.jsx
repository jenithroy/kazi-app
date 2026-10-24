import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icons, cn } from "./ui";
import { useAnchoredPopover } from "../hooks/useAnchoredPopover";
import "./controls.css";

/**
 * Select: the dropdown the new look uses in place of the browser's own <select>.
 *
 * A button that shows the choice, and a frosted-glass list under it. It is the
 * "select-only combobox" pattern: the button keeps focus and the arrow keys move a
 * highlight through the list (`aria-activedescendant`), so a screen reader and a keyboard
 * get everything a mouse does. With many options (people, customers) a search box sits at
 * the top of the list and takes over the keys.
 *
 *   <Select value={id} onChange={setId} label="Assigned to"
 *           options={[{ value, label, icon?, dot?, hint?, disabled? }]} />
 *
 * `variant="field"` is a form control (40px, in a dialog); `variant="pill"` is a filter in a
 * page's header row. The list is portalled to <body> so no dialog or scrolling pane can clip
 * it, and it opens upward when there is no room below. Escape closes only the list, never a
 * dialog it sits in (the key is marked as handled before the dialog sees it).
 *
 * An option with `value: ""` is how a caller says "none" / "any"; `placeholder` is what the
 * button reads when nothing (or an unknown value) is chosen. `label` is the control's name for
 * a screen reader (the visible label is the caller's).
 */

const ROW = 34;          // an option's height, matched in controls.css
const ROW_TOUCH = 44;

const norm = (s) => String(s ?? "").toLowerCase();
// What a typed letter is matched against: skip past anything that is not a letter or digit.
const lead = (s) => norm(s).replace(/^[^\p{L}\p{N}]+/u, "");

function stepFrom(list, from, delta) {
  const n = list.length;
  if (!n) return -1;
  let i = from;
  for (let k = 0; k < n; k += 1) {
    i = (i + delta + n) % n;
    if (!list[i].disabled) return i;
  }
  return -1;
}

export default function Select({
  value = "",
  onChange,
  options,
  placeholder = "Choose…",
  label,
  id,
  variant = "field",
  searchable = "auto",
  searchPlaceholder = "Search…",
  emptyText = "No matches",
  disabled = false,
  align = "start",
  minWidth,
  on,
  onKeep,
  className,
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const optId = (i) => `${uid}-o${i}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const typed = useRef({ text: "", at: 0 });

  const canSearch = searchable === "auto" ? options.length > 7 : Boolean(searchable);
  const selected = useMemo(() => options.find((o) => o.value === value) || null, [options, value]);

  const shown = useMemo(() => {
    const q = norm(query).trim();
    if (!q) return options;
    return options.filter((o) => norm(o.label).includes(q) || norm(o.hint).includes(q));
  }, [options, query]);

  const isOn = on ?? (value !== "" && value != null);

  const close = useCallback((refocus) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const { pos } = useAnchoredPopover({
    open, triggerRef, popRef,
    onDismiss: () => close(false),
    estimate: Math.min(320, shown.length * (coarse ? ROW_TOUCH : ROW) + (canSearch ? 50 : 0) + 14),
    minWidth: minWidth || (variant === "pill" ? 220 : 180),
    align,
  });

  function openList() {
    if (disabled) return;
    setQuery("");
    const at = options.findIndex((o) => o.value === value);
    setActive(at >= 0 ? at : stepFrom(options, -1, 1));
    setOpen(true);
  }

  // a search box takes the keys (on a touch screen it does not, so the keyboard stays down)
  useEffect(() => {
    if (open && canSearch && window.matchMedia?.("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
  }, [open, canSearch, pos !== null]);   // eslint-disable-line react-hooks/exhaustive-deps

  // typing narrows the list; the highlight goes back to the first match
  useEffect(() => { if (open) setActive(stepFrom(shown, -1, 1)); }, [query]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function choose(opt) {
    if (!opt || opt.disabled) return;
    if (opt.value !== value) onChange?.(opt.value);
    else onKeep?.(opt.value);              // the choice already held: nothing changes, but a keyboard flow still wants to know it was made
    close(true);
  }

  /* ── keys ────────────────────────────────────────────────────── */
  function onNavKey(e, fromInput) {
    const k = e.key;
    if (k === "ArrowDown") { e.preventDefault(); setActive((i) => stepFrom(shown, i, 1)); }
    else if (k === "ArrowUp") { e.preventDefault(); setActive((i) => stepFrom(shown, i, -1)); }
    else if (k === "PageDown") { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, Math.max(0, i) + 8)); }
    else if (k === "PageUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 8)); }
    else if (k === "Home" && !fromInput) { e.preventDefault(); setActive(stepFrom(shown, -1, 1)); }
    else if (k === "End" && !fromInput) { e.preventDefault(); setActive(stepFrom(shown, 0, -1)); }
    else if (k === "Enter") { e.preventDefault(); choose(shown[active]); }
    else if (k === " " && !fromInput) { e.preventDefault(); choose(shown[active]); }
    else if (k === "Escape") { e.preventDefault(); close(true); }          // handled: a dialog around us must not close
    else if (k === "Tab") { close(true); }                                  // focus returns to the button, then Tab moves on
    else if (!fromInput && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // type-ahead: letters typed in quick succession pick the next option that starts with them
      const now = Date.now();
      const buf = now - typed.current.at > 700 ? k.toLowerCase() : typed.current.text + k.toLowerCase();
      typed.current = { text: buf, at: now };
      const from = buf.length === 1 ? active : active - 1;
      for (let step = 1; step <= shown.length; step += 1) {
        const i = (from + step + shown.length) % shown.length;
        if (!shown[i].disabled && lead(shown[i].label).startsWith(buf)) { e.preventDefault(); setActive(i); break; }
      }
    }
  }

  function onTriggerKey(e) {
    if (disabled) return;
    if (open) { onNavKey(e, false); return; }
    // Ctrl (or Cmd) + Enter is the cards' "I am done, save" from any field: a closed dropdown leaves it for them rather than opening its list
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) return;
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); openList(); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /\S/.test(e.key)) {
      // typing on a closed button opens the list on the first option that starts with the letter
      const i = options.findIndex((o) => !o.disabled && lead(o.label).startsWith(e.key.toLowerCase()));
      if (i >= 0) { e.preventDefault(); setQuery(""); setActive(i); setOpen(true); typed.current = { text: e.key.toLowerCase(), at: Date.now() }; }
    }
  }

  const activeId = open && active >= 0 ? optId(active) : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={canSearch ? undefined : activeId}
        aria-label={label}
        className={cn("ksel", `ksel--${variant}`, open && "is-open", isOn && "is-on", className)}
        disabled={disabled}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onTriggerKey}
      >
        {selected?.icon && <span className="ksel-ico" aria-hidden="true">{selected.icon}</span>}
        {selected?.dot && <i className="ksel-dot" style={{ "--dot": selected.dot }} aria-hidden="true" />}
        <span className={cn("ksel-val", !selected && "is-ph")}>{selected ? selected.label : placeholder}</span>
        <Icons.ChevronDown className="ksel-chev" size={16} sw={2} aria-hidden="true" />
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          className={cn("ksel-pop", pos.up && "is-up")}
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
        >
          {canSearch && (
            <div className="ksel-search">
              <Icons.Search size={15} aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={activeId}
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                value={query}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => onNavKey(e, true)}
              />
            </div>
          )}
          <ul ref={listRef} id={listId} role="listbox" aria-label={label || placeholder} className="ksel-list">
            {shown.map((o, i) => (
              <li
                key={`${i}:${o.value}`}
                id={optId(i)}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                className={cn("ksel-opt", i === active && "is-active", o.value === value && "is-sel", o.disabled && "is-off")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                onMouseMove={() => { if (active !== i && !o.disabled) setActive(i); }}
              >
                {o.icon && <span className="ksel-ico" aria-hidden="true">{o.icon}</span>}
                {o.dot && <i className="ksel-dot" style={{ "--dot": o.dot }} aria-hidden="true" />}
                <span className="ksel-lbl">{o.label}</span>
                {o.hint && <span className="ksel-hint">{o.hint}</span>}
                {o.value === value && <Icons.Check className="ksel-tick" size={15} sw={2.2} aria-hidden="true" />}
              </li>
            ))}
          </ul>
          {shown.length === 0 && <p className="ksel-empty">{emptyText}</p>}
        </div>,
        document.body,
      )}
    </>
  );
}

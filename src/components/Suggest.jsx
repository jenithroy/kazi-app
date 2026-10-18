/**
 * Suggest: a text field that offers matches as you type but lets you type something else.
 *
 * <Select> is for choosing from a fixed list. This is for a name that is usually in a list (a fabric
 * from the library) and sometimes new: the text is the value either way, and picking a suggestion just
 * fills it in. The list is the same frosted glass as <Select>'s, portalled to <body>.
 *
 *   <Suggest value={name} onChange={setName} options={[{ label: "Cotton Terry", hint: "₨ 1,150/kg" }]} />
 *
 * The list opens when the field is pressed or typed in (not merely focused: a dialog focuses its first field when it opens,
 * and a list over the form before anyone has done anything is in the way). Keys: Down / Up move through the matches,
 * Enter picks the highlighted one, or, with the list open and nothing highlighted, just closes it (it never saves the form
 * around it while the list is up; `passEnter` lets the form's own Enter-to-the-next-field take it at once), Escape closes the list
 * only (never the dialog), Tab leaves. With the list closed Enter is the form's.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPopover } from "../hooks/useAnchoredPopover";
import { Icons, cn } from "./ui";
import "./controls.css";

export default function Suggest({ value = "", onChange, options, id, placeholder, disabled, label, maxShown = 40, className, passEnter = false, inputProps }) {
  const uid = useId();
  const listId = `${uid}-list`;
  const optId = (i) => `${uid}-o${i}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef(null);
  const popRef = useRef(null);
  const listRef = useRef(null);

  const q = String(value || "").trim().toLowerCase();
  const shown = useMemo(() => {
    const all = options.filter((o) => !q || o.label.toLowerCase().includes(q));
    if (all.length === 1 && all[0].label.toLowerCase() === q) return [];       // it is already what is typed
    return all.slice(0, maxShown);
  }, [options, q, maxShown]);
  const isOpen = open && shown.length > 0 && !disabled;

  const { pos } = useAnchoredPopover({
    open: isOpen, triggerRef: inputRef, popRef, onDismiss: () => setOpen(false),
    estimate: Math.min(300, shown.length * 34 + 14), minWidth: 220,
  });

  useEffect(() => { setActive(-1); }, [q]);
  useEffect(() => {
    if (isOpen && active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [isOpen, active]);

  function pick(o) {
    if (!o) return;
    onChange(o.value ?? o.label);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) { setOpen(true); return; }
      setActive((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === "ArrowUp" && isOpen) {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && isOpen) {
      if (active >= 0) { e.preventDefault(); pick(shown[active]); }
      else {
        setOpen(false);
        // `passEnter`: the form around is typed straight through (Enter moves to the next field), so with nothing chosen Enter
        // closes the list and goes on to that, instead of needing a second press
        if (!passEnter) e.preventDefault();
      }
    } else if (e.key === "Escape" && isOpen) {
      e.preventDefault();                                   // handled: a dialog around us must not close
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <span className={cn("ec-sug", className)}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={isOpen && active >= 0 ? optId(active) : undefined}
        aria-label={label}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        {...inputProps}
      />
      {isOpen && pos && createPortal(
        <div
          ref={popRef}
          className={cn("ksel-pop", pos.up && "is-up")}
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
        >
          <ul ref={listRef} id={listId} role="listbox" aria-label={label || "Suggestions"} className="ksel-list">
            {shown.map((o, i) => (
              <li
                key={`${i}:${o.label}`}
                id={optId(i)}
                role="option"
                aria-selected={o.label === value}
                className={cn("ksel-opt", i === active && "is-active", o.label === value && "is-sel")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseMove={() => { if (active !== i) setActive(i); }}
              >
                <span className="ksel-lbl">{o.label}</span>
                {o.hint && <span className="ksel-hint">{o.hint}</span>}
                {o.label === value && <Icons.Check className="ksel-tick" size={15} sw={2.2} aria-hidden="true" />}
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </span>
  );
}

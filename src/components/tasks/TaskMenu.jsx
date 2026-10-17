import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icons } from "../ui";

/**
 * The menu behind a card's three dots: open it, finish it, move it to another section,
 * delete it. On a phone this is the only way to move a card, since dragging needs a mouse.
 *
 * It floats over the page (portalled to <body>, positioned from the button that opened
 * it) because the section it came from clips whatever tries to hang outside it. It closes
 * on a click elsewhere, on Escape, and when anything scrolls or the window changes.
 */
export default function TaskMenu({ anchor, task, sections, sectionId, canEdit, canTick, onClose, onOpen, onDone, onMove, onDelete }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);   // the latest one, without re-running the effect below on every render
  closeRef.current = onClose;
  const [pos, setPos] = useState({ top: -999, left: -999 });

  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect();
    const m = ref.current.getBoundingClientRect();
    const room = window.innerHeight - a.bottom;
    const top = room >= m.height + 8 || a.top < m.height ? a.bottom + 4 : a.top - m.height - 4;
    const left = Math.min(Math.max(8, a.right - m.width), window.innerWidth - m.width - 8);
    setPos({ top: Math.max(8, top), left });
  }, [anchor]);

  useEffect(() => {
    const items = () => [...ref.current.querySelectorAll("button:not(:disabled)")];
    items()[0]?.focus();

    const close = () => closeRef.current();
    const onDown = (e) => { if (!ref.current.contains(e.target) && !anchor.contains(e.target)) closeRef.current(); };
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); anchor.focus(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const list = items();
      const i = list.indexOf(document.activeElement);
      list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [anchor]);

  const act = (fn) => () => { onClose(); fn(); };

  return createPortal(
    <div className="tk-menu" role="menu" aria-label={`Options for ${task.title}`} ref={ref} style={{ top: pos.top, left: pos.left }}>
      <button type="button" role="menuitem" onClick={act(() => onOpen(task))}><Icons.Edit size={15} /> Open details</button>
      {canTick && <button type="button" role="menuitem" onClick={act(() => onDone(task))}><Icons.Check size={15} sw={2} /> Mark done</button>}
      {canEdit && sections.length > 1 && (
        <>
          <hr />
          <div className="tk-menu-h" aria-hidden="true">Move to</div>
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              role="menuitemradio"
              aria-checked={s.id === sectionId}
              disabled={s.id === sectionId}
              onClick={act(() => onMove(task, s))}
            >
              {s.id === sectionId ? <Icons.Check size={15} sw={2} /> : <span style={{ width: 15 }} />} {s.label}
            </button>
          ))}
        </>
      )}
      {canEdit && (
        <>
          <hr />
          <button type="button" role="menuitem" className="is-danger" onClick={act(() => onDelete(task))}><Icons.Trash size={15} /> Delete task</button>
        </>
      )}
    </div>,
    document.body,
  );
}

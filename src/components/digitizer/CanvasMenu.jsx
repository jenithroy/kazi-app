/**
 * The menu a right-click opens on the canvas (or on a row of the Objects list). On the picture: trace it by hand, delete it, or
 * delete it together with the shapes made from it. On a shape: duplicate, sew earlier or later, delete. A small pop-up in <body>
 * at the pointer, kept on screen. Arrow keys move, Enter presses, Esc closes; a press outside, a scroll or a resize closes it.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { followsPicture } from "../../lib/digitizer/model";

function itemsFor(api) {
  const { menu, design } = api;
  if (menu.kind === "picture") {
    const shapes = design.objects.filter(followsPicture).length;
    return [
      api.hasImage && { label: "Trace by hand", run: () => api.startTracing() },
      api.hasImage && { sep: true },
      { label: "Delete picture", hint: shapes ? "The shapes made from it stay." : null, danger: true, run: () => api.removeReference(false) },
      shapes > 0 && { label: `Delete picture and ${shapes === 1 ? "its shape" : `its ${shapes} shapes`}`, danger: true, run: () => api.removeReference(true) },
    ].filter(Boolean);
  }
  const ids = menu.ids || [];
  const n = ids.length;
  return [
    { label: n > 1 ? `Duplicate ${n} shapes` : "Duplicate", run: () => api.duplicate(ids) },
    { label: "Sew earlier", hint: "Move it up the list", run: () => api.stepOrder(ids, -1) },
    { label: "Sew later", hint: "Sewn on top of the others", run: () => api.stepOrder(ids, 1) },
    { sep: true },
    { label: n > 1 ? `Delete ${n} shapes` : "Delete", danger: true, run: () => api.removeObjects(ids) },
  ];
}

export default function CanvasMenu({ api }) {
  const { menu } = api;
  const ref = useRef(null);
  const closeRef = useRef(api.closeMenu);
  closeRef.current = api.closeMenu;

  // Placed at the pointer, then moved back inside the window if it hangs out (measured before it is painted, so it never flashes
  // in the wrong place; it is never hidden, or it could not take the keyboard focus).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    el.style.left = `${Math.max(margin, Math.min(menu.x, window.innerWidth - r.width - margin))}px`;
    el.style.top = `${menu.y + r.height + margin > window.innerHeight ? Math.max(margin, menu.y - r.height) : menu.y}px`;
  }, [menu]);

  useEffect(() => {
    const buttons = () => [...ref.current.querySelectorAll("button:not(:disabled)")];
    buttons()[0]?.focus();
    const close = () => closeRef.current();
    const onDown = (e) => { if (!ref.current?.contains(e.target)) close(); };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); document.querySelector(".dz-canvas")?.focus(); return; }
      if (e.key === "Tab") { close(); return; }
      e.stopPropagation(); // what is pressed now is the menu's, not the page's (an arrow key would also nudge the selected shape)
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const list = buttons();
      const i = list.indexOf(document.activeElement);
      const next = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
      list[next]?.focus();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, []);

  const items = itemsFor(api);
  const act = (run) => () => { api.closeMenu(); run(); };

  return createPortal(
    <div
      ref={ref}
      className="dz-menu"
      role="menu"
      aria-label={menu.kind === "picture" ? "The picture" : "The shape"}
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => (it.sep ? <hr key={`s${i}`} /> : (
        <button key={it.label} type="button" role="menuitem" className={it.danger ? "is-danger" : ""} onClick={act(it.run)}>
          <span>{it.label}</span>
          {it.hint && <small>{it.hint}</small>}
        </button>
      )))}
    </div>,
    document.body,
  );
}

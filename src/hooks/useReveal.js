/**
 * Fluent "Reveal": a soft light that follows the pointer and lights the edges of every
 * pane near it, not only the one underneath.
 *
 * The technique is d2phap/fluent-reveal-effect's: a radial gradient centred on the
 * pointer, its strength set by how far the pointer is from each element. That
 * library writes inline background styles and never removes its listeners, so this
 * is the same idea written for React: one listener, the result handed to the
 * stylesheet as custom properties on each pane, and everything removed again on unmount.
 *
 *   --mx / --my   pointer position inside the pane (may be outside its box)
 *   --near        0..1, how close the pointer is to the pane (lights its edge)
 *   --in          1 while the pointer is within reach of the pane (lights its surface)
 *
 * The light is one light: every pane within reach paints the same circle, centred on the
 * pointer, so with the pointer on a pane's edge the glow carries across the gap and onto
 * the neighbour instead of stopping at the border. The circle's own falloff does the fading.
 *
 * Used by the Dashboard's tile grid, the top bar and the profile card. `getItems` returns
 * the panes to light (it is asked on every frame, so panes that appear later are found).
 * While a pop-up is open, the page behind it does not glow (it is under a scrim, and lighting
 * it would only make the pop-up's own glass redo its blur for nothing); the pop-up's own
 * panes say `inModal`.
 *
 * Mouse and pen only. A touch has no hover to follow, so nothing is written and
 * the panes keep their resting look. The glow is light, not movement, so it does
 * not switch off for `prefers-reduced-motion`; the stylesheet only drops its fades.
 */
import { useEffect, useRef } from "react";

/** How far from a pane's edge (px) the pointer starts to light it. */
const REACH = 210;

export function useReveal(getItems, { inModal = false } = {}) {
  const latest = useRef(getItems);
  latest.current = getItems;

  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return undefined;

    let frame = 0;
    let x = 0;
    let y = 0;
    let over = false;           // pointer is somewhere on the page
    const written = new Set();  // panes carrying a non-zero reveal, so they can be put out again

    const paint = () => {
      frame = 0;
      const lit = over && (inModal || !document.querySelector(".kmodal-overlay"));
      const items = Array.from(latest.current?.() || []).filter(Boolean);
      const boxes = items.map((el) => el.getBoundingClientRect());   // read everything first,
      items.forEach((el, i) => {                                      // then write
        const r = boxes[i];
        const dx = Math.max(r.left - x, 0, x - r.right);
        const dy = Math.max(r.top - y, 0, y - r.bottom);
        const near = lit ? Math.max(0, 1 - Math.hypot(dx, dy) / REACH) : 0;
        if (near === 0 && !written.has(el)) return;
        el.style.setProperty("--mx", `${(x - r.left).toFixed(1)}px`);
        el.style.setProperty("--my", `${(y - r.top).toFixed(1)}px`);
        el.style.setProperty("--near", near.toFixed(3));
        el.style.setProperty("--in", near > 0 ? "1" : "0");
        if (near > 0) written.add(el); else written.delete(el);
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };

    const onMove = (e) => {
      if (e.pointerType === "touch") return;
      x = e.clientX;
      y = e.clientY;
      over = true;
      schedule();
    };
    const onLeave = () => { over = false; schedule(); };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("blur", onLeave);
    document.documentElement.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("blur", onLeave);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
      written.forEach((el) => {
        ["--mx", "--my", "--near", "--in"].forEach((p) => el.style.removeProperty(p));
      });
    };
  }, []);
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Where a popover under a button goes, and when it goes away.
 *
 * The popover is portalled to <body> and positioned with `position: fixed` from the button's
 * rectangle, so no dialog or scrolling pane can clip it. It opens downward and flips upward
 * when there is not room below. It is measured before the first paint (so it never flashes
 * in the wrong place), re-measured when the window resizes or anything scrolls, and
 * dismissed by a press anywhere outside both the button and the popover.
 *
 *   const { pos } = useAnchoredPopover({ open, triggerRef, popRef, onDismiss: () => setOpen(false), estimate: 280 });
 *   open && pos && createPortal(<div ref={popRef} style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxH }} />, document.body)
 *
 * `estimate` is how tall the popover wants to be (px), used only to decide up or down when
 * it opens. `exactWidth` fixes the width; otherwise it is the button's width, at least `minWidth`.
 */
export function useAnchoredPopover({
  open, triggerRef, popRef, onDismiss,
  estimate = 280, minWidth = 0, exactWidth, align = "start", maxHeight = 320,
}) {
  const [pos, setPos] = useState(null);
  const wentUp = useRef(false);
  const want = useRef(estimate);
  want.current = estimate;

  const place = useCallback((fresh) => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const gap = 6;
    const margin = 8;
    const width = Math.min(exactWidth || Math.max(r.width, minWidth), vw - margin * 2);
    let left = align === "end" ? r.right - width : r.left;
    left = Math.max(margin, Math.min(left, vw - width - margin));
    const below = vh - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    if (fresh) wentUp.current = below < Math.min(want.current, 240) && above > below;
    const up = wentUp.current;
    setPos({
      left, width, up,
      top: up ? undefined : r.bottom + gap,
      bottom: up ? vh - r.top + gap : undefined,
      maxH: Math.max(140, Math.min(maxHeight, up ? above : below)),
    });
  }, [triggerRef, exactWidth, minWidth, align, maxHeight]);

  useLayoutEffect(() => {
    if (open) place(true);
    else setPos(null);
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (!open) return undefined;
    const again = (e) => { if (e?.target && popRef.current?.contains(e.target)) return; place(false); };
    const down = (e) => {
      if (popRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      dismiss.current?.();
    };
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);
    document.addEventListener("pointerdown", down, true);
    return () => {
      window.removeEventListener("resize", again);
      window.removeEventListener("scroll", again, true);
      document.removeEventListener("pointerdown", down, true);
    };
  }, [open, place, popRef, triggerRef]);

  return { pos, reposition: place };
}

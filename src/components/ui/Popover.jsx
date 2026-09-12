import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconBtn } from "./Btn";
import { placeFloating } from "./floating";
import { Icons } from "./Icons";
import { cn } from "./utils";

/* ── Popover ──────────────────────────────────────────── */
/**
 * A small panel next to the control that opened it: a currency converter on a
 * line item, a list of embellishments to tick, a filter's options. For a list
 * of actions use Menu; for a task that deserves the whole screen use Dialog.
 *
 *   trigger   a function given the props the opening button needs; spread them
 *   children  the contents, or a function given { close }
 *   title     shown in the panel's header, and its name for screen readers
 *   align     "start" lines up with the trigger's left edge, "end" its right
 *   width     the panel's width (default 280)
 *
 * It renders at the end of <body>, flips above the trigger when there is no
 * room below, closes on Escape or a click outside, and puts focus back on the
 * trigger. The page decides what closing means: pass `close` on from children.
 */
export function Popover({ trigger, children, title, align = "start", width = 280, className }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const anchorRef = useRef(null);
  const panelRef = useRef(null);
  const id = `p${useId().replace(/:/g, "")}`;

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setPos(null);
    if (returnFocus) anchorRef.current?.querySelector("button, [tabindex]")?.focus();
  }, []);

  const place = useCallback(() => {
    if (anchorRef.current && panelRef.current) {
      setPos(placeFloating(anchorRef.current, panelRef.current, { align }));
    }
  }, [align]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (panelRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      close(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    const onReflow = () => place();
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    panelRef.current?.querySelector("input, select, textarea, button, [tabindex]")?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, close, place]);

  const triggerProps = {
    onClick: () => (open ? close(false) : setOpen(true)),
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    "aria-controls": open ? id : undefined,
  };

  return (
    <>
      <span ref={anchorRef} className="k-pop-anchor">{trigger(triggerProps)}</span>
      {open && createPortal(
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label={title}
          className={cn("k-pop", className)}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
        >
          {title && (
            <header className="k-pop-head">
              <span className="k-pop-title">{title}</span>
              <IconBtn size="sm" icon={<Icons.X size={14} />} label="Close" onClick={() => close(true)} />
            </header>
          )}
          <div className="k-pop-body">
            {typeof children === "function" ? children({ close }) : children}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

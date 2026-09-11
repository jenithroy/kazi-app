import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconBtn } from "./Btn";
import { Icons } from "./Icons";
import { useMediaQuery } from "./useMediaQuery";
import { cn } from "./utils";

/* ── Overlay plumbing shared by Dialog and Sheet ──────── */

// Open overlays, oldest first. Escape only closes the newest, and the page
// stays scroll-locked until the last one has gone.
const stack = [];
let lockedOverflow = null;

function lockScroll() {
  if (stack.length === 1) {
    lockedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}
function unlockScroll() {
  if (stack.length === 0) document.body.style.overflow = lockedOverflow ?? "";
}

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

const EXIT_MS = 160;

/**
 * Renders an overlay from the moment it opens (so focus can move into it in
 * the same commit) and keeps it for its closing animation afterwards.
 * Reduced-motion users get no animation, so nothing waits.
 */
function usePresence(open) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    if (!mounted) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setMounted(false);
      return undefined;
    }
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open, mounted]);
  return { render: open || mounted, closing: !open && mounted };
}

function Overlay({ open, onClose, dismissible = true, labelledBy, describedBy, initialFocus, variant, className, style, children }) {
  const { render, closing } = usePresence(open);
  const panelRef = useRef(null);
  const returnToRef = useRef(null);
  const token = useRef({});
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  // Stack membership, scroll lock, focus in and focus back out.
  useLayoutEffect(() => {
    if (!open) {
      // Focus goes back from here, not from the cleanup below. After cleanups run,
      // React puts focus back on whatever held it before the update if that element
      // is still in the page, and the overlay's own field still is (it stays
      // mounted for the closing animation). This runs after that, so it sticks.
      const el = returnToRef.current;
      returnToRef.current = null;
      if (el && typeof el.focus === "function" && document.contains(el)) el.focus({ preventScroll: true });
      return undefined;
    }

    const me = token.current;
    returnToRef.current = document.activeElement;
    stack.push(me);
    lockScroll();

    const panel = panelRef.current;
    const target = initialFocus?.current || panel?.querySelector("[data-autofocus]") || panel?.querySelector(FOCUSABLE) || panel;
    target?.focus({ preventScroll: true });

    return () => {
      const i = stack.indexOf(me);
      if (i !== -1) stack.splice(i, 1);
      unlockScroll();
      // Unmounted while still open (the page went away): no later run will restore
      // focus, so do it once React has finished this update.
      const el = returnToRef.current;
      if (el) {
        requestAnimationFrame(() => {
          if (returnToRef.current === el && document.contains(el)) {
            returnToRef.current = null;
            el.focus({ preventScroll: true });
          }
        });
      }
    };
  }, [open, initialFocus]);

  // Escape and Tab: only the newest overlay listens.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (stack[stack.length - 1] !== token.current) return;
      if (e.key === "Escape") {
        if (!dismissibleRef.current) return;
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!render) return null;

  return createPortal(
    <div className={cn("k-overlay", `k-overlay--${variant}`, closing && "is-closing")}>
      <div
        className="k-scrim"
        aria-hidden="true"
        onClick={() => {
          if (dismissible && open) onClose?.();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cn("k-panel", `k-panel--${variant}`, className)}
        style={style}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function PanelContent({ title, description, titleId, descId, onClose, dismissible, footer, children, bodyClassName }) {
  return (
    <>
      <header className="k-panel-head">
        <div className="k-panel-id">
          <h2 id={titleId} className="k-panel-title">{title}</h2>
          {description && <p id={descId} className="k-panel-desc">{description}</p>}
        </div>
        {dismissible && onClose && (
          <IconBtn className="k-panel-close" icon={<Icons.X size={16} />} label="Close" onClick={onClose} />
        )}
      </header>
      {children != null && children !== false && <div className={cn("k-panel-body", bodyClassName)}>{children}</div>}
      {footer && <footer className="k-panel-foot">{footer}</footer>}
    </>
  );
}

/* ── Dialog ───────────────────────────────────────────── */
/**
 * A focused task that interrupts the page: record a payment, confirm a
 * delete, a short form. Centred on a desktop, a bottom sheet on a phone.
 *
 *   open, onClose   controlled; onClose runs on Escape, the backdrop and the
 *                   close button
 *   title           what the dialog is for; required, it names the dialog
 *   description     one line under the title
 *   footer          the actions; they stay in view while the body scrolls
 *   size            sm (420) | md (560, default) | lg (760)
 *   dismissible     false while saving, so Escape and the backdrop cannot
 *                   close it mid-write (the close button hides too)
 *   initialFocus    a ref to focus when it opens; otherwise the first element
 *                   marked data-autofocus, then the first focusable one
 *
 * Focus stays inside until it closes, then returns to what opened it.
 */
export function Dialog({ open, onClose, title, description, footer, size = "md", dismissible = true, initialFocus, className, bodyClassName, children }) {
  const id = useId().replace(/:/g, "");
  const titleId = `dt${id}`;
  const descId = description ? `dd${id}` : undefined;
  return (
    <Overlay
      open={open}
      onClose={onClose}
      dismissible={dismissible}
      labelledBy={titleId}
      describedBy={descId}
      initialFocus={initialFocus}
      variant="dialog"
      className={cn(`k-panel--${size}`, className)}
    >
      <PanelContent title={title} description={description} titleId={titleId} descId={descId} onClose={onClose} dismissible={dismissible} footer={footer} bodyClassName={bodyClassName}>
        {children}
      </PanelContent>
    </Overlay>
  );
}

/* ── Sheet ────────────────────────────────────────────── */
/**
 * Detail or a longer form beside the page: an employee's record, an order's
 * notes, filters on a phone. A drawer from the right at 900px and up, a
 * bottom sheet below that.
 *
 * Same props as Dialog, plus:
 *   width   the drawer's width on wide screens (default 440px; a long form may want 560)
 */
export function Sheet({ open, onClose, title, description, footer, width = 440, dismissible = true, initialFocus, className, bodyClassName, children }) {
  const id = useId().replace(/:/g, "");
  const titleId = `st${id}`;
  const descId = description ? `sd${id}` : undefined;
  const wide = useMediaQuery("(min-width: 900px)");
  return (
    <Overlay
      open={open}
      onClose={onClose}
      dismissible={dismissible}
      labelledBy={titleId}
      describedBy={descId}
      initialFocus={initialFocus}
      variant={wide ? "drawer" : "sheet"}
      className={className}
      style={wide ? { width: `min(${typeof width === "number" ? `${width}px` : width}, calc(100vw - 48px))` } : undefined}
    >
      <PanelContent title={title} description={description} titleId={titleId} descId={descId} onClose={onClose} dismissible={dismissible} footer={footer} bodyClassName={bodyClassName}>
        {children}
      </PanelContent>
    </Overlay>
  );
}

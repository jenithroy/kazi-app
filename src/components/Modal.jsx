/**
 * Modal — the shell a pop-up sits in.
 *
 * The old `.kbrf-modal` was one box with `max-height: 90vh; overflow-y: auto`,
 * so the title, the form and the buttons all scrolled together, and anything
 * wider than the box (a <select> with a long option, three inputs in a row)
 * added a sideways scrollbar on top. Here the frame is fixed and only the
 * middle moves:
 *
 *   header   title + close          never scrolls
 *   body     children               the only part that scrolls (vertically)
 *   footer   actions                never scrolls, always within reach
 *
 * Below 640px wide the same markup becomes a bottom sheet (see .kmodal in
 * styles.css), so there is no separate mobile version to keep in step.
 *
 * `onSubmit` wraps body + footer in one <form>. That keeps a submit button in
 * the footer, and Enter inside a field, working even though the footer sits
 * outside the scrolling body.
 *
 * It renders into <body> rather than in place: the page underneath scrolls
 * inside its own container, and a portal is what stops a wheel or touch that
 * runs off the end of the modal from dragging that page along behind it.
 */
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Icons } from "./ui";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const FIRST_FIELD =
  ".kmodal-body input:not([disabled]):not([type=\"hidden\"]), " +
  ".kmodal-body select:not([disabled]), .kmodal-body textarea:not([disabled])";

export default function Modal({
  title,
  subtitle,
  onClose,
  onSubmit,
  footer,
  size = "md",              // "sm" 480px · "md" 640px · "lg" 760px
  dismissOnBackdrop = true,
  children,
}) {
  const panelRef = useRef(null);
  const titleId = useId();
  const pressStartedOnBackdrop = useRef(false);

  // Focus goes in when the modal opens and back to whatever opened it when it
  // closes. On a mouse or keyboard machine that means the first field; on touch
  // the panel itself, because focusing a text input would raise the on-screen
  // keyboard over half the sheet before anyone has decided to type.
  useEffect(() => {
    const opener = document.activeElement;
    const panel = panelRef.current;
    const fine = window.matchMedia?.("(pointer: fine)").matches;
    const target = (fine && panel?.querySelector(FIRST_FIELD)) || panel;
    target?.focus({ preventScroll: true });
    return () => {
      if (opener && document.contains(opener)) opener.focus?.({ preventScroll: true });
    };
  }, []);

  function handleKeyDown(e) {
    // A field can claim Escape for itself first (the customer panel uses it to
    // cancel "add customer"); only an Escape nobody handled closes the modal.
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.stopPropagation();
      onClose?.();
      return;
    }
    if (e.key !== "Tab") return;

    // Keep Tab inside the dialog. The page behind is still in the DOM, so
    // without this the third Tab lands on a button the overlay is covering.
    const panel = panelRef.current;
    const nodes = [...panel.querySelectorAll(FOCUSABLE)].filter(n => n.offsetParent !== null);
    if (nodes.length === 0) { e.preventDefault(); return; }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }

  // Close on a backdrop click only if the press also began on the backdrop.
  // Selecting text in a field and letting go outside the dialog produces a
  // click whose target is the overlay, and that must not throw the form away.
  const backdrop = dismissOnBackdrop
    ? {
        onPointerDown: e => { pressStartedOnBackdrop.current = e.target === e.currentTarget; },
        onClick: e => {
          if (pressStartedOnBackdrop.current && e.target === e.currentTarget) onClose?.();
          pressStartedOnBackdrop.current = false;
        },
      }
    : {};

  const Inner = onSubmit ? "form" : "div";

  return createPortal(
    <div className="kmodal-overlay" onKeyDown={handleKeyDown} {...backdrop}>
      <div
        ref={panelRef}
        className={`kmodal kmodal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="kmodal-hd">
          <div className="kmodal-hd-text">
            <h2 className="kmodal-title" id={titleId}>{title}</h2>
            {subtitle ? <p className="kmodal-sub">{subtitle}</p> : null}
          </div>
          <button type="button" className="kmodal-x" onClick={onClose} aria-label="Close">
            <Icons.X size={18} />
          </button>
        </header>

        <Inner className="kmodal-inner" {...(onSubmit ? { onSubmit } : {})}>
          <div className="kmodal-body">{children}</div>
          {footer ? <footer className="kmodal-ft">{footer}</footer> : null}
        </Inner>
      </div>
    </div>,
    document.body,
  );
}

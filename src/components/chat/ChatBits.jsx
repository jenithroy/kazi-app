/**
 * The small shared pieces of chat: an avatar that knows who is on shift, the popovers (a menu, the emoji picker), a dialog shell,
 * and the emoji picker.
 *
 * They live together because each is a dozen lines and all of them are used by both panes. Anything larger gets its own file.
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Avatar, Icons } from "../ui";
import Modal from "../Modal";
import { useAnchoredPopover } from "../../hooks/useAnchoredPopover";
import { hueFor, personFor, threadHue, threadTitle } from "../../lib/chatFormat";
import { EMOJI_PICKER, QUICK_REACTIONS } from "../../lib/chatFormat";

/* ── avatars ──────────────────────────────────────────── */

/**
 * A person's avatar with their presence dot.
 *
 * The dot is the real punch (`chat_presence`), not the roster, so it means
 * "in the building right now" rather than "rostered on".
 */
export function PersonAvatar({ personId, size = 38, showPresence = true }) {
  const person = personFor(personId);
  return (
    <span className="kchat-av" style={{ width: size, height: size }}>
      <Avatar name={person.name} hue={hueFor(personId)} size={size} personId={personId} />
      {showPresence && person.online && (
        <span className="kchat-av-dot" style={{ width: size * 0.28, height: size * 0.28 }} title={person.status} />
      )}
    </span>
  );
}

/** A thread's avatar: a dm borrows the other person's, a group gets its own mark. */
export function ThreadAvatar({ thread, size = 38 }) {
  if (thread.kind === "dm") return <PersonAvatar personId={thread.memberIds[0]} size={size} />;
  return (
    <span className="kchat-av" style={{ width: size, height: size }}>
      <Avatar name={threadTitle(thread)} hue={threadHue(thread)} size={size} />
      <span className="kchat-av-group" style={{ width: size * 0.42, height: size * 0.42 }}>
        <Icons.Users size={size * 0.24} sw={2.2} />
      </span>
    </span>
  );
}

/* ── popovers ─────────────────────────────────────────── */

// what a menu's arrow keys visit: the choices, not the greyed-out line that says when a message was sent
const CHOICES = '[role="menuitem"]:not(:disabled):not([aria-disabled="true"])';

/**
 * Something that opens over the page under a button: a menu, the emoji picker, a lead's score.
 *
 * It is portalled to <body> and placed from the button's rectangle (hooks/useAnchoredPopover.js), because inside a glass pane or a
 * scrolling message list it would be clipped. A press anywhere outside closes it, and so does Escape, which closes only the popover
 * (never the page's own Escape handling) and puts focus back on the button. A menu (`role="menu"`) takes the arrow keys.
 *
 * `triggerRef` is the button that opened it: a press on that button is not "outside", or a second click would close the popover here
 * and reopen it in the button's own handler, so the toggle would never close.
 */
export function Popover({ open, onClose, triggerRef, className = "", role, label, width, align = "end", estimate = 260, children }) {
  const popRef = useRef(null);
  const { pos } = useAnchoredPopover({ open, triggerRef, popRef, onDismiss: onClose, estimate, exactWidth: width, align });

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
      triggerRef?.current?.focus?.({ preventScroll: true });
    };
    // the capture phase, so the page behind never sees the Escape that was meant for this popover
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose, triggerRef]);

  const placed = open && !!pos;
  useEffect(() => {
    if (placed && role === "menu") popRef.current?.querySelector(CHOICES)?.focus({ preventScroll: true });
  }, [placed, role]);

  const onMenuKey = (e) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Tab"].includes(e.key)) return;
    if (e.key === "Tab") { onClose(); return; }
    const items = [...popRef.current.querySelectorAll(CHOICES)];
    if (!items.length) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next].focus({ preventScroll: true });
  };

  if (!placed) return null;
  return createPortal(
    <div
      ref={popRef} className={`ksel-pop kchat-pop${className ? ` ${className}` : ""}`} role={role} aria-label={label}
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxH }}
      onKeyDown={role === "menu" ? onMenuKey : undefined}
    >
      {children}
    </div>,
    document.body,
  );
}

export function Menu({ open, onClose, triggerRef, align = "end", children, label = "Options" }) {
  return (
    <Popover open={open} onClose={onClose} triggerRef={triggerRef} align={align} role="menu" label={label} width={214}>
      {children}
    </Popover>
  );
}

export function MenuItem({ icon: Icon, children, onClick, danger, disabled }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`kchat-menu-item${danger ? " kchat-menu-item--danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {Icon ? <Icon size={14} /> : <span style={{ width: 14 }} />}
      <span>{children}</span>
    </button>
  );
}

export const MenuDivider = () => <div className="kchat-menu-sep" role="separator" />;

/* ── dialog shell ─────────────────────────────────────── */

/** Every chat dialog is the app's glass dialog (components/Modal.jsx), so it looks and behaves like the rest of the ERP: focus goes in, Escape closes it. */
export function Dialog({ title, onClose, children, footer, size = "sm" }) {
  return (
    <Modal title={title} size={size} glass onClose={onClose} footer={footer}>
      {children}
    </Modal>
  );
}

/* ── emoji ────────────────────────────────────────────── */

/**
 * The reaction picker: the six presets first, then the rest.
 *
 * Deliberately a fixed set rather than a full emoji keyboard. The column is
 * free text in the database, so anything is storable, but a picker of two
 * thousand faces is a scroll, and the six at the top cover almost every
 * reaction a shop floor actually sends.
 */
export function EmojiPicker({ onPick, onClose, triggerRef }) {
  return (
    <Popover open onClose={onClose} triggerRef={triggerRef} className="kchat-emoji-pop" label="Pick an emoji" width={212} align="start" estimate={300}>
      <div className="kchat-emoji-row">
        {QUICK_REACTIONS.map((emoji) => (
          <button key={emoji} type="button" className="kchat-emoji" onClick={() => onPick(emoji)}>
            {emoji}
          </button>
        ))}
      </div>
      <div className="kchat-menu-sep" />
      <div className="kchat-emoji-grid">
        {EMOJI_PICKER.map((emoji) => (
          <button key={emoji} type="button" className="kchat-emoji" onClick={() => onPick(emoji)}>
            {emoji}
          </button>
        ))}
      </div>
    </Popover>
  );
}

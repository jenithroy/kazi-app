/**
 * The small shared pieces of chat: an avatar that knows who is on shift, a
 * popover menu, a modal shell, and the emoji picker.
 *
 * They live together because each is a dozen lines and all four are used by
 * both panes. Anything larger gets its own file.
 */

import { useEffect, useRef } from "react";
import { Avatar, Icons } from "../ui";
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
      <Avatar name={person.name} hue={hueFor(personId)} size={size} />
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

/* ── popover menu ─────────────────────────────────────── */

/**
 * Close on an outside click or Escape -- the two ways anyone dismisses a menu.
 *
 * `triggerRef` is the button that opened it, and clicks on that button are not
 * "outside". Without the exclusion a second click would close the popover here
 * and immediately reopen it in the button's own handler, so the toggle would
 * never appear to close.
 */
export function useDismiss(open, onClose, triggerRef) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointer = (e) => {
      if (triggerRef?.current?.contains(e.target)) return;
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };

    // `mousedown` rather than `click`, so the menu is gone before whatever was
    // underneath receives the press.
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, triggerRef]);

  return ref;
}

export function Menu({ open, onClose, triggerRef, align = "right", children, style }) {
  const ref = useDismiss(open, onClose, triggerRef);
  if (!open) return null;
  return (
    <div ref={ref} className="kchat-menu" style={{ [align]: 0, ...style }} role="menu">
      {children}
    </div>
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

export const MenuDivider = () => <div className="kchat-menu-sep" />;

/* ── modal shell ──────────────────────────────────────── */

/**
 * Reuses the app's existing modal classes rather than inventing a chat-only
 * dialog, so a group editor looks like every other form in the ERP.
 */
export function Dialog({ title, onClose, children, width = 460 }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="kbrf-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="kbrf-modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="kbrf-modal-hd">
          <span>{title}</span>
          <button type="button" className="kbrf-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
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
  const ref = useDismiss(true, onClose, triggerRef);
  return (
    <div ref={ref} className="kchat-emoji-pop">
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
    </div>
  );
}

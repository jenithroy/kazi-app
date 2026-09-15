/**
 * An open conversation: the header, the scrollback, and the composer.
 *
 * The scroll rules are the ones every messenger converges on, because
 * anything else fights the reader:
 *   - opening a thread lands at the bottom, with no animation;
 *   - a new message scrolls only if you were already near the bottom, so
 *     reading back through history is never yanked away from;
 *   - being scrolled up puts a "jump to latest" button on screen, and gives
 *     it a count when the messages arriving are somebody else's.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icons } from "../ui";
import { Menu, MenuDivider, MenuItem, ThreadAvatar } from "./ChatBits";
import Composer from "./Composer";
import MessageBubble from "./MessageBubble";
import { groupByDay, threadOnline, threadStatus, threadTitle } from "../../lib/chatFormat";

/** Close enough to the bottom that the reader is following the conversation. */
const STICK_PX = 120;

export default function ThreadView({
  thread,
  messages,
  unread,
  canPost,
  canManageGroup,
  onBack,
  onSend,
  onUpload,
  onReact,
  onEdit,
  onDelete,
  onMarkRead,
  onSetFlag,
  onLeave,
  onOpenContact,
  onOpenGroup,
  onOpenMedia,
}) {
  const [replyTo, setReplyTo] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  const scrollerRef = useRef(null);
  const stuckRef = useRef(true);
  const lastCountRef = useRef(0);
  const menuTrigger = useRef(null);

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const days = useMemo(() => groupByDay(messages), [messages]);

  /* -- scrolling ----------------------------------------------------- */

  const scrollToBottom = useCallback((smooth) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Layout effect, not effect: jumping to the bottom after paint is a visible
  // flash of the middle of the conversation.
  useLayoutEffect(() => {
    stuckRef.current = true;
    lastCountRef.current = messages.length;
    scrollToBottom(false);
    setReplyTo(null);
    // Only when the conversation itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  useEffect(() => {
    if (messages.length === lastCountRef.current) return;
    const grew = messages.length > lastCountRef.current;
    lastCountRef.current = messages.length;
    if (grew && stuckRef.current) scrollToBottom(true);
  }, [messages.length, scrollToBottom]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stuckRef.current = distance < STICK_PX;
    setPinned(!stuckRef.current);
  };

  /* -- read receipts ------------------------------------------------- */

  /**
   * Opening a thread marks it read, and so does a message arriving while it is
   * open -- but only if this tab actually has focus. Marking someone's message
   * read because their reply landed in a background tab is a lie the sender
   * can see.
   */
  useEffect(() => {
    if (!unread) return undefined;
    if (!document.hasFocus()) {
      const onFocus = () => onMarkRead(thread.id, true);
      window.addEventListener("focus", onFocus, { once: true });
      return () => window.removeEventListener("focus", onFocus);
    }
    onMarkRead(thread.id, true);
    return undefined;
  }, [thread.id, unread, onMarkRead]);

  /* -- jumping to a quoted message ----------------------------------- */

  const jumpTo = useCallback((messageId) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("kchat-msg--flash");
    setTimeout(() => el.classList.remove("kchat-msg--flash"), 1200);
  }, []);

  const isGroup = thread.kind === "group";
  const online = threadOnline(thread);

  return (
    <div className="kchat-thread">
      <header className="kchat-thread-hd">
        <button type="button" className="kchat-back" onClick={onBack} aria-label="Back to conversations">
          <Icons.ChevronLeft size={18} />
        </button>

        <button type="button" className="kchat-thread-id" onClick={onOpenContact}>
          <ThreadAvatar thread={thread} size={38} />
          <span>
            <span className="kchat-thread-name">{threadTitle(thread)}</span>
            <span className={`kchat-thread-status${online ? " kchat-thread-status--on" : ""}`}>
              {threadStatus(thread)}
            </span>
          </span>
        </button>

        <div className="kchat-thread-actions">
          {thread.muted && (
            <span className="kchat-muted-chip" title="Muted">
              <Icons.BellOff size={12} /> Muted
            </span>
          )}
          <button
            ref={menuTrigger}
            type="button"
            className="kchat-icon-btn"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Conversation options"
          >
            <Icons.More size={16} />
          </button>

          <Menu open={menuOpen} onClose={() => setMenuOpen(false)} triggerRef={menuTrigger} style={{ top: 34 }}>
            <MenuItem icon={isGroup ? Icons.Users : Icons.Customers} onClick={() => { onOpenContact(); setMenuOpen(false); }}>
              {isGroup ? "View members" : "View contact"}
            </MenuItem>
            {isGroup && canManageGroup && (
              <MenuItem icon={Icons.Settings} onClick={() => { onOpenGroup(); setMenuOpen(false); }}>
                Group settings
              </MenuItem>
            )}
            <MenuDivider />
            <MenuItem icon={Icons.Pin} onClick={() => { onSetFlag(thread.id, "pinned", !thread.pinned); setMenuOpen(false); }}>
              {thread.pinned ? "Unpin" : "Pin to top"}
            </MenuItem>
            <MenuItem icon={thread.muted ? Icons.Bell : Icons.BellOff} onClick={() => { onSetFlag(thread.id, "muted", !thread.muted); setMenuOpen(false); }}>
              {thread.muted ? "Unmute" : "Mute"}
            </MenuItem>
            <MenuItem icon={Icons.Check} onClick={() => { onMarkRead(thread.id, false); setMenuOpen(false); }}>
              Mark as unread
            </MenuItem>
            <MenuDivider />
            <MenuItem icon={Icons.Trash} danger onClick={() => { setMenuOpen(false); onLeave(thread); }}>
              {isGroup ? "Leave group" : "Delete conversation"}
            </MenuItem>
          </Menu>
        </div>
      </header>

      <div className="kchat-scroll" ref={scrollerRef} onScroll={onScroll}>
        {messages.length === 0 ? (
          <div className="kchat-empty">
            <ThreadAvatar thread={thread} size={52} />
            <h4>{threadTitle(thread)}</h4>
            <p>
              {isGroup
                ? "Nobody has posted here yet. Say hello."
                : `This is the start of your conversation with ${threadTitle(thread)}.`}
            </p>
          </div>
        ) : (
          days.map((day) => (
            <section key={day.key} className="kchat-day">
              <div className="kchat-day-mark">
                <span>{day.label}</span>
              </div>
              {day.items.map((message, i) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  previous={day.items[i - 1]}
                  isGroup={isGroup}
                  replyTarget={message.replyTo ? byId.get(message.replyTo) : undefined}
                  canPost={canPost}
                  onReply={setReplyTo}
                  onReact={onReact}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onOpenMedia={onOpenMedia}
                  onJumpTo={jumpTo}
                />
              ))}
            </section>
          ))
        )}
      </div>

      {pinned && (
        <button type="button" className="kchat-jump" onClick={() => scrollToBottom(true)}>
          <Icons.ChevronDown size={14} />
          {unread > 0 ? `${unread} new` : "Latest"}
        </button>
      )}

      <Composer
        threadId={thread.id}
        recipientName={threadTitle(thread)}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onUpload={(file) => onUpload(thread.id, file)}
        onSend={(text, attachment) => onSend(thread.id, text, replyTo?.id, attachment)}
        disabled={!canPost}
      />
    </div>
  );
}

/** An open lead conversation: header, scrollback, and a plain-text composer.
 *
 * Simpler than team chat's ThreadView on purpose — no reactions, edits,
 * groups, or read receipts, because none of that exists on the Instagram
 * side. Sending a reply here always mutes the bot on this thread (the
 * backend does that on every /reply call), so the header's takeover toggle
 * exists mainly to hand a thread *back* to the bot once staff are done.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Avatar, Icons } from "../ui";
import { hueFor } from "../../lib/chatFormat";
import { groupByDay, messageClock } from "../../lib/leadsFormat";

const STICK_PX = 120;

function MediaTile({ message, onOpenMedia }) {
  const isImage = (message.media_type || "").startsWith("image/");
  const name = isImage ? "Photo" : "Voice note or video";

  if (!message.mediaUrl) {
    return (
      <span className="kchat-file">
        <span className="kchat-file-ico">
          <Icons.Image size={15} />
        </span>
        <span className="kchat-file-meta">
          <span className="kchat-file-name">{name}</span>
          <span className="kchat-file-size">Link unavailable — refresh to fetch a new one</span>
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="kchat-media"
      style={{ aspectRatio: "4 / 3" }}
      onClick={() => onOpenMedia({ kind: isImage ? "image" : "video", url: message.mediaUrl, name })}
      title={name}
    >
      {isImage ? (
        <img src={message.mediaUrl} alt="" loading="lazy" />
      ) : (
        <>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={message.mediaUrl} preload="metadata" muted playsInline />
          <span className="kchat-media-play">
            <Icons.Play size={18} />
          </span>
        </>
      )}
    </button>
  );
}

function LeadBubble({ message, onOpenMedia }) {
  const mine = message.role === "assistant";
  return (
    <div className={`kchat-msg${mine ? " kchat-msg--mine" : ""}`} id={`lead-msg-${message.id}`}>
      <div className="kchat-msg-col">
        <div className="kchat-msg-line">
          <div className={`kchat-bubble${mine ? " kchat-bubble--mine" : ""}${message.media_path ? " kchat-bubble--media" : ""}`}>
            {message.media_path && <MediaTile message={message} onOpenMedia={onOpenMedia} />}
            {message.content && <span className="kchat-bubble-text">{message.content}</span>}
          </div>
        </div>
        <div className="kchat-msg-meta">
          <span>{messageClock(message.created_at)}</span>
          {mine && <span className="kchat-sent">Sent</span>}
        </div>
      </div>
    </div>
  );
}

export default function LeadsThread({ lead, messages, loading, sending, onBack, onSend, onTakeover, onOpenMedia }) {
  const [draft, setDraft] = useState("");
  const scrollerRef = useRef(null);
  const stuckRef = useRef(true);
  const lastCountRef = useRef(0);

  const title = lead.name || "Instagram user";
  const days = groupByDay(messages);

  const scrollToBottom = useCallback((smooth) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useLayoutEffect(() => {
    stuckRef.current = true;
    lastCountRef.current = messages.length;
    scrollToBottom(false);
    setDraft("");
    // Only when the conversation itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.convo]);

  useEffect(() => {
    if (messages.length === lastCountRef.current) return;
    const grew = messages.length > lastCountRef.current;
    lastCountRef.current = messages.length;
    if (grew && stuckRef.current) scrollToBottom(true);
  }, [messages.length, scrollToBottom]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    stuckRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
  };

  async function submit(e) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    try {
      await onSend(text);
    } catch {
      setDraft(text);
    }
  }

  return (
    <div className="kchat-thread">
      <header className="kchat-thread-hd">
        <button type="button" className="kchat-back" onClick={onBack} aria-label="Back to conversations">
          <Icons.ChevronLeft size={18} />
        </button>

        <span className="kchat-thread-id">
          <span className="kchat-av" style={{ width: 38, height: 38 }}>
            <Avatar name={title} hue={hueFor(lead.convo)} size={38} />
          </span>
          <span>
            <span className="kchat-thread-name">{title}</span>
            <span className="kchat-thread-status">
              {lead.platform === "instagram" ? "Instagram" : "Messenger"}
            </span>
          </span>
        </span>

        <div className="kchat-thread-actions">
          <button
            type="button"
            className={`kchat-takeover-btn${lead.isMuted ? " kchat-takeover-btn--active" : ""}`}
            onClick={() => onTakeover(!lead.isMuted)}
            title={lead.isMuted ? "Let the bot answer this conversation again" : "Stop the bot from replying here"}
          >
            {lead.isMuted ? <Icons.Bell size={13} /> : <Icons.BellOff size={13} />}
            {lead.isMuted ? "Hand back to bot" : "Take over"}
          </button>
        </div>
      </header>

      {lead.referral && (
        <div className="kchat-lead-referral">
          <Icons.Marketing size={13} />
          <span>Came from: {lead.referral}</span>
        </div>
      )}

      <div className="kchat-scroll" ref={scrollerRef} onScroll={onScroll}>
        {loading ? (
          <div className="kchat-empty">
            <span className="kchat-spin" />
            <p>Loading this conversation…</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="kchat-empty">
            <Avatar name={title} hue={hueFor(lead.convo)} size={52} />
            <h4>{title}</h4>
            <p>No messages archived for this conversation yet.</p>
          </div>
        ) : (
          days.map((day) => (
            <section key={day.key} className="kchat-day">
              <div className="kchat-day-mark">
                <span>{day.label}</span>
              </div>
              {day.items.map((message) => (
                <LeadBubble key={message.id} message={message} onOpenMedia={onOpenMedia} />
              ))}
            </section>
          ))
        )}
      </div>

      <p className="kchat-lead-hint">
        Plain text only, for now — replying to one specific message, reacting/liking, and sending photos aren't
        supported here yet. Use the Instagram app itself for those.
      </p>

      <form className="kchat-composer" onSubmit={submit}>
        <div className="kchat-composer-row">
          <textarea
            className="kchat-input"
            rows={1}
            value={draft}
            placeholder={`Message ${title}`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button type="submit" className="kchat-send" disabled={!draft.trim() || sending} title="Send (Enter)">
            {sending ? <span className="kchat-spin kchat-spin--light" /> : <Icons.Send size={15} />}
          </button>
        </div>
      </form>
    </div>
  );
}

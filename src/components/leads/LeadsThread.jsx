/** An open lead conversation: header, scrollback, and a composer that can
 * send text, a picked photo, or a recorded voice note.
 *
 * Simpler than team chat's ThreadView on purpose — no reactions or edits,
 * because Instagram's Send API has neither, and no groups, because a lead is
 * always one customer. One real gap, not a corner we cut: Instagram's API
 * has no way to *originate* a reply-to-a-specific-message (confirmed against
 * Meta's own docs) — we can only show a quote the customer sent, never send
 * one ourselves. Sending anything here always mutes the bot on this thread,
 * so the header's takeover toggle exists mainly to hand a thread back once
 * staff are done.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icons } from "../ui";
import { groupByDay, messageClock } from "../../lib/leadsFormat";
import LeadAvatar from "./LeadAvatar";
import VoicePlayer from "./VoicePlayer";

const STICK_PX = 120;
const MAX_RECORD_SECONDS = 120;

function MediaTile({ message, mine, onOpenMedia }) {
  const isImage = (message.media_type || "").startsWith("image/");

  if (isImage) {
    if (!message.mediaUrl) {
      return (
        <span className="kchat-file">
          <span className="kchat-file-ico">
            <Icons.Image size={15} />
          </span>
          <span className="kchat-file-meta">
            <span className="kchat-file-name">Photo</span>
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
        onClick={() => onOpenMedia({ kind: "image", url: message.mediaUrl, name: "Photo" })}
        title="Photo"
      >
        <img src={message.mediaUrl} alt="" loading="lazy" />
      </button>
    );
  }

  return <VoicePlayer src={message.mediaUrl} mine={mine} />;
}

function ReplyQuote({ replyTo, onJump }) {
  if (!replyTo) return null;
  return (
    <button type="button" className="kchat-lead-quote" onClick={() => onJump(replyTo.id)}>
      <span>{replyTo.content || (replyTo.mediaType ? "Attachment" : "")}</span>
    </button>
  );
}

function LeadBubble({ message, onOpenMedia, onJump }) {
  const mine = message.role === "assistant";
  return (
    <div className={`kchat-msg${mine ? " kchat-msg--mine" : ""}`} id={`lead-msg-${message.id}`}>
      <div className="kchat-msg-col">
        <div className="kchat-msg-line">
          <div className={`kchat-bubble${mine ? " kchat-bubble--mine" : ""}${message.media_path ? " kchat-bubble--media" : ""}`}>
            <ReplyQuote replyTo={message.replyTo} onJump={onJump} />
            {message.media_path && <MediaTile message={message} mine={mine} onOpenMedia={onOpenMedia} />}
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

/* ── composer: text, or one pending photo/voice note ─────────────────── */

function AttachPreview({ attachment, onRemove }) {
  return (
    <div className="kchat-attach-bar">
      {attachment.kind === "image" ? (
        <img className="kchat-attach-thumb" src={attachment.previewUrl} alt="" />
      ) : (
        <span className="kchat-attach-ico">
          <Icons.Play size={14} />
        </span>
      )}
      <span className="kchat-attach-meta">
        <span className="kchat-attach-name">{attachment.kind === "image" ? "Photo" : "Voice note"}</span>
        {attachment.duration != null && (
          <span className="kchat-attach-size">
            {Math.floor(attachment.duration / 60)}:{String(Math.round(attachment.duration) % 60).padStart(2, "0")}
          </span>
        )}
      </span>
      <button type="button" className="kchat-icon-btn" onClick={onRemove} aria-label="Remove">
        <Icons.X size={13} />
      </button>
    </div>
  );
}

function useVoiceRecorder(onDone, onError) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (t) => window.MediaRecorder?.isTypeSupported?.(t)
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        const duration = (Date.now() - startedAtRef.current) / 1000;
        setRecording(false);
        setSeconds(0);
        if (blob.size > 0) onDone(blob, duration);
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();
      setRecording(true);
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startedAtRef.current) / 1000;
        setSeconds(elapsed);
        if (elapsed >= MAX_RECORD_SECONDS) stop();
      }, 250);
    } catch {
      onError("Microphone access was denied or isn't available.");
    }
  }, [onDone, onError, stop]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  return { recording, seconds, start, stop };
}

export default function LeadsThread({ lead, messages, loading, sending, onBack, onSend, onSendAttachment, onTakeover, onOpenMedia }) {
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [notice, setNotice] = useState("");
  const scrollerRef = useRef(null);
  const stuckRef = useRef(true);
  const lastCountRef = useRef(0);
  const fileRef = useRef(null);

  const title = lead.name || "Instagram user";
  const days = groupByDay(messages);

  const recorder = useVoiceRecorder(
    (blob, duration) => {
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      setAttachment({
        kind: "voice",
        file: new File([blob], `voice-note.${ext}`, { type: blob.type }),
        previewUrl: URL.createObjectURL(blob),
        duration,
      });
    },
    (message) => setNotice(message)
  );

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
    setAttachment(null);
    setNotice("");
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

  const jumpTo = useCallback((messageId) => {
    const el = document.getElementById(`lead-msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("kchat-msg--flash");
    setTimeout(() => el.classList.remove("kchat-msg--flash"), 1200);
  }, []);

  function pickImage(file) {
    if (!file) return;
    setAttachment({ kind: "image", file, previewUrl: URL.createObjectURL(file) });
  }

  function removeAttachment() {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  }

  async function submit(e) {
    e?.preventDefault();
    if (sending) return;
    setNotice("");

    if (attachment) {
      const sent = attachment;
      setAttachment(null);
      try {
        await onSendAttachment(sent.file);
      } catch (err) {
        setAttachment(sent);
        setNotice(err.message || "That didn't send.");
      }
      return;
    }

    const text = draft.trim();
    if (!text) return;
    setDraft("");
    try {
      await onSend(text);
    } catch (err) {
      setDraft(text);
      setNotice(err.message || "That message didn't send.");
    }
  }

  const canSend = !sending && (attachment || draft.trim());

  return (
    <div className="kchat-thread">
      <header className="kchat-thread-hd">
        <button type="button" className="kchat-back" onClick={onBack} aria-label="Back to conversations">
          <Icons.ChevronLeft size={18} />
        </button>

        <span className="kchat-thread-id">
          <LeadAvatar convo={lead.convo} name={lead.name} profilePic={lead.profilePic} size={38} />
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
            <LeadAvatar convo={lead.convo} name={lead.name} profilePic={lead.profilePic} size={52} />
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
                <LeadBubble key={message.id} message={message} onOpenMedia={onOpenMedia} onJump={jumpTo} />
              ))}
            </section>
          ))
        )}
      </div>

      <form className="kchat-composer" onSubmit={submit}>
        {attachment && <AttachPreview attachment={attachment} onRemove={removeAttachment} />}

        {recorder.recording ? (
          <div className="kchat-recording">
            <span className="kchat-recording-dot" />
            <span className="kchat-recording-time">
              {Math.floor(recorder.seconds / 60)}:{String(Math.floor(recorder.seconds) % 60).padStart(2, "0")}
            </span>
            <span>Recording…</span>
          </div>
        ) : (
          notice && <div className="kchat-composer-note">{notice}</div>
        )}

        <div className="kchat-composer-row">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              pickImage(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="kchat-icon-btn kchat-icon-btn--lg"
            onClick={() => fileRef.current?.click()}
            disabled={!!attachment || recorder.recording}
            title="Attach a photo"
          >
            <Icons.Paperclip size={16} />
          </button>

          <button
            type="button"
            className="kchat-icon-btn kchat-icon-btn--lg"
            onClick={recorder.recording ? recorder.stop : recorder.start}
            disabled={!!attachment}
            title={recorder.recording ? "Stop recording" : "Record a voice note"}
          >
            {recorder.recording ? <Icons.Pause size={16} /> : <Icons.Mic size={16} />}
          </button>

          <textarea
            className="kchat-input"
            rows={1}
            value={draft}
            placeholder={attachment ? "Add a caption isn't supported — send as-is" : `Message ${title}`}
            disabled={!!attachment || recorder.recording}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button type="submit" className="kchat-send" disabled={!canSend} title="Send (Enter)">
            {sending ? <span className="kchat-spin kchat-spin--light" /> : <Icons.Send size={15} />}
          </button>
        </div>
      </form>
    </div>
  );
}

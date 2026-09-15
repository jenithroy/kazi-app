/**
 * The composer.
 *
 * Enter sends and Shift+Enter breaks the line, which is what every desktop
 * messenger does and what people will do here whether or not we support it.
 * The textarea grows with the draft up to a ceiling, then scrolls.
 *
 * An attachment is uploaded to the private bucket as soon as it is chosen, not
 * when the message is sent, so a large file is already in place by the time
 * anyone finishes typing the caption. The message row is written only on send,
 * so an abandoned draft leaves a stray object in storage and never a bubble
 * pointing at nothing.
 */

import { useEffect, useRef, useState } from "react";
import { Icons } from "../ui";
import { EmojiPicker } from "./ChatBits";
import { clipLength, fileSize, firstName, isMe, messageText } from "../../lib/chatFormat";

const MAX_ROWS = 8;

export default function Composer({
  threadId,
  recipientName,
  replyTo,
  onCancelReply,
  onSend,
  onUpload,
  disabled,
  disabledReason,
}) {
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const emojiTrigger = useRef(null);

  // A fresh conversation starts with a clean slate; a half-typed line must not
  // follow you into somebody else's thread.
  useEffect(() => {
    setDraft("");
    setAttachment(null);
    setNotice("");
  }, [threadId]);

  /**
   * Starting a reply should land you in the input, ready to type. Keyed on the
   * id rather than the object, or every realtime refetch would re-focus and
   * steal the caret mid-sentence.
   */
  useEffect(() => {
    if (replyTo?.id) inputRef.current?.focus();
  }, [replyTo?.id]);

  const canSend = (draft.trim().length > 0 || !!attachment) && !busy && !uploading && !disabled;

  async function attach(file) {
    if (!file) return;
    setUploading(true);
    setNotice("");
    try {
      setAttachment(await onUpload(file));
    } catch (err) {
      setNotice(err.message || "That file could not be attached.");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e) {
    e?.preventDefault();
    if (!canSend) return;

    const text = draft.trim();
    const sending = attachment;

    // Cleared first, so the next line can be typed while this one is in
    // flight. Restored below if the send is refused.
    setDraft("");
    setAttachment(null);
    setBusy(true);
    setNotice("");

    try {
      await onSend(text, sending);
      onCancelReply?.();
    } catch (err) {
      setDraft(text);
      setAttachment(sending);
      setNotice(err.message || "That message did not send.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const rows = Math.min(MAX_ROWS, draft.split("\n").length);

  if (disabled) {
    return (
      <div className="kchat-composer kchat-composer--locked">
        <Icons.Alert size={14} />
        <span>{disabledReason || "Your role can read this conversation but not post to it."}</span>
      </div>
    );
  }

  return (
    <form
      className={`kchat-composer${dragging ? " kchat-composer--drop" : ""}`}
      onSubmit={submit}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        attach(e.dataTransfer.files?.[0]);
      }}
    >
      {replyTo && (
        <div className="kchat-reply-bar">
          <span className="kchat-reply-edge" />
          <div className="kchat-reply-body">
            <span className="kchat-reply-who">
              Replying to {isMe(replyTo.authorId) ? "yourself" : firstName(replyTo.authorId)}
            </span>
            <span className="kchat-reply-text">{messageText(replyTo)}</span>
          </div>
          <button type="button" className="kchat-icon-btn" onClick={onCancelReply} aria-label="Cancel reply">
            <Icons.X size={13} />
          </button>
        </div>
      )}

      {(attachment || uploading) && (
        <div className="kchat-attach-bar">
          {uploading ? (
            <>
              <span className="kchat-spin" />
              <span className="kchat-attach-name">Uploading…</span>
            </>
          ) : (
            <>
              {attachment.kind === "image" && attachment.url ? (
                <img className="kchat-attach-thumb" src={attachment.url} alt="" />
              ) : (
                <span className="kchat-attach-ico">
                  {attachment.kind === "video" ? <Icons.Play size={14} /> : <Icons.File size={14} />}
                </span>
              )}
              <span className="kchat-attach-meta">
                <span className="kchat-attach-name">{attachment.name}</span>
                <span className="kchat-attach-size">
                  {[fileSize(attachment.size), attachment.duration ? clipLength(attachment.duration) : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <button type="button" className="kchat-icon-btn" onClick={() => setAttachment(null)} aria-label="Remove attachment">
                <Icons.X size={13} />
              </button>
            </>
          )}
        </div>
      )}

      {notice && <div className="kchat-composer-note">{notice}</div>}

      <div className="kchat-composer-row">
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => {
            attach(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="kchat-icon-btn kchat-icon-btn--lg"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title="Attach a file"
        >
          <Icons.Paperclip size={16} />
        </button>

        <div className="kchat-emoji-anchor">
          <button
            ref={emojiTrigger}
            type="button"
            className="kchat-icon-btn kchat-icon-btn--lg"
            onClick={() => setEmojiOpen((v) => !v)}
            title="Emoji"
          >
            <Icons.Smile size={16} />
          </button>
          {emojiOpen && (
            <EmojiPicker
              triggerRef={emojiTrigger}
              onClose={() => setEmojiOpen(false)}
              onPick={(emoji) => {
                setDraft((d) => d + emoji);
                setEmojiOpen(false);
                inputRef.current?.focus();
              }}
            />
          )}
        </div>

        <textarea
          ref={inputRef}
          className="kchat-input"
          rows={rows}
          value={draft}
          placeholder={
            replyTo ? "Type your reply" : attachment ? "Add a caption" : `Message ${recipientName}`
          }
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape" && replyTo) onCancelReply?.();
          }}
          onPaste={(e) => {
            const file = [...(e.clipboardData?.files || [])][0];
            if (file) {
              e.preventDefault();
              attach(file);
            }
          }}
        />

        <button type="submit" className="kchat-send" disabled={!canSend} title="Send (Enter)">
          {busy ? <span className="kchat-spin kchat-spin--light" /> : <Icons.Send size={15} />}
        </button>
      </div>
    </form>
  );
}

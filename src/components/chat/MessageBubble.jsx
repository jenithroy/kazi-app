/**
 * One message.
 *
 * The phone puts every action behind a long press. A mouse has hover and a
 * right button, so the same actions sit in a bar that appears on the bubble
 * and in a context menu -- no gesture a desktop user has to be taught.
 */

import { useEffect, useRef, useState } from "react";
import { Icons } from "../ui";
import { EmojiPicker, Menu, MenuDivider, MenuItem, PersonAvatar } from "./ChatBits";
import {
  clipLength,
  continuesRun,
  fileSize,
  firstName,
  isMe,
  messageMeta,
  messageText,
  messageTimestamp,
  personFor,
  QUICK_REACTIONS,
} from "../../lib/chatFormat";

/* ── attachment tile ──────────────────────────────────── */

function AttachmentTile({ attachment, mine, onOpen }) {
  const { kind, url, name, size, width, height, duration } = attachment;

  if ((kind === "image" || kind === "video") && url) {
    // Reserve the real aspect ratio where the row recorded it, so the thread
    // does not jump as media loads. Capped, or a tall photo fills the pane.
    const ratio = width && height ? width / height : 4 / 3;
    return (
      <button
        type="button"
        className="kchat-media"
        style={{ aspectRatio: String(Math.min(Math.max(ratio, 0.6), 1.9)) }}
        onClick={() => onOpen(attachment)}
        title={name}
      >
        {kind === "image" ? (
          <img src={url} alt={name} loading="lazy" />
        ) : (
          <>
            <video src={url} preload="metadata" muted playsInline />
            <span className="kchat-media-play">
              <Icons.Play size={18} />
            </span>
            {duration ? <span className="kchat-media-len">{clipLength(duration)}</span> : null}
          </>
        )}
      </button>
    );
  }

  // A file, or media whose signed link has lapsed -- both render as a row you
  // can still click, rather than a broken tile.
  return (
    <button type="button" className={`kchat-file${mine ? " kchat-file--mine" : ""}`} onClick={() => onOpen(attachment)}>
      <span className="kchat-file-ico">
        {kind === "image" ? <Icons.Image size={15} /> : kind === "video" ? <Icons.Play size={15} /> : <Icons.File size={15} />}
      </span>
      <span className="kchat-file-meta">
        <span className="kchat-file-name">{name}</span>
        <span className="kchat-file-size">{[fileSize(size), duration ? clipLength(duration) : ""].filter(Boolean).join(" · ")}</span>
      </span>
      <Icons.Download size={14} />
    </button>
  );
}

/* ── the bubble ───────────────────────────────────────── */

export default function MessageBubble({
  message,
  previous,
  isGroup,
  replyTarget,
  canPost,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onOpenMedia,
  onJumpTo,
}) {
  const mine = isMe(message.authorId);
  const run = continuesRun(message, previous);

  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const editRef = useRef(null);
  const pickerTrigger = useRef(null);
  const menuTrigger = useRef(null);

  useEffect(() => {
    if (editing) {
      editRef.current?.focus();
      editRef.current?.select();
    }
  }, [editing]);

  const commitEdit = () => {
    const text = draft.trim();
    setEditing(false);
    if (text && text !== message.text) onEdit(message.id, text);
    else setDraft(message.text);
  };

  const actionable = !message.deleted && !message.pending;

  return (
    <div
      className={`kchat-msg${mine ? " kchat-msg--mine" : ""}${run ? " kchat-msg--run" : ""}`}
      onContextMenu={(e) => {
        if (!actionable) return;
        e.preventDefault();
        setMenuOpen(true);
      }}
      id={`msg-${message.id}`}
    >
      {/* The gutter holds an avatar only at the start of a run, but keeps its
          width throughout so a run stays aligned. */}
      <div className="kchat-msg-gutter">
        {!mine && !run && <PersonAvatar personId={message.authorId} size={28} showPresence={false} />}
      </div>

      <div className="kchat-msg-col">
        {isGroup && !mine && !run && (
          <span className="kchat-msg-author">{personFor(message.authorId).name}</span>
        )}

        <div className="kchat-msg-line">
          <div
            className={[
              "kchat-bubble",
              mine ? "kchat-bubble--mine" : "",
              message.deleted ? "kchat-bubble--gone" : "",
              message.attachment && !message.text ? "kchat-bubble--media" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {/* A quoted reply. Clicking it scrolls to the original. */}
            {message.replyTo && (
              <button
                type="button"
                className="kchat-quote"
                onClick={() => onJumpTo(message.replyTo)}
                disabled={!replyTarget}
              >
                <span className="kchat-quote-who">
                  {replyTarget
                    ? isMe(replyTarget.authorId)
                      ? "You"
                      : firstName(replyTarget.authorId)
                    : "Message"}
                </span>
                <span className="kchat-quote-text">
                  {replyTarget ? messageText(replyTarget) : "No longer available"}
                </span>
              </button>
            )}

            {message.attachment && (
              <AttachmentTile attachment={message.attachment} mine={mine} onOpen={onOpenMedia} />
            )}

            {editing ? (
              <div className="kchat-edit">
                <textarea
                  ref={editRef}
                  value={draft}
                  rows={Math.min(6, draft.split("\n").length + 1)}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      commitEdit();
                    }
                    if (e.key === "Escape") {
                      setDraft(message.text);
                      setEditing(false);
                    }
                  }}
                />
                <div className="kchat-edit-actions">
                  <button type="button" onClick={() => { setDraft(message.text); setEditing(false); }}>
                    Cancel
                  </button>
                  <button type="button" className="primary-button" onClick={commitEdit}>
                    Save
                  </button>
                </div>
              </div>
            ) : (
              (message.text || message.deleted) && (
                <span className="kchat-bubble-text">{messageText(message)}</span>
              )
            )}
          </div>

          {/* Hover actions. Hidden from the tab order -- everything here is
              also on the context menu, which keyboard users reach without a
              row of buttons interrupting every message. */}
          {actionable && canPost && !editing && (
            <div className="kchat-msg-actions" aria-hidden="true">
              <button ref={pickerTrigger} type="button" className="kchat-icon-btn" onClick={() => setPickerOpen((v) => !v)} tabIndex={-1} title="React">
                <Icons.Smile size={14} />
              </button>
              <button type="button" className="kchat-icon-btn" onClick={() => onReply(message)} tabIndex={-1} title="Reply">
                <Icons.Reply size={14} />
              </button>
              <button ref={menuTrigger} type="button" className="kchat-icon-btn" onClick={() => setMenuOpen((v) => !v)} tabIndex={-1} title="More">
                <Icons.More size={14} />
              </button>

              {pickerOpen && (
                <div className="kchat-pop-anchor">
                  <EmojiPicker
                    triggerRef={pickerTrigger}
                    onClose={() => setPickerOpen(false)}
                    onPick={(emoji) => {
                      onReact(message.id, emoji);
                      setPickerOpen(false);
                    }}
                  />
                </div>
              )}

              <Menu open={menuOpen} onClose={() => setMenuOpen(false)} triggerRef={menuTrigger} style={{ top: 28 }}>
                <div className="kchat-menu-quick">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="kchat-emoji"
                      onClick={() => {
                        onReact(message.id, emoji);
                        setMenuOpen(false);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <MenuDivider />
                <MenuItem icon={Icons.Reply} onClick={() => { onReply(message); setMenuOpen(false); }}>
                  Reply
                </MenuItem>
                <MenuItem
                  icon={Icons.Copy}
                  onClick={() => {
                    navigator.clipboard?.writeText(messageText(message));
                    setMenuOpen(false);
                  }}
                >
                  Copy text
                </MenuItem>
                {mine && message.text && (
                  <MenuItem icon={Icons.Edit} onClick={() => { setEditing(true); setMenuOpen(false); }}>
                    Edit
                  </MenuItem>
                )}
                {mine && (
                  <>
                    <MenuDivider />
                    <MenuItem icon={Icons.Trash} danger onClick={() => { onDelete(message); setMenuOpen(false); }}>
                      Delete
                    </MenuItem>
                  </>
                )}
                <MenuDivider />
                <div className="kchat-menu-info">{messageTimestamp(message)}</div>
              </Menu>
            </div>
          )}
        </div>

        {/* Reaction chips. Mine is outlined, so a glance says whether I already reacted. */}
        {message.reactions.length > 0 && (
          <div className="kchat-reacts">
            {message.reactions.map((r) => {
              const isMine = r.by.some(isMe);
              return (
                <button
                  key={r.emoji}
                  type="button"
                  className={`kchat-react${isMine ? " kchat-react--mine" : ""}`}
                  onClick={() => canPost && onReact(message.id, r.emoji)}
                  title={r.by.map((id) => personFor(id).name).join(", ")}
                >
                  <span>{r.emoji}</span>
                  {r.by.length > 1 && <span className="kchat-react-n">{r.by.length}</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="kchat-msg-meta">
          {message.editedAt && !message.deleted && <span className="kchat-edited">Edited</span>}
          <span>{messageMeta(message)}</span>
          {mine && !message.deleted && !message.pending && (
            <Icons.CheckAll size={12} className={message.read ? "kchat-read" : "kchat-sent"} />
          )}
        </div>
      </div>
    </div>
  );
}

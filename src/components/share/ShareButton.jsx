/**
 * The Send button a record's card draws. It is nothing at all for someone who cannot post in Chat.
 *
 *   <ShareButton type="techpack" record={item} />                                a ghost button: "Send"
 *   <ShareButton type="vat_bill" record={bill} className="klib-action-btn" />   in a card whose action row has its own button look
 *   <ShareButton type="task" record={task} compact />                            icon only on a phone (under 480px), for a footer that is full
 *   <ShareButton type="techpack" record={item} label="" className="ktp-viewer-btn" />   icon only everywhere
 *
 * `type` is a key of lib/share/records.js; `record` is the object the card already holds (the adapter reads what it needs from it).
 */
import { Icons } from "../ui";
import { useShare } from "./ShareProvider";

export default function ShareButton({ type, record, label = "Send", className = "ghost-button", title, compact = false }) {
  const { open } = useShare();
  if (!open || !record) return null;
  const words = title || "Send this to someone in Chat";
  return (
    <button
      type="button" className={`${className} ksh-btn${compact ? " ksh-btn--compact" : ""}`} onClick={() => open({ type, record })} title={words}
      aria-label={label && !compact ? undefined : words}
    >
      <Icons.Send size={14} sw={1.9} aria-hidden="true" />
      {label ? <span className="ksh-btn-t">{label}</span> : null}
    </button>
  );
}

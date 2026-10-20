/**
 * Small pieces the Employees page's list, tiles and cards share: a person's picture and name, their hours, how they stand,
 * and the strip under the list that confirms what just happened.
 */
import { useRef, useState } from "react";
import { Avatar, Icons, cn, hueFromName } from "../ui";
import { daysNote, hoursOf, isActive } from "../../lib/employees";

/** [strip, offer(label, run?), clear]: Finance's timer for a quiet strip (`run`, when given, takes the thing back). */
export { useUndo as useStrip } from "../finance/parts";

export const personName = (row) => String(row?.name || "").trim() || "Unnamed";

/** A person's circle: their picture, or their initials on a colour of their own. */
export function Face({ row, size = 30 }) {
  const name = personName(row);
  return <Avatar name={name} personId={row?.id || undefined} hue={hueFromName(name)} size={size} />;
}

/** Active or Inactive, in the page's tags. Inactive people cannot sign in, so it is the one that is marked. */
export function StatusTag({ row }) {
  return isActive(row) ? <span className="kb-tag kb-tag--good">Active</span> : <span className="kb-tag kb-tag--bad">Inactive</span>;
}

/**
 * A person's hours: the time, and under it what is different about the week (days off, a day with other hours). Hours that are
 * not on their record say where they come from, or that nothing is set (then anyone arriving at 10:00 is marked late).
 */
export function HoursCell({ row }) {
  const h = hoursOf(row);
  if (h.source === "none") return <span className="dt-dim">Not set</span>;
  const rest = [daysNote(h), ...h.exceptions].filter(Boolean).join(" · ");
  return (
    <span className="em-lines" title={[h.time, rest, h.source === "builtin" ? "built-in hours" : ""].filter(Boolean).join(" · ")}>
      <b>{h.time}</b>
      {rest ? <span>{rest}</span> : h.source === "builtin" ? <span>built in</span> : null}
    </span>
  );
}

/** A quiet strip: what happened, and (when it can be taken back) an Undo. It is spoken to a screen reader as a status. */
export function Strip({ strip, onClose }) {
  const [busy, setBusy] = useState(false);
  const current = useRef(strip);
  current.current = strip;
  if (!strip) return null;
  return (
    <div className="em-strip" role="status">
      <Icons.Check size={14} sw={2.2} aria-hidden="true" />
      <span>{strip.label}</span>
      {strip.run ? (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try { await strip.run(); } finally {
              setBusy(false);
              // the strip that is up when the undo finishes may be a newer one: leave that one
              if (current.current === strip) onClose();
            }
          }}
        >
          Undo
        </button>
      ) : (
        <button type="button" className={cn("em-strip-x")} aria-label="Dismiss" onClick={onClose}><Icons.X size={14} sw={2} aria-hidden="true" /></button>
      )}
    </div>
  );
}

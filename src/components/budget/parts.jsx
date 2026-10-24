/**
 * Small pieces the Budget page's list, tiles and cards share: an amount as the page's currency says it, the urgency and
 * status tags, who asked, and the strip under the list that confirms what just happened (with Undo, when it can be taken back).
 */
import { useRef, useState } from "react";
import { Avatar, Icons, cn, hueFromName } from "../ui";
import PersonLink from "../profile/PersonLink";
import { useCurrency } from "../../context/CurrencyContext";
import { npr, useMoney } from "../finance/parts";
import { leadFollow, requestAmount, roleLabel, statusLabel, statusTone, urgencyLabel, urgencyTone } from "../../lib/budget";

/**
 * A request's amount as text: `lead` in the page's currency and `follow` in the other, the way the old requirements table had
 * them (rupees lead while the page is in rupees, otherwise the pounds as they were typed). Null when no amount was given.
 */
export function useAmountText(row) {
  const { currency, moneyAlt } = useCurrency();
  const text = useMoney();
  const a = requestAmount(row);
  if (!a) return null;
  const [lead, follow] = leadFollow(a, currency);
  return { lead: text(lead), follow: currency !== "NPR" ? `₨ ${npr(follow)}` : moneyAlt(follow), npr: a.npr };
}

/** The amount cell of the list: the figure, with the other currency under it; a dash and a reason when none was given. */
export function Amount({ row }) {
  const t = useAmountText(row);
  if (!t) return <span className="dt-dim">No amount</span>;
  return (
    <span className="dt-stack">
      <span className="dt-num dt-strong">{t.lead}</span>
      <small>{t.follow}</small>
    </span>
  );
}

export function UrgencyTag({ urgency }) {
  const tone = urgencyTone(urgency);
  return <span className={cn("kb-tag", tone && `kb-tag--${tone}`)}>{urgencyLabel(urgency)}</span>;
}

export function StatusTag({ row }) {
  const tone = statusTone(row);
  return <span className={cn("kb-tag", tone && `kb-tag--${tone}`)}>{statusLabel(row)}</span>;
}

/** Who asked: their picture (or initials) and name, with the job they were doing it as under. */
export function Who({ row, size = 26 }) {
  const name = row.requestedBy || "Unknown";
  const role = roleLabel(row.requestedByRole);
  return (
    <span className="bd-who">
      <PersonLink decor personId={row.requested_by_id || undefined} name={name}>
        <Avatar name={name} personId={row.requested_by_id || undefined} hue={hueFromName(name)} size={size} />
      </PersonLink>
      <span className="bd-who-t">
        <b title={name}><PersonLink className="kpl--clip" personId={row.requested_by_id || undefined} name={name} /></b>
        {role ? <span>{role}</span> : null}
      </span>
    </span>
  );
}

/** [strip, offer(label, run?), clear]: Finance's timer for a quiet strip (`run`, when given, takes the thing back). */
export { useUndo as useStrip } from "../finance/parts";

/** A quiet strip: what happened, and (when it can be taken back) an Undo. It is spoken to a screen reader as a status. */
export function Strip({ strip, onClose }) {
  const [busy, setBusy] = useState(false);
  const current = useRef(strip);
  current.current = strip;
  if (!strip) return null;
  return (
    <div className="bd-strip" role="status">
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
              // the strip that is up when the undo finishes may be a newer one (another decision was made meanwhile): leave that one
              if (current.current === strip) onClose();
            }
          }}
        >
          Undo
        </button>
      ) : (
        <button type="button" className="bd-strip-x" aria-label="Dismiss" onClick={onClose}><Icons.X size={14} sw={2} aria-hidden="true" /></button>
      )}
    </div>
  );
}

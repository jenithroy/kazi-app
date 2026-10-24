import { useState } from "react";
import EditCard, { KV, Tag } from "../EditCard";
import { Avatar, Icons, hueFromName } from "../ui";
import PersonLink from "../profile/PersonLink";
import ShareButton from "../share/ShareButton";
import { useAmountText } from "./parts";
import { normaliseRegion, regionLabel } from "../../utils/region";
import {
  ageDays, agoLabel, askedDay, decidedDay, fmtDay, isBudgetKind, isRequirement, isWaiting, kindLabel, roleLabel,
  statusKey, statusLabel, statusTone, urgencyLabel, urgencyTone,
} from "../../lib/budget";
import "./budget.css";

/**
 * One request, in the card in the middle of the screen (EditCard, to read, not to edit). On the left what is being asked for
 * and why, and (once decided) what was decided; on the right who asked, when and how urgently. For someone who may decide, a
 * request that is still waiting has Reject and Approve in the footer: the reason is read first, the decision is one press.
 * `onDecide(row, "Approved" | "Rejected")` resolves `{ ok, message }`; on ok the page closes the card, otherwise the card
 * stays up and says why.
 */
export default function RequestCard({ row, today, canDecide, onDecide, onClose }) {
  const amount = useAmountText(row);
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");

  const waiting = isWaiting(row);
  const key = statusKey(row);
  const asked = askedDay(row);
  const decided = decidedDay(row);
  const days = ageDays(row, today);
  const region = normaliseRegion(row.region);
  const name = row.requestedBy || "Unknown";
  const reason = row.notes?.trim();
  const send = <ShareButton type="budget_request" record={row} compact title="Send this request to someone in Chat" />;

  async function go(next) {
    if (busy) return;
    setBusy(next);
    setProblem("");
    const res = await onDecide(row, next);
    if (res && res.ok === false) {
      setProblem(res.message || "Not saved. Try again.");
      setBusy("");
    }
  }

  const main = (
    <>
      <div className="ec-block ec-wide">
        <span className="ec-cap">Amount asked for</span>
        {amount ? (
          <div className="ec-fig">{amount.lead}<small>{amount.follow}</small></div>
        ) : (
          <div className="ec-fig bd-noamt">No amount given</div>
        )}
      </div>

      <div className="ec-block ec-wide">
        <span className="ec-cap">{isBudgetKind(row) ? "Justification" : "Notes"}</span>
        {reason ? <p className="ec-note bd-why">{reason}</p> : <p className="ec-hist-empty">No reason was given.</p>}
      </div>

      {!waiting && (
        <div className={`bd-verdict bd-verdict--${key} ec-wide`} role="status">
          {key === "approved" ? <Icons.Check size={16} sw={2.3} aria-hidden="true" /> : key === "rejected" ? <Icons.X size={16} sw={2.3} aria-hidden="true" /> : null}
          <span>
            <b>{statusLabel(row)}</b>
            {row.reviewedBy ? <>{" by "}<PersonLink name={row.reviewedBy} /></> : ""}{decided ? ` on ${fmtDay(decided)}` : ""}
          </span>
        </div>
      )}
    </>
  );

  const side = (
    <>
      <div className="bd-asker ec-wide">
        <PersonLink decor personId={row.requested_by_id || undefined} name={name}>
          <Avatar name={name} personId={row.requested_by_id || undefined} hue={hueFromName(name)} size={40} />
        </PersonLink>
        <span>
          <b><PersonLink className="kpl--clip" personId={row.requested_by_id || undefined} name={name} /></b>
          <small>{roleLabel(row.requestedByRole) || "Asked from the page"}</small>
        </span>
      </div>
      <KV
        rows={[
          ["Asked", asked ? <>{fmtDay(asked)} <small>· {agoLabel(days)}</small></> : "—"],
          ["Urgency", <Tag key="u" tone={urgencyTone(row.urgency)}>{urgencyLabel(row.urgency)}</Tag>],
          ["Category", row.category || "—"],
          ["Type", kindLabel(row)],
          ...(isRequirement(row) ? [["Quantity", row.quantity || "—"]] : []),
          ...(row.brId ? [["Reference", row.brId]] : []),
          ...(region ? [["Region", regionLabel(region)]] : []),
          ["Status", <Tag key="s" tone={statusTone(row)}>{statusLabel(row)}</Tag>],
        ]}
      />
    </>
  );

  return (
    <EditCard
      className="bd-card"
      title={row.title || "Untitled request"}
      subtitle={[kindLabel(row), row.brId, asked ? `asked ${fmtDay(asked)}` : ""].filter(Boolean).join(" · ")}
      canEdit={false}
      mainLabel="Request"
      sideLabel="Details"
      main={main}
      side={side}
      footerExtra={canDecide && waiting ? (
        <>
          {problem && <p className="kmodal-msg kmodal-msg--err" role="alert">{problem}</p>}
          {/* aria-disabled, not disabled: a button that is switched off while it holds the cursor drops the cursor on the page behind the card */}
          <button type="button" className="ghost-button ec-ft-l ec-danger" aria-disabled={busy ? "true" : undefined} onClick={() => go("Rejected")}>
            {busy === "Rejected" ? "Rejecting…" : "Reject"}
          </button>
          {send}
          <button type="button" className="primary-button" aria-disabled={busy ? "true" : undefined} onClick={() => go("Approved")}>
            {busy === "Approved" ? "Approving…" : "Approve"}
          </button>
        </>
      ) : send}
      onClose={onClose}
    />
  );
}

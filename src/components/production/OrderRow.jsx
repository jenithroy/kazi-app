import { Avatar, Icons, cn, hueFromName } from "../ui";
import { Money } from "../bento/Bento";
import PersonLink from "../profile/PersonLink";
import CustomerLink from "../customer-link/CustomerLink";
import { StageBar, StageTag } from "./StageMark";
import { dueInfo, isOpen, nextStageOf } from "../../lib/production";

/**
 * One order in the list. The whole row opens the order (a button laid over it); the one thing that
 * can be done without opening it, moving it on a stage, sits above that button.
 *
 * What a row shows depends on the width of the tile it is in (production.css hides the less useful
 * cells first), so a phone gets the customer, the stage, the due date and the button.
 */
export default function OrderRow({ order, today, canEdit, busy, onOpen, onAdvance }) {
  const due = dueInfo(order, today);
  const open = isOpen(order);
  const hold = order.status === "On Hold";
  const next = nextStageOf(order.stage);
  const canMove = open && !hold && canEdit && Boolean(next);
  const qty = Number(order.quantity || 0);
  const what = [order.styleName, order.fabricType, order.colorway].filter(Boolean).join(" · ");

  return (
    <li className={cn("pr-row", !open && "is-closed", busy && "is-busy")}>
      <button
        type="button"
        className="pr-hit"
        onClick={() => onOpen(order)}
        aria-label={`Open ${order.orderId}, ${order.customerName || "no customer"}, ${order.styleName || "no style"}, ${open ? order.stage : order.status}`}
      />

      <span className="pr-c-id">{order.orderId}</span>

      <span className="pr-c-main">
        {/* the customer's name opens their card (it sits above the row's own button, so the order does not open) */}
        <b>{order.customerName ? <CustomerLink className="cl-clip" customerId={order.customer_id} name={order.customerName}>{order.customerName}</CustomerLink> : "No customer"}</b>
        <span>{what || "No style yet"}</span>
      </span>

      <span className="pr-c-stage">
        {open
          ? <StageTag stage={order.stage} short />
          : <span className={cn("kb-tag", order.status === "Cancelled" ? "kb-tag--bad" : "kb-tag--good")}>{order.status}</span>}
        <StageBar stage={order.status === "Cancelled" ? order.stage : "Delivered"} />
      </span>

      <span className="pr-c-qty">{qty.toLocaleString()}<small> pcs</small></span>

      <span className="pr-c-val">{Number(order.totalValueNPR) ? <Money npr={order.totalValueNPR} compact /> : "—"}</span>

      <span className={cn("pr-c-due", due.tone && `is-${due.tone}`)}>
        <b>{due.date || "—"}</b>
        <small><span className="pr-note-f">{due.note}</span><span className="pr-note-s">{due.short}</span></small>
      </span>

      <span className="pr-c-who">
        {order.assignedTo
          ? (
            <>
              <span title={order.assignedTo}><Avatar name={order.assignedTo} personId={order.assigned_to || undefined} hue={hueFromName(order.assignedTo)} size={26} /></span>
              {/* their profile: an empty button over the photo (production.css), so the photo's initials are not part of its name */}
              <PersonLink personId={order.assigned_to || undefined} name={order.assignedTo} label={`Assigned to ${order.assignedTo}`} title={order.assignedTo}><></></PersonLink>
            </>
          )
          : null}
      </span>

      <span className="pr-c-act">
        {canMove ? (
          <button
            type="button"
            className="pr-next pr-act"
            disabled={busy}
            onClick={() => onAdvance(order)}
            aria-label={`${next === "Delivered" ? "Deliver" : "Next"}: move ${order.orderId} to ${next}`}
          >
            {next === "Delivered" ? "Deliver" : "Next"} <Icons.ArrowRight size={13} sw={2} aria-hidden="true" />
          </button>
        ) : hold ? (
          <span className="kb-tag kb-tag--warn">On hold</span>
        ) : null}
      </span>
    </li>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import EditCard, { KV, Tag } from "../EditCard";
import { Icons, cn } from "../ui";
import PersonLink from "../profile/PersonLink";
import ShareButton from "../share/ShareButton";
import { useCurrency } from "../../context/CurrencyContext";
import { toNPR } from "../../utils/currency";
import { normaliseRegion, regionLabel } from "../../utils/region";
import { ORDER_STAGES } from "../../constants/enums";
import { deliveredOn, fmtDay, fmtShort, isDelivered, isOpen, orderWhen } from "../../lib/sales";
import "./sales.css";

const MOVES = 4;                 // how many of an order's moves show before "Show all"
const LAST = ORDER_STAGES.length - 1;

/**
 * One order, in the card in the middle of the screen (EditCard, view-only): where it is (the stage, the ten steps, the
 * last few moves, any embellishment, the notes) on the left; what it is worth, when it is due, who has it and how it
 * was billed on the right. It is the Production page's order card as a Sales person needs it: to see, not to move on.
 * Moving an order on, holding it or editing it happens in Production (the "Open in Production" button); the customer
 * behind it is one press away ("Open customer").
 */
export default function OrderDetails({ order, invoice, canSeeInvoices = true, today, canOpenCustomer, canOpenProduction, onOpenCustomer, onClose }) {
  const { fmt } = useCurrency();
  const [allMoves, setAllMoves] = useState(false);

  const open = isOpen(order);
  const delivered = isDelivered(order);
  const hold = order.status === "On Hold";
  const at = ORDER_STAGES.indexOf(order.stage);                 // -1 for a stage nobody listed: no step is claimed then
  const step = delivered ? LAST + 1 : at >= 0 ? at + 1 : null;
  const when = orderWhen(order, today);
  const due = order.deliveryDate || order.dueDate || "";
  const qty = Number(order.quantity || 0);
  const value = Number(order.totalValueNPR || 0);
  const price = Number(order.pricePerPcNPR || 0);
  const moves = (Array.isArray(order.stageHistory) ? order.stageHistory : []).slice().reverse();      // newest first
  const shownMoves = allMoves ? moves : moves.slice(0, MOVES);
  const embellishments = Array.isArray(order.embellishments) ? order.embellishments : [];
  const notesList = Array.isArray(order.notesList) ? order.notesList : [];
  const region = normaliseRegion(order.region);

  // the date tag under the stage: delivered, late, due, or nothing set
  const dueTag = delivered ? { tone: "good", text: `Delivered ${fmtShort(deliveredOn(order))}` }
    : !open ? null
    : !due ? { text: "No delivery date" }
    : when.late ? { tone: "bad", text: when.note }
    : { text: when.note === "due today" ? "Due today" : `Due ${when.date}` };

  // how it was billed: the invoice itself, with what is still owed on it
  // (a person who cannot see Billing gets the number the order carries and nothing about the money)
  let invoiceRow;
  if (invoice && canSeeInvoices) {
    const total = toNPR(invoice.totalNPR, invoice.currency);
    const owed = invoice.status === "Cancelled" ? 0 : Math.max(0, total - toNPR(invoice.amountPaid, invoice.currency));
    const late = owed > 0.5 && invoice.dueDate && invoice.dueDate < today;
    invoiceRow = [
      "Invoice",
      [invoice.invoiceNumber, invoice.status, owed > 0.5 ? `${fmt(owed)} owed` : ""].filter(Boolean).join(" · "),
      invoice.status === "Paid" ? "good" : late ? "bad" : undefined,
    ];
  } else {
    invoiceRow = ["Invoice", order.invoiceRef || (canSeeInvoices ? "Not invoiced yet" : "—")];
  }

  const main = (
    <>
      <div className="sl-now ec-wide">
        <div className="sl-now-top">
          <div>
            <span className="ec-cap">{open ? "Now at" : order.status || "Closed"}</span>
            <b className="sl-now-stage">{order.stage || "—"}</b>
          </div>
          <div className="sl-now-step">
            <span className="ec-cap">Step</span>
            <b>{step ? `${step} / ${ORDER_STAGES.length}` : "—"}</b>
          </div>
        </div>
        <div className="sl-now-tags">
          <Tag tone={hold ? "warn" : order.status === "Cancelled" ? "bad" : order.status === "Active" ? "good" : undefined}>{order.status || "Active"}</Tag>
          {dueTag && <Tag tone={dueTag.tone}>{dueTag.text}</Tag>}
        </div>
      </div>

      <ol className="sl-steps ec-wide" aria-label="Stages">
        {ORDER_STAGES.map((s, i) => {
          const done = delivered || i < at;
          const now = !delivered && i === at;
          const h = moves.find((x) => x.stage === s);       // the newest time it reached this stage
          return (
            <li
              key={s}
              className={cn(done && "is-done", now && "is-now")}
              aria-current={now ? "step" : undefined}
              title={`${s}${h ? ` · ${fmtShort(h.date)}${h.by ? ` · ${h.by}` : ""}` : ""}`}
            >
              <span aria-hidden="true">{done ? <Icons.Check size={11} sw={2.6} /> : i + 1}</span>
              <span className="sl-sr">{s}{done ? ", done" : now ? ", now" : ""}</span>
            </li>
          );
        })}
      </ol>

      {moves.length > 0 && (
        <div className="ec-block ec-wide">
          <span className="ec-cap">
            {allMoves ? "All moves" : "Recent moves"}
            {moves.length > MOVES && (
              <>
                {" "}
                <button type="button" className="sl-link sl-link--cap" aria-expanded={allMoves} onClick={() => setAllMoves((v) => !v)}>
                  {allMoves ? "Show fewer" : `Show all ${moves.length}`}
                </button>
              </>
            )}
          </span>
          <ul className="ec-hist sl-moves" tabIndex={allMoves ? 0 : undefined} aria-label="Stage moves, newest first">
            {shownMoves.map((h, i) => (
              <li key={`${h.date}-${h.stage}-${i}`}>
                <time dateTime={h.date}>{fmtShort(h.date)}</time>
                <b className="sl-mv-s">{h.stage}</b>
                <span className="sl-mv-b">{h.by ? <PersonLink className="kpl--clip" name={h.by}>{`by ${h.by}`}</PersonLink> : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {embellishments.length > 0 && (
        <div className="ec-block ec-wide">
          <span className="ec-cap">Embellishment</span>
          <div className="ec-chips">{embellishments.map((t) => <span key={t} className="ec-chip sl-chip-ro">{t}</span>)}</div>
        </div>
      )}

      <div className="ec-block ec-wide">
        <span className="ec-cap">Notes</span>
        {order.notes ? <p className="ec-note sl-note">{order.notes}</p> : null}
        {notesList.length > 0 ? (
          <ul className="ec-hist sl-notes" aria-label="Notes on this order">
            {notesList.map((n, i) => {
              const when = n.date ? fmtShort(n.date) : "—";       // a note carries a date only when one was saved with it
              return (
                <li key={n.id || i}>
                  <span className="sl-nt-by"><b>{n.by ? <PersonLink name={n.by} /> : "Someone"}</b>{when !== "—" ? ` · ${when}` : ""}</span>
                  <span className="sl-nt-tx">{n.text}</span>
                </li>
              );
            })}
          </ul>
        ) : !order.notes ? <p className="ec-hist-empty">No notes on this order.</p> : null}
      </div>
    </>
  );

  const rows = [
    ["Style", order.styleName || "—"],
    ["Pieces", qty.toLocaleString()],
    ["Price a piece", price > 0 ? fmt(price) : "—"],
    ["Ordered", order.date ? fmtDay(order.date) : "—"],
    delivered ? ["Delivered", fmtDay(deliveredOn(order)), "good"] : ["Due", due ? fmtDay(due) : "Not set", when.late ? "bad" : undefined],
    ["Fabric", order.fabricType || "—"],
    ["Colourway", order.colorway || "—"],
    ["Assigned to", order.assignedTo ? <PersonLink personId={order.assigned_to || undefined} name={order.assignedTo} /> : "Nobody yet"],
    invoiceRow,
    ["Sample", order.sampleName || "—"],
  ];
  if (region) rows.push(["Region", regionLabel(region)]);

  const side = (
    <>
      <div className="ec-block ec-wide">
        <span className="ec-cap">Order value</span>
        <div className="ec-fig">{value > 0 ? fmt(value) : <span className="sl-noprice">No price yet</span>}</div>
      </div>
      <KV rows={rows} />
    </>
  );

  return (
    <EditCard
      className="sl-card"
      title={order.customerName || "Order"}
      subtitle={[order.orderId, order.styleName, `${qty.toLocaleString()} pcs`].filter(Boolean).join(" · ")}
      canEdit={false}
      mainLabel="Progress"
      sideLabel="Details"
      main={main}
      side={side}
      footerExtra={(
        <>
          {/* "Send" puts this card in Chat as a PDF: the price and the value (this card shows them to everyone), and the invoice's status and what is owed only where the card shows them */}
          <ShareButton type="order" record={{ order, today, prices: true, invoice: canSeeInvoices ? invoice : null, invoiceRef: order.invoiceRef || "" }} compact title="Send this order to someone in Chat" />
          {canOpenCustomer && <button type="button" className="ghost-button" onClick={onOpenCustomer}>Open customer</button>}
          {canOpenProduction && <Link to="/production" className="ghost-button sl-linkbtn">Open in Production</Link>}
        </>
      )}
      onClose={onClose}
    />
  );
}

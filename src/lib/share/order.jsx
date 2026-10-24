/**
 * A production order and its pipeline as one PDF (pdfKit's CardDoc), for "Send to chat". DESIGN.md "Send to chat" has the contract.
 *
 * Two cards send it, and they do not show an order in the same way, so the card hands over what IT shows and this file adds nothing:
 *
 *   record = {
 *     order,        the order row as the card holds it (stage, status, stageHistory, notesList...)
 *     today,        the office's "YYYY-MM-DD" the card was drawn with (default: now), so "3 days late" says what the card said
 *     prices,       true when the card shows the price a piece and the order value. Both cards do, to everyone who can open them.
 *                   Without it the copy carries no price at all
 *     invoiceRef,   the invoice / challan number the card shows
 *     invoice,      only when the card shows more than the number: Sales, for a position that may see Billing (the invoice, its
 *                   status and what is still owed). A position that may not passes none, and the copy has the number and no more
 *   }
 *
 * The page: the badges, the pipeline (the ten stages of lib/production.js as done / now / to come, with a sentence under it), the
 * details the card shows, every move and the notes.
 *
 * What is NOT in it, on purpose: costs and margins. Production's card has a "Profit and loss" (revenue, materials, labour, overhead,
 * shipping, profit, margin) for whoever can see it, and an order has costs of its own, but a copy opens for everyone in the chat whatever
 * their position, and the scope agreed for Send to chat leaves product costs, unit economics and order costs out of every copy. So the
 * copy has the price a piece, the order value and the invoice line (as the card shows them) and no cost, profit or margin, and a record
 * that carries a `pnl` anyway is not read for one.
 *
 * The pipeline is read the way the cards read it: Production and Sales both call an order closed when its status is Completed,
 * Cancelled or Delivered, both call it on hold when the status is "On Hold", and both find its place with `ORDER_STAGES.indexOf(stage)`
 * (-1 for a stage nobody listed). They differ in one drawing, where Production leaves a delivered order's last dot as "here now" and
 * Sales ticks all ten; a copy ticks all ten (it is finished). The moves are `stageHistory` as Production's "All moves" lists them
 * (oldest first, "Sent back to X" for a step back) with the days each stay lasted, counted by the same `daysInVisit` its stage history uses.
 */
import { fmtField } from "../calendar";
import { STAGES, daysInVisit, dueInfo, isClosed, movedTo, stageIndex } from "../production";
import { toNPR } from "../../utils/currency";
import { kathmanduDate } from "../../utils/date";
import { normaliseRegion, regionLabel } from "../../utils/region";
import { logoDataUrl, rs, safeFileName, takenAt } from "./helpers";
import { fitSections, softWrap } from "./softWrap";

const STATUS_TONE = { Active: "good", "On Hold": "warn", Cancelled: "bad" };

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const stay = (n) => (n === 0 ? "same day" : plural(n, "day"));

/** "18 Oct 2026"; a date somebody wrote some other way is shown as it was written. */
function dayText(value) {
  const s = String(value ?? "").trim();
  return fmtField(s) || fmtField(s.slice(0, 10)) || s;
}

/** The invoice line of Sales' card: the number, its status and what is still owed (the card's own sum, in rupees). */
function invoiceLine(invoice) {
  const total = toNPR(invoice.totalNPR, invoice.currency);
  const owed = invoice.status === "Cancelled" ? 0 : Math.max(0, total - toNPR(invoice.amountPaid, invoice.currency));
  return [invoice.invoiceNumber, invoice.status, owed > 0.5 ? `${rs(owed)} owed` : ""].filter(Boolean).join(" · ");
}

/** One row of the moves table per history entry: the day, where it went, who moved it, and how long it stayed. */
function moveRows(order, history, today, closed) {
  return history.map((h, i) => {
    const to = movedTo(h);
    const next = history[i + 1];
    const stillHere = !next && !closed && to.stage === order.stage;          // the stay that is going on (a finished order has none)
    let days = next || stillHere ? daysInVisit({ date: h.date, left: next ? { date: next.date } : null }, today) : null;
    if (days != null && days < 0) days = null;                                  // dates out of order: no length is better than a wrong one
    return [
      dayText(h.date) || "Not recorded",
      to.stage ? (to.back ? `Sent back to ${to.stage}` : to.stage) : "Not recorded",
      h.by || "Not recorded",
      days == null ? "" : stillHere ? (days === 0 ? "today" : `${plural(days, "day")} so far`) : stay(days),
    ];
  });
}

/** The page: what the PDF says, as plain data. Exported so a test can read it without making the file. */
export function layoutOf(record) {
  const order = record?.order || {};
  const today = record?.today || kathmanduDate();
  const history = Array.isArray(order.stageHistory) ? order.stageHistory.filter(Boolean) : [];
  const notesList = Array.isArray(order.notesList) ? order.notesList.filter(Boolean) : [];
  const embellishments = Array.isArray(order.embellishments) ? order.embellishments : [];
  const status = order.status || "Active";
  const closed = isClosed(order);
  const hold = status === "On Hold";
  const delivered = order.stage === "Delivered";
  const at = stageIndex(order.stage);                                         // -1 for a stage nobody listed: no step is claimed then
  const qty = Number(order.quantity || 0);
  const price = Number(order.pricePerPcNPR || 0);
  const value = Number(order.totalValueNPR || 0);
  const region = normaliseRegion(order.region);

  /* the day it reached Delivered, if the history says so */
  let deliveredOn = "";
  for (let i = history.length - 1; delivered && i >= 0 && !deliveredOn; i -= 1) {
    const m = movedTo(history[i]);
    if (!m.back && m.stage === "Delivered" && history[i].date) deliveredOn = history[i].date;
  }

  /* badges: where it is, how it stands, when it is due */
  const badges = [
    { text: order.stage || "No stage", tone: delivered ? "good" : "info" },
    { text: status, tone: STATUS_TONE[status] || "neutral" },
  ];
  if (!closed && !delivered) {
    const due = dueInfo(order, today);
    badges.push(due.left == null
      ? { text: "No delivery date", tone: "neutral" }
      : { text: `Due ${dayText(order.deliveryDate)}${due.note ? ` (${due.note})` : ""}`, tone: due.tone === "bad" ? "bad" : due.tone === "warn" ? "warn" : "neutral" });
  }

  const sections = [];

  /* the pipeline: ten steps, done / now / to come. It comes first: it is what this copy is for */
  const tail = hold ? " (on hold)" : status === "Cancelled" ? " (cancelled)" : closed ? ` (${status.toLowerCase()})` : "";
  sections.push({
    heading: "Pipeline",
    strip: STAGES.map((s, i) => ({
      label: `${i + 1}. ${s}${i === at && !delivered ? tail : ""}`,
      state: delivered || i < at ? "done" : i === at ? "now" : "todo",
    })),
  });

  /* ...and the sentence under it: where the order is, and how far it had got if it was ever sent back */
  const step = at >= 0 ? `, step ${at + 1} of ${STAGES.length}` : "";
  let where;
  if (delivered) where = `Delivered${deliveredOn ? ` on ${dayText(deliveredOn)}` : ""}. All ${STAGES.length} steps are done.`;
  else if (closed) where = `${status} at ${order.stage || "no stage"}${step}.`;
  else if (hold) where = `On hold at ${order.stage || "no stage"}${step}.`;
  else if (at < 0) where = `At "${order.stage || "no stage"}", which is not one of the ${STAGES.length} steps.`;
  else where = `Now at ${order.stage}${step}.`;

  const last = history[history.length - 1];
  const lastMove = last ? movedTo(last) : null;
  const furthest = history.reduce((m, h) => Math.max(m, stageIndex(movedTo(h).stage)), -1);
  if (!closed && at >= 0 && furthest > at) {                                  // the "Done earlier" of Production's stage history
    const back = lastMove?.back && lastMove.stage === order.stage;
    where += ` It had reached ${STAGES[furthest]}${back ? ` and was sent back${last.date ? ` on ${dayText(last.date)}` : ""}${last.by ? ` by ${last.by}` : ""}` : ""}.`;
  }
  sections.push({ text: where });

  /* the facts the card shows */
  const invoiceText = record?.invoice ? invoiceLine(record.invoice) : (record?.invoiceRef || "");
  sections.push({
    heading: "Details",
    rows: [
      ["Quantity", `${qty.toLocaleString("en-IN")} pcs`],
      ...(record?.prices ? [["Price per piece", price > 0 ? rs(price) : ""], ["Order value", value > 0 ? rs(value) : ""]] : []),
      ["Colourway", order.colorway],
      ["Fabric", order.fabricType],
      ["Embellishment", embellishments.join(", ")],
      ["Order date", order.date ? dayText(order.date) : ""],
      ["Delivery date", order.deliveryDate ? dayText(order.deliveryDate) : "Not set"],
      ["Delivered on", deliveredOn ? dayText(deliveredOn) : ""],
      ["Assigned to", order.assignedTo || "Nobody yet"],
      ["Sample", order.sampleName],
      [record?.invoice ? "Invoice" : "Invoice / challan", invoiceText],
      ["Region", region ? regionLabel(region) : ""],
    ],
  });

  /* every move, as Production's "All moves" lists them */
  sections.push(history.length
    ? {
      heading: "Moves",
      table: { head: ["Date", "Stage", "Moved by", "Days in stage"], rows: moveRows(order, history, today, closed), flex: [2.2, 4.4, 3, 2.6], align: ["left", "left", "left", "right"] },
    }
    : { heading: "Moves", text: "No moves are recorded for this order." });

  /* the notes: who wrote each one, and when, beside the words */
  const noteRows = [];
  if (order.notes) noteRows.push(["Order note", order.notes]);
  for (const n of notesList) noteRows.push([[n.by || "Someone", n.date ? dayText(n.date) : ""].filter(Boolean).join("\n"), n.text || ""]);
  if (noteRows.length) sections.push({ heading: "Notes", rows: noteRows });

  return {
    title: `${order.orderId || "Order"}${order.styleName ? ` · ${order.styleName}` : ""}`,
    subtitle: order.customerName || "No customer",
    badges,
    sections,
  };
}

export default {
  label: "Order",

  describe(record) {
    const order = record?.order || {};
    return { title: `${order.orderId || "Order"}${order.styleName ? ` · ${order.styleName}` : ""}`, subtitle: order.customerName || "" };
  },

  async build(record, { profile } = {}) {
    const order = record?.order;
    if (!order) throw new Error("There is no order to send.");

    // The PDF maker is fetched now, alongside the logo, and not before.
    const [{ CardDoc, pdfFile }, logo] = await Promise.all([import("./pdfKit.jsx"), logoDataUrl()]);
    const page = layoutOf(record);
    // free text (a style, a customer, a note) may hold a long pasted word: softWrap lets all of it show, and leaves ordinary text alone
    const doc = (
      <CardDoc
        kind="Order" title={softWrap(page.title, 30)} subtitle={softWrap(page.subtitle, 64)} badges={page.badges.map((b) => ({ ...b, text: softWrap(b.text, 40) }))}
        sections={fitSections(page.sections)} logo={logo} takenAt={takenAt()} by={profile?.name || ""}
      />
    );
    return pdfFile(doc, safeFileName(`Order ${order.orderId || ""}${order.customerName ? ` ${order.customerName}` : ""}`.trim(), "pdf"));
  },
};

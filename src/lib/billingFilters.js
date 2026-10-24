/**
 * Billing's Filters panel: what a list of invoices, challans or quotations can be narrowed by, declared as data for the shared engine
 * (components/filters/useFilters.js). No React in here, so it can be checked on its own; the sums and rules are lib/billing.js.
 *
 *   Show         All · Cancelled   which list: the documents that stand, or the cancelled ones. These were the old chip row's first and
 *                                  last chips; the page keeps the choice (`controlled`) because it picks a list, it does not narrow one.
 *   Payment      Any · Credit due · Paid   (a challan: To deliver · Delivered; a quotation: Still open · Accepted) the old chips, with the
 *                                  very tests they had (CHIPS in lib/billing.js), now with how many each would show beside the others
 *   Only show    Overdue · Needs a client PAN · Not linked to a customer · No VAT charged (invoices);
 *                Not invoiced yet · Past its valid-until day (quotations: nothing ever links a challan to an invoice, so a challan has neither)
 *   Client       whom it is made out to (found from the documents; spellings that differ only in capitals or spaces are one client)
 *   Status       a status the documents really hold: Draft, Sent, Partial, Paid…
 *   Paid by      invoices: Cash, the bank the money went into, Credit sale, or Nothing paid yet (the way the ledger reads the payment type)
 *   Currency     only when the list holds more than one
 *   Amount       the total, in rupees
 *   Due between  invoices: the day payment is due;  Valid until: quotations
 *
 * A cancelled document is not a debt, a delivery or an offer, so the narrowing choices apply to the documents that stand; the cancelled
 * list has the ones that make sense there (client, amount, currency, the day).
 */
import { toNPR } from "../utils/currency";
import { CHIPS, PAN_LIMIT_NPR, creditDue } from "./billing";
import foldNames from "./foldNames";

const clean = (v) => String(v ?? "").trim();

export const isCancelled = (r) => r.status === "Cancelled";
export const stands = (r) => r.status !== "Cancelled";

/** Owes money on a document whose due day has passed: the rule Customers uses for its Overdue (lib/customers.js `lateOf`). */
export const isOverdue = (r, today) => stands(r) && creditDue(r) > 0.5 && Boolean(r.dueDate) && r.dueDate < today;

/** A big invoice (over NPR 50,000) with no PAN for the client: the rule the document card enforces when it is saved. */
export const needsPan = (r) => stands(r) && toNPR(r.totalNPR, r.currency) > PAN_LIMIT_NPR && !clean(r.clientPAN);

/**
 * How the money for an invoice came in, read the way the ledger reads it (lib/finance.js): Bank by the bank's name (Nabil Bank when none is
 * written), Credit as a credit sale, anything else ("CASH", or a row from before the field existed) as Cash; nothing paid yet is its own answer.
 */
export function paidBy(r) {
  if (!(Number(r.amountPaid) > 0)) return "Nothing paid yet";
  if (r.paymentType === "Bank") return clean(r.bankName) || "Nabil Bank";
  if (r.paymentType === "Credit") return "Credit sale";
  return "Cash";
}

/** A quotation still open (not answered, not cancelled, not turned into an invoice) whose last day to accept has gone by. */
export const isExpired = (r, today) => !["Accepted", "Rejected", "Cancelled"].includes(r.status) && !r.relatedInvoice && Boolean(r.validUntil) && r.validUntil < today;

const PAY_HEAD = { invoice: "Payment", challan: "Delivery", quotation: "Client's answer" };

/**
 * `list`: the kind's documents in the period (cancelled ones too); `counts`: { all, cancelled } as the Show chips say them;
 * `view`/`setView`: the page's Show choice ("all" | "cancelled"); `today`: Kathmandu's "YYYY-MM-DD"; `show`: writes a day in A.D. or B.S.
 */
export function billingFilterDefs({ tab, list, counts, view, setView, today, show }) {
  const cancelledList = view === "cancelled";
  const live = list.filter(stands);
  const defs = [{
    id: "view", label: "Show", kind: "chips", controlled: { value: view, set: setView },
    options: [{ value: "all", label: "All", count: counts.all }, { value: "cancelled", label: "Cancelled", count: counts.cancelled }],
  }];

  if (!cancelledList) {
    const moves = CHIPS[tab].filter((c) => c.value !== "all" && c.value !== "cancelled");
    defs.push({
      id: "pay", label: PAY_HEAD[tab], kind: "chips",
      options: [{ value: "any", label: "Any" }, ...moves.map((c) => ({ value: c.value, label: c.label, tone: c.tone && live.some(c.test) ? c.tone : undefined }))],
      test: (r, v) => moves.find((c) => c.value === v)?.test(r) ?? true,
    });
  }

  // the yes/no switches come right after the two choices that were chips (they are short, and Overdue is what is most often wanted)
  if (!cancelledList) {
    if (tab === "invoice") {
      defs.push(
        { id: "overdue", label: "Overdue", kind: "toggle", text: "Overdue", pill: "Overdue", test: (r) => isOverdue(r, today) },
        { id: "pan", label: "Needs a client PAN", kind: "toggle", text: "Needs a client PAN", pill: "Needs a client PAN", test: needsPan },
        { id: "nocust", label: "Not linked to a customer", kind: "toggle", text: "Not linked to a customer", pill: "Not linked to a customer", test: (r) => !r.customerId },
        { id: "novat", label: "No VAT charged", kind: "toggle", text: "No VAT charged", pill: "No VAT charged", test: (r) => !(Number(r.vatAmountNPR) > 0) },
      );
    } else if (tab === "quotation") {      // no challan is ever linked to an invoice (nothing writes it), so "not invoiced yet" would be true of every one
      defs.push(
        { id: "uninvoiced", label: "Not invoiced yet", kind: "toggle", text: "Not invoiced yet", pill: "Not invoiced yet", test: (r) => !r.relatedInvoice && r.status !== "Rejected" },
        { id: "expired", label: "Past its valid-until day", kind: "toggle", text: "Past its valid-until day", pill: "Past its valid-until day", test: (r) => isExpired(r, today) },
      );
    }
  }

  const clients = foldNames(list, (r) => r.clientName);
  defs.push({ id: "client", label: "Client", kind: "select", of: (r) => clients.keyOf(r.clientName), nameOf: clients.nameOf, any: "Any client", none: "No client name" });
  if (!cancelledList) defs.push({ id: "status", label: "Status", kind: "select", of: (r) => clean(r.status), any: "Any status", none: "No status" });
  if (tab === "invoice" && !cancelledList) {
    defs.push({ id: "via", label: "Paid by", kind: "select", of: paidBy, any: "Any way of paying" });
  }
  if (new Set(list.map((r) => r.currency || "NPR")).size > 1) {
    defs.push({ id: "currency", label: "Currency", kind: "select", of: (r) => r.currency || "NPR", any: "Any currency" });
  }
  defs.push({ id: "amount", label: "Amount", kind: "range", get: (r) => toNPR(r.totalNPR, r.currency), unit: "NPR", pill: "Amount" });
  if (tab === "invoice") defs.push({ id: "due", label: "Due between", kind: "dates", get: (r) => r.dueDate || "", show, pill: "Due" });
  if (tab === "quotation") defs.push({ id: "valid", label: "Valid until", kind: "dates", get: (r) => r.validUntil || "", show, pill: "Valid until" });
  return defs;
}

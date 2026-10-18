/**
 * Billing's sums and rules, free of React: what the top row adds up, which documents a filter keeps, whether saving a document would
 * renumber others, whether a PAN is owed. Each is the old Billing page's own code moved here with the same formulas.
 *
 * A document is an invoice, a challan or a quotation (`tab`): they share one form and one list, and differ in a few fields, a status
 * list and what the top row calls things.
 */
import { toNPR } from "../utils/currency";
import { DOC_TYPES, calcTotals, planRenumber, seriesKey, makeEmptyForm } from "../utils/billing.jsx";
import { currentFiscalYear, fiscalYearForDate, isFiscalYearLabel } from "../utils/fiscalYear";

export const KINDS = ["invoice", "challan", "quotation"];

/** What each kind is called on the page: the tab, one of them, many of them. */
export const WORDS = {
  invoice:   { tab: "VAT invoices", one: "VAT invoice", many: "VAT invoices", pane: "VAT invoices" },
  challan:   { tab: "Challans",     one: "challan",     many: "challans",     pane: "Challans" },
  quotation: { tab: "Quotations",   one: "quotation",   many: "quotations",   pane: "Quotations" },
};

/** The most an invoice may come to before the client's PAN must be on it (Nepal IRD), in rupees. */
export const PAN_LIMIT_NPR = 50000;

export const numberOf = (tab, row) => row?.[DOC_TYPES[tab].numberField] || "";

/** What is still owed on an invoice, in rupees (a challan or quotation has nothing paid, so its "due" is its whole total). */
export const creditDue = (row) => Math.max(0, toNPR(row.totalNPR, row.currency) - toNPR(row.amountPaid, row.currency));

/** The search box: the client's name, the document's number or its status contains what was typed (case does not matter). */
export function searchDocs(list, tab, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return list;
  const field = DOC_TYPES[tab].numberField;
  return list.filter((r) =>
    (r.clientName || "").toLowerCase().includes(q) ||
    (r[field] || "").toLowerCase().includes(q) ||
    (r.status || "").toLowerCase().includes(q));
}

/**
 * The top row. `list` is the tab's documents in the period (cancelled ones included, and left out here).
 *   total        what the live documents come to
 *   paid         invoices: what has been collected; challans: delivered; quotations: accepted (a part-paid invoice adds what is paid)
 *   pending      what is still to come: for an invoice the credit outstanding, for the others the total of those not yet delivered / answered
 *   vatCollected invoices only: the VAT in the paid ones, and its share in the part-paid ones
 */
export function summarise(list, tab) {
  const live = list.filter((d) => d.status !== "Cancelled");
  const inNPR = (d, key) => toNPR(d[key], d.currency);
  const total = live.reduce((s, d) => s + inNPR(d, "totalNPR"), 0);
  const paid = live.filter((d) => ["Paid", "Delivered", "Accepted"].includes(d.status)).reduce((s, d) => s + inNPR(d, "totalNPR"), 0);
  const partialPaid = live.filter((d) => d.status === "Partial").reduce((s, d) => s + inNPR(d, "amountPaid"), 0);
  const pending = live.filter((d) => !["Paid", "Delivered", "Accepted", "Cancelled", "Rejected"].includes(d.status)).reduce((s, d) => {
    const due = inNPR(d, "totalNPR") - inNPR(d, "amountPaid");
    return s + Math.max(0, due);
  }, 0);
  const vatCollected = tab === "invoice"
    ? live.filter((d) => ["Paid", "Partial"].includes(d.status)).reduce((s, d) => {
        const totalVal = inNPR(d, "totalNPR");
        const paidVal = inNPR(d, "amountPaid");
        const vatVal = inNPR(d, "vatAmountNPR");
        const paidFraction = totalVal > 0 ? paidVal / totalVal : 0;
        return s + vatVal * (d.status === "Paid" ? 1 : paidFraction);
      }, 0)
    : 0;
  return { total, paid: paid + partialPaid, pending, vatCollected, count: live.length };
}

/* ── The filters over the list ─────────────────────────────────────── */

/** The chips above a list: "all" never includes a cancelled document (they have their own chip). */
export const CHIPS = {
  invoice: [
    { value: "all", label: "All", test: (r) => r.status !== "Cancelled" },
    { value: "due", label: "Credit due", tone: "warn", test: (r) => r.status !== "Cancelled" && creditDue(r) > 0.005 },
    { value: "paid", label: "Paid", test: (r) => r.status === "Paid" },
    { value: "cancelled", label: "Cancelled", test: (r) => r.status === "Cancelled" },
  ],
  challan: [
    { value: "all", label: "All", test: (r) => r.status !== "Cancelled" },
    { value: "open", label: "To deliver", tone: "warn", test: (r) => !["Delivered", "Cancelled"].includes(r.status) },
    { value: "done", label: "Delivered", test: (r) => r.status === "Delivered" },
    { value: "cancelled", label: "Cancelled", test: (r) => r.status === "Cancelled" },
  ],
  quotation: [
    { value: "all", label: "All", test: (r) => r.status !== "Cancelled" },
    { value: "open", label: "Still open", tone: "warn", test: (r) => !["Accepted", "Rejected", "Cancelled"].includes(r.status) },
    { value: "done", label: "Accepted", test: (r) => r.status === "Accepted" },
    { value: "cancelled", label: "Cancelled", test: (r) => r.status === "Cancelled" },
  ],
};

/** What the top row calls its three figures, by kind (the sums are the same three). */
export const FIGURES = {
  invoice:   { total: "Invoiced",   paid: "Collected", pending: "Credit outstanding" },
  challan:   { total: "Challans",   paid: "Delivered", pending: "Not delivered yet" },
  quotation: { total: "Quoted",     paid: "Accepted",  pending: "Still open" },
};

/** The invoice / quotation a challan came from or went into, as one short line. */
export function relatedText(tab, row) {
  if (tab === "invoice") return [row.relatedQuotation && `QT ${row.relatedQuotation}`, row.relatedChallan && `CH ${row.relatedChallan}`].filter(Boolean).join(" · ");
  if (tab === "challan") return row.relatedInvoice ? `INV ${row.relatedInvoice}` : "";
  return "";
}

/** A status as a tag tone. */
export function statusTone(status) {
  if (["Paid", "Delivered", "Accepted"].includes(status)) return "good";
  if (["Sent", "Dispatched"].includes(status)) return "warn";
  if (status === "Partial") return "info";
  if (["Cancelled", "Rejected"].includes(status)) return "bad";
  return undefined;
}

/** The CSV a list exports: the old page's columns. Amounts are in each document's own currency, which is the last column. */
export function csvColumns(tab) {
  return [
    { label: `${DOC_TYPES[tab].label} #`, value: (r) => numberOf(tab, r) },
    { label: "Client", value: (r) => r.clientName || "" },
    { label: "Date", value: (r) => r.date || "" },
    { label: "Amount (NPR)", value: (r) => (r.totalNPR != null ? r.totalNPR : "") },
    { label: "Status", value: (r) => r.status || "" },
    { label: "Currency", value: (r) => r.currency || "NPR" },
  ];
}

/* ── The form a document is typed into ─────────────────────────────── */

export const newForm = (tab) => makeEmptyForm(tab);

/** An existing document as the form's starting values (the old page's `openEdit`). */
export function formFromDoc(tab, row) {
  const { id, ...rest } = row;
  const items = (row.items || []).map((it) => {
    let desc = it.description || "";
    if (!desc.includes("\n") && desc.includes("•")) {
      const segments = desc.split(/\s*•\s*/);
      if (segments.length > 1) {
        desc = segments.map((seg, idx) => (idx === 0 ? seg.trim() : `• ${seg.trim()}`)).join("\n");
      }
    }
    return { ...it, description: desc };
  });
  // makeEmptyForm defaults the fiscal year to the *current* one, which is wrong for a document filed in an earlier year. Rows written
  // before fiscal-year numbering carry no fiscal year at all, so derive it from the document's own Bikram Sambat date.
  const fiscalYear = rest.fiscalYear || fiscalYearForDate(rest.date) || currentFiscalYear();
  return { ...makeEmptyForm(tab), ...rest, fiscalYear, items };
}

/** The live totals of a form. */
export const totalsOfForm = (form) => calcTotals(form.items, form.applyVAT || false, form.discountPct || 0, form.discountMode, form.discountFlatAmt || 0);

/** An invoice over NPR 50,000 (by its rupee equivalent) must carry the client's PAN. */
export function panMissing(tab, form) {
  if (tab !== "invoice") return false;
  const { total } = calcTotals(form.items, form.applyVAT, form.discountPct || 0, form.discountMode, form.discountFlatAmt || 0);
  return toNPR(total, form.currency || "NPR") > PAN_LIMIT_NPR && !form.clientPAN?.trim();
}

/* ── Numbers follow dates ──────────────────────────────────────────── */

/**
 * A document's number is its place in its series by date. Filing one with an earlier date than documents already on record, or moving an
 * existing one's date, shifts everything after it. Before saving, work out whether that would change numbers already issued, so the
 * person can be asked first. The database renumbers (resequence_doc_numbers); this is only the preview.
 */
export function planSave({ tab, form, editingId, allOfKind }) {
  const meta = DOC_TYPES[tab];
  const numberField = meta.numberField;
  const newFY = fiscalYearForDate(form.date) || form.fiscalYear || currentFiscalYear();
  const existing = editingId ? allOfKind.find((d) => d.id === editingId) : null;
  const oldFY = String(existing?.fiscalYear || "").trim();
  // Only a date edit reshuffles anything. Changing a client name in a series that happens to be out of order must not start renumbering it.
  const run = !existing || existing.date !== form.date;
  // A real move between fiscal-year series (never for quotations, which are one series for all time).
  const fyChanged = !!existing && run && tab !== "quotation" && isFiscalYearLabel(oldFY) && newFY !== oldFY;
  const inSeries = (fy) => allOfKind.filter((d) => d.id !== editingId && seriesKey(tab, d) === seriesKey(tab, { fiscalYear: fy }));
  const me = {
    id: editingId || "__new__",
    date: form.date,
    createdAt: existing?.createdAt || new Date().toISOString(),
    [numberField]: existing && !fyChanged ? existing[numberField] : null,
  };
  let affected = [];
  let self = null;
  const seriesToFix = [];
  if (run) {
    const changes = planRenumber(tab, [...inSeries(newFY), me]);
    affected = changes.filter((c) => c.id !== me.id);
    self = changes.find((c) => c.id === me.id) || null;
    seriesToFix.push(newFY);
    if (fyChanged) {
      affected = [...affected, ...planRenumber(tab, inSeries(oldFY))];
      seriesToFix.push(oldFY);
    }
  }
  return { run, newFY, fyChanged, affected, self, seriesToFix };
}

/**
 * Series that are out of date order right now, judged on every region and every year. Fixing one is a deliberate act (a button), never a
 * side effect. `fiscalYear` is the year chosen in the period menu (or "all"): only that year is looked at when one is chosen.
 */
export function outOfOrderSeries({ tab, allOfKind, fiscalYear }) {
  const groups = new Map();
  for (const d of allOfKind) {
    const key = seriesKey(tab, d);
    if (tab !== "quotation" && !isFiscalYearLabel(key)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  const out = [];
  for (const [key, docs] of groups) {
    if (tab !== "quotation" && isFiscalYearLabel(fiscalYear) && key !== fiscalYear) continue;
    const changes = planRenumber(tab, docs);
    if (changes.length) out.push({ key, changes });
  }
  return out;
}

/* ── Paying an invoice ─────────────────────────────────────────────── */

/** What the payment card needs to know about an invoice, in rupees and in the invoice's own currency. */
export function payInfo(row, tab = "invoice") {
  const rowTotalNPR = toNPR(row.totalNPR, row.currency);
  const rowPaidNPR = toNPR(row.amountPaid, row.currency);
  return {
    id: row.id, docNum: row.invoiceNumber, totalNPR: rowTotalNPR, currentPaid: rowPaidNPR, currency: row.currency || "NPR",
    docTotal: Number(row.totalNPR || 0), docPaid: Number(row.amountPaid || 0), coll: DOC_TYPES[tab].coll,
    customerId: row.customerId || null, region: row.region || null, bankName: row.bankName || null, paymentType: row.paymentType || null,
  };
}

/** Whether an invoice still has a payment button: credit is due, or something has been paid (so a wrong one can be found and deleted). */
export const hasPayments = (row) => row.status !== "Cancelled" && (creditDue(row) > 0.005 || (row.amountPaid || 0) > 0);

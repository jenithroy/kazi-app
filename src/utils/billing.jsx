import { supabase } from "../lib/db";
import { roundAmount } from "./format";
import { currentFiscalYear, fiscalYearForDate, fmtDateBS } from "./fiscalYear";
import { tsMillis } from "./date";

// Re-exported for callers that still import it from here. The real, BS-accurate
// implementation lives in ./fiscalYear (backed by the exact conversion tables).
export { currentFiscalYear, fiscalYearForDate };

export const VAT_RATE = 0.13;

// ── Company Registration ──────────────────────────────────────────────────
export const COMPANY_PAN  = "623583278";              // PAN / VAT Reg. No. – Nepal IRD
export const COMPANY_NAME = "Kazi Manufacturing Pvt. Ltd.";
export const COMPANY_ADDR = "Sankhamul-31, Kathmandu, Nepal";
export const COMPANY_PHONE = "+977 971-2034849";
export const COMPANY_EMAIL = "info@kazimanufacturing.com";
export const COMPANY_REGD = "";                       // Company Regd. No. (OCR), fill in when known

export const DOC_TYPES = {
  invoice:   { label: "VAT Invoice",  prefix: "INV", counterField: "nextInvoice",   numberField: "invoiceNumber",   coll: "invoices" },
  challan:   { label: "Challan",      prefix: "CH",  counterField: "nextChallan",   numberField: "challanNumber",   coll: "challans" },
  quotation: { label: "Quotation",    prefix: "QT",  counterField: "nextQuotation", numberField: "quotationNumber", coll: "quotations" },
};

export const BANK_NAMES = ["Nabil Bank", "Sanima Bank"];

export const STATUS_BY_TYPE = {
  invoice:   ["Draft", "Sent", "Partial", "Paid", "Cancelled"],
  challan:   ["Draft", "Dispatched", "Delivered", "Cancelled"],
  quotation: ["Draft", "Sent", "Accepted", "Rejected", "Cancelled"],
};

export const emptyItem = { description: "", qty: 1, unit: "Pcs", rate: "", stockItemId: "" };

export function makeEmptyForm(type) {
  const base = {
    date: new Date().toISOString().slice(0, 10),
    clientName: "", clientPAN: "", clientAddress: "", clientPhone: "",
    // Which row in `customers` this client is. Only invoices have a column for it
    // (challans/quotations carry the key through the form for the picker's sake,
    // but handleSubmit never writes it for them) — see utils/billingClients.js.
    customerId: "",
    status: "Draft", note: "",
    region: "",          // "uk" | "nepal" | "" — which arm of the business billed this
    discountMode: "pct", // "pct" | "amount"
    discountPct: 0,
    discountFlatAmt: 0,
    currency: "NPR",
    items: [{ ...emptyItem }, { ...emptyItem }, { ...emptyItem }],
  };
  if (type === "invoice") {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return {
      ...base,
      dueDate: d.toISOString().slice(0, 10),
      fiscalYear: currentFiscalYear(),
      paymentTerms: "Net 30",
      applyVAT: true,
      relatedChallan: "", relatedQuotation: "",
      amountPaid: 0,
      paymentType: "CASH", // Cash | Bank | Credit — which ledger this sale's payment lands in
      bankName: "Nabil Bank", // which bank ledger, when paymentType is Bank
    };
  }
  if (type === "challan") {
    return {
      ...base,
      fiscalYear: currentFiscalYear(),
      vehicleNo: "", driverName: "", routeFrom: "", routeTo: "",
      relatedInvoice: "", relatedQuotation: "",
    };
  }
  // quotation
  const d = new Date(); d.setDate(d.getDate() + 30);
  return {
    ...base,
    validUntil: d.toISOString().slice(0, 10),
    terms: "1. Prices valid for 30 days.\n2. 50% advance, 50% on delivery.\n3. Delivery within 2-4 weeks.",
    relatedInvoice: "",
  };
}

/* ── Formatting ── */
export function fmtNPR(n) {
  if (isNaN(n)) n = 0;
  return "NPR " + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(roundAmount(n));
}

// Precise (2-decimal, never rounded) — for invoice/challan line items, Subtotal,
// Discount, Taxable Amount and VAT, which should stay exact. Only the printed
// Grand Total itself rounds (fmtCurrency below) — per Deepa's request.
export function fmtCurrencyExact(n, currency = "NPR") {
  if (isNaN(n)) n = 0;
  const locale = currency === "GBP" ? "en-GB" : "en-IN";
  const symbol = currency === "GBP" ? "£" : "NPR ";
  return symbol + new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function fmtCurrency(n, currency = "NPR") {
  if (isNaN(n)) n = 0;
  if (currency === "GBP") {
    return "£" + new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }
  return "NPR " + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(roundAmount(n));
}

export function fmtDate(s) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

// "30 Bhadra 2083 B.S." — the second line under a date on a filed document.
// The Bikram Sambat date is the one that decides the fiscal year and the number
// series, so a printed invoice should show it rather than leave the reader to
// convert the Gregorian date themselves. Null when there is nothing to convert,
// so the caller can drop the line instead of printing a dash under the date.
export function fmtDateBSLabel(s) {
  if (!s) return null;
  const bs = fmtDateBS(s);
  return bs === "—" ? null : `${bs} B.S.`;
}

export function numWords(num, currency = "NPR") {
  num = Math.round(num * 100) / 100;
  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function h(n) {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "") + " ";
    return ones[Math.floor(n / 100)] + " Hundred " + h(n % 100);
  }

  if (currency === "GBP") {
    if (intPart === 0 && decPart === 0) return "Zero Pounds Only";
    let r = "", tmp = intPart;
    if (tmp >= 1000000) { r += h(Math.floor(tmp / 1000000)) + "Million "; tmp %= 1000000; }
    if (tmp >= 1000)    { r += h(Math.floor(tmp / 1000))    + "Thousand "; tmp %= 1000; }
    if (tmp > 0)        { r += h(tmp); }
    r = r.trim();
    let res = "Pounds " + r;
    if (decPart > 0) {
      res += " and " + h(decPart).trim() + " Pence";
    }
    return res.trim() + " Only";
  }

  if (intPart === 0 && decPart === 0) return "Zero Only";
  let r = "", tmp = intPart;
  if (tmp >= 10000000) { r += h(Math.floor(tmp / 10000000)) + "Crore "; tmp %= 10000000; }
  if (tmp >= 100000)   { r += h(Math.floor(tmp / 100000))   + "Lakh ";  tmp %= 100000; }
  if (tmp >= 1000)     { r += h(Math.floor(tmp / 1000))     + "Thousand "; tmp %= 1000; }
  if (tmp > 0)         { r += h(tmp); }
  r = r.trim();
  if (decPart > 0) r += " and " + h(decPart).trim() + " Paisa";
  return "Rupees " + r.trim() + " Only";
}

/**
 * Calc totals — Nepal VAT compliance:
 * Discount is applied BEFORE VAT (IRD Nepal regulation).
 * discountMode "amount" uses the flat discountFlatAmt (NPR/currency units) instead of a percentage.
 * Returns: { subtotal, discountAmt, taxableAmt, vatAmt, total }
 */
export function calcTotals(items, applyVAT, discountPct = 0, discountMode = "pct", discountFlatAmt = 0) {
  const subtotal = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.rate || 0), 0);
  const discountAmt = discountMode === "amount"
    ? Math.min(subtotal, Math.max(0, Number(discountFlatAmt) || 0))
    : subtotal * (Math.min(100, Math.max(0, Number(discountPct) || 0)) / 100);
  const taxableAmt = subtotal - discountAmt;
  const vatAmt      = applyVAT ? taxableAmt * VAT_RATE : 0;
  return { subtotal, discountAmt, taxableAmt, vatAmt, total: taxableAmt + vatAmt };
}

/**
 * Allocate the next sequential document number, e.g. "INV-050".
 *
 * Invoices and challans restart at 1 each Nepali fiscal year (Shrawan 1), so
 * the fiscal year — decided from the document's Bikram Sambat date, not the
 * Gregorian month — must be passed in for them. It is what keeps last year's
 * INV-001 and this year's INV-001 apart. Quotations are the one exception
 * (migration 0038): they run a single unbroken sequence for all time and
 * ignore the fiscal year entirely, by request — fiscalYear is still passed
 * for them (and still stored on the record, for display/sorting) but the
 * database function does not use it to key their counter. The number is
 * padded to three digits (migration 0036) and grows past it naturally, so a
 * busy year runs INV-999, INV-1000.
 *
 * The whole read-increment-write happens in one statement inside the database
 * (see migration 0030). Doing it from here would mean two people raising an
 * invoice at the same moment could read the same counter and both take the same
 * number — not acceptable for IRD-numbered documents, which must run unbroken
 * and unduplicated. The row lock inside the function makes the second caller
 * wait and receive the next value instead.
 *
 * Throws if the signed-in person may not edit billing, so the sequence cannot
 * be advanced — leaving a gap in the books — by someone who could not have
 * filed the document anyway.
 */
export async function getNextNumber(type, fiscalYear) {
  if (!DOC_TYPES[type]) throw new Error("Unknown doc type: " + type);
  const fy = fiscalYear || currentFiscalYear();
  // Try 2-parameter next_doc_number(kind, fiscal_year) from migration 0030 first
  const { data, error } = await supabase.rpc("next_doc_number", { kind: type, fiscal_year: fy });
  if (!error) return data;

  // If migration 0030 has not been applied yet to the DB, fall back to single-arg next_doc_number(kind)
  if (error.code === "PGRST202" || error.message?.includes("schema cache")) {
    const fallback = await supabase.rpc("next_doc_number", { kind: type });
    if (fallback.error) throw fallback.error;
    return fallback.data;
  }

  throw error;
}

/**
 * Put a series back in date order — the earliest document becomes 001, the next
 * 002, and so on (migration 0040). Invoices and challans are one series per
 * fiscal year, so pass the year; quotations are a single series and ignore it.
 * Resolves to how many documents changed number.
 *
 * Throws if the signed-in person may not edit billing.
 */
export async function resequenceDocNumbers(type, fiscalYear) {
  if (!DOC_TYPES[type]) throw new Error("Unknown doc type: " + type);
  const { data, error } = await supabase.rpc("resequence_doc_numbers", {
    p_kind: type,
    p_fiscal_year: type === "quotation" ? null : fiscalYear,
  });
  if (error) throw error;
  return data || 0;
}

/**
 * The series a document is numbered in: its fiscal year for invoices and
 * challans, one shared series ("") for quotations, which never restart.
 */
export function seriesKey(type, doc) {
  return type === "quotation" ? "" : String(doc?.fiscalYear || "").trim();
}

const padNumber = (prefix, n) => `${prefix}-${n < 10 ? "00" + n : n < 100 ? "0" + n : n}`;

/**
 * What resequencing would do to one series, without doing it.
 *
 * `docs` is every document in the series (whichever region they belong to —
 * numbers are shared across regions). Mirrors the ordering in
 * resequence_doc_numbers: document date, then creation time, then id, with
 * undated documents last. Returns only the documents whose number would
 * change, as { id, from, to }, in their new order.
 *
 * It is a preview for the confirmation dialog and the "out of order" notice;
 * the database is what actually renumbers.
 */
export function planRenumber(type, docs) {
  const { prefix, numberField } = DOC_TYPES[type];
  const sorted = [...docs].sort((a, b) =>
    (a.date ? 0 : 1) - (b.date ? 0 : 1) ||
    String(a.date || "").localeCompare(String(b.date || "")) ||
    tsMillis(a.createdAt) - tsMillis(b.createdAt) ||
    String(a.id).localeCompare(String(b.id))
  );
  const changes = [];
  sorted.forEach((doc, i) => {
    const to = padNumber(prefix, i + 1);
    if (doc[numberField] !== to) changes.push({ id: doc.id, from: doc[numberField] || null, to });
  });
  return changes;
}

export function statusBadge(status) {
  const map = {
    Estimated: "kbil-badge kbil-badge--muted", Draft: "kbil-badge kbil-badge--muted",
    Sent: "kbil-badge kbil-badge--warn", Dispatched: "kbil-badge kbil-badge--warn",
    Partial: "kbil-badge kbil-badge--partial",
    Paid: "kbil-badge kbil-badge--ok", Delivered: "kbil-badge kbil-badge--ok", Accepted: "kbil-badge kbil-badge--ok",
    Cancelled: "kbil-badge kbil-badge--danger", Rejected: "kbil-badge kbil-badge--danger",
  };
  return <span className={map[status] || "kbil-badge kbil-badge--muted"}>{status}</span>;
}

export function formatDescription(desc) {
  if (!desc) return "—";

  let normalizedDesc = desc;
  if (!normalizedDesc.includes("\n") && normalizedDesc.includes("•")) {
    const segments = normalizedDesc.split(/\s*•\s*/);
    if (segments.length > 1) {
      normalizedDesc = segments.map((seg, idx) => {
        if (idx === 0) return seg;
        return `• ${seg}`;
      }).join("\n");
    }
  }

  const lines = normalizedDesc.split("\n");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "2px 0" }}>
      {lines.map((line, idx) => {
        const indentMatch = line.match(/^(\s+)/);
        const indentLevel = indentMatch ? indentMatch[1].length : 0;
        const trimmedLine = line.trim();

        if (!trimmedLine) {
          return <div key={idx} style={{ height: "6px" }} />;
        }

        // Detect bullet points
        const bulletMatch = trimmedLine.match(/^([•\-\*])\s*(.*)/);
        let bullet = null;
        let content = trimmedLine;

        if (bulletMatch) {
          bullet = bulletMatch[1];
          content = bulletMatch[2];
        }

        // Detect colon label
        const colonMatch = content.match(/^([A-Za-z0-9\s&\/]+:)\s*(.*)/);
        let label = null;
        let mainText = content;

        if (colonMatch) {
          label = colonMatch[1];
          mainText = colonMatch[2];
        }

        // Render bold markers **text**
        const renderTextWithBold = (text) => {
          const parts = text.split(/\*\*([^*]+)\*\*/g);
          return parts.map((part, i) => {
            if (i % 2 === 1) {
              return <strong key={i} style={{ fontWeight: 700, color: "var(--ink)" }}>{part}</strong>;
            }
            return part;
          });
        };

        const paddingLeft = indentLevel * 8 + (bullet ? 12 : 0);

        return (
          <div
            key={idx}
            style={{
              display: "flex",
              alignItems: "flex-start",
              paddingLeft: paddingLeft,
              lineHeight: 1.45,
              fontSize: "11px",
              color: "var(--ink-2)",
              textAlign: "left"
            }}
          >
            {bullet && (
              <span style={{ 
                marginRight: "6px", 
                color: "var(--mint-deep)", 
                fontWeight: "bold",
                display: "inline-block",
                width: "8px",
                textAlign: "center"
              }}>
                {bullet}
              </span>
            )}
            <span style={{ flex: 1 }}>
              {label && (
                <strong style={{ fontWeight: 700, color: "var(--ink)", marginRight: "4px" }}>
                  {label}
                </strong>
              )}
              {renderTextWithBold(mainText)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

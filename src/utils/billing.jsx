import { doc, runTransaction } from "firebase/firestore";
import { db } from "../firebase";

export const VAT_RATE = 0.13;

// ── Company Registration ──────────────────────────────────────────────────
export const COMPANY_PAN  = "623583278";              // PAN / VAT Reg. No. – Nepal IRD
export const COMPANY_NAME = "Kazi Manufacturing Pvt. Ltd.";
export const COMPANY_ADDR = "Kuleshwor-14, Kathmandu, Nepal";
export const COMPANY_PHONE = "+977 971-2034849";
export const COMPANY_EMAIL = "info@kazimanufacturing.com";
export const COMPANY_REGD = "";                       // Company Regd. No. (OCR), fill in when known

export const DOC_TYPES = {
  invoice:   { label: "VAT Invoice",  prefix: "INV", counterField: "nextInvoice",   numberField: "invoiceNumber",   coll: "invoices" },
  challan:   { label: "Challan",      prefix: "CH",  counterField: "nextChallan",   numberField: "challanNumber",   coll: "challans" },
  quotation: { label: "Quotation",    prefix: "QT",  counterField: "nextQuotation", numberField: "quotationNumber", coll: "quotations" },
};

export const STATUS_BY_TYPE = {
  invoice:   ["Draft", "Sent", "Partial", "Paid", "Cancelled"],
  challan:   ["Draft", "Dispatched", "Delivered", "Cancelled"],
  quotation: ["Draft", "Sent", "Accepted", "Rejected", "Cancelled"],
};

export const emptyItem = { description: "", qty: 1, unit: "Pcs", rate: "" };

/**
 * Returns current Nepal fiscal year string e.g. "2082/83"
 * Nepal FY starts Shrawan 1 (~mid-July); BS ≈ AD + 56 (before July) / +57 (from July onward)
 */
export function currentFiscalYear() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12
  const bsBase = y + (m >= 7 ? 57 : 56);
  return `${bsBase}/${String(bsBase + 1).slice(2)}`;
}

export function makeEmptyForm(type) {
  const base = {
    date: new Date().toISOString().slice(0, 10),
    clientName: "", clientPAN: "", clientAddress: "", clientPhone: "",
    status: "Draft", note: "",
    discountPct: 0,
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
  return "NPR " + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function fmtCurrency(n, currency = "NPR") {
  if (isNaN(n)) n = 0;
  if (currency === "GBP") {
    return "£" + new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }
  return "NPR " + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function fmtDate(s) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
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
 * Returns: { subtotal, discountAmt, taxableAmt, vatAmt, total }
 */
export function calcTotals(items, applyVAT, discountPct = 0) {
  const subtotal    = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.rate || 0), 0);
  const pct         = Math.min(100, Math.max(0, Number(discountPct) || 0));
  const discountAmt = subtotal * (pct / 100);
  const taxableAmt  = subtotal - discountAmt;
  const vatAmt      = applyVAT ? taxableAmt * VAT_RATE : 0;
  return { subtotal, discountAmt, taxableAmt, vatAmt, total: taxableAmt + vatAmt };
}

/* ── Atomic sequential numbering via Firestore transaction ── */
export async function getNextNumber(type) {
  const meta = DOC_TYPES[type];
  if (!meta) throw new Error("Unknown doc type: " + type);
  const counterRef = doc(db, "counters", "billing");
  const num = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const data = snap.exists() ? snap.data() : {};
    const current = data[meta.counterField] || 1;
    tx.set(counterRef, { [meta.counterField]: current + 1 }, { merge: true });
    return current;
  });
  return `${meta.prefix}-${String(num).padStart(3, "0")}`;
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

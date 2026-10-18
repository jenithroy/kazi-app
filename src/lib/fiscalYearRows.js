/**
 * Every transaction of every kind as one list, each tagged with the fiscal year it falls in: the rows the fiscal-year page shows.
 * It is the old page's `load()` row-building moved here unchanged, so it can be checked on its own.
 *
 * A row with no usable date belongs to no year and is dropped rather than filed under whichever year is current. Cancelled invoices
 * are not transactions. Only a paid invoice is money actually received, so only a paid one counts toward a year's figures (`counts`).
 */
import { MONTHS } from "./finance";
import { fiscalYearForDate } from "../utils/fiscalYear";
import { toNPR } from "../utils/currency";

export function buildRows({ expRows = [], purRows = [], payrollRows = [], journalRows = [], bankRows = [], invRows = [] }) {
  const out = [];
  const push = (date, row) => {
    const fy = date ? fiscalYearForDate(date) : null;
    if (fy) out.push({ ...row, fy, date });
  };

  expRows.forEach((r) => push(r.date, {
    key: `exp-${r.id}`, type: "Expense", src: r, region: r.region,
    description: `${r.category || "Expense"}${r.note ? " — " + r.note : ""}`,
    amountNPR: Number(r.amountNPR || 0), sign: -1, counts: true,
  }));

  purRows.forEach((r) => push(r.date, {
    key: `pur-${r.id}`, type: "Purchase", src: r, region: r.region,
    description: `${r.expenseItem || r.expenseId || "Purchase"}${r.category ? " — " + r.category : ""}`,
    amountNPR: Number(r.amountNPR || 0), sign: -1, counts: true,
  }));

  payrollRows.forEach((r) => {
    const monthIdx = MONTHS.indexOf(r.month);
    const repDate = r.year && monthIdx >= 0 ? `${r.year}-${String(monthIdx + 1).padStart(2, "0")}-01` : null;
    push(repDate, {
      key: `pay-${r.id}`, type: "Payroll", src: r, region: r.region,
      description: `${r.staffName || "Staff"}${r.role ? " — " + r.role : ""} (${r.month} ${r.year})`,
      amountNPR: Number(r.grossNPR || r.netNPR || 0), sign: -1, counts: true,
    });
  });

  journalRows.forEach((r) => push(r.date, {
    key: `jnl-${r.id}`, type: "Journal", src: r, region: r.region,
    description: `${r.description || "Journal entry"} (Dr ${r.debitAccount} / Cr ${r.creditAccount})`,
    amountNPR: Number(r.amountNPR || 0), sign: 0, counts: true,
  }));

  bankRows.forEach((r) => push(r.date, {
    // The view calls the column "amount", and the stored type is capitalised ("Credit" / "Debit").
    key: `bnk-${r.id}`, type: "Bank", src: r, region: r.region,
    description: r.description || String(r.remarks || "").replace(/\s+/g, " ").trim() || "Bank transaction",
    amountNPR: Number(r.amount ?? 0),
    sign: String(r.type || "").toLowerCase() === "credit" ? 1 : -1, counts: true,
  }));

  invRows.forEach((r) => {
    if (r.status === "Cancelled") return;
    const paid = r.status === "Paid";
    const val = Number(r.totalNPR || 0);
    push(r.date, {
      key: `inv-${r.id}`, type: "Sales", src: r, region: r.region,
      description: `${r.clientName || ""}${r.invoiceNumber ? " — " + r.invoiceNumber : ""}`,
      // amountNPR is filled in from docAmount / docCurrency once the live rates are known (see `withNpr`)
      amountNPR: toNPR(val, r.currency), docAmount: val, docCurrency: r.currency,
      sign: paid ? 1 : 0, counts: paid,
    });
  });

  // Newest first by date. Rows sharing a date arrive in whatever order the database gives them, which is not necessarily the order their
  // numbers run in (INV-005 ahead of INV-004). Numbers follow dates, so within a day the higher number is the later one.
  const seqNum = (entry) => {
    const raw = entry.type === "Sales" ? entry.src.invoiceNumber : entry.type === "Purchase" ? entry.src.expenseId : "";
    const m = /(\d+)\s*$/.exec(raw || "");
    return m ? parseInt(m[1], 10) : -1;
  };
  out.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (seqNum(b) - seqNum(a)));
  return out;
}

/** An invoice's amount is in its own currency; it is turned into NPR here so a rate that arrives later is picked up without reloading. */
export const withNpr = (rows) => rows.map((r) => (r.docCurrency ? { ...r, amountNPR: toNPR(r.docAmount, r.docCurrency) } : r));

/** What a year's rows add up to: money in, money out, the net, each kind's total, and how many rows are not counted. */
export function yearTotals(rows) {
  const counted = rows.filter((r) => r.counts);
  const byType = {};
  for (const r of counted) byType[r.type] = (byType[r.type] || 0) + r.amountNPR;
  const inflow = counted.filter((r) => r.sign > 0).reduce((s, r) => s + r.amountNPR, 0);
  const outflow = counted.filter((r) => r.sign < 0).reduce((s, r) => s + r.amountNPR, 0);
  return { byType, inflow, outflow, net: inflow - outflow, uncounted: rows.length - counted.length };
}

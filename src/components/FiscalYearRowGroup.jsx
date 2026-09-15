/**
 * One transaction on the fiscal-year page, editable in place.
 *
 * The page lists six kinds of record that live in six different tables and have
 * almost nothing in common beyond a date and an amount. Rather than six tables,
 * they share one column layout here, and each type fills it in its own way:
 *
 *   Date | Type | Description | Detail | Particulars | Qty | Unit | Rate | Amount | Total
 *
 * Purchases and sales own line items, so they render one <tr> per item with the
 * shared cells rowSpan'd — the same shape PurchaseRowGroup uses. The four flat
 * types (expense, payroll, journal, bank) have no items, so they span the
 * Particulars…Rate block with whatever extra fields they do have.
 *
 * Edits are held as a draft and committed when focus leaves the row group, so
 * typing never fires a write per keystroke. Derived money — a purchase total, an
 * invoice's VAT, a payroll net — is always recomputed here from the parts, never
 * typed, so a row's total cannot drift from what it is made of.
 */
import DualDateInput from "./DualDateInput";
import KeyboardSelect from "./KeyboardSelect";
import { RegionSelect } from "./RegionSwitch";
import { roundAmount } from "../utils/format";
import { todayDate } from "../utils/date";
import { BANK_NAMES, calcTotals, emptyItem } from "../utils/billing.jsx";
import {
  PURCHASE_CATEGORIES, PURCHASE_UNITS, PAYMENT_TYPES, initialGroupData,
  purchaseSubtotal, purchaseVatAmount, purchaseGrandTotal, purchaseItemsPayload,
} from "./PurchaseRowGroup";

export const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Mirrors Finance.jsx's expense form — the same list, so a category set here is
// one the Finance page will still offer next time the row is edited there.
export const EXPENSE_CATEGORIES = [
  "Utilities", "Rent / Lease", "Salaries", "Office Supplies",
  "Transport", "Meals & Entertainment", "Marketing", "Professional Fees",
  "Equipment", "Maintenance & Repairs", "Raw Materials", "Consumables",
  "Software & Subscriptions", "Miscellaneous", "Other",
];

export const INVOICE_STATUSES = ["Draft", "Sent", "Partial", "Paid", "Cancelled"];

/** Which table each kind of row is written back to. */
export const COLL_BY_TYPE = {
  Expense:  "finance_expenses",
  Purchase: "finance_purchases",
  Payroll:  "finance_payroll",
  Journal:  "journal_entries",
  Bank:     "bank_transactions",
  Sales:    "invoices",
};

/** The finance tab that gates each kind of row. */
export const TAB_BY_TYPE = {
  Expense: "expenses", Purchase: "purchases", Payroll: "payroll",
  Journal: "journal", Bank: "bank", Sales: "purchases",
};

const n = (v) => Number(v || 0);
const money = (v) => roundAmount(n(v)).toLocaleString();
const cell = { padding: "5px 6px", fontSize: 13 };
const small = { padding: "4px 5px", fontSize: 11 };
const topCell = { verticalAlign: "top", paddingTop: 6 };

/* ── Payroll: gross and net are made of the parts, exactly as Employees.jsx
      computes them when the record is created. ─────────────────────────────── */
export function calcPayroll(d) {
  const late = Math.max(0, n(d.lateSalaryCutDeduction) + n(d.lateAdjustmentNPR));
  const gross = n(d.basicNPR) + n(d.bonusNPR);
  const totalDeductions = late + n(d.pfDeductionNPR);
  return { gross, late, totalDeductions, net: Math.max(0, gross - totalDeductions) };
}

/* ── Invoice line items ──────────────────────────────────────────────────── */
function invoiceItemsForEdit(row) {
  const items = Array.isArray(row.items) ? row.items : [];
  if (!items.length) return [{ ...emptyItem }];
  return items.map(it => ({
    description: it.description || "",
    qty:  it.qty == null ? "" : String(it.qty),
    unit: it.unit || "Pcs",
    rate: it.rate == null ? "" : String(it.rate),
    stockItemId: it.stockItemId || "",
  }));
}

function invoiceTotals(d) {
  return calcTotals(d.items || [], !!d.applyVAT, d.discountPct || 0, d.discountMode || "pct", d.discountFlatAmt || 0);
}

/* ── Draft ⇄ stored row ──────────────────────────────────────────────────── */

/** The editable shape of a row, built from what the table gave us. */
export function initialRowData(type, src) {
  switch (type) {
    case "Expense":
      return {
        date: src.date || "", category: src.category || "Miscellaneous",
        note: src.note || "", amountNPR: src.amountNPR ?? "",
        vatBill: src.vatBill ?? false, status: src.status || "", region: src.region || "",
      };
    case "Purchase":
      return initialGroupData(src);
    case "Payroll":
      return {
        month: src.month || MONTHS[0], year: src.year || new Date().getFullYear(),
        staffName: src.staffName || "", role: src.role || "",
        basicNPR: src.basicNPR ?? "", bonusNPR: src.bonusNPR ?? "",
        pfDeductionNPR: src.pfDeductionNPR ?? "",
        lateSalaryCutDeduction: src.lateSalaryCutDeduction ?? 0,
        lateAdjustmentNPR: src.lateAdjustmentNPR ?? 0,
        lateDays: src.lateDays ?? 0, lateCutsCount: src.lateCutsCount ?? 0,
        note: src.note || "",
      };
    case "Journal":
      return {
        date: src.date || "", description: src.description || "",
        debitAccount: src.debitAccount || "", creditAccount: src.creditAccount || "",
        amountNPR: src.amountNPR ?? "", reference: src.reference || "",
        region: src.region || "",
      };
    case "Bank":
      return {
        date: src.date || "", description: src.description || "",
        remarks: src.remarks || "", type: src.type || "Debit",
        amount: src.amount ?? "", region: src.region || "",
      };
    case "Sales":
      return {
        date: src.date || "", clientName: src.clientName || "",
        invoiceNumber: src.invoiceNumber || "", status: src.status || "Draft",
        currency: src.currency || "NPR", applyVAT: src.applyVAT !== false,
        discountMode: src.discountMode || "pct",
        discountPct: src.discountPct || 0, discountFlatAmt: src.discountFlatAmt || 0,
        region: src.region || "", items: invoiceItemsForEdit(src),
      };
    default:
      return {};
  }
}

/** The date a row counts against — payroll has only a month and a year. */
export function rowDate(type, d) {
  if (type !== "Payroll") return d.date || "";
  const idx = MONTHS.indexOf(d.month);
  return d.year && idx >= 0 ? `${d.year}-${String(idx + 1).padStart(2, "0")}-01` : "";
}

/** What the row is worth, in NPR, as the page's totals count it. */
export function rowTotal(type, d) {
  switch (type) {
    case "Expense":  return n(d.amountNPR);
    case "Purchase": return purchaseGrandTotal(d.items, d.vatBill, d.discountAmt, d.taxableAmt);
    case "Payroll":  return calcPayroll(d).gross;
    case "Journal":  return n(d.amountNPR);
    case "Bank":     return n(d.amount);
    case "Sales":    return invoiceTotals(d).total;
    default:         return 0;
  }
}

/**
 * Why this row cannot be saved yet, or null.
 *
 * Checked before the write rather than after, so a row that would be rejected
 * (or silently stored wrong) keeps its draft and says what is missing instead of
 * quietly reverting on the next reload.
 */
export function rowError(type, d) {
  if (type === "Journal") {
    if (!d.debitAccount || !d.creditAccount) return "Pick both a debit and a credit account.";
    if (d.debitAccount === d.creditAccount) return "Debit and credit accounts must differ.";
  }
  if (type === "Payroll" && !String(d.staffName || "").trim()) return "Staff name is required.";
  if (type !== "Payroll" && type !== "Bank" && !rowDate(type, d)) return "A date is required.";
  return null;
}

/**
 * The fields to write back.
 *
 * Only what this page edits is listed — `updateRow` touches the keys it is
 * given and leaves the rest of the record alone, so nothing set elsewhere
 * (a purchase's VAT bill upload, an invoice's PAN) is disturbed by a save here.
 */
export function rowUpdates(type, d) {
  switch (type) {
    case "Expense":
      return {
        date: d.date, category: d.category, note: d.note,
        amountNPR: n(d.amountNPR), vatBill: d.vatBill,
        status: d.status || null, region: d.region || null,
      };
    case "Purchase":
      return {
        date: d.date, expenseItem: d.expenseItem, category: d.category,
        paymentType: d.paymentType || "CASH", bankName: d.bankName || "Nabil Bank",
        vatBill: d.vatBill,
        discountAmt: n(d.discountAmt), taxableAmt: n(d.taxableAmt),
        subtotalNPR:  purchaseSubtotal(d.items),
        vatAmountNPR: purchaseVatAmount(d.items, d.vatBill, d.discountAmt, d.taxableAmt),
        amountNPR:    purchaseGrandTotal(d.items, d.vatBill, d.discountAmt, d.taxableAmt),
        region: d.region || null,
        items: purchaseItemsPayload(d.items),
      };
    case "Payroll": {
      const { gross, late, totalDeductions, net } = calcPayroll(d);
      return {
        month: d.month, year: Number(d.year) || null,
        staffName: d.staffName, role: d.role,
        basicNPR: n(d.basicNPR), bonusNPR: n(d.bonusNPR),
        pfDeductionNPR: n(d.pfDeductionNPR),
        lateSalaryCutDeduction: n(d.lateSalaryCutDeduction),
        lateAdjustmentNPR: n(d.lateAdjustmentNPR),
        lateDeductionNPR: late, lateDays: n(d.lateDays), lateCutsCount: n(d.lateCutsCount),
        grossNPR: gross, totalDeductionsNPR: totalDeductions, netNPR: net,
        note: d.note,
      };
    }
    case "Journal":
      return {
        date: d.date, description: d.description,
        debitAccount: d.debitAccount, creditAccount: d.creditAccount,
        amountNPR: n(d.amountNPR), reference: d.reference,
        region: d.region || null,
      };
    case "Bank":
      // `date` is computed by the view (a bank statement's own text date, else
      // the timestamp) and has no column of its own, so it is not written back —
      // the Date cell for a bank row is read-only for that reason.
      return {
        description: d.description, remarks: d.remarks,
        type: d.type, amount: n(d.amount), region: d.region || null,
      };
    case "Sales": {
      const t = invoiceTotals(d);
      return {
        // The fiscal year is deliberately absent: an invoice's number was drawn
        // from its year's series, so re-dating it must not move it to a year
        // where that number belongs to a different invoice.
        date: d.date, clientName: d.clientName, status: d.status,
        applyVAT: !!d.applyVAT, discountMode: d.discountMode,
        discountPct: n(d.discountPct), discountFlatAmt: n(d.discountFlatAmt),
        subtotalNPR: t.subtotal, discountAmtNPR: t.discountAmt,
        taxableAmtNPR: t.taxableAmt, vatAmountNPR: d.applyVAT ? t.vatAmt : 0,
        totalNPR: t.total,
        // amountPaid is deliberately absent: it is a cached sum the payments
        // trigger maintains, so writing it here would last only until the next
        // real payment recomputed it. Marking an invoice Paid books the balance
        // as a payment instead — see salesSettlement below.
        region: d.region || null,
        items: (d.items || [])
          .filter(it => String(it.description || "").trim() !== "")
          .map(it => ({
            description: it.description, qty: n(it.qty), unit: it.unit || "Pcs",
            rate: n(it.rate), amount: n(it.qty) * n(it.rate), stockItemId: it.stockItemId || "",
          })),
      };
    }
    default:
      return {};
  }
}

/**
 * The payment to book when an invoice is being marked Paid, or null.
 *
 * `invoices.amount_paid` is a cached sum kept up to date by a trigger on
 * `payments`, so settling a credit means adding the missing payment, not
 * writing the total onto the invoice — that would be undone by the next real
 * payment. This mirrors what Billing does when the same flip happens there.
 */
export function salesSettlement(type, d, src, { recordedBy } = {}) {
  if (type !== "Sales" || d.status !== "Paid") return null;
  const outstanding = invoiceTotals(d).total - n(src.amountPaid);
  if (outstanding <= 0.005) return null;
  return {
    invoiceId:  src.id,
    customerId: src.customerId || null,
    paidOn:     todayDate(),
    amount:     outstanding,
    method:     src.paymentType || null,
    note:       "Settled by marking the invoice Paid.",
    recordedBy: recordedBy || "Unknown",
    region:     d.region || src.region || null,
  };
}

/* ── Small shared pieces ─────────────────────────────────────────────────── */

function TotalLine({ label, value, strong, tone }) {
  return (
    <div style={{
      fontSize: strong ? 12 : 11,
      fontWeight: strong ? 700 : 400,
      color: tone || (strong ? "var(--mint-deep)" : "var(--ink-4)"),
      fontFamily: strong ? "var(--mono)" : undefined,
      fontVariantNumeric: strong ? "tabular-nums" : undefined,
    }}>
      {label}: <span style={strong ? undefined : { fontWeight: 600, color: "var(--ink)" }}>NPR {money(value)}</span>
    </div>
  );
}

function NumField({ label, value, onChange, width = 72, placeholder = "0" }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--ink-4)" }}>
      <span style={{ whiteSpace: "nowrap" }}>{label}</span>
      <input type="number" min="0" step="any" className="kfin-input" style={{ ...small, width }}
        value={value ?? ""} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

/* ── The row group ───────────────────────────────────────────────────────── */

export function FiscalYearRowGroup({
  type, data, readOnly, error, accountNames = [], dateMode, onDateModeChange,
  onFieldChange, onItemChange, onAddItem, onRemoveItem, actionCell, typeCell,
  dirty, saving, onSave, onDiscard,
}) {
  const ro = !!readOnly;
  const set = (patch) => { if (!ro) onFieldChange(patch); };
  const hasItems = type === "Purchase" || type === "Sales";
  const items = hasItems ? (data.items || []) : [];
  const rows = hasItems ? Math.max(1, items.length) : 1;

  /* Date — payroll is filed by month, and a bank row's date belongs to the
     statement it was imported from, so neither takes a date picker. */
  const dateCell = (() => {
    if (type === "Payroll") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <KeyboardSelect className="kfin-select" style={cell} value={data.month}
            options={MONTHS} onChange={v => set({ month: v })} disabled={ro} />
          <input type="number" className="kfin-input" style={{ ...small, width: 72 }} value={data.year ?? ""}
            placeholder="Year" disabled={ro} onChange={e => set({ year: e.target.value })} />
        </div>
      );
    }
    if (type === "Bank") {
      return (
        <div style={{ fontSize: 13 }}>
          {data.date || "—"}
          <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 2 }}
            title="A bank row's date comes from the imported statement and has no column of its own to write back to.">
            from statement
          </div>
        </div>
      );
    }
    return (
      <DualDateInput value={data.date} className="kfin-input" disabled={ro}
        mode={dateMode} onModeChange={onDateModeChange}
        onChange={v => set({ date: v })} />
    );
  })();

  /* Description — the one free-text field every type has, under its own name. */
  const descriptionCell = (() => {
    const props = { className: "kfin-input", style: { ...cell, minWidth: 130 }, disabled: ro };
    switch (type) {
      case "Expense":
        return <input {...props} value={data.note} placeholder="Note" onChange={e => set({ note: e.target.value })} />;
      case "Purchase":
        return <input {...props} value={data.expenseItem} placeholder="Party name" onChange={e => set({ expenseItem: e.target.value })} />;
      case "Payroll":
        return <input {...props} value={data.staffName} placeholder="Staff name" onChange={e => set({ staffName: e.target.value })} />;
      case "Journal":
        return <input {...props} value={data.description} placeholder="Narration" onChange={e => set({ description: e.target.value })} />;
      case "Bank":
        return <input {...props} value={data.description} placeholder="Description" onChange={e => set({ description: e.target.value })} />;
      case "Sales":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <input {...props} value={data.clientName} placeholder="Client" onChange={e => set({ clientName: e.target.value })} />
            <span style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 700, color: "var(--mint-deep)" }}>
              {data.invoiceNumber || "—"}
            </span>
          </div>
        );
      default:
        return null;
    }
  })();

  /* Detail — whatever classifies the row: a category, an account pair, a status. */
  const detailCell = (() => {
    const stack = { display: "flex", flexDirection: "column", gap: 3 };
    switch (type) {
      case "Expense":
        return (
          <div style={stack}>
            <KeyboardSelect className="kfin-select" style={cell} value={data.category}
              options={EXPENSE_CATEGORIES} onChange={v => set({ category: v })} disabled={ro} />
            <RegionSelect keyboard className="kfin-select" style={{ ...small, fontSize: 12 }}
              value={data.region} onChange={v => set({ region: v })} disabled={ro} />
          </div>
        );
      case "Purchase":
        return (
          <div style={stack}>
            <KeyboardSelect className="kfin-select" style={cell} value={data.category}
              options={PURCHASE_CATEGORIES} onChange={v => set({ category: v })} disabled={ro} />
            <KeyboardSelect className="kfin-select" style={{ ...small, fontSize: 12 }} value={data.paymentType || "CASH"}
              options={PAYMENT_TYPES} onChange={v => set({ paymentType: v })} disabled={ro} />
            {data.paymentType === "Bank" && (
              <KeyboardSelect className="kfin-select" style={{ ...small, fontSize: 12 }}
                value={BANK_NAMES.includes(data.bankName) ? data.bankName : BANK_NAMES[0]}
                options={BANK_NAMES} onChange={v => set({ bankName: v })} disabled={ro} />
            )}
            <KeyboardSelect className="kfin-select" style={{ ...small, fontSize: 12 }}
              value={data.vatBill === null ? "na" : data.vatBill ? "yes" : "no"}
              options={[{ value: "yes", label: "VAT 13%" }, { value: "no", label: "No VAT" }, { value: "na", label: "VAT N/A" }]}
              onChange={v => set({ vatBill: v === "yes" ? true : v === "no" ? false : null })} disabled={ro} />
            <RegionSelect keyboard className="kfin-select" style={{ ...small, fontSize: 12 }}
              value={data.region} onChange={v => set({ region: v })} disabled={ro} />
          </div>
        );
      case "Payroll":
        return (
          <input className="kfin-input" style={cell} value={data.role} placeholder="Role"
            disabled={ro} onChange={e => set({ role: e.target.value })} />
        );
      case "Journal":
        return (
          <div style={stack}>
            <label style={{ fontSize: 10.5, color: "var(--ink-4)" }}>Dr
              <KeyboardSelect className="kfin-select" style={{ ...small, fontSize: 12 }} value={data.debitAccount}
                options={accountNames} onChange={v => set({ debitAccount: v })} disabled={ro} />
            </label>
            <label style={{ fontSize: 10.5, color: "var(--ink-4)" }}>Cr
              <KeyboardSelect className="kfin-select" style={{ ...small, fontSize: 12 }} value={data.creditAccount}
                options={accountNames} onChange={v => set({ creditAccount: v })} disabled={ro} />
            </label>
          </div>
        );
      case "Bank":
        return (
          <div style={stack}>
            <KeyboardSelect className="kfin-select" style={cell} value={data.type}
              options={["Credit", "Debit"]} onChange={v => set({ type: v })} disabled={ro} />
            <input className="kfin-input" style={{ ...small, minWidth: 100 }} value={data.remarks}
              placeholder="Remarks" disabled={ro} onChange={e => set({ remarks: e.target.value })} />
          </div>
        );
      case "Sales":
        return (
          <div style={stack}>
            <KeyboardSelect className="kfin-select" style={cell} value={data.status}
              options={INVOICE_STATUSES} onChange={v => set({ status: v })} disabled={ro} />
            <KeyboardSelect className="kfin-select" style={{ ...small, fontSize: 12 }}
              value={data.applyVAT ? "yes" : "no"}
              options={[{ value: "yes", label: "VAT 13%" }, { value: "no", label: "No VAT" }]}
              onChange={v => set({ applyVAT: v === "yes" })} disabled={ro} />
            <RegionSelect keyboard className="kfin-select" style={{ ...small, fontSize: 12 }}
              value={data.region} onChange={v => set({ region: v })} disabled={ro} />
          </div>
        );
      default:
        return null;
    }
  })();

  /* Totals — always computed from the parts above, never typed. */
  const totalsCell = (() => {
    switch (type) {
      case "Purchase": {
        const sub = purchaseSubtotal(data.items);
        const vat = purchaseVatAmount(data.items, data.vatBill, data.discountAmt, data.taxableAmt);
        return (
          <>
            <TotalLine label="Subtotal" value={sub} />
            {!ro && <NumField label="Discount" value={data.discountAmt || ""} onChange={v => set({ discountAmt: Number(v || 0) })} width={64} />}
            {data.vatBill === true && !ro && (
              <NumField label="Taxable" value={data.taxableAmt || ""} width={64}
                placeholder={String(Math.max(0, sub - n(data.discountAmt)))}
                onChange={v => set({ taxableAmt: Number(v || 0) })} />
            )}
            {data.vatBill === true && <TotalLine label="VAT 13%" value={vat} />}
            <TotalLine label="Total" value={rowTotal(type, data)} strong />
          </>
        );
      }
      case "Sales": {
        const t = invoiceTotals(data);
        return (
          <>
            <TotalLine label="Subtotal" value={t.subtotal} />
            {!ro && (
              <NumField label={data.discountMode === "amount" ? "Disc. NPR" : "Disc. %"} width={58}
                value={data.discountMode === "amount" ? (data.discountFlatAmt || "") : (data.discountPct || "")}
                onChange={v => set(data.discountMode === "amount" ? { discountFlatAmt: Number(v || 0) } : { discountPct: Number(v || 0) })} />
            )}
            {data.applyVAT && <TotalLine label="VAT 13%" value={t.vatAmt} />}
            <TotalLine label="Total" value={t.total} strong />
          </>
        );
      }
      case "Payroll": {
        const p = calcPayroll(data);
        return (
          <>
            <TotalLine label="Gross" value={p.gross} />
            {p.totalDeductions > 0 && <TotalLine label="Deductions" value={p.totalDeductions} tone="var(--terra)" />}
            <TotalLine label="Net" value={p.net} strong />
          </>
        );
      }
      default:
        return <TotalLine label="Total" value={rowTotal(type, data)} strong />;
    }
  })();

  /* The Particulars…Rate block: line items, or the extra fields a flat type has. */
  function itemCells(item, idx) {
    if (type === "Purchase") {
      const isOtherUnit = item.unit === "other" || (item.unit && !PURCHASE_UNITS.includes(item.unit));
      return (
        <>
          <td>
            <input className="kfin-input" style={{ ...cell, minWidth: 110 }} value={item.particulars} placeholder="Particulars"
              disabled={ro} onChange={e => onItemChange(idx, { particulars: e.target.value })} />
          </td>
          <td>
            <input type="number" min="0" step="any" className="kfin-input" style={{ ...cell, width: 52 }} value={item.quantity}
              placeholder="Qty" disabled={ro} onChange={e => onItemChange(idx, { quantity: e.target.value })} />
          </td>
          <td>
            <KeyboardSelect className="kfin-select" style={{ ...small, fontSize: 12, width: 60 }}
              value={isOtherUnit ? "other" : (item.unit || "pcs")} options={PURCHASE_UNITS}
              onChange={v => onItemChange(idx, { unit: v })} disabled={ro} />
          </td>
          <td>
            <input type="number" min="0" step="any" className="kfin-input" style={{ ...cell, width: 72 }} value={item.rate}
              placeholder="Rate" disabled={ro} onChange={e => onItemChange(idx, { rate: e.target.value })} />
          </td>
          <td>
            <input type="number" min="0" step="any" className="kfin-input" style={{ ...cell, width: 82, fontWeight: 600 }} value={item.amount}
              placeholder="0" disabled={ro} onChange={e => onItemChange(idx, { amount: e.target.value })} />
          </td>
        </>
      );
    }
    // Sales: the line amount is qty × rate, the same basis Billing totals from,
    // so it is shown rather than typed.
    return (
      <>
        <td>
          <input className="kfin-input" style={{ ...cell, minWidth: 110 }} value={item.description} placeholder="Description"
            disabled={ro} onChange={e => onItemChange(idx, { description: e.target.value })} />
        </td>
        <td>
          <input type="number" min="0" step="any" className="kfin-input" style={{ ...cell, width: 52 }} value={item.qty}
            placeholder="Qty" disabled={ro} onChange={e => onItemChange(idx, { qty: e.target.value })} />
        </td>
        <td>
          <input className="kfin-input" style={{ ...cell, width: 60 }} value={item.unit} placeholder="Pcs"
            disabled={ro} onChange={e => onItemChange(idx, { unit: e.target.value })} />
        </td>
        <td>
          <input type="number" min="0" step="any" className="kfin-input" style={{ ...cell, width: 72 }} value={item.rate}
            placeholder="Rate" disabled={ro} onChange={e => onItemChange(idx, { rate: e.target.value })} />
        </td>
        <td style={{ fontFamily: "var(--mono)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          {money(n(item.qty) * n(item.rate))}
        </td>
      </>
    );
  }

  function flatCells() {
    if (type === "Payroll") {
      return (
        <>
          <td colSpan={4}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <NumField label="Basic" value={data.basicNPR} onChange={v => set({ basicNPR: v })} />
              <NumField label="Bonus" value={data.bonusNPR} onChange={v => set({ bonusNPR: v })} />
              <NumField label="PF" value={data.pfDeductionNPR} onChange={v => set({ pfDeductionNPR: v })} />
              <NumField label="Late cut" value={data.lateSalaryCutDeduction} onChange={v => set({ lateSalaryCutDeduction: v })} />
            </div>
          </td>
          <td style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {money(calcPayroll(data).gross)}
          </td>
        </>
      );
    }
    const amountKey = type === "Bank" ? "amount" : "amountNPR";
    return (
      <>
        <td colSpan={4}>
          {type === "Journal" && (
            <input className="kfin-input" style={{ ...small, minWidth: 120 }} value={data.reference}
              placeholder="Reference" disabled={ro} onChange={e => set({ reference: e.target.value })} />
          )}
        </td>
        <td>
          <input type="number" min="0" step="any" className="kfin-input" style={{ ...cell, width: 96, fontWeight: 600 }}
            value={data[amountKey] ?? ""} placeholder="0" disabled={ro}
            onChange={e => set({ [amountKey]: e.target.value })} />
        </td>
      </>
    );
  }

  const errorRow = error && (
    <tr>
      <td colSpan={10} style={{ padding: "4px 8px", background: "var(--terra-soft)", color: "var(--terra)", fontSize: 11.5, fontWeight: 600 }}>
        {error} — this row is not saved.
      </td>
    </tr>
  );

  return (
    <tbody
      style={
        error ? { outline: "1.5px solid var(--terra)" }
        : dirty ? { outline: "1.5px solid var(--mint-2)" }
        : undefined
      }
      onKeyDown={dirty && onDiscard ? (e => { if (e.key === "Escape") { e.preventDefault(); onDiscard(); } }) : undefined}
    >
      {Array.from({ length: rows }, (_, idx) => {
        const item = items[idx];
        return (
          <tr key={idx}>
            {idx === 0 && (
              <>
                <td rowSpan={rows} style={{ ...topCell, minWidth: 150 }}>{dateCell}</td>
                <td rowSpan={rows} style={topCell}>{typeCell}</td>
                <td rowSpan={rows} style={topCell}>{descriptionCell}</td>
                <td rowSpan={rows} style={topCell}>{detailCell}</td>
              </>
            )}
            {hasItems && item ? itemCells(item, idx) : null}
            {hasItems && !item ? <td colSpan={5} /> : null}
            {!hasItems ? flatCells() : null}
            {idx === 0 && (
              <td rowSpan={rows} style={{ ...topCell, minWidth: 170 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                  {totalsCell}
                  {hasItems && !ro && (
                    <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                      <button type="button" className="ghost-button" style={{ padding: "2px 8px", fontSize: 11 }}
                        onMouseDown={e => e.stopPropagation()} onClick={onAddItem}>+ Line</button>
                      {items.length > 1 && (
                        <button type="button" className="ghost-button" style={{ padding: "2px 8px", fontSize: 11 }}
                          onMouseDown={e => e.stopPropagation()} onClick={() => onRemoveItem(items.length - 1)}
                          title="Remove the last line">− Line</button>
                      )}
                    </div>
                  )}
                  {dirty && !ro && (
                    <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                      <button type="button" className="primary-button" style={{ padding: "3px 12px", fontSize: 11.5 }}
                        disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save"}</button>
                      <button type="button" className="ghost-button" style={{ padding: "3px 10px", fontSize: 11.5 }}
                        disabled={saving} onClick={onDiscard}>Discard</button>
                    </div>
                  )}
                  {actionCell}
                </div>
              </td>
            )}
          </tr>
        );
      })}
      {errorRow}
    </tbody>
  );
}

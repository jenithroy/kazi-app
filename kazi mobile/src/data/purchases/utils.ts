import { money as displayMoney, moneyCompact } from '@/lib/money';

import type { PurchaseDraft, PurchaseDraftLine, PurchaseEntry, PurchaseLine, VatBillState } from './types';

export const VAT_RATE = 13;

/** Two decimal places, the precision the reference stores its purchase money at. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** A purchase total in the display currency. Screens that call it need `useMoneySignature()`. */
export function money(n: number): string {
  return displayMoney(n);
}

/** "रु 1.9L" / "£950" style compact formatting, matching the design's own `short()` helper. */
export function short(n: number): string {
  return moneyCompact(n);
}

export function lineAmount(quantity: number, rate: number): number {
  return round2(quantity * rate);
}

export interface PurchaseTotals {
  subtotal: number;
  discount: number;
  /** `subtotal - discount` — what is actually payable before VAT. */
  net: number;
  /** The base VAT was cut from: the override when set, else `net`. */
  taxable: number;
  vat: number;
  grandTotal: number;
}

/**
 * The single source of truth for a purchase's money math, mirroring the
 * reference's `purchaseSubtotal` / `purchaseVatAmount` / `purchaseGrandTotal`.
 *
 * The subtotal adds up line *amounts* rather than quantity × rate, because an
 * amount is independently editable — a lump-sum line has no quantity to
 * multiply. `taxableOverride` is the vendor-stated taxable portion when a bill
 * mixes taxable and non-taxable lines; `0` means "use the net amount".
 */
export function computeTotals(
  lines: { amount: number }[],
  discountAmt: number,
  vatBill: VatBillState,
  taxableOverride = 0,
): PurchaseTotals {
  const subtotal = round2(lines.reduce((n, l) => n + (Number(l.amount) || 0), 0));
  const discount = Math.min(Math.max(0, round2(discountAmt)), subtotal);
  const net = round2(subtotal - discount);
  const taxable = taxableOverride > 0 ? round2(taxableOverride) : net;
  const vat = vatBill === true ? round2((taxable * VAT_RATE) / 100) : 0;
  return { subtotal, discount, net, taxable, vat, grandTotal: round2(net + vat) };
}

/** Next `EXP0NN` id — gap-free, one ahead of the highest existing number. */
export function nextExpenseId(entries: PurchaseEntry[]): string {
  const max = entries.reduce((m, e) => {
    const n = parseInt(e.expenseId.replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `EXP${String(max + 1).padStart(3, '0')}`;
}

export const toNum = (s: string | number | null | undefined): number => {
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  return parseFloat(String(s ?? '').replace(/[^0-9.]/g, '')) || 0;
};

/**
 * Applies one edit to one draft line. Touching quantity or rate re-suggests
 * the amount (qty × rate); the amount itself stays free, so overwriting it
 * sticks until the quantity or rate is edited again.
 */
export function applyLineChange(
  lines: PurchaseDraftLine[],
  index: number,
  patch: Partial<PurchaseDraftLine>,
): PurchaseDraftLine[] {
  return lines.map((l, i) => {
    if (i !== index) return l;
    const next = { ...l, ...patch };
    if ('quantity' in patch || 'rate' in patch) {
      if (next.quantity.trim() !== '' && next.rate.trim() !== '') {
        next.amount = String(lineAmount(toNum(next.quantity), toNum(next.rate)));
      }
    }
    return next;
  });
}

/** Blank particulars are dropped, as in the reference's `purchaseItemsPayload`. */
export function draftLinesToLines(draftLines: PurchaseDraftLine[]): PurchaseLine[] {
  return draftLines
    .filter((l) => l.particulars.trim())
    .map((l) => {
      const quantity = toNum(l.quantity);
      const rate = toNum(l.rate);
      return {
        particulars: l.particulars.trim(),
        quantity,
        unit: l.unit.trim() || 'pcs',
        rate,
        amount: l.amount.trim() === '' ? lineAmount(quantity, rate) : round2(toNum(l.amount)),
      };
    });
}

export function linesToDraftLines(lines: PurchaseLine[]): PurchaseDraftLine[] {
  return lines.map((l, i) => ({
    key: `l${i}-${Math.random().toString(36).slice(2, 8)}`,
    particulars: l.particulars,
    quantity: l.quantity ? String(l.quantity) : '',
    unit: l.unit || 'pcs',
    rate: l.rate ? String(l.rate) : '',
    amount: l.amount ? String(l.amount) : '',
  }));
}

/** Build a persisted `PurchaseEntry` from the sheet draft — one shape for both the standalone screen and Finance's tab. */
export function buildEntry(draft: PurchaseDraft, existing: PurchaseEntry[], loggedBy: string): PurchaseEntry {
  const items = draftLinesToLines(draft.lines);
  const totals = computeTotals(items, toNum(draft.discountAmt), draft.vatBill, toNum(draft.taxableAmt));
  const current = draft.id ? existing.find((e) => e.id === draft.id) : undefined;
  return {
    id: draft.id ?? `n${Date.now()}`,
    expenseId: current?.expenseId ?? nextExpenseId(existing),
    party: draft.party.trim() || 'Unnamed party',
    category: draft.category.trim() || 'Other',
    paymentType: draft.paymentType,
    bankName: draft.paymentType === 'Bank' ? draft.bankName.trim() || undefined : undefined,
    date: draft.date,
    vatBill: draft.vatBill,
    discountAmt: totals.discount,
    taxableAmt: toNum(draft.taxableAmt),
    subtotalNPR: totals.subtotal,
    vatAmountNPR: totals.vat,
    amountNPR: totals.grandTotal,
    items,
    status: draft.status,
    loggedBy,
    region: draft.region || undefined,
    grn: current?.grn,
  };
}

export function draftFromEntry(entry: PurchaseEntry): PurchaseDraft {
  return {
    id: entry.id,
    party: entry.party,
    category: entry.category,
    paymentType: entry.paymentType,
    bankName: entry.bankName ?? '',
    date: entry.date,
    vatBill: entry.vatBill,
    discountAmt: entry.discountAmt ? String(entry.discountAmt) : '',
    taxableAmt: entry.taxableAmt ? String(entry.taxableAmt) : '',
    region: entry.region ?? '',
    status: entry.status,
    lines: entry.items.length ? linesToDraftLines(entry.items) : [emptyLine()],
  };
}

let lineSeq = 0;

export function emptyLine(): PurchaseDraftLine {
  lineSeq += 1;
  return { key: `nl${lineSeq}`, particulars: '', quantity: '', unit: 'pcs', rate: '', amount: '' };
}

export function emptyDraft(): PurchaseDraft {
  return {
    id: null,
    party: '',
    category: 'Office Supplies',
    paymentType: 'Cash',
    bankName: '',
    date: new Date().toISOString().slice(0, 10),
    vatBill: false,
    discountAmt: '',
    taxableAmt: '',
    region: '',
    status: 'paid',
    lines: [emptyLine()],
  };
}

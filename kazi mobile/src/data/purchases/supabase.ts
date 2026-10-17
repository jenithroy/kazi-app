/**
 * Live `finance_purchases` reader (Track B). Shared by the standalone
 * Purchases screen and Finance › Purchases tab.
 *
 * Live shape (sampled 2026-08-30): { expenseId, expenseItem, category,
 *   paymentType ("CASH"/"Bank"/"Credit"), bankName?, vatBill (nullable bool),
 *   discountAmt?, taxableAmt?, subtotalNPR?, vatAmountNPR?, amountNPR, date,
 *   region?, items[] ({particulars, quantity, unit, rate, amount}) — sometimes
 *   a JSON string, createdAt }
 *
 * Gaps handled locally (see plan §Batch 1):
 *   - no `party`/supplier field → falls back to `expenseItem`
 *   - no `status` field         → 'paid'
 *   - totals absent on a doc    → recomputed via `computeTotals`
 */

import { num, parseMaybeJson, str, tsToISO } from '@/lib/data/normalise';
import { readCollection, type DocData } from '@/lib/supabase/read';

import type { PaymentType, PurchaseEntry, PurchaseLine, PurchaseRegion, VatBillState } from './types';
import { computeTotals, lineAmount } from './utils';

/** `null` is the reference's "unspecified" — a real third state, like `vatBill`. */
function mapPayment(raw: unknown): PaymentType | null {
  const s = str(raw).trim();
  if (!s) return null;
  if (/bank/i.test(s)) return 'Bank';
  if (/credit/i.test(s)) return 'Credit';
  return 'Cash';
}

/** `null` is the reference's "N/A" — a real third state, not a missing value. */
function mapVatBill(raw: unknown): VatBillState {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'string') return /^(true|yes|1)$/i.test(raw.trim());
  return Boolean(raw);
}

function mapRegion(raw: unknown): PurchaseRegion {
  const s = str(raw).trim().toLowerCase();
  return s === 'uk' || s === 'nepal' ? s : '';
}

function mapLines(raw: unknown, fallbackItem: string, fallbackAmount: number): PurchaseLine[] {
  const parsed = parseMaybeJson<unknown[]>(raw, []);
  const rows: PurchaseLine[] = (Array.isArray(parsed) ? parsed : [])
    .map((e) => {
      const entry = (e ?? {}) as DocData;
      const quantity = num(entry.quantity);
      const rate = num(entry.rate);
      return {
        particulars: str(entry.particulars ?? entry.item ?? entry.name).trim(),
        quantity,
        unit: str(entry.unit).trim() || 'pcs',
        rate,
        amount: num(entry.amount) || lineAmount(quantity, rate),
      };
    })
    .filter((l) => l.particulars);
  if (rows.length) return rows;
  // Synthesise a single line from the header when there are no line items.
  const item = fallbackItem.trim() || 'Purchase';
  return [{ particulars: item, quantity: 1, unit: 'pcs', rate: fallbackAmount, amount: fallbackAmount }];
}

function mapPurchaseDoc(id: string, d: DocData): PurchaseEntry | null {
  const amountNPR = num(d.amountNPR);
  const expenseItem = str(d.expenseItem).trim();
  if (!amountNPR && !expenseItem) return null;

  const vatBill = mapVatBill(d.vatBill);
  const items = mapLines(d.items, expenseItem, amountNPR);
  const liveDiscount = num(d.discountAmt);
  // A live `taxableAmt` of 0 means "no override" — same as the reference.
  const taxableAmt = num(d.taxableAmt);
  const computed = computeTotals(items, liveDiscount, vatBill, taxableAmt);

  return {
    id,
    expenseId: str(d.expenseId).trim() || `EXP${id.slice(0, 3).toUpperCase()}`,
    party: expenseItem || 'Unnamed party',
    // Kept verbatim: the column holds strings outside `PURCHASE_CATEGORIES`,
    // and folding them into "Other" would rewrite them on the next save.
    category: str(d.category).trim() || 'Other',
    paymentType: mapPayment(d.paymentType),
    bankName: str(d.bankName).trim() || undefined,
    date: str(d.date).trim() || tsToISO(d.createdAt).slice(0, 10),
    vatBill,
    discountAmt: liveDiscount || computed.discount,
    taxableAmt,
    subtotalNPR: num(d.subtotalNPR) || computed.subtotal,
    vatAmountNPR: num(d.vatAmountNPR) || computed.vat,
    amountNPR: amountNPR || computed.grandTotal,
    items,
    status: 'paid',
    loggedBy: str(d.loggedBy ?? d.createdBy).trim(),
    region: mapRegion(d.region),
  };
}

export async function fetchEntries(): Promise<PurchaseEntry[]> {
  return readCollection('finance_purchases', mapPurchaseDoc);
}

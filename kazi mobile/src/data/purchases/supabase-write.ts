/**
 * Live `finance_purchases` writers — the reference ERP's own collection, shared
 * by the Purchases screen and Finance › Purchases. The mobile `PurchaseEntry`
 * field names already mirror the live doc, so the mapping is near 1:1.
 */

import { getSupabase } from '@/lib/supabase';
import { str } from '@/lib/data/normalise';
import { createDocument, patchDocument, removeDocument } from '@/lib/supabase/write';
import { isoDay } from '@/lib/date-display';
import { fiscalYearForAD } from '@/lib/nepaliDate';
import { postPurchaseStockIn } from '@/data/inventory/supabase-write';

import type { PurchaseEntry } from './types';

const COLLECTION = 'finance_purchases';

/** Where a VAT bill's scan lives — the reference's `deletePublicFile` bucket. */
const VAT_BILL_BUCKET = 'finance-attachments';

function toLive(e: Partial<PurchaseEntry>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (e.expenseId !== undefined) out.expenseId = e.expenseId;
  if (e.party !== undefined) out.expenseItem = e.party;
  if (e.category !== undefined) out.category = e.category;
  // `null` means "unspecified" on live rows and must survive a round trip.
  if (e.paymentType !== undefined) out.paymentType = e.paymentType === 'Cash' ? 'CASH' : e.paymentType;
  // Only a Bank purchase carries a bank; clearing it back to null is the point
  // of writing `?? null` rather than skipping the field.
  if (e.bankName !== undefined) out.bankName = e.bankName ?? null;
  if (e.region !== undefined) out.region = e.region || null;
  if (e.date !== undefined) out.date = e.date;
  // Tri-state: true / false / null ("N/A") all mean something in this column.
  if (e.vatBill !== undefined) out.vatBill = e.vatBill;
  if (e.discountAmt !== undefined) out.discountAmt = e.discountAmt;
  if (e.taxableAmt !== undefined) out.taxableAmt = e.taxableAmt;
  if (e.subtotalNPR !== undefined) out.subtotalNPR = e.subtotalNPR;
  if (e.vatAmountNPR !== undefined) out.vatAmountNPR = e.vatAmountNPR;
  if (e.amountNPR !== undefined) out.amountNPR = e.amountNPR;
  if (e.items !== undefined) {
    out.items = e.items.map((l) => ({
      particulars: l.particulars,
      quantity: l.quantity,
      unit: l.unit,
      rate: l.rate,
      amount: l.amount,
    }));
  }
  return out;
}

/**
 * The next number for a fiscal year, drawn from the database (migration 0046) so two people raising a purchase at the same moment
 * cannot be given the same one. Counting the entries already on the phone can't know what anyone else has just raised.
 */
async function nextPurchaseNumber(fiscalYear: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('next_purchase_number', { fiscal_year: fiscalYear });
  if (error) throw new Error(`next_purchase_number: ${error.message}`);
  return String(data);
}

/**
 * Raising a purchase, in the website's order (`financeWrites.addPurchase`): the number comes from the purchase's own fiscal year,
 * decided by its date, so a backdated purchase draws from the year it belongs to; then the row, with the year; then the stock-in for
 * any line that names an inventory item, which needs the row's id. `entry.expenseId` is only the phone's guess for the list while the
 * save is in flight.
 */
export async function addEntry(entry: PurchaseEntry): Promise<void> {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? entry.date : isoDay(new Date());
  const fiscalYear = fiscalYearForAD(day).label;
  const expenseId = await nextPurchaseNumber(fiscalYear);
  const id = await createDocument(COLLECTION, { ...toLive(entry), date: day, expenseId, fiscalYear });
  // The purchase is saved; a stock-in that can't be posted must not tell the person it wasn't (the website logs it the same way).
  await postPurchaseStockIn({ id, expenseId, date: day }, entry.items).catch((err) =>
    console.error('purchases/addEntry: the stock-in could not be posted', err),
  );
}

export async function updateEntry(id: string, updates: Partial<PurchaseEntry>): Promise<void> {
  const fields = toLive(updates);
  if (Object.keys(fields).length > 0) await patchDocument(COLLECTION, id, fields);
}

/**
 * A purchase is not one row: raising it also files VAT bills and stock movements against it, and deleting it alone leaves those
 * counted in stock and in the ledger against a record that has gone. This is the website's own cascade (`utils/financeRows.js` →
 * `deletePurchaseWithLinks`).
 *
 * They are found by the purchase's own id (migration 0046), not by its "EXP001" number: numbers restart every fiscal year, so the
 * same one now names a purchase in each year and matching on it would take another year's VAT bill or stock-in with this one.
 * What hangs off the purchase is read BEFORE it is deleted, because afterwards the database lets go of the links (`purchase_id` is
 * ON DELETE SET NULL) and the lookup finds nothing. A linked-row failure is logged and not rethrown, as on the website: the purchase
 * itself is already gone and the caller must not be told the delete failed.
 *
 * Journal entries are not touched. The website matches them on the same ambiguous number and notes that nothing files one against a
 * purchase today; this app never does, and a delete that can reach another year's books is not worth that.
 */
export async function deleteEntry(id: string): Promise<void> {
  const sb = getSupabase();

  const linked = async <T>(what: string, lookup: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> => {
    try {
      const { data, error } = await lookup;
      if (error) throw new Error(error.message);
      return data ?? [];
    } catch (err) {
      console.error(`purchases/deleteEntry: could not look up the linked ${what}`, err);
      return [];
    }
  };
  const vatBills = await linked<{ id: string; storage_path?: unknown }>(
    'vat_bills',
    sb.from('vat_bills').select('id, storage_path').eq('purchase_id', id),
  );
  const movements = await linked<{ id: string }>(
    'stock_movements',
    sb.from('stock_movements').select('id').eq('source', 'purchase').eq('purchase_id', id),
  );

  await removeDocument(COLLECTION, id);

  // A delete the database refuses does not say so: row security filters the row away without an error. Then the purchase is still
  // there, and so must everything that belongs to it be.
  const still = await sb.from('purchases').select('id').eq('id', id).maybeSingle();
  if (still.data) throw new Error('Not deleted. You may not have permission to delete this.');

  try {
    for (const row of vatBills) {
      const path = str(row.storage_path).trim();
      if (path) {
        const removed = await sb.storage.from(VAT_BILL_BUCKET).remove([path]);
        if (removed.error) console.warn(`Could not delete ${VAT_BILL_BUCKET}/${path}:`, removed.error.message);
      }
      const dropped = await sb.from('vat_bills').delete().eq('id', row.id);
      if (dropped.error) throw new Error(dropped.error.message);
    }
  } catch (err) {
    console.error('Failed to delete linked vat_bills:', err);
  }

  try {
    if (movements.length) {
      const { error } = await sb.from('stock_movements').delete().in('id', movements.map((m) => m.id));
      if (error) throw new Error(error.message);
    }
  } catch (err) {
    console.error('Failed to delete linked stock_movements:', err);
  }
}

/** Snapshot restore (undo) — not reversed in Postgres this pass. */
export async function restoreEntries(_previous: PurchaseEntry[]): Promise<void> {
  /* intentionally no live write */
}

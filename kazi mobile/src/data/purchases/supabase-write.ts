/**
 * Live `finance_purchases` writers — the reference ERP's own collection, shared
 * by the Purchases screen and Finance › Purchases. The mobile `PurchaseEntry`
 * field names already mirror the live doc, so the mapping is near 1:1.
 */

import { getSupabase } from '@/lib/supabase';
import { str } from '@/lib/data/normalise';
import { createDocument, patchDocument, removeDocument } from '@/lib/supabase/write';

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

export async function addEntry(entry: PurchaseEntry): Promise<void> {
  await createDocument(COLLECTION, toLive(entry));
}

export async function updateEntry(id: string, updates: Partial<PurchaseEntry>): Promise<void> {
  const fields = toLive(updates);
  if (Object.keys(fields).length > 0) await patchDocument(COLLECTION, id, fields);
}

/**
 * A purchase is not one row: raising it also files VAT bills, stock movements
 * and journal entries against it, and deleting it alone leaves those counted in
 * stock and in the ledger against a record that has gone. This is the reference
 * app's own cascade (`utils/financeRows.js` → `deletePurchaseWithLinks`).
 *
 * The linked rows point at either key — older ones at the readable `EXP###`
 * ref, newer ones at the row's uuid — so both are tried. A linked-row failure
 * is logged and not rethrown, exactly as upstream: the purchase itself is
 * already gone and the caller must not be told the delete failed.
 */
export async function deleteEntry(id: string): Promise<void> {
  const sb = getSupabase();

  // Read the readable ref BEFORE the row goes, or there is nothing left to match on.
  let expenseRef = '';
  try {
    const { data } = await sb.from('purchases').select('expense_ref').eq('id', id).maybeSingle();
    expenseRef = str((data as { expense_ref?: unknown } | null)?.expense_ref).trim();
  } catch (err) {
    console.error('purchases/deleteEntry: could not read the expense ref', err);
  }

  await removeDocument(COLLECTION, id);

  for (const key of [...new Set([expenseRef, id].filter(Boolean))]) {
    try {
      const { data, error } = await sb.from('vat_bills').select('id, storage_path').eq('expense_id', key);
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as { id: string; storage_path?: unknown }[]) {
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
      const { error } = await sb.from('stock_movements').delete().eq('source', 'purchase').eq('source_id', key);
      if (error) throw new Error(error.message);
    } catch (err) {
      console.error('Failed to delete linked stock_movements:', err);
    }

    try {
      // Journal entries link back through `reference` — there has never been an
      // expense-id column on that table.
      const { error } = await sb.from('journal_entries').delete().eq('reference', key);
      if (error) throw new Error(error.message);
    } catch (err) {
      console.error('Failed to delete linked journal_entries:', err);
    }
  }
}

/** Snapshot restore (undo) — not reversed in Postgres this pass. */
export async function restoreEntries(_previous: PurchaseEntry[]): Promise<void> {
  /* intentionally no live write */
}

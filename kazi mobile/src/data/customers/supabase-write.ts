/**
 * Live `customers` writers — the reference ERP's own collection.
 *
 * The eight editable fields are exactly the web form's, minus `region`: mobile
 * never sends that key, so an existing row keeps the region the web app filed
 * it under. `since` is derived from `created_at` and `orders`/`invoices` are
 * joins, so neither is written here.
 */

import { readDocument, type DocData } from '@/lib/supabase/read';
import { createDocument, patchDocument, removeDocument, setDocument } from '@/lib/supabase/write';

import type { Customer } from './types';

const COLLECTION = 'customers';

/** Map the subset of mobile fields that exist on the live doc. */
function toLive(c: Partial<Customer>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (c.name !== undefined) out.name = c.name;
  if (c.contact !== undefined) out.contactPerson = c.contact;
  if (c.email !== undefined) out.email = c.email;
  if (c.phone !== undefined) out.phone = c.phone;
  if (c.country !== undefined) out.country = c.country;
  if (c.city !== undefined) out.city = c.city;
  if (c.address !== undefined) out.address = c.address;
  if (c.notes !== undefined) out.notes = c.notes;
  return out;
}

export async function addCustomer(customer: Customer): Promise<void> {
  await createDocument(COLLECTION, toLive(customer));
}

export async function updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
  const fields = toLive(updates);
  if (Object.keys(fields).length > 0) await patchDocument(COLLECTION, id, fields);
}

/**
 * Rows this session deleted, kept whole so Undo can put one back exactly as the
 * web app filed it — `region` and `createdAt` included, neither of which the
 * mobile `Customer` shape carries.
 */
const deleted = new Map<string, DocData>();

export async function deleteCustomer(id: string): Promise<void> {
  const row = await readDocument(COLLECTION, id);
  await removeDocument(COLLECTION, id);
  if (row) deleted.set(id, row);
}

/**
 * Snapshot restore (undo) — re-inserts the rows in `previous` that are gone,
 * each at its ORIGINAL id, so anything pointing at a customer still resolves.
 * A row this session never deleted is left alone: the snapshot holds only the
 * eight editable fields, and writing those over a live row would drop the rest.
 */
export async function restoreCustomers(previous: Customer[]): Promise<void> {
  for (const c of previous) {
    const row = deleted.get(c.id);
    if (!row) continue;
    const { id: _id, ...fields } = row;
    await setDocument(COLLECTION, c.id, fields);
    deleted.delete(c.id);
  }
}

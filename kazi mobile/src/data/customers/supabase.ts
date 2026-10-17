/**
 * Live `customers` reader.
 *
 * Live shape (sampled 2026-08-30):
 *   { name, contactPerson, email, phone, country, city, address, notes, createdAt }
 *
 * Every editable field maps one-to-one; `region` is on the row but mobile
 * neither shows nor writes it, so a row keeps whatever the web app filed it as.
 * Derived locally:
 *   - `since`    ← year of `createdAt`
 *   - `orders`/`invoices` → [] (the screen fills these from the Sales/Billing
 *     joins in `src/data/customers/joins.ts`)
 */

import { str, tsToISO } from '@/lib/data/normalise';
import { readCollection, type DocData } from '@/lib/supabase/read';

import type { Customer } from './types';

function mapCustomerDoc(id: string, d: DocData): Customer | null {
  const name = str(d.name).trim();
  if (!name) return null;
  const createdISO = tsToISO(d.createdAt);
  return {
    id,
    name,
    contact: str(d.contactPerson).trim(),
    email: str(d.email).trim(),
    phone: str(d.phone).trim(),
    city: str(d.city).trim(),
    country: str(d.country).trim(),
    address: str(d.address).trim(),
    notes: str(d.notes).trim(),
    since: createdISO ? createdISO.slice(0, 4) : '',
    orders: [],
    invoices: [],
  };
}

export async function fetchCustomers(): Promise<Customer[]> {
  return readCollection('customers', mapCustomerDoc);
}

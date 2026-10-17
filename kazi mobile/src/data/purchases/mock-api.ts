import { simulateLatency } from '../mock/delay';
import { seedEntries } from './mock';
import type { PurchaseEntry } from './types';

let db: PurchaseEntry[] = [...seedEntries];

export async function fetchEntries(): Promise<PurchaseEntry[]> {
  await simulateLatency();
  return [...db];
}

export async function addEntry(entry: PurchaseEntry): Promise<void> {
  await simulateLatency(300);
  db = [entry, ...db];
}

export async function updateEntry(id: string, updates: Partial<PurchaseEntry>): Promise<void> {
  await simulateLatency(250);
  db = db.map((e) => (e.id === id ? { ...e, ...updates } : e));
}

export async function deleteEntry(id: string): Promise<void> {
  await simulateLatency(250);
  // Cascade in the reference deletes linked vat_bills / stock_movements /
  // journal_entries; mock-era those either live elsewhere (VAT bills → Finance)
  // or don't exist yet (journal → item 8, stock movements → item 19).
  db = db.filter((e) => e.id !== id);
}

export async function restoreEntries(previous: PurchaseEntry[]): Promise<void> {
  await simulateLatency(150);
  db = [...previous];
}

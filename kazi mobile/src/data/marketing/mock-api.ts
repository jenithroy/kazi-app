import { simulateLatency } from '../mock/delay';
import { seedEntries } from './mock';
import type { CalendarEntry } from './types';

let db: CalendarEntry[] = [...seedEntries];

export async function fetchEntries(): Promise<CalendarEntry[]> {
  await simulateLatency();
  return [...db];
}

export async function addEntry(entry: CalendarEntry): Promise<void> {
  await simulateLatency(300);
  db = [...db, entry];
}

export async function updateEntry(id: string, updates: Partial<CalendarEntry>): Promise<void> {
  await simulateLatency(250);
  db = db.map((e) => (e.id === id ? { ...e, ...updates } : e));
}

export async function removeEntry(id: string): Promise<void> {
  await simulateLatency(250);
  db = db.filter((e) => e.id !== id);
}

export async function restoreEntry(entry: CalendarEntry): Promise<void> {
  await simulateLatency(150);
  db = [...db, entry];
}

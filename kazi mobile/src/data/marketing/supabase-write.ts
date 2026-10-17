/**
 * Live `content_calendar` writers — the reference ERP's own collection.
 * Mobile `kind` ↔ live `type` (Shoot/Publish); the y/m/d triple becomes a
 * `scheduledDate` ISO string (mobile `m` is 0-indexed).
 */

import { createDocument, patchDocument, removeDocument } from '@/lib/supabase/write';

import type { CalendarEntry, EntryKind } from './types';

const COLLECTION = 'content_calendar';

const KIND_TO_LIVE: Record<EntryKind, string> = {
  campaign: 'Publish',
  post: 'Shoot',
  email: 'Email',
  event: 'Event',
};

/**
 * Built from the local date parts, never through `toISOString()`: local
 * midnight in Nepal is the previous afternoon in UTC, so the ISO route filed
 * every entry a day early.
 */
function scheduledDate(e: Partial<CalendarEntry>): string | undefined {
  if (e.y === undefined || e.m === undefined || e.d === undefined) return undefined;
  const dt = new Date(e.y, e.m, e.d);
  if (Number.isNaN(dt.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function toLive(e: Partial<CalendarEntry>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (e.title !== undefined) out.title = e.title;
  if (e.kind !== undefined) out.type = KIND_TO_LIVE[e.kind];
  if (e.notes !== undefined) out.notes = e.notes;
  const sd = scheduledDate(e);
  if (sd !== undefined) out.scheduledDate = sd;
  return out;
}

export async function addEntry(entry: CalendarEntry): Promise<void> {
  await createDocument(COLLECTION, { ...toLive(entry), status: 'scheduled', timeSlot: '' });
}

export async function updateEntry(id: string, updates: Partial<CalendarEntry>): Promise<void> {
  const fields = toLive(updates);
  if (Object.keys(fields).length > 0) await patchDocument(COLLECTION, id, fields);
}

export async function removeEntry(id: string): Promise<void> {
  await removeDocument(COLLECTION, id);
}

/** Undo-after-delete — re-creates the row (a fresh doc id). */
export async function restoreEntry(entry: CalendarEntry): Promise<void> {
  await createDocument(COLLECTION, { ...toLive(entry), status: 'scheduled', timeSlot: '' });
}

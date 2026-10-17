/**
 * Live `content_calendar` reader (Track B, read-only). Writes stay on `mock-api.ts`.
 *
 * Live shape (sampled 2026-08-30): { title, type ("Shoot"/"Publish"),
 *   scheduledDate, timeSlot, mediaUrl, status ("scheduled"), notes, createdAt }
 *
 * Gaps handled locally (see plan §Batch 1):
 *   - `type` Shoot/Publish → mobile `kind` post/campaign (open question at checkpoint:
 *     relabel the mobile chips to Shoot/Publish instead?)
 *   - no assignee field    → `person: ''` (list view falls back to PEOPLE[0])
 *   - `timeSlot` folded into `notes` so it isn't lost
 */

import { str, tsToISO } from '@/lib/data/normalise';
import { readCollection, type DocData } from '@/lib/supabase/read';

import type { CalendarEntry, EntryKind } from './types';

function mapKind(raw: unknown): EntryKind {
  const s = str(raw).trim().toLowerCase();
  if (s === 'publish') return 'campaign';
  if (s === 'shoot') return 'post';
  if (s === 'email' || s === 'newsletter') return 'email';
  if (s === 'event') return 'event';
  return 'post';
}

function mapEntryDoc(id: string, d: DocData): CalendarEntry | null {
  const title = str(d.title).trim();
  const raw = str(d.scheduledDate).trim() || tsToISO(d.createdAt);
  const when = new Date(raw);
  if (!title || Number.isNaN(when.getTime())) return null;

  const timeSlot = str(d.timeSlot).trim();
  const notes = str(d.notes).trim();

  return {
    id,
    y: when.getFullYear(),
    m: when.getMonth(), // 0-indexed, matches the mobile calendar
    d: when.getDate(),
    kind: mapKind(d.type),
    title,
    notes: [timeSlot, notes].filter(Boolean).join(' · '),
    person: '',
  };
}

export async function fetchEntries(): Promise<CalendarEntry[]> {
  return readCollection('content_calendar', mapEntryDoc);
}

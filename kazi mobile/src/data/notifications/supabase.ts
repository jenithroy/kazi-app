/**
 * The only backend edge for notifications. Writes and reads touch **one**
 * collection — `mobile_notifications` — and nothing else in the project, so the
 * existing ERP web app (same database) is unaffected. Every call is
 * guarded: if Supabase isn't configured or RLS denies access, it no-ops and the
 * feature simply stays empty.
 */

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
 getDb } from '@/lib/supabase/collections';

import { isSupabaseConfigured } from '@/lib/supabase';
import { tsToISO } from '@/lib/data/normalise';

import type { NotificationDoc, NotificationRecord } from './types';

const COLLECTION = 'mobile_notifications';
const FEED_LIMIT = 100;
const BATCH_MAX = 400;

function sortAndCap(records: NotificationRecord[]): NotificationRecord[] {
  return [...records].sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO)).slice(0, FEED_LIMIT);
}

export async function writeNotifications(docs: NotificationDoc[]): Promise<void> {
  if (!isSupabaseConfigured || docs.length === 0) return;
  try {
    const db = getDb();
    for (let i = 0; i < docs.length; i += BATCH_MAX) {
      const batch = writeBatch(db);
      for (const d of docs.slice(i, i + BATCH_MAX)) {
        batch.set(doc(collection(db, COLLECTION)), { ...d, createdAt: serverTimestamp() });
      }
      await batch.commit();
    }
  } catch (err) {
    console.warn('[notifications] write failed (rules?) — dropped', err);
  }
}

function toRecord(id: string, data: Record<string, unknown>): NotificationRecord {
  return {
    id,
    recipientEmail: String(data.recipientEmail ?? ''),
    type: (data.type as NotificationRecord['type']) ?? 'info',
    eventType: String(data.eventType ?? ''),
    section: (data.section as NotificationRecord['section']) ?? 'dashboard',
    title: String(data.title ?? 'Update'),
    body: String(data.body ?? ''),
    deepLink: (data.deepLink as string | null) ?? null,
    actorName: String(data.actorName ?? 'Someone'),
    targetRef: (data.targetRef as string | null) ?? null,
    matchedRule: String(data.matchedRule ?? ''),
    read: Boolean(data.read),
    createdAtISO: tsToISO(data.createdAt) || new Date().toISOString(),
  };
}

/**
 * Live feed for one recipient. Falls back to a one-shot read if the realtime
 * listener errors (e.g. missing composite index). Returns an unsubscribe fn.
 */
export function subscribeNotifications(
  email: string,
  onData: (records: NotificationRecord[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  if (!isSupabaseConfigured || !email) {
    onData([]);
    return () => {};
  }
  const db = getDb();
  // Equality-only query — no `orderBy`/`limit`, so no composite index is needed.
  // Ordering + cap happen client-side; per-recipient volume is small.
  const base = query(collection(db, COLLECTION), where('recipientEmail', '==', email.toLowerCase()));
  const mapSnap = (snap: { docs: { id: string; data: () => Record<string, unknown> }[] }) =>
    sortAndCap(snap.docs.map((d) => toRecord(d.id, d.data())));

  try {
    return onSnapshot(
      base,
      (snap) => onData(mapSnap(snap)),
      (err) => {
        console.warn('[notifications] snapshot failed — one-shot fallback', err);
        getDocs(base)
          .then((snap) => onData(mapSnap(snap)))
          .catch((e) => {
            onData([]);
            onError?.(e);
          });
      },
    );
  } catch (err) {
    onData([]);
    onError?.(err);
    return () => {};
  }
}

export async function markRead(ids: string[]): Promise<void> {
  if (!isSupabaseConfigured || ids.length === 0) return;
  const db = getDb();
  try {
    for (let i = 0; i < ids.length; i += BATCH_MAX) {
      const batch = writeBatch(db);
      for (const id of ids.slice(i, i + BATCH_MAX)) {
        batch.update(doc(db, COLLECTION, id), { read: true });
      }
      await batch.commit();
    }
  } catch (err) {
    console.warn('[notifications] markRead failed', err);
  }
}

export async function markOneRead(id: string): Promise<void> {
  if (!isSupabaseConfigured || !id) return;
  try {
    await updateDoc(doc(getDb(), COLLECTION, id), { read: true });
  } catch (err) {
    console.warn('[notifications] markOneRead failed', err);
  }
}

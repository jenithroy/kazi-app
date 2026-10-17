/**
 * Live reader for Usage & Activity.
 *
 * `activity_feed` and `activity_usage_daily` are views over the real
 * `activity_events` table (`supabase/migrations/0032_activity_log.sql`) —
 * not Firestore collections that were migrated — so, like `admin-panel/supabase.ts`,
 * this goes straight at them rather than through a `fs_*` compat view. Both
 * views are `security_invoker`: RLS on `activity_events` decides what comes
 * back, gated by the `usage_analytics` permission. A position that hasn't
 * been granted the page gets zero rows, not an error — which is why this
 * screen needs no client-side "you don't have access" state of its own.
 */

import { getSupabase } from '@/lib/supabase';
import { num, str } from '@/lib/data/normalise';

import type { ActivityFeedEntry, RangeOption, UsageDailyRow } from './types';

function failed(where: string, error: { message: string; code?: string }): Error {
  return new Error(`${where}: ${error.message}${error.code ? ` [${error.code}]` : ''}`);
}

/** ISO timestamp at the start of this range, or null for "everything". */
export function sinceForRange(range: RangeOption): string | null {
  if (!range.days) return null;
  return new Date(Date.now() - range.days * 24 * 60 * 60 * 1000).toISOString();
}

type Row = Record<string, unknown>;

export async function fetchUsageDaily(since: string | null): Promise<UsageDailyRow[]> {
  let q = getSupabase().from('activity_usage_daily').select('*').order('day', { ascending: true });
  if (since) q = q.gte('day', since.slice(0, 10));

  const { data, error } = await q;
  if (error) throw failed('activity_usage_daily', error);

  return ((data ?? []) as Row[]).map((r) => ({
    personId: str(r.person_id).trim() || null,
    personName: str(r.person_name).trim() || 'Removed user',
    sectionId: str(r.section_id).trim() || null,
    sectionLabel: str(r.section_label).trim() || 'Other',
    day: str(r.day),
    events: num(r.events),
    views: num(r.views),
    writes: num(r.writes),
    activeMs: num(r.active_ms),
    lastAt: str(r.last_at).trim() || null,
  }));
}

export async function fetchActivityFeed(since: string | null, limit = 600): Promise<ActivityFeedEntry[]> {
  let q = getSupabase().from('activity_feed').select('*').order('created_at', { ascending: false }).limit(limit);
  if (since) q = q.gte('created_at', since);

  const { data, error } = await q;
  if (error) throw failed('activity_feed', error);

  return ((data ?? []) as Row[]).map((r) => ({
    id: str(r.id),
    personId: str(r.person_id).trim() || null,
    personName: str(r.person_name).trim() || 'Removed user',
    positionLabel: str(r.position_label),
    sectionId: str(r.section_id).trim() || null,
    sectionLabel: str(r.section_label).trim() || 'Other',
    action: str(r.action),
    target: str(r.target).trim() || null,
    path: str(r.path).trim() || null,
    durationMs: r.duration_ms == null ? null : num(r.duration_ms),
    createdAt: str(r.created_at),
  }));
}

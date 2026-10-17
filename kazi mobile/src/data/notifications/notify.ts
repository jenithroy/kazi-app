/**
 * `notify(event)` — the single call a mutation hook makes after a successful
 * write. Fire-and-forget: it never throws and never delays the mutation. It
 * resolves the recipient roster, runs the pure routing rules, and writes one
 * `mobile_notifications` row per recipient. No-op when Supabase isn't
 * configured.
 */

import { queryClient } from '@/data/client';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

import { getActor } from './actor';
import { describeEvent, deepLinkFor } from './events';
import { writeNotifications } from './supabase';
import { notificationKeys } from './keys';
import { recipientsFor } from './routing';
import { fetchRoster } from './roster';
import type { NotificationDoc, NotificationEvent } from './types';

export function notify(ev: NotificationEvent): void {
  if (!isSupabaseConfigured) return;
  void dispatch(ev).catch((err) => console.warn('[notifications] notify failed', err));
}

async function dispatch(ev: NotificationEvent): Promise<void> {
  const actor = getActor();

  const roster = await queryClient.ensureQueryData({
    queryKey: notificationKeys.roster(),
    queryFn: fetchRoster,
    staleTime: 10 * 60 * 1000,
  });

  let recipients = recipientsFor(ev, roster, actor);
  if (recipients.length === 0) return;

  // A muted thread should suppress the ordinary "you're in this conversation"
  // ping — but never a @mention, which fires as its own separate event and
  // never reaches this branch. Best-effort: if the mute lookup fails for any
  // reason, fail OPEN (send anyway) rather than silently going quiet — the
  // same "never worse than before" contract notify() already has everywhere
  // else in this file.
  if (ev.eventType === 'message.received' && ev.payload?.threadId) {
    try {
      const muted = await mutedEmailsFor(ev.payload.threadId);
      if (muted.size > 0) {
        recipients = recipients.filter((r) => !muted.has(r.member.email.toLowerCase()));
        if (recipients.length === 0) return;
      }
    } catch (err) {
      console.warn('[notifications] mute lookup failed — sending anyway', err);
    }
  }

  if (ev.eventType === 'lead.message_received' && ev.payload?.leadConvo) {
    try {
      const muted = await mutedLeadEmails(ev.payload.leadConvo);
      if (muted.size > 0) {
        recipients = recipients.filter((r) => !muted.has(r.member.email.toLowerCase()));
        if (recipients.length === 0) return;
      }
    } catch (err) {
      console.warn('[notifications] lead-mute lookup failed — sending anyway', err);
    }
  }

  // The admin-toggleable category gate — only ever touches recipients who
  // matched a "broadcast" rule (routing.ts sets `category` on those alone).
  // Default is opt-out: no row for a position means enabled, so this only
  // ever narrows a set that already works today.
  const categorized = recipients.filter((r) => r.category);
  if (categorized.length > 0) {
    try {
      const category = categorized[0]!.category as string;
      const positionIds = [...new Set(categorized.map((r) => r.member.positionId).filter((p): p is string => !!p))];
      if (positionIds.length > 0) {
        const { data, error } = await getSupabase()
          .from('position_notification_categories')
          .select('position_id, enabled')
          .eq('category_id', category)
          .in('position_id', positionIds);
        if (error) throw error;
        const disabled = new Set(
          (data ?? []).filter((r) => r.enabled === false).map((r) => r.position_id as string),
        );
        if (disabled.size > 0) {
          recipients = recipients.filter((r) => !r.category || !r.member.positionId || !disabled.has(r.member.positionId));
          if (recipients.length === 0) return;
        }
      }
    } catch (err) {
      console.warn('[notifications] category gate lookup failed — sending anyway', err);
    }
  }

  const link = deepLinkFor(ev);
  const copy = describeEvent(ev, actor?.name ?? 'Someone');

  const docs: NotificationDoc[] = recipients.map((r) => ({
    recipientEmail: r.member.email.toLowerCase(),
    recipientRole: r.member.role,
    type: r.type,
    eventType: ev.eventType,
    section: ev.section,
    title: copy.title,
    body: copy.body,
    deepLink: link,
    actorName: actor?.name ?? 'Someone',
    actorEmail: (actor?.email ?? '').toLowerCase(),
    targetRef: ev.targetRef ?? null,
    matchedRule: r.matchedRule,
    read: false,
    createdAt: null,
    source: 'kazi-mobile',
  }));

  await writeNotifications(docs);
}

/**
 * Lowercased emails of everyone who muted this thread. RLS on `chat_members`
 * only returns rows for threads the caller is in — always true here, since
 * `notify()` is only ever called by whoever just sent the message.
 */
async function mutedEmailsFor(threadId: string): Promise<Set<string>> {
  const { data, error } = await getSupabase()
    .from('chat_members')
    .select('people:person_id(email)')
    .eq('thread_id', threadId)
    .eq('muted', true);
  if (error) throw error;
  // Supabase's embed shape for a to-one FK isn't consistent across client
  // versions/queries — accept either a single object or a one-element array.
  const emails = (data ?? [])
    .map((r) => (r as { people: { email: string } | { email: string }[] | null }).people)
    .flatMap((p) => (Array.isArray(p) ? p : p ? [p] : []))
    .map((p) => p.email)
    .filter((e): e is string => !!e)
    .map((e) => e.toLowerCase());
  return new Set(emails);
}

/** Lowercased emails of everyone who muted this specific lead. */
async function mutedLeadEmails(leadConvo: string): Promise<Set<string>> {
  const { data, error } = await getSupabase()
    .from('lead_notification_mutes')
    .select('people:person_id(email)')
    .eq('lead_convo', leadConvo)
    .eq('muted', true);
  if (error) throw error;
  const emails = (data ?? [])
    .map((r) => (r as { people: { email: string } | { email: string }[] | null }).people)
    .flatMap((p) => (Array.isArray(p) ? p : p ? [p] : []))
    .map((p) => p.email)
    .filter((e): e is string => !!e)
    .map((e) => e.toLowerCase());
  return new Set(emails);
}

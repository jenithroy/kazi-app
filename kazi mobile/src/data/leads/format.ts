/**
 * Date/preview helpers for the Leads tab — standalone from `data/chat/utils`,
 * like the web app's `leadsFormat.js`, since a lead has no staff identity
 * registry to read from.
 */

import type { Lead, LeadMessage, ValueTier } from './types';

const DAY = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const daysAgo = (ms: number) => Math.round((startOfDay(Date.now()) - startOfDay(ms)) / DAY);

function clockOf(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Thread-list stamp. */
export function leadListTime(iso: string | undefined): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (Date.now() - ms < 60_000) return 'Just now';
  const days = daysAgo(ms);
  if (days === 0) return clockOf(ms);
  if (days === 1) return 'Yesterday';
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Day separator inside a thread. */
export function leadDayLabel(ms: number): string {
  const days = daysAgo(ms);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const leadMessageClock = (iso: string): string => clockOf(new Date(iso).getTime());

export interface LeadDayGroup {
  key: string;
  label: string;
  items: LeadMessage[];
}

/** Splits a thread into day sections, so the view draws one separator per day. */
export function groupLeadMessagesByDay(messages: LeadMessage[]): LeadDayGroup[] {
  const groups: LeadDayGroup[] = [];
  for (const m of messages) {
    const ms = new Date(m.created_at).getTime();
    const key = String(startOfDay(ms));
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(m);
    else groups.push({ key, label: leadDayLabel(ms), items: [m] });
  }
  return groups;
}

/** What an attachment reads as where there's no room to render it. */
export function leadPreview(lead: Lead): string {
  const last = lead.lastMessage;
  if (!last) return 'No messages yet';
  // An empty body left the row reading a bare "You:" with nothing after it.
  const body = last.content || (last.mediaType ? 'Sent an attachment' : 'No text');
  return last.role === 'assistant' ? `You: ${body}` : body;
}

/** Tier → rank for sorting (higher chases first). */
const VALUE_TIER_RANK: Record<ValueTier, number> = { high: 2, medium: 1, low: 0 };

export function valueRank(lead: Lead): number {
  return lead.value.tier ? VALUE_TIER_RANK[lead.value.tier] : -1;
}

export const VALUE_TIER_LABEL: Record<ValueTier, string> = { high: 'High value', medium: 'Medium value', low: 'Low value' };

/** Ordered by value tier first, recency second. */
export function byValueThenRecency(a: Lead, b: Lead): number {
  const rankDiff = valueRank(b) - valueRank(a);
  if (rankDiff !== 0) return rankDiff;
  return new Date(b.lastMessage?.createdAt || 0).getTime() - new Date(a.lastMessage?.createdAt || 0).getTime();
}

/** Most recent activity first, ignoring value tier entirely. */
export function byRecency(a: Lead, b: Lead): number {
  return new Date(b.lastMessage?.createdAt || 0).getTime() - new Date(a.lastMessage?.createdAt || 0).getTime();
}

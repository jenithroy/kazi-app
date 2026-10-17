/**
 * Pure derivations over `UsageDailyRow[]` / `ActivityFeedEntry[]` — the same
 * shapes the reference app's `Usage.jsx` builds with `useMemo`, ported here so
 * the screen component stays about layout rather than arithmetic.
 */

import { dayLabel, kathmanduDay } from './format';
import type { ActionFilterKey, ActivityFeedEntry, DayCount, FeedDayGroup, FeedEntryGroup, ShareRow, UsageDailyRow, UsageTotals } from './types';

const personKey = (r: { personId: string | null; personName: string }) => r.personId || r.personName || 'unknown';
const sectionKey = (r: { sectionId: string | null }) => r.sectionId || 'other';

/** Narrow the daily rows to one person and/or one section — `'all'` means unscoped. */
export function scopeDaily(rows: UsageDailyRow[], scope: { person: string; section: string }): UsageDailyRow[] {
  if (scope.person === 'all' && scope.section === 'all') return rows;
  return rows.filter((r) => (scope.person === 'all' || personKey(r) === scope.person) && (scope.section === 'all' || sectionKey(r) === scope.section));
}

export function computeTotals(rows: UsageDailyRow[]): UsageTotals {
  let events = 0, activeMs = 0, views = 0, writes = 0;
  const people = new Set<string>();
  const days = new Set<string>();
  for (const r of rows) {
    events += r.events;
    views += r.views;
    writes += r.writes;
    activeMs += r.activeMs;
    people.add(personKey(r));
    days.add(r.day);
  }
  return { events, activeMs, views, writes, people: people.size, days: days.size };
}

export function groupBySection(rows: UsageDailyRow[]): ShareRow[] {
  const m = new Map<string, ShareRow & { peopleSet: Set<string> }>();
  for (const r of rows) {
    const key = sectionKey(r);
    const cur = m.get(key) ?? { key, name: r.sectionLabel || r.sectionId || 'Elsewhere', value: 0, activeMs: 0, writes: 0, people: 0, peopleSet: new Set<string>() };
    cur.value += r.events;
    cur.writes += r.writes;
    cur.activeMs += r.activeMs;
    cur.peopleSet.add(personKey(r));
    m.set(key, cur);
  }
  return [...m.values()]
    .map(({ peopleSet, ...rest }) => ({ ...rest, people: peopleSet.size }))
    .sort((a, b) => b.value - a.value);
}

export function groupByPerson(rows: UsageDailyRow[]): ShareRow[] {
  const m = new Map<string, ShareRow & { sections: Map<string, number> }>();
  for (const r of rows) {
    const key = personKey(r);
    const cur = m.get(key) ?? { key, name: r.personName || 'Removed user', value: 0, activeMs: 0, writes: 0, people: 1, lastAt: null, sections: new Map<string, number>() };
    cur.value += r.events;
    cur.writes += r.writes;
    cur.activeMs += r.activeMs;
    if (!cur.lastAt || (r.lastAt && r.lastAt > cur.lastAt)) cur.lastAt = r.lastAt;
    const label = r.sectionLabel || r.sectionId || 'Elsewhere';
    cur.sections.set(label, (cur.sections.get(label) ?? 0) + r.events);
    m.set(key, cur);
  }
  return [...m.values()]
    .map(({ sections, ...rest }) => ({
      ...rest,
      topSection: [...sections.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
    }))
    .sort((a, b) => b.value - a.value);
}

/** Every day in the range, including the quiet ones — skipping empty days flatters the numbers by hiding the gaps. */
export function groupByDay(rows: UsageDailyRow[], rangeDays: number | null): DayCount[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.day, (m.get(r.day) ?? 0) + r.events);
  if (!m.size) return [];

  const keys = [...m.keys()].sort();
  const span = rangeDays ?? Math.max(
    1,
    Math.round((Date.parse(`${keys[keys.length - 1]}T12:00:00Z`) - Date.parse(`${keys[0]}T12:00:00Z`)) / 86_400_000) + 1,
  );
  const out: DayCount[] = [];
  for (let i = Math.min(span, 90) - 1; i >= 0; i--) {
    const key = kathmanduDay(Date.now() - i * 86_400_000);
    out.push({ day: key, events: m.get(key) ?? 0 });
  }
  return out;
}

export const VERB_LABEL: Record<string, string> = {
  view: 'opened',
  sign_in: 'signed in',
  create: 'created',
  update: 'updated',
  save: 'saved',
  delete: 'deleted',
};

export type ActionTone = 'good' | 'warning' | 'bad' | 'neutral';

export const ACTION_TONE: Record<string, ActionTone> = {
  view: 'neutral', sign_in: 'good', create: 'good',
  update: 'warning', save: 'good', delete: 'bad',
};

export const isWrite = (action: string): boolean => action === 'create' || action === 'update' || action === 'save' || action === 'delete';

export interface FeedFilter {
  person: string;
  section: string;
  action: ActionFilterKey;
  query: string;
}

export function filterFeed(feed: ActivityFeedEntry[], f: FeedFilter): ActivityFeedEntry[] {
  const q = f.query.trim().toLowerCase();
  return feed.filter((e) => {
    if (f.person !== 'all' && personKey(e) !== f.person) return false;
    if (f.section !== 'all' && sectionKey(e) !== f.section) return false;
    if (f.action === 'view' && e.action !== 'view') return false;
    if (f.action === 'sign_in' && e.action !== 'sign_in') return false;
    if (f.action === 'write' && !isWrite(e.action)) return false;
    if (q) {
      const hay = `${e.personName} ${e.sectionLabel} ${e.action} ${e.target ?? ''} ${e.path ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Somebody flipping between two pages for ten minutes is one thing they did,
 * not forty. Runs of the same event by the same person within 15 minutes
 * collapse into a single line with a count — the charts still count every row.
 */
export function collapseFeed(feed: ActivityFeedEntry[]): FeedEntryGroup[] {
  const out: (FeedEntryGroup & { oldestAt: string })[] = [];
  for (const e of feed) {
    const last = out[out.length - 1];
    const sameThing =
      last &&
      last.personId === e.personId &&
      last.action === e.action &&
      last.sectionId === e.sectionId &&
      (last.target ?? '') === (e.target ?? '') &&
      Date.parse(last.oldestAt) - Date.parse(e.createdAt) < 15 * 60 * 1000;

    if (sameThing) {
      last.count += 1;
      last.oldestAt = e.createdAt;
      last.durationMs = (last.durationMs ?? 0) + (e.durationMs ?? 0);
    } else {
      out.push({ ...e, count: 1, oldestAt: e.createdAt });
    }
  }
  return out;
}

export function groupFeedByDay(entries: FeedEntryGroup[]): FeedDayGroup[] {
  const groups: FeedDayGroup[] = [];
  for (const e of entries) {
    const key = kathmanduDay(Date.parse(e.createdAt));
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(e);
    else groups.push({ key, label: dayLabel(key), items: [e] });
  }
  return groups;
}

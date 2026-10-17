/**
 * Local-dev fallback — used only when `EXPO_PUBLIC_SUPABASE_URL` isn't set.
 * A small, plausible spread of activity so the screen has something to draw;
 * not meant to be read as real history.
 */

import type { ActivityFeedEntry, UsageDailyRow } from './types';

const PEOPLE = [
  { id: 'p1', name: 'Sarbagya Shrestha' },
  { id: 'p2', name: 'Anmol Rai' },
  { id: 'p3', name: 'Sunam Deepa' },
  { id: 'p4', name: 'Priya Gurung' },
];

const SECTIONS: { id: string; label: string }[] = [
  { id: 'production', label: 'Production' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'finance', label: 'Finance' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'billing', label: 'Billing' },
];

const DAY = 24 * 60 * 60 * 1000;
const KATHMANDU_OFFSET_MIN = 5 * 60 + 45;

function dayKey(ms: number): string {
  return new Date(ms + KATHMANDU_OFFSET_MIN * 60 * 1000).toISOString().slice(0, 10);
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function buildDaily(): UsageDailyRow[] {
  const rand = seeded(42);
  const rows: UsageDailyRow[] = [];
  const now = Date.now();
  for (let d = 0; d < 21; d++) {
    const dayMs = now - d * DAY;
    // Quieter on the weekend, like a real factory.
    const weekday = new Date(dayMs).getDay();
    const weekendDamp = weekday === 0 || weekday === 6 ? 0.35 : 1;
    for (const person of PEOPLE) {
      for (const section of SECTIONS) {
        if (rand() > 0.55 * weekendDamp) continue;
        const events = Math.max(1, Math.round(rand() * 14 * weekendDamp));
        const writes = Math.round(events * rand() * 0.4);
        rows.push({
          personId: person.id,
          personName: person.name,
          sectionId: section.id,
          sectionLabel: section.label,
          day: dayKey(dayMs),
          events,
          views: events - writes,
          writes,
          activeMs: Math.round(events * (30_000 + rand() * 90_000)),
          lastAt: new Date(dayMs).toISOString(),
        });
      }
    }
  }
  return rows;
}

function buildFeed(): ActivityFeedEntry[] {
  const rand = seeded(7);
  const actions = ['view', 'view', 'view', 'create', 'update', 'save', 'delete'];
  const targets: Record<string, string> = {
    production: 'Order', inventory: 'Stock item', finance: 'Expense',
    tasks: 'Task', attendance: 'Attendance record', billing: 'Invoice',
  };
  const entries: ActivityFeedEntry[] = [];
  const now = Date.now();
  for (let i = 0; i < 180; i++) {
    const person = PEOPLE[Math.floor(rand() * PEOPLE.length)];
    const section = SECTIONS[Math.floor(rand() * SECTIONS.length)];
    const action = actions[Math.floor(rand() * actions.length)];
    const createdAt = new Date(now - i * (25 * 60 * 1000) - Math.round(rand() * 5 * 60 * 1000)).toISOString();
    entries.push({
      id: `mock-${i}`,
      personId: person.id,
      personName: person.name,
      positionLabel: '',
      sectionId: section.id,
      sectionLabel: section.label,
      action,
      target: action === 'view' ? null : targets[section.id],
      path: `/${section.id}`,
      durationMs: action === 'view' ? Math.round(30_000 + rand() * 180_000) : null,
      createdAt,
    });
  }
  return entries;
}

const DAILY = buildDaily();
const FEED = buildFeed();

export async function fetchUsageDaily(since: string | null): Promise<UsageDailyRow[]> {
  if (!since) return DAILY;
  const cutoff = since.slice(0, 10);
  return DAILY.filter((r) => r.day >= cutoff);
}

export async function fetchActivityFeed(since: string | null): Promise<ActivityFeedEntry[]> {
  if (!since) return FEED;
  return FEED.filter((e) => e.createdAt >= since);
}

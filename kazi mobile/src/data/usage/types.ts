/** One row of `activity_feed` — a single logged action, newest first. */
export interface ActivityFeedEntry {
  id: string;
  personId: string | null;
  personName: string;
  positionLabel: string;
  sectionId: string | null;
  sectionLabel: string;
  action: string;
  target: string | null;
  path: string | null;
  durationMs: number | null;
  createdAt: string;
}

/** One row of `activity_usage_daily` — activity rolled up per person / page / Kathmandu day. Everything on screen is built from this. */
export interface UsageDailyRow {
  personId: string | null;
  personName: string;
  sectionId: string | null;
  sectionLabel: string;
  /** yyyy-mm-dd, Kathmandu calendar day. */
  day: string;
  events: number;
  views: number;
  writes: number;
  activeMs: number;
  lastAt: string | null;
}

export type RangeKey = '1d' | '7d' | '30d' | '90d' | 'all';

export interface RangeOption {
  key: RangeKey;
  label: string;
  days: number | null;
}

export const RANGES: RangeOption[] = [
  { key: '1d', label: '24 hours', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
];

export type ActionFilterKey = 'all' | 'view' | 'write' | 'sign_in';

export interface UsageTotals {
  events: number;
  activeMs: number;
  views: number;
  writes: number;
  people: number;
  days: number;
}

/** A share of the total, by section or by person — the input to a ranked list with a proportion bar. */
export interface ShareRow {
  key: string;
  name: string;
  value: number;
  activeMs: number;
  writes: number;
  people: number;
  /** Person rows only: label of the page they use most. */
  topSection?: string;
  /** Person rows only: most recent activity. */
  lastAt?: string | null;
}

export interface DayCount {
  day: string;
  events: number;
}

export interface FeedEntryGroup extends ActivityFeedEntry {
  /** How many consecutive identical entries this one collapses. */
  count: number;
}

export interface FeedDayGroup {
  key: string;
  label: string;
  items: FeedEntryGroup[];
}

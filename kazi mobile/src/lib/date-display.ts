/**
 * Dates in the calendar the user chose.
 *
 * Every date in this app is stored as an AD ISO string; Settings › Date entry
 * decides which calendar it is *shown* in. The rule the reference app follows,
 * and this keeps: the chosen calendar leads, and the other one stays visible
 * next to it — so a Gregorian reader still sees the Bikram Sambat date the
 * workshop's paperwork is filed under, and vice versa.
 */
import { useCallback } from 'react';

import { getCalendarPreference, useCalendarPreference, type DateCalendar } from './calendar-preference';
import { formatAD, formatBS, type BSFormat } from './nepaliDate';

/**
 * The local calendar day of a timestamp, as `YYYY-MM-DD` — what the BS/AD
 * formatters take. Slicing an ISO string instead would read the *UTC* day,
 * which is a day early for anything logged after 18:15 in Nepal.
 */
export function isoDay(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface DateTextOptions {
  /** How BS renders when BS is the one being shown. Default `long` (`10 Bhadra 2083`). */
  bsStyle?: BSFormat;
}

/**
 * The date in `calendar`. A blank or unparseable value gives an em dash rather
 * than throwing out of the BS converter — these run inside render.
 */
export function dateIn(iso: string, calendar: DateCalendar, opts: DateTextOptions = {}): string {
  if (!iso) return '—';
  try {
    return calendar === 'bs' ? formatBS(iso, opts.bsStyle ?? 'long') : formatAD(iso);
  } catch {
    return '—';
  }
}

/** The date in the preferred calendar. Pure — the caller has to be subscribed. */
export function dateText(iso: string, opts: DateTextOptions = {}): string {
  return dateIn(iso, getCalendarPreference(), opts);
}

export interface DatePair {
  /** The date in the calendar the user chose. */
  primary: string;
  /** The same date in the other calendar, for the muted line beside it. */
  secondary: string;
  /** `B.S.` or `A.D.` — what `secondary` is, since the two are not tellable apart at a glance. */
  secondarySuffix: 'B.S.' | 'A.D.';
}

/** Both renderings, ordered by the preference. */
export function datePair(iso: string, calendar: DateCalendar, opts: DateTextOptions = {}): DatePair {
  const bs = dateIn(iso, 'bs', opts);
  const ad = dateIn(iso, 'ad', opts);
  return calendar === 'bs'
    ? { primary: bs, secondary: ad, secondarySuffix: 'A.D.' }
    : { primary: ad, secondary: bs, secondarySuffix: 'B.S.' };
}

/**
 * A date formatter bound to the preference, and a subscription to it — use this
 * in a component rather than calling `formatAD` / `formatBS` directly, or the
 * date will ignore the setting.
 */
export function useDateText(): (iso: string, opts?: DateTextOptions) => string {
  const calendar = useCalendarPreference();
  return useCallback((iso: string, opts?: DateTextOptions) => dateIn(iso, calendar, opts), [calendar]);
}

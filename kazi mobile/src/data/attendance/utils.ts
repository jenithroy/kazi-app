import { money } from '@/lib/money';

import { EXCEPTIONS, TODAY_DAY } from './mock';
import type { DayCell } from './types';

/** Nepal is a fixed UTC+5:45 with no DST — safe to offset by a constant. */
const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60_000;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Today in Asia/Kathmandu as `Sun 31 Aug` — the workshop's day, not the device's,
 * so a phone left on another timezone still labels the roll call correctly.
 */
export function todayLabel(): string {
  const d = new Date(Date.now() + NEPAL_OFFSET_MS);
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
}

const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The current month in Asia/Kathmandu as `August 2026`. */
export function currentMonthLabel(): string {
  const d = new Date(Date.now() + NEPAL_OFFSET_MS);
  return `${MONTH_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function num(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** `NPR 1,234` / `GBP 6` — the display currency, spelled out as payroll paperwork does. */
export function npr(n: number): string {
  return money(n, { symbol: 'code' });
}

export function formatHm(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Aug 2026: the 1st is a Saturday, so weekday = (5 + day) % 7 with 0=Sun. Saturday is Nepal's weekly off, not an absence. */
export function buildMonthDays(): DayCell[] {
  const cells: DayCell[] = [];
  for (let i = 0; i < 6; i++) cells.push({ day: null, dateISO: null, status: null, isToday: false });
  for (let d = 1; d <= 31; d++) {
    const weekday = (5 + d) % 7;
    const isSat = weekday === 6;
    const isFuture = d > TODAY_DAY;
    const status = isSat ? 'off' : isFuture ? 'future' : (EXCEPTIONS[d] ?? 'present');
    cells.push({ day: d, dateISO: `2026-08-${String(d).padStart(2, '0')}`, status, isToday: d === TODAY_DAY });
  }
  return cells;
}

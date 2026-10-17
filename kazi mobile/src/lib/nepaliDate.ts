/**
 * Bikram Sambat (BS) dates + Nepali fiscal year. The reference web app shows
 * BS as the primary date everywhere with the Gregorian (AD) date secondary,
 * and derives the fiscal year from the Shrawan-1 boundary (`src/utils/fiscalYear.js`).
 *
 * Conversion is delegated to the MIT-licensed `nepali-date-converter` (NOT the
 * GPL compliance-repo data). We always keep the AD ISO string as the stored
 * canonical value (sortable, queryable) and derive BS for display.
 */

import NepaliDate from 'nepali-date-converter';

/** BS month names, index 0 = Baishakh. */
export const BS_MONTHS_EN = [
  'Baishakh', 'Jestha', 'Ashad', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
] as const;

/** Nepali fiscal year opens on Shrawan 1 — BS month index 3 (0-based). */
const FY_START_MONTH_INDEX = 3;

export interface BSParts {
  /** BS year, e.g. 2083. */
  year: number;
  /** 1-indexed month (1 = Baishakh) — matches how the reference renders `2082-04-10`. */
  month: number;
  /** Day of month. */
  date: number;
}

// ---- AD <-> Date helpers (TZ-safe: work in local wall-clock components) ----

function parseISO(adISO: string): Date {
  const [y, m, d] = adISO.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0); // local noon — never crosses a day on toISOString
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nepaliDateFor(adISO: string): NepaliDate {
  return new NepaliDate(parseISO(adISO));
}

// ---- Conversions ----

/** AD ISO (`YYYY-MM-DD`) → BS parts. */
export function bsFromAD(adISO: string): BSParts {
  const bs = nepaliDateFor(adISO).getBS(); // { year, month (0-idx), date, day }
  return { year: bs.year, month: bs.month + 1, date: bs.date };
}

/** BS parts → AD ISO (`YYYY-MM-DD`). */
export function bsToAD(bs: BSParts): string {
  return toISO(new NepaliDate(bs.year, bs.month - 1, bs.date).toJsDate());
}

export type BSFormat = 'numeric' | 'long' | 'devanagari';

/** AD ISO → BS display string. `numeric`: `2083-05-10` · `long`: `10 Bhadra 2083` · `devanagari`: `१० भाद्र २०८३`. */
export function formatBS(adISO: string, style: BSFormat = 'numeric'): string {
  const nd = nepaliDateFor(adISO);
  if (style === 'devanagari') return nd.format('DD MMMM YYYY', 'np');
  if (style === 'long') {
    const { year, month, date } = bsFromAD(adISO);
    return `${date} ${BS_MONTHS_EN[month - 1]} ${year}`;
  }
  const { year, month, date } = bsFromAD(adISO);
  return `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
}

/** AD ISO → short AD display, e.g. `26 Aug 2026`. */
export function formatAD(adISO: string): string {
  return parseISO(adISO).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---- Fiscal year ----

export interface FiscalYear {
  /** e.g. `2083/84`. */
  label: string;
  /** BS year the FY opens in. */
  startBSYear: number;
  /** AD ISO of Shrawan 1 (inclusive). */
  startAD: string;
  /** AD ISO of the last day before the next FY (inclusive). */
  endAD: string;
}

function fiscalYearFromStartBSYear(startBSYear: number): FiscalYear {
  const startAD = bsToAD({ year: startBSYear, month: FY_START_MONTH_INDEX + 1, date: 1 });
  const nextStartAD = bsToAD({ year: startBSYear + 1, month: FY_START_MONTH_INDEX + 1, date: 1 });
  const end = parseISO(nextStartAD);
  end.setDate(end.getDate() - 1);
  return {
    label: `${startBSYear}/${String((startBSYear + 1) % 100).padStart(2, '0')}`,
    startBSYear,
    startAD,
    endAD: toISO(end),
  };
}

/** The Nepali fiscal year an AD date falls in. */
export function fiscalYearForAD(adISO: string): FiscalYear {
  const bs = nepaliDateFor(adISO).getBS(); // month is 0-indexed here
  const startBSYear = bs.month >= FY_START_MONTH_INDEX ? bs.year : bs.year - 1;
  return fiscalYearFromStartBSYear(startBSYear);
}

/** The fiscal year containing today. */
export function currentFiscalYear(): FiscalYear {
  return fiscalYearForAD(toISO(new Date()));
}

/** `count` fiscal years ending with the current one, newest first. */
export function recentFiscalYears(count = 4): FiscalYear[] {
  const current = currentFiscalYear();
  return Array.from({ length: count }, (_, i) => fiscalYearFromStartBSYear(current.startBSYear - i));
}

/** True when an AD ISO date is inside a fiscal year (inclusive of both ends). */
export function isInFiscalYear(adISO: string, fy: FiscalYear): boolean {
  return adISO >= fy.startAD && adISO <= fy.endAD;
}

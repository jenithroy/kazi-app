import { money } from '@/lib/money';

import type { Employee, PayMonth, PayResult } from './types';

export function num(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** `NPR 1,234` / `GBP 6` — the display currency, spelled out as payroll paperwork does. */
export function npr(n: number): string {
  return money(n, { symbol: 'code' });
}

/** Masks all but the last 4 digits — bank details are the risky field, per the design's own callout. */
export function maskAccount(acct: string): string {
  return acct && acct.length > 4 ? `•••• •••• ${acct.slice(-4)}` : acct || '—';
}

export function acctDigits(acct: string): string {
  return acct.replace(/[^0-9]/g, '');
}

export function acctValid(acct: string): boolean {
  return acctDigits(acct).length === 13;
}

/** A typo here means an unpaid worker, not a rounding error — so the 13-digit check runs inline as you type. */
export function acctHint(acct: string): string {
  const digits = acctDigits(acct);
  if (digits.length === 0) return 'Salary is credited on the last working day';
  if (digits.length === 13) return `Checks out · ${maskAccount(digits)}`;
  return `${digits.length} of 13 digits`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Join dates arrive ISO from Postgres (`join_date` is a `date`) but as
 * `12 Mar 2021` from the mock roster. The editor works in ISO, so normalise
 * on the way in; anything unrecognised is handed back untouched for the
 * person to correct rather than silently blanked.
 */
export function toISODate(raw: string): string {
  const v = raw.trim();
  if (!v || ISO_DATE.test(v)) return v;
  const m = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(v);
  if (!m) return v;
  const month = MONTHS_SHORT.indexOf(m[2].slice(0, 3).toLowerCase());
  if (month < 0) return v;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Empty is allowed (the column is nullable); anything else must be a real ISO day. */
export function dateValid(raw: string): boolean {
  const v = raw.trim();
  if (!v) return true;
  if (!ISO_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** 24-hour `HH:MM`, blank allowed — the shift columns are nullable `time`. */
export function timeValid(raw: string): boolean {
  const v = raw.trim();
  return !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/** A blank email is fine on an existing record; a typed one has to look like one. */
export function emailValid(raw: string): boolean {
  const v = raw.trim();
  return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** `payroll.month` is one of these, spelled out in English (`fiscalYear.js`). */
export const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 0-based index of an AD English month name, or -1. */
export function monthIndexOf(name: string): number {
  return EN_MONTHS.findIndex((m) => m.toLowerCase() === name.trim().toLowerCase());
}

/**
 * A payroll period rebuilt from the calendar. `payroll` stores only a month name
 * and a year, so everything else here is derived: `days` counts the working days
 * of the app's default week (Sun–Fri, so Saturdays come off), and the pay date
 * is the last day of the month — the same convention the run card has always
 * shown. No multiplier, ever.
 */
export function payMonthOf(monthIndex: number, year: number, open: boolean): PayMonth {
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  let working = 0;
  for (let day = 1; day <= days; day += 1) {
    if (new Date(Date.UTC(year, monthIndex, day)).getUTCDay() !== 6) working += 1;
  }
  const short = EN_MONTHS[monthIndex].slice(0, 3);
  return {
    key: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    label: `${short} ${year}`,
    period: `1 – ${days} ${short} ${year}`,
    days: working,
    factor: 1,
    open,
    payDate: `${days} ${short} ${year}`,
  };
}

/** Today's period — the fallback when no payroll run has been stored yet. */
export function currentPayMonth(): PayMonth {
  const now = new Date();
  return payMonthOf(now.getMonth(), now.getFullYear(), true);
}

export function pay(p: Employee, m: PayMonth): PayResult {
  const ot = Math.round(p.otH * p.otR * m.factor);
  const otHours = Math.round(p.otH * m.factor);
  // Priced off the real salary, as the reference does (`basic / 30`): an absent
  // day forfeits a full day, a late mark 25% — and Attendance has already
  // counted only the marks that carried a cut. Flat rates made a 0-salary
  // employee net negative.
  const cut = Math.round((p.absent * (p.basic / 30) + (p.cutNPR ?? 0)) * m.factor);
  const gross = p.basic + p.allow + ot + p.bonus;
  const ssf = Math.round((p.basic + p.allow) * 0.11);
  const ded = ssf + p.adv + cut + p.tax;
  return { ot, otHours, cut, gross, ssf, ded, net: gross - ded, absent: p.absent, late: p.late };
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function w3(n: number): string {
  let s = '';
  if (n > 99) {
    s += `${ONES[Math.floor(n / 100)]} hundred`;
    n %= 100;
    if (n) s += ' ';
  }
  if (n > 19) {
    s += TENS[Math.floor(n / 10)];
    if (n % 10) s += `-${ONES[n % 10]}`;
  } else if (n > 0) {
    s += ONES[n];
  }
  return s;
}

/** Amount-in-words for the salary slip, Nepali lakh/thousand grouping. */
export function inWords(n: number): string {
  const l = Math.floor(n / 100000);
  const k = Math.floor((n % 100000) / 1000);
  const r = n % 1000;
  const parts: string[] = [];
  if (l) parts.push(`${w3(l)} lakh`);
  if (k) parts.push(`${w3(k)} thousand`);
  if (r) parts.push(w3(r));
  const s = parts.join(' ') || 'zero';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

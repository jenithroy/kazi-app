// Nepali (Bikram Sambat) fiscal-year helpers — backed by the exact BS<->AD
// conversion tables in "nepali-date-converter", not an approximation.
// A Nepali fiscal year runs Shrawan 1 -> next Ashar-end.
import NepaliDate, { dateConfigMap } from "nepali-date-converter";
import { tsDate } from "./date";

export const BS_MONTHS = [
  "Baisakh", "Jestha", "Asar", "Shrawan", "Bhadra", "Aswin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"
];
const SHRAWAN_IDX = 3; // fiscal year starts Shrawan 1
const ASAR_IDX = 2;    // fiscal year ends the last day of the following year's Asar

export const BS_YEARS = Object.keys(dateConfigMap).map(Number).sort((a, b) => a - b);

export function daysInBsMonth(year, monthIdx) {
  return dateConfigMap[year]?.[BS_MONTHS[monthIdx]] || 30;
}

export function adToBsParts(adIso) {
  if (!adIso) return null;
  // Tolerate a full timestamp ("2026-09-15 14:32", "2026-09-15T14:32:00Z") as
  // well as a plain date. Bank transactions reach us as the former, and
  // splitting that on "-" used to leave "15 14:32" as the day — NaN, so the
  // date read as unusable and the row was dropped from year-based views.
  const [y, m, d] = String(adIso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  try {
    const nd = new NepaliDate(new Date(y, m - 1, d));
    return { year: nd.getYear(), month: nd.getMonth(), day: nd.getDate() };
  } catch {
    return null;
  }
}

export function bsPartsToAd(year, month, day) {
  try {
    const jsDate = new NepaliDate(year, month, day).toJsDate();
    const y = jsDate.getFullYear();
    const m = String(jsDate.getMonth() + 1).padStart(2, "0");
    const d = String(jsDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch {
    return null;
  }
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// e.g. fiscalYearLabel(2082) -> "2082/83"
export function fiscalYearLabel(startYear) {
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

// "2082/83" -> { startYear: 2082, endYear: 2083 }
export function parseFiscalYearLabel(label) {
  const startYear = Number(String(label).split("/")[0]);
  return { startYear, endYear: startYear + 1 };
}

// AD date range [startAD, endAD] (inclusive, ISO strings) covered by a fiscal year label
export function fiscalYearDateRangeAD(label) {
  const { startYear, endYear } = parseFiscalYearLabel(label);
  const startAD = bsPartsToAd(startYear, SHRAWAN_IDX, 1);
  const lastAsarDay = daysInBsMonth(endYear, ASAR_IDX);
  const endAD = bsPartsToAd(endYear, ASAR_IDX, lastAsarDay);
  return { startAD, endAD };
}

// The fiscal year label containing a given AD-ISO date (defaults to today)
export function fiscalYearForDate(adIso) {
  const parts = adToBsParts(adIso || todayIso());
  if (!parts) return null;
  const startYear = parts.month >= SHRAWAN_IDX ? parts.year : parts.year - 1;
  return fiscalYearLabel(startYear);
}

export function currentFiscalYear() {
  return fiscalYearForDate(todayIso()) || "";
}

// Fiscal years for a dropdown, most recent first
export function listFiscalYears({ back = 6, forward = 1 } = {}) {
  const { startYear: curStart } = parseFiscalYearLabel(currentFiscalYear());
  const years = [];
  for (let y = curStart + forward; y >= curStart - back; y--) years.push(fiscalYearLabel(y));
  return years;
}

// Does an AD-ISO date fall within the given fiscal year?
export function isDateInFiscalYear(adIso, label) {
  if (!adIso || !label) return false;
  const { startAD, endAD } = fiscalYearDateRangeAD(label);
  if (!startAD || !endAD) return false;
  return adIso >= startAD && adIso <= endAD;
}

// Cutoff date for "balance as of this fiscal year" (cumulative) views —
// the FY's own end date, or today if the FY is still in progress.
export function fiscalYearCutoffAD(label) {
  const { endAD } = fiscalYearDateRangeAD(label);
  const today = todayIso();
  if (!endAD) return today;
  return endAD < today ? endAD : today;
}

// "2082/83" <-> "2082-83" — the "/" needs escaping for use as a URL path segment.
export function fiscalYearToSlug(label) {
  return String(label).replace("/", "-");
}
export function slugToFiscalYear(slug) {
  const parts = String(slug).split("-");
  return parts.length === 2 ? `${parts[0]}/${parts[1]}` : slug;
}

// An AD-ISO date rendered in Bikram Sambat, e.g. "2025-07-17" -> "1 Shrawan 2082".
export function fmtDateBS(adIso) {
  const parts = adToBsParts(adIso);
  if (!parts) return "—";
  return `${parts.day} ${BS_MONTHS[parts.month]} ${parts.year}`;
}

// The same date in numeric BS form ("2082-04-01"), for compact secondary labels.
export function fmtDateBSNumeric(adIso) {
  const parts = adToBsParts(adIso);
  if (!parts) return null;
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/* ── Filtering records by fiscal year ─────────────────────────────────────
   Every finance page offers the same "which fiscal year?" choice, so the
   comparison lives here once. A record belongs to the year its own date falls
   in — decided on the Bikram Sambat calendar, never the Gregorian month. */

/** The filter value that means "no fiscal-year restriction". */
export const ALL_FISCAL_YEARS = "all";

export const EN_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/** Is this a fiscal-year label ("2082/83") rather than "all" or junk? */
export function isFiscalYearLabel(value) {
  return typeof value === "string" && /^\d{4}\/\d{2}$/.test(value);
}

/**
 * The calendar day of a stored date as "YYYY-MM-DD".
 *
 * Plain dates and "2026-09-15 14:32" style bank timestamps are cut down as they
 * are. A real timestamp (created_at, uploaded_at — UTC on the wire) is read in
 * the browser's own timezone instead, so something filed at 11pm in Kathmandu
 * does not slip into the previous day's fiscal year at a year boundary.
 */
export function isoDay(value) {
  if (!value) return null;
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (/^\d{4}-\d{2}-\d{2} /.test(value)) return value.slice(0, 10);
  }
  const d = tsDate(value);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The first of the month a payroll row is for, as an AD date — payroll stores a month name and a year, not a date. */
export function payrollPeriodDate(row) {
  const idx = EN_MONTHS.indexOf(row?.month);
  return row?.year && idx >= 0 ? `${row.year}-${String(idx + 1).padStart(2, "0")}-01` : null;
}

/**
 * A predicate over stored dates for one fiscal year.
 *
 * "all" (or nothing) accepts everything, undated rows included. A specific year
 * accepts only rows whose date lies inside it: a row with no usable date belongs
 * to no year, and is left out rather than filed under whichever is current.
 * The year's boundaries are worked out once, not per row.
 */
export function fiscalYearMatcher(label) {
  if (!isFiscalYearLabel(label)) return () => true;
  const { startAD, endAD } = fiscalYearDateRangeAD(label);
  if (!startAD || !endAD) return () => true;
  return (value) => {
    const day = isoDay(value);
    return !!day && day >= startAD && day <= endAD;
  };
}

/** Keep the rows whose date (read by `dateOf`) falls in the given fiscal year. */
export function filterByFiscalYear(rows, label, dateOf = (r) => r.date) {
  if (!Array.isArray(rows)) return [];
  if (!isFiscalYearLabel(label)) return rows;
  const match = fiscalYearMatcher(label);
  return rows.filter((r) => match(dateOf(r)));
}

/** Sort fiscal-year labels newest first. */
export function sortFiscalYearsDesc(labels) {
  return [...labels].sort((a, b) => parseFiscalYearLabel(b).startYear - parseFiscalYearLabel(a).startYear);
}

/**
 * The fiscal years these rows actually fall in, newest first — what a year
 * picker should offer, rather than a fixed window of years most of which are empty.
 * Dates are deduplicated before converting, since a year holds far fewer distinct
 * days than rows and each conversion goes through the Bikram Sambat tables.
 */
export function fiscalYearsIn(rows, dateOf = (r) => r.date) {
  const days = new Set();
  for (const r of rows || []) {
    const day = isoDay(dateOf(r));
    if (day) days.add(day);
  }
  const years = new Set();
  for (const day of days) {
    const fy = fiscalYearForDate(day);
    if (fy) years.add(fy);
  }
  return sortFiscalYearsDesc(years);
}

/** Merge several lists of fiscal-year labels into one, newest first, no repeats. */
export function mergeFiscalYears(...lists) {
  return sortFiscalYearsDesc(new Set(lists.flat().filter(isFiscalYearLabel)));
}

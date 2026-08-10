// Nepali (Bikram Sambat) fiscal-year helpers — backed by the exact BS<->AD
// conversion tables in "nepali-date-converter", not an approximation.
// A Nepali fiscal year runs Shrawan 1 -> next Ashar-end.
import NepaliDate, { dateConfigMap } from "nepali-date-converter";

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
  const [y, m, d] = adIso.split("-").map(Number);
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

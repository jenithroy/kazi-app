/**
 * Small pieces the purchase and expense copies share: how a date, an amount and a way of paying are written in them. Nothing heavy is
 * imported here, so an adapter that reads it stays light until the PDF maker is wanted.
 */
import { fmtField } from "../calendar";
import { fmtDateBS } from "../../utils/fiscalYear";
import { normaliseRegion, regionLabel } from "../../utils/region";

export const text = (v) => (v === undefined || v === null ? "" : String(v).trim());

/** The calendar day of a stored date: "2026-10-12" from "2026-10-12" or from a timestamp. */
const dayOf = (v) => text(v).slice(0, 10);

/** "12 Oct 2026": the short form, for a heading. Empty when there is no date. */
export const dateShort = (v) => fmtField(dayOf(v));

/** "12 Oct 2026 (26 Aswin 2083 B.S.)": the books are kept in Nepali dates and read in English ones, so a copy says both. */
export function dateText(v) {
  const ad = dateShort(v);
  if (!ad) return "";
  const bs = fmtDateBS(dayOf(v));
  return bs && bs !== "—" ? `${ad} (${bs} B.S.)` : ad;
}

/** A figure in lakh grouping ("1,35,600"), with paise only when there are some ("1,234.50"). */
export function num(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  const paise = Math.round(v * 100) % 100 !== 0;
  return v.toLocaleString("en-IN", { minimumFractionDigits: paise ? 2 : 0, maximumFractionDigits: 2 });
}

/** "Rs 1,35,600": the PDF's font has no rupee sign. */
export const money = (n) => `Rs ${num(n || 0)}`;

/** How it was paid, in the cards' words ("CASH" is how it is stored). */
export const paidBy = (type) => ({ CASH: "Cash", Cash: "Cash", Bank: "Bank", Credit: "Credit" }[text(type) || "CASH"] || text(type));

/** Which side of the business the record is filed under ("Nepal", "UK"), or nothing when it is not set. */
export function sideOf(row) {
  const r = normaliseRegion(row?.region);
  return r ? regionLabel(r) : "";
}

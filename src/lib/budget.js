/**
 * Budget & Requirements: every rule and sum the page uses, apart from the page itself.
 *
 * One table (budget_requests) holds two kinds of request:
 *   - a "requirement": something the office needs (an item, how many, a rough cost in rupees and/or pounds);
 *   - a "budget request": a sum in pounds for equipment, training, travel…, with the reason, numbered BR-079.
 * The old page kept them on two tabs and opened on the budget one, which has had a single (test) row since
 * May, while every request that was really waiting was on the other tab. The dashboard counts both. Here they
 * are one list, so the page and the dashboard say the same thing.
 *
 * Moved over from the old page unchanged: the BR numbering, the rupee/pound linkage on the form, how an amount
 * is read off a row of either kind, and who may decide.
 */
import { fromNPR, toNPR } from "../utils/currency";
import { kathmanduDate, tsMillis } from "../utils/date";
import { daysBetween, fmtDay, fmtShort } from "./sales";

export { fmtDay, fmtShort };

export const BUDGET_CATEGORIES = ["Equipment", "Materials", "Services", "Training", "Travel", "Other"];
export const REQ_CATEGORIES = ["Raw Materials", "Tools", "Machinery", "Office Supplies", "Safety Equipment", "Other"];
export const URGENCIES = ["Low", "Medium", "High"];

/** Who the page offers Approve and Reject to (the old page's rule; the database also needs Edit on Budget). */
export const DECIDER_ROLES = ["uk_admin", "nepal_admin", "super_admin"];

export const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/* ── What a row is ─────────────────────────────────────────────── */

export const isRequirement = (r) => r?.type === "requirement";
/** The old page's own test for a budget request: type "budget", or no type at all. */
export const isBudgetKind = (r) => r?.type === "budget" || !r?.type;

export function kindLabel(r) {
  if (isRequirement(r)) return "Requirement";
  if (isBudgetKind(r)) return "Budget request";
  return String(r?.type || "Request");
}

/** Waiting for a decision. The dashboard counts it exactly this way. */
export const isWaiting = (r) => r?.status === "Pending" || !r?.status;
export const isApproved = (r) => r?.status === "Approved";
export const isRejected = (r) => r?.status === "Rejected";

export function statusKey(r) {
  if (isWaiting(r)) return "waiting";
  if (isApproved(r)) return "approved";
  if (isRejected(r)) return "rejected";
  return "other";
}

export function statusLabel(r) {
  const k = statusKey(r);
  return k === "waiting" ? "Waiting" : k === "other" ? String(r.status) : r.status;
}

/** The tag tone for a status. */
export const statusTone = (r) => ({ waiting: "warn", approved: "good", rejected: "bad" }[statusKey(r)]);

/** "nepal_admin" is a role from before positions; read it as words. A position's name is left as it is. */
export function roleLabel(role) {
  const s = String(role || "").trim();
  if (!s) return "";
  if (!/^[a-z_]+$/.test(s)) return s;
  const text = s.split("_").map((w) => (w === "uk" ? "UK" : w)).join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* ── Urgency ───────────────────────────────────────────────────── */

const URGENCY_ORDER = { high: 0, medium: 1, low: 2 };
export const urgencyRank = (u) => URGENCY_ORDER[String(u || "").trim().toLowerCase()] ?? 3;
export const isUrgent = (r) => urgencyRank(r?.urgency) === 0;
/** Tag tone: High is the one that asks for attention. */
export const urgencyTone = (u) => ({ 0: "bad", 1: "warn" }[urgencyRank(u)]);
/** The word as the page writes it: a request raised from elsewhere may have sent "high". */
export const urgencyLabel = (u) => {
  const s = String(u || "").trim().toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Not said";
};

/* ── Money ─────────────────────────────────────────────────────── */

const positive = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * What a request asks for, read the way the old page read it:
 *   - a budget request keeps pounds in amountGBP (else amount) and rupees in amountNPR (else the pounds at the live rate);
 *   - a requirement keeps rupees in amountNPR and/or pounds in amount; either may be missing, both may be there.
 * `npr` is the rupees (what every sum adds up); `gbpNpr` is the stored pounds written as rupees, so a figure can be shown
 * exactly as it was typed when the page is in pounds (pounds worked out from rupees can land a penny off).
 * A request that names no amount returns null, and is never counted as nought rupees.
 */
export function requestAmount(r) {
  const gbp = positive(isRequirement(r) ? r?.amount : (r?.amountGBP ?? r?.amount));
  const npr = positive(r?.amountNPR) || (gbp ? Math.round(toNPR(gbp, "GBP")) : 0);
  if (!npr) return null;
  return { npr, gbpNpr: gbp ? toNPR(gbp, "GBP") : npr };
}

/** [the figure that leads, the one that follows]: rupees lead while the page is in rupees, otherwise the stored pounds do. */
export const leadFollow = (a, currency) => (currency !== "NPR" ? [a.gbpNpr, a.npr] : [a.npr, a.gbpNpr]);

/** What a list asks for added up, in rupees as the page's currency leads, and how many had no amount at all. */
export function sumRequests(rows, currency = "NPR") {
  let total = 0;
  let none = 0;
  for (const r of rows) {
    const a = requestAmount(r);
    if (!a) none += 1;
    else total += currency !== "NPR" ? a.gbpNpr : a.npr;
  }
  return { count: rows.length, total, none };
}

/** The pounds that go with rupees typed on the form (blank when there is nothing sensible to work out). */
export function nprToGbp(npr) {
  const v = parseFloat(npr);
  return (!npr || isNaN(v) || v <= 0) ? "" : fromNPR(v, "GBP").toFixed(2);
}

/* ── Dates ─────────────────────────────────────────────────────── */

const dayOf = (ts) => {
  const ms = tsMillis(ts);
  return ms ? kathmanduDate(ms) : "";
};

/** The Kathmandu calendar day a request was asked on, and the day it was decided. */
export const askedDay = (r) => dayOf(r?.createdAt);
export const decidedDay = (r) => dayOf(r?.reviewedAt);

/** Whole days since it was asked (null when the row has no date). */
export function ageDays(r, today) {
  const d = askedDay(r);
  if (!d) return null;
  const n = daysBetween(d, today);
  return Number.isNaN(n) ? null : Math.max(0, n);
}

export function agoLabel(days) {
  if (days == null) return "";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** The short form for a narrow row, where "ago" does not fit: "73 days". */
export function daysLabel(days) {
  if (days == null) return "";
  if (days === 0) return "today";
  return `${days} ${plural(days, "day")}`;
}

/* ── Finding, ordering, counting ───────────────────────────────── */

const haystack = (r) => [r.title, r.requestedBy, roleLabel(r.requestedByRole), r.category, r.notes, r.brId, r.quantity, kindLabel(r)]
  .filter(Boolean).join(" ").toLowerCase();

/** `status`: waiting | approved | rejected | all. `urgency`: "" or High | Medium | Low. `kind`: "" | budget | requirement. */
export function filterRequests(rows, { status = "all", urgency = "", kind = "", query = "" } = {}) {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (status !== "all" && statusKey(r) !== status) return false;
    if (urgency && String(r.urgency || "").toLowerCase() !== urgency.toLowerCase()) return false;
    if (kind === "requirement" && !isRequirement(r)) return false;
    if (kind === "budget" && isRequirement(r)) return false;
    if (q && !haystack(r).includes(q)) return false;
    return true;
  });
}

/**
 * The order a person wants them in: what is waiting first, the most urgent on top and, among those, the one that has
 * waited longest; then the decided ones, the latest decision first.
 */
export function orderRequests(rows) {
  return rows.slice().sort((a, b) => {
    const aw = isWaiting(a);
    const bw = isWaiting(b);
    if (aw !== bw) return aw ? -1 : 1;
    if (aw) return urgencyRank(a.urgency) - urgencyRank(b.urgency) || tsMillis(a.createdAt) - tsMillis(b.createdAt);
    return (tsMillis(b.reviewedAt) || tsMillis(b.createdAt)) - (tsMillis(a.reviewedAt) || tsMillis(a.createdAt));
  });
}

export function countRequests(rows) {
  const c = { waiting: 0, approved: 0, rejected: 0, all: rows.length };
  for (const r of rows) {
    const k = statusKey(r);
    if (k in c) c[k] += 1;
  }
  return c;
}

/** The four tiles' numbers. `currency` is the page's (see sumRequests). */
export function summarise(rows, today, currency = "NPR") {
  const waiting = orderRequests(rows.filter(isWaiting));
  let oldest = null;
  for (const r of waiting) {
    const days = ageDays(r, today);
    if (days != null && (!oldest || days > oldest.days)) oldest = { row: r, days };
  }
  return {
    waiting: sumRequests(waiting, currency),
    urgent: sumRequests(waiting.filter(isUrgent), currency),
    approved: sumRequests(rows.filter(isApproved), currency),
    rejected: rows.filter(isRejected).length,
    oldest,
  };
}

/* ── Asking ────────────────────────────────────────────────────── */

/** The next BR number: one company-wide run, taken over every budget request in every region (the old page's rule). */
export function nextBrId(rows) {
  const nums = rows.map((r) => parseInt((r.brId || "BR-000").replace("BR-", ""), 10)).filter((n) => !isNaN(n));
  return `BR-${String(nums.length ? Math.max(...nums) + 1 : 79).padStart(3, "0")}`;
}

/** A new, blank request form. Both kinds' fields live in it, so switching kind keeps what was typed. */
export function emptyForm(kind = "requirement", region = "nepal") {
  return {
    kind, title: "", category: kind === "budget" ? "Equipment" : "Raw Materials", urgency: "Medium", notes: "", region,
    quantity: "", amountNPR: "", amount: "",       // a requirement: how many, rupees, pounds
    amountGBP: "",                                 // a budget request: pounds
  };
}

/** What is wrong with the form, in words; null when it can be sent. (The old page leaned on the browser's `required`.) */
export function formProblem(f) {
  if (!f.title.trim()) return f.kind === "budget" ? "Say what the money is for." : "Say what is needed.";
  if (f.kind === "budget") {
    if (!(Number(f.amountGBP) > 0)) return "Enter the amount in pounds.";
    if (!f.notes.trim()) return "Say why it is needed.";
    return null;
  }
  if (!f.quantity.trim()) return "Say how many are needed (for example 50 units).";
  for (const v of [f.amountNPR, f.amount]) {
    if (v !== "" && !(Number.isFinite(Number(v)) && Number(v) >= 0)) return "The cost has to be a number.";
  }
  return null;
}

/**
 * The row to insert, built exactly as the old page built it for each kind. `rows` are the budget requests already there
 * (for the BR number), `profile` is who is asking. The one addition is `requested_by_id`, so the request is tied to the
 * person and not only to the name typed under it.
 */
export function buildPayload(f, { rows, region, profile }) {
  const who = {
    requestedBy: profile?.name || "Unknown",
    requestedByRole: profile?.displayRole || profile?.role || "",
    requested_by_id: profile?.personId ?? profile?.id ?? null,
  };
  if (f.kind === "budget") {
    const gbp = Number(f.amountGBP) || 0;
    return {
      type: "budget",
      brId: nextBrId(rows.filter(isBudgetKind)),
      region: f.region || region,
      title: f.title.trim(),
      category: f.category,
      amountGBP: gbp,
      amountNPR: Math.round(toNPR(gbp, "GBP")),
      amount: gbp,
      urgency: f.urgency,
      notes: f.notes.trim(),
      status: "Pending",
      ...who,
    };
  }
  return {
    type: "requirement",
    region: f.region || region,
    title: f.title.trim(),
    category: f.category,
    quantity: f.quantity.trim(),
    amountNPR: f.amountNPR ? Number(f.amountNPR) : null,
    amount: f.amount ? Number(f.amount) : null,
    urgency: f.urgency,
    notes: f.notes.trim(),
    status: "Pending",
    ...who,
  };
}

/* ── Deciding ──────────────────────────────────────────────────── */

export const decisionPatch = (status, reviewer, now = new Date()) => ({ status, reviewedBy: reviewer, reviewedAt: now.toISOString() });

/** Puts a request back to waiting, as if nobody had decided. */
export const UNDO_PATCH = { status: "Pending", reviewedBy: null, reviewedAt: null };

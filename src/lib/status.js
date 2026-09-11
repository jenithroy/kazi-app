/**
 * What colour a status is, decided once for the whole app.
 *
 * Tones are the kit's Pill tones, and each means one thing:
 *   mint     done, paid, present, approved: nothing left to do
 *   amber    waiting on someone: sent, part-paid, late, pending
 *   terra    needs attention, or refused: absent, overdue, rejected
 *   blue     a different kind of state rather than a warning: on leave
 *   neutral  not started, or no longer in play: draft, cancelled, inactive
 *
 * Before this each page kept its own map, and they disagreed: a Sent invoice
 * was amber on Billing and terra on Customers, and a Cancelled one red on
 * Billing and grey on Customers. Pages switch to these maps as they are
 * redesigned (REDESIGN.md §4.4).
 */
import { ORDER_STAGES } from "../constants/enums";

const STATUS_TONES = {
  // Invoices, challans and quotations
  Draft: "neutral",
  Estimated: "neutral",
  Sent: "amber",
  Dispatched: "amber",
  Partial: "amber",
  Paid: "mint",
  Delivered: "mint",
  Accepted: "mint",
  Overdue: "terra",
  Rejected: "terra",
  Cancelled: "neutral",

  // Attendance
  Present: "mint",
  Late: "amber",
  "Half-day": "neutral",
  Leave: "blue",
  Absent: "terra",

  // Staff
  Active: "mint",
  Inactive: "neutral",

  // Reviews: budget requests and samples
  Pending: "amber",
  "In Revision": "amber",
  Approved: "mint",
};

const STATUS_TONES_LOWER = Object.fromEntries(
  Object.entries(STATUS_TONES).map(([status, tone]) => [status.toLowerCase(), tone]),
);

/** The Pill tone for a record's status. A status nobody has mapped reads as neutral. */
export function statusTone(status, fallback = "neutral") {
  if (!status) return fallback;
  return STATUS_TONES[status] ?? STATUS_TONES_LOWER[String(status).toLowerCase()] ?? fallback;
}

/** How pressing a budget request or a task is. Three steps, three tones. */
const URGENCY_TONES = { high: "terra", medium: "amber", med: "amber", low: "neutral" };
export const urgencyTone = (level) => URGENCY_TONES[String(level || "").toLowerCase()] || "neutral";

/**
 * An order's delivery priority, which Production works out from the due date.
 * A different scale from urgency: its top step is Urgent and High is the middle
 * one, so High is amber here while it is terra on a budget request.
 */
const PRIORITY_TONES = { urgent: "terra", high: "amber", normal: "neutral" };
export const priorityTone = (label) => PRIORITY_TONES[String(label || "").toLowerCase()] || "neutral";

/* ── Production stages ───────────────────────────────────── */

// [colour token suffix, Pill tone]. The colour tells stages apart on a
// calendar or a bar; the tone says how far along the order is.
const STAGE_META = {
  "Order Received":       ["received", "neutral"],
  "Fabric Sourcing":      ["sourcing", "blue"],
  "Cutting":              ["cutting", "amber"],
  "Stitching":            ["stitching", "amber"],
  "Finishing & Pressing": ["finishing", "amber"],
  "Embellishment":        ["embellishment", "amber"],
  "Quality Check":        ["qc", "amber"],
  "Packing":              ["packing", "mint"],
  "Shipped":              ["shipped", "mint"],
  "Delivered":            ["delivered", "mint"],
};

/** The ten stages in order, each with its --stage-* token key and Pill tone. */
export const STAGES = ORDER_STAGES.map((name, index) => {
  const [key, tone] = STAGE_META[name] || ["received", "neutral"];
  return { name, index, key, tone };
});

const STAGE_BY_NAME = new Map(STAGES.map((s) => [s.name, s]));

/** CSS colour for a stage, as a token reference: `var(--stage-cutting)`. */
export const stageColor = (stage) => `var(--stage-${STAGE_BY_NAME.get(stage)?.key || "received"})`;

/** Pill tone for a stage. */
export const stageTone = (stage) => STAGE_BY_NAME.get(stage)?.tone || "neutral";

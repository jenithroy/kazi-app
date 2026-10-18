/**
 * The Production page's plain logic: how far along an order is, whether it is late, how the
 * list is ordered and filtered, what the tiles add up to and the numbers the order card shows.
 * Nothing here draws anything or talks to the database, so it can be reasoned about (and
 * tested) on its own.
 *
 * Words used throughout:
 *   open     an order still being made: status Active or On Hold
 *   closed   one that is finished or called off: Completed or Cancelled
 *   stage    where an order is in the ten steps (Order Received ... Delivered)
 *   today    always handed in, as the office's "YYYY-MM-DD" (Kathmandu), so every sum is repeatable
 */
import { ORDER_STAGES } from "../constants/enums";
import { addDays as addISODays, parseISO } from "./calendar";

/* ── Stages ────────────────────────────────────────────────────── */

export const STAGES = ORDER_STAGES;
export const LAST_STAGE = STAGES.length - 1;

/** The same stages in a few letters, for the narrow places (the pipeline strip, a phone). */
export const STAGE_SHORT = {
  "Order Received": "Received",
  "Fabric Sourcing": "Fabric",
  "Cutting": "Cutting",
  "Stitching": "Stitching",
  "Finishing & Pressing": "Finishing",
  "Embellishment": "Embellish",
  "Quality Check": "QC",
  "Packing": "Packing",
  "Shipped": "Shipped",
  "Delivered": "Delivered",
};

/**
 * Materials come out of stock when finished pieces leave Quality Check, not at Cutting: a piece
 * that is spoiled in stitching gets re-cut, and deducting at Cutting would mean entering that
 * fabric twice.
 */
export const MATERIALS_STAGE = "Quality Check";
export const STAGES_AWAITING_STOCK_DEDUCTION = ["Packing", "Shipped"];

/** An order in the Embellishment stage carries any combination of these, rather than moving through them one by one. */
export const EMBELLISHMENT_TYPES = ["Buttoning", "DTF", "Embroidery"];

export const FABRIC_TYPES = [
  "Terry Cotton", "Chinese Terry Fabric", "Rib Fabric", "Fleece", "Jersey",
  "Denim", "Linen", "Polyester Blend", "Other",
];

/** And in fewer still, for a strip that is only a few hundred pixels wide. */
export const STAGE_TINY = {
  "Order Received": "New",
  "Fabric Sourcing": "Fabric",
  "Cutting": "Cut",
  "Stitching": "Stitch",
  "Finishing & Pressing": "Finish",
  "Embellishment": "Emb.",
  "Quality Check": "QC",
  "Packing": "Pack",
  "Shipped": "Ship",
  "Delivered": "Done",
};

export const stageIndex = (stage) => STAGES.indexOf(stage);                        // -1 for a stage nobody knows
export const stageStep = (stage) => Math.max(0, stageIndex(stage));                // 0 to 9, never negative
/** 1 (just started) to 5 (out of the door): which step of the colour ramp a stage is painted in. */
export const rampOf = (stage) => Math.floor(stageStep(stage) / 2) + 1;
export const stageShort = (stage) => STAGE_SHORT[stage] || stage || "";
export const stageTiny = (stage) => STAGE_TINY[stage] || stage || "";

export const nextStageOf = (stage) => STAGES[stageIndex(stage) + 1] || null;
export const prevStageOf = (stage) => (stageIndex(stage) > 0 ? STAGES[stageIndex(stage) - 1] : null);

/* ── What happened at each stage ───────────────────────────────── */

const BACK = "↩ Reverted to ";        // "↩ Reverted to Cutting": how a step back is recorded in the history

/** Where a history entry led: the stage, and whether it was a step back to it. */
export function movedTo(entry) {
  const raw = String(entry?.stage || "");
  return raw.startsWith(BACK) ? { stage: raw.slice(BACK.length), back: true } : { stage: raw, back: false };
}

/**
 * Every stay of an order in one stage, read from its history (one entry per move: the stage it went to, the
 * day, who moved it). A stay says how the order came in (moved forward, or stepped back to it), who did it and
 * on what day, and where it went next and who moved it. `left` is null for the stay that is still going on.
 * An order that skipped the stage, or is older than the history, has no stays at all.
 */
export function stageVisits(history, stage) {
  const list = Array.isArray(history) ? history : [];
  const visits = [];
  list.forEach((h, i) => {
    const here = movedTo(h);
    if (here.stage !== stage) return;
    const next = list[i + 1];
    const after = next ? movedTo(next) : null;
    visits.push({
      date: h.date || "",
      by: h.by || "",
      back: here.back,
      left: next ? { date: next.date || "", by: next.by || "", to: after.stage, back: after.back } : null,
    });
  });
  return visits;
}

/** Whole days a stay lasted (until today while it goes on); null when either day is missing. */
export function daysInVisit(visit, today) {
  return dayDiff(visit.date, visit.left ? visit.left.date : today);
}

/* ── Status ────────────────────────────────────────────────────── */

/** Finished or called off. "Delivered" is not one of the four statuses the page writes, but the Dashboard counts it as finished, so it is here too. */
export const isClosed = (o) => o?.status === "Completed" || o?.status === "Cancelled" || o?.status === "Delivered";
/** Everything else is still on the floor, including a status nobody planned for: an order must never vanish from every list. */
export const isOpen = (o) => Boolean(o) && !isClosed(o);

/* ── Dates ─────────────────────────────────────────────────────── */

/** Whole days from one "YYYY-MM-DD" to another: negative when `to` is earlier; null if either is not a date. */
export function dayDiff(from, to) {
  const a = parseISO(from);
  const b = parseISO(to);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
/** "16 Oct" */
export function shortDate(iso) {
  const p = parseISO(iso);
  return p ? DAY.format(new Date(Date.UTC(p.y, p.m - 1, p.d))) : "";
}

/** Whole days from today to the delivery date: negative once it has passed, null when there is none. */
export const daysLeft = (order, today) => (order?.deliveryDate ? dayDiff(today, order.deliveryDate) : null);

export const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2 };
export const PRIORITY_LABEL = { urgent: "Urgent", high: "High", normal: "Normal" };

/** Urgent: due within 5 days (or already late). High: within 12. Anything else, and anything with no date, is normal. */
export function priorityOf(order, today) {
  const left = daysLeft(order, today);
  if (left == null) return "normal";
  if (left <= 5) return "urgent";
  if (left <= 12) return "high";
  return "normal";
}

/**
 * How an order's delivery date reads in a row.
 *   tone  "bad" late, "warn" due within 5 days, "none" no date, "" otherwise
 *   short the same words in fewer letters, for a narrow row
 */
export function dueInfo(order, today) {
  const left = daysLeft(order, today);
  if (left == null) return { date: "", note: "No date", short: "No date", tone: "none", left: null };
  const date = shortDate(order.deliveryDate);
  if (isClosed(order) || order.stage === "Delivered") return { date, note: "", short: "", tone: "", left };
  if (left < 0) {
    const n = -left;
    return { date, note: `${n} day${n === 1 ? "" : "s"} late`, short: `${n}d late`, tone: "bad", left };
  }
  if (left === 0) return { date, note: "Due today", short: "Today", tone: "warn", left };
  if (left === 1) return { date, note: "Tomorrow", short: "Tomorrow", tone: "warn", left };
  return { date, note: `in ${left} days`, short: `in ${left}d`, tone: left <= 5 ? "warn" : "", left };
}

/* ── Ordering the list ─────────────────────────────────────────── */

/** The number in "ORD-059", 0 when there is none. */
export function orderNumber(order) {
  const n = parseInt(String(order?.orderId || "").replace(/\D/g, ""), 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * The order a floor lead reads in: the most urgent first (late ones at the very top, the most late
 * first), then by due date, then the newest. An order with no date comes after those that have one.
 */
export function sortOpen(list, today) {
  const key = (o) => ({ p: PRIORITY_RANK[priorityOf(o, today)], d: o.deliveryDate && parseISO(o.deliveryDate) ? o.deliveryDate : "9999-99-99" });
  return [...list].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka.p - kb.p || ka.d.localeCompare(kb.d) || orderNumber(b) - orderNumber(a);
  });
}

/** Finished and called-off orders: the newest first. */
export function sortClosed(list) {
  return [...list].sort((a, b) => (b.date || "").localeCompare(a.date || "") || orderNumber(b) - orderNumber(a));
}

/* ── Filtering the list ────────────────────────────────────────── */

/** The quick filters the tiles apply to the list, and what the filter chip says. */
export const QUICK = {
  overdue: "Overdue",
  week: "Due this week",
  nodate: "No delivery date",
  hold: "On hold",
  stock: "Stock not deducted",
};

/** @param stockPending a Set of order ids whose materials have not been deducted yet */
export function matchesQuick(order, quick, today, stockPending) {
  if (!quick) return true;
  const left = daysLeft(order, today);
  if (quick === "overdue") return left != null && left < 0;
  if (quick === "week") return left != null && left >= 0 && left <= 7;
  if (quick === "nodate") return left == null;
  if (quick === "hold") return order.status === "On Hold";
  if (quick === "stock") return Boolean(stockPending?.has(order.id));
  return true;
}

const HAYSTACK = ["orderId", "customerName", "styleName", "fabricType", "colorway", "assignedTo", "invoiceRef", "sampleName"];
export function matchesQuery(order, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every((word) => HAYSTACK.some((k) => String(order[k] ?? "").toLowerCase().includes(word)));
}

/** The "This month" switch: an order counts when it was placed, or is due, in the month whose key ("2026-10") is given. */
export const inMonth = (order, monthKey) => (order.date || "").slice(0, 7) === monthKey || (order.deliveryDate || "").slice(0, 7) === monthKey;

/**
 * What the list shows.
 *   view   "open" (the working list) or "closed" (finished and called off)
 *   stage  one stage of the working list, or "" for all of it
 *   quick  one of QUICK, or ""
 */
export function selectOrders(orders, { view = "open", stage = "", query = "", quick = "", today, stockPending } = {}) {
  if (view === "closed") return sortClosed(orders.filter((o) => isClosed(o) && matchesQuery(o, query)));
  const rows = orders.filter((o) =>
    isOpen(o)
    && (!stage || o.stage === stage)
    && matchesQuick(o, quick, today, stockPending)
    && matchesQuery(o, query));
  return sortOpen(rows, today);
}

/* ── What the tiles add up to ──────────────────────────────────── */

const sum = (list, key) => list.reduce((s, o) => s + (Number(o[key]) || 0), 0);

/** How many open orders sit at each stage, how many are open in all, and how many are closed. */
export function pipelineCounts(orders) {
  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0]));
  let open = 0;
  let closed = 0;
  for (const o of orders) {
    if (isOpen(o)) {
      open += 1;
      if (o.stage in byStage) byStage[o.stage] += 1;
    } else if (isClosed(o)) {
      closed += 1;
    }
  }
  return { open, closed, byStage };
}

/** The four numbers of the "at a glance" tile. */
export function glance(orders, today) {
  const open = orders.filter(isOpen);
  const dated = open.filter((o) => daysLeft(o, today) != null);
  return {
    open: open.length,
    units: sum(open, "quantity"),
    value: sum(open, "totalValueNPR"),
    dueWeek: dated.filter((o) => { const d = daysLeft(o, today); return d >= 0 && d <= 7; }).length,
    overdue: dated.filter((o) => daysLeft(o, today) < 0).length,
    urgent: open.filter((o) => priorityOf(o, today) === "urgent").length,
    undated: open.length - dated.length,
  };
}

/** What wants someone's eyes: late orders (the most late first), orders on hold, and orders past QC whose materials were never deducted. */
export function attention(orders, today, stockPending) {
  const open = orders.filter(isOpen);
  const overdue = open
    .filter((o) => { const d = daysLeft(o, today); return d != null && d < 0; })
    .sort((a, b) => daysLeft(a, today) - daysLeft(b, today) || orderNumber(b) - orderNumber(a));
  const hold = open.filter((o) => o.status === "On Hold").sort((a, b) => orderNumber(b) - orderNumber(a));
  const stock = open.filter((o) => stockPending?.has(o.id)).sort((a, b) => orderNumber(b) - orderNumber(a));
  return { overdue, hold, stock, total: overdue.length + hold.length + stock.length };
}

/* ── The calendar ──────────────────────────────────────────────── */

/** Orders that have a delivery date, by that date. */
export function dueByDay(orders) {
  const map = new Map();
  for (const o of orders) {
    if (!o.deliveryDate || !parseISO(o.deliveryDate)) continue;
    if (!map.has(o.deliveryDate)) map.set(o.deliveryDate, []);
    map.get(o.deliveryDate).push(o);
  }
  return map;
}

/** How a day's orders spread over the five steps of the colour ramp: [n1, n2, n3, n4, n5]. */
export function rampMix(list) {
  const mix = [0, 0, 0, 0, 0];
  for (const o of list) mix[rampOf(o.stage) - 1] += 1;
  return mix;
}

/* ── One order's money ─────────────────────────────────────────── */

/**
 * What an order brings in and costs. `costs` is the order's row in order_costs (material, labour,
 * overhead, shipping), if anyone entered one. With no labour entered, labour is worked out from
 * last month's payroll per unit made (`labourRatePerUnit`, null when that is unknown) and flagged
 * `labourAuto`. `known` is true when there is anything to show besides the revenue.
 */
export function orderPnl(order, costs, labourRatePerUnit) {
  const c = costs || {};
  const revenue = Number(order.totalValueNPR || 0);
  const material = Number(c.material || 0);
  const manualLabour = c.labour != null && c.labour !== "";
  const autoLabour = !manualLabour && labourRatePerUnit ? Math.round(labourRatePerUnit * Number(order.quantity || 0)) : 0;
  const labour = manualLabour ? Number(c.labour) : autoLabour;
  const labourAuto = !manualLabour && autoLabour > 0;
  const overhead = Number(c.overhead || 0);
  const shipping = Number(c.shipping || 0);
  const totalCost = material + labour + overhead + shipping;
  const profit = revenue - totalCost;
  const margin = revenue > 0 ? Number(((profit / revenue) * 100).toFixed(1)) : null;
  return {
    revenue, material, labour, labourAuto, overhead, shipping, totalCost, profit, margin,
    known: totalCost > 0 || labourAuto,
  };
}

/* ── Numbering ─────────────────────────────────────────────────── */

const pad3 = (n) => String(n).padStart(3, "0");

/** "ORD-060": one more than the highest number in use. Pass every order of the company, both regions, so two arms never mint the same one. */
export function nextOrderNumber(orders) {
  const nums = orders.map((o) => parseInt((o.orderId || "ORD000").replace("ORD-", ""), 10)).filter((n) => !Number.isNaN(n));
  return `ORD-${pad3(nums.length ? Math.max(...nums) + 1 : 1)}`;
}

/** "INV-013": one more than the highest number in use. */
export function nextInvoiceNumber(invoices) {
  const nums = invoices.map((i) => parseInt((i.invoiceNumber || "INV000").replace("INV-", ""), 10)).filter((n) => !Number.isNaN(n));
  return `INV-${pad3(nums.length ? Math.max(...nums) + 1 : 1)}`;
}

/** The invoice an order already has, if any: one made from it, or the one its reference names. A cancelled one does not count, so a new one can be issued. */
export function invoiceOf(order, invoices) {
  return invoices.find((i) => !/^cancel/i.test(i.status || "")
    && ((i.linkedOrderId && i.linkedOrderId === order.id)
      || (order.invoiceRef && i.invoiceNumber && i.invoiceNumber === order.invoiceRef))) || null;
}

/** Thirty days on (a day's date, not a moment): the default due date of a new invoice. */
export const dueIn30 = (from, today) => addISODays(parseISO(from) ? from : today, 30);

/* ── Reading an invoice line back into an order ────────────────── */

/** "Hoodie — Terry Cotton (Black)" -> { styleName, fabricType, colorway }, for the "smart recommendation". */
export function parseInvoiceDescription(desc) {
  const firstLine = (desc || "").split("\n")[0] || "";
  let styleName = firstLine;
  let fabricType = "Terry Cotton";
  let colorway = "";

  const colorMatch = firstLine.match(/\(([^)]+)\)$/);
  let baseDesc = firstLine;
  if (colorMatch) {
    colorway = colorMatch[1];
    baseDesc = firstLine.replace(/\s*\([^)]+\)$/, "");
  }

  const parts = baseDesc.split(/\s*(?:—|-)\s*/);
  if (parts.length > 1) {
    styleName = parts[0].trim();
    const fabricCandidate = parts[1].trim();
    fabricType = FABRIC_TYPES.includes(fabricCandidate) ? fabricCandidate : "Other";
  } else {
    styleName = baseDesc.trim();
  }

  return { styleName, fabricType, colorway };
}

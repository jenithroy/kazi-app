/**
 * The Sales page's plain logic: where the orders are, what the customers owe, and how the lists
 * are searched and ordered. Nothing here draws anything or talks to the database, so it can be
 * reasoned about (and tested) on its own.
 *
 * Sales is the old Sales page (orders and the pipeline) and the old Customers page (customer ->
 * orders -> invoices -> payments) on one screen. `rollUp` below is Customers' roll-up carried over
 * unchanged, apart from one thing: it is handed "today" instead of reading the clock, so it is
 * repeatable.
 *
 * Words used throughout:
 *   open       an order still being made: any status but Completed, Cancelled or Delivered, on hold included
 *              (the Production page's meaning, which keeps a status nobody planned for on its lists too)
 *   stage      where an order is in the ten steps (Order Received ... Delivered)
 *   today      always handed in, as the office's (Kathmandu's) "YYYY-MM-DD", so every sum is repeatable
 *   row        a customer with everything that belongs to them added up (see rollUp)
 *
 * Two honesty rules from the Customers page still hold:
 *   - Margin is only shown where costs were actually entered. `order_costs` is filled in by hand
 *     in Finance, and where it is empty the margin is unknowable, not 100%.
 *   - Payments carried over from before payment history was kept have no real date (`isOpening`),
 *     so they are never folded into how-fast-do-they-pay averages.
 */
import { ORDER_STAGES } from "../constants/enums";
import { toNPR } from "../utils/currency";

/* ── Stages ────────────────────────────────────────────────────── */

/** The steps an open order can be at: every stage but the last (a Delivered order is finished). */
export const PIPE_STAGES = ORDER_STAGES.filter((s) => s !== "Delivered");

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

/** And in the fewest letters, for a strip squeezed into a narrow window. */
export const STAGE_TINY = {
  "Order Received": "Rec",
  "Fabric Sourcing": "Fabric",
  "Cutting": "Cut",
  "Stitching": "Stitch",
  "Finishing & Pressing": "Finish",
  "Embellishment": "Embell",
  "Quality Check": "QC",
  "Packing": "Pack",
  "Shipped": "Ship",
  "Delivered": "Done",
};

export const stageShort = (stage) => STAGE_SHORT[stage] || stage || "";
export const stageTiny = (stage) => STAGE_TINY[stage] || stageShort(stage);

/** 1 (just started) to 5 (out of the door): which step of the colour ramp a stage is painted in. */
export const stageRamp = (stage) => Math.floor(Math.max(0, ORDER_STAGES.indexOf(stage)) / 2) + 1;

/* ── Dates ─────────────────────────────────────────────────────── */

const DAY = 86400000;

/** Whole days since 1970 for a "YYYY-MM-DD" (NaN when it is not one). Calendar days, so a clock change cannot move it. */
function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY : NaN;
}

/** Whole days from one date to another; negative when `to` is earlier. */
export const daysBetween = (from, to) => Math.round(dayNumber(to) - dayNumber(from));

/** "18 Oct 2026". A date that is not one reads "—". A calendar day, so no time zone can move it. */
export function fmtDay(iso) {
  const n = dayNumber(iso);
  if (Number.isNaN(n)) return "—";
  return new Date(n * DAY).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "18 Oct": the form a list wants. */
export function fmtShort(iso) {
  const n = dayNumber(iso);
  if (Number.isNaN(n)) return "—";
  return new Date(n * DAY).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/* ── Orders ────────────────────────────────────────────────────── */

/** Done with. Everything else is still on the floor, a status nobody planned for included (as Production counts it): an order must not vanish from every list. */
const CLOSED = new Set(["Completed", "Cancelled", "Delivered"]);
export const isOpen = (o) => Boolean(o) && !CLOSED.has(o.status);
export const isDelivered = (o) => o?.stage === "Delivered";

/** Newest first, the way the old "Recent orders" ordered them. */
export const newestFirst = (orders) =>
  [...orders].sort((a, b) => (b.date || b.createdAt || "").localeCompare(a.date || a.createdAt || ""));

/**
 * The day an order reached Delivered. The order's stage history knows; an order with none falls back
 * to its own date, which is what this page always used to go by.
 */
export function deliveredOn(order) {
  const history = Array.isArray(order?.stageHistory) ? order.stageHistory : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.stage === "Delivered" && history[i].date) return String(history[i].date).slice(0, 10);
  }
  return order?.date || "";
}

/**
 * What the pipeline strip and its note say: how many orders are open (and on hold), how many pieces
 * that is, how many orders came in over the last seven days (today and the six before), and how many
 * were delivered this calendar month.
 */
export function orderSums(orders, today) {
  const open = orders.filter(isOpen);
  const now = dayNumber(today);
  const month = String(today).slice(0, 7);
  return {
    open: open.length,
    onHold: open.filter((o) => o.status === "On Hold").length,
    units: open.reduce((s, o) => s + Number(o.quantity || 0), 0),
    newThisWeek: orders.filter((o) => {
      const age = now - dayNumber(o.date);
      return age >= 0 && age < 7;
    }).length,
    deliveredThisMonth: orders.filter((o) => isDelivered(o) && deliveredOn(o).slice(0, 7) === month).length,
  };
}

/**
 * Open orders by stage: one cell per stage in order, and `other` for an open order at a stage nobody
 * has listed, so the cells always add up to what the note above them says.
 */
export function stageCounts(orders) {
  const open = orders.filter(isOpen);
  const cells = PIPE_STAGES.map((stage) => ({ stage, n: open.filter((o) => o.stage === stage).length }));
  const other = open.length - cells.reduce((s, c) => s + c.n, 0);
  return { cells, other, open: open.length };
}

/**
 * The orders a view of the list shows: "open", "delivered" or "all", narrowed to one stage if one is
 * chosen and to the ones a search finds (by customer, style, order number, colour or fabric).
 */
export function ordersFor(orders, view, stage, query = "") {
  let list = orders;
  if (view === "open") list = orders.filter(isOpen);
  else if (view === "delivered") list = orders.filter(isDelivered);
  if (stage) list = list.filter((o) => o.stage === stage);
  const q = query.trim().toLowerCase();
  if (q) {
    list = list.filter((o) => [o.customerName, o.styleName, o.orderId, o.colorway, o.fabricType]
      .some((v) => String(v || "").toLowerCase().includes(q)));
  }
  return newestFirst(list);
}

/**
 * What an order's date column (and its card) says: the date that matters, a few words on it, and whether the
 * order is late. A delivered order says when it was delivered; an open one says when it is due, or that it is
 * late by so many days, or that it has no due date; one that is neither open nor delivered (cancelled) says nothing.
 */
export function orderWhen(order, today) {
  if (isDelivered(order)) return { date: fmtShort(deliveredOn(order)), iso: deliveredOn(order), note: "delivered", late: false };
  if (!isOpen(order)) return { date: "—", iso: "", note: "", late: false };
  const due = order.deliveryDate || order.dueDate;
  if (!due) return { date: "—", iso: "", note: "no due date", late: false };
  const days = daysBetween(due, today);
  if (days > 0) return { date: fmtShort(due), iso: due, note: `${days} ${days === 1 ? "day" : "days"} late`, late: true };
  return { date: fmtShort(due), iso: due, note: days === 0 ? "due today" : "due", late: false };
}

/**
 * The invoice an order was billed on: the one made from it, else the one its `invoiceRef` names. Null when there is none.
 * A cancelled invoice does not count (as in Production). A number is not unique (they start again each financial year), so
 * a number that several invoices carry goes to the order's own customer and never to somebody else's; of several of the
 * same customer's, the one raised nearest the order's date. When that cannot be told, nothing is guessed.
 */
export function invoiceForOrder(order, invoices) {
  if (!order) return null;
  const live = invoices.filter((i) => !/^cancel/i.test(i.status || ""));
  const linked = live.find((i) => i.linkedOrderId && String(i.linkedOrderId) === String(order.id));
  if (linked) return linked;
  const ref = String(order.invoiceRef || "").trim().toLowerCase();
  if (!ref) return null;
  const named = live.filter((i) => String(i.invoiceNumber || "").trim().toLowerCase() === ref);
  const who = order.customer_id;
  const pool = who ? named.filter((i) => !i.customerId || i.customerId === who) : named;      // another customer's invoice is never theirs
  const own = who ? pool.filter((i) => i.customerId === who) : [];
  const pick = own.length ? own : pool;
  if (pick.length <= 1) return pick[0] || null;
  const gap = (i) => { const g = Math.abs(daysBetween(order.date, i.date)); return Number.isNaN(g) ? Infinity : g; };
  const ranked = pick.map((i) => ({ i, g: gap(i) })).sort((a, b) => (a.g === b.g ? 0 : a.g < b.g ? -1 : 1));
  return ranked[0].g < ranked[1].g ? ranked[0].i : null;      // a tie, or no dates to go by, is not guessed
}

/* ── Customers: roll-up ────────────────────────────────────────── */

/**
 * One pass over each collection, bucketed by customer id, rather than a filter per customer per
 * collection: this runs on every render that touches the region switch or the search box.
 *
 * Invoice money is stored in the invoice's own currency (total_npr holds pounds on a GBP invoice).
 * Everything here is compared across customers, so it is normalised to rupees first (toNPR, at the
 * live rate). A payment's own amountNPR is not used: the database view assumes GBP or NPR only, so a
 * payment is converted from its invoice's currency.
 */
export function rollUp({ customers, orders, invoices, payments, orderCosts }, today) {
  const byId = new Map(customers.map((c) => [c.id, {
    ...c,
    orders: [], invoices: [], payments: [],
    units: 0, orderValueNPR: 0,
    invoicedNPR: 0, collectedNPR: 0, outstandingNPR: 0, overdueNPR: 0,
    costNPR: 0, costedRevenueNPR: 0, hasCosts: false,
    lastPaidOn: null, payDays: [],
  }]));

  for (const o of orders) {
    const c = byId.get(o.customer_id);
    if (!c) continue;
    c.orders.push(o);
    c.units += Number(o.quantity || 0);
    c.orderValueNPR += Number(o.totalValueNPR || 0);

    // Costs are keyed by the human order ref (ORD-051), not the uuid: see migration 0025.
    const cost = orderCosts[o.orderId] || orderCosts[o.id];
    if (cost) {
      const total = Number(cost.material || 0) + Number(cost.labour || 0)
                  + Number(cost.overhead || 0) + Number(cost.shipping || 0);
      if (total > 0) {
        c.hasCosts = true;
        c.costNPR += total;
        c.costedRevenueNPR += Number(o.totalValueNPR || 0);
      }
    }
  }

  for (const i of invoices) {
    const c = byId.get(i.customerId);
    if (!c) continue;
    c.invoices.push(i);
    // A cancelled invoice is not revenue and not a debt.
    if (i.status === "Cancelled") continue;
    const total = toNPR(i.totalNPR, i.currency);
    const paid = toNPR(i.amountPaid, i.currency);
    c.invoicedNPR += total;
    const owed = Math.max(0, total - paid);
    c.outstandingNPR += owed;
    if (owed > 0.5 && i.dueDate && i.dueDate < today) c.overdueNPR += owed;
  }

  const invById = new Map(invoices.map((i) => [i.id, i]));

  for (const p of payments) {
    const c = byId.get(p.customerId);
    if (!c) continue;
    c.payments.push(p);
    c.collectedNPR += toNPR(p.amount, p.invoiceCurrency);
    if (p.isOpening) continue;               // no real date to learn from
    if (!c.lastPaidOn || p.paidOn > c.lastPaidOn) c.lastPaidOn = p.paidOn;
    const inv = invById.get(p.invoiceId);
    if (inv?.date && p.paidOn >= inv.date) c.payDays.push(daysBetween(inv.date, p.paidOn));
  }

  return [...byId.values()].map((c) => {
    c.payments.sort((a, b) => (b.paidOn || "").localeCompare(a.paidOn || ""));
    c.invoices.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    c.orders.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    c.marginNPR = c.hasCosts ? c.costedRevenueNPR - c.costNPR : null;
    c.marginPct = c.hasCosts && c.costedRevenueNPR > 0
      ? (c.marginNPR / c.costedRevenueNPR) * 100 : null;
    c.collectedPct = c.invoicedNPR > 0
      ? Math.min(100, (c.collectedNPR / c.invoicedNPR) * 100) : 0;
    c.avgDaysToPay = c.payDays.length
      ? Math.round(c.payDays.reduce((s, d) => s + d, 0) / c.payDays.length) : null;
    c.isActive = c.orders.length > 0 || c.invoices.length > 0;
    return c;
  });
}

/** What the three money tiles say: the rows added up. */
export function customerTotals(rows) {
  const t = rows.reduce((a, c) => ({
    invoiced: a.invoiced + c.invoicedNPR,
    collected: a.collected + c.collectedNPR,
    outstanding: a.outstanding + c.outstandingNPR,
    overdue: a.overdue + c.overdueNPR,
    pipeline: a.pipeline + c.orderValueNPR,
  }), { invoiced: 0, collected: 0, outstanding: 0, overdue: 0, pipeline: 0 });
  t.collectRate = t.invoiced > 0 ? (t.collected / t.invoiced) * 100 : 0;
  t.withCosts = rows.filter((c) => c.hasCosts).length;
  t.active = rows.filter((c) => c.isActive).length;
  return t;
}

/**
 * Invoices a customer cannot be traced from: not cancelled, and not linked to any customer in `rows`'
 * world (the page counts customers' invoices only, so these are the ones its totals leave out).
 */
export function unlinkedInvoices(invoices) {
  const loose = invoices.filter((i) => !i.customerId && i.status !== "Cancelled");
  return { n: loose.length, npr: loose.reduce((s, i) => s + toNPR(i.totalNPR, i.currency), 0) };
}

/**
 * Rupees invoiced in each of the last `months` calendar months, oldest first, from the customers'
 * invoices that count (a cancelled one is not revenue). `label` is the month's short name.
 */
export function invoicedByMonth(rows, today, months = 6) {
  const y = Number(String(today).slice(0, 4));
  const m = Number(String(today).slice(5, 7)) - 1;
  const slots = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(y, m - (months - 1 - i), 1));
    return {
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
      npr: 0,
    };
  });
  const at = new Map(slots.map((s) => [s.key, s]));
  for (const c of rows) {
    for (const i of c.invoices) {
      if (i.status === "Cancelled") continue;
      const slot = at.get(String(i.date || "").slice(0, 7));
      if (slot) slot.npr += toNPR(i.totalNPR, i.currency);
    }
  }
  return slots;
}

/* ── Customers: finding and ordering ───────────────────────────── */

export const SORTS = {
  invoiced: { label: "Revenue", get: (c) => c.invoicedNPR },
  collected: { label: "Collected", get: (c) => c.collectedNPR },
  outstanding: { label: "Owed", get: (c) => c.outstandingNPR },
  margin: { label: "Margin", get: (c) => c.marginPct ?? -Infinity },
  recent: { label: "Last paid", get: (c) => c.lastPaidOn || "" },
  name: { label: "Name", get: (c) => (c.name || "").toLowerCase() },
};

/** The customers a search and the "owing" switch leave in, ordered by the chosen column (a name A to Z, the rest biggest first). */
export function visibleCustomers(rows, { query = "", onlyOwing = false, sortKey = "invoiced" } = {}) {
  const q = query.trim().toLowerCase();
  let list = rows;
  if (q) {
    list = list.filter((c) =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.contactPerson || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.city || "").toLowerCase().includes(q));
  }
  if (onlyOwing) list = list.filter((c) => c.outstandingNPR > 0.5);
  const get = (SORTS[sortKey] || SORTS.invoiced).get;
  return [...list].sort((a, b) => {
    const av = get(a);
    const bv = get(b);
    if (typeof av === "string") return sortKey === "name" ? av.localeCompare(bv) : bv.localeCompare(av);
    return bv - av;
  });
}

/** Up to two capitals from a name: "F.L.Y Clothing" -> "FC". */
export const initialsOf = (name) => (name || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

/* ── Customers: what a form saves ──────────────────────────────── */

export const EMPTY_CUSTOMER = {
  name: "", city: "", address: "",
  contactPerson: "", email: "", phone: "", notes: "", region: "",
  sourceCampaignId: "",
};

/** A form's starting values: the customer's own fields only (a row carries its sums and lists too, which are not the form's). */
export function customerForm(customer, region) {
  if (!customer) return { ...EMPTY_CUSTOMER, region };
  const form = {};
  for (const key of Object.keys(EMPTY_CUSTOMER)) form[key] = customer[key] ?? "";
  return form;
}

/**
 * What goes to the database: the form's fields, trimmed. A region left on "not set" and a campaign left
 * unchosen are saved as nothing (the database only accepts "uk", "nepal" or no region at all).
 */
export function customerPayload(form) {
  const text = (v) => String(v ?? "").trim();
  return {
    name: text(form.name),
    city: text(form.city),
    address: text(form.address),
    contactPerson: text(form.contactPerson),
    email: text(form.email),
    phone: text(form.phone),
    notes: text(form.notes),
    region: form.region === "uk" || form.region === "nepal" ? form.region : null,
    sourceCampaignId: form.sourceCampaignId || null,
  };
}

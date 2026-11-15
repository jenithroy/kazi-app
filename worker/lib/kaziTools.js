/**
 * What Kazi can look up. Read-only, and every lookup runs as the person asking.
 *
 * Each tool is one question about the business, answered from the same `fs_*` views the pages read. They are fetched with the asker's
 * own session token (see `makeRest` in kazi.js), so row-level security decides what comes back: someone whose position cannot see money
 * gets no invoices, however the question is worded. Kazi never holds a key of its own. Where a PAGE hides more than the database does
 * (Tasks narrows staff to their own tasks in the browser only), the lookup applies the page's rule too: Kazi must not show more than the
 * screen it stands in for.
 *
 * Nothing here writes, and nothing here returns payroll, salaries or the bank. (Only the columns a lookup needs are requested from the
 * roster and the customer list; the other views are read whole into the Worker's memory and only the fields below leave it.) The first
 * cut is orders and the floor, stock, money owed by customers, attendance and tasks.
 *
 * The rules are the pages' own, so a number agrees with the screen it came from:
 *   open / late / stage       src/lib/production.js (imported, it is plain logic)
 *   stock balance and level   src/lib/inventory.js: opening + in - out, "low" at or under the reorder level. Not imported, because that
 *                             file pulls in the browser's database client; the sum is a few lines, kept here, and scripts/kazi-selftest.mjs
 *                             checks it against the real file.
 *   money owed                what is left on each invoice (total less paid). A cancelled invoice is not a debt (src/lib/sales.js rollUp), and
 *                             nor is a DRAFT: it has not been issued (the dashboards leave drafts out too, src/pages/dash/shared.jsx).
 *                             Amounts stay in each invoice's own currency; the live exchange rate lives in the browser, not here.
 *   attendance                Present, Late and Half-day are all AT WORK (src/lib/attendance.js daySummary). A PAST day with a clock-in and
 *                             no clock-out counts as Absent ("No clock-out", effectiveRecord): nothing says the day was worked through.
 *
 * Everything a person or a customer typed (names, notes, titles) is cut short and flattened to one line before it goes to the model:
 * it is information about the business, and the less room it has the less it can pretend to be an instruction.
 *
 * `ctx` is `{ today, rest, who, capped }`: today as the office's "YYYY-MM-DD" (Kathmandu), `rest(view, query)` which returns every row,
 * who is asking (`{ personId, fullName, tier, tasksCanEdit }`), and a list the reader fills with the views it could not read in full.
 */
import { STAGES, dayDiff, isOpen } from "../../src/lib/production.js";

const MAX_LIST = 40;
const DEFAULT_LIST = 20;
/** One answer never goes back to the model longer than this many characters (it would cost a lot and add nothing). */
const MAX_RESULT_CHARS = 14000;

const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (v) => Math.round(num(v) * 100) / 100;
const pickLimit = (v) => Math.min(MAX_LIST, Math.max(1, Math.trunc(num(v)) || DEFAULT_LIST));
const contains = (haystack, needle) => lower(haystack).includes(lower(needle));
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(text(s));
/** Free text from a person: one line, cut short. */
const free = (v, n = 80) => {
  const t = text(v).replace(/\s+/g, " ");
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const NO_ROWS = "No rows came back. There may be none, or this person's role may not be allowed to see them.";

const NPR_FORMAT = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const OTHER_FORMAT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
/** An amount as it is written on the screens: Rs 1,20,000 (the Nepali grouping) for rupees, £1,200 for pounds. Never converts. */
export function moneyText(amount, currency = "NPR") {
  const n = num(amount);
  if (!currency || currency === "NPR") return `Rs ${NPR_FORMAT.format(n)}`;
  if (currency === "GBP") return `£${OTHER_FORMAT.format(n)}`;
  return `${currency} ${OTHER_FORMAT.format(n)}`;
}

const KATHMANDU_TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kathmandu" });
const clock = (iso) => {
  const t = Date.parse(text(iso));
  return Number.isFinite(t) ? KATHMANDU_TIME.format(new Date(t)) : null;
};

/** "YYYY-MM-DD" in Kathmandu for an instant (the office's day). */
export function kathmanduToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(now);
}

/* ── Orders ────────────────────────────────────────────────────── */

const daysToDue = (o, today) => (o.deliveryDate ? dayDiff(today, o.deliveryDate) : null);
const isLate = (o, today) => isOpen(o) && Boolean(o.deliveryDate) && o.deliveryDate < today;

function orderRow(o, today) {
  const d = daysToDue(o, today);
  return {
    order_no: text(o.orderId),
    customer: free(o.customerName),
    style: free(o.styleName),
    colorway: free(o.colorway) || undefined,
    quantity: num(o.quantity),
    stage: text(o.stage),
    status: text(o.status),
    order_date: text(o.date) || undefined,
    delivery_date: text(o.deliveryDate) || null,
    days_to_delivery: d,                      // negative = days late
    late: isLate(o, today),
    value_npr: money(o.totalValueNPR),
    value_text: moneyText(o.totalValueNPR),
  };
}

async function ordersOverview(_input, { today, rest }) {
  const rows = await rest("fs_orders");
  if (!rows.length) return { as_of: today, note: NO_ROWS };
  const open = rows.filter(isOpen);
  const late = open.filter((o) => isLate(o, today));
  const dueSoon = open.filter((o) => {
    const d = daysToDue(o, today);
    return d !== null && d >= 0 && d <= 7;
  });
  const byStage = STAGES.map((stage) => ({ stage, orders: open.filter((o) => o.stage === stage).length }));
  const other = open.length - byStage.reduce((s, c) => s + c.orders, 0);
  if (other > 0) byStage.push({ stage: "(another stage)", orders: other });
  const openValue = open.reduce((s, o) => s + num(o.totalValueNPR), 0);
  return {
    as_of: today,
    open_orders: open.length,
    on_hold: open.filter((o) => o.status === "On Hold").length,
    late: late.length,
    due_in_next_7_days: dueSoon.length,
    open_without_due_date: open.filter((o) => !o.deliveryDate).length,
    pieces_in_progress: open.reduce((s, o) => s + num(o.quantity), 0),
    value_of_open_orders_npr: money(openValue),
    value_of_open_orders_text: moneyText(openValue),
    open_by_stage: byStage.filter((c) => c.orders > 0),
    most_late: late
      .map((o) => ({ order_no: text(o.orderId), customer: free(o.customerName), stage: text(o.stage), days_late: -daysToDue(o, today) }))
      .sort((a, b) => b.days_late - a.days_late)
      .slice(0, 5),
  };
}

async function listOrders(input, { today, rest }) {
  const rows = await rest("fs_orders");
  if (!rows.length) return { as_of: today, orders: [], note: NO_ROWS };
  const view = ["open", "closed", "all"].includes(input.view) ? input.view : "open";
  let list = rows;
  if (view === "open") list = list.filter(isOpen);
  else if (view === "closed") list = list.filter((o) => !isOpen(o));
  if (text(input.stage)) list = list.filter((o) => contains(o.stage, input.stage));
  if (text(input.customer)) list = list.filter((o) => contains(o.customerName, input.customer));
  if (text(input.search)) {
    list = list.filter((o) => [o.orderId, o.styleName, o.colorway, o.fabricType, o.customerName].some((v) => contains(v, input.search)));
  }
  if (input.late_only === true) list = list.filter((o) => isLate(o, today));
  const within = Math.trunc(num(input.due_within_days));
  if (input.due_within_days !== undefined && input.due_within_days !== null && within >= 0) {
    list = list.filter((o) => {
      const d = daysToDue(o, today);
      return isOpen(o) && d !== null && d <= within;          // includes the late ones: they are due "within" any window
    });
  }
  const newest = input.sort === "newest" || view === "closed";
  list = [...list].sort(newest
    ? (a, b) => text(b.date || b.createdAt).localeCompare(text(a.date || a.createdAt))
    : (a, b) => text(a.deliveryDate || "9999").localeCompare(text(b.deliveryDate || "9999")));
  const limit = pickLimit(input.limit);
  return {
    as_of: today,
    matching: list.length,
    shown: Math.min(limit, list.length),
    orders: list.slice(0, limit).map((o) => orderRow(o, today)),
  };
}

async function getOrder(input, { today, rest }) {
  const q = text(input.order);
  if (!q) throw new Error("Which order? Give an order number such as ORD-051.");
  const rows = await rest("fs_orders");
  const exact = rows.filter((o) => lower(o.orderId) === lower(q));
  const found = exact.length ? exact : rows.filter((o) => contains(o.orderId, q) || contains(o.styleName, q));
  if (!found.length) return { as_of: today, found: 0, note: rows.length ? `No order matches "${free(q, 40)}".` : NO_ROWS };
  if (found.length > 1) {
    return { as_of: today, found: found.length, note: "Several orders match; ask which one.", candidates: found.slice(0, 8).map((o) => orderRow(o, today)) };
  }
  const o = found[0];
  const history = (Array.isArray(o.stageHistory) ? o.stageHistory : []).slice(-12);
  const notes = (Array.isArray(o.notesList) ? o.notesList : []).slice(-8);
  return {
    as_of: today,
    ...orderRow(o, today),
    fabric: free(o.fabricType) || undefined,
    price_per_pc_npr: money(o.pricePerPcNPR),
    price_per_pc_text: moneyText(o.pricePerPcNPR),
    invoice_ref: text(o.invoiceRef) || undefined,
    assigned_to: Array.isArray(o.assignedTo) ? o.assignedTo.map((x) => free(x, 60)).filter(Boolean) : free(o.assignedTo, 60) || undefined,
    embellishments: o.embellishments || undefined,
    order_note: free(o.notes, 160) || undefined,
    stage_history: history.map((h) => ({ stage: text(h.stage), date: text(h.date).slice(0, 10), by: free(h.by, 60) })),
    notes: notes.map((n) => ({ by: free(n.by, 60), text: free(n.text, 160) })),
  };
}

/* ── Stock ─────────────────────────────────────────────────────── */

/** Same sum as src/lib/inventory.js (`movementIndex`, `stockRow`, `stockState`); scripts/kazi-selftest.mjs compares the two. */
export function stockFigures(items, movements) {
  const idx = new Map();
  for (const m of movements) {
    const e = idx.get(m.itemId) || { inTotal: 0, outTotal: 0 };
    if (m.direction === "in") e.inTotal += num(m.qty);
    else if (m.direction === "out") e.outTotal += num(m.qty);
    idx.set(m.itemId, e);
  }
  return items.map((row) => {
    const t = idx.get(row.id) || { inTotal: 0, outTotal: 0 };
    const opening = num(row.openingStock);
    const closing = opening + t.inTotal - t.outTotal;
    const min = num(row.minLevel);
    const low = closing <= min;
    const state = closing < 0 ? "negative" : closing === 0 ? "out" : low ? "low" : "ok";
    return { row, opening, inTotal: t.inTotal, outTotal: t.outTotal, closing, low, state };
  });
}

const SEVERITY = { negative: 0, out: 1, low: 2, ok: 3 };

function stockLine(f) {
  return {
    item: free(f.row.item),
    item_ref: text(f.row.itemId) || undefined,
    category: free(f.row.category) || undefined,
    unit: text(f.row.unit) || undefined,
    in_stock: Math.round(f.closing * 1000) / 1000,
    reorder_level: num(f.row.minLevel),
    state: f.state,
    supplier: free(f.row.supplier) || undefined,
    unit_cost_npr: money(f.row.unitCostNPR) || undefined,
    unit_cost_text: num(f.row.unitCostNPR) ? moneyText(f.row.unitCostNPR) : undefined,
  };
}

async function listStock(input, { today, rest }) {
  const [items, movements] = await Promise.all([rest("fs_inventory"), rest("fs_stock_movements", {}, { maxPages: 60 })]);
  if (!items.length) return { as_of: today, items: [], note: NO_ROWS };
  let list = stockFigures(items, movements);
  const counts = { negative: 0, out: 0, low: 0, ok: 0 };
  for (const f of list) counts[f.state] += 1;
  const want = ["attention", "all", "low", "out", "negative"].includes(input.state) ? input.state : "attention";
  if (want === "attention") list = list.filter((f) => f.state !== "ok");
  else if (want !== "all") list = list.filter((f) => f.state === want);
  if (text(input.search)) list = list.filter((f) => [f.row.item, f.row.itemId, f.row.supplier, f.row.color, f.row.category].some((v) => contains(v, input.search)));
  if (text(input.category)) list = list.filter((f) => contains(f.row.category, input.category));
  list = [...list].sort((a, b) => SEVERITY[a.state] - SEVERITY[b.state] || a.closing - b.closing || text(a.row.item).localeCompare(text(b.row.item)));
  const limit = pickLimit(input.limit);
  return {
    as_of: today,
    items_in_total: items.length,
    count_by_state: counts,
    matching: list.length,
    shown: Math.min(limit, list.length),
    items: list.slice(0, limit).map(stockLine),
  };
}

async function getStockItem(input, { today, rest }) {
  const q = text(input.item);
  if (!q) throw new Error("Which item? Give a name or an item code.");
  const [items, movements] = await Promise.all([rest("fs_inventory"), rest("fs_stock_movements", {}, { maxPages: 60 })]);
  if (!items.length) return { as_of: today, note: NO_ROWS };
  const exact = items.filter((r) => lower(r.itemId) === lower(q) || lower(r.item) === lower(q));
  const found = exact.length ? exact : items.filter((r) => [r.item, r.itemId, r.color].some((v) => contains(v, q)));
  if (!found.length) return { as_of: today, found: 0, note: `No stock item matches "${free(q, 40)}".` };
  if (found.length > 1) {
    const figs = stockFigures(found.slice(0, 8), movements);
    return { as_of: today, found: found.length, note: "Several items match; ask which one.", candidates: figs.map(stockLine) };
  }
  const [f] = stockFigures(found, movements);
  const recent = movements
    .filter((m) => m.itemId === f.row.id)
    .sort((a, b) => text(b.date).localeCompare(text(a.date)) || text(b.createdAt).localeCompare(text(a.createdAt)))
    .slice(0, 15);
  return {
    as_of: today,
    ...stockLine(f),
    opening_stock: f.opening,
    total_in: f.inTotal,
    total_out: f.outTotal,
    location: free(f.row.location) || undefined,
    recent_movements: recent.map((m) => ({ date: text(m.date), direction: text(m.direction), qty: num(m.qty), source: text(m.source) || undefined, note: free(m.note, 120) || undefined })),
  };
}

/* ── Money owed ────────────────────────────────────────────────── */

async function moneyOwed(input, { today, rest }) {
  const [invoices, customers] = await Promise.all([rest("fs_invoices"), rest("fs_customers")]);
  if (!invoices.length) return { as_of: today, note: NO_ROWS };
  const nameOf = new Map(customers.map((c) => [c.id, free(c.name)]));
  const groups = new Map();
  const drafts = {};
  for (const inv of invoices) {
    const status = lower(inv.status);
    if (status.startsWith("cancel")) continue;                                  // a cancelled invoice is not a debt
    const currency = text(inv.currency) || "NPR";
    if (status === "draft") {                                                   // nor is a draft: it has not been issued
      const d = drafts[currency] || { count: 0, total: 0 };
      d.count += 1;
      d.total += num(inv.totalNPR);
      drafts[currency] = d;
      continue;
    }
    const owed = Math.max(0, num(inv.totalNPR) - num(inv.amountPaid));          // (the amounts are in the invoice's own currency)
    if (owed <= 0.5) continue;
    const who = nameOf.get(inv.customerId) || free(inv.clientName) || "(no customer on the invoice)";
    const key = `${inv.customerId || who}|${currency}`;
    const g = groups.get(key) || { customer: who, currency, outstanding: 0, overdue: 0, open_invoices: 0, oldest_due_date: null };
    g.outstanding += owed;
    g.open_invoices += 1;
    const due = text(inv.dueDate);
    if (due && due < today) g.overdue += owed;
    if (due && (!g.oldest_due_date || due < g.oldest_due_date)) g.oldest_due_date = due;
    groups.set(key, g);
  }
  let list = [...groups.values()];
  if (text(input.customer)) list = list.filter((g) => contains(g.customer, input.customer));
  if (input.overdue_only === true) list = list.filter((g) => g.overdue > 0.5);
  list.sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding);
  const totals = {};
  for (const g of list) {
    const t = totals[g.currency] || { outstanding: 0, overdue: 0 };
    t.outstanding += g.outstanding;
    t.overdue += g.overdue;
    totals[g.currency] = t;
  }
  for (const c of Object.keys(totals)) {
    const t = totals[c];
    totals[c] = { outstanding: money(t.outstanding), outstanding_text: moneyText(t.outstanding, c), overdue: money(t.overdue), overdue_text: moneyText(t.overdue, c) };
  }
  const limit = pickLimit(input.limit);
  const out = {
    as_of: today,
    note: "Amounts are in each invoice's own currency (NPR or GBP, not converted); use the _text versions as written. Overdue means unpaid and past the due date. Cancelled and draft invoices are not counted.",
    customers_matching: list.length,
    totals_by_currency: totals,
    shown: Math.min(limit, list.length),
    customers: list.slice(0, limit).map((g) => ({
      customer: g.customer,
      currency: g.currency,
      outstanding: money(g.outstanding),
      outstanding_text: moneyText(g.outstanding, g.currency),
      overdue: money(g.overdue),
      overdue_text: moneyText(g.overdue, g.currency),
      open_invoices: g.open_invoices,
      oldest_due_date: g.oldest_due_date,
      days_past_due: g.oldest_due_date && g.oldest_due_date < today ? dayDiff(g.oldest_due_date, today) : 0,
    })),
  };
  if (!text(input.customer) && Object.keys(drafts).length) {
    out.draft_invoices_not_counted = Object.fromEntries(Object.entries(drafts).map(([c, d]) => [c, { count: d.count, total_text: moneyText(d.total, c) }]));
  }
  return out;
}

/* ── Attendance ────────────────────────────────────────────────── */

async function attendanceToday(input, { today, rest }) {
  const date = isDate(input.date) ? text(input.date) : today;
  const [records, punches, people] = await Promise.all([
    rest("fs_attendance", { date: `eq.${date}` }),
    rest("fs_clock_ins", { date: `eq.${date}` }),
    rest("fs_employees"),
  ]);
  if (!records.length && !punches.length) return { date, note: `No attendance or clock-in records for ${date}, or this person's role may not be allowed to see them.` };
  const nameOf = new Map(people.map((p) => [p.id, free(p.name)]));
  const recordOf = new Map(records.map((r) => [r.person_id, r]));
  const punchOf = new Map(punches.map((p) => [p.person_id, p]));
  const past = date < today;
  const rows = [];
  for (const id of new Set([...recordOf.keys(), ...punchOf.keys()])) {
    const rec = recordOf.get(id) || null;
    const punch = punchOf.get(id) || null;
    // a PAST day with a clock-in and no clock-out is Absent, unless a person set the record by hand (src/lib/attendance.js effectiveRecord)
    const byClock = !rec || rec.loggedBy === "GPS";
    const missed = past && byClock && Boolean(punch?.clockedInAt) && !punch?.clockedOutAt;
    rows.push({
      name: nameOf.get(id) || free(rec?.staffName ?? punch?.staffName) || "(unknown)",
      status: missed ? "Absent" : text(rec?.status) || (punch?.clockedInAt ? "Present" : ""),
      lateMinutes: num(rec?.lateMinutes),
      note: missed ? "No clock-out" : free(rec?.note, 80),
      missed,
    });
  }
  const marked = { Present: 0, Late: 0, "Half-day": 0, Leave: 0, Absent: 0 };
  for (const r of rows) if (r.status in marked) marked[r.status] += 1;
  const named = (status) => rows.filter((r) => r.status === status).slice(0, MAX_LIST);
  return {
    date,
    people_with_a_record: rows.length,
    at_work: marked.Present + marked.Late + marked["Half-day"],          // Present, Late and Half-day are all at work
    marked,
    late: named("Late").map((r) => ({ name: r.name, minutes: r.lateMinutes || undefined, note: r.note || undefined })),
    half_day: named("Half-day").map((r) => r.name),
    on_leave: named("Leave").map((r) => r.name),
    absent: named("Absent").map((r) => ({ name: r.name, note: r.note || undefined })),
    clocked_in_count: punches.length,
    still_clocked_in: past ? undefined : punches.filter((p) => !p.clockedOutAt).length,
    clocked_in: punches.slice(0, MAX_LIST).map((p) => ({ name: nameOf.get(p.person_id) || free(p.staffName) || "(unknown)", in: clock(p.clockedInAt), out: clock(p.clockedOutAt) })),
    note: past
      ? "For a past day, a clock-in with no clock-out counts as Absent (No clock-out). Someone who can see only their own attendance gets only their own rows."
      : "Late and Half-day people are at work. Someone who can see only their own attendance gets only their own rows.",
  };
}

/* ── Tasks ─────────────────────────────────────────────────────── */

const isDone = (t) => lower(t.status) === "done";
const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, normal: 2, low: 3 };

async function listTasks(input, { today, rest, who = {} }) {
  const all = await rest("fs_tasks");
  if (!all.length) return { as_of: today, tasks: [], note: NO_ROWS };
  // The Tasks page shows staff only their own tasks (in the browser; the database returns every row to anyone who may open Tasks), so Kazi
  // does the same unless the person is a director or has been given Tasks edit rights.
  const everyone = num(who.tier) >= 3 || who.tasksCanEdit === true;
  const mine = (t) => (who.personId && t.assignee_id === who.personId) || (who.fullName && lower(t.assignee) === lower(who.fullName));
  let list = all.filter((t) => !isDone(t) && !t.archivedAt && (everyone || mine(t)));
  const openTotal = list.length;
  const overdue = list.filter((t) => text(t.dueDate) && text(t.dueDate) < today).length;
  if (text(input.assignee)) list = list.filter((t) => contains(t.assignee, input.assignee));
  if (text(input.search)) list = list.filter((t) => [t.title, t.description, t.orderRef, t.customer].some((v) => contains(v, input.search)));
  if (input.overdue_only === true) list = list.filter((t) => text(t.dueDate) && text(t.dueDate) < today);
  list = [...list].sort((a, b) => text(a.dueDate || "9999").localeCompare(text(b.dueDate || "9999"))
    || (PRIORITY_RANK[lower(a.priority)] ?? 2) - (PRIORITY_RANK[lower(b.priority)] ?? 2));
  const limit = pickLimit(input.limit);
  return {
    as_of: today,
    scope: everyone ? "everyone's tasks" : "this person's own tasks only (their role)",
    open_tasks: openTotal,
    overdue,
    matching: list.length,
    shown: Math.min(limit, list.length),
    tasks: list.slice(0, limit).map((t) => ({
      title: free(t.title, 120),
      status: text(t.status),
      priority: text(t.priority) || undefined,
      assignee: free(t.assignee, 60) || undefined,
      due_date: text(t.dueDate) || null,
      days_to_due: text(t.dueDate) ? dayDiff(today, t.dueDate) : null,
      order: text(t.orderRef) || undefined,
      customer: free(t.customer) || undefined,
    })),
  };
}

/* ── The list the model is given ───────────────────────────────── */

const none = { type: "object", properties: {}, additionalProperties: false };
const STAGE_NAMES = STAGES.join(", ");

export const TOOLS = [
  {
    name: "orders_overview",
    status: "Checking the orders…",
    description:
      "The state of the production floor today: open orders, on hold, late, due in the next 7 days, pieces in progress, the total value of open orders, open orders per stage, and the most-late orders. Use it first for broad questions (\"how are we doing\", \"what is late\", \"how busy are we\").",
    input_schema: none,
    run: ordersOverview,
  },
  {
    name: "list_orders",
    status: "Looking through the orders…",
    description:
      `List orders, soonest delivery first (newest first for closed ones). Filter by view, stage, customer, a search word, late only, or due within N days. Stages in order: ${STAGE_NAMES}. days_to_delivery is negative when the order is late. Use get_order for one order's history and notes.`,
    input_schema: {
      type: "object",
      properties: {
        view: { type: "string", enum: ["open", "closed", "all"], description: "open (default) = still being made, including on hold; closed = completed, cancelled or delivered." },
        stage: { type: "string", description: "One production stage, e.g. Cutting." },
        customer: { type: "string", description: "Part of a customer's name." },
        search: { type: "string", description: "Part of an order number, style, colour or fabric." },
        late_only: { type: "boolean", description: "Only open orders past their delivery date." },
        due_within_days: { type: "integer", description: "Open orders due within this many days from today (late ones included)." },
        sort: { type: "string", enum: ["due", "newest"], description: "due (default) or newest." },
        limit: { type: "integer", description: `How many to return, at most ${MAX_LIST}. Default ${DEFAULT_LIST}.` },
      },
      additionalProperties: false,
    },
    run: listOrders,
  },
  {
    name: "get_order",
    status: "Opening the order…",
    description: "One order in full: customer, style, quantity, value, stage, dates, who it is assigned to, its stage history (who moved it and when) and its notes. Takes an order number such as ORD-051 (or part of a style name).",
    input_schema: {
      type: "object",
      properties: { order: { type: "string", description: "The order number, e.g. ORD-051." } },
      required: ["order"],
      additionalProperties: false,
    },
    run: getOrder,
  },
  {
    name: "list_stock",
    status: "Checking the stock…",
    description:
      "Stock items with their balance against the reorder level. By default only the ones needing attention (below zero, out, or at/under the reorder level), worst first. state: attention (default), low, out, negative or all. Also returns how many items are in each state.",
    input_schema: {
      type: "object",
      properties: {
        state: { type: "string", enum: ["attention", "low", "out", "negative", "all"] },
        search: { type: "string", description: "Part of an item name, code, colour or supplier." },
        category: { type: "string", description: "e.g. Fabric, Thread & Accessories, Packaging." },
        limit: { type: "integer", description: `At most ${MAX_LIST}. Default ${DEFAULT_LIST}.` },
      },
      additionalProperties: false,
    },
    run: listStock,
  },
  {
    name: "get_stock_item",
    status: "Looking up the stock item…",
    description: "One stock item: balance, reorder level, supplier, and its last 15 movements (in/out, quantity, what it was for). Takes a name or item code.",
    input_schema: {
      type: "object",
      properties: { item: { type: "string", description: "Item name or code." } },
      required: ["item"],
      additionalProperties: false,
    },
    run: getStockItem,
  },
  {
    name: "money_owed",
    status: "Adding up what customers owe…",
    description:
      "What customers still owe on invoices: per customer, the outstanding amount (total less what is paid), the part that is overdue, open invoices and the oldest due date, biggest overdue first, plus totals. Cancelled and draft invoices are not counted (drafts are listed separately). Amounts are in each invoice's own currency and are not converted; every amount also comes as a ready-written _text.",
    input_schema: {
      type: "object",
      properties: {
        customer: { type: "string", description: "Part of a customer's name." },
        overdue_only: { type: "boolean", description: "Only customers with something past its due date." },
        limit: { type: "integer", description: `At most ${MAX_LIST}. Default ${DEFAULT_LIST}.` },
      },
      additionalProperties: false,
    },
    run: moneyOwed,
  },
  {
    name: "attendance_today",
    status: "Checking attendance…",
    description:
      "Who is in: attendance for a day. Present, Late and Half-day people are all at work (at_work); Leave and Absent are not. Lists who was late (with minutes), on half-day, on leave and absent, and who has clocked in, with times. Defaults to today. For a past day a clock-in with no clock-out counts as Absent. A person whose role sees only their own attendance gets only their own rows.",
    input_schema: {
      type: "object",
      properties: { date: { type: "string", description: "A day as YYYY-MM-DD. Default today." } },
      additionalProperties: false,
    },
    run: attendanceToday,
  },
  {
    name: "list_tasks",
    status: "Looking at the tasks…",
    description: "Open tasks (not done, not archived), soonest due first: title, status, priority, who it is for, due date, and any order or customer it belongs to. Also how many are open and how many are overdue. Directors see everyone's tasks; others see only their own.",
    input_schema: {
      type: "object",
      properties: {
        assignee: { type: "string", description: "Part of a person's name." },
        search: { type: "string", description: "Part of a title, order number or customer." },
        overdue_only: { type: "boolean" },
        limit: { type: "integer", description: `At most ${MAX_LIST}. Default ${DEFAULT_LIST}.` },
      },
      additionalProperties: false,
    },
    run: listTasks,
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** The definitions as the model's API takes them (no function, no status line). */
export const toolDefinitions = () => TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

/** The words the chat shows while this lookup runs. */
export const statusFor = (name) => BY_NAME.get(name)?.status || "Looking that up…";

/**
 * The answer as JSON that is still valid when it is too long: whole rows are dropped from the end of the longest list (and it says so),
 * never half a row, so the model can read what is left.
 */
export function fit(data, limit = MAX_RESULT_CHARS) {
  let json = JSON.stringify(data);
  if (json.length <= limit) return json;
  const copy = { ...data };
  const lists = Object.keys(copy).filter((k) => Array.isArray(copy[k]) && copy[k].length > 1);
  for (const k of lists) copy[k] = [...copy[k]];
  let dropped = 0;
  while (json.length > limit) {
    const longest = lists.reduce((a, b) => (copy[b].length > copy[a].length ? b : a), lists[0]);
    if (!longest || copy[longest].length <= 1) break;
    copy[longest].pop();
    dropped += 1;
    copy.left_out = `${dropped} more row${dropped === 1 ? "" : "s"} were left out because the answer was too long: ask for fewer rows or a narrower filter`;
    json = JSON.stringify(copy);
  }
  return json.length <= limit ? json : JSON.stringify({ error: "The answer was too long to return. Ask for fewer rows or a narrower filter." });
}

/**
 * Run one lookup. Never throws: a failure comes back as `{ ok: false, error }` for the model to read (and say plainly), so one bad
 * lookup cannot end the conversation. Two kinds are told apart: a refusal by the database (403: this role may not see it) reads as the
 * person not being allowed, and an expired session (401) is `expired: true`, which the caller turns into "sign in again", not into a
 * sentence about their role.
 */
export async function runTool(name, input, ctx) {
  const tool = BY_NAME.get(name);
  if (!tool) return { ok: false, error: `There is no lookup called ${name}.` };
  try {
    const data = await tool.run(input && typeof input === "object" ? input : {}, ctx);
    if (ctx.capped?.length && data && typeof data === "object") {
      data.incomplete = `Too many rows to read in full from ${[...new Set(ctx.capped)].join(", ")}: the figures may be incomplete.`;
    }
    return { ok: true, json: fit(data) };
  } catch (err) {
    if (err?.status === 401) return { ok: false, expired: true, error: "The session has expired." };
    const denied = err?.status === 403 || err?.code === "42501";
    return {
      ok: false,
      error: denied
        ? "This person's role is not allowed to see that information."
        : `The lookup failed: ${String(err?.message || err).slice(0, 200)}`,
    };
  }
}

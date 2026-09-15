/**
 * The usage log — writing it, and reading it back for the Usage & Activity page.
 *
 * Like lib/chat.js this deliberately bypasses lib/db.js. That shim exists to
 * translate the `fs_*` compatibility views into the camelCase shapes the
 * Firestore-era pages expect; `activity_events` was designed for Postgres and
 * has no such view, so the shim would only be indirection.
 *
 * Two rules govern everything here:
 *
 *   1. Logging must never break the thing being logged. Every write is
 *      fire-and-forget behind a try/catch, and a failure switches logging off
 *      for the rest of the session rather than retrying into a wall. A usage
 *      metric is worth exactly zero interruptions to somebody raising an
 *      invoice.
 *
 *   2. The client says WHAT happened; the database says WHO did it. The insert
 *      carries no person_id — a trigger stamps it from app_person_id() and
 *      overwrites anything sent (migration 0032). So nothing here needs the
 *      caller's identity, and nothing here can be used to write history under
 *      someone else's name.
 *
 * The verbs written today, which the aggregates in 0032 count on:
 *
 *   view     opened a page. Carries duration_ms once they leave it.
 *   sign_in  first load of a browser session.
 *   create   a new row saved                (from lib/db.js)
 *   update   an existing row changed        (from lib/db.js)
 *   save     an upsert — created or changed, the API cannot tell which
 *   delete   a row removed                  (from lib/db.js)
 */

import { supabase } from "../supabase";

/** The section the Usage & Activity page itself belongs to. */
export const USAGE_SECTION = "usage_analytics";

/**
 * Route → section id. The same mapping RequireSection uses to gate the route,
 * because "which page is this" has to have one answer, not two.
 *
 * Longest prefix wins, so /finance/2081-82 is still Finance.
 */
const ROUTE_SECTIONS = [
  ["/dashboard",  "dashboard"],
  ["/tasks",      "tasks"],
  ["/attendance", "attendance"],
  ["/production", "production"],
  ["/qc",         "quality_control"],
  ["/inventory",  "inventory"],
  ["/sales",      "sales"],
  ["/finance",    "finance"],
  ["/purchases",  "purchases"],
  ["/billing",    "billing"],
  ["/content",    "budget"],
  ["/employees",  "employees"],
  // Roles & Duties took over the old /directors page. The section id stays
  // `directors` because activity_events.section_id is a foreign key into
  // sections — the path moved, the row it points at did not.
  ["/roles",      "directors"],
  ["/customers",  "customers"],
  ["/marketing",  "marketing"],
  ["/messenger",  "messenger"],
  ["/admin",      "admin"],
  ["/usage",      USAGE_SECTION],
  ["/bug-report", "bug_report"],
  ["/changelog",  "changelog"],
];

/** Which section a path belongs to, or null for one we do not track. */
export function sectionForPath(pathname = "") {
  const p = String(pathname || "");
  let best = null;
  for (const [prefix, section] of ROUTE_SECTIONS) {
    if ((p === prefix || p.startsWith(`${prefix}/`)) &&
        (!best || prefix.length > best[0].length)) {
      best = [prefix, section];
    }
  }
  return best ? best[1] : null;
}

/**
 * Which page a write belongs to, and what to call the thing written.
 *
 * Keyed by the collection names lib/db.js takes, so instrumenting the data
 * layer once covers every save in the app — no page has to remember to log
 * anything. A collection missing from here is simply not logged; that is the
 * right default for counters, points ledgers and other bookkeeping nobody
 * would call "using a feature".
 */
const WRITE_TARGETS = {
  invoices:          ["billing",         "Invoice"],
  quotations:        ["billing",         "Quotation"],
  challans:          ["billing",         "Challan"],
  payments:          ["billing",         "Payment"],
  orders:            ["production",      "Order"],
  order_costs:       ["production",      "Order costing"],
  order_assignments: ["production",      "Dispatch assignment"],
  samples:           ["production",      "Sample"],
  production:        ["production",      "Production batch"],
  processes:         ["production",      "Process"],
  stage_config:      ["production",      "Stage setup"],
  qc_logs:           ["quality_control", "QC check"],
  tasks:             ["tasks",           "Task"],
  task_columns:      ["tasks",           "Task column"],
  attendance:        ["attendance",      "Attendance record"],
  clock_ins:         ["attendance",      "Clock-in"],
  inventory:         ["inventory",       "Stock item"],
  stock_movements:   ["inventory",       "Stock movement"],
  fabrics:           ["library",         "Fabric"],
  patterns:          ["library",         "Pattern"],
  product_costs:     ["library",         "Product cost"],
  customers:         ["customers",       "Customer"],
  employees:         ["employees",       "Employee"],
  users:             ["employees",       "Employee"],
  finance_expenses:  ["finance",         "Expense"],
  finance_payroll:   ["finance",         "Payroll run"],
  finance_purchases: ["purchases",       "Purchase"],
  journal_entries:   ["finance",         "Journal entry"],
  vat_bills:         ["finance",         "VAT bill"],
  bank_transactions: ["finance",         "Bank transaction"],
  unit_economics:    ["finance",         "Unit economics"],
  accounts:          ["accounting",      "Account"],
  budget_requests:   ["budget",          "Budget request"],
  content:           ["content",         "Content post"],
  content_calendar:  ["content",         "Calendar entry"],
  messages:          ["messenger",       "Message"],
  positions:              ["admin", "Role"],
  sections:               ["admin", "Page"],
  position_permissions:   ["admin", "Permission"],
  position_finance_tabs:  ["admin", "Finance tab permission"],
};

/**
 * Off after the first failure.
 *
 * The realistic causes — a token that resolves to no person, the table not
 * migrated yet on someone's stale build — are all permanent for the session.
 * Retrying each of them once per click would turn a silent non-feature into a
 * stream of console noise and wasted round trips.
 */
let enabled = true;

function disable(where, err) {
  enabled = false;
  console.warn(`activity log off for this session (${where}): ${err?.message || err}`);
}

/**
 * Record one event. Never throws, never awaits anything the caller needs.
 *
 * Returns the new row's id when the caller may want to come back and fill in
 * how long the visit lasted, and null otherwise.
 */
export async function logActivity({ section = null, action, target = null, detail = null, path = null }) {
  if (!enabled || !action) return null;
  try {
    const { data, error } = await supabase
      .from("activity_events")
      .insert({
        section_id: section,
        action,
        target,
        detail: detail || {},
        path,
      })
      .select("id")
      .single();
    if (error) { disable(action, error); return null; }
    return data?.id || null;
  } catch (err) {
    disable(action, err);
    return null;
  }
}

/** Fill in how long a page view lasted. Silent on failure — see the header. */
export async function closeActivity(id, durationMs) {
  if (!enabled || !id || !Number.isFinite(durationMs) || durationMs <= 0) return;
  try {
    await supabase
      .from("activity_events")
      .update({ duration_ms: Math.min(Math.round(durationMs), 12 * 60 * 60 * 1000) })
      .eq("id", id);
  } catch {
    // A dwell time is the most disposable data in the app. If it does not
    // land, the view is still recorded; nothing is worth reporting here.
  }
}

/**
 * Called by lib/db.js after every successful write.
 *
 * Deliberately not awaited there: a save must not wait on its own bookkeeping.
 */
export function logWrite(collection, action, id) {
  const entry = WRITE_TARGETS[collection];
  if (!entry) return;
  const [section, target] = entry;
  logActivity({
    section,
    action,
    target,
    detail: { collection, ...(id ? { id: String(id) } : {}) },
    path: typeof window === "undefined" ? null : window.location?.pathname || null,
  });
}

/* ==================================================================== */
/*  Reading it back                                                      */
/* ==================================================================== */

/** ISO timestamp `days` ago, or null for "everything". */
export function sinceDays(days) {
  if (!days) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * The raw feed, newest first.
 *
 * Bounded because it is a feed, not an export: nobody scrolls past a few
 * hundred rows, and the charts read the rolled-up view instead of this one.
 */
export async function fetchActivityFeed({ since = null, limit = 500 } = {}) {
  let q = supabase
    .from("activity_feed")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (since) q = q.gte("created_at", since);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * Usage rolled up per person, per page, per Kathmandu day.
 *
 * What every chart on the page is built from. Thirteen people across two dozen
 * pages is at most a few hundred rows a month, so a year fits comfortably in
 * one request — which is the entire point of aggregating in the database.
 */
export async function fetchUsageDaily({ since = null } = {}) {
  let q = supabase
    .from("activity_usage_daily")
    .select("*")
    .order("day", { ascending: true });
  if (since) q = q.gte("day", since.slice(0, 10));

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * Push a callback whenever anyone logs anything.
 *
 * `activity_events` is published to realtime (migration 0032) and realtime
 * applies the same RLS as a read, so this only ever fires for events the
 * viewer could have queried anyway.
 */
export function subscribeActivity(onChange) {
  const channel = supabase
    .channel(`kazi:activity:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_events" }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

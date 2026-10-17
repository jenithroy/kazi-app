/**
 * The usage log — writing it, for both this app and the web app to read back.
 *
 * Ported from the reference app's `src/lib/activity.js`. `activity_events` is
 * a real Postgres table, not a Firestore collection that was migrated, so —
 * like `admin-panel/supabase.ts` — this goes straight at it rather than
 * through a `fs_*` compat view.
 *
 * Two rules carried over unchanged from the reference:
 *
 *   1. Logging must never break the thing being logged. Every write is
 *      fire-and-forget behind a try/catch, and a failure switches logging off
 *      for the rest of the session rather than retrying into a wall.
 *
 *   2. The client says WHAT happened; the database says WHO did it. The
 *      insert carries no person_id — a trigger stamps it from app_person_id()
 *      and overwrites anything sent (migration 0032). So nothing here needs
 *      the caller's identity.
 *
 * The verbs written, which `activity_usage_daily` counts on:
 *
 *   view     opened a page. Carries duration_ms once they leave it.
 *   sign_in  first load of an app session.
 *   create   a new row saved      (from `lib/supabase/write.ts`)
 *   update   an existing row changed (from `lib/supabase/write.ts`)
 *   save     an upsert — created or changed, the API cannot tell which
 *   delete   a row removed        (from `lib/supabase/write.ts`)
 *
 * Mobile and the web app write into the exact same table with the exact same
 * section ids and verbs, so the Usage & Activity report reads as one picture
 * of the ERP regardless of which client somebody used.
 */

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/** The section `usage_analytics` itself belongs to, for its own page view. */
export const USAGE_SECTION = 'usage_analytics';

/**
 * Route prefix → Postgres `sections.id`, mirroring the reference app's
 * `ROUTE_SECTIONS` / `sectionForPath`. Longest-prefix wins, so `/module/tasks`
 * doesn't fall through to some shorter unrelated prefix.
 *
 * Deliberately independent of `auth/permissions.ts`'s `SectionId` (the nav /
 * RBAC model): Production is one example of where they diverge on purpose —
 * the *permission* to read the order book is the finer-grained `orders`
 * section, but the reference app logs all Production page-views and order
 * writes under the coarser `production` bucket, and mobile matches that
 * exactly so the two clients report the same shape of "who uses what".
 */
const ROUTE_SECTIONS: [prefix: string, section: string][] = [
  ['/', 'dashboard'],
  ['/tasks', 'tasks'],
  ['/module/tasks', 'tasks'],
  ['/attendance', 'attendance'],
  ['/production', 'production'],
  ['/module/production', 'production'],
  ['/order-management', 'production'], // legacy alias, same screen
  ['/inventory', 'inventory'],
  ['/module/inventory', 'inventory'],
  ['/sales', 'sales'],
  ['/finance', 'finance'],
  ['/module/finance', 'finance'],
  // The reference app's Accounting is a *variant* of the Finance page (same
  // route, different tabs), so it logs under `finance`. Mobile's is a
  // separate route for the same screen family — kept under `finance` too, so
  // a person's "time in Finance" reads the same on both clients.
  ['/accounting', 'finance'],
  ['/purchases', 'purchases'],
  ['/billing', 'billing'],
  ['/module/billing', 'billing'],
  ['/budget-requirements', 'budget'],
  ['/employees-hr', 'employees'],
  ['/customers', 'customers'],
  ['/marketing', 'marketing'],
  ['/module/marketing', 'marketing'],
  ['/chat', 'messenger'],
  ['/admin-panel', 'admin'],
  ['/usage', USAGE_SECTION],
  ['/bug-report', 'bug_report'],
  ['/changelog', 'changelog'],
];

/** Which section a path belongs to, or null for one we do not track (account, settings, notifications, auth). */
export function sectionForPath(pathname: string | null | undefined): string | null {
  const p = String(pathname || '');
  let best: [string, string] | null = null;
  for (const entry of ROUTE_SECTIONS) {
    const prefix = entry[0];
    if ((p === prefix || p.startsWith(`${prefix}/`)) && (!best || prefix.length > best[0].length)) {
      best = entry;
    }
  }
  return best ? best[1] : null;
}

/**
 * Collection name (as `lib/supabase/write.ts` and `data/admin-panel/supabase-write.ts`
 * know it) → the page it counts as usage of, and what to call the thing
 * written. Copied verbatim from the reference app's `WRITE_TARGETS` wherever
 * mobile writes that same collection, so a save logged from a phone reads
 * exactly like the same save logged from a browser.
 *
 * A collection missing here is simply not logged — bookkeeping (`counters`,
 * `mobile_notifications`) that nobody would call "using a feature", the same
 * default the reference app takes.
 */
const WRITE_TARGETS: Record<string, [section: string, target: string]> = {
  tasks: ['tasks', 'Task'],
  task_columns: ['tasks', 'Task column'],
  customers: ['customers', 'Customer'],
  orders: ['production', 'Order'],
  order_costs: ['production', 'Order costing'],
  order_assignments: ['production', 'Dispatch assignment'],
  samples: ['production', 'Sample'],
  production: ['production', 'Production batch'],
  processes: ['production', 'Process'],
  stage_config: ['production', 'Stage setup'],
  invoices: ['billing', 'Invoice'],
  quotations: ['billing', 'Quotation'],
  challans: ['billing', 'Challan'],
  attendance: ['attendance', 'Attendance record'],
  clock_ins: ['attendance', 'Clock-in'],
  inventory: ['inventory', 'Stock item'],
  stock_movements: ['inventory', 'Stock movement'],
  fabrics: ['library', 'Fabric'],
  patterns: ['library', 'Pattern'],
  product_costs: ['library', 'Product cost'],
  employees: ['employees', 'Employee'],
  finance_expenses: ['finance', 'Expense'],
  finance_payroll: ['finance', 'Payroll run'],
  finance_purchases: ['purchases', 'Purchase'],
  journal_entries: ['finance', 'Journal entry'],
  vat_bills: ['finance', 'VAT bill'],
  bank_transactions: ['finance', 'Bank transaction'],
  unit_economics: ['finance', 'Unit economics'],
  accounts: ['accounting', 'Account'],
  budget_requests: ['budget', 'Budget request'],
  content: ['content', 'Content post'],
  content_calendar: ['content', 'Calendar entry'],
  messages: ['messenger', 'Message'],
};

/**
 * Off after the first failure — see the header. A token that resolves to no
 * person, or a stale build reading a table that isn't there yet, is a
 * permanent condition for the session; retrying it on every tap would trade a
 * silent non-feature for a stream of console noise and wasted round trips.
 */
let enabled = true;

function disable(where: string, err: unknown): void {
  enabled = false;
  if (__DEV__) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[activity] log off for this session (${where}): ${message}`);
  }
}

/**
 * The pathname `logWrite` stamps a write with when no screen supplies one —
 * kept here rather than threaded through every writer, the same shape as
 * `data/notifications/actor.ts`'s `setActor`. Set by `useActivityLog` on every
 * navigation.
 */
let currentPath: string | null = null;
export function setCurrentPath(path: string | null): void {
  currentPath = path;
}

export interface LogActivityInput {
  section?: string | null;
  action: string;
  target?: string | null;
  detail?: Record<string, unknown> | null;
  path?: string | null;
}

/**
 * Record one event. Never throws, never needs awaiting by the caller.
 *
 * Returns the new row's id when the caller may want to come back and fill in
 * how long the visit lasted (`closeActivity`), and null otherwise — including
 * whenever Supabase isn't configured, so local dev with no `.env` stays quiet.
 */
export async function logActivity({ section = null, action, target = null, detail = null, path = null }: LogActivityInput): Promise<string | null> {
  if (!isSupabaseConfigured || !enabled || !action) return null;
  try {
    const { data, error } = await getSupabase()
      .from('activity_events')
      .insert({
        section_id: section,
        action,
        target,
        detail: detail || {},
        path: path ?? currentPath,
      })
      .select('id')
      .single();
    if (error) {
      disable(action, error);
      return null;
    }
    return (data as { id?: string } | null)?.id || null;
  } catch (err) {
    disable(action, err);
    return null;
  }
}

/** Fill in how long a page view lasted. Silent on failure — a dwell time is the most disposable data in the app. */
export async function closeActivity(id: string | null, durationMs: number): Promise<void> {
  if (!isSupabaseConfigured || !enabled || !id || !Number.isFinite(durationMs) || durationMs <= 0) return;
  try {
    await getSupabase()
      .from('activity_events')
      .update({ duration_ms: Math.min(Math.round(durationMs), 12 * 60 * 60 * 1000) })
      .eq('id', id);
  } catch {
    // See closeActivity's header — not worth a console line either.
  }
}

/**
 * Called after every successful write in `lib/supabase/write.ts` and the
 * admin-panel's own writer. Deliberately not awaited by callers: a save must
 * not wait on its own bookkeeping.
 */
export function logWrite(collection: string, action: string, id?: string | number | null): void {
  const entry = WRITE_TARGETS[collection];
  if (!entry) return;
  const [section, target] = entry;
  void logActivity({ section, action, target, detail: { collection, ...(id ? { id: String(id) } : {}) } });
}

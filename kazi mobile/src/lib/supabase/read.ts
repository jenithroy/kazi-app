/**
 * Read side of the Supabase swap — a drop-in replacement for
 * the pre-migration read layer, with the same three exports and the same
 * signatures, so no per-module mapper had to change.
 *
 * How the shapes still line up: Postgres holds a clean relational schema,
 * but `supabase/migrations/0010_compat_views.sql` exposes `fs_<collection>`
 * views shaped like the old Firestore documents (camelCase fields, `id` as
 * text, line items rebuilt into the JSON arrays the mappers expect). Those
 * views are `security_invoker`, so RLS on the underlying tables applies to
 * every read here.
 *
 * **Reads only** — nothing in this module writes. A failed read throws
 * {@link DataReadError}; it never substitutes mock data (see {@link liveRead}).
 */

import { getSupabase, lastTokenSource } from '@/lib/supabase';

/** The plain object handed to a mapper — a row from a compat view. */
export type DocData = Record<string, unknown>;

/**
 * Firestore collection name → compat view. Anything not listed is assumed to
 * already be named `fs_<name>`; an unmapped collection is a bug, not a
 * fallback, so it throws rather than silently reading nothing.
 */
const VIEW_BY_COLLECTION: Record<string, string> = {
  accounts: 'fs_accounts',
  attendance: 'fs_attendance',
  bank_transactions: 'fs_bank_transactions',
  budget_requests: 'fs_budget_requests',
  challans: 'fs_challans',
  clock_ins: 'fs_clock_ins',
  content: 'fs_content',
  content_calendar: 'fs_content_calendar',
  counters: 'fs_counters',
  customers: 'fs_customers',
  employees: 'fs_employees',
  fabrics: 'fs_fabrics',
  mobile_notifications: 'fs_mobile_notifications',
  order_assignments: 'fs_order_assignments',
  order_costs: 'fs_order_costs',
  samples: 'fs_samples',
  stock_movements: 'fs_stock_movements',
  user_points: 'fs_user_points',
  vat_bills: 'fs_vat_bills',
  finance_expenses: 'fs_finance_expenses',
  finance_payroll: 'fs_finance_payroll',
  finance_purchases: 'fs_finance_purchases',
  inventory: 'fs_inventory',
  invoices: 'fs_invoices',
  journal_entries: 'fs_journal_entries',
  messages: 'fs_messages',
  orders: 'fs_orders',
  patterns: 'fs_patterns',
  processes: 'fs_processes',
  product_costs: 'fs_product_costs',
  production: 'fs_production',
  quotations: 'fs_quotations',
  stage_config: 'fs_stage_config',
  task_columns: 'fs_task_columns',
  tasks: 'fs_tasks',
  unit_economics: 'fs_unit_economics',
  users: 'fs_users',
};

/**
 * PostgREST puts the useful part in `code`, not `message`: a rejected token
 * reads "No suitable key or wrong key type", which names no cause at all until
 * you see the `PGRST301` beside it. Keep both.
 */
function failed(where: string, error: { message: string; code?: string }): Error {
  return new Error(`${where}: ${error.message}${error.code ? ` [${error.code}]` : ''}`);
}

export function viewFor(collection: string): string {
  const view = VIEW_BY_COLLECTION[collection];
  if (!view) throw new Error(`No Supabase compat view mapped for collection "${collection}"`);
  return view;
}

/**
 * Read a whole collection and map each row to `T`. A mapper may return `null`
 * to drop a row. Throws on any Supabase error so `liveRead` can turn it
 * into a {@link DataReadError} — note an RLS denial is NOT an error, it comes
 * back as zero rows.
 */
export async function readCollection<T>(
  name: string,
  map: (id: string, data: DocData) => T | null,
): Promise<T[]> {
  const { data, error } = await getSupabase().from(viewFor(name)).select('*');
  if (error) throw failed(name, error);
  const out: T[] = [];
  for (const row of data ?? []) {
    const mapped = map(String((row as DocData).id ?? ''), row as DocData);
    if (mapped != null) out.push(mapped);
  }
  return out;
}

/** Like {@link readCollection} but with equality filters applied server-side. */
export async function readCollectionWhere<T>(
  name: string,
  filters: Record<string, string | number | boolean>,
  map: (id: string, data: DocData) => T | null,
): Promise<T[]> {
  let q = getSupabase().from(viewFor(name)).select('*');
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { data, error } = await q;
  if (error) throw failed(name, error);
  const out: T[] = [];
  for (const row of data ?? []) {
    const mapped = map(String((row as DocData).id ?? ''), row as DocData);
    if (mapped != null) out.push(mapped);
  }
  return out;
}

/** Fetch a single row by id, or null when it isn't there / isn't visible. */
export async function readDocument(name: string, id: string): Promise<DocData | null> {
  const { data, error } = await getSupabase()
    .from(viewFor(name))
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw failed(`${name}/${id}`, error);
  return (data as DocData) ?? null;
}

const loggedOk = new Set<string>();

/**
 * A failed live read.
 *
 * Carries a message fit to put in front of a user, plus the `tag` of the read
 * that failed so a banner can name the module. The original error is kept in
 * `cause` for the console — it usually says far more than we want on screen.
 */
export class DataReadError extends Error {
  readonly tag: string;

  constructor(tag: string, cause: unknown) {
    super(messageFor(cause));
    this.name = 'DataReadError';
    this.tag = tag;
    this.cause = cause;
  }
}

/**
 * Turn a Supabase/PostgREST failure into something a person can act on.
 *
 * A rejected token means the session went stale, and signing in again is the
 * fix. No token at all means the request went out as `anon`, which sees almost
 * nothing — same fix. Anything else is a network or server problem they cannot
 * act on, so say that rather than inventing advice.
 */
export function messageFor(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause ?? '');
  if (/JWT|token|PGRST301|suitable key|key type|Unauthorized|401/i.test(raw)) {
    if (lastTokenSource() === null) {
      return 'You are not signed in to the data backend. Please sign out and sign in again.';
    }
    return 'Your session was rejected by the server. Please sign out and sign in again.';
  }
  if (/Network request failed|fetch|ENOTFOUND|timeout/i.test(raw)) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return 'The server refused this request.';
}

/**
 * A failed live write.
 *
 * Same contract as {@link DataReadError}: a message fit for a person, the `tag`
 * of the write that failed, and the original error in `cause`.
 */
export class DataWriteError extends Error {
  readonly tag: string;

  constructor(tag: string, cause: unknown) {
    super(messageFor(cause));
    this.name = 'DataWriteError';
    this.tag = tag;
    this.cause = cause;
  }
}

/**
 * Wrap a live reader so a failure SURFACES instead of being papered over.
 *
 * This deliberately has no mock fallback. It used to fall back to seed data on
 * any error, which meant a rejected token — the exact failure this app had —
 * rendered a screen full of convincing fake records with nothing but a
 * `console.warn` to say so. Showing an error the user can report beats showing
 * numbers they might act on.
 *
 * Note what is NOT an error: an empty result. Under RLS "you may not see these
 * rows" is a valid answer and still comes back as `[]`, not a throw.
 *
 * Callers pick the mock themselves when Supabase is unconfigured — every call
 * site is already a `isSupabaseConfigured ? liveRead(...) : mock` ternary — so
 * local development without a `.env` is unaffected.
 */
export function liveRead<A extends unknown[], R>(
  tag: string,
  liveFn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    try {
      const result = await liveFn(...args);
      if (__DEV__ && !loggedOk.has(tag)) {
        loggedOk.add(tag);
        const count = Array.isArray(result) ? ` (${result.length} rows)` : '';
        console.log(`[supabase] ${tag}: live read OK${count}`);
      }
      return result;
    } catch (err) {
      console.error(`[supabase] ${tag}: live read FAILED — surfacing to the user`, err);
      throw new DataReadError(tag, err);
    }
  };
}

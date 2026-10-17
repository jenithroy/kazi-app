/**
 * Write side of the Supabase swap — a drop-in replacement for
 * the pre-migration write layer, exporting the same five helpers with the same
 * signatures so no module's writer had to be rewritten.
 *
 * Unlike reads, writes bypass the compat views and hit the real tables, so
 * RLS applies directly with nothing in between. The translation from the
 * apps' Firestore-shaped documents (camelCase, denormalised) to relational
 * columns happens here:
 *
 *   - field names: camelCase → snake_case, with per-collection overrides for
 *     the ones that were renamed (`orderId` → `order_no`, `itemId` → `item_ref`);
 *   - `staffId` / `assignee` (a Firebase uid or a display name) resolve to a
 *     `people.id` foreign key;
 *   - `items` / `stageHistory` / `notesList`, which used to be JSON arrays
 *     inside the document, are written to their child tables;
 *   - Firestore `serverTimestamp()` sentinels become a real timestamp.
 *
 * Every failure is logged loudly rather than swallowed — a denied RLS write
 * must be visible, not silently dropped.
 */

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { logWrite } from './activity-log';
import { DataWriteError } from './read';

export type DocumentData = Record<string, unknown>;

// ---------------------------------------------------------------- mapping

const camelToSnake = (s: string) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toLowerCase();

interface Spec {
  table: string;
  /** overrides where camel→snake is not the right answer */
  cols?: Record<string, string>;
  /** document fields that must never be written as columns */
  skip?: string[];
  /** the column a bare `date` field maps to */
  dateCol?: string;
}

const SPECS: Record<string, Spec> = {
  tasks: {
    table: 'tasks',
    cols: { dueDate: 'due_date', orderRef: 'order_ref' },
    skip: ['assigneeId'],
  },
  customers: { table: 'customers' },
  orders: {
    table: 'orders',
    cols: { orderId: 'order_no', invoiceRef: 'invoice_ref', assignedTo: 'assigned_to' },
    skip: ['stageHistory', 'notesList', 'invoiceNumber'],
    dateCol: 'order_date',
  },
  invoices: {
    table: 'invoices',
    cols: { invoiceNumber: 'invoice_no', clientPAN: 'client_pan', applyVAT: 'apply_vat' },
    skip: ['items', 'linkedOrderId'],
    dateCol: 'invoice_date',
  },
  quotations: {
    table: 'quotations',
    cols: { quotationNumber: 'quotation_no', clientPAN: 'client_pan' },
    skip: ['items'],
    dateCol: 'quote_date',
  },
  counters: { table: 'counters' },
  accounts: { table: 'accounts' },
  finance_expenses: { table: 'expenses', dateCol: 'expense_date' },
  finance_purchases: {
    table: 'purchases',
    cols: { expenseId: 'expense_ref' },
    skip: ['items'],
    dateCol: 'purchase_date',
  },
  journal_entries: { table: 'journal_entries', dateCol: 'entry_date' },
  bank_transactions: { table: 'bank_transactions', cols: { date: 'txn_date_text', timestamp: 'txn_at' } },
  budget_requests: {
    table: 'budget_requests',
    cols: { brId: 'br_ref' },
    skip: ['requestedById'],
  },
  finance_payroll: { table: 'payroll', skip: ['staffName', 'role'] },
  product_costs: { table: 'product_costs' },
  unit_economics: { table: 'unit_economics' },
  fabrics: { table: 'fabrics', cols: { pricePerKg: 'price_per_kg' } },
  patterns: { table: 'patterns' },
  processes: { table: 'processes' },
  inventory: { table: 'inventory_items', cols: { itemId: 'item_ref' } },
  production: { table: 'production_batches', cols: { batchId: 'batch_ref' }, dateCol: 'batch_date' },
  stage_config: { table: 'stage_config', cols: { order: 'sort_order' } },
  task_columns: { table: 'task_columns', cols: { order: 'sort_order' } },
  content_calendar: { table: 'content_calendar' },
  content: { table: 'content_posts', dateCol: 'post_date' },
  messages: { table: 'messages', cols: { timestamp: 'sent_at' }, skip: ['senderId'] },
  attendance: { table: 'attendance', skip: ['staffName', 'role'] },
  clock_ins: { table: 'clock_ins', skip: ['staffName', 'role'] },
  employees: {
    table: 'people',
    // `role` is the position LABEL, joined in by the compat view — the column
    // is `position_id`, and writing a job title into it violates the FK to
    // `positions`. `updatedBy` has no column here at all.
    cols: { name: 'full_name', positionId: 'position_id' },
    skip: ['uid', 'role', 'updatedBy', 'createdBy'],
  },
  // ---- tables added by the web-app session; mapped here so the mobile
  // ---- writers reach the same rows rather than a parallel set.
  stock_movements: {
    table: 'stock_movements',
    cols: { itemId: 'item_id', date: 'moved_on', sourceId: 'source_id', amountNPR: 'amount_npr' },
  },
  order_costs: {
    table: 'order_costs',
    cols: { orderId: 'order_id', orderRef: 'order_ref' },
  },
  order_assignments: {
    table: 'order_assignments',
    cols: { orderId: 'order_id', assignedTo: 'assigned_to', personId: 'person_id' },
  },
  samples: { table: 'samples' },
  challans: {
    table: 'challans',
    cols: { challanNumber: 'challan_no', clientPAN: 'client_pan' },
    skip: ['items'],
    dateCol: 'challan_date',
  },
  vat_bills: { table: 'vat_bills', cols: { expenseId: 'expense_id' } },
  mobile_notifications: {
    table: 'mobile_notifications',
    // Router bookkeeping the table has no columns for — writing any of them
    // makes PostgREST reject the whole insert.
    skip: ['recipientId', 'recipientRole', 'actorEmail', 'targetRef', 'matchedRule', 'source'],
  },
};

function specFor(name: string): Spec {
  const s = SPECS[name];
  if (!s) throw new Error(`No Supabase write mapping for collection "${name}"`);
  return s;
}

/**
 * `serverTimestamp()` arrives as an opaque sentinel — either a real Firestore
 * FieldValue (during the transition) or the shim's marker from
 * `@/lib/supabase/collections`.
 */
function isSentinel(v: unknown): boolean {
  return (
    typeof v === 'object' && v !== null && !Array.isArray(v) &&
    ('_methodName' in (v as object) || '_delegate' in (v as object) ||
     '__serverTimestamp' in (v as object))
  );
}

/** `arrayUnion(x)` — append to what used to be an embedded array. */
function asArrayUnion(v: unknown): unknown[] | null {
  if (typeof v === 'object' && v !== null && '__arrayUnion' in (v as object))
    return (v as { __arrayUnion: unknown[] }).__arrayUnion;
  return null;
}

// -------------------------------------------------------------- identity

const personByUid = new Map<string, string>();

/** A `people.id` — the only key the attendance collections agree on since the migration. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `people.id`, a Firebase uid, or a display name → `people.id`. Cached; null when
 * unknown.
 *
 * The uuid branch matters: attendance now keys on `people.id`, and without it a
 * write carrying one fell through to the name lookup — which misses anyone whose
 * `staffName` was ever spelled differently, and silently wrote `person_id: null`.
 *
 * Only hits are cached: a miss can be a dropped request or a row added a minute
 * ago, and remembering it poisoned every later write for that key.
 */
async function resolvePerson(key: unknown): Promise<string | null> {
  const k = typeof key === 'string' ? key.trim() : '';
  if (!k) return null;
  const cached = personByUid.get(k);
  if (cached) return cached;
  const sb = getSupabase();
  let id: string | null = null;
  if (UUID.test(k)) {
    const byId = await sb.from('people').select('id').eq('id', k).maybeSingle();
    if (byId.data) id = (byId.data as { id: string }).id;
  }
  if (!id) {
    const byUid = await sb.from('people').select('id').eq('legacy_firebase_uid', k).maybeSingle();
    if (byUid.data) id = (byUid.data as { id: string }).id;
  }
  if (!id) {
    const byName = await sb.from('people').select('id').ilike('full_name', k).maybeSingle();
    if (byName.data) id = (byName.data as { id: string }).id;
  }
  if (id) personByUid.set(k, id);
  return id;
}

/** camelCase document → a row for `spec.table`. */
async function toRow(name: string, doc: DocumentData): Promise<DocumentData> {
  const spec = specFor(name);
  const row: DocumentData = {};
  for (const [k, raw] of Object.entries(doc)) {
    if (spec.skip?.includes(k)) continue;
    if (raw === undefined) continue;
    const v = isSentinel(raw) ? new Date().toISOString() : raw;

    if (k === 'staffId') { row.person_id = await resolvePerson(v); continue; }
    if (k === 'assignee' && name === 'tasks') {
      row.assignee = v;
      row.assignee_id = await resolvePerson(v);
      continue;
    }
    if (k === 'assignedTo' && name === 'orders') { row.assigned_to = await resolvePerson(v); continue; }
    if (k === 'date' && spec.dateCol) { row[spec.dateCol] = v; continue; }

    row[spec.cols?.[k] ?? camelToSnake(k)] = v;
  }
  return row;
}

/** `items` / `stageHistory` / `notesList` used to live inside the document. */
async function writeChildren(name: string, parentId: string, doc: DocumentData): Promise<void> {
  const sb = getSupabase();

  const append = async (table: string, rows: DocumentData[]): Promise<void> => {
    if (!rows.length) return;
    const { error } = await sb.from(table).insert(rows);
    if (error) throw new Error(`${table} insert (${parentId}): ${error.message}`);
  };

  /**
   * The new children go in BEFORE the old ones come out, and the delete is by
   * the ids read up front rather than by the foreign key — none of these tables
   * has a uniqueness constraint that a transient duplicate could collide with.
   * Deleting first meant a rejected insert (RLS, offline) left the parent with
   * no children at all: an invoice saved with its line items silently gone.
   */
  const replace = async (table: string, fk: string, rows: DocumentData[]): Promise<void> => {
    const before = await sb.from(table).select('id').eq(fk, parentId);
    if (before.error) throw new Error(`${table} read (${parentId}): ${before.error.message}`);
    await append(table, rows);
    const stale = ((before.data ?? []) as { id: string }[]).map((r) => r.id);
    if (!stale.length) return;
    const { error } = await sb.from(table).delete().in('id', stale);
    if (error) throw new Error(`${table} delete (${parentId}): ${error.message}`);
  };

  const items = doc.items;
  if (Array.isArray(items)) {
    // Challans keep their line items in the same table under `challan_id` — the
    // web app's own mapping (`src/lib/db.js`), and without it a saved delivery
    // note lists no goods at all.
    const fk =
      name === 'invoices' ? 'invoice_id'
      : name === 'quotations' ? 'quotation_id'
      : name === 'challans' ? 'challan_id'
      : 'purchase_id';
    if (['invoices', 'quotations', 'challans', 'finance_purchases'].includes(name)) {
      await replace('line_items', fk, items.map((it: Record<string, unknown>, seq) => ({
        [fk]: parentId, seq,
        description: it.description ?? null,
        particulars: it.particulars ?? null,
        qty: Number(it.qty ?? it.quantity) || null,
        unit: it.unit ?? null,
        rate: Number(it.rate) || null,
        amount: Number(it.amount ?? it.total) || null,
      })));
    }
  }
  if (name !== 'orders') return;

  // stageHistory / notesList: `arrayUnion(x)` appends one entry, a plain array
  // replaces the lot. Appending must NOT wipe history, so the two differ.
  const stageRows = (list: Record<string, unknown>[], from: number) => list.map((h, i) => ({
    order_id: parentId, seq: from + i, stage: String(h.stage ?? ''),
    changed_at: ((h.date ?? h.at) as string)?.slice(0, 10) || null,
    changed_by: (h.by as string) ?? null,
  }));
  const appendedStages = asArrayUnion(doc.stageHistory);
  if (appendedStages) {
    const last = await sb.from('order_stage_history')
      .select('seq').eq('order_id', parentId).order('seq', { ascending: false }).limit(1);
    if (last.error) throw new Error(`order_stage_history read (${parentId}): ${last.error.message}`);
    const from = ((last.data?.[0] as { seq?: number })?.seq ?? -1) + 1;
    await append('order_stage_history', stageRows(appendedStages as Record<string, unknown>[], from));
  } else if (Array.isArray(doc.stageHistory)) {
    await replace('order_stage_history', 'order_id', stageRows(doc.stageHistory as Record<string, unknown>[], 0));
  }

  const appendedNotes = asArrayUnion(doc.notesList);
  const noteRows = (list: Record<string, unknown>[]) => list.map((n) => ({
    order_id: parentId,
    text: String(n.text ?? n.body ?? ''),
    author: ((n.by ?? n.who) as string) ?? null,
  }));
  if (appendedNotes) {
    await append('order_notes', noteRows(appendedNotes as Record<string, unknown>[]));
  } else if (Array.isArray(doc.notesList)) {
    await replace('order_notes', 'order_id', noteRows(doc.notesList as Record<string, unknown>[]));
  }
}

// ----------------------------------------------------------------- public

export async function createDocument(name: string, data: DocumentData): Promise<string> {
  const sb = getSupabase();
  const row = await toRow(name, data);
  const { data: out, error } = await sb.from(specFor(name).table).insert(row).select('id').single();
  if (error) throw new Error(`create ${name}: ${error.message}`);
  const id = String((out as { id: string }).id);
  await writeChildren(name, id, data);
  logWrite(name, 'create', id);
  return id;
}

export async function patchDocument(name: string, id: string, data: DocumentData): Promise<void> {
  const sb = getSupabase();
  const row = await toRow(name, data);
  // A child-only patch (an order note is `notesList`, which `skip` strips) leaves
  // no parent columns; sending `update({})` fails and the child write never runs.
  if (Object.keys(row).length > 0) {
    const { error } = await sb.from(specFor(name).table).update(row).eq('id', id);
    if (error) throw new Error(`patch ${name}/${id}: ${error.message}`);
  }
  await writeChildren(name, id, data);
  logWrite(name, 'update', id);
}

/**
 * Upsert at a caller-chosen id. The apps use composite Firestore ids for the
 * per-person-per-day rows (`attendance/{date}_{firebaseUid}`); those become an
 * upsert on the real `(person_id, date)` unique key instead.
 */
export async function setDocument(
  name: string,
  id: string,
  data: DocumentData,
  options?: { merge?: boolean },
): Promise<void> {
  const sb = getSupabase();
  const spec = specFor(name);

  const composite = /^(\d{4}-\d{2}-\d{2})_(.+)$/.exec(id);
  if (composite && (name === 'attendance' || name === 'clock_ins')) {
    const [, date, staffId] = composite;
    const personId = await resolvePerson(staffId);
    if (!personId) throw new Error(`set ${name}/${id}: no person for uid ${staffId}`);
    const row = { ...(await toRow(name, data)), person_id: personId, date };
    const { error } = await sb.from(spec.table).upsert(row, { onConflict: 'person_id,date' });
    if (error) throw new Error(`set ${name}/${id}: ${error.message}`);
    logWrite(name, 'save', id);
    return;
  }

  const row = { ...(await toRow(name, data)), id };
  const { error } = await sb.from(spec.table).upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`set ${name}/${id}: ${error.message}`);
  await writeChildren(name, id, data);
  logWrite(name, 'save', id);
}

export async function removeDocument(name: string, id: string): Promise<void> {
  const { error } = await getSupabase().from(specFor(name).table).delete().eq('id', id);
  if (error) throw new Error(`delete ${name}/${id}: ${error.message}`);
  logWrite(name, 'delete', id);
}

/**
 * Wrap a live writer so a failure SURFACES instead of being papered over.
 *
 * This used to swallow every error and return the mock result anyway, which
 * made a rejected write — an RLS denial, a bad column, being offline — look
 * exactly like a successful one: the optimistic update landed, the toast said
 * "saved", and nothing had reached Postgres. Now the live write is the write:
 * if it throws, so does this, and the caller's mutation rejects so the UI can
 * say so and React Query can roll the optimistic update back.
 *
 * The mock still runs after a SUCCESSFUL live write, so the in-memory store a
 * few screens read from stays in step.
 *
 * Unconfigured (local dev with no `.env`) it is the mock and only the mock.
 */
export function liveWrite<A extends unknown[], R>(
  tag: string,
  liveFn: (...args: A) => Promise<unknown>,
  mockFn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  if (!isSupabaseConfigured) return mockFn;
  const loggedOk = new Set<string>();
  return async (...args: A) => {
    try {
      await liveFn(...args);
      if (__DEV__ && !loggedOk.has(tag)) {
        loggedOk.add(tag);
        console.log(`[supabase] ${tag}: live write OK`);
      }
    } catch (err) {
      console.error(`[supabase] ${tag}: live write FAILED (RLS / shape / offline?) — surfacing to the user`, err);
      throw new DataWriteError(tag, err);
    }
    return mockFn(...args);
  };
}

import { supabase } from "../supabase";
import { SCHEMA_MAP } from "./schemaMap";

/**
 * The data layer.
 *
 * Reads go through the fs_* views, which return the same shape the app used to
 * get from Firestore -- camelCase keys, id as a string, dates as YYYY-MM-DD.
 * That is why the pages barely change: what comes back looks like what always
 * came back.
 *
 * Writes cannot use those views (they join and aggregate, so Postgres will not
 * accept an insert), so they go to the real table with keys translated back to
 * columns via the generated schema map.
 *
 * Nothing here checks permissions. Every one of these queries runs against RLS
 * policies that re-derive the caller's access from their position, so a request
 * for data they may not see returns an empty list, and a forbidden write fails.
 * The UI hiding a button is a courtesy; this is the enforcement.
 */

/**
 * Child rows that used to be arrays inside a Firestore document.
 *
 * Invoice line items were a JSON blob on the invoice; they are now rows in
 * line_items. Same for an order's stage history and notes. The app still hands
 * us whole arrays, so a write replaces the child set wholesale.
 */
const LINE_ITEM = {
  table: "line_items",
  map: (row, i) => ({
    seq: i,
    description: row.description ?? null,
    particulars: row.particulars ?? null,
    // Purchases call the quantity `quantity`, everything else calls it `qty`.
    qty: num(row.qty ?? row.quantity),
    unit: row.unit ?? null,
    rate: num(row.rate),
    amount: num(row.amount ?? (Number(row.qty ?? row.quantity) || 0) * (Number(row.rate) || 0)),
    // Links a sale line to an inventory item so postSaleStockOut() can deduct
    // stock. Empty string is what an unset <select> gives us, and it is not a
    // uuid — send null instead or the insert fails.
    stock_item_id: row.stockItemId || null,
  }),
};

const NESTED = {
  invoices:          { items: { ...LINE_ITEM, fk: "invoice_id" } },
  quotations:        { items: { ...LINE_ITEM, fk: "quotation_id" } },
  challans:          { items: { ...LINE_ITEM, fk: "challan_id" } },
  finance_purchases: { items: { ...LINE_ITEM, fk: "purchase_id" } },
  orders: {
    stageHistory: {
      table: "order_stage_history",
      fk: "order_id",
      map: (row, i) => ({ seq: i, stage: row.stage ?? null, changed_at: row.date || null, changed_by: row.by ?? null }),
    },
    notesList: {
      table: "order_notes",
      fk: "order_id",
      map: (row) => ({ text: row.text ?? null, author: row.by ?? null }),
    },
  },
};

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

function mapping(collection) {
  const m = SCHEMA_MAP[collection];
  if (!m) throw new Error(`Unknown collection "${collection}". Add it to scripts/gen-schema-map.cjs.`);
  return m;
}

/** What the app reads from: the compatibility view, or the table if there is none. */
const readFrom = (collection) => mapping(collection).view || mapping(collection).table;

/**
 * The column an update or delete should match a row `id` against.
 *
 * Most tables have a uuid `id`, but a few are keyed by something meaningful:
 * product_costs by `code`, stage_config by `stage`, user_points by `person_id`.
 * Their views alias that column to `id` so the app still sees an id, which
 * means a hardcoded `.eq("id", …)` reads fine through the view but fails
 * against the table — the column simply is not there.
 */
function keyColumn(collection) {
  const column = mapping(collection).fields.id;
  if (!column) {
    // Join tables like position_permissions are keyed by a composite
    // (position_id, section_id) and have no id at all. Say so, rather than
    // aiming an update at a column that does not exist and letting PostgREST
    // report it as a puzzling schema error.
    throw new Error(
      `"${collection}" has no single row id — it is keyed by a composite of columns. ` +
      "Read it with fetchAll() and write it with supabase.from(...).upsert({ onConflict }) directly."
    );
  }
  return column;
}

/**
 * Translate a document the app wrote into a row the table will accept.
 *
 * Keys with no column are dropped rather than passed through, because
 * PostgREST rejects the whole statement on an unknown column -- one stale field
 * would fail an otherwise good save. Read-only keys (joined names, aggregates)
 * are dropped for the same reason.
 */
function toRow(collection, data) {
  const { fields } = mapping(collection);
  const row = {};
  for (const [key, value] of Object.entries(data || {})) {
    const column = fields[key];
    if (!column || column === "id") continue;
    row[column] = normalise(value);
  }
  return row;
}

/**
 * Firestore sentinels (serverTimestamp()) and Timestamp objects arrive as
 * objects Postgres cannot store. Convert what we recognise, pass through what
 * is genuinely JSON (jsonb columns hold real objects), and drop the rest.
 */
function normalise(value) {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
    // A serverTimestamp() sentinel has no readable value; now is what it meant.
    if (value._methodName === "serverTimestamp") return new Date().toISOString();
  }
  return value;
}

/** Split a document into its own columns and its child arrays. */
function splitNested(collection, data) {
  const children = NESTED[collection] || {};
  const own = { ...data };
  const nested = {};
  for (const key of Object.keys(children)) {
    if (key in own) { nested[key] = own[key]; delete own[key]; }
  }
  return { own, nested };
}

/** Replace a parent's child rows with exactly the array given. */
async function writeChildren(collection, parentId, nested) {
  const defs = NESTED[collection] || {};
  for (const [key, rows] of Object.entries(nested)) {
    const def = defs[key];
    if (!def || !Array.isArray(rows)) continue;

    const { error: delErr } = await supabase.from(def.table).delete().eq(def.fk, parentId);
    if (delErr) throw delErr;

    if (!rows.length) continue;
    const payload = rows.map((row, i) => ({ ...def.map(row, i), [def.fk]: parentId }));
    const { error: insErr } = await supabase.from(def.table).insert(payload);
    if (insErr) throw insErr;
  }
}

/**
 * Read a whole collection.
 *
 *   filters  [{ field, op, value }]  op defaults to "eq"
 *   orderBy  a key from the view; orderDir "asc" | "desc"
 *   limit    max rows
 */
export async function fetchAll(collection, { filters = [], orderBy, orderDir = "desc", limit } = {}) {
  let q = supabase.from(readFrom(collection)).select("*");

  for (const { field, op = "eq", value } of filters) {
    if (value === undefined) continue;
    q = typeof q[op] === "function" ? q[op](field, value) : q.eq(field, value);
  }
  if (orderBy) q = q.order(orderBy, { ascending: orderDir === "asc" });
  if (limit) q = q.limit(limit);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** One row by id, or null. */
export async function fetchOne(collection, id) {
  const { data, error } = await supabase
    .from(readFrom(collection)).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Insert and return the new row as the app would read it. */
export async function insertRow(collection, data) {
  const { own, nested } = splitNested(collection, data);
  const key = keyColumn(collection);
  const { data: inserted, error } = await supabase
    .from(mapping(collection).table).insert(toRow(collection, own)).select(key).single();
  if (error) throw error;

  const id = inserted[key];
  await writeChildren(collection, id, nested);
  return fetchOne(collection, id);
}

/** Update by id. Only the keys given are touched. */
export async function updateRow(collection, id, data) {
  const { own, nested } = splitNested(collection, data);
  const row = toRow(collection, own);

  if (Object.keys(row).length) {
    const { error } = await supabase
      .from(mapping(collection).table).update(row).eq(keyColumn(collection), id);
    if (error) throw error;
  }
  await writeChildren(collection, id, nested);
  return fetchOne(collection, id);
}

/**
 * Insert, or update the row that already holds the same natural key.
 *
 * Replaces the `setDoc(doc(coll, someDerivedId), data, { merge: true })` idiom,
 * which leaned on Firestore letting you name a document. Postgres rows are
 * keyed by a uuid, so the "same record" test moves to a unique constraint --
 * attendance is UNIQUE (person_id, date), so clocking in twice in a day updates
 * the day's row instead of creating a second one.
 *
 * `conflictKeys` must match a real unique constraint or Postgres rejects it.
 */
export async function upsertRow(collection, data, conflictKeys) {
  const { own, nested } = splitNested(collection, data);
  const row = toRow(collection, own);

  // toRow drops the primary key on purpose — an update must never rewrite it —
  // but an upsert needs it, because it is what decides insert versus update.
  // Put back exactly the columns named as the conflict target.
  const { fields } = mapping(collection);
  for (const column of conflictKeys) {
    const inputKey = Object.keys(own).find((k) => fields[k] === column);
    if (inputKey !== undefined && own[inputKey] !== undefined) {
      row[column] = normalise(own[inputKey]);
    }
  }

  const { data: saved, error } = await supabase
    .from(mapping(collection).table)
    .upsert(row, { onConflict: conflictKeys.join(",") })
    .select(keyColumn(collection))
    .single();
  if (error) throw error;

  const id = saved[keyColumn(collection)];
  await writeChildren(collection, id, nested);
  return fetchOne(collection, id);
}

/** Delete by id. Child rows go with it via ON DELETE CASCADE. */
export async function deleteRow(collection, id) {
  const { error } = await supabase
    .from(mapping(collection).table).delete().eq(keyColumn(collection), id);
  if (error) throw error;
}

/**
 * Load several collections at once.
 *
 * Same contract the Firestore helper had: keyed by your key, each value an
 * array, and a collection that fails comes back empty rather than taking the
 * whole page down with it. That matters more here than it did before -- RLS
 * denies rather than errors, but a genuinely broken query on one panel should
 * not blank the other eleven.
 */
export async function loadCollections(collectionsMap) {
  const keys = Object.keys(collectionsMap);
  const results = await Promise.allSettled(
    keys.map((k) => {
      const spec = collectionsMap[k];
      return typeof spec === "string" ? fetchAll(spec) : fetchAll(spec.collection, spec);
    })
  );

  const out = {};
  keys.forEach((k, i) => {
    const r = results[i];
    if (r.status === "fulfilled") out[k] = r.value;
    else {
      console.warn(`loadCollections: failed to load "${JSON.stringify(collectionsMap[k])}":`, r.reason?.message || r.reason);
      out[k] = [];
    }
  });
  return out;
}

/**
 * Call `onChange` whenever anyone changes a row in this collection.
 *
 * The replacement for onSnapshot, and deliberately a coarser one: Firestore
 * handed you the new documents, this only says "something moved". Every caller
 * used it the same way -- to trigger a refetch -- so the payload was never the
 * point, and refetching keeps a screen consistent rather than patching one row
 * into a list assembled from several joins.
 *
 * Only the tables in migration 0013 are published; subscribing to anything else
 * is silent rather than an error, so check there before relying on it. Realtime
 * applies the same RLS policies as a read, so changes to rows the viewer cannot
 * see are never delivered.
 *
 * Returns an unsubscribe function, like onSnapshot did.
 */
export function subscribe(collection, onChange) {
  const table = mapping(collection).table;
  const channel = supabase
    .channel(`kazi:${table}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, onChange)
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

/** Escape hatch for queries this shim does not cover. */
export { supabase };

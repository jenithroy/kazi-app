#!/usr/bin/env node
/**
 * Generates src/lib/schemaMap.js from the live database.
 *
 * Reads flow through the fs_* views, which hand back the exact shape the app
 * used to get from Firestore: camelCase keys, id as text, dates as YYYY-MM-DD.
 * Writes cannot -- those views join and aggregate, so Postgres will not accept
 * an insert into them. Writes go to the underlying table, which means every
 * camelCase key the app sends has to be translated back to its real column.
 *
 * Rather than hand-maintain that translation for ~37 collections, derive it:
 * each view definition literally spells out `orders.order_no AS "orderId"`, so
 * parsing pg_get_viewdef gives the mapping with no guessing. Renames like
 * orderId -> order_no or date -> order_date come out correct, which a naive
 * camelCase-to-snake_case conversion would get wrong.
 *
 * Columns the view computes rather than selects (stageHistory, items, the
 * joined assignedTo name) have no single source column and are recorded as
 * read-only, so a write cannot silently drop them.
 *
 *   node scripts/gen-schema-map.cjs
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const CFG = fs.readFileSync(path.join(ROOT, 'mentions', 'supabase.txt'), 'utf8');
const URI = (CFG.match(/postgresql:\/\/\S+pooler\.supabase\.com:\d+\/postgres/g) || []).pop();

// Old Firestore collection name -> the table its writes belong to.
// Where the names already match, the view is fs_<collection>.
const COLLECTIONS = {
  accounts:           { view: 'fs_accounts',           table: 'accounts' },
  attendance:         { view: 'fs_attendance',         table: 'attendance' },
  bank_transactions:  { view: 'fs_bank_transactions',  table: 'bank_transactions' },
  budget_requests:    { view: 'fs_budget_requests',    table: 'budget_requests' },
  challans:           { view: 'fs_challans',           table: 'challans' },
  clock_ins:          { view: 'fs_clock_ins',          table: 'clock_ins' },
  content:            { view: 'fs_content',            table: 'content_posts' },
  content_calendar:   { view: 'fs_content_calendar',   table: 'content_calendar' },
  counters:           { view: 'fs_counters',           table: 'counters' },
  customers:          { view: 'fs_customers',          table: 'customers' },
  employees:          { view: 'fs_employees',          table: 'people' },
  fabrics:            { view: 'fs_fabrics',            table: 'fabrics' },
  finance_expenses:   { view: 'fs_finance_expenses',   table: 'expenses' },
  finance_payroll:    { view: 'fs_finance_payroll',    table: 'payroll' },
  finance_purchases:  { view: 'fs_finance_purchases',  table: 'purchases' },
  inventory:          { view: 'fs_inventory',          table: 'inventory_items' },
  invoices:           { view: 'fs_invoices',           table: 'invoices' },
  journal_entries:    { view: 'fs_journal_entries',    table: 'journal_entries' },
  leaderboard:        { view: null,                    table: 'leaderboard' },
  messages:           { view: 'fs_messages',           table: 'messages' },
  order_assignments:  { view: 'fs_order_assignments',  table: 'order_assignments' },
  order_costs:        { view: 'fs_order_costs',        table: 'order_costs' },
  orders:             { view: 'fs_orders',             table: 'orders' },
  patterns:           { view: 'fs_patterns',           table: 'patterns' },
  // Read directly — these are the permission matrix itself, not Firestore
  // collections that needed a compatibility shape.
  positions:          { view: null,                    table: 'positions' },
  sections:           { view: null,                    table: 'sections' },
  position_permissions:  { view: null, table: 'position_permissions' },
  position_finance_tabs: { view: null, table: 'position_finance_tabs' },
  point_transactions: { view: null,                    table: 'point_transactions' },
  processes:          { view: 'fs_processes',          table: 'processes' },
  product_costs:      { view: 'fs_product_costs',      table: 'product_costs' },
  production:         { view: 'fs_production',         table: 'production_batches' },
  qc_logs:            { view: 'fs_qc_logs',            table: 'qc_logs' },
  quotations:         { view: 'fs_quotations',         table: 'quotations' },
  samples:            { view: 'fs_samples',            table: 'samples' },
  stage_config:       { view: 'fs_stage_config',       table: 'stage_config' },
  stock_movements:    { view: 'fs_stock_movements',    table: 'stock_movements' },
  task_columns:       { view: 'fs_task_columns',       table: 'task_columns' },
  tasks:              { view: 'fs_tasks',              table: 'tasks' },
  unit_economics:     { view: 'fs_unit_economics',     table: 'unit_economics' },
  user_points:        { view: 'fs_user_points',        table: 'user_points' },
  users:              { view: 'fs_users',              table: 'people' },
  vat_bills:          { view: 'fs_vat_bills',          table: 'vat_bills' },
};

/**
 * The SELECT list, split on commas that are not inside parens or quotes.
 *
 * Both boundaries have to respect nesting. A jsonb_agg subquery carries its own
 * FROM, so stopping at the first one truncates the list mid-item and leaves a
 * fragment ending in the subquery's internal alias.
 */
function selectItems(sql) {
  const start = sql.search(/SELECT/i) + 6;
  const items = [];
  let depth = 0, quote = null, cur = '';

  for (let i = start; i < sql.length; i++) {
    const ch = sql[i];

    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;

    // The FROM that ends the select list is the one at depth 0.
    if (depth === 0 && /\s/.test(ch) && /^FROM\s/i.test(sql.slice(i + 1, i + 6))) break;

    if (ch === ',' && depth === 0) { items.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) items.push(cur.trim());
  return items;
}

/**
 * Work out, per output key, which column a write should target.
 *
 * Views come in two shapes depending on whether they join: single-table ones
 * say `invoice_no AS "invoiceNumber"`, joined ones say `o.order_no AS
 * "orderId"`. Both are writable. Anything whose expression is not a plain
 * column reference -- to_char(...), coalesce(...), a jsonb_agg subquery -- is
 * computed and cannot be written back, so it is recorded as derived.
 */
function parseViewDef(sql, tableColumns, table) {
  const map = {};
  const derived = [];

  // `FROM orders o` -> "o". Needed to tell a base-table column apart from one
  // pulled in by a LEFT JOIN, which is not writable through this view.
  const baseAlias = (sql.match(
    new RegExp(`FROM\\s+${table}\\s+([a-z_][a-z0-9_]*)`, 'i')) || [])[1] || null;

  for (const item of selectItems(sql)) {
    // Trailing `AS "alias"` / `AS alias`. Greedy, so it takes the LAST `AS` at
    // this level -- a jsonb_agg subquery contains its own `AS` and a lazy match
    // would mistake that inner one for the column's alias.
    const m = item.match(/^([\s\S]*)\s+AS\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s*$/i);
    const expr  = (m ? m[1] : item).trim();
    const alias = m ? (m[2] || m[3]) : null;

    // A plain column, optionally table-qualified. A cast is allowed only
    // because the views cast id to text; the underlying column is still real.
    const plain = expr.match(/^(?:[a-z_][a-z0-9_]*\.)?([a-z_][a-z0-9_]*)(?:::[a-z ]+)?$/i);

    // Dates and times are presented as formatted strings, but the column
    // underneath is a real date/time and Postgres accepts 'YYYY-MM-DD' straight
    // back into it. Look through the wrapping to_char()/coalesce() so these stay
    // writable -- treating `date` on an order as read-only would silently drop
    // it on every save.
    //
    // Only when the expression resolves to exactly ONE column of this table.
    // fs_bank_transactions.date coalesces two different columns, so there is no
    // single place to write it back to and it stays read-only, which is right.
    const source = plain ? plain[1] : (() => {
      // A subquery (items, stageHistory, notesList) builds its value out of a
      // different table entirely. Scanning it for identifiers would find the
      // join key -- `o.id` -- and happily map the array onto the primary key.
      // Nothing containing a SELECT is ever writable through the view.
      if (/\bSELECT\b/i.test(expr)) return null;

      const hits = new Set();
      for (const t of expr.matchAll(/(?:([a-z_][a-z0-9_]*)\.)?\b([a-z_][a-z0-9_]*)\b/gi)) {
        const [, qualifier, name] = t;
        // Skip columns reached through a join -- they live on another table.
        if (qualifier && baseAlias && qualifier !== baseAlias) continue;
        if (tableColumns.has(name)) hits.add(name);
      }
      return hits.size === 1 ? [...hits][0] : null;
    })();

    const key = alias || source;
    if (!key) continue;

    if (source && tableColumns.has(source)) map[key] = source;
    else derived.push(key);
  }

  return { map, derived: [...new Set(derived)] };
}

(async () => {
  const c = new Client({ connectionString: URI, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
  await c.connect();

  const out = {};
  const problems = [];

  for (const [collection, { view, table }] of Object.entries(COLLECTIONS)) {
    const cols = (await c.query(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name=$1`, [table])).rows.map(r => r.column_name);
    if (!cols.length) { problems.push(`${collection}: table ${table} not found`); continue; }
    const tableColumns = new Set(cols);

    let fields = {}, derived = [];
    if (view) {
      const def = (await c.query(`select pg_get_viewdef($1::regclass, true) d`, ['public.' + view])).rows[0].d;
      ({ map: fields, derived } = parseViewDef(def, tableColumns, table));
    } else {
      // No view: the app reads the table directly, so keys are already columns.
      for (const col of cols) fields[col] = col;
    }

    // `id` is always the row id; the views cast it to text.
    fields.id = fields.id || 'id';

    out[collection] = { view, table, fields, derived, columns: cols.sort() };
  }

  await c.end();

  const header = `/**
 * GENERATED FILE -- do not edit by hand.
 * Regenerate with: node scripts/gen-schema-map.cjs
 *
 * Maps each old Firestore collection onto the Supabase view it reads from and
 * the table it writes to, plus the camelCase -> column translation for writes.
 * Derived from the live view definitions, so renames such as
 * orderId -> order_no are exact rather than guessed.
 *
 * \`derived\` lists keys the view computes (joins, aggregates, formatted dates).
 * They can be read but never written, and db.js drops them from writes.
 */
`;

  const dest = path.join(ROOT, 'src', 'lib', 'schemaMap.js');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, header + '\nexport const SCHEMA_MAP = ' + JSON.stringify(out, null, 2) + ';\n\nexport default SCHEMA_MAP;\n');

  console.log('wrote ' + dest);
  for (const [k, v] of Object.entries(out))
    console.log('  ' + k.padEnd(20) + String(v.view || '(table)').padEnd(22) + '-> ' + v.table.padEnd(20)
      + Object.keys(v.fields).length + ' fields, ' + v.derived.length + ' derived');
  if (problems.length) { console.log('\nPROBLEMS:'); problems.forEach(p => console.log('  ' + p)); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

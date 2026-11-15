// A scratch database that has the order tables, their policies, 0063's fs_orders and a stand-in for Storage, built from the repo's own
// SQL text (not retyped), for the 0071 rehearsal (0071.test.mjs) and the local website-orders stand-in (website-orders-dev.mjs).
// It never connects to the live database.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildEnv } from "./env.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => fs.readFileSync(REPO + p, "utf8").replace(/\r\n/g, "\n");

export const MIGRATION_0071 = read("supabase/migrations/0071_website_orders.sql");
export const UNDO_0071 = read("supabase/undo/0071_website_orders.undo.sql");
const BASELINE = read("supabase/migrations/0000_baseline.sql");
const M0063 = read("supabase/migrations/0063_techpack_sheet_and_order_link.sql");

function baselineTable(name) {
  const m = BASELINE.match(new RegExp(`^create table if not exists ${name} \\(\\n[\\s\\S]*?^\\);`, "m"));
  if (!m) throw new Error("table not found in baseline: " + name);
  return m[0];
}
function baselinePolicies(table) {
  return BASELINE.match(new RegExp(`^create policy "[a-z_]+" on ${table}\\n[\\s\\S]*?;`, "gm")) || [];
}
/** fs_orders exactly as 0063 left it: the state the live database is in before 0071. */
export const VIEW_0063 = M0063.match(/create or replace view public\.fs_orders as[\s\S]*?alter view public\.fs_orders set \(security_invoker = on\);/)[0];

/**
 * The scratch database as it is BEFORE migration 0071: the people/permission tables and helpers (env.mjs), the order tables, the policies,
 * fs_orders as 0063 left it, a stand-in for Storage, and three orders the team entered. `seed: false` leaves the orders out.
 */
export async function freshOrdersDb({ seed = true } = {}) {
  const db = await buildEnv();
  for (const t of ["orders", "order_notes", "order_stage_history"]) await db.exec(baselineTable(t));
  await db.exec(`
    -- columns the later migrations added (0011 embellishments, 0024 sample_id, 0029 region, 0039 recipe_id, 0063 pattern_id)
    alter table orders add column embellishments text[] not null default '{}';
    alter table orders add column sample_id uuid;
    alter table orders add column region text;
    alter table orders add column recipe_id uuid;
    alter table orders add column pattern_id uuid;
    -- constraints as in the baseline (lines 598-599, 635-636, 639)
    alter table orders add constraint orders_pkey primary key (id);
    alter table orders add constraint orders_order_no_key unique (order_no);
    alter table order_notes add constraint order_notes_pkey primary key (id);
    alter table order_stage_history add constraint order_stage_history_pkey primary key (id);
    alter table order_notes add constraint order_notes_order_id_fkey foreign key (order_id) references orders(id) on delete cascade;
    alter table order_stage_history add constraint order_stage_history_order_id_fkey foreign key (order_id) references orders(id) on delete cascade;
    alter table orders enable row level security;
    alter table order_notes enable row level security;
    alter table order_stage_history enable row level security;
    -- the 'orders' permission section; the director gets it from the new-section trigger (0028), the mid-tier admin may read, staff may not
    insert into sections (id, label, sort_order) values ('orders', 'Orders', 3);
    insert into position_permissions (position_id, section_id, can_view, can_edit) values ('nepal_admin', 'orders', true, false)
      on conflict (position_id, section_id) do update set can_view = true, can_edit = false;
  `);
  for (const t of ["orders", "order_notes", "order_stage_history"]) for (const p of baselinePolicies(t)) await db.exec(p);
  await db.exec(VIEW_0063);
  await db.exec(`
    grant select, insert, update, delete on orders, order_notes, order_stage_history to authenticated, service_role;
    -- a stand-in for Supabase Storage (the real one is not modelled by the harness)
    create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner_id text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated, service_role;
    grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
    grant select on storage.buckets to anon, authenticated, service_role;
  `);
  if (seed) {
    await db.exec(`
      insert into orders (id, order_no, customer_name, style_name, colorway, fabric_type, quantity, price_per_pc_npr, total_value_npr, stage, status, order_date, delivery_date, notes, created_by, region)
      values
        ('00000000-0000-0000-0000-0000000000e1', 'ORD-001', 'Anita Traders', 'Polo', 'Navy', 'Jersey', 120, 800, 96000, 'Cutting', 'Active', '2026-10-01', '2026-11-20', 'first', 'Dina Director', 'nepal'),
        ('00000000-0000-0000-0000-0000000000e2', 'ORD-002', 'RetailCorp', 'Hoodie', 'Black', 'Fleece', 300, 1500, 450000, 'Order Received', 'Active', '2026-10-15', null, null, 'Nabin Admin', 'uk'),
        ('00000000-0000-0000-0000-0000000000e3', 'ORD-003', 'StyleBrand', 'Tee', 'White', 'Jersey', 50, 500, 25000, 'Delivered', 'Completed', '2026-09-01', '2026-09-30', 'done', 'Dina Director', null);
      insert into order_stage_history (order_id, stage, changed_at, changed_by, seq) values
        ('00000000-0000-0000-0000-0000000000e1', 'Order Received', '2026-10-01', 'Dina Director', 0),
        ('00000000-0000-0000-0000-0000000000e1', 'Cutting', '2026-10-05', 'Nabin Admin', 1);
      insert into order_notes (order_id, text, author) values ('00000000-0000-0000-0000-0000000000e1', 'fabric arrived', 'Nabin Admin');
    `);
  }
  return db;
}

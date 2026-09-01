-- ============================================================================
-- 0011_gaps_and_embellishment.sql
--
-- Two jobs:
--
--   1. The Embellishment stage. Commit d4093c0 added a sixth pipeline column
--      between Finishing & Pressing and Quality Check, plus an `embellishments`
--      array on the order. The database snapshot predates that commit, so
--      stage_config is one stage short and orders has nowhere to put the types.
--
--   2. The nine collections the app reads or writes that the migration left
--      behind. All nine are EMPTY in Firestore -- there is no data to carry
--      over, only the shape -- but the code paths are live, and a read against
--      a table that does not exist is a hard error rather than an empty list.
--      Two of them (order_assignments, order_costs) are genuine records, not
--      duplicates of columns already on `orders`: assignments are the dispatch
--      audit trail, costs are the per-order breakdown Finance replays for P&L.
--
-- The rewards trio (user_points, point_transactions, leaderboard) backs a
-- feature that is currently switched off at REWARDS_ENABLED in
-- src/utils/rewardService.js. The tables are created anyway because Dashboard
-- reads user_points whether or not the flag is set.
-- ============================================================================


-- ─── 1. Embellishment ──────────────────────────────────────────────────────

-- The types live on the order as an array, any combination of the three.
alter table orders add column if not exists embellishments text[] not null default '{}';

-- Open a gap at 5 before inserting, so the later stages keep their order.
-- Guarded so re-running cannot shunt everything along a second time.
do $$
begin
  if not exists (select 1 from stage_config where stage = 'Embellishment') then
    update stage_config set sort_order = sort_order + 1 where sort_order >= 5;
    insert into stage_config (stage, enabled, sort_order, timeout_hours, worker_names, worker_uids)
    values ('Embellishment', true, 5, 8, '{}', '{}');
  end if;
end $$;


-- ─── 2. Billing: challans ──────────────────────────────────────────────────

-- A challan is an invoice-shaped delivery note: same client/amount block, plus
-- the vehicle and route fields Billing.jsx strips from the other two doc types.
create table if not exists challans (
  id                uuid primary key default gen_random_uuid(),
  challan_no        text unique,
  linked_order_id   uuid references orders(id) on delete set null,
  client_name       text not null default '',
  client_address    text,
  client_phone      text,
  client_pan        text,
  currency          text not null default 'NPR',
  challan_date      date,
  fiscal_year       text,
  subtotal_npr      numeric(14,2) not null default 0,
  discount_pct      numeric(6,3)  not null default 0,
  discount_amt_npr  numeric(14,2) not null default 0,
  taxable_amt_npr   numeric(14,2) not null default 0,
  vat_amount_npr    numeric(14,2) not null default 0,
  total_npr         numeric(14,2) not null default 0,
  status            text not null default 'Draft',
  vehicle_no        text,
  driver_name       text,
  route_from        text,
  route_to          text,
  related_invoice   text,
  note              text,
  created_by        text,
  updated_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Challan lines join the existing line_items table rather than getting their
-- own, matching how invoices, quotations and purchases already share it.
alter table line_items add column if not exists challan_id uuid references challans(id) on delete cascade;
create index if not exists line_items_challan_id_idx on line_items(challan_id);

-- Billing allocates document numbers from `counters`; challans need their own.
alter table counters add column if not exists next_challan integer not null default 1;


-- ─── 3. Inventory: stock movements and samples ─────────────────────────────

-- Dated in/out ledger per item. Balance is always replayed from these rows,
-- never stored -- see the note at the top of src/utils/stockLedger.js.
create table if not exists stock_movements (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references inventory_items(id) on delete cascade,
  moved_on     date not null default current_date,
  qty          numeric(14,3) not null default 0,
  direction    text not null check (direction in ('in','out')),
  source       text not null default 'manual' check (source in ('manual','purchase','opening')),
  source_id    text,
  amount_npr   numeric(14,2),
  note         text,
  created_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists stock_movements_item_idx   on stock_movements(item_id, moved_on);
create index if not exists stock_movements_source_idx on stock_movements(source, source_id);

-- Physical sample garments. Distinct from `patterns`, which is the tech pack.
create table if not exists samples (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default '',
  product_type  text,
  stage         text not null default 'Proto',
  status        text not null default 'Pending',
  fabric_used   text,
  size          text,
  color         text,
  cost          numeric(14,2),
  photo_url     text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);


-- ─── 4. Finance: VAT bill attachments ──────────────────────────────────────

-- One uploaded bill image/PDF per expense or purchase. The file itself stays
-- in storage; this is the pointer plus who filed it.
create table if not exists vat_bills (
  id            uuid primary key default gen_random_uuid(),
  expense_id    text not null,
  expense_item  text,
  file_name     text,
  file_url      text,
  storage_path  text,
  file_type     text,
  source        text,
  uploaded_by   text,
  uploaded_at   timestamptz not null default now()
);
create index if not exists vat_bills_expense_idx on vat_bills(expense_id);


-- ─── 5. Orders: dispatch trail and cost breakdown ──────────────────────────

-- Every dispatch of an order to a worker, newest first. Production reads only
-- the latest row; keeping the history is the point.
create table if not exists order_assignments (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  person_id     uuid references people(id) on delete set null,
  assigned_to   text,
  stage         text,
  assigned_at   timestamptz not null default now(),
  assigned_by   text,
  note          text
);
create index if not exists order_assignments_order_idx on order_assignments(order_id, assigned_at desc);

-- Per-order cost breakdown, replayed by Finance for order-level P&L.
create table if not exists order_costs (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid references orders(id) on delete cascade,
  order_ref       text,
  fabric_npr      numeric(14,2) not null default 0,
  labour_npr      numeric(14,2) not null default 0,
  trims_npr       numeric(14,2) not null default 0,
  overhead_npr    numeric(14,2) not null default 0,
  other_npr       numeric(14,2) not null default 0,
  total_npr       numeric(14,2) not null default 0,
  note            text,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists order_costs_order_idx on order_costs(order_id);


-- ─── 6. Rewards (feature currently disabled) ───────────────────────────────

create table if not exists user_points (
  person_id      uuid primary key references people(id) on delete cascade,
  display_name   text,
  total_points   integer not null default 0,
  weekly_points  integer not null default 0,
  last_updated   timestamptz not null default now()
);

-- The primary key is the caller-built "uid:event:source" string, which is what
-- makes awarding idempotent -- a repeat award collides instead of double-paying.
create table if not exists point_transactions (
  id           text primary key,
  person_id    uuid references people(id) on delete cascade,
  event_type   text not null,
  source_id    text not null,
  points       integer not null default 0,
  reason       text,
  awarded_at   timestamptz not null default now()
);
create index if not exists point_transactions_person_idx on point_transactions(person_id, awarded_at desc);

-- Single-row cache ('current') holding the ranked arrays, mirroring the old
-- leaderboard/current document. Reads go to user_points; this is write parity.
create table if not exists leaderboard (
  id            text primary key,
  all_time      jsonb not null default '[]',
  weekly        jsonb not null default '[]',
  last_updated  timestamptz not null default now()
);


-- ─── 7. Row level security ─────────────────────────────────────────────────
--
-- Same three-policy shape every other table uses: a restrictive gate on the
-- token issuer, then section read/write. Gating each new table on the section
-- whose page actually opens it.

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('challans',           'billing'),
      ('stock_movements',    'inventory'),
      ('samples',            'inventory'),
      ('vat_bills',          'finance'),
      ('order_assignments',  'production'),
      ('order_costs',        'orders'),
      ('user_points',        'dashboard'),
      ('point_transactions', 'dashboard'),
      ('leaderboard',        'dashboard')
    ) as v(tbl, section)
  loop
    execute format('alter table %I enable row level security', t.tbl);

    execute format($f$
      create policy "require_known_issuer" on %I
        as restrictive for all to authenticated
        using (app_issuer_ok())$f$, t.tbl);

    execute format($f$
      create policy "sect_read" on %I
        as permissive for select to authenticated
        using (app_can_view(%L))$f$, t.tbl, t.section);

    execute format($f$
      create policy "sect_write" on %I
        as permissive for all to authenticated
        using (app_can_edit(%L)) with check (app_can_edit(%L))$f$, t.tbl, t.section, t.section);

    execute format('grant select, insert, update, delete on %I to anon, authenticated, service_role', t.tbl);
  end loop;
end $$;

-- Finance needs order costs for order-level P&L, but a finance-only position
-- has no `orders` grant. Add a second permissive read so either section opens
-- it -- permissive policies OR together.
create policy "finance_read" on order_costs
  as permissive for select to authenticated
  using (app_can_view('finance'));


-- ─── 8. Firestore-shaped views for the new tables ──────────────────────────
--
-- Same convention as 0010: camelCase keys, id as text, dates as YYYY-MM-DD
-- strings, so the app reads these exactly as it read the old collections.

create or replace view fs_challans as
  select c.id::text as id,
         c.challan_no                                    as "challanNumber",
         c.client_name                                   as "clientName",
         c.client_address                                as "clientAddress",
         c.client_phone                                  as "clientPhone",
         c.client_pan                                    as "clientPAN",
         c.currency,
         to_char(c.challan_date::timestamptz, 'YYYY-MM-DD') as date,
         c.fiscal_year                                   as "fiscalYear",
         c.subtotal_npr                                  as "subtotalNPR",
         c.discount_pct                                  as "discountPct",
         c.discount_amt_npr                              as "discountAmtNPR",
         c.taxable_amt_npr                               as "taxableAmtNPR",
         c.vat_amount_npr                                as "vatAmountNPR",
         c.total_npr                                     as "totalNPR",
         c.status,
         c.vehicle_no                                    as "vehicleNo",
         c.driver_name                                   as "driverName",
         c.route_from                                    as "routeFrom",
         c.route_to                                      as "routeTo",
         c.related_invoice                               as "relatedInvoice",
         c.note,
         c.created_by                                    as "createdBy",
         c.updated_by                                    as "updatedBy",
         c.created_at                                    as "createdAt",
         c.updated_at                                    as "updatedAt",
         coalesce((select jsonb_agg(jsonb_build_object(
                     'description', li.description,
                     'particulars', li.particulars,
                     'qty',  li.qty,
                     'unit', li.unit,
                     'rate', li.rate,
                     'amount', li.amount) order by li.seq)
                   from line_items li where li.challan_id = c.id), '[]'::jsonb) as items
    from challans c;

create or replace view fs_stock_movements as
  select m.id::text as id,
         m.item_id::text                                  as "itemId",
         to_char(m.moved_on::timestamptz, 'YYYY-MM-DD')   as date,
         m.qty,
         m.direction,
         m.source,
         m.source_id                                      as "sourceId",
         m.amount_npr                                     as "amountNPR",
         m.note,
         m.created_by                                     as "createdBy",
         m.created_at                                     as "createdAt"
    from stock_movements m;

create or replace view fs_samples as
  select s.id::text as id,
         s.name, s.product_type, s.stage, s.status,
         s.fabric_used, s.size, s.color, s.cost, s.photo_url, s.notes,
         s.created_at as "createdAt",
         s.updated_at as "updatedAt"
    from samples s;

create or replace view fs_vat_bills as
  select v.id::text as id,
         v.expense_id   as "expenseId",
         v.expense_item as "expenseItem",
         v.file_name    as "fileName",
         v.file_url     as "fileUrl",
         v.storage_path as "storagePath",
         v.file_type    as "fileType",
         v.source,
         v.uploaded_by  as "uploadedBy",
         v.uploaded_at  as "uploadedAt"
    from vat_bills v;

create or replace view fs_order_assignments as
  select a.id::text as id,
         a.order_id::text                     as "orderId",
         coalesce(pe.full_name, a.assigned_to) as "assignedTo",
         a.person_id::text                    as "personId",
         a.stage,
         a.assigned_at                        as "assignedAt",
         a.assigned_by                        as "assignedBy",
         a.note
    from order_assignments a
    left join people pe on pe.id = a.person_id;

create or replace view fs_order_costs as
  select c.id::text as id,
         c.order_id::text as "orderId",
         c.order_ref      as "orderRef",
         c.fabric_npr     as "fabricNPR",
         c.labour_npr     as "labourNPR",
         c.trims_npr      as "trimsNPR",
         c.overhead_npr   as "overheadNPR",
         c.other_npr      as "otherNPR",
         c.total_npr      as "totalNPR",
         c.note,
         c.created_by     as "createdBy",
         c.created_at     as "createdAt",
         c.updated_at     as "updatedAt"
    from order_costs c;

-- useLeaderboard keys rows by the document id, which was the Firebase uid.
-- Expose that as id so ranking keeps working unchanged.
create or replace view fs_user_points as
  select coalesce(pe.legacy_firebase_uid, up.person_id::text) as id,
         up.person_id::text as "personId",
         coalesce(up.display_name, pe.full_name) as "displayName",
         up.total_points  as "totalPoints",
         up.weekly_points as "weeklyPoints",
         up.last_updated  as "lastUpdated"
    from user_points up
    left join people pe on pe.id = up.person_id;

grant select on fs_challans, fs_stock_movements, fs_samples, fs_vat_bills,
                fs_order_assignments, fs_order_costs, fs_user_points
  to anon, authenticated, service_role;


-- ─── 9. Re-issue fs_orders with the embellishments array ───────────────────

create or replace view fs_orders as
  select o.id::text as id,
    o.order_no                    as "orderId",
    o.customer_name               as "customerName",
    o.style_name                  as "styleName",
    o.colorway,
    o.fabric_type                 as "fabricType",
    o.quantity,
    o.price_per_pc_npr            as "pricePerPcNPR",
    o.total_value_npr             as "totalValueNPR",
    o.fabric_cost_per_pc_npr      as "fabricCostPerPcNPR",
    o.fabric_grams_used           as "fabricGramsUsed",
    o.fabric_required_per_pc      as "fabricRequiredPerPc",
    o.material_cost_total_npr     as "materialCostTotalNPR",
    o.stage,
    o.status,
    to_char(o.order_date::timestamptz,    'YYYY-MM-DD') as date,
    to_char(o.delivery_date::timestamptz, 'YYYY-MM-DD') as "deliveryDate",
    coalesce(pe.full_name, '')    as "assignedTo",
    o.invoice_ref                 as "invoiceRef",
    o.sample_name                 as "sampleName",
    o.notes,
    o.created_by                  as "createdBy",
    o.created_at                  as "createdAt",
    coalesce((select jsonb_agg(jsonb_build_object(
                'stage', h.stage,
                'date',  to_char(h.changed_at::timestamptz, 'YYYY-MM-DD'),
                'by',    h.changed_by) order by h.seq)
              from order_stage_history h where h.order_id = o.id), '[]'::jsonb) as "stageHistory",
    coalesce((select jsonb_agg(jsonb_build_object(
                'id',   n.id::text,
                'text', n.text,
                'by',   n.author) order by n.created_at)
              from order_notes n where n.order_id = o.id), '[]'::jsonb) as "notesList",
    o.customer_id,
    o.assigned_to,
    -- appended rather than slotted next to `stage`: `create or replace view`
    -- can only add columns at the end, and the app reads by key, not position.
    o.embellishments
  from orders o
  left join people pe on pe.id = o.assigned_to;

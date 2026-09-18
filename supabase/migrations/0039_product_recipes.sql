-- ============================================================================
-- 0039_product_recipes.sql
--
-- Recipes (bill of materials) so that finishing a production order can take
-- the materials it used out of Inventory automatically.
--
--   * product_recipes  one row per product/style: how much of each material ONE
--                      piece uses, plus the fabric wastage percentage.
--   * orders           gains recipe_id, the recipe chosen when the order is created,
--                      and fs_orders is re-issued to expose it as "recipeId".
--   * stock_movements  gains source = 'production', for the "out" rows posted
--                      when an order's materials are deducted (source_id holds
--                      the order reference, e.g. ORD-051).
--
-- `lines` is a jsonb array, one object per material:
--   { "kind":    "fabric" | "trim" | "packaging",
--     "label":   "Main fabric",
--     "itemId":  uuid of the default inventory item, or null (fabric is chosen
--                per order because stock is tracked per colour),
--     "qty":     amount one piece uses (S to XL),
--     "qtyLarge": amount one XXL-and-above piece uses, or null for "same",
--     "unit":    "g" | "kg" | "m" | "pcs" }
-- Wastage applies to `fabric` lines only.
--
-- Recipes are edited by, and their stock deductions confirmed by, people with
-- the inventory section (same gate as stock_movements). Production can also READ
-- them, so whoever creates an order can pick one.
-- Safe to re-run.
-- ============================================================================

create table if not exists product_recipes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  wastage_pct  numeric(5,2) not null default 10
                 check (wastage_pct >= 0 and wastage_pct <= 100),
  lines        jsonb not null default '[]'::jsonb,
  notes        text,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One recipe per product name, case-insensitive, so "Oversized Tee" and
-- "oversized tee" cannot become two competing recipes.
create unique index if not exists product_recipes_name_key
  on product_recipes (lower(name));


-- ─── Row level security ────────────────────────────────────────────────────

alter table product_recipes enable row level security;

drop policy if exists "require_known_issuer" on product_recipes;
create policy "require_known_issuer" on product_recipes
  as restrictive for all to authenticated
  using (app_issuer_ok());

drop policy if exists "sect_read" on product_recipes;
create policy "sect_read" on product_recipes
  as permissive for select to authenticated
  using (app_can_view('inventory'));

drop policy if exists "production_read" on product_recipes;
create policy "production_read" on product_recipes
  as permissive for select to authenticated
  using (app_can_view('production'));

drop policy if exists "sect_write" on product_recipes;
create policy "sect_write" on product_recipes
  as permissive for all to authenticated
  using (app_can_edit('inventory')) with check (app_can_edit('inventory'));

grant select, insert, update, delete on product_recipes
  to anon, authenticated, service_role;


-- ─── Firestore-shaped view (camelCase keys, id as text) ────────────────────

create or replace view fs_product_recipes as
  select r.id::text as id,
         r.name,
         r.wastage_pct as "wastagePct",
         r.lines,
         r.notes,
         r.created_by  as "createdBy",
         r.created_at  as "createdAt",
         r.updated_at  as "updatedAt"
    from product_recipes r;

-- REPLACE drops reloptions (see 0018), so set it every time the view is defined.
alter view fs_product_recipes set (security_invoker = on);

grant select on fs_product_recipes to anon, authenticated, service_role;


-- ─── orders: the recipe an order uses ──────────────────────────────────────
--
-- Picked on the New Order form. Deleting a recipe leaves its orders alone (the
-- link is just cleared); past stock deductions are already in the ledger.

alter table orders
  add column if not exists recipe_id uuid references product_recipes(id) on delete set null;

-- Same definition as 0029 with "recipeId" appended. A view can only gain columns
-- at the END, and REPLACE drops reloptions (see 0018), so it is set again below.
create or replace view fs_orders as
  select o.id::text as id,
    o.order_no                as "orderId",
    o.customer_name           as "customerName",
    o.style_name              as "styleName",
    o.colorway,
    o.fabric_type             as "fabricType",
    o.quantity,
    o.price_per_pc_npr        as "pricePerPcNPR",
    o.total_value_npr         as "totalValueNPR",
    o.fabric_cost_per_pc_npr  as "fabricCostPerPcNPR",
    o.fabric_grams_used       as "fabricGramsUsed",
    o.fabric_required_per_pc  as "fabricRequiredPerPc",
    o.material_cost_total_npr as "materialCostTotalNPR",
    o.stage,
    o.status,
    to_char(o.order_date::timestamptz,    'YYYY-MM-DD') as date,
    to_char(o.delivery_date::timestamptz, 'YYYY-MM-DD') as "deliveryDate",
    coalesce(pe.full_name, '') as "assignedTo",
    o.invoice_ref             as "invoiceRef",
    o.sample_name             as "sampleName",
    o.notes,
    o.created_by              as "createdBy",
    o.created_at              as "createdAt",
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
    o.embellishments,
    o.sample_id::text         as "sampleId",
    o.region,
    o.recipe_id::text         as "recipeId"
  from orders o
  left join people pe on pe.id = o.assigned_to;
alter view fs_orders set (security_invoker = on);


-- ─── stock_movements: allow the 'production' source ────────────────────────

alter table stock_movements drop constraint if exists stock_movements_source_check;

alter table stock_movements add constraint stock_movements_source_check
  check (source in ('manual', 'purchase', 'opening', 'sale', 'production'));

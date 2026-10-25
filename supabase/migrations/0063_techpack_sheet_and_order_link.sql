-- ============================================================================
-- 0063_techpack_sheet_and_order_link.sql
--
-- Tech packs become the sheet the factory actually works from (the Cavalls Studio
-- "technical sheet": who it is for, a header, the views, close-up details, materials
-- with swatches, measurements drawn on the picture and set out per size, finishing,
-- notes) and an order is made FROM a tech pack.
--
--   patterns.customer_id    who the tech pack is for (a customer), null when unknown
--   patterns.brand          the label on the garment, printed at the top of the sheet
--   patterns.description    one or two lines about the garment
--   patterns.header_lines   extra facts for the header: [{ "label": "Fit", "value": "Fitted" }]
--   patterns.views          the pictures along the top: [{ id, kind, label, url }]
--   patterns.details        close-up photos with a caption: [{ id, url, caption }]
--   patterns.materials      [{ id, kind, name, spec, colour, swatchUrl, fabricId, itemId }]
--                           fabricId / itemId are reserved for the stock work that comes next
--   patterns.prints         artwork: [{ id, placement, url, colour, technique, width }]
--   patterns.construction   construction pictures: [{ id, url, caption }]
--   patterns.labelling      labels and hang tags: [{ id, url, caption }]
--   patterns.finishing      "Finishing and construction", one item to a line
--   patterns.measure_unit   'cm' or 'inch' for the numbers in `measurements`
--   patterns.brand_logo_url the brand's logo, optional
--   patterns.sheet_format   1 = made before this sheet existed (scanned pages, a few text boxes),
--                           2 = made on the sheet. A format 1 pack is never asked for more.
--   orders.pattern_id       the tech pack an order was made from (set null if the pack is deleted)
--
-- `measurements` and `notes` keep their columns. Each measurement object gains keys
-- (id, letter, bySize, view, line) beside the `label` and `inch` the first generation
-- wrote; `inch` always holds the number for the pack's reference size (patterns.spec_size),
-- so anything that still reads only label and inch keeps working.
--
-- Both views are re-issued with the new columns APPENDED (a view can only gain columns at
-- the end) and security invoker set again, because REPLACE drops reloptions (see 0018).
-- REPLACE keeps the privileges the views already have, so no grant is touched here.
--
-- Additive only: nothing is dropped or rewritten, no row changes except gaining the defaults.
-- Safe to run twice.
-- ============================================================================

-- ─── patterns ────────────────────────────────────────────────────────────────

alter table public.patterns
  add column if not exists customer_id    uuid references public.customers(id) on delete set null,
  add column if not exists brand          text,
  add column if not exists description    text,
  add column if not exists header_lines   jsonb not null default '[]'::jsonb,
  add column if not exists views          jsonb not null default '[]'::jsonb,
  add column if not exists details        jsonb not null default '[]'::jsonb,
  add column if not exists materials      jsonb not null default '[]'::jsonb,
  add column if not exists prints         jsonb not null default '[]'::jsonb,
  add column if not exists construction   jsonb not null default '[]'::jsonb,
  add column if not exists labelling      jsonb not null default '[]'::jsonb,
  add column if not exists finishing      text,
  add column if not exists measure_unit   text  not null default 'cm',
  add column if not exists brand_logo_url text,
  add column if not exists sheet_format   smallint not null default 1;

-- Separate statements so they also tighten a column an earlier run created.
alter table public.patterns drop constraint if exists patterns_measure_unit_ck;
alter table public.patterns add constraint patterns_measure_unit_ck check (measure_unit in ('cm', 'inch'));

alter table public.patterns drop constraint if exists patterns_sheet_format_ck;
alter table public.patterns add constraint patterns_sheet_format_ck check (sheet_format in (1, 2));

-- A write that sends an object where a list belongs would otherwise be stored and break every reader.
alter table public.patterns drop constraint if exists patterns_lists_ck;
alter table public.patterns add constraint patterns_lists_ck check (
      jsonb_typeof(header_lines) = 'array'
  and jsonb_typeof(views)        = 'array'
  and jsonb_typeof(details)      = 'array'
  and jsonb_typeof(materials)    = 'array'
  and jsonb_typeof(prints)       = 'array'
  and jsonb_typeof(construction) = 'array'
  and jsonb_typeof(labelling)    = 'array'
);

create index if not exists patterns_customer_idx on public.patterns (customer_id);

comment on column public.patterns.customer_id is 'The customer this tech pack is for. Null for older packs and ones made before the customer was known.';
comment on column public.patterns.sheet_format is '1 = made before the technical sheet existed, 2 = made on it (see migration 0063).';

-- ─── orders ──────────────────────────────────────────────────────────────────

alter table public.orders
  add column if not exists pattern_id uuid references public.patterns(id) on delete set null;

create index if not exists orders_pattern_idx on public.orders (pattern_id);

comment on column public.orders.pattern_id is 'The tech pack this order was made from. Set null (not deleted) if the tech pack is deleted.';

-- ─── Production reads tech packs (so whoever raises an order can pick one) ───
-- 0044 on the techpack-stock-wip branch added this and it is live; create it only where it is missing.

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'patterns' and policyname = 'production_read') then
    create policy production_read on public.patterns for select using (app_can_view('production'));
  end if;
end $$;

-- ─── fs_patterns: the same columns as before, the new ones at the end ────────

create or replace view public.fs_patterns as
  select id::text as id,
    style_no          as "styleNo",
    name,
    product_type,
    category,
    season,
    market,
    designer_name     as "designerName",
    sizes_available,
    available_colors,
    spec_size         as "specSize",
    to_char(spec_date::timestamptz, 'YYYY-MM-DD') as "specDate",
    trims,
    wash_care         as "washCare",
    remarks,
    notes,
    measurements,
    fabric_rows       as "fabricRows",
    front_sketch_url  as "frontSketchUrl",
    back_sketch_url   as "backSketchUrl",
    tech_pack_url,
    tech_pack_images,
    created_at        as "createdAt",
    updated_at        as "updatedAt",
    region,
    callouts,
    wastage_pct       as "wastagePct",
    customer_id::text as "customerId",
    brand,
    description,
    header_lines      as "headerLines",
    views,
    details,
    materials,
    prints,
    construction,
    labelling,
    finishing,
    measure_unit      as "measureUnit",
    brand_logo_url    as "brandLogoUrl",
    sheet_format      as "sheetFormat"
  from public.patterns;
alter view public.fs_patterns set (security_invoker = on);

-- ─── fs_orders: the same as 0039 left it, "patternId" at the end ─────────────

create or replace view public.fs_orders as
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
      from public.order_stage_history h where h.order_id = o.id), '[]'::jsonb) as "stageHistory",
    coalesce((select jsonb_agg(jsonb_build_object(
        'id',   n.id::text,
        'text', n.text,
        'by',   n.author) order by n.created_at)
      from public.order_notes n where n.order_id = o.id), '[]'::jsonb) as "notesList",
    o.customer_id,
    o.assigned_to,
    o.embellishments,
    o.sample_id::text         as "sampleId",
    o.region,
    o.recipe_id::text         as "recipeId",
    o.pattern_id::text        as "patternId"
  from public.orders o
  left join public.people pe on pe.id = o.assigned_to;
alter view public.fs_orders set (security_invoker = on);

-- ============================================================================
-- 0044_techpack_callouts_and_measurements.sql
--
-- Turns a tech pack from a printed sheet into something that can drive stock.
--
-- Today a tech pack describes its materials in two free-text boxes (fabric_rows
-- and trims), which a person reads and a computer cannot. To deduct stock
-- automatically we need to know, per garment part: which stock item or library
-- fabric it draws from, how much, and how that changes by size.
--
-- The editor collects that by tapping the front/back photo, the way mrch.tech
-- labels a garment's construction zones -- so each dot on the picture IS one
-- line of the bill of materials. Nothing here is found automatically; a person
-- places every dot.
--
--   * patterns.callouts     the dots. One object per material line.
--   * patterns.wastage_pct  fabric wastage, default 10 (the flat rate the
--                           factory applies to every order). Fabric lines only.
--   * measurement_templates reusable lists of measurement point names, so
--                           "T-Shirt" or "Hoodie" fills the label column and
--                           staff only type numbers.
--
-- A callout object:
--   { "id":        "uuid",
--     "side":      "front" | "back",
--     "x": 0.42, "y": 0.31,     fractions of the image, never pixels, so a dot
--                               lands in the same place on any screen
--     "n":         1,           the number shown on the picture and in the list
--     "label":     "CF zipper",
--     "kind":      "fabric" | "trim" | "packaging",
--     "itemId":    uuid of an inventory item, or null
--     "fabricId":  uuid of a fabrics row, or null -- used when the colour is
--                  only known once an order exists, which is the usual case for
--                  fabric, rib and thread
--     "qtyBySize": { "S": 0.28, "M": 0.30, ... } amount ONE piece uses
--     "unit":      "g" | "kg" | "m" | "pcs",
--     "fromStock": true | false -- false for things the factory never buys, ie
--                  buttons, which the button-attaching vendor supplies. They
--                  still belong on the tech pack; they must never deduct.
--     "colorHex":  sampled from the pixel under the dot, a suggestion only,
--     "note":      "" }
--
-- measurements (an existing jsonb column, empty on all 32 tech packs today) now
-- also carries per-size numbers and, optionally, the two points on the photo
-- that the measurement is taken between:
--   { "label": "Chest",
--     "inch":  "21",                        kept, and kept in step with the
--                                           spec size, because the PRINTED
--                                           spec sheet reads this and its
--                                           output must not change
--     "bySize": { "S": 20, "M": 21, ... },  typed from the real garment
--     "line":  { "side": "front", "x1":.., "y1":.., "x2":.., "y2":.. } | null }
--
-- No shape change is needed for that -- measurements is already jsonb -- so it
-- is documented here rather than altered.
--
-- Safe to re-run.
-- ============================================================================

-- ─── patterns: the dots, and the wastage rate ───────────────────────────────

alter table patterns
  add column if not exists callouts    jsonb         not null default '[]'::jsonb,
  add column if not exists wastage_pct numeric(5,2)  not null default 10;

comment on column patterns.callouts is
  'Material callouts placed on the front/back photo. One object per BOM line -- see migration 0044 for the shape.';
comment on column patterns.wastage_pct is
  'Fabric wastage added to every order, as a percentage. Applies to callouts of kind=fabric only. The factory uses a flat 10%.';

-- Production needs to READ tech packs so that whoever raises an order can pick
-- one; editing stays with the library section. Mirrors the policy 0039 put on
-- product_recipes.
drop policy if exists production_read on patterns;
create policy production_read on patterns
  for select using (app_can_view('production'));


-- ─── measurement_templates ──────────────────────────────────────────────────
--
-- A named list of measurement point names. Applying one fills the label column
-- of a tech pack's measurement grid so staff only type numbers. Labels only --
-- no positions, because where a point sits depends on the photo.

create table if not exists measurement_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  product_type text,
  market       text,
  labels       jsonb not null default '[]'::jsonb,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Two templates called "T-Shirt" would be indistinguishable in the dropdown.
create unique index if not exists measurement_templates_name_idx
  on measurement_templates (lower(name));

alter table measurement_templates enable row level security;

drop policy if exists require_known_issuer on measurement_templates;
create policy require_known_issuer on measurement_templates
  using (app_issuer_ok());

drop policy if exists sect_read on measurement_templates;
create policy sect_read on measurement_templates
  for select using (app_can_view('library'));

drop policy if exists sect_write on measurement_templates;
create policy sect_write on measurement_templates
  for all using (app_can_edit('library'));

drop policy if exists production_read on measurement_templates;
create policy production_read on measurement_templates
  for select using (app_can_view('production'));

create or replace view fs_measurement_templates as
  select id::text as id,
    name,
    product_type,
    market,
    labels,
    created_by as "createdBy",
    created_at as "createdAt",
    updated_at as "updatedAt"
  from measurement_templates;
alter view fs_measurement_templates set (security_invoker = on);

grant select, insert, update, delete on fs_measurement_templates to anon, authenticated, service_role;


-- ─── fs_patterns: expose callouts and the wastage rate ──────────────────────
--
-- Same definition as before with the new columns appended. A view can only gain
-- columns at the END, and REPLACE drops reloptions (see 0018), so security
-- invoker is set again below.

create or replace view fs_patterns as
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
    wastage_pct       as "wastagePct"
  from patterns;
alter view fs_patterns set (security_invoker = on);

grant select, insert, update, delete on fs_patterns to anon, authenticated, service_role;

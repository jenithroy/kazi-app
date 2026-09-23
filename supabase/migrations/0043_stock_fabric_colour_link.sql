-- ============================================================================
-- 0043_stock_fabric_colour_link.sql
--
-- Joins a stock item to the fabric it is made of, and to the colour it is in.
--
-- Today the Materials & Fabrics library (59 rows: composition, GSM, price,
-- available colours) and Inventory (11 rows: quantities) know nothing about
-- each other, and a stock item carries no colour at all. That gap is why a
-- tech pack cannot say "this style uses Polyester Knitted Fabric" and have an
-- order in black resolve it to the roll of black polyester knit that stock
-- should actually come out of. Without it the whole tech-pack-to-deduction
-- chain would rest on matching name strings, which is exactly what has already
-- failed on the purchases side (of 447 purchase lines, six ever matched).
--
-- The model this establishes:
--
--   fabrics          a KIND of material -- "Polyester Knitted Fabric, 180 GSM"
--   inventory_items  that kind in ONE colour -- the physical thing you count,
--                    buy more of, and deduct from
--
-- So several inventory items point at one fabric row, one per colour held.
-- Thread and rib belong in the library too, for the same reason: they vary by
-- colour exactly as fabric does.
--
--   * inventory_items.fabric_id   the library row, or null for anything that is
--                                 not a library material (a laptop, packaging)
--   * inventory_items.color       the colour name, matched against the library
--                                 row's available_colors where one is set
--   * inventory_items.color_hex   optional swatch, for showing the colour
--
-- Nothing is made NOT NULL and nothing is backfilled: every existing item stays
-- exactly as valid as it is today, and filing them under a fabric is data entry
-- that happens when someone gets to it.
--
-- Safe to re-run.
-- ============================================================================

-- ─── inventory_items: which fabric, which colour ────────────────────────────

alter table inventory_items
  add column if not exists fabric_id uuid references fabrics(id) on delete set null,
  add column if not exists color     text,
  add column if not exists color_hex text;

-- "Every item made of this fabric" is the lookup the order form will run each
-- time a colour is chosen, so it gets an index rather than a sequential scan.
create index if not exists inventory_items_fabric_idx on inventory_items(fabric_id);

comment on column inventory_items.fabric_id is
  'The Materials & Fabrics row this item is made of. One fabric, many items -- one per colour stocked.';
comment on column inventory_items.color is
  'Colour of this particular stock item. Fabric stock is tracked per colour: black and navy of one fabric are separate items with separate balances.';


-- ─── fs_inventory: expose the three new columns ─────────────────────────────
--
-- Same definition as 0029 with the new columns appended. A view can only gain
-- columns at the END, and REPLACE drops reloptions (see 0018), so security
-- invoker is set again below.

create or replace view fs_inventory as
  select id::text as id,
    item_ref        as "itemId",
    item,
    category,
    unit,
    supplier,
    location,
    condition,
    owner,
    opening_stock   as "openingStock",
    stock_in        as "stockIn",
    stock_used      as "stockUsed",
    min_level       as "minLevel",
    unit_cost_npr   as "unitCostNPR",
    size_rows       as "sizeRows",
    damage_log      as "damageLog",
    to_char(last_updated::timestamptz, 'YYYY-MM-DD') as "lastUpdated",
    created_by      as "createdBy",
    updated_by      as "updatedBy",
    created_at      as "createdAt",
    region,
    fabric_id       as "fabricId",
    color,
    color_hex       as "colorHex"
  from inventory_items;
alter view fs_inventory set (security_invoker = on);

grant select on fs_inventory to anon, authenticated, service_role;

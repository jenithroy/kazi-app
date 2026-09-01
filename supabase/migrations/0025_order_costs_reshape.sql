-- ============================================================================
-- 0025_order_costs_reshape.sql
--
-- order_costs was created in 0011 with a guessed shape — fabric/labour/trims/
-- overhead/other — because the Firestore collection was empty and Finance,
-- the page that writes it, had not been converted yet. Now that it has, the
-- real shape is visible: material, labour, overhead, shipping.
--
-- It is also keyed by the human order reference (ORD-051), not the order's
-- uuid: saveOplCosts() writes one row per order ref and the P&L table reads
-- them back by the same key. That gets a unique constraint so the upsert has
-- something to conflict on, and so an order cannot accumulate several
-- competing cost rows.
--
-- The table is empty, so this reshapes rather than migrates.
-- ============================================================================

-- The view selects the columns being dropped, so it has to go first.
drop view if exists fs_order_costs;

alter table order_costs
  add column if not exists material_npr numeric(14,2) not null default 0,
  add column if not exists shipping_npr numeric(14,2) not null default 0;

-- Guessed columns nothing reads or writes.
alter table order_costs
  drop column if exists fabric_npr,
  drop column if exists trims_npr,
  drop column if exists other_npr;

-- order_ref is the key the app upserts on.
update order_costs set order_ref = id::text where order_ref is null;
alter table order_costs alter column order_ref set not null;

alter table order_costs drop constraint if exists order_costs_order_ref_key;
alter table order_costs add constraint order_costs_order_ref_key unique (order_ref);

create view fs_order_costs as
  select c.id::text as id,
         c.order_ref      as "orderId",   -- the app's key, e.g. ORD-051
         c.order_ref      as "orderRef",
         c.order_id::text as "linkedOrderId",
         c.material_npr   as material,
         c.labour_npr     as labour,
         c.overhead_npr   as overhead,
         c.shipping_npr   as shipping,
         c.total_npr      as "totalNPR",
         c.note,
         c.created_by     as "createdBy",
         c.created_at     as "createdAt",
         c.updated_at     as "updatedAt"
    from order_costs c;
alter view fs_order_costs set (security_invoker = on);

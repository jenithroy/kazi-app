-- ============================================================================
-- 0071_website_orders.undo.sql
--
-- Takes back 0071_website_orders.sql: fs_orders goes back to exactly what 0063 left (every order, without
-- the four new columns), the orders columns (source, web_ref, web_data, web_seen_at, web_seen_by,
-- web_ip_hash) and their indexes and constraints are dropped, and so are ingest_website_order(),
-- website_order_limits_ok(), the WEB- number sequence and the storage policy.
--
-- DESTRUCTIVE once the website has sent orders: they are customers' requests (contact details, logos). The first
-- block refuses to run while any exist. To go ahead anyway, export them first (select * from fs_orders where source = 'website'). The
-- refusal leaves your session in an aborted transaction, so then, in the same session:
--
--     rollback;
--     set kazi.confirm_drop_website_orders = 'yes';
--
-- and run this file again; the website orders are then deleted (with their stage lines and notes) and everything above is undone.
--
-- NOT undone: the storage bucket `website-orders` and the files in it. Supabase refuses to delete a bucket with SQL
-- (use the Storage page, after the files are no longer wanted). Left alone it is a private, empty-by-default bucket that nothing reads.
--
-- If anything else was built on fs_orders since 0071, DROP VIEW refuses (it has no CASCADE) and nothing is changed.
-- Safe to run when the migration was never applied.
-- ============================================================================

begin;
set local lock_timeout = '10s';

do $guard$
declare
  has_rows boolean := false;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'source') then
    lock table public.orders in share row exclusive mode;
    execute 'select exists (select 1 from public.orders where source = ''website'')' into has_rows;
    if has_rows then
      if coalesce(current_setting('kazi.confirm_drop_website_orders', true), '') <> 'yes' then
        raise exception
          'Website orders exist (they are customers'' requests). Export them first, then run  rollback;  set kazi.confirm_drop_website_orders = ''yes'';  and this file again.'
          using errcode = 'check_violation';
      end if;
      delete from public.orders where source = 'website';          -- their stage lines and notes go with them (ON DELETE CASCADE)
    end if;
  end if;
end $guard$;

-- The view (fs_orders is dropped and made again because REPLACE cannot take its four new columns away).
drop view if exists public.fs_orders;

-- fs_orders as 0063 left it.
create view public.fs_orders as
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

comment on view public.fs_orders is
  'Firestore-shaped read model for orders. Runs as the caller (security_invoker), '
  'so row level security on `orders` applies. Re-apply that setting after any '
  'CREATE OR REPLACE — it silently drops reloptions. See migration 0018.';

-- the privileges the view had before (what the baseline records)
grant delete, insert, references, select, trigger, truncate, update on public.fs_orders to anon;
grant delete, insert, references, select, trigger, truncate, update on public.fs_orders to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.fs_orders to service_role;

drop function if exists public.ingest_website_order(jsonb);
drop function if exists public.website_order_limits_ok(text, text);
drop sequence if exists public.web_order_seq;
drop policy if exists website_orders_read on storage.objects;

drop index if exists public.orders_web_recent_idx;
drop index if exists public.orders_web_ref_key;
alter table public.orders drop constraint if exists orders_website_has_key;
alter table public.orders drop constraint if exists orders_source_check;
alter table public.orders drop column if exists web_ip_hash;
alter table public.orders drop column if exists web_seen_by;
alter table public.orders drop column if exists web_seen_at;
alter table public.orders drop column if exists web_data;
alter table public.orders drop column if exists web_ref;
alter table public.orders drop column if exists source;

commit;

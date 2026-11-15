-- ============================================================================
-- 0071_website_orders.sql
--
-- Orders that customers place on the website (kazimanufacturing.com: the quote forms and
-- "Create by design") arrive here as ordinary orders that are marked as coming from the site.
-- The Worker (worker/lib/websiteOrders.js) is the only writer: it calls ingest_website_order()
-- with its service key. See WEBSITE_ORDERS.md for the whole picture.
--
-- What this adds:
--
--   1. orders.source        'dashboard' (default: everything that exists today) or 'website'
--      orders.web_ref       the website's own key for the order (a uuid made in the customer's browser)
--                           and the reason a resend is harmless: one row per key (unique index)
--      orders.web_data      what the website sent: contact, brand, items, design facts, file paths
--      orders.web_seen_at   null until a member of staff has looked at the order; web_seen_by says who
--      orders.web_ip_hash   a salted hash of the sender's address, for the rate limits only; no view shows it
--
--   2. THE VIEW. fs_orders is what every page reads (Production, Sales, the four dashboards, Finance,
--      Customers, the Telegram summaries, Kazi), and it keeps showing EVERY order: a website order is
--      a real order everywhere in the app, counted like any other. It gains four columns, appended at the
--      end (a view can only gain columns there): "source", "webSeenAt", "webSeenBy" and "web" (the website's
--      details). Nothing else about it changes, and while there are no website orders it returns exactly
--      the rows, in the columns, it returned before. Only the Production page hides the website's orders by
--      default (its own "Where from" choice, decided in the browser from "source"); no other page does.
--      The view is still written straight over `orders o`: scripts/gen-schema-map.cjs reads the column
--      behind each field out of a view's definition.
--
--   3. ingest_website_order(p jsonb): the one door in. One transaction: checks the shape, takes the
--      next number WEB-001... (its own sequence, so it can never collide with the ORD-nnn numbers the
--      Production page makes in the browser), writes the order, its first stage line and the customer's
--      message as the first note. Callable by the service role only.
--
--   4. A private storage bucket `website-orders` (logo, embroidery file, preview), readable by people
--      who can see orders. Nobody can write to it from a browser; the Worker writes with its key.
--
-- Decisions, so nobody has to rediscover them:
--
--   * RESENDS. The same `key` returns the order that exists ("duplicate": true) and writes nothing. An
--     advisory lock on the key makes two requests that arrive together behave the same way.
--   * LIMITS live here, not only in the Worker, so they hold whoever calls: 10 orders an hour from one
--     address (the Worker sends a salted hash, never the address), 5 an hour for one e-mail, 120 an hour
--     in all. They count website orders only. They are one small read-only function,
--     website_order_limits_ok(), which ingest_website_order() asks and the Worker asks first, so a flood
--     is turned away before any file is stored. `replay: true` (the Worker sets it only when the caller
--     proved it holds WEBSITE_ORDERS_REPLAY_SECRET) skips them, for re-sending old quotes.
--     A refused call raises SQLSTATE PT429, which PostgREST turns into HTTP 429.
--   * The address hash has a column of its own (web_ip_hash) because the limits need it; no view selects it,
--     so nobody reading orders through the app ever sees it.
--   * A website order starts at stage "Order Received", status "Active", created by "Website", with
--     price 0: staff set the price after they have looked at the logo and spoken to the customer.
--     It has no customer_id (a public form must not be able to add or link customers); the contact is in "web".
--   * Nothing is deleted or rewritten. Every existing order gains source = 'dashboard'.
--
-- Applied by hand, one file at a time. Rehearsed first: scripts/rehearse-migration/0071.test.mjs.
-- Undo: supabase/undo/0071_website_orders.undo.sql. Safe to run twice.
-- ============================================================================

-- --- 1. The columns -------------------------------------------------------------

alter table public.orders add column if not exists source       text not null default 'dashboard';
alter table public.orders add column if not exists web_ref      uuid;
alter table public.orders add column if not exists web_data     jsonb;
alter table public.orders add column if not exists web_seen_at  timestamptz;
alter table public.orders add column if not exists web_seen_by  text;
alter table public.orders add column if not exists web_ip_hash  text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_source_check') then
    alter table public.orders add constraint orders_source_check check (source in ('dashboard', 'website'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_website_has_key') then
    alter table public.orders add constraint orders_website_has_key check (source <> 'website' or web_ref is not null);
  end if;
end $$;

create unique index if not exists orders_web_ref_key on public.orders (web_ref) where web_ref is not null;
create index if not exists orders_web_recent_idx on public.orders (created_at desc) where source = 'website';

comment on column public.orders.source is
  'Where the order came from: dashboard (a person entered it) or website (a customer sent it through kazimanufacturing.com).';
comment on column public.orders.web_ref is
  'Website orders: the key the customer''s browser made for the order. One row per key, so a resend never makes a second order.';
comment on column public.orders.web_data is
  'Website orders: what the website sent (contact, brand, items, design facts, files in the website-orders bucket).';
comment on column public.orders.web_seen_at is
  'Website orders: when a member of staff first opened the order. Null = new.';
comment on column public.orders.web_seen_by is
  'Website orders: who opened it first.';
comment on column public.orders.web_ip_hash is
  'Website orders: a salted hash of the sender''s address, kept only so the hourly limits can count. Not exposed by any view.';

create sequence if not exists public.web_order_seq as bigint start with 1;
revoke all on sequence public.web_order_seq from anon, authenticated;


-- --- 2. The view -------------------------------------------------------------------
-- fs_orders: the select list is exactly what 0063 left, plus the four new columns at the end. No WHERE: every order, as before.
-- REPLACE keeps the privileges the view already has, so no grant is touched here; it drops reloptions, so security_invoker is set again.

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
    o.pattern_id::text        as "patternId",
    o.source,
    o.web_seen_at             as "webSeenAt",
    o.web_seen_by             as "webSeenBy",
    o.web_data                as web
  from public.orders o
  left join public.people pe on pe.id = o.assigned_to;
alter view public.fs_orders set (security_invoker = on);

comment on view public.fs_orders is
  'Firestore-shaped read model for orders. Runs as the caller (security_invoker), so row level security on `orders` applies. '
  'Re-apply that setting after any CREATE OR REPLACE: it silently drops reloptions (migration 0018). '
  'Every order, the team''s and the website''s (source = ''website''); since 0071 it also carries source, webSeenAt, webSeenBy and web.';


-- --- 3. The limits, and the door in -------------------------------------------------

-- Whether one more website order may be taken now, from this address hash and this e-mail. Read-only.
create or replace function public.website_order_limits_ok(p_ip text, p_email text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    (coalesce(p_ip, '') = ''
       or (select count(*) from public.orders
            where source = 'website' and created_at > now() - interval '1 hour' and web_ip_hash = p_ip) < 10)
    and (coalesce(p_email, '') = ''
       or (select count(*) from public.orders
            where source = 'website' and created_at > now() - interval '1 hour' and lower(web_data #>> '{contact,email}') = lower(p_email)) < 5)
    and (select count(*) from public.orders
          where source = 'website' and created_at > now() - interval '1 hour') < 120;
$fn$;

comment on function public.website_order_limits_ok(text, text) is
  'Whether one more website order may be taken now: under 10 an hour from the address hash, 5 for the e-mail, 120 in all. Used by ingest_website_order() and, first, by the Worker. See migration 0071.';

revoke all on function public.website_order_limits_ok(text, text) from public, anon, authenticated;
grant execute on function public.website_order_limits_ok(text, text) to service_role;

create or replace function public.ingest_website_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_key     uuid;
  v_found   public.orders%rowtype;
  v_qty     numeric;
  v_no      text;
  v_id      uuid;
  v_today   date := (now() at time zone 'Asia/Kathmandu')::date;
  v_web     jsonb;
  v_ip      text;
  v_email   text;
  v_replay  boolean := false;
  v_name    text;
  v_style   text;
  v_colour  text;
  v_notes   text;
  v_message text;
  v_author  text;
  v_due     date := null;
  v_emb     text[];
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid: body' using errcode = 'PT400';
  end if;

  begin
    v_key := (p ->> 'key')::uuid;
  exception when others then
    v_key := null;
  end;
  if v_key is null then
    raise exception 'invalid: key' using errcode = 'PT400';
  end if;

  -- two requests with the same key that arrive together take turns, so the second one finds the first one's order
  perform pg_advisory_xact_lock(hashtextextended('website-order:' || v_key::text, 0));

  select * into v_found from public.orders where web_ref = v_key;
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'id', v_found.id, 'ref', v_found.order_no);
  end if;

  begin
    v_qty := (p ->> 'quantity')::numeric;
  exception when others then
    v_qty := null;
  end;
  if v_qty is null or v_qty < 1 or v_qty > 1000000 or v_qty <> trunc(v_qty) then
    raise exception 'invalid: quantity' using errcode = 'PT400';
  end if;

  v_web := case when jsonb_typeof(p -> 'web') = 'object' then p -> 'web' else '{}'::jsonb end;
  if pg_column_size(v_web) > 200000 then
    raise exception 'invalid: web is too large' using errcode = 'PT400';
  end if;

  v_ip := nullif(left(coalesce(p ->> 'ip_hash', ''), 128), '');
  v_email := lower(left(coalesce(v_web #>> '{contact,email}', ''), 254));
  v_replay := coalesce(p ->> 'replay', 'false') = 'true';

  if not v_replay and not public.website_order_limits_ok(v_ip, v_email) then
    raise exception 'rate_limited' using errcode = 'PT429';
  end if;

  -- text: control characters out, trimmed, capped (the Worker has already done the same; this is the last line)
  v_name    := left(btrim(regexp_replace(coalesce(p ->> 'customer_name', ''), '[[:cntrl:]]+', ' ', 'g')), 160);
  v_style   := left(btrim(regexp_replace(coalesce(p ->> 'style_name', ''), '[[:cntrl:]]+', ' ', 'g')), 160);
  v_colour  := left(btrim(regexp_replace(coalesce(p ->> 'colorway', ''), '[[:cntrl:]]+', ' ', 'g')), 80);
  v_notes   := left(btrim(regexp_replace(coalesce(p ->> 'notes', ''), '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]+', ' ', 'g')), 4000);
  v_message := left(btrim(regexp_replace(coalesce(p ->> 'message', ''), '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]+', ' ', 'g')), 4000);
  v_author  := left(btrim(regexp_replace(coalesce(v_web #>> '{contact,name}', ''), '[[:cntrl:]]+', ' ', 'g')), 120);
  if v_name = '' then v_name := 'Website customer'; end if;

  begin
    v_due := nullif(p ->> 'delivery_date', '')::date;
  exception when others then
    v_due := null;
  end;

  select coalesce(array_agg(distinct e order by e), '{}'::text[]) into v_emb
    from jsonb_array_elements_text(
           case when jsonb_typeof(p -> 'embellishments') = 'array' then p -> 'embellishments' else '[]'::jsonb end) e
   where e in ('Buttoning', 'DTF', 'Embroidery');

  v_no := 'WEB-' || lpad(nextval('public.web_order_seq')::text, 3, '0');

  insert into public.orders
    (order_no, customer_name, style_name, colorway, quantity, price_per_pc_npr, total_value_npr,
     stage, status, order_date, delivery_date, notes, created_by, embellishments, source, web_ref, web_data, web_ip_hash)
  values
    (v_no, v_name, nullif(v_style, ''), nullif(v_colour, ''), v_qty, 0, 0,
     'Order Received', 'Active', v_today, v_due, nullif(v_notes, ''), 'Website', v_emb, 'website', v_key, v_web, v_ip)
  returning id into v_id;

  insert into public.order_stage_history (order_id, stage, changed_at, changed_by, seq)
  values (v_id, 'Order Received', v_today, 'Website', 0);

  if v_message <> '' then
    insert into public.order_notes (order_id, text, author)
    values (v_id, v_message, case when v_author <> '' then v_author || ' (website)' else 'Website customer' end);
  end if;

  return jsonb_build_object('ok', true, 'duplicate', false, 'id', v_id, 'ref', v_no);
end;
$fn$;

comment on function public.ingest_website_order(jsonb) is
  'The one door for website orders (called by the Worker with the service key). Idempotent on p.key; rate-limited (PT429); see migration 0071.';

-- Supabase opens every new function to anon and authenticated as well: close it to everybody but the Worker's key.
revoke all on function public.ingest_website_order(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_website_order(jsonb) to service_role;


-- --- 4. The files -------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'website-orders', 'website-orders', false, 6291456,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf', 'application/octet-stream']
)
on conflict (id) do nothing;

drop policy if exists website_orders_read on storage.objects;
create policy website_orders_read on storage.objects
  for select to authenticated
  using (bucket_id = 'website-orders' and (select public.app_can_view('orders')));

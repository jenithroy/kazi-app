-- ============================================================================
-- 0032_activity_log.sql
--
-- Nobody can currently answer the simplest questions about the ERP itself:
-- who actually signs in, which pages earn their place, whether the module
-- somebody asked for last quarter has ever been opened since. Every table
-- records what the *business* did; none records what the *software* did.
--
-- `activity_events` is that record. One row per thing a person did — opened a
-- page, saved an invoice, deleted a task — stamped with who they are by the
-- database rather than by the client, because a usage log the client can
-- forge is worth nothing.
--
-- Three deliberate choices:
--
--   1. Append-only. There is no update or delete policy, so a row cannot be
--      quietly rewritten or removed through the API. The one exception is
--      `duration_ms`, which is null when a page is opened and filled in when
--      the person leaves it — a trigger enforces that nothing else may change.
--      Trimming old history is a SECURITY DEFINER function that checks rank.
--
--   2. The actor is stamped server-side from app_person_id(). The client says
--      what happened; the database says who did it. `person_name` is a
--      snapshot taken at insert so history stays readable after someone leaves
--      the company and their `people` row is edited or removed.
--
--   3. Reading it is a section of its own — `usage_analytics` — so it lands in
--      the Admin Panel's permission matrix like every other page and is
--      granted, not assumed. It is off for everyone except tier-4 roles, which
--      the trigger from 0028 fills in automatically when the section row below
--      is inserted.
--
-- Volume: thirteen active people, a page view and a save at a time. This is a
-- few thousand rows a month, which is why it is an ordinary table with two
-- indexes rather than anything cleverer.
-- ============================================================================


-- --- 1. The log ------------------------------------------------------------

create table if not exists activity_events (
  id          uuid primary key default gen_random_uuid(),
  -- Set null rather than cascade: losing a person must not erase the record
  -- of what they did. person_name below is what keeps those rows legible.
  person_id   uuid references people(id) on delete set null,
  person_name text,
  -- Null for events that belong to no page — signing in, mostly.
  section_id  text references sections(id) on delete set null,
  -- Free text on purpose. A check constraint here would mean a future feature
  -- logging a new verb fails its insert, and these inserts are deliberately
  -- fire-and-forget: the caller never sees the error, so the event would just
  -- vanish. The vocabulary the app writes today is documented in
  -- src/lib/activity.js — view, sign_in, create, update, save, delete.
  action      text not null,
  -- What it was done to, in human terms: "Invoice", "Order", "Task".
  target      text,
  detail      jsonb not null default '{}'::jsonb,
  path        text,
  -- Milliseconds the page was actually in front of them: visible, and with
  -- some sign of life in the last few minutes. Null until they navigate away,
  -- and null forever on events that are an instant rather than a stay.
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  region      text,
  created_at  timestamptz not null default now()
);

alter table activity_events drop constraint if exists activity_events_region_check;
alter table activity_events add constraint activity_events_region_check
  check (region is null or region in ('uk', 'nepal'));

-- The feed reads newest-first over the whole table; every chart groups by
-- person or by section within a date window. These two cover both.
create index if not exists activity_events_created_idx
  on activity_events (created_at desc);
create index if not exists activity_events_person_created_idx
  on activity_events (person_id, created_at desc);
create index if not exists activity_events_section_created_idx
  on activity_events (section_id, created_at desc);


-- --- 2. The database decides who did it ------------------------------------

create or replace function stamp_activity_actor() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  pid uuid := app_person_id();
begin
  if pid is null then
    -- A token that resolves to no active person cannot log activity. It cannot
    -- read anything either, so there is nothing to record.
    raise exception 'No active staff record for this token.'
      using errcode = 'insufficient_privilege';
  end if;

  new.person_id  := pid;
  new.created_at := now();

  select pe.full_name, pe.location
    into new.person_name, new.region
    from people pe where pe.id = pid;

  return new;
end $fn$;

drop trigger if exists activity_events_stamp_actor on activity_events;
create trigger activity_events_stamp_actor
  before insert on activity_events
  for each row execute function stamp_activity_actor();


-- --- 3. Append-only, except for the dwell time -----------------------------
--
-- A page view is written the moment the page opens, so nothing is lost if the
-- browser is closed mid-visit. How long they stayed is only known later, which
-- is the single reason this table takes an UPDATE at all. Everything else on
-- the row is frozen at insert.

create or replace function guard_activity_event_immutable() returns trigger
language plpgsql as $fn$
begin
  if new.person_id   is distinct from old.person_id
  or new.person_name is distinct from old.person_name
  or new.section_id  is distinct from old.section_id
  or new.action      is distinct from old.action
  or new.target      is distinct from old.target
  or new.detail      is distinct from old.detail
  or new.path        is distinct from old.path
  or new.region      is distinct from old.region
  or new.created_at  is distinct from old.created_at then
    raise exception
      'The activity log is append-only. Only duration_ms may be filled in after the fact.'
      using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

drop trigger if exists activity_events_immutable on activity_events;
create trigger activity_events_immutable
  before update on activity_events
  for each row execute function guard_activity_event_immutable();


-- --- 4. Access -------------------------------------------------------------

alter table activity_events enable row level security;

drop policy if exists "require_known_issuer" on activity_events;
create policy "require_known_issuer" on activity_events
  as restrictive for all
  to authenticated
  using (app_issuer_ok());

-- Anyone signed in may write their own footprint. The WITH CHECK is evaluated
-- after the BEFORE trigger above has overwritten person_id, so this is not
-- trust in the client — it is a second lock on the same door.
drop policy if exists "activity_log_own" on activity_events;
create policy "activity_log_own" on activity_events
  as permissive for insert
  to authenticated
  with check (person_id = app_person_id());

-- Reading other people's activity is the granted permission.
drop policy if exists "activity_read" on activity_events;
create policy "activity_read" on activity_events
  as permissive for select
  to authenticated
  using (app_can_view('usage_analytics'::text));

-- Everyone can always see what they themselves did. Nothing in the app asks
-- for this yet; it is here so a "my activity" panel never needs a policy
-- change, and because hiding a person's own record from them is indefensible.
drop policy if exists "activity_read_own" on activity_events;
create policy "activity_read_own" on activity_events
  as permissive for select
  to authenticated
  using (person_id = app_person_id());

-- Filling in how long you stayed on a page you opened, for a while afterwards.
-- The window exists so a row cannot be reopened days later; the trigger above
-- is what stops this being a general edit.
drop policy if exists "activity_close_own_view" on activity_events;
create policy "activity_close_own_view" on activity_events
  as permissive for update
  to authenticated
  using (person_id = app_person_id() and created_at > now() - interval '12 hours')
  with check (person_id = app_person_id());

-- No delete policy, on purpose: see prune_activity_events() below.

grant select, insert, update on activity_events to authenticated;
grant all    on activity_events to service_role;


-- --- 5. Read models --------------------------------------------------------
--
-- Both are security_invoker, so the policies above decide what a caller gets —
-- their own trail, or everyone's. Re-apply that setting after any CREATE OR
-- REPLACE; it silently drops reloptions (migration 0018).

create or replace view activity_feed as
  select e.id::text            as id,
    e.person_id::text          as person_id,
    e.person_name,
    coalesce(po.label, '')     as position_label,
    e.section_id,
    coalesce(s.label, e.section_id, 'Other') as section_label,
    e.action,
    e.target,
    e.detail,
    e.path,
    e.duration_ms,
    e.region,
    e.created_at
  from activity_events e
  left join people    pe on pe.id = e.person_id
  left join positions po on po.id = pe.position_id
  left join sections  s  on s.id  = e.section_id;
alter view activity_feed set (security_invoker = on);

comment on view activity_feed is
  'One row per logged action, with the person and page resolved to labels. '
  'security_invoker, so activity_events RLS decides whose rows come back.';

-- Rolled up per person, per page, per day, so the charts can cover a year
-- without the browser pulling a year of rows. Days are Kathmandu days: the
-- factory is the thing being measured and UTC would split its evening shift
-- across two dates.
create or replace view activity_usage_daily as
  select e.person_id::text                                            as person_id,
    max(e.person_name)                                                as person_name,
    e.section_id,
    coalesce(max(s.label), e.section_id, 'Other')                     as section_label,
    (e.created_at at time zone 'Asia/Kathmandu')::date                as day,
    count(*)                                                          as events,
    count(*) filter (where e.action = 'view')                         as views,
    count(*) filter (where e.action in ('create','update','save','delete')) as writes,
    coalesce(sum(e.duration_ms), 0)::bigint                           as active_ms,
    max(e.created_at)                                                 as last_at
  from activity_events e
  left join sections s on s.id = e.section_id
  group by e.person_id, e.section_id,
           (e.created_at at time zone 'Asia/Kathmandu')::date;
alter view activity_usage_daily set (security_invoker = on);

comment on view activity_usage_daily is
  'Activity rolled up per person / page / Kathmandu day. What the usage charts '
  'read, so a wide date range stays one small result set.';


-- --- 6. Trimming old history ----------------------------------------------
--
-- The table has no delete policy, so this function is the only way history
-- goes away, and it checks rank before it does. Nothing calls it on a
-- schedule; run it by hand (or from a cron job) if the log ever outgrows its
-- usefulness:  select prune_activity_events(365);

create or replace function prune_activity_events(keep_days integer default 365)
returns bigint
language plpgsql security definer set search_path = public as $fn$
declare
  removed bigint;
begin
  if app_tier() < 4 then
    raise exception 'Only a system administrator can trim the activity log.'
      using errcode = 'insufficient_privilege';
  end if;
  if keep_days < 30 then
    raise exception 'Keep at least 30 days of activity.'
      using errcode = 'check_violation';
  end if;

  delete from activity_events
   where created_at < now() - make_interval(days => keep_days);
  get diagnostics removed = row_count;
  return removed;
end $fn$;

revoke all on function prune_activity_events(integer) from public, anon;
grant execute on function prune_activity_events(integer) to authenticated;


-- --- 7. The page joins the permission matrix -------------------------------
--
-- Inserting this row fires grant_new_section_to_super_admins() from 0028, so
-- Director / System Admin / Developer get it immediately and everyone else
-- starts at None — to be granted in the Admin Panel like any other page.

insert into sections (id, label, aliases, is_personal, sort_order)
values ('usage_analytics', 'Usage & Activity',
        array['usage', 'activity', 'analytics'], false, 24)
on conflict (id) do update
  set label      = excluded.label,
      aliases    = excluded.aliases,
      sort_order = excluded.sort_order;


-- --- 8. The feed is live ---------------------------------------------------
--
-- The usage page is exactly the kind of screen realtime exists for: it is
-- watching other people work. RLS applies to realtime the same as to a read,
-- so nobody is pushed an event they could not have queried.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'activity_events'
  ) then
    alter publication supabase_realtime add table public.activity_events;
  end if;
end $$;

-- =====================================================================
-- 0009 — accept Firebase Auth tokens, so nobody re-registers.
--
-- Supabase can trust a third-party issuer. Staff keep their existing
-- Firebase logins; Supabase reads the Firebase JWT and RLS resolves it to
-- a `people` row via `legacy_firebase_uid`, which the data migration
-- already captured for all 11 people who have a Firebase account.
--
-- Two things this has to get right:
--
--  1. A Firebase `sub` is a 28-char string like "1Hd5n8lGUaXZ3rijh4dWvJ",
--     NOT a uuid — so `auth.uid()` (which returns uuid) is null for these
--     tokens. Identity has to come from `auth.jwt()->>'sub'`.
--
--  2. Firebase signs JWTs for EVERY Firebase project with the same keys.
--     Without pinning the issuer and audience, a token minted by any
--     stranger's Firebase project would be accepted here. The restrictive
--     policy below closes that. This is not optional.
-- =====================================================================

-- ---------- identity ---------------------------------------------------
create or replace function app_jwt_sub()
returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'sub', '');
$$;

-- Accepts either a Firebase uid (matched on legacy_firebase_uid) or a
-- native Supabase uuid (matched on auth_uid), so migrating to Supabase Auth
-- later needs no further change here.
create or replace function app_person_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from people
   where status = 'Active'
     and ( legacy_firebase_uid = app_jwt_sub()
        or (app_jwt_sub() ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            and auth_uid::text = app_jwt_sub()) )
   limit 1;
$$;

create or replace function app_tier()
returns int language sql stable security definer set search_path = public as $$
  select coalesce(po.tier, -1)
  from people pe left join positions po on po.id = pe.position_id
  where pe.id = app_person_id();
$$;

create or replace function app_can_view(section text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select o.can_view from person_permission_overrides o
      where o.person_id = app_person_id() and o.section_id = section and o.can_view is not null),
    (select pp.can_view from people pe
       join position_permissions pp on pp.position_id = pe.position_id
      where pe.id = app_person_id() and pp.section_id = section),
    false);
$$;

create or replace function app_can_edit(section text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select o.can_edit from person_permission_overrides o
      where o.person_id = app_person_id() and o.section_id = section and o.can_edit is not null),
    (select pp.can_edit from people pe
       join position_permissions pp on pp.position_id = pe.position_id
      where pe.id = app_person_id() and pp.section_id = section),
    false);
$$;

create or replace function app_can_view_finance_tab(tab text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select ft.can_view from people pe
     join position_finance_tabs ft on ft.position_id = pe.position_id
    where pe.id = app_person_id() and ft.tab_id = tab), false);
$$;

-- `people.auth_uid` referenced auth.users, which has no rows under
-- third-party auth. Drop the constraint but keep the column for a later
-- move to native Supabase Auth.
alter table people drop constraint if exists people_auth_uid_fkey;
comment on column people.auth_uid is
  'Native Supabase Auth id. Null while Firebase is the issuer — identity resolves through legacy_firebase_uid instead.';

-- self-read policy has to use the same resolution, not auth.uid()
drop policy if exists people_self_read on people;
drop policy if exists people_self_update on people;
create policy people_self_read on people for select to authenticated
  using (id = app_person_id());
create policy people_self_update on people for update to authenticated
  using (id = app_person_id()) with check (id = app_person_id());

-- ---------- issuer pinning (the security-critical half) ----------------
create or replace function app_issuer_ok()
returns boolean language sql stable as $$
  select coalesce(
    -- our Firebase project, and only ours
    ( auth.jwt() ->> 'iss' = 'https://securetoken.google.com/kazi-manufacturing'
      and auth.jwt() ->> 'aud' = 'kazi-manufacturing' )
    -- or a token this Supabase project issued itself
    or auth.jwt() ->> 'iss' like 'https://%.supabase.co/auth/v1',
  false);
$$;
comment on function app_issuer_ok is
  'Firebase uses one signing key across all Firebase projects, so a token from an unrelated project verifies fine. Every table carries a RESTRICTIVE policy calling this, which ANDs with the permissive policies.';

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format(
      'create policy require_known_issuer on public.%I as restrictive to authenticated using (app_issuer_ok())', t);
  end loop;
end $$;

-- ---------- who am I --------------------------------------------------
-- One call the clients can use to resolve the signed-in person and their
-- nav, without needing read access to the permission tables.
create or replace function me()
returns table (person_id uuid, full_name text, email text, position_id text,
               position_label text, tier int, location text)
language sql stable security definer set search_path = public as $$
  select pe.id, pe.full_name, pe.email::text, pe.position_id, po.label, po.tier, pe.location
  from people pe left join positions po on po.id = pe.position_id
  where pe.id = app_person_id();
$$;
grant execute on function me to authenticated;

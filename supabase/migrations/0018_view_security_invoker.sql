-- ============================================================================
-- 0018_view_security_invoker.sql
--
-- SECURITY FIX. Ten views were reading straight past row level security.
--
-- A Postgres view runs with the privileges of its OWNER unless it is declared
-- security_invoker. All of these are owned by postgres, so the policies on the
-- underlying tables were never evaluated for the person querying them: a video
-- editor selecting from `orders` correctly saw 0 rows, but selecting the very
-- same data from `fs_orders` saw all 46. Since the app reads exclusively
-- through these views, that was every restricted screen in the product.
--
-- The 0010 views were created correctly with security_invoker on. This broke in
-- two ways afterwards:
--
--   * the seven views added in 0011 (and one in 0017) never set the option; and
--   * `create or replace view` DROPS reloptions rather than preserving them, so
--     re-issuing fs_orders in 0011 and fs_messages in 0017 to add a column
--     silently stripped the setting from two views that previously had it.
--
-- That second one is the trap worth remembering: replacing a view to add a
-- column quietly removes its security setting. Set the option explicitly every
-- time a view is (re)defined, and re-run the check at the bottom of this file.
--
-- people_directory is included too. It exposes name, email, position, location
-- and department for every person regardless of the caller, and nothing in the
-- app reads it — so there is no feature depending on the wider visibility, and
-- it should not be the one place staff details leak from. If a shared staff
-- directory is wanted later, the right way is an explicit policy on `people`
-- saying so, not a view that declines to check.
-- ============================================================================

do $$
declare
  v record;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'v'
       and coalesce((select option_value from pg_options_to_table(c.reloptions)
                     where option_name = 'security_invoker'), 'off') not in ('on', 'true')
  loop
    execute format('alter view public.%I set (security_invoker = on)', v.relname);
    raise notice 'security_invoker enabled on %', v.relname;
  end loop;
end $$;

-- Fail the migration rather than leave a gap open, if any view still runs as
-- its owner once the loop above has been round.
do $$
declare
  leaking text;
begin
  select string_agg(c.relname, ', ')
    into leaking
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'v'
     and coalesce((select option_value from pg_options_to_table(c.reloptions)
                   where option_name = 'security_invoker'), 'off') not in ('on', 'true');

  if leaking is not null then
    raise exception 'These views still bypass row level security: %', leaking;
  end if;
end $$;

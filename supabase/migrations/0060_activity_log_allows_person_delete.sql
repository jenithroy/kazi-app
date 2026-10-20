-- ============================================================================
-- 0060_activity_log_allows_person_delete.sql
--
-- Deleting a person from Employees has never worked for anyone who has opened
-- a page. The page said:
--
--   Not deleted, as far as the page can tell (The activity log is append-only.
--   Only duration_ms may be filled in after the fact.).
--
-- Two decisions in 0032 were never tried together:
--
--   * activity_events.person_id (and section_id) are `on delete set null`, so a
--     deleted person's history stays, still named by its `person_name` snapshot
--     (the Usage page shows those rows as "Removed user").
--   * activity_events_immutable refuses any update that changes person_id.
--
-- Deleting a person makes Postgres run `update activity_events set person_id =
-- null where person_id = <them>`. The guard saw person_id change and refused, so
-- the whole delete rolled back. Nothing was deleted; the message was accurate.
--
-- The fix is one narrow exception in the guard and nothing else. person_id or
-- section_id may go from a value to NULL, and only when the row they pointed at
-- is gone: that is the foreign key's own cleanup, and not something a client can
-- arrange, because a person who is still on the list can never be detached from
-- their rows, and no row can be re-pointed or handed to someone else. Every
-- other column is frozen exactly as before, and duration_ms is still the one
-- thing that can be filled in later.
--
-- The function becomes SECURITY DEFINER (as stamp_activity_actor already is) so
-- the "is it really gone?" look-up sees the whole table whatever row-level
-- security lets the caller read. It only reads, a trigger function cannot be
-- called from the API, and the tables are named with their schema so a temp
-- table of the same name cannot stand in for them.
--
-- Idempotent: CREATE OR REPLACE on a function the trigger already points at.
-- Undo: run the guard_activity_event_immutable() definition from 0032 again.
-- ============================================================================

create or replace function guard_activity_event_immutable() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if new.person_name is distinct from old.person_name
  or new.action      is distinct from old.action
  or new.target      is distinct from old.target
  or new.detail      is distinct from old.detail
  or new.path        is distinct from old.path
  or new.region      is distinct from old.region
  or new.created_at  is distinct from old.created_at
  -- A reference may only be cleared, and only once what it pointed at is gone.
  or (new.person_id is distinct from old.person_id
      and not (new.person_id is null
               and not exists (select 1 from public.people p where p.id = old.person_id)))
  or (new.section_id is distinct from old.section_id
      and not (new.section_id is null
               and not exists (select 1 from public.sections s where s.id = old.section_id))) then
    raise exception
      'The activity log is append-only. Only duration_ms may be filled in after the fact.'
      using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

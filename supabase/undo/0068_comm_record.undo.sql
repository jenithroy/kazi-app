-- ============================================================================
-- 0068_comm_record.undo.sql
--
-- Takes back 0068_comm_record.sql: drops the comm_events table (with its
-- triggers, policies, indexes and constraints) and the four functions that
-- migration created. It touches nothing else.
--
-- DESTRUCTIVE once the record holds anything. The first block refuses to run
-- while comm_events has rows, so recorded conversations cannot be lost by
-- accident. To go ahead anyway, export the rows first, then in the same
-- session run:
--
--     set kazi.confirm_drop_comm_events = 'yes';
--
-- and run this file again. Safe to run when the migration was never applied.
-- ============================================================================

begin;

do $guard$
declare
  has_rows boolean := false;
begin
  if to_regclass('public.comm_events') is not null then
    execute 'select exists (select 1 from public.comm_events)' into has_rows;
    if has_rows
       and coalesce(current_setting('kazi.confirm_drop_comm_events', true), '') <> 'yes' then
      raise exception
        'comm_events holds recorded conversations. Export them first, then run  set kazi.confirm_drop_comm_events = ''yes'';  and this file again.'
        using errcode = 'check_violation';
    end if;
  end if;
end $guard$;

drop table if exists comm_events;

drop function if exists redact_comm_event(uuid, text);
drop function if exists comm_events_before_insert();
drop function if exists comm_events_guard_update();
drop function if exists comm_events_no_delete();
drop function if exists comm_channel_origin(text);

commit;

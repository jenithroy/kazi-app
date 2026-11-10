-- ============================================================================
-- 0069_comm_mirrors.undo.sql
--
-- Takes 0069 back: stops the Instagram and team chat copies, removes the
-- switches, the helper functions, the read index and the `comms_record`
-- permission section (so nobody can read comm_events again, as after 0068).
--
-- It does NOT remove rows already copied into comm_events: that table is
-- append-only on purpose. To remove the table and everything in it as well,
-- run 0068's undo afterwards (it asks for an explicit confirmation while the
-- table holds rows).
--
-- Chat and the Instagram bot are untouched: only the two triggers this
-- migration added are dropped.
-- ============================================================================

begin;
set local lock_timeout = '10s';

drop trigger if exists comm_mirror_instagram on ig_bot_messages;
drop trigger if exists comm_mirror_team_chat on chat_messages;

drop function if exists comm_mirror_instagram_trg();
drop function if exists comm_mirror_team_chat_trg();
drop function if exists comm_mirror_ig_message(bigint);
drop function if exists comm_mirror_chat_message(uuid, text);

drop table if exists comm_mirror_settings;      -- takes its policies and trigger with it
drop function if exists comm_mirror_settings_touch();

drop index if exists comm_events_time_idx;

-- The section, and every permission that points at it. The matrix guard from
-- 0028 refuses to delete any super-admin permission row, even one that belongs
-- to a section that is being removed, so it is paused for this transaction
-- only (the lock it takes keeps everyone else out until the commit, and it is
-- switched back on before then).
alter table position_permissions disable trigger guard_permission_matrix;
delete from person_permission_overrides where section_id = 'comms_record';
delete from position_permissions        where section_id = 'comms_record';
delete from sections                    where id = 'comms_record';
alter table position_permissions enable trigger guard_permission_matrix;

commit;

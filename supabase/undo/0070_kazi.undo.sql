-- ============================================================================
-- 0070_kazi.undo.sql
--
-- Takes back 0070_kazi.sql: drops the kazi_messages table (with its policies, index and
-- constraints) and the `kazi` permission section with every permission that points at it.
-- It touches nothing else. After it the Worker answers "not switched on" and the chat list
-- shows no Kazi, as before 0070.
--
-- DESTRUCTIVE once Kazi has been used: the table holds people's questions and the answers
-- Kazi's quality is judged by. The first block refuses to run while kazi_messages has rows.
-- To go ahead anyway, export the rows first. The refusal leaves your session in an aborted transaction, so then, in the same session:
--
--     rollback;
--     set kazi.confirm_drop_kazi_messages = 'yes';
--
-- and run this file again. Safe to run when the migration was never applied. (Rows written by someone who has since left the staff
-- list stay in the table, unlinked, until this is run: they are the report card's too.)
-- ============================================================================

begin;
set local lock_timeout = '10s';

do $guard$
declare
  has_rows boolean := false;
begin
  if to_regclass('public.kazi_messages') is not null then
    -- Locked first, so no row can arrive between the check and the drop and be lost without anyone having agreed to it.
    lock table public.kazi_messages in access exclusive mode;
    execute 'select exists (select 1 from public.kazi_messages)' into has_rows;
    if has_rows
       and coalesce(current_setting('kazi.confirm_drop_kazi_messages', true), '') <> 'yes' then
      raise exception
        'kazi_messages holds what people asked Kazi. Export it first, then run  rollback;  set kazi.confirm_drop_kazi_messages = ''yes'';  and this file again.'
        using errcode = 'check_violation';
    end if;
  end if;
end $guard$;

drop table if exists kazi_messages;                 -- takes its trigger, policies and index with it
drop function if exists kazi_messages_stamp();

-- The section, and every permission that points at it. The matrix guard from 0028 refuses to
-- delete any super-admin permission row, even one that belongs to a section that is being
-- removed, so it is paused for this transaction only (the lock it takes keeps everyone else out
-- until the commit, and it is switched back on before then), as in 0069's undo.
alter table position_permissions disable trigger guard_permission_matrix;
delete from person_permission_overrides where section_id = 'kazi';
delete from position_permissions        where section_id = 'kazi';
delete from sections                    where id = 'kazi';
alter table position_permissions enable trigger guard_permission_matrix;

commit;

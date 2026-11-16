-- ============================================================================
-- 0073_close_anonymous_access.undo.sql
--
-- Takes back 0073_close_anonymous_access.sql: the rights go back to exactly what they were (anon and signed-in people with every right on the
-- five views and on permission_drift_log; row-level security off on the log).
--
-- THIS RE-OPENS THE HOLE 0073 CLOSED: anybody holding the public anon key can read the staff roster and the finance accounts, and can delete
-- finance accounts, again. Run it only to find out whether 0073 broke something, and close it again.
-- Safe to run twice.
-- ============================================================================

grant select, insert, update, delete, truncate, references, trigger on public.fs_employees      to anon;
grant select, insert, update, delete, truncate, references, trigger on public.fs_accounts       to anon;
grant select, insert, update, delete, truncate, references, trigger on public.chat_presence     to anon;
grant select, insert, update, delete, truncate, references, trigger on public.my_marketing_tabs to anon;
grant select, insert, update, delete, truncate, references, trigger on public.my_messenger_tabs to anon;

grant select, insert, update, delete, truncate, references, trigger on public.permission_drift_log to anon, authenticated;
alter table public.permission_drift_log disable row level security;

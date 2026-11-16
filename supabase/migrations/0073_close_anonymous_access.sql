-- ============================================================================
-- 0073_close_anonymous_access.sql
--
-- Nobody without a login may reach the staff roster, the finance accounts, the tab lists or the old permission log.
--
-- Found 2026-11-16 with the public anon key (the one inside the dashboard's own front-end and in wrangler.jsonc, so anybody can have it).
-- Five views run with their owner's rights, so row-level security never looks at who is asking, and every one of them was open to `anon`;
-- `permission_drift_log` had row-level security switched off:
--
--   fs_employees        anon could READ every member of staff (names, e-mails, roles, schedules)
--   fs_accounts         anon could READ every finance account with its opening balance, and DELETE rows from the real accounts table
--   my_marketing_tabs   anon could change and delete the Marketing tab list
--   my_messenger_tabs   anon could change and delete the Chat tab list (the Leads tab)
--   chat_presence       anon could READ who is clocked in
--   permission_drift_log (a legacy Firestore-era permission record; nothing in the app reads or writes it)
--                       anon could read, add, change and delete its rows
--
-- Why it happened: later migrations replaced those views with `create or replace view` without setting `security_invoker` again (the trap
-- 0018's header describes), on top of the baseline's blanket `grant ... to anon`.
--
-- Nothing in the web app, the phone app, the Worker or the bots reads any of these without a login (they all sign in first), and the four
-- chat/push functions that write already refuse a caller with no identity. So this removes ONLY what an anonymous visitor could do.
-- Signed-in people keep exactly what they had.
--
-- NOT changed here, on purpose (needs a decision and a screen-by-screen check): fs_employees and chat_presence run as owner BY DESIGN, so
-- every colleague can see the directory; fs_accounts, my_marketing_tabs and my_messenger_tabs lost `security_invoker`, and signed-in people
-- can still read fs_accounts and write through those three views.
--
-- Applied by hand on 2026-11-16, after a rehearsal on the live database in a transaction that was rolled back (7 checks: the six objects were the
-- only change; every signed-in identity saw the same rows; anon refused on read and write; the service role kept its rights).
-- Undo: supabase/undo/0073_close_anonymous_access.undo.sql.
-- ============================================================================

revoke all on public.fs_employees      from anon;
revoke all on public.fs_accounts       from anon;
revoke all on public.chat_presence     from anon;
revoke all on public.my_marketing_tabs from anon;
revoke all on public.my_messenger_tabs from anon;

-- the legacy log: closed to everybody except the service role and the owner (row-level security on, with only the existing restrictive
-- policy, means nobody passes it; the revoke makes that plain)
alter table public.permission_drift_log enable row level security;
revoke all on public.permission_drift_log from anon, authenticated;

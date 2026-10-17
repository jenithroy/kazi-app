-- =====================================================================
-- 0115 — fix mobile_notifications insert: the recipient-exists check was
-- silently RLS-filtered
--
-- notif_insert's WITH CHECK ran `exists (select 1 from people p where
-- p.email = recipient_email)` as a plain subquery, not through a
-- SECURITY DEFINER function — so it inherited the CALLER's own row-level
-- view of `people` ("your own row, or the whole table only with the
-- employees section at tier >= 2", per 0102's header). Anyone without that
-- grant — i.e. almost every non-admin position — could only ever pass this
-- check when the recipient was themselves; a notification aimed at a
-- colleague always found zero visible rows for their email and silently
-- violated RLS. notify()'s own catch swallowed the error to a
-- console.warn, so the in-app feed AND the OS push (0112's trigger only
-- fires off a successful mobile_notifications insert) both silently never
-- ran for anyone but the admins who happen to hold that grant.
--
-- Fix: route the existence check through a SECURITY DEFINER function, the
-- same trick app_person_id()/app_in_thread() already use to read past a
-- caller's own restricted view of a table.
-- =====================================================================

create or replace function app_person_known(p_email citext)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from people where email = p_email);
$$;

revoke all on function app_person_known(citext) from public;
grant execute on function app_person_known(citext) to authenticated;

drop policy if exists notif_insert on mobile_notifications;
create policy notif_insert on mobile_notifications for insert to authenticated
  with check (app_person_id() is not null and app_person_known(recipient_email));

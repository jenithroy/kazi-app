-- =====================================================================
-- 0100 — mobile_notifications
--
-- Numbered from 0100 deliberately: the web-app session is working the same
-- database in the 00xx range, so mobile-only migrations live up here to
-- avoid a filename collision.
--
-- This is the in-app notification feed, previously the one Firestore
-- collection the mobile app owned outright (`mobile_notifications`). It is
-- addressed per recipient email rather than per person id, because that is
-- what the notification router already emits.
-- =====================================================================

create table if not exists mobile_notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_email citext not null,
  recipient_id    uuid references people(id) on delete cascade,
  type            text not null default 'info',
  event_type      text not null default '',
  section         text not null default 'dashboard',
  title           text not null default 'Update',
  body            text not null default '',
  deep_link       text,
  actor_name      text not null default 'Someone',
  read            boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists mobile_notifications_recipient_idx
  on mobile_notifications (recipient_email, created_at desc);
create index if not exists mobile_notifications_unread_idx
  on mobile_notifications (recipient_email) where not read;

alter table mobile_notifications enable row level security;

-- You read and clear your own notifications. Nobody reads anyone else's,
-- regardless of position — a notification body can quote a salary or an
-- invoice total, so it inherits the sensitivity of whatever triggered it.
create policy notif_own_read on mobile_notifications for select to authenticated
  using (recipient_id = app_person_id()
      or recipient_email = (select email from people where id = app_person_id()));
create policy notif_own_update on mobile_notifications for update to authenticated
  using (recipient_id = app_person_id()
      or recipient_email = (select email from people where id = app_person_id()))
  with check (recipient_id = app_person_id()
      or recipient_email = (select email from people where id = app_person_id()));
-- Any signed-in person may raise a notification for a colleague (that is what
-- "Wilson approved your budget request" is), but only for a real person.
create policy notif_insert on mobile_notifications for insert to authenticated
  with check (app_person_id() is not null
              and exists (select 1 from people p where p.email = recipient_email));

-- the same issuer pin every other table carries (see 0009)
create policy require_known_issuer on mobile_notifications
  as restrictive to authenticated using (app_issuer_ok());

-- resolve recipient_id from the email on the way in
create or replace function mobile_notifications_link_person()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.recipient_id is null then
    select id into new.recipient_id from people where email = new.recipient_email limit 1;
  end if;
  return new;
end $$;
drop trigger if exists mobile_notifications_link on mobile_notifications;
create trigger mobile_notifications_link before insert on mobile_notifications
  for each row execute function mobile_notifications_link_person();

-- compat view, matching the document shape the feed already maps
create or replace view fs_mobile_notifications with (security_invoker = on) as
  select id::text as id, recipient_email as "recipientEmail", type,
         event_type as "eventType", section, title, body,
         deep_link as "deepLink", actor_name as "actorName", read,
         created_at as "createdAt"
  from mobile_notifications;
grant select, insert, update, delete on fs_mobile_notifications to authenticated;
grant select, insert, update on mobile_notifications to authenticated;

-- live feed, replacing the Firestore onSnapshot listener
alter publication supabase_realtime add table mobile_notifications;

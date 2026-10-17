-- =====================================================================
-- 0113 — per-lead staff notification mute
--
-- Leads live entirely in the separate `meta-dm-bot` service (its own
-- datastore, reached over HTTPS) — this table is the one piece of
-- lead-related state that belongs to kazi-mobile itself: whether a given
-- staff member wants to be notified about a given lead's new messages.
--
-- Not to be confused with `Lead.isMuted` (the bot-takeover flag, owned by
-- the bot service) — that decides whether the AI bot or a human replies.
-- This decides whether a notification fires. Different concern, different
-- store, same word by coincidence.
-- =====================================================================

create table if not exists lead_notification_mutes (
  lead_convo  text not null,
  person_id   uuid not null references people(id) on delete cascade,
  muted       boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (lead_convo, person_id)
);

alter table lead_notification_mutes enable row level security;

-- Read is intentionally not scoped to "your own row": notify() has to check
-- who muted a lead before it fans a notification out to everyone with leads
-- access, which is a different person's session than whoever's mute row it
-- is. Nothing sensitive leaks either way — muting a lead's notifications
-- isn't private the way, say, a salary is.
drop policy if exists lead_mutes_read on lead_notification_mutes;
create policy lead_mutes_read on lead_notification_mutes for select to authenticated
  using (true);

drop policy if exists lead_mutes_write on lead_notification_mutes;
create policy lead_mutes_write on lead_notification_mutes for all to authenticated
  using (person_id = app_person_id())
  with check (person_id = app_person_id());

drop policy if exists require_known_issuer on lead_notification_mutes;
create policy require_known_issuer on lead_notification_mutes
  as restrictive to authenticated using (app_issuer_ok());

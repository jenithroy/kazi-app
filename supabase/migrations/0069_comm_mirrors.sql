-- ============================================================================
-- 0069_comm_mirrors.sql
--
-- Starts filling the conversation record (0068) from the chats we already
-- have, and lets the directors read it.
--
--   * Instagram lead chats (ig_bot_messages, written by the separate Instagram
--     bot) are copied into comm_events: the 500-odd existing messages once, and
--     every new one as it arrives.
--   * Team chat (chat_messages) gets the same copy, but it is SWITCHED OFF. The
--     owner has said every member of staff signs the recording papers before
--     anything of theirs is tracked, so the copy only starts when a director
--     says the papers are signed (see "Turning team chat on" below).
--   * The `comms_record` permission section is created, so the people in the
--     top tier (Director, System Admin, Developer) can read comm_events, as
--     0068's read policy was written to allow. Everyone else starts at None
--     and can be given it in the Admin Panel like any other page.
--
-- Nothing existing changes shape. Two AFTER INSERT triggers are added (one on
-- ig_bot_messages, one on chat_messages); no column, policy or function of the
-- chat or the bot is touched.
--
-- THE RULE THAT PROTECTS THE CHAT AND THE BOT: a mirror may never stop a
-- message from being sent or saved. Both triggers run AFTER the message is
-- stored and swallow every error (they raise a WARNING and carry on), the same
-- way chat_messages_notify and mobile_notifications_push already do. If the
-- record is ever broken, chat and the bot keep working and a warning shows in
-- the database log.
--
-- Choices, so nobody has to rediscover them:
--
--   * The switches live in comm_mirror_settings (one row per channel), read by
--     the trigger on every message. instagram is ON; team_chat is OFF. Team
--     chat copies group threads only unless include_dms is set, because a
--     one-to-one message can be private and cannot be sorted into work or not
--     automatically. When team chat is turned on its rows are stamped
--     consent = 'staff_policy'; Instagram rows are stamped 'none' because the
--     customers on the other end were not told (that is a privacy-policy job in
--     phase 0 of the plan). The assistant and any training must ignore rows
--     whose consent is 'none'.
--   * Instagram rows: the bot's own replies are direction 'out' and carry the
--     name "Instagram bot" (no member of staff wrote them); the customer's
--     messages are 'in'. The row's id in ig_bot_messages is the external_id,
--     because about a quarter of the messages have no Instagram message id.
--     thread_ref is a hash of the conversation id, not the id itself, so that
--     erasing a customer (which blanks counterparty_ref) leaves nothing that
--     names them; counterparty_ref keeps the raw id for as long as the event is
--     not erased. Photos are kind 'image'; videos are kind 'file' (there is no
--     video kind) and media_mime tells them apart. The files stay in their own
--     storage bucket, named in detail->>'bucket'.
--   * Team chat rows are 'internal', carry who wrote them (a snapshot of the
--     name, like every row), and name the thread in detail so the record can
--     be read without access to the thread itself. Messages the author deleted
--     are not copied by a backfill; a live message is copied the moment it is
--     sent, and a later edit or delete in the chat does not change the record
--     (it is append-only; that is the point of it).
--   * Not copied here: edits, deletions, reactions, read receipts, and the
--     Instagram bot's thread scores. Those are not conversation.
--
-- Turning team chat on (when the papers are signed; an operator does this by
-- hand, nothing in the app does):
--
--     update comm_mirror_settings
--        set enabled = true, note = 'Staff papers signed on <date>'
--      where channel = 'team_chat';
--
--   and, only if the directors decide one-to-one messages are in scope too:
--
--     update comm_mirror_settings set include_dms = true where channel = 'team_chat';
--
--   Old messages are NOT copied automatically. To copy earlier ones, run
--   comm_mirror_chat_message(<message id>, 'none') for each (the second
--   argument stamps them as written before the policy).
--
-- Safe to run more than once. supabase/undo/0069_comm_mirrors.undo.sql takes
-- the triggers, switches and section away (copied rows stay: the record is
-- append-only).
-- ============================================================================


-- --- 1. The switches ---------------------------------------------------------

create table if not exists comm_mirror_settings (
  channel      text primary key check (channel in ('team_chat', 'instagram')),
  enabled      boolean not null default false,
  -- team_chat only: also copy one-to-one threads (default: groups only)
  include_dms  boolean not null default false,
  -- what newly copied rows are stamped with
  consent      text not null default 'none'
               check (consent in ('none', 'announced', 'staff_policy')),
  note         text,
  changed_at   timestamptz not null default now()
);

comment on table comm_mirror_settings is
  'Which chats are copied into comm_events, and how. Changed by an operator, never by the app.';

create or replace function comm_mirror_settings_touch()
returns trigger
language plpgsql as $fn$
begin
  new.changed_at := now();
  return new;
end $fn$;

drop trigger if exists comm_mirror_settings_touch on comm_mirror_settings;
create trigger comm_mirror_settings_touch
  before update on comm_mirror_settings
  for each row execute function comm_mirror_settings_touch();

insert into comm_mirror_settings (channel, enabled, include_dms, consent, note) values
  ('instagram', true,  false, 'none',
   'Lead conversations on Instagram, copied from ig_bot_messages.'),
  ('team_chat', false, false, 'staff_policy',
   'OFF until every member of staff has signed the recording papers. Groups only unless include_dms is set.')
on conflict (channel) do nothing;

alter table comm_mirror_settings enable row level security;

drop policy if exists "require_known_issuer" on comm_mirror_settings;
create policy "require_known_issuer" on comm_mirror_settings
  as restrictive for all
  to authenticated
  using ((select app_issuer_ok()));

drop policy if exists "comms_record_read" on comm_mirror_settings;
create policy "comms_record_read" on comm_mirror_settings
  as permissive for select
  to authenticated
  using ((select app_can_view('comms_record'::text)));

revoke all on comm_mirror_settings from anon, authenticated, service_role;
grant select on comm_mirror_settings to authenticated, service_role;


-- --- 2. The copying itself (one place per channel) ---------------------------
--
-- Both helpers are idempotent: (channel, external_id) is unique and a repeat
-- lands once. They are not callable from the app; only the triggers below and
-- an operator run them.

create or replace function comm_mirror_ig_message(p_id bigint)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  m ig_bot_messages%rowtype;
  s comm_mirror_settings%rowtype;
begin
  select * into m from ig_bot_messages where id = p_id;
  if not found then return; end if;
  select * into s from comm_mirror_settings where channel = 'instagram';

  insert into comm_events (
    occurred_at, channel, direction, kind,
    staff_name, counterparty_kind, counterparty_ref,
    thread_ref, external_id,
    body, media_path, media_mime,
    consent, work, detail
  ) values (
    m.created_at, 'instagram',
    case when m.role = 'user' then 'in' else 'out' end,
    case when m.media_type like 'image/%' then 'image'
         when m.media_type like 'audio/%' then 'voice'
         when m.media_type is not null    then 'file'
         else 'text' end,
    case when m.role = 'assistant' then 'Instagram bot' end,
    'lead', m.convo,
    'ig:' || md5(m.convo), m.id::text,
    nullif(m.content, ''), m.media_path, m.media_type,
    coalesce(s.consent, 'none'), true,
    jsonb_strip_nulls(jsonb_build_object(
      'role', m.role,
      'mid', m.mid,
      'reply_to_mid', m.reply_to_mid,
      'referral', m.referral,
      'bucket', case when m.media_path is not null then 'ig-dm-media' end,
      'source_table', 'ig_bot_messages',
      'source_id', m.id))
  )
  on conflict (channel, external_id) do nothing;
end $fn$;

create or replace function comm_mirror_chat_message(p_id uuid, p_consent text default null)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  m chat_messages%rowtype;
  t chat_threads%rowtype;
  s comm_mirror_settings%rowtype;
  v_thread_name text;
begin
  select * into m from chat_messages where id = p_id;
  if not found or m.deleted then return; end if;
  select * into t from chat_threads where id = m.thread_id;
  select * into s from comm_mirror_settings where channel = 'team_chat';

  v_thread_name := case when t.kind = 'group' then t.name
    else (select string_agg(pe.full_name, ' & ' order by pe.full_name)
            from chat_members cm join people pe on pe.id = cm.person_id
           where cm.thread_id = t.id) end;

  insert into comm_events (
    occurred_at, channel, direction, kind,
    staff_person_id, counterparty_kind,
    thread_ref, external_id,
    body, media_path, media_mime, media_seconds,
    consent, work, detail
  ) values (
    m.sent_at, 'team_chat', 'internal',
    case when m.attachment_kind is null    then 'text'
         when m.attachment_kind = 'voice'  then 'voice'
         when m.attachment_kind = 'image'  then 'image'
         else 'file' end,
    m.author_id, 'staff',
    m.thread_id::text, m.id::text,
    nullif(m.body, ''), m.attachment_path, m.attachment_mime, m.attachment_duration,
    coalesce(p_consent, s.consent, 'none'), true,
    jsonb_strip_nulls(jsonb_build_object(
      'thread_kind', t.kind,
      'thread_name', v_thread_name,
      'bucket', case when m.attachment_path is not null then 'chat-media' end,
      'attachment_kind', m.attachment_kind,
      'attachment_name', m.attachment_name,
      'reply_to', m.reply_to,
      'source_table', 'chat_messages',
      'source_id', m.id))
  )
  on conflict (channel, external_id) do nothing;
end $fn$;


-- --- 3. The triggers (they never stop a message) -----------------------------

create or replace function comm_mirror_instagram_trg()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if exists (select 1 from comm_mirror_settings where channel = 'instagram' and enabled) then
    perform comm_mirror_ig_message(new.id);
  end if;
  return new;
exception when others then
  raise warning 'comm_mirror_instagram failed for message %: %', new.id, sqlerrm;
  return new;
end $fn$;

create or replace function comm_mirror_team_chat_trg()
returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  s comm_mirror_settings%rowtype;
begin
  select * into s from comm_mirror_settings where channel = 'team_chat';
  if found and s.enabled
     and (s.include_dms
          or exists (select 1 from chat_threads t where t.id = new.thread_id and t.kind = 'group')) then
    perform comm_mirror_chat_message(new.id);
  end if;
  return new;
exception when others then
  raise warning 'comm_mirror_team_chat failed for message %: %', new.id, sqlerrm;
  return new;
end $fn$;

-- None of these is for the app to call (Supabase would otherwise open them to
-- anon and signed-in users; the helpers copy rows into the record).
revoke all on function comm_mirror_ig_message(bigint)           from public, anon, authenticated, service_role;
revoke all on function comm_mirror_chat_message(uuid, text)     from public, anon, authenticated, service_role;
revoke all on function comm_mirror_instagram_trg()              from public, anon, authenticated, service_role;
revoke all on function comm_mirror_team_chat_trg()              from public, anon, authenticated, service_role;

-- Creating a trigger takes a short lock on the table, so the bot and the chat
-- wait a moment rather than slip a message past the copy below.
drop trigger if exists comm_mirror_instagram on ig_bot_messages;
create trigger comm_mirror_instagram
  after insert on ig_bot_messages
  for each row execute function comm_mirror_instagram_trg();

drop trigger if exists comm_mirror_team_chat on chat_messages;
create trigger comm_mirror_team_chat
  after insert on chat_messages
  for each row execute function comm_mirror_team_chat_trg();


-- --- 4. The Instagram history ------------------------------------------------
--
-- Run after the trigger exists and its lock is held, so nothing falls between
-- the copy and the trigger. Safe to repeat. Team chat is not backfilled: it is
-- off, and what is in it today is test chatter.

select comm_mirror_ig_message(id) from ig_bot_messages order by id;


-- --- 5. The directors can read it ---------------------------------------------
--
-- Inserting the section fires grant_new_section_to_super_admins() from 0028, so
-- every tier-4 position (Director, System Admin, Developer) gets it at once
-- and everyone else starts at None, to be granted in the Admin Panel.

insert into sections (id, label, aliases, is_personal, sort_order)
values ('comms_record', 'Conversation Record',
        array['conversations', 'chats', 'record', 'comms'], false, 25)
on conflict (id) do update
  set label      = excluded.label,
      aliases    = excluded.aliases,
      sort_order = excluded.sort_order;

-- The record is read newest first across every channel.
create index if not exists comm_events_time_idx
  on comm_events (occurred_at desc);

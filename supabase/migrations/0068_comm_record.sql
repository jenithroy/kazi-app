-- ============================================================================
-- 0068_comm_record.sql
--
-- The central record of every work conversation: one append-only table that
-- will hold each chat message, call, voice note, transcript and (much later)
-- camera event, whichever door it came through, stamped with when it happened,
-- who was on our side and where it came from.
--
-- This is the first step of COMMS_AI_PLAN.md (section 16, "Foundation"). It
-- creates the table and its safeguards and NOTHING ELSE. No existing table,
-- policy, view or function is touched, and nothing writes to it or reads from
-- it yet: the writers arrive one at a time in later migrations and code (the
-- team chat and Instagram mirrors, the WhatsApp webhook, the transcription
-- worker), each proven on its own before it is switched on.
--
-- Three decisions carry the weight.
--
--   1. APPEND-ONLY. A recorded conversation is evidence, so a row is never
--      edited and never deleted. The one exception is erasure: when someone
--      asks for their messages to be removed (Meta's platform terms expect
--      deletion on request), redact_comm_event() blanks the content and the
--      contact detail and keeps the stub (when, which channel, which of our
--      staff), so the record shows that something was here and was erased.
--      Corrections and enrichments are NEW rows: a transcript is a row of its
--      own that points at the audio it came from.
--
--   2. SOURCE TAGS THAT CANNOT BE LOST. Meta's WhatsApp terms allow a model
--      to be fine-tuned on WhatsApp data only for our own exclusive use, so
--      anything derived from a WhatsApp row must stay marked as such for ever.
--      `lineage` lists every origin a row descends from (whatsapp,
--      meta_messaging, internal, camera). The database, not the writer, keeps
--      it right: a trigger always adds the row's own channel's origin and
--      everything its parent carries, so a transcript of a WhatsApp call is
--      tagged `whatsapp` whether or not the code that wrote it remembered. What
--      the database cannot see is content copied between channels by hand (a
--      staff member pasting a client's WhatsApp text into team chat).
--
--   3. NOBODY CAN READ IT YET. The read policy asks for a permission section,
--      `comms_record`, that does not exist until the first screen that shows
--      the record is built; until then app_can_view() answers false for
--      everybody, so the app cannot see these rows, and only the service role
--      (the Worker and the office PC) can write them. When the section is
--      added, the policy starts working without being edited.
--
-- Reasons for the smaller choices, so nobody has to rediscover them:
--
--   * (channel, external_id) is a plain UNIQUE, not a partial index: the
--     Worker's upsert (PostgREST on_conflict=channel,external_id) cannot name
--     an index predicate, and Meta resends webhooks, so a repeated message
--     must land once. Rows without an external_id never collide (NULLs are
--     distinct).
--   * staff_person_id is ON DELETE SET NULL, which Postgres performs as an
--     UPDATE. The append-only guard therefore lets that one change through
--     (and nothing else changes in the same statement); migration 0060 exists
--     because the same trap once blocked deleting a staff record. staff_name
--     is a snapshot so the row stays readable afterwards.
--   * recorded_at is stamped by the database, so a writer cannot backdate when
--     the record was made; occurred_at is the message's own time.
--   * The service role gets SELECT and INSERT only. There is no UPDATE or
--     DELETE grant at all; redaction goes through the SECURITY DEFINER
--     function, which checks who is asking.
--
-- Safe to run more than once. Nothing here runs by itself: apply it by hand,
-- one file at a time. supabase/undo/0068_comm_record.undo.sql takes it back
-- (and refuses to drop the table while it holds recorded conversations).
--
-- Rehearsal (2026-11-10). NOT yet applied to the live database. Run on a
-- scratch Postgres built from this repo's own people / positions / sections /
-- permission tables and app_* helper functions, connected the way Supabase
-- connects (a login role that switches to anon, authenticated or
-- service_role, with Supabase's default open-to-everyone table grants
-- modelled): scripts/rehearse-migration, 64 checks, all passing.
--   * It applies, and applies again, with no change; it adds one table and
--     five functions and alters nothing else (catalogue and existing data
--     identical before and after).
--   * Tags, constraints, the append-only guard, erasure and deleting a staff
--     record behave as described above.
--   * A director, regular staff, a mid-tier admin, an inactive person, a token
--     from the wrong issuer and anonymous visitors cannot read or write; the
--     service role can insert and read but not edit, delete or truncate; only
--     a super admin, the service role or an operator can erase. The rehearsal
--     caught two gaps that are now closed: the erase function first trusted
--     any token whose subject was a director (the issuer lock on the table
--     does not apply inside a SECURITY DEFINER function), and the service role
--     kept TRUNCATE from Supabase's default grants.
--   * The undo restores the original catalogue and refuses to run while the
--     table holds rows.
-- ============================================================================


-- --- 1. Where a row comes from --------------------------------------------

create or replace function comm_channel_origin(p_channel text)
returns text
language sql immutable as $fn$
  select case
    when p_channel in ('whatsapp_chat', 'whatsapp_call') then 'whatsapp'
    when p_channel in ('instagram', 'messenger')         then 'meta_messaging'
    when p_channel = 'camera'                            then 'camera'
    else 'internal'
  end
$fn$;

comment on function comm_channel_origin(text) is
  'The licensing origin of a channel: whatsapp, meta_messaging, camera or internal. '
  'comm_events.lineage always contains it.';


-- --- 2. The record ---------------------------------------------------------

create table if not exists comm_events (
  id                uuid primary key default gen_random_uuid(),

  -- When it happened (the message's or call's own time) and when we stored it.
  occurred_at       timestamptz not null,
  recorded_at       timestamptz not null default now(),

  -- Which door it came through, which way it went, and what it is.
  channel           text not null
                    check (channel in ('team_chat', 'instagram', 'messenger',
                                       'whatsapp_chat', 'team_call',
                                       'whatsapp_call', 'phone_note', 'camera')),
  direction         text not null check (direction in ('in', 'out', 'internal')),
  kind              text not null
                    check (kind in ('text', 'voice', 'image', 'file', 'call',
                                    'transcript', 'event')),

  -- Our side. The name is a snapshot, so history stays legible after a staff
  -- record is edited or deleted (see the note on ON DELETE SET NULL above).
  staff_person_id   uuid references people(id) on delete set null,
  staff_name        text,

  -- Their side. counterparty_id points into customers / suppliers / leads
  -- (no foreign key: it is several tables); counterparty_ref is the raw handle
  -- (a phone number, an Instagram user id) and is blanked on erasure.
  counterparty_kind text check (counterparty_kind in
                      ('customer', 'supplier', 'lead', 'staff', 'unknown')),
  counterparty_id   uuid,
  counterparty_ref  text,

  -- Where it lives in the channel's own system: the conversation, and the
  -- message id that makes a resent webhook land once.
  thread_ref        text,
  external_id       text,

  -- The content. For a transcript this is the transcribed text; for an event
  -- (camera) it is the description. Media sits in a private storage bucket and
  -- is only referenced here.
  body              text,
  language          text,
  media_path        text,
  media_mime        text,
  media_seconds     integer check (media_seconds is null or media_seconds >= 0),

  -- A transcript points at the audio row it was made from.
  parent_id         uuid references comm_events(id) on delete restrict,

  -- Every origin this row descends from (see decision 2 above).
  lineage           text[] not null default '{}',

  -- How the other person was told: nothing, Meta's spoken announcement, or the
  -- staff papers (for internal conversations).
  consent           text not null default 'none'
                    check (consent in ('none', 'announced', 'staff_policy')),

  -- Work conversations only. Rows that are not work are not copied in at all;
  -- the flag is for the day a mixed thread has to be kept but ignored.
  work              boolean not null default true,

  -- Optional company id, so selling the product to other manufacturers later
  -- does not mean rewriting this table. Unused today.
  org_id            uuid,

  redacted_at       timestamptz,
  detail            jsonb not null default '{}'::jsonb,

  constraint comm_events_dedupe unique (channel, external_id),
  constraint comm_events_lineage_ok
    check (lineage <@ array['whatsapp', 'meta_messaging', 'internal', 'camera']::text[]
           and cardinality(lineage) >= 1),
  constraint comm_events_transcript_has_parent
    check (kind <> 'transcript' or parent_id is not null)
);

create index if not exists comm_events_channel_time_idx
  on comm_events (channel, occurred_at desc);
create index if not exists comm_events_thread_idx
  on comm_events (thread_ref, occurred_at) where thread_ref is not null;
create index if not exists comm_events_counterparty_idx
  on comm_events (counterparty_kind, counterparty_id, occurred_at desc)
  where counterparty_id is not null;
create index if not exists comm_events_parent_idx
  on comm_events (parent_id) where parent_id is not null;

comment on table comm_events is
  'Append-only record of every work conversation (chat, call, voice note, transcript, '
  'camera event). Never edited or deleted; erased only through redact_comm_event(). '
  'lineage carries the licensing origin of the data and is maintained by trigger.';


-- --- 3. The database keeps the stamps right --------------------------------

create or replace function comm_events_before_insert()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  -- The time the record was made is the database's to say.
  new.recorded_at := now();

  if new.staff_name is null and new.staff_person_id is not null then
    select pe.full_name into new.staff_name
      from people pe where pe.id = new.staff_person_id;
  end if;

  -- Source tags: whatever the writer passed, plus this channel's own origin,
  -- plus everything the parent row carries. Nothing a writer says can drop one.
  select coalesce(array_agg(distinct t order by t), '{}'::text[])
    into new.lineage
    from unnest(
           coalesce(new.lineage, '{}'::text[])
        || array[comm_channel_origin(new.channel)]
        || coalesce((select c.lineage from comm_events c where c.id = new.parent_id),
                    '{}'::text[])
         ) as t;

  return new;
end $fn$;

drop trigger if exists comm_events_stamp on comm_events;
create trigger comm_events_stamp
  before insert on comm_events
  for each row execute function comm_events_before_insert();


-- --- 4. Append-only, except for erasure ------------------------------------

create or replace function comm_events_guard_update()
returns trigger
language plpgsql as $fn$
declare
  -- What erasure may change. Everything else on the row is frozen.
  erasable text[] := array['body', 'language', 'media_path', 'media_mime',
                           'media_seconds', 'counterparty_ref', 'detail',
                           'redacted_at'];
begin
  -- A deleted staff record unlinks itself (ON DELETE SET NULL is an UPDATE).
  -- Allowed only when that is the sole change; the snapshot name stays.
  if new.staff_person_id is null and old.staff_person_id is not null
     and (to_jsonb(new) - 'staff_person_id') = (to_jsonb(old) - 'staff_person_id') then
    return new;
  end if;

  if old.redacted_at is not null then
    raise exception 'This event has been erased and cannot change again.'
      using errcode = 'check_violation';
  end if;

  if new.redacted_at is null
     or (to_jsonb(new) - erasable) is distinct from (to_jsonb(old) - erasable) then
    raise exception
      'The conversation record is append-only. An event can only be erased with redact_comm_event(), never edited.'
      using errcode = 'check_violation';
  end if;

  return new;
end $fn$;

drop trigger if exists comm_events_immutable on comm_events;
create trigger comm_events_immutable
  before update on comm_events
  for each row execute function comm_events_guard_update();

create or replace function comm_events_no_delete()
returns trigger
language plpgsql as $fn$
begin
  raise exception
    'The conversation record cannot be deleted. Use redact_comm_event() to erase an event.'
    using errcode = 'check_violation';
end $fn$;

drop trigger if exists comm_events_no_delete on comm_events;
create trigger comm_events_no_delete
  before delete on comm_events
  for each row execute function comm_events_no_delete();


-- --- 5. Erasure ------------------------------------------------------------
--
-- The only way content leaves the record. It blanks the text, the media
-- reference and the contact handle, stamps redacted_at, and keeps the stub.
-- It does not remove the media file from storage (there is no bucket yet);
-- whoever calls it has to delete that file too.
--
--   select redact_comm_event('<event id>', 'requested by the customer');

create or replace function redact_comm_event(p_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  -- Three ways in: a super admin signed in with OUR token (the table's
  -- restrictive issuer policy is skipped inside a SECURITY DEFINER function,
  -- so the issuer is checked here), the service role (the Worker), or an
  -- operator on a direct database connection. app_tier() is NULL for a token
  -- that matches no active person, so every test goes through coalesce.
  if not (
       (coalesce(app_tier(), -1) >= 4 and coalesce(app_issuer_ok(), false))
    or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or session_user in ('postgres', 'supabase_admin')
  ) then
    raise exception 'Only a system administrator can erase a recorded conversation.'
      using errcode = 'insufficient_privilege';
  end if;

  update comm_events
     set body             = null,
         language         = null,
         media_path       = null,
         media_mime       = null,
         media_seconds    = null,
         counterparty_ref = null,
         detail           = jsonb_build_object('erased', true,
                                               'reason', coalesce(p_reason, '')),
         redacted_at      = now()
   where id = p_id and redacted_at is null;

  if not found then
    raise exception 'No such event, or it has already been erased.'
      using errcode = 'no_data_found';
  end if;
end $fn$;

revoke all on function redact_comm_event(uuid, text) from public, anon;
grant execute on function redact_comm_event(uuid, text) to authenticated, service_role;


-- --- 6. Access -------------------------------------------------------------
--
-- Helper calls are wrapped in ( SELECT ... ) so Postgres asks once per
-- statement instead of once per row (migration 0061).

alter table comm_events enable row level security;

drop policy if exists "require_known_issuer" on comm_events;
create policy "require_known_issuer" on comm_events
  as restrictive for all
  to authenticated
  using ((select app_issuer_ok()));

-- Reading the record is the `comms_record` permission, which does not exist
-- yet (see decision 3), so for now this lets nobody in.
drop policy if exists "comms_record_read" on comm_events;
create policy "comms_record_read" on comm_events
  as permissive for select
  to authenticated
  using ((select app_can_view('comms_record'::text)));

-- No insert, update or delete policy for signed-in users, on purpose. Supabase
-- opens every new table to anon, authenticated AND service_role by default;
-- the REVOKE removes all of that (including TRUNCATE, which no row trigger can
-- stop) before the narrow grants below.
revoke all on comm_events from anon, authenticated, service_role;
grant select on comm_events to authenticated;
grant select, insert on comm_events to service_role;

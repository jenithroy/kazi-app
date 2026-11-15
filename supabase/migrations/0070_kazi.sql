-- ============================================================================
-- 0070_kazi.sql
--
-- Kazi, the assistant in the chat list (worker/lib/kazi.js, src/components/chat/KaziThread.jsx).
-- This adds exactly two things and touches no existing table, policy, view or function:
--
--   1. The `kazi` permission section: who may open the Kazi chat. Inserting it fires
--      grant_new_section_to_super_admins() from 0028, so every tier-4 position (Director,
--      System Admin, Developer) gets it at once and everyone else starts at None, to be
--      granted in the Admin Panel. Until this file is applied the Worker answers "not
--      switched on" and the chat list shows no Kazi: the section not existing reads as no
--      permission for everybody.
--
--   2. `kazi_messages`: what each person asked Kazi and what Kazi answered, one row each,
--      with the lookups it used, the model and what the answer cost. It is the chat's
--      history, and it is Kazi's report card: later, how often an answer was right is
--      counted from here.
--
-- Decisions, so nobody has to rediscover them:
--
--   * PRIVATE TO THE PERSON. A person reads and writes only their own rows, and only while
--     they hold the `kazi` permission. Nobody else can read another person's questions
--     through the app, a director included: a question can be about anything (an employee,
--     a bank balance). Whoever runs the database can read all of it, which is how the report
--     card is marked; nobody else can.
--   * NO UPDATE, NO DELETE for anyone signed in (no grant at all), and nothing for the
--     service role: the Worker writes as the person, with the person's own token, never
--     with a key of its own. Supabase opens every new table to anon, authenticated AND
--     service_role by default; the REVOKE removes all of that before the narrow grant.
--   * person_id is ON DELETE SET NULL, so removing a staff record is never blocked by it
--     (migration 0060 exists because that trap once blocked deleting a person). The rows
--     stay, unlinked and unreadable through the app.
--   * created_at is the database's own clock, stamped by a trigger whatever the writer sends, so nobody can backdate what they asked
--     or what Kazi answered (and `seq` cannot be set at all: it is an identity column that is generated always).
--   * WHAT THE DATABASE CANNOT TELL: the Worker writes as the person, so a person with the permission could write a row of their own
--     into their own history, "assistant" rows included, with any text, model and cost. The history is the person's own record, and the
--     report card must trust a row as Kazi's only where it carries the model and usage figures the Worker writes. (Closing this would
--     mean the Worker holding a key of its own, which Kazi is built not to.)
--   * Helper calls are wrapped in ( SELECT ... ) so Postgres asks once per statement
--     instead of once per row (migration 0061).
--
-- Applied by hand, one file at a time. Rehearsed first: scripts/rehearse-migration/0070.test.mjs.
-- Undo: supabase/undo/0070_kazi.undo.sql.
-- ============================================================================

-- --- 1. Who may use Kazi ------------------------------------------------------

insert into sections (id, label, aliases, is_personal, sort_order)
values ('kazi', 'Kazi (AI assistant)', array['assistant', 'ai', 'kazi'], false, 26)
on conflict (id) do update
  set label      = excluded.label,
      aliases    = excluded.aliases,
      sort_order = excluded.sort_order;


-- --- 2. What Kazi keeps -------------------------------------------------------

create table if not exists kazi_messages (
  id         uuid primary key default gen_random_uuid(),
  -- the order things were said in. A question and its answer are stored by one statement and would share a timestamp, so the
  -- history is read in this order, never by created_at alone.
  seq        bigint generated always as identity,
  person_id  uuid references people(id) on delete set null,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null check (char_length(content) between 1 and 100000),
  -- assistant rows only: [{"tool": "list_orders", "input": {...}}, ...], what it looked at
  lookups    jsonb,
  model      text,
  -- assistant rows only: {"input": n, "output": n, "cache_read": n, "cache_write": n}, tokens for the whole answer
  usage      jsonb,
  -- an estimate in US dollars from the published prices, not a bill
  cost_usd   numeric(10, 4) check (cost_usd is null or cost_usd >= 0),
  created_at timestamptz not null default now()
);

comment on table kazi_messages is
  'What each person asked Kazi (the assistant in the chat list) and what it answered, with the lookups used and the cost. '
  'Private to the person; written by the Worker as the person. Never edited or deleted by the app.';

create index if not exists kazi_messages_person_seq_idx
  on kazi_messages (person_id, seq desc);

-- created_at is the database's own clock, whatever was sent (clock_timestamp(), so two rows of one statement differ too).
create or replace function kazi_messages_stamp()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  new.created_at := clock_timestamp();
  return new;
end $fn$;

drop trigger if exists kazi_messages_stamp on kazi_messages;
create trigger kazi_messages_stamp
  before insert on kazi_messages
  for each row execute function kazi_messages_stamp();


-- --- 3. Access ----------------------------------------------------------------

alter table kazi_messages enable row level security;

drop policy if exists "require_known_issuer" on kazi_messages;
create policy "require_known_issuer" on kazi_messages
  as restrictive for all
  to authenticated
  using ((select app_issuer_ok()));

drop policy if exists "kazi_read_own" on kazi_messages;
create policy "kazi_read_own" on kazi_messages
  as permissive for select
  to authenticated
  using (person_id = (select app_person_id()) and (select app_can_view('kazi'::text)));

drop policy if exists "kazi_insert_own" on kazi_messages;
create policy "kazi_insert_own" on kazi_messages
  as permissive for insert
  to authenticated
  with check (person_id = (select app_person_id()) and (select app_can_view('kazi'::text)));

revoke all on kazi_messages from anon, authenticated, service_role;
grant select, insert on kazi_messages to authenticated;

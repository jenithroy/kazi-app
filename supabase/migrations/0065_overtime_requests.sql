-- ============================================================================
-- 0065_overtime_requests.sql
--
-- Staff ask for overtime themselves. Until now only someone who may edit Attendance (tier 2 or
-- above) could put overtime on a person, so the person had no way to say "I need to stay on
-- Thursday". Now they can ask: a day, from, until, why. It has to be asked BEFORE they clock in
-- that day (the same rule as approving it, 0064), and an approver then approves it (an
-- overtime_approvals row, exactly as before) or declines it.
--
-- A request is only ever "pending" or "declined" here. "Approved" is not stored: a request is
-- approved when an approval exists for that person and day. So approving a request and approving
-- the same day directly from the form are one and the same thing, nothing can get out of step, and
-- an approval that is later removed simply makes the request pending again.
--
-- Who may do what (row-level security):
--   a person    asks for themselves, changes or withdraws what they asked while it is theirs, and re-asks after
--               a decline; reads only their own. They can never decide anything or ask for someone else.
--   an approver (tier 2 or above with Attendance) reads everyone's and declines, or removes, any of them.
--   anyone else, and a visitor, gets nothing.
--
-- The trigger (not the page) enforces: nothing can be asked for a day that has passed (Kathmandu time) or for
-- a day the person has already clocked in; "who declined it and when" is stamped by the database, and cleared
-- when the person asks again. A decline alone is still allowed after they have clocked in (an approver tidying the list).
--
-- Nothing is dropped and no row is touched. Safe to run twice.
-- ============================================================================

create table if not exists public.overtime_requests (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.people(id) on delete cascade,
  date          date not null,
  from_time     time not null,
  until_time    time not null,
  reason        text not null default 'other',
  note          text,
  status        text not null default 'pending',
  decided_by    uuid references public.people(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now()
);

-- Separate statements so they also tighten a table an earlier run created.
alter table public.overtime_requests drop constraint if exists overtime_request_window;
alter table public.overtime_requests add constraint overtime_request_window check (until_time > from_time);

alter table public.overtime_requests drop constraint if exists overtime_request_reason;
alter table public.overtime_requests add constraint overtime_request_reason
  check (reason in ('late_client_change', 'bottleneck', 'rework', 'material_delay', 'unrealistic_deadline', 'other'));

alter table public.overtime_requests drop constraint if exists overtime_request_status;
alter table public.overtime_requests add constraint overtime_request_status check (status in ('pending', 'declined'));

alter table public.overtime_requests drop constraint if exists overtime_request_note_len;
alter table public.overtime_requests add constraint overtime_request_note_len
  check ((note is null or char_length(note) <= 280) and (decision_note is null or char_length(decision_note) <= 280));

-- one request per person per day: asking again (after a decline, or to change it) is an upsert on this
create unique index if not exists overtime_request_once on public.overtime_requests (person_id, date);
create index if not exists overtime_request_date_idx on public.overtime_requests (date);


-- ─── The rules the database enforces itself ──────────────────────────────────

create or replace function public.overtime_request_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  decision_only boolean := false;
begin
  -- a decline that changes nothing the person wrote (an approver deciding, possibly after the person clocked in)
  if tg_op = 'UPDATE' then
    decision_only := new.status = 'declined'
      and old.person_id = new.person_id and old.date = new.date
      and old.from_time = new.from_time and old.until_time = new.until_time
      and old.reason = new.reason and old.note is not distinct from new.note;
  end if;

  -- who declined it and when is the database's to say; a request that is pending again carries no decision
  if new.status = 'declined' then
    if tg_op = 'INSERT' or old.status is distinct from 'declined' then
      new.decided_by := public.app_person_id();
      new.decided_at := now();
    end if;
  else
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := null;
  end if;

  if not decision_only then
    if new.date < (now() at time zone 'Asia/Kathmandu')::date then
      raise exception 'Overtime can only be asked for today or a coming day.'
        using errcode = 'check_violation', constraint = 'overtime_request_past_day';
    end if;
    if exists (select 1 from public.clock_ins c where c.person_id = new.person_id and c.date = new.date) then
      raise exception 'Overtime has to be asked for before the person clocks in, and they have already clocked in on %.', to_char(new.date, 'DD Mon YYYY')
        using errcode = 'check_violation', constraint = 'overtime_request_before_clock_in';
    end if;
  end if;

  return new;
end $$;

revoke all on function public.overtime_request_guard() from public, anon, authenticated;

drop trigger if exists overtime_request_guard on public.overtime_requests;
create trigger overtime_request_guard
  before insert or update on public.overtime_requests
  for each row execute function public.overtime_request_guard();


-- ─── Who may read and write ──────────────────────────────────────────────────

alter table public.overtime_requests enable row level security;

drop policy if exists "read_own" on public.overtime_requests;
create policy "read_own" on public.overtime_requests
  as permissive for select
  to authenticated
  using (person_id = (select app_person_id()));

drop policy if exists "read_team" on public.overtime_requests;
create policy "read_team" on public.overtime_requests
  as permissive for select
  to authenticated
  using ((select app_can_view('attendance')) and (select app_tier()) >= 2);

-- a person asks for themselves, and only ever as "pending"
drop policy if exists "ask_own" on public.overtime_requests;
create policy "ask_own" on public.overtime_requests
  as permissive for insert
  to authenticated
  with check (person_id = (select app_person_id()) and status = 'pending');

-- a person changes (or re-asks) their own request; it stays theirs and ends up pending, never decided by them
drop policy if exists "change_own" on public.overtime_requests;
create policy "change_own" on public.overtime_requests
  as permissive for update
  to authenticated
  using (person_id = (select app_person_id()))
  with check (person_id = (select app_person_id()) and status = 'pending');

drop policy if exists "withdraw_own" on public.overtime_requests;
create policy "withdraw_own" on public.overtime_requests
  as permissive for delete
  to authenticated
  using (person_id = (select app_person_id()));

-- the people who approve overtime decide it (decline) and can tidy the list
drop policy if exists "decide" on public.overtime_requests;
create policy "decide" on public.overtime_requests
  as permissive for update
  to authenticated
  using ((select app_can_edit('attendance')) and (select app_tier()) >= 2)
  with check ((select app_can_edit('attendance')) and (select app_tier()) >= 2);

drop policy if exists "remove_team" on public.overtime_requests;
create policy "remove_team" on public.overtime_requests
  as permissive for delete
  to authenticated
  using ((select app_can_edit('attendance')) and (select app_tier()) >= 2);

drop policy if exists "require_known_issuer" on public.overtime_requests;
create policy "require_known_issuer" on public.overtime_requests
  as restrictive for all
  to authenticated
  using ((select app_issuer_ok()));

revoke all on public.overtime_requests from anon;
revoke truncate, references, trigger on public.overtime_requests from authenticated;
grant select, insert, update, delete on public.overtime_requests to authenticated;
grant select, insert, update, delete on public.overtime_requests to service_role;

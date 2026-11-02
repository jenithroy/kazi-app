-- ============================================================================
-- 0064_overtime_and_payroll_run.sql
--
-- Three things the new attendance and pay rules need.
--
-- 1. OVERTIME THAT IS APPROVED FIRST.
--    Someone who may edit Attendance (tier 2 or above, the rule that lets them change anyone's
--    attendance) approves a person's overtime for a day: from, until, and why (the memo's list: late
--    client change, bottleneck, rework, material delay, unrealistic deadline, other). It has to be
--    done BEFORE the person clocks in that day: a trigger refuses to add or change an approval once
--    they have clocked in (removing one stays possible). Only the time inside the approved window,
--    after the person's own shift ends, ever counts as overtime (the view overtime_days). Time past
--    the window, or on a day nothing was approved, counts for nothing, so a clock-out typed in late
--    cannot make overtime nobody approved. The approval's hours are Kathmandu time, like the rest.
--
-- 2. THE PAY LINES OF THE MONTHLY RUN. payroll gains receivable due, advance, TDS (and the rate it
--    was taken at; empty on a record made before TDS was kept here), the unapproved absences counted
--    and the overtime minutes paid, and bonus_reason, what a bonus was for ("Dashain", "Tihar",
--    "Performance" ...; a bonus of any kind goes in the existing bonus_npr, overtime pay in
--    overtime_npr and the attendance deduction in late_deduction_npr, as before). fs_finance_payroll
--    shows the new columns (appended, so nothing that reads it changes).
--
-- 3. THE LEADERBOARD'S HOURS. work_hours_leaderboard(from, to) ranks everyone who is still Active
--    by the hours they were credited: the time between clocking in and out that falls inside their
--    OWN hours that day (their weekday's hours, else their usual hours, else the memo's 10:00 to
--    18:00), plus approved overtime. A day marked by hand with no clock-in (a phone that could not
--    get a fix) counts as its hours, never more than their own hours. Anyone signed in may call it
--    and it only ever returns what the board shows: a name, minutes, overtime minutes and days.
--    work_shift(person, day) is the one place the rule for "their own hours" lives in SQL; it
--    mirrors getEmployeeScheduleForDate in src/constants.js for hours saved on a profile.
--
-- Nothing is dropped and no row is touched. Safe to run twice.
-- ============================================================================


-- ─── 1. Their hours on a day ─────────────────────────────────────────────────

create or replace function public.work_shift(p_person uuid, p_date date)
returns table (s_start time, s_end time)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  pe  public.people%rowtype;
  dow text := (array['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])[extract(dow from p_date)::int + 1];
  o   jsonb;
begin
  select * into pe from public.people where id = p_person;
  if found
     and pe.schedule_start is not null and pe.schedule_end is not null
     and (pe.schedule_working_days is null or cardinality(pe.schedule_working_days) = 0 or dow = any (pe.schedule_working_days))
  then
    o := pe.schedule_day_overrides -> dow;
    s_start := coalesce(nullif(o ->> 'start', '')::time, pe.schedule_start);
    s_end   := coalesce(nullif(o ->> 'end', '')::time, pe.schedule_end);
  else
    -- no hours of their own on that day: the memo's normal day
    s_start := time '10:00';
    s_end   := time '18:00';
  end if;
  return next;
end $$;

revoke all on function public.work_shift(uuid, date) from public, anon;
grant execute on function public.work_shift(uuid, date) to authenticated, service_role;


-- ─── 2. Overtime approvals ───────────────────────────────────────────────────

create table if not exists public.overtime_approvals (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people(id) on delete cascade,
  date        date not null,
  from_time   time not null,
  until_time  time not null,
  reason      text not null default 'other',
  note        text,
  approved_by uuid references public.people(id) on delete set null default public.app_person_id(),
  created_at  timestamptz not null default now()
);

-- Separate statements so they also tighten a table an earlier run created.
alter table public.overtime_approvals drop constraint if exists overtime_window;
alter table public.overtime_approvals add constraint overtime_window check (until_time > from_time);

alter table public.overtime_approvals drop constraint if exists overtime_reason;
alter table public.overtime_approvals add constraint overtime_reason
  check (reason in ('late_client_change', 'bottleneck', 'rework', 'material_delay', 'unrealistic_deadline', 'other'));

alter table public.overtime_approvals drop constraint if exists overtime_note_len;
alter table public.overtime_approvals add constraint overtime_note_len check (note is null or char_length(note) <= 280);

-- one approval per person per day: changing it is an upsert on this
create unique index if not exists overtime_once on public.overtime_approvals (person_id, date);
create index if not exists overtime_date_idx on public.overtime_approvals (date);

-- "approved before they clock in": once they have clocked in for that day the approval cannot be added or changed
create or replace function public.overtime_before_clock_in()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if exists (select 1 from public.clock_ins c where c.person_id = new.person_id and c.date = new.date) then
    raise exception 'Overtime has to be approved before the person clocks in, and they have already clocked in on %.', to_char(new.date, 'DD Mon YYYY')
      using errcode = 'check_violation', constraint = 'overtime_before_clock_in';
  end if;
  return new;
end $$;

revoke all on function public.overtime_before_clock_in() from public, anon, authenticated;

drop trigger if exists overtime_before_clock_in on public.overtime_approvals;
create trigger overtime_before_clock_in
  before insert or update on public.overtime_approvals
  for each row execute function public.overtime_before_clock_in();

alter table public.overtime_approvals enable row level security;

-- Everyone reads their own approvals (the clock-in says "overtime approved until 20:00"); an editor of Attendance reads and
-- changes everyone's.
drop policy if exists "read_own" on public.overtime_approvals;
create policy "read_own" on public.overtime_approvals
  as permissive for select
  to authenticated
  using (person_id = (select app_person_id()));

drop policy if exists "read_team" on public.overtime_approvals;
create policy "read_team" on public.overtime_approvals
  as permissive for select
  to authenticated
  using ((select app_can_view('attendance')) and (select app_tier()) >= 2);

drop policy if exists "manage" on public.overtime_approvals;
create policy "manage" on public.overtime_approvals
  as permissive for all
  to authenticated
  using ((select app_can_edit('attendance')) and (select app_tier()) >= 2)
  with check ((select app_can_edit('attendance')) and (select app_tier()) >= 2);

drop policy if exists "require_known_issuer" on public.overtime_approvals;
create policy "require_known_issuer" on public.overtime_approvals
  as restrictive for all
  to authenticated
  using (app_issuer_ok());

revoke all on public.overtime_approvals from anon;
revoke truncate, references, trigger on public.overtime_approvals from authenticated;
grant select, insert, update, delete on public.overtime_approvals to authenticated;
grant select, insert, update, delete on public.overtime_approvals to service_role;


-- ─── 3. The overtime that counts ─────────────────────────────────────────────
--
-- One row per approval: the minutes between the person's clock-in and clock-out that fall inside the approved window AND after
-- their own shift ends. No clock-out yet means 0. It reads what the caller may read (security_invoker), so a person sees their
-- own rows and an editor of Attendance sees everyone's.

create or replace view public.overtime_days as
  select a.id,
         a.person_id,
         to_char(a.date, 'YYYY-MM-DD') as date,
         to_char(a.from_time, 'HH24:MI') as from_time,
         to_char(a.until_time, 'HH24:MI') as until_time,
         a.reason,
         a.note,
         c.clocked_in_at,
         c.clocked_out_at,
         case
           when c.clocked_in_at is null or c.clocked_out_at is null then 0
           else greatest(0, floor(extract(epoch from (
                  least(c.clocked_out_at, (a.date + a.until_time) at time zone 'Asia/Kathmandu')
                - greatest(c.clocked_in_at, (a.date + greatest(a.from_time, sh.s_end)) at time zone 'Asia/Kathmandu')
                )) / 60))::integer
         end as minutes
    from public.overtime_approvals a
    cross join lateral public.work_shift(a.person_id, a.date) sh
    left join lateral (
      select min(k.clocked_in_at) as clocked_in_at, max(k.clocked_out_at) as clocked_out_at
        from public.clock_ins k
       where k.person_id = a.person_id and k.date = a.date
    ) c on true;
alter view public.overtime_days set (security_invoker = on);

revoke all on public.overtime_days from anon;
grant select on public.overtime_days to authenticated, service_role;


-- ─── 4. The pay lines of the monthly run ─────────────────────────────────────

alter table public.payroll add column if not exists receivable_due_npr numeric(12,2) not null default 0;
alter table public.payroll add column if not exists advance_npr        numeric(12,2) not null default 0;
alter table public.payroll add column if not exists tds_npr            numeric(12,2) not null default 0;
alter table public.payroll add column if not exists tds_rate_pct       numeric(5,2);       -- empty: a record made before TDS was kept here
alter table public.payroll add column if not exists unapproved_absences integer       not null default 0;
alter table public.payroll add column if not exists overtime_minutes   integer        not null default 0;
alter table public.payroll add column if not exists bonus_reason       text;               -- what the bonus was for; empty when there is none or it was not said
alter table public.payroll drop constraint if exists payroll_bonus_reason_len;
alter table public.payroll add constraint payroll_bonus_reason_len check (bonus_reason is null or char_length(bonus_reason) <= 60);

create or replace view fs_finance_payroll as
  select p.id::text as id,
    p.month,
    p.year,
    p.basic_npr         as "basicNPR",
    p.salary_npr        as "salaryNPR",
    p.bonus_npr         as "bonusNPR",
    p.overtime_npr      as "overtimeNPR",
    p.deduction_npr     as "deductionNPR",
    p.pf_deduction_npr  as "pfDeductionNPR",
    p.late_deduction_npr as "lateDeductionNPR",
    p.late_days         as "lateDays",
    p.late_cuts_count   as "lateCutsCount",
    p.total_deductions_npr as "totalDeductionsNPR",
    p.gross_npr         as "grossNPR",
    p.net_npr           as "netNPR",
    p.note,
    p.logged_by         as "loggedBy",
    coalesce(p.legacy_staff_id, pe.legacy_firebase_uid) as "staffId",
    coalesce(p.legacy_staff_name, pe.full_name) as "staffName",
    coalesce(p.legacy_role, '') as role,
    p.person_id,
    pe.location         as region,
    p.receivable_due_npr    as "receivableDueNPR",
    p.advance_npr           as "advanceNPR",
    p.tds_npr               as "tdsNPR",
    p.tds_rate_pct          as "tdsRatePct",
    p.unapproved_absences   as "unapprovedAbsences",
    p.overtime_minutes      as "overtimeMinutes",
    p.bonus_reason          as "bonusReason"
  from payroll p
  left join people pe on pe.id = p.person_id;
alter view fs_finance_payroll set (security_invoker = on);


-- ─── 5. The leaderboard: hours counted this period ───────────────────────────

create or replace function public.work_hours_leaderboard(p_from date, p_to date, p_limit integer default 50)
returns table (rank integer, person_id uuid, name text, minutes integer, overtime_minutes integer, days integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with clocked as (
    -- one clocked day per person: first in, last out, and only a day that was closed
    select k.person_id, k.date, min(k.clocked_in_at) as t_in, max(k.clocked_out_at) as t_out
      from clock_ins k
     where k.date between p_from and p_to and k.clocked_out_at is not null
     group by k.person_id, k.date
  ),
  credit as (
    -- the time they were in that falls inside their own hours that day
    select c.person_id,
           greatest(0, floor(extract(epoch from (
             least(c.t_out, (c.date + sh.s_end) at time zone 'Asia/Kathmandu')
           - greatest(c.t_in, (c.date + sh.s_start) at time zone 'Asia/Kathmandu')
           )) / 60))::integer as m
      from clocked c
      cross join lateral work_shift(c.person_id, c.date) sh
    union all
    -- a day somebody marked by hand with no clock-in at all: its hours, never more than their own hours
    select a.person_id,
           least(round(a.hours * 60), greatest(0, floor(extract(epoch from (sh.s_end - sh.s_start)) / 60)))::integer
      from attendance a
      cross join lateral work_shift(a.person_id, a.date) sh
     where a.date between p_from and p_to
       and a.status in ('Present', 'Late', 'Half-day')
       and not exists (select 1 from clock_ins k where k.person_id = a.person_id and k.date = a.date)
  ),
  worked as (
    select person_id, sum(m)::integer as m, count(*) filter (where m > 0)::integer as d from credit group by person_id
  ),
  extra as (
    select o.person_id, sum(o.minutes)::integer as m
      from overtime_days o
     where o.date between to_char(p_from, 'YYYY-MM-DD') and to_char(p_to, 'YYYY-MM-DD')
     group by o.person_id
  )
  select (rank() over (order by coalesce(w.m, 0) + coalesce(x.m, 0) desc))::integer,
         pe.id,
         pe.full_name,
         (coalesce(w.m, 0) + coalesce(x.m, 0))::integer,
         coalesce(x.m, 0)::integer,
         coalesce(w.d, 0)::integer
    from people pe
    left join worked w on w.person_id = pe.id
    left join extra x on x.person_id = pe.id
   where pe.status = 'Active'
     and app_person_id() is not null and app_issuer_ok()
     and coalesce(w.m, 0) + coalesce(x.m, 0) > 0
   order by 4 desc, pe.full_name
   limit greatest(coalesce(p_limit, 50), 1);
$$;

revoke all on function public.work_hours_leaderboard(date, date, integer) from public, anon;
grant execute on function public.work_hours_leaderboard(date, date, integer) to authenticated, service_role;

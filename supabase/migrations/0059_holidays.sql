-- ============================================================================
-- 0059_holidays.sql
--
-- Holidays: days the office is closed besides the weekly Saturday (Dashain, Tihar,
-- a strike, a power cut that closes the shop floor ...).
--
-- A holiday is one row for a run of days ("Dashain", 3 to 17 October). It is for one
-- region (the UK team and the Nepal team keep different holidays) or for everyone when
-- region is null. On a holiday nobody is expected in: the roll call, the calendars and
-- the monthly reports treat it like a Saturday (nothing is "absent", and anything that
-- was recorded on that day still counts), and the clock-in circle says it is a holiday.
--
-- Everyone signed in can read the list (the clock-in has to know). Only a person who may
-- edit Attendance and is tier 2 or above (the same rule that lets them change anyone's
-- attendance) can add, change or remove one.
--
-- Safe to run twice.
-- ============================================================================

create table if not exists public.holidays (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  start_date date not null,
  end_date   date not null,
  region     text,
  created_by uuid references public.people(id) on delete set null default public.app_person_id(),
  created_at timestamptz not null default now()
);

-- Separate statements so they also tighten a table an earlier run created.
alter table public.holidays drop constraint if exists holidays_name_len;
alter table public.holidays add constraint holidays_name_len check (char_length(btrim(name)) between 1 and 80);

alter table public.holidays drop constraint if exists holidays_dates;
alter table public.holidays add constraint holidays_dates check (end_date >= start_date and end_date - start_date <= 59);

alter table public.holidays drop constraint if exists holidays_region;
alter table public.holidays add constraint holidays_region check (region is null or region in ('nepal', 'uk'));

-- the same holiday twice for the same day and region is a slip, not a second holiday
create unique index if not exists holidays_once on public.holidays (lower(btrim(name)), start_date, coalesce(region, ''));
create index if not exists holidays_dates_idx on public.holidays (start_date, end_date);

alter table public.holidays enable row level security;

drop policy if exists "read_all" on public.holidays;
create policy "read_all" on public.holidays
  as permissive for select
  to authenticated
  using (app_person_id() is not null);

drop policy if exists "manage" on public.holidays;
create policy "manage" on public.holidays
  as permissive for all
  to authenticated
  using (app_can_edit('attendance') and app_tier() >= 2)
  with check (app_can_edit('attendance') and app_tier() >= 2);

drop policy if exists "require_known_issuer" on public.holidays;
create policy "require_known_issuer" on public.holidays
  as restrictive for all
  to authenticated
  using (app_issuer_ok());

-- Supabase hands every new table to anon and authenticated with every privilege; take back what
-- the app never uses (RLS alone would keep anon out of the rows, but not out of TRUNCATE).
revoke all on public.holidays from anon;
revoke truncate, references, trigger on public.holidays from authenticated;
grant select, insert, update, delete on public.holidays to authenticated;
grant select, insert, update, delete on public.holidays to service_role;

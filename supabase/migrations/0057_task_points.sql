-- ============================================================================
-- 0057_task_points.sql
--
-- Points for finishing tasks, awarded by the database.
--
-- Why not the browser: award_points() (0016) took the person, the event and the
-- amount from whoever called it, and every signed-in user could call it, so anyone
-- could have given anyone any number of points. The app never turned it on
-- (REWARDS_ENABLED is false), but the function was there. It is dropped here, and
-- no signed-in user can write to the points tables any more.
--
-- Instead a trigger on `tasks` pays the points when a task goes from unfinished to
-- finished (completed_at empty -> set), to the person it is assigned to:
--
--     20 points                      any task
--     30 points                      a task whose priority is High
--     +10 points                     finished on or before its due date (Kathmandu date)
--
-- A task pays once per person, however many times it is reopened and finished again:
-- the ledger row's id is "person__task_completed__task", and a second award collides
-- with it. Reopening does not take points back, and deleting or archiving a task
-- never touches them; the ledger stands on its own. A task with nobody assigned (or
-- only a typed name, not a person) earns nothing.
--
-- Points start the day this runs. A task that is already finished when it runs has no
-- row in the ledger, which would let its person reopen it and finish it again for
-- points; so each such task gets a row worth 0 points (section 5), and that is that.
-- The same step is repeated at the end of 0058, once it has linked old tasks to people.
--
-- "On time" is judged by the Kathmandu calendar for everybody.
--
-- Finishing a task never fails because of points: if awarding goes wrong the task is
-- still finished and a warning is logged (Logs > Postgres in the Supabase dashboard).
--
-- Nobody signed in can read the ledger itself: its reasons are task titles, and a task
-- is only for people who can see Tasks. The app reads points through three functions that
-- anyone signed in may call and that only ever show what the app shows: my_points(),
-- points_leaderboard() and my_point_history(). Only people who are still Active appear on
-- the board. "This week" is worked out from the ledger, Sunday to Saturday in Kathmandu
-- (user_points.weekly_points was only ever added to and never reset, so it is no longer
-- kept). The totals in user_points stay readable for the Employees page's org chart.
--
-- To correct someone's points by hand, in the SQL editor:
--     select award_points_internal('<person id>', null, 'adjustment', 'note-1', 25, 'why');
--
-- Safe to run twice, and safe whether or not 0011 / 0016 / 0041 were ever run.
-- ============================================================================


-- ─── 1. The tables (as 0011 made them, if it was not run) ────────────────────

create table if not exists public.user_points (
  person_id      uuid primary key references public.people(id) on delete cascade,
  display_name   text,
  total_points   integer not null default 0,
  weekly_points  integer not null default 0,   -- no longer kept: "this week" comes from point_transactions
  last_updated   timestamptz not null default now()
);

-- The primary key is "person__event__source", which is what makes awarding idempotent.
create table if not exists public.point_transactions (
  id           text primary key,
  person_id    uuid references public.people(id) on delete cascade,
  event_type   text not null,
  source_id    text not null,
  points       integer not null default 0,
  reason       text,
  awarded_at   timestamptz not null default now()
);
create index if not exists point_transactions_person_idx on public.point_transactions (person_id, awarded_at desc);
create index if not exists point_transactions_awarded_idx on public.point_transactions (awarded_at desc);

-- A one-row cache of the ranked lists that nothing reads any more. Kept so an older
-- copy of the app that still looks at it does not fail; nothing writes to it now.
create table if not exists public.leaderboard (
  id            text primary key,
  all_time      jsonb not null default '[]',
  weekly        jsonb not null default '[]',
  last_updated  timestamptz not null default now()
);

-- The trigger below needs this on tasks (0041 and 0058 add it too).
alter table public.tasks add column if not exists completed_at timestamptz;


-- ─── 2. Nobody signed in writes these; only the totals can be read ───────────
--
-- The ledger (point_transactions) says what every award was for, and that is a task's
-- title, so it is not readable at all: people see their own through my_point_history().
-- The old one-row cache (leaderboard) is not read by anything. Both are written and read
-- only by the functions below, which run as their owner. The totals (user_points) stay
-- readable to whoever can see the Dashboard, as before, for the Employees org chart.

do $$
declare
  t text;
begin
  foreach t in array array['user_points', 'point_transactions', 'leaderboard']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "require_known_issuer" on public.%I', t);
    execute format($f$create policy "require_known_issuer" on public.%I
                      as restrictive for all to authenticated using (app_issuer_ok())$f$, t);

    execute format('drop policy if exists "sect_read" on public.%I', t);
    execute format('drop policy if exists "sect_write" on public.%I', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

create policy "sect_read" on public.user_points
  as permissive for select to authenticated using (app_can_view('dashboard'));
grant select on public.user_points to authenticated;

-- The Employees page's org chart reads totals through this view (as 0011 defined it).
create or replace view public.fs_user_points as
  select coalesce(pe.legacy_firebase_uid, up.person_id::text) as id,
         up.person_id::text as "personId",
         coalesce(up.display_name, pe.full_name) as "displayName",
         up.total_points  as "totalPoints",
         up.weekly_points as "weeklyPoints",
         up.last_updated  as "lastUpdated"
    from public.user_points up
    left join public.people pe on pe.id = up.person_id;
alter view public.fs_user_points set (security_invoker = on);
grant select on public.fs_user_points to authenticated, service_role;


-- ─── 3. Awarding: internal only ──────────────────────────────────────────────

drop function if exists public.award_points(uuid, text, text, text, integer, text);

create or replace function public.award_points_internal(
  p_person_id    uuid,
  p_display_name text,
  p_event_type   text,
  p_source_id    text,
  p_points       integer,
  p_reason       text default null
)
returns integer
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  tx_id     text := p_person_id::text || '__' || p_event_type || '__' || p_source_id;
  new_total integer;
begin
  if p_person_id is null or p_points is null or p_points <= 0 then
    return null;
  end if;

  -- A repeat award for the same person, event and source inserts nothing, and we stop.
  insert into point_transactions (id, person_id, event_type, source_id, points, reason)
  values (tx_id, p_person_id, p_event_type, p_source_id, p_points, coalesce(p_reason, p_event_type))
  on conflict (id) do nothing;

  if not found then
    return null;
  end if;

  insert into user_points (person_id, display_name, total_points, weekly_points, last_updated)
  values (p_person_id, p_display_name, p_points, 0, now())
  on conflict (person_id) do update
    set total_points = user_points.total_points + excluded.total_points,
        display_name = coalesce(excluded.display_name, user_points.display_name),
        last_updated = now()
  returning total_points into new_total;

  return new_total;
end $$;

revoke all on function public.award_points_internal(uuid, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.award_points_internal(uuid, text, text, text, integer, text) to service_role;


-- ─── 4. The trigger: finishing a task pays its assignee ──────────────────────

create or replace function public.tasks_award_points()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  pts   integer;
  today date := (now() at time zone 'Asia/Kathmandu')::date;
  who   text;
begin
  if new.completed_at is null or old.completed_at is not null then return new; end if;
  if new.assignee_id is null then return new; end if;

  -- keep these numbers in step with src/constants/points.js (the app shows them on each task)
  pts := case when lower(btrim(coalesce(new.priority, ''))) = 'high' then 30 else 20 end;
  if new.due_date is not null and today <= new.due_date then pts := pts + 10; end if;

  -- A problem with points must never stop a task being finished: the inner block undoes
  -- only the award, the task still saves, and the reason goes to the database log.
  begin
    select full_name into who from people where id = new.assignee_id;
    perform award_points_internal(new.assignee_id, who, 'task_completed', new.id::text, pts, left(new.title, 120));
  exception when others then
    raise warning 'points were not awarded for task % (%): %', new.id, new.title, sqlerrm;
  end;
  return new;
end $$;

revoke all on function public.tasks_award_points() from public, anon, authenticated;

drop trigger if exists tasks_award_points on public.tasks;
create trigger tasks_award_points
  after update of completed_at on public.tasks
  for each row
  when (old.completed_at is null and new.completed_at is not null)
  execute function public.tasks_award_points();


-- ─── 5. History is closed ────────────────────────────────────────────────────
--
-- A task that is finished by the time this runs was finished before points existed (with
-- or without a finish date: the older page stamped one for a while). Each such task gets a
-- ledger row worth 0 points, dated long ago so it counts for nothing and shows nowhere,
-- whose only job is to occupy the id that finishing the task again would use. Rows that
-- are already there (real awards) are left alone.

insert into public.point_transactions (id, person_id, event_type, source_id, points, reason, awarded_at)
select t.assignee_id::text || '__task_completed__' || t.id::text,
       t.assignee_id, 'task_completed', t.id::text, 0, 'finished before points started', timestamptz '1970-01-01'
  from public.tasks t
 where t.assignee_id is not null
   and lower(btrim(t.status)) = 'done'
on conflict (id) do nothing;


-- ─── 6. What the app reads ───────────────────────────────────────────────────

-- The start of this week (Sunday 00:00 in Kathmandu) as a point in time.
create or replace function public.points_week_start()
returns timestamptz
language sql
stable
as $$
  select (date_trunc('week', (now() at time zone 'Asia/Kathmandu') + interval '1 day') - interval '1 day')
         at time zone 'Asia/Kathmandu';
$$;

-- My totals and where I stand. One row, or none if the caller is not a known person.
create or replace function public.my_points()
returns table (
  total_points integer,
  week_points  integer,
  rank_total   integer,
  rank_week    integer,
  people_total integer,
  people_week  integer
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with me as (select app_person_id() as id where app_issuer_ok()),
  -- only people who still work here are ranked, here and on the board, so the two agree
  totals as (
    select u.person_id, u.total_points as pts
      from user_points u
      join people p on p.id = u.person_id and p.status = 'Active'
     where u.total_points > 0
  ),
  weekly as (
    select t.person_id, sum(t.points)::integer as pts
      from point_transactions t
      join people p on p.id = t.person_id and p.status = 'Active'
     where t.awarded_at >= points_week_start() and t.points > 0
     group by t.person_id
  ),
  rank_t as (select person_id, rank() over (order by pts desc)::integer as r from totals),
  rank_w as (select person_id, rank() over (order by pts desc)::integer as r from weekly)
  select coalesce((select pts from totals where person_id = me.id), 0)::integer,
         coalesce((select pts from weekly where person_id = me.id), 0)::integer,
         (select r from rank_t where person_id = me.id),
         (select r from rank_w where person_id = me.id),
         (select count(*) from totals)::integer,
         (select count(*) from weekly)::integer
    from me
   where me.id is not null;
$$;

-- The board: everyone with points, best first. p_scope is 'week' (default) or 'all'.
create or replace function public.points_leaderboard(p_scope text default 'week', p_limit integer default 10)
returns table (rank integer, person_id uuid, name text, points integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with scoped as (
    select u.person_id, u.total_points as pts
      from user_points u
     where lower(coalesce(p_scope, 'week')) = 'all' and u.total_points > 0
    union all
    select t.person_id, sum(t.points)::integer
      from point_transactions t
     where lower(coalesce(p_scope, 'week')) <> 'all'
       and t.awarded_at >= points_week_start() and t.points > 0 and t.person_id is not null
     group by t.person_id
  )
  select (rank() over (order by s.pts desc))::integer, s.person_id, pe.full_name, s.pts::integer
    from scoped s
    join people pe on pe.id = s.person_id and pe.status = 'Active'
   where app_person_id() is not null and app_issuer_ok()
   order by s.pts desc, pe.full_name
   limit greatest(coalesce(p_limit, 10), 1);
$$;

-- My latest awards, newest first.
create or replace function public.my_point_history(p_limit integer default 8)
returns table (points integer, reason text, event_type text, awarded_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select t.points, t.reason, t.event_type, t.awarded_at
    from point_transactions t
   where t.person_id = app_person_id() and app_issuer_ok() and t.points > 0
   order by t.awarded_at desc
   limit greatest(coalesce(p_limit, 8), 1);
$$;

revoke all on function public.points_week_start() from public, anon;
revoke all on function public.my_points() from public, anon;
revoke all on function public.points_leaderboard(text, integer) from public, anon;
revoke all on function public.my_point_history(integer) from public, anon;
grant execute on function public.points_week_start() to authenticated, service_role;
grant execute on function public.my_points() to authenticated, service_role;
grant execute on function public.points_leaderboard(text, integer) to authenticated, service_role;
grant execute on function public.my_point_history(integer) to authenticated, service_role;

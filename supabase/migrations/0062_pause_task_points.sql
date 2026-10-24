-- ============================================================================
-- 0062_pause_task_points.sql
--
-- Finishing a task stops paying points, for now.
--
-- 0057 put a trigger on `tasks` that pays the person a task is assigned to when it is
-- finished: 20 points, 30 for a High priority task, +10 if it is finished by its due date.
-- On 2026-10-22 the points system was put on hold. A task's priority is not its value, and
-- tasks are too easy to add and tick off: of the 155 tasks finished in the 60 days before,
-- 9 in 10 were made by the person who finished them and 42 were done within two minutes of
-- being added. Nothing is paid for tasks until a new rule is decided, and the screens that
-- showed points were taken off the Tasks page and the profile cards.
--
-- Without this, the trigger would go on quietly paying points nobody can see (a task
-- finished on the phone app reaches it too), and those totals would be waiting for the
-- real leaderboard.
--
-- This only SWITCHES THE TRIGGER OFF. Nothing is dropped and no row is touched: the
-- function, the three tables, the reading functions (my_points, points_leaderboard,
-- my_point_history) and the ledger stay exactly as they are. To turn task points back on:
--
--     alter table public.tasks enable trigger tasks_award_points;
--
-- Safe to run twice, and safe where the trigger was never created.
-- ============================================================================

do $$
begin
  if exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.tasks'::regclass
       and tgname = 'tasks_award_points'
       and not tgisinternal
  ) then
    alter table public.tasks disable trigger tasks_award_points;
  end if;
end $$;

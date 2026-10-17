-- ============================================================================
-- 0058_tasks_board.sql
--
-- What the rebuilt Tasks page needs. This REPLACES 0041_task_sections.sql: it does
-- everything 0041 does (and is safe whether or not 0041 was ever run), then adds:
--
--   * tasks.section_id     which section (lane of the board) a task sits in      (0041)
--   * tasks.completed_at   when it was finished; set on finishing, cleared on reopening (0041)
--   * tasks.archived_at    NEW. "Clear done" fills it. An archived task is still a finished
--                          task (status stays Done, its points stay), it just leaves the
--                          Done list for the Archive.
--   * tasks.assignee_id    NEW use. Tasks used to carry only a typed name. The page now
--                          assigns a person, and here every existing task whose name matches
--                          exactly one person gets that person (a name shared by two people
--                          is left alone). Points and photos need the person, not the name.
--   * fs_tasks             exposes completedAt, sectionId (0041) and archivedAt. Its status
--                          reads Done for a finished task and otherwise the NAME OF ITS
--                          SECTION, which is what the dashboards count by (0041). New
--                          columns go last: CREATE OR REPLACE VIEW cannot reorder them.
--   * set_task_done()      Finish or reopen a task. Allowed to whoever can edit tasks AND to the
--                          person the task is assigned to, so staff who can only view the
--                          Tasks page can still tick off their own work. It is the only way
--                          past the edit-only rule on tasks, and only for finishing.
--   * archive_tasks()      Archive (or bring back) finished tasks; same two kinds of caller.
--   * realtime             tasks and task_columns are published, so a teammate's change shows
--                          up without a refresh (and the dashboards' task tiles go live).
--
-- "Done" is not a section: it belongs to the Done list, so no section may be called that
-- (0041's rule, kept). Tasks that were Done before completion dates were recorded have no
-- finish date and nothing to say when they finished, so the page treats them as archived
-- rather than guessing a date: that is what empties an overfull Done list.
--
-- Safe to run twice.
-- ============================================================================


-- ─── 1. Columns ──────────────────────────────────────────────────────────────

alter table public.tasks
  add column if not exists section_id   uuid references public.task_columns(id) on delete set null,
  add column if not exists completed_at timestamptz,
  add column if not exists archived_at  timestamptz;

create index if not exists tasks_section_id_idx on public.tasks (section_id);
create index if not exists tasks_assignee_id_idx on public.tasks (assignee_id);


-- ─── 2. Sections (as 0041) ───────────────────────────────────────────────────

-- File each open task in the section its old status named.
update public.tasks t
   set section_id = c.id
  from public.task_columns c
 where t.section_id is null
   and lower(btrim(t.status)) <> 'done'
   and lower(btrim(c.label))  =  lower(btrim(t.status));

-- Done is spelled one way.
update public.tasks
   set status = 'Done'
 where lower(btrim(status)) = 'done'
   and status <> 'Done';

-- Done is not a section.
delete from public.task_columns where lower(btrim(label)) = 'done';

alter table public.task_columns drop constraint if exists task_columns_label_not_done;
alter table public.task_columns
  add constraint task_columns_label_not_done check (lower(btrim(label)) <> 'done');


-- ─── 3. Assign people, not typed names ───────────────────────────────────────

update public.tasks t
   set assignee_id = p.id
  from public.people p
 where t.assignee_id is null
   and nullif(btrim(t.assignee), '') is not null
   and lower(btrim(p.full_name)) = lower(btrim(t.assignee))
   and (select count(*) from public.people p2
         where lower(btrim(p2.full_name)) = lower(btrim(t.assignee))) = 1;


-- ─── 4. The view ─────────────────────────────────────────────────────────────

create or replace view public.fs_tasks as
  select t.id::text as id,
    t.title,
    t.description,
    t.notes,
    case when lower(btrim(t.status)) = 'done' then 'Done'
         else coalesce(c.label, t.status, 'To Do')
    end as status,
    t.priority,
    t.category,
    coalesce(pe.full_name, t.assignee, '') as assignee,
    t.customer,
    t.order_ref as "orderRef",
    coalesce(to_char(t.due_date::timestamptz, 'YYYY-MM-DD'), '') as "dueDate",
    t.created_by as "createdBy",
    t.created_at as "createdAt",
    t.assignee_id,
    t.region,
    t.completed_at as "completedAt",
    t.section_id::text as "sectionId",
    t.archived_at as "archivedAt"
  from public.tasks t
  left join public.people pe on pe.id = t.assignee_id
  left join public.task_columns c on c.id = t.section_id;
alter view public.fs_tasks set (security_invoker = on);
grant select on public.fs_tasks to authenticated, service_role;


-- ─── 5. Finishing, reopening, archiving ──────────────────────────────────────

-- Finish (p_done true) or reopen (false) a task. Finishing stamps completed_at, which is
-- what pays the assignee (0057), and files an unfiled task in the first section so that
-- reopening it puts it back somewhere. Reopening clears the stamp and the archive mark.
create or replace function public.set_task_done(p_task_id uuid, p_done boolean)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  t  tasks%rowtype;
  me uuid := app_person_id();
begin
  select * into t from tasks where id = p_task_id;
  if not found then
    raise exception 'That task no longer exists.' using errcode = 'P0002';
  end if;
  if not (app_can_edit('tasks') or (me is not null and t.assignee_id = me)) then
    raise exception 'You can only finish tasks that are assigned to you.' using errcode = '42501';
  end if;

  if p_done then
    update tasks
       set status       = 'Done',
           completed_at = coalesce(completed_at, now()),
           archived_at  = null,
           section_id   = coalesce(section_id, (select id from task_columns order by sort_order, label limit 1))
     where id = p_task_id;
  else
    update tasks
       set status = null, completed_at = null, archived_at = null
     where id = p_task_id;
  end if;
end $$;

-- Archive (p_archive true) or bring back finished tasks. Only finished tasks are touched,
-- and only those the caller may change. Returns how many changed.
create or replace function public.archive_tasks(p_ids uuid[], p_archive boolean default true)
returns integer
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  n  integer;
  me uuid := app_person_id();
begin
  if me is null then
    raise exception 'You can only archive tasks that are assigned to you.' using errcode = '42501';
  end if;
  update tasks
     set archived_at = case when p_archive then now() else null end
   where id = any (p_ids)
     and lower(btrim(status)) = 'done'
     and (app_can_edit('tasks') or assignee_id = me);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.set_task_done(uuid, boolean) from public, anon;
revoke all on function public.archive_tasks(uuid[], boolean) from public, anon;
grant execute on function public.set_task_done(uuid, boolean) to authenticated, service_role;
grant execute on function public.archive_tasks(uuid[], boolean) to authenticated, service_role;


-- ─── 6. Live updates ─────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;   -- not a Supabase database: nothing to publish to
  end if;
  foreach t in array array['tasks', 'task_columns']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

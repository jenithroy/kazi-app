-- ============================================================================
-- 0041_task_sections.sql
--
-- Tasks live in sections the team makes and names, and finished ones collect in
-- Done, the one permanent place: the bar at the bottom of the Tasks page.
--
--   * tasks.section_id    which section (lane of the board) the task sits in. A
--                         real reference, so renaming a section changes one row.
--                         Deleting a section un-files its tasks; the page moves
--                         the open ones somewhere first, so none drops off the board.
--   * tasks.completed_at  when the task was finished. Set when it moves to Done,
--                         cleared when it is reopened.
--   * fs_tasks            exposes both, as "sectionId" and "completedAt". Its
--                         "status" now reads as Done for a finished task and
--                         otherwise as the NAME OF ITS SECTION. Other screens (the
--                         dashboards) count and label tasks by status; this keeps
--                         them right without anyone keeping two fields in step.
--                         The new columns go last: CREATE OR REPLACE VIEW cannot
--                         reorder or drop columns.
--   * task_columns        "Done" can no longer be a section's name: it belongs to
--                         the bar.
--
-- Existing tasks: each goes in the section that carried its old status name, so
-- the board looks the same afterwards, and every screen reads the same status as
-- before. Their stored status text is left exactly as it was; it only matters for
-- Done now. A task whose status names no section stays unfiled and the page shows
-- it in the first section until someone moves it.
--
-- Tasks that were already Done have no finish date: nothing recorded one, and
-- tasks.updated_at is only the creation default (no trigger ever touches it), so
-- any date put there would be a guess presented as fact. The page shows a dash.
-- Safe to re-run.
-- ============================================================================

alter table tasks
  add column if not exists section_id   uuid references task_columns(id) on delete set null,
  add column if not exists completed_at timestamptz;

create index if not exists tasks_section_id_idx on tasks (section_id);


-- ─── 1. File each open task in the section its old status named ────────────

update tasks t
   set section_id = c.id
  from task_columns c
 where t.section_id is null
   and lower(btrim(t.status)) <> 'done'
   and lower(btrim(c.label))  =  lower(btrim(t.status));


-- ─── 2. Done is spelled one way ────────────────────────────────────────────

update tasks
   set status = 'Done'
 where lower(btrim(status)) = 'done'
   and status <> 'Done';


-- ─── 3. Done is not a section ──────────────────────────────────────────────
-- An old "Done" lane can never hold anything now (finished tasks are in the bar),
-- so it goes, and the name is kept for the bar.

delete from task_columns where lower(btrim(label)) = 'done';

alter table task_columns drop constraint if exists task_columns_label_not_done;
alter table task_columns
  add constraint task_columns_label_not_done check (lower(btrim(label)) <> 'done');


-- ─── 4. Expose them ────────────────────────────────────────────────────────

create or replace view fs_tasks as
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
    t.section_id::text as "sectionId"
  from tasks t
  left join people pe on pe.id = t.assignee_id
  left join task_columns c on c.id = t.section_id;
alter view fs_tasks set (security_invoker = on);

-- ============================================================================
-- 0020_order_assignment_status.sql
--
-- The dispatch queue on the dashboard filters assignments by status —
-- pending / accepted / in_progress / timed_out — and sorts timed-out work to
-- the top so it gets picked up. order_assignments was created in 0011 without
-- that column, because the Firestore collection was empty and the shape had to
-- be read off the code that consumed it; the status filter lives in Dashboard,
-- which had not been converted yet.
--
-- `order_ref` is here for the same reason: the queue shows it in preference to
-- a truncated id.
-- ============================================================================

alter table order_assignments
  add column if not exists status text not null default 'pending',
  add column if not exists order_ref text;

alter table order_assignments drop constraint if exists order_assignments_status_check;
alter table order_assignments add constraint order_assignments_status_check
  check (status in ('pending', 'accepted', 'in_progress', 'timed_out', 'done', 'cancelled'));

-- The dashboard's query is "open work, newest first".
create index if not exists order_assignments_status_idx
  on order_assignments(status, assigned_at desc);

-- Dropped rather than replaced: `create or replace view` can only append
-- columns, and it refuses outright if an existing column would be renamed —
-- which is what inserting orderRef and status into the middle amounts to.
-- Nothing depends on this view, so recreating it is free.
drop view if exists fs_order_assignments;

create view fs_order_assignments as
  select a.id::text as id,
         a.order_id::text                      as "orderId",
         a.order_ref                           as "orderRef",
         coalesce(pe.full_name, a.assigned_to) as "assignedTo",
         a.person_id::text                     as "personId",
         a.stage,
         a.status,
         a.assigned_at                         as "assignedAt",
         a.assigned_by                         as "assignedBy",
         a.note
    from order_assignments a
    left join people pe on pe.id = a.person_id;

-- Views run as their owner unless told otherwise, which would read straight
-- past row level security. See 0018 — `create or replace view` drops this
-- setting, so it has to be re-applied every time a view is redefined.
alter view fs_order_assignments set (security_invoker = on);

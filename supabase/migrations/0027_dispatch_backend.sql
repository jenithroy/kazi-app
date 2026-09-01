-- ============================================================================
-- 0027_dispatch_backend.sql
--
-- Everything the dispatch pipeline and the Telegram worker bot need, so both
-- can move off Firestore. Until now they read and wrote a copy of the data the
-- app no longer touches, which meant dispatching an order looked like it did
-- nothing: the assignment was written to Firestore and the dashboard reads
-- Supabase.
--
-- order_assignments was created in 0011 from what the dashboard displayed. The
-- backend needs considerably more: who the worker is on Telegram, a snapshot of
-- the order for the message, and the timeout bookkeeping the hourly job scans.
-- ============================================================================

alter table order_assignments
  add column if not exists worker_telegram_id bigint,
  add column if not exists customer_name      text,
  add column if not exists quantity           numeric(14,2),
  add column if not exists accepted_at        timestamptz,
  add column if not exists completed_at       timestamptz,
  add column if not exists timeout_at         timestamptz,
  add column if not exists timeout_hours      integer,
  add column if not exists notified_manager   boolean not null default false;

-- A worker passing on a job is a fourth outcome the 0020 constraint did not
-- allow, so SKIP would have been rejected.
alter table order_assignments drop constraint if exists order_assignments_status_check;
alter table order_assignments add constraint order_assignments_status_check
  check (status in ('pending', 'accepted', 'in_progress', 'timed_out', 'done', 'declined', 'cancelled'));

-- The hourly timeout sweep looks for exactly this.
create index if not exists order_assignments_timeout_idx
  on order_assignments(status, timeout_at) where notified_manager = false;

-- Backlog counting per worker per stage, which is how the next worker is picked.
create index if not exists order_assignments_worker_stage_idx
  on order_assignments(person_id, stage, status);


-- ─── Telegram conversation state ───────────────────────────────────────────
--
-- The bot is a state machine per chat: idle, active, or waiting for someone to
-- type out an issue. Keyed by Telegram id because that is the only identifier
-- present on an inbound message, before we know which person it is.

create table if not exists worker_sessions (
  telegram_id       bigint primary key,
  person_id         uuid references people(id) on delete cascade,
  state             text not null default 'idle'
                      check (state in ('idle', 'active', 'awaiting_issue')),
  current_order_id  uuid references orders(id) on delete set null,
  checked_in_at     timestamptz,
  updated_at        timestamptz not null default now()
);


-- ─── Shift log ─────────────────────────────────────────────────────────────
-- /in and /out. A row is opened on check-in and closed on check-out; the open
-- one is the row with no checked_out_at.

create table if not exists shift_logs (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid references people(id) on delete cascade,
  name            text,
  checked_in_at   timestamptz not null default now(),
  checked_out_at  timestamptz
);

create index if not exists shift_logs_open_idx
  on shift_logs(person_id) where checked_out_at is null;


-- ─── Access ────────────────────────────────────────────────────────────────
--
-- Both tables are written only by the backend, which holds the service key and
-- bypasses RLS. Policies are still enabled and deliberately restrictive so that
-- a browser session cannot read other people's whereabouts: you see your own
-- rows, and anyone who can view attendance sees all of them.

alter table worker_sessions enable row level security;
alter table shift_logs      enable row level security;

create policy "require_known_issuer" on worker_sessions
  as restrictive for all to authenticated using (app_issuer_ok());
create policy "own_or_attendance" on worker_sessions
  as permissive for select to authenticated
  using (person_id = app_person_id() or app_can_view('attendance'));

create policy "require_known_issuer" on shift_logs
  as restrictive for all to authenticated using (app_issuer_ok());
create policy "own_or_attendance" on shift_logs
  as permissive for select to authenticated
  using (person_id = app_person_id() or app_can_view('attendance'));

grant select, insert, update, delete on worker_sessions to authenticated, service_role;
grant select, insert, update, delete on shift_logs      to authenticated, service_role;


-- ─── Read model for the dispatch queue ─────────────────────────────────────

drop view if exists fs_order_assignments;
create view fs_order_assignments as
  select a.id::text as id,
         a.order_id::text                      as "orderId",
         a.order_ref                           as "orderRef",
         coalesce(pe.full_name, a.assigned_to) as "assignedTo",
         coalesce(pe.full_name, a.assigned_to) as "workerName",
         a.person_id::text                     as "personId",
         a.person_id::text                     as "workerId",
         a.worker_telegram_id                  as "workerTelegramId",
         a.customer_name                       as "customerName",
         a.quantity,
         a.stage,
         a.status,
         a.assigned_at                         as "assignedAt",
         a.accepted_at                         as "acceptedAt",
         a.completed_at                        as "completedAt",
         a.timeout_at                          as "timeoutAt",
         a.timeout_hours                       as "timeoutHours",
         a.notified_manager                    as "notifiedManager",
         a.assigned_by                         as "assignedBy",
         a.note
    from order_assignments a
    left join people pe on pe.id = a.person_id;
alter view fs_order_assignments set (security_invoker = on);

-- =====================================================================
-- 0004 — row level security
--
-- This is the file that replaces `src/auth/permissions.ts` and the web
-- app's `permissions.js` as the ACTUAL enforcement point. Those stay as
-- UI hints (don't render a tab nobody can use), but they are no longer
-- what stops anyone. Postgres decides now.
--
-- Replaces the old Firestore rule:
--     match /{document=**} { allow read: if isSignedIn() ... }
-- which let every signed-in user read every document, salaries included.
-- =====================================================================

-- ---------- helper functions ------------------------------------------
-- SECURITY DEFINER so a policy can look up the caller's own permissions
-- without the caller needing read access to the permission tables.
-- STABLE so Postgres evaluates them once per statement, not once per row.

create or replace function app_person_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from people where auth_uid = auth.uid() and status = 'Active' limit 1;
$$;

create or replace function app_tier()
returns int language sql stable security definer set search_path = public as $$
  select coalesce(p.tier, -1)
  from people pe left join positions p on p.id = pe.position_id
  where pe.auth_uid = auth.uid() and pe.status = 'Active' limit 1;
$$;

-- View right: the position grant, unless a per-person override says otherwise.
create or replace function app_can_view(section text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select o.can_view
       from person_permission_overrides o
       join people pe on pe.id = o.person_id
      where pe.auth_uid = auth.uid() and o.section_id = section and o.can_view is not null),
    (select pp.can_view
       from people pe
       join position_permissions pp on pp.position_id = pe.position_id
      where pe.auth_uid = auth.uid() and pe.status = 'Active' and pp.section_id = section),
    false);
$$;

create or replace function app_can_edit(section text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select o.can_edit
       from person_permission_overrides o
       join people pe on pe.id = o.person_id
      where pe.auth_uid = auth.uid() and o.section_id = section and o.can_edit is not null),
    (select pp.can_edit
       from people pe
       join position_permissions pp on pp.position_id = pe.position_id
      where pe.auth_uid = auth.uid() and pe.status = 'Active' and pp.section_id = section),
    false);
$$;

create or replace function app_can_view_finance_tab(tab text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select ft.can_view
     from people pe
     join position_finance_tabs ft on ft.position_id = pe.position_id
    where pe.auth_uid = auth.uid() and pe.status = 'Active' and ft.tab_id = tab), false);
$$;

-- ---------- enable RLS everywhere -------------------------------------
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename not like 'pg_%'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
-- NB: deliberately ENABLE, not FORCE. The table owner (postgres, used by the
-- migration loader) stays exempt; clients connect as `authenticated`, which is
-- not the owner and so is fully subject to every policy below.

-- ---------- reference tables: readable by any signed-in person --------
do $$
declare t text;
begin
  foreach t in array array['sections','finance_tabs','positions','position_permissions','position_finance_tabs'] loop
    execute format(
      'create policy read_all on public.%I for select to authenticated using (auth.uid() is not null)', t);
    execute format(
      'create policy admin_write on public.%I for all to authenticated using (app_can_edit(''admin'')) with check (app_can_edit(''admin''))', t);
  end loop;
end $$;

-- ---------- people ----------------------------------------------------
-- Full row (salary, bank details) requires the employees section, or being
-- the person. Everyone else uses the `directory` view below.
create policy people_self_read on people for select to authenticated
  using (auth_uid = auth.uid());
create policy people_hr_read on people for select to authenticated
  using (app_can_view('employees'));
create policy people_hr_write on people for all to authenticated
  using (app_can_edit('employees')) with check (app_can_edit('employees'));
create policy people_self_update on people for update to authenticated
  using (auth_uid = auth.uid()) with check (auth_uid = auth.uid());

-- Safe subset every signed-in person may read, so assignment pickers,
-- task assignees and message senders still resolve to names.
create view people_directory
with (security_invoker = off) as
  select id, full_name, email, position_id, location, department, status
  from people;
grant select on people_directory to authenticated;

create policy overrides_read_self on person_permission_overrides for select to authenticated
  using (person_id = app_person_id() or app_can_view('admin'));
create policy overrides_admin on person_permission_overrides for all to authenticated
  using (app_can_edit('admin')) with check (app_can_edit('admin'));

-- ---------- personal data: own rows always, others by grant -----------
-- attendance: you may always read and file your own; seeing anyone else
-- requires the attendance section.
create policy attendance_self on attendance for select to authenticated
  using (person_id = app_person_id());
create policy attendance_grant on attendance for select to authenticated
  using (app_can_view('attendance'));
create policy attendance_self_write on attendance for insert to authenticated
  with check (person_id = app_person_id());
create policy attendance_manage on attendance for all to authenticated
  using (app_can_edit('attendance')) with check (app_can_edit('attendance'));

create policy clockins_self on clock_ins for select to authenticated
  using (person_id = app_person_id());
create policy clockins_grant on clock_ins for select to authenticated
  using (app_can_view('attendance'));
create policy clockins_self_write on clock_ins for insert to authenticated
  with check (person_id = app_person_id());
create policy clockins_self_update on clock_ins for update to authenticated
  using (person_id = app_person_id()) with check (person_id = app_person_id());
create policy clockins_manage on clock_ins for all to authenticated
  using (app_can_edit('attendance')) with check (app_can_edit('attendance'));

-- payroll: your own payslip, or the payroll grant. Nothing else.
create policy payroll_self on payroll for select to authenticated
  using (person_id = app_person_id());
create policy payroll_grant on payroll for select to authenticated
  using (app_can_view('payroll') and app_can_view_finance_tab('payroll'));
create policy payroll_manage on payroll for all to authenticated
  using (app_can_edit('payroll')) with check (app_can_edit('payroll'));

-- ---------- everything else: section-gated ----------------------------
-- table -> section mapping, applied generically.
do $$
declare
  m text[][] := array[
    ['customers','customers'], ['orders','orders'], ['order_stage_history','orders'],
    ['order_notes','orders'], ['quotations','billing'], ['invoices','billing'],
    ['line_items','billing'], ['counters','billing'],
    ['accounts','accounting'], ['journal_entries','accounting'],
    ['expenses','finance'], ['purchases','purchases'],
    ['unit_economics','finance'], ['product_costs','finance'],
    ['fabrics','library'], ['patterns','library'], ['processes','library'],
    ['inventory_items','inventory'],
    ['production_batches','production'], ['stage_config','production'],
    ['qc_logs','quality_control'],
    ['tasks','tasks'], ['task_columns','tasks'],
    ['content_calendar','content'], ['content_posts','content'],
    ['messages','messenger']
  ];
  r text[];
begin
  foreach r slice 1 in array m loop
    execute format(
      'create policy sect_read on public.%I for select to authenticated using (app_can_view(%L))',
      r[1], r[2]);
    execute format(
      'create policy sect_write on public.%I for all to authenticated using (app_can_edit(%L)) with check (app_can_edit(%L))',
      r[1], r[2], r[2]);
  end loop;
end $$;

-- bank_transactions: finance section AND the bank tab. This was the one
-- collection the old Firestore rules already singled out as too sensitive
-- for the blanket read.
create policy bank_read on bank_transactions for select to authenticated
  using (app_can_view('finance') and app_can_view_finance_tab('bank'));
create policy bank_write on bank_transactions for all to authenticated
  using (app_can_edit('finance') and app_can_view_finance_tab('bank'))
  with check (app_can_edit('finance') and app_can_view_finance_tab('bank'));

-- budget_requests: you can always see and raise your own request, even
-- without the budget section. Approving needs the grant.
create policy budget_own on budget_requests for select to authenticated
  using (requested_by_id = app_person_id());
create policy budget_own_create on budget_requests for insert to authenticated
  with check (requested_by_id = app_person_id());
create policy budget_read on budget_requests for select to authenticated
  using (app_can_view('budget'));
create policy budget_manage on budget_requests for all to authenticated
  using (app_can_edit('budget')) with check (app_can_edit('budget'));

-- ---------- convenience view for the clients --------------------------
-- One round trip gives an app everything it needs to build its nav.
create or replace view my_permissions
with (security_invoker = on) as
  select s.id as section_id, s.label, s.aliases,
         app_can_view(s.id) as can_view,
         app_can_edit(s.id) as can_edit
  from sections s;
grant select on my_permissions to authenticated;

create or replace view my_finance_tabs
with (security_invoker = on) as
  select t.id as tab_id, t.label, app_can_view_finance_tab(t.id) as can_view
  from finance_tabs t;
grant select on my_finance_tabs to authenticated;

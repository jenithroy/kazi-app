-- =====================================================================
-- 0006 — three corrections found by scripts/verify.cjs
--
-- (1) Seeing the attendance PAGE was letting you see EVERYONE's rows.
--     The RLS probe caught a Video Editor reading all 456 attendance
--     records. Viewing a personal section now shows only your own rows;
--     other people's require tier >= 2 (manager and up), which is exactly
--     what `positions.tier` was documented for.
--
-- (2) Operations Intern could read every invoice. Billing is priced
--     customer data; the floor doesn't need it.
--
-- (3) The per-person grants carried over from Firestore re-created the
--     drift this whole migration exists to remove (an intern with HR
--     access, a marketing co-ordinator with production rights). Position
--     decides access now, so they go.
-- =====================================================================

-- ---------- (1) personal sections: own rows by default -----------------
drop policy attendance_grant  on attendance;
drop policy attendance_manage on attendance;
create policy attendance_grant on attendance for select to authenticated
  using (app_can_view('attendance') and app_tier() >= 2);
create policy attendance_manage on attendance for all to authenticated
  using (app_can_edit('attendance') and app_tier() >= 2)
  with check (app_can_edit('attendance') and app_tier() >= 2);
create policy attendance_self_update on attendance for update to authenticated
  using (person_id = app_person_id()) with check (person_id = app_person_id());

drop policy clockins_grant  on clock_ins;
drop policy clockins_manage on clock_ins;
create policy clockins_grant on clock_ins for select to authenticated
  using (app_can_view('attendance') and app_tier() >= 2);
create policy clockins_manage on clock_ins for all to authenticated
  using (app_can_edit('attendance') and app_tier() >= 2)
  with check (app_can_edit('attendance') and app_tier() >= 2);

drop policy payroll_grant on payroll;
create policy payroll_grant on payroll for select to authenticated
  using (app_can_view('payroll') and app_can_view_finance_tab('payroll') and app_tier() >= 2);

-- people: reading colleagues' salary/bank rows is manager-and-up too
drop policy people_hr_read on people;
create policy people_hr_read on people for select to authenticated
  using (app_can_view('employees') and app_tier() >= 2);

-- ---------- (2) intern loses billing -----------------------------------
delete from position_permissions
 where position_id = 'operations-intern' and section_id = 'billing';

-- ---------- (3) drop the carried-over per-person exceptions -------------
-- Kept as a record of what was removed, not as live grants.
create table permission_drift_log (
  id serial primary key,
  person_name text not null,
  section_id  text not null,
  had_access  boolean not null,
  logged_at   timestamptz not null default now(),
  note text default 'Legacy Firestore users.permissions grant, superseded by the position matrix'
);
insert into permission_drift_log (person_name, section_id, had_access)
select pe.full_name, o.section_id, coalesce(o.can_view, false)
from person_permission_overrides o join people pe on pe.id = o.person_id;

delete from person_permission_overrides;

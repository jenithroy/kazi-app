-- =====================================================================
-- 0007 — the permission matrix, as specified by the business.
--
-- Replaces the derived-from-current-access matrix. Each position below is
-- written from an explicit spec rather than inferred from whatever the
-- person currently holding it happens to have, which is the entire point:
-- adding an employee becomes "pick a position", not "tick 20 boxes".
--
-- Baseline every position gets: dashboard, messenger, changelog,
-- bug_report, and attendance (own rows only — that is clock in / out).
-- Seeing OTHER people's attendance still needs tier >= 2.
-- =====================================================================

-- ---------- tiers ------------------------------------------------------
-- tier >= 2 is what unlocks other people's personal rows (attendance).
update positions set tier = 4 where id in ('system-admin','developer');
update positions set tier = 3 where id in ('operations-head','managing-director','director');
update positions set tier = 2 where id in ('accountant','operations-manager','management');
update positions set tier = 1 where id in ('fashion-designer','marketing-coordinator',
                                           'content-coordinator','operations-intern');
update positions set label = 'Marketing Co-ordinator / Client Service' where id = 'marketing-coordinator';
update positions set tier = 0 where id in ('video-editor','social-media-presenter','labour',
                                           'fashion-intern','jr-fashion-designer','operations-assistant');

-- ---------- rebuild the seven specified positions ----------------------
delete from position_permissions  where position_id in
  ('fashion-designer','accountant','content-coordinator','marketing-coordinator',
   'operations-intern','video-editor','operations-head');
delete from position_finance_tabs where position_id in
  ('fashion-designer','accountant','content-coordinator','marketing-coordinator',
   'operations-intern','video-editor','operations-head');

-- Fashion Designer — clock in/out, tasks, edits inventory, reads the floor.
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'fashion-designer', s, true,
       s = any(array['tasks','attendance','inventory','messenger','bug_report'])
from unnest(array['dashboard','tasks','attendance','inventory','production','quality_control',
                  'customers','messenger','changelog','bug_report']) s;

-- Accountant — the floor read-only, edits inventory, owns finance/billing/budget.
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'accountant', s, true,
       s = any(array['tasks','attendance','inventory','customers','finance','billing','budget',
                     'payroll','purchases','accounting','messenger','bug_report'])
from unnest(array['dashboard','tasks','attendance','inventory','production','quality_control',
                  'customers','finance','billing','budget','payroll','purchases','accounting',
                  'messenger','changelog','bug_report']) s;

-- Content Coordinator — reads the floor and inventory, edits nothing there.
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'content-coordinator', s, true,
       s = any(array['tasks','attendance','messenger','bug_report'])
from unnest(array['dashboard','tasks','attendance','inventory','production','quality_control',
                  'customers','messenger','changelog','bug_report']) s;

-- Marketing Co-ordinator / Client Service — full tasks, edits inventory,
-- reads the floor and customers.
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'marketing-coordinator', s, true,
       s = any(array['tasks','attendance','inventory','messenger','bug_report'])
from unnest(array['dashboard','tasks','attendance','inventory','production','quality_control',
                  'customers','messenger','changelog','bug_report']) s;

-- Operations Intern — runs production and QC, edits inventory,
-- plus full finance / billing / budget.
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'operations-intern', s, true,
       s = any(array['tasks','attendance','inventory','production','quality_control','finance',
                     'billing','budget','payroll','purchases','accounting','messenger','bug_report'])
from unnest(array['dashboard','tasks','attendance','inventory','production','quality_control',
                  'customers','finance','billing','budget','payroll','purchases','accounting',
                  'messenger','changelog','bug_report']) s;

-- Video Editor — marketing and content in full, floor read-only.
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'video-editor', s, true,
       s = any(array['tasks','attendance','marketing','content','messenger','bug_report'])
from unnest(array['dashboard','tasks','attendance','production','quality_control','marketing',
                  'content','messenger','changelog','bug_report']) s;

-- Operations Head — everything.
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'operations-head', id, true, true from sections;

-- ---------- finance sub-tabs ------------------------------------------
-- Only the positions given finance above. Marketing Co-ordinator and
-- Content Coordinator get none, which is the change from today.
insert into position_finance_tabs (position_id, tab_id, can_view, can_edit)
select p, t.id, true, true
from unnest(array['accountant','operations-intern','operations-head']) p, finance_tabs t;

-- ---------- payroll no longer needs a tier -----------------------------
-- The finance `payroll` tab is the gate. Without this, Operations Intern
-- would have "full finance" that silently excluded payroll.
drop policy payroll_grant on payroll;
create policy payroll_grant on payroll for select to authenticated
  using (app_can_view('payroll') and app_can_view_finance_tab('payroll'));

-- =====================================================================
-- 0003 — sections, positions, and the permission matrix
--
-- The point of this file: access is decided by a person's POSITION
-- ("Accountant", "Video Editor"), not by a coarse system role and not by
-- per-person hardcoding in application source.
--
-- Everything here is DATA. To change what a Video Editor can see you
-- update a row, not a deploy. `tier` exists only for cross-cutting
-- privilege (approvals, reading other people's personal rows) and never
-- decides which pages you get.
-- =====================================================================

-- ---------- sections --------------------------------------------------
insert into sections (id, label, aliases, is_personal, sort_order) values
  ('dashboard',       'Dashboard',        '{}',                                false,  0),
  ('tasks',           'Tasks',            '{}',                                false,  1),
  ('attendance',      'Attendance',       '{}',                                true,   2),
  ('payroll',         'Payroll',          '{}',                                true,   3),
  ('production',      'Production',       '{}',                                false,  4),
  ('quality_control', 'Quality Control',  '{qc,quality-control}',              false,  5),
  ('inventory',       'Inventory',        '{}',                                false,  6),
  ('library',         'Product Library',  '{fabrics,patterns}',                false,  7),
  ('orders',          'Orders',           '{order-management}',                false,  8),
  ('sales',           'Sales',            '{}',                                false,  9),
  ('customers',       'Customers',        '{}',                                false, 10),
  ('billing',         'Billing',          '{}',                                false, 11),
  ('purchases',       'Purchases',        '{}',                                false, 12),
  ('finance',         'Finance',          '{}',                                false, 13),
  ('accounting',      'Accounting',       '{}',                                false, 14),
  ('budget',          'Budget Requests',  '{budget-requirements,content}',     false, 15),
  ('employees',       'Employees & HR',   '{employees-hr}',                    false, 16),
  ('marketing',       'Marketing',        '{}',                                false, 17),
  ('content',         'Content Calendar', '{}',                                false, 18),
  ('messenger',       'Messenger',        '{}',                                false, 19),
  ('directors',       'Directors',        '{}',                                false, 20),
  ('admin',           'Admin Panel',      '{admin-panel}',                     false, 21),
  ('changelog',       'Changelog',        '{}',                                false, 22),
  ('bug_report',      'Bug Reports',      '{bug-report,bug-reports}',          false, 23);

-- ---------- finance sub-tabs -----------------------------------------
insert into finance_tabs (id, label, sort_order) values
  ('expenses',      'Expenses',       0),
  ('payroll',       'Payroll',        1),
  ('purchases',     'Purchases',      2),
  ('vat_bills',     'VAT Bills',      3),
  ('journal',       'Journal',        4),
  ('ledger',        'Ledger',         5),
  ('pl',            'P&L',            6),
  ('balance_sheet', 'Balance Sheet',  7),
  ('bank',          'Bank',           8),
  ('order_pl',      'Order P&L',      9),
  ('kpi',           'KPI',           10);

-- ---------- positions -------------------------------------------------
insert into positions (id, label, tier, description) values
  ('system-admin',           'System Admin',           4, 'Full system access.'),
  ('developer',              'Developer',              4, 'Full system access for maintenance.'),
  ('director',               'Director',               3, 'UK director. Oversight across the business, light editing.'),
  ('managing-director',      'Managing Director',      3, 'Runs the Nepal operation end to end.'),
  ('operations-head',        'Operations Head',        2, 'Day-to-day owner of production, inventory and staff.'),
  ('operations-manager',     'Operations Manager',     2, 'Runs the floor: production, QC, inventory, orders.'),
  ('management',             'Management',             2, 'General management across orders and operations.'),
  ('accountant',             'Accountant',             2, 'Owns finance, accounting, billing and payroll.'),
  ('marketing-coordinator',  'Marketing Co-ordinator', 1, 'Marketing, content and client service.'),
  ('content-coordinator',    'Content Coordinator',    1, 'Content planning and marketing support.'),
  ('fashion-designer',       'Fashion Designer',       1, 'Owns the product library, specs and sampling.'),
  ('jr-fashion-designer',    'Jr. Fashion Designer',   0, 'Design support; library editing, read-only floor.'),
  ('video-editor',           'Video Editor',           0, 'Marketing media production only.'),
  ('social-media-presenter', 'Social Media Presenter', 0, 'Content creation and posting only.'),
  ('operations-intern',      'Operations Intern',      0, 'Floor support: production, QC, inventory, tasks.'),
  ('fashion-intern',         'Fashion Intern',         0, 'Design support, read-only floor.'),
  ('operations-assistant',   'Operations Assistant',   0, 'Assists on the floor; tasks and own attendance.'),
  ('labour',                 'Labour',                 0, 'Cutter/stitcher. Own attendance and assigned tasks.');

-- ---------- the matrix -------------------------------------------------
-- One statement per position. The array is everything the position can SEE;
-- the `= any(...)` clause marks the subset it can also EDIT.

-- Tier 4 — full access
insert into position_permissions (position_id, section_id, can_view, can_edit)
select p, s.id, true, true from unnest(array['system-admin','developer']) p, sections s;

-- Director (UK) — broad visibility, edits tasks/employees/budget, reads finance
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'director', s, true, s = any(array['tasks','employees','budget','directors','messenger','bug_report'])
from unnest(array['dashboard','tasks','attendance','payroll','production','quality_control','inventory',
                  'library','orders','sales','customers','billing','purchases','finance','accounting',
                  'budget','employees','marketing','content','messenger','directors','changelog','bug_report']) s;

-- Managing Director — runs Nepal, edits nearly everything
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'managing-director', s, true, true
from unnest(array['dashboard','tasks','attendance','payroll','production','quality_control','inventory',
                  'library','orders','sales','customers','billing','purchases','finance','accounting',
                  'budget','employees','marketing','content','messenger','directors','admin','changelog','bug_report']) s;

-- Operations Head — same floor authority, no directors board
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'operations-head', s, true, s <> 'payroll'
from unnest(array['dashboard','tasks','attendance','payroll','production','quality_control','inventory',
                  'library','orders','sales','customers','billing','purchases','finance','accounting',
                  'budget','employees','marketing','content','messenger','admin','changelog','bug_report']) s;

-- Operations Manager — the floor, no finance detail, no payroll
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'operations-manager', s, true,
       s = any(array['tasks','attendance','production','quality_control','inventory','orders','library','budget','bug_report'])
from unnest(array['dashboard','tasks','attendance','production','quality_control','inventory','library',
                  'orders','sales','customers','billing','budget','employees','messenger','changelog','bug_report']) s;

-- Management — orders and operations oversight
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'management', s, true,
       s = any(array['tasks','orders','customers','production','inventory','budget','messenger','bug_report'])
from unnest(array['dashboard','tasks','attendance','production','quality_control','inventory','library',
                  'orders','sales','customers','billing','budget','employees','messenger','changelog','bug_report']) s;

-- Accountant — owns the money. Reads the floor, does not run it.
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'accountant', s, true,
       s = any(array['finance','accounting','billing','purchases','sales','payroll','budget','attendance','employees','tasks','bug_report'])
from unnest(array['dashboard','tasks','attendance','payroll','production','quality_control','inventory',
                  'orders','sales','customers','billing','purchases','finance','accounting','budget',
                  'employees','messenger','changelog','bug_report']) s;

-- Marketing Co-ordinator — marketing + client service. NO finance, NO payroll.
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'marketing-coordinator', s, true,
       s = any(array['marketing','content','customers','tasks','messenger','budget','orders','billing','bug_report'])
from unnest(array['dashboard','tasks','attendance','inventory','library','orders','sales','customers',
                  'billing','budget','marketing','content','messenger','changelog','bug_report']) s;

-- Content Coordinator — content and marketing only
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'content-coordinator', s, true,
       s = any(array['marketing','content','tasks','messenger','bug_report'])
from unnest(array['dashboard','tasks','attendance','library','customers','budget','marketing','content',
                  'messenger','changelog','bug_report']) s;

-- Fashion Designer — owns the product library and sampling
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'fashion-designer', s, true,
       s = any(array['library','production','quality_control','inventory','tasks','orders','budget','bug_report'])
from unnest(array['dashboard','tasks','attendance','production','quality_control','inventory','library',
                  'orders','customers','budget','messenger','changelog','bug_report']) s;

-- Jr. Fashion Designer — library editing, read-only floor
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'jr-fashion-designer', s, true, s = any(array['library','tasks','bug_report'])
from unnest(array['dashboard','tasks','attendance','production','quality_control','inventory','library',
                  'budget','messenger','changelog','bug_report']) s;

-- Video Editor — marketing media only
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'video-editor', s, true, s = any(array['marketing','content','tasks','bug_report'])
from unnest(array['dashboard','tasks','attendance','marketing','content','messenger','changelog','bug_report']) s;

-- Social Media Presenter — content creation only
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'social-media-presenter', s, true, s = any(array['content','marketing','tasks','bug_report'])
from unnest(array['dashboard','tasks','attendance','marketing','content','messenger','changelog','bug_report']) s;

-- Operations Intern — the floor. NO finance, NO payroll, NO employees.
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'operations-intern', s, true,
       s = any(array['tasks','production','quality_control','inventory','library','budget','attendance','bug_report'])
from unnest(array['dashboard','tasks','attendance','production','quality_control','inventory','library',
                  'orders','customers','billing','budget','messenger','changelog','bug_report']) s;

-- Fashion Intern — design support, read-only floor
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'fashion-intern', s, true, s = any(array['tasks','library','bug_report'])
from unnest(array['dashboard','tasks','attendance','production','quality_control','inventory','library',
                  'messenger','changelog','bug_report']) s;

-- Operations Assistant — tasks and own attendance
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'operations-assistant', s, true, s = any(array['tasks','attendance','bug_report'])
from unnest(array['dashboard','tasks','attendance','production','inventory','messenger','changelog','bug_report']) s;

-- Labour — clock in, see your tasks. Nothing else.
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'labour', s, true, s = any(array['attendance','bug_report'])
from unnest(array['dashboard','tasks','attendance','messenger','changelog','bug_report']) s;

-- ---------- finance sub-tab grants -----------------------------------
-- Only four positions touch finance at all. This is the biggest single
-- correction: previously an Operations Intern and a Marketing Co-ordinator
-- both had all ten tabs including payroll.
insert into position_finance_tabs (position_id, tab_id, can_view, can_edit)
select p, t.id, true, p <> 'director'
from unnest(array['system-admin','developer','managing-director','operations-head','accountant','director']) p,
     finance_tabs t;

-- Operations Manager and Management get costing views only, no payroll or bank.
insert into position_finance_tabs (position_id, tab_id, can_view, can_edit)
select p, t, true, false
from unnest(array['operations-manager','management']) p,
     unnest(array['expenses','purchases','order_pl','kpi']) t;

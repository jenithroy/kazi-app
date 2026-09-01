-- ============================================================================
-- 0019_directors_full_access.sql
--
-- Finn and Zen own the company and must be able to reach everything. They were
-- on `director`, which the matrix gave 16 of 17 pages — no Admin — while
-- `operations-head` had all 17. That ordering was backwards.
--
-- Done by promoting the POSITION rather than moving the two of them onto
-- `system-admin`. Their job is Director; putting them on the system-admin row
-- would have shown "System Admin" everywhere their role is displayed and left
-- the director position still looking under-privileged for whoever holds it
-- next. Permissions are supposed to follow the job, so the job is what changes.
--
-- Tier 4 alongside system-admin and developer. That is what the app reads to
-- decide someone is a super admin, so `profile.role` becomes "super_admin" for
-- them, which is the level asked for.
-- ============================================================================

update positions set tier = 4 where id = 'director';

-- Every section, view and edit.
insert into position_permissions (position_id, section_id, can_view, can_edit)
select 'director', s.id, true, true from sections s
on conflict (position_id, section_id) do update
  set can_view = true, can_edit = true;

-- Every finance tab.
insert into position_finance_tabs (position_id, tab_id, can_view, can_edit)
select 'director', t.id, true, true from finance_tabs t
on conflict (position_id, tab_id) do update
  set can_view = true, can_edit = true;

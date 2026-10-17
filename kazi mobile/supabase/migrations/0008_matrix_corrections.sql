-- =====================================================================
-- 0008 — corrections to the position matrix.
--
--   * Marketing Co-ordinator gets Marketing (it was missing entirely —
--     the Video Editor had it and the co-ordinator did not).
--   * Accountant gets Employees, so she can see salaries on the employee
--     directory and not just in the payroll table.
--   * Product Library (fabrics / patterns / processes): full access for
--     Fashion Designer, Operations Intern and Operations Head; every other
--     position gets read-only.
-- =====================================================================

-- Marketing Co-ordinator — marketing, plus the content calendar that goes
-- with it. Without `content` the co-ordinator would have less than the
-- Video Editor who reports into marketing.
insert into position_permissions (position_id, section_id, can_view, can_edit) values
  ('marketing-coordinator', 'marketing', true, true),
  ('marketing-coordinator', 'content',   true, true)
on conflict (position_id, section_id) do update set can_view = true, can_edit = true;

-- Accountant — employee records, including the salary and bank columns
-- she needs to run payroll.
insert into position_permissions (position_id, section_id, can_view, can_edit) values
  ('accountant', 'employees', true, true)
on conflict (position_id, section_id) do update set can_view = true, can_edit = true;

-- Product Library — full access for the three who actually build with it.
insert into position_permissions (position_id, section_id, can_view, can_edit) values
  ('fashion-designer',  'library', true, true),
  ('operations-intern', 'library', true, true),
  ('operations-head',   'library', true, true)
on conflict (position_id, section_id) do update set can_view = true, can_edit = true;

-- ...and read-only for everybody else, without downgrading anyone who
-- already has edit rights (system admin, developer).
insert into position_permissions (position_id, section_id, can_view, can_edit)
select id, 'library', true, false from positions
where id not in ('fashion-designer','operations-intern','operations-head')
on conflict (position_id, section_id) do nothing;

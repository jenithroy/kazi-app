-- =====================================================================
-- 0102 — everyone can see WHO their colleagues are; only HR sees their pay.
--
-- `fs_employees` inherited the RLS on `people`, which is "your own row, or
-- the whole table if you have the employees section". Correct for salary
-- data, wrong for a staff roster: it left a Video Editor seeing exactly one
-- person, so the task assignee picker, the attendance list and every
-- "assigned to" label had nobody to offer.
--
-- Fix: the view runs as owner (so the roster is visible to all signed-in
-- staff) and masks the sensitive columns per caller instead. Directory
-- fields — name, email, job title, department, status, schedule — are open.
-- Salary, bank details, PAN, home address and phone are visible only with
-- the `employees` section at tier >= 2, or on your own row.
--
-- The base `people` table keeps its original policies untouched; anything
-- reading it directly is unaffected.
-- =====================================================================

drop view if exists fs_employees;

create view fs_employees with (security_invoker = off) as
  select pe.id::text            as id,
         pe.full_name           as name,
         pe.email::text         as email,
         coalesce(po.label,'')  as role,
         pe.position_id         as "positionId",
         pe.status              as status,
         pe.location            as location,
         pe.department          as department,
         pe.is_production_worker as "isProductionWorker",
         to_char(pe.schedule_start,'HH24:MI') as "scheduleStart",
         to_char(pe.schedule_end,'HH24:MI')   as "scheduleEnd",
         pe.schedule_working_days  as "scheduleWorkingDays",
         pe.schedule_day_overrides as "scheduleDayOverrides",
         pe.schedule_note       as "scheduleNote",
         pe.legacy_firebase_uid as uid,
         pe.created_at          as "createdAt",
         pe.updated_at          as "updatedAt",
         -- personal / financial: own row, or the employees grant at tier >= 2
         case when sensitive then pe.phone            end as phone,
         case when sensitive then pe.address          end as address,
         case when sensitive then pe.basic_salary_npr end as "basicSalaryNPR",
         case when sensitive then pe.bank_name        end as "bankName",
         case when sensitive then pe.bank_branch      end as "bankBranch",
         case when sensitive then pe.bank_account     end as "bankAccount",
         case when sensitive then pe.pan_number       end as "panNumber",
         case when sensitive then pe.join_date        end as "joinDate"
  from people pe
  left join positions po on po.id = pe.position_id
  cross join lateral (
    select (pe.id = app_person_id()
            or (app_can_view('employees') and app_tier() >= 2)) as sensitive
  ) vis;

grant select, insert, update, delete on fs_employees to authenticated;

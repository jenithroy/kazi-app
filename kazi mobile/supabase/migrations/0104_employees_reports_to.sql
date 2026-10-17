-- =====================================================================
-- 0104 — expose `reports_to` on `fs_employees`.
--
-- `people.reports_to` has existed since 0001 and the Org Chart tab reads it,
-- but no compat view ever selected it, so every employee came back with no
-- manager and the chart was permanently flat. The Employees sheet now has a
-- "Reports to" picker, which needs the value to round-trip.
--
-- Reporting lines are org structure, not personal data, so the column sits
-- outside the `vis.sensitive` mask alongside `department` and `status`.
--
-- The rest of this definition is 0102's, plus the `telegramId` / `region`
-- columns the web-app session added to the live view afterwards — copied
-- from `pg_get_viewdef` so replacing the view does not silently drop them.
-- `security_invoker = off` is deliberate and unchanged: see 0102.
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
         pe.reports_to::text    as "reportsTo",
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
         case when sensitive then pe.join_date        end as "joinDate",
         case when sensitive then pe.telegram_id      end as "telegramId",
         pe.location            as region
  from people pe
  left join positions po on po.id = pe.position_id
  cross join lateral (
    select (pe.id = app_person_id()
            or (app_can_view('employees') and app_tier() >= 2)) as sensitive
  ) vis;

grant select, insert, update, delete on fs_employees to authenticated;

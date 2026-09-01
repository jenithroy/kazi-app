-- ============================================================================
-- 0026_telegram_id.sql
--
-- The Telegram worker bot dispatches a production stage to a person by their
-- Telegram chat id, set from Admin Panel. It lived on the Firestore user
-- document and had no column here, so saving it was silently discarded and the
-- bot could not reach anybody.
-- ============================================================================

alter table people add column if not exists telegram_id bigint;

-- Exposed on fs_employees so Admin Panel can read it back. Appended, since
-- CREATE OR REPLACE VIEW only adds columns at the end.
--
-- fs_employees is the one deliberately SECURITY DEFINER view (see 0021): it
-- returns the roster to everyone and masks the sensitive columns instead. A
-- Telegram id is contact information, so it is masked on the same terms as
-- phone — your own row, or employees access at tier 2 and above.
create or replace view fs_employees as
  select pe.id::text as id,
    pe.full_name              as name,
    pe.email::text            as email,
    coalesce(po.label, '')    as role,
    pe.position_id            as "positionId",
    pe.status,
    pe.location,
    pe.department,
    pe.is_production_worker   as "isProductionWorker",
    to_char(pe.schedule_start::interval, 'HH24:MI') as "scheduleStart",
    to_char(pe.schedule_end::interval,   'HH24:MI') as "scheduleEnd",
    pe.schedule_working_days  as "scheduleWorkingDays",
    pe.schedule_day_overrides as "scheduleDayOverrides",
    pe.schedule_note          as "scheduleNote",
    pe.legacy_firebase_uid    as uid,
    pe.created_at             as "createdAt",
    pe.updated_at             as "updatedAt",
    case when vis.sensitive then pe.phone            else null end as phone,
    case when vis.sensitive then pe.address          else null end as address,
    case when vis.sensitive then pe.basic_salary_npr else null end as "basicSalaryNPR",
    case when vis.sensitive then pe.bank_name        else null end as "bankName",
    case when vis.sensitive then pe.bank_branch      else null end as "bankBranch",
    case when vis.sensitive then pe.bank_account     else null end as "bankAccount",
    case when vis.sensitive then pe.pan_number       else null end as "panNumber",
    case when vis.sensitive then pe.join_date        else null end as "joinDate",
    case when vis.sensitive then pe.telegram_id      else null end as "telegramId"
  from people pe
  left join positions po on po.id = pe.position_id
  cross join lateral (
    select pe.id = app_person_id() or (app_can_view('employees') and app_tier() >= 2) as sensitive
  ) vis;

-- Deliberately NOT security_invoker. See 0021 before changing this.
comment on view fs_employees is
  'Company directory. Deliberately SECURITY DEFINER (no security_invoker): it '
  'must read all of people so it can return the roster to everyone while '
  'masking phone/address/salary/bank/PAN/join_date/telegram_id to your own row '
  'or employees access at tier >= 2. Do not enable security_invoker — the '
  'column masking is the access control, not row level security.';

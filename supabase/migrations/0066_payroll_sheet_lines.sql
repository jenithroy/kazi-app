-- ============================================================================
-- 0066_payroll_sheet_lines.sql
--
-- Two small additions so payroll can follow the accountant's salary-slip sheets.
--
-- 1. LEAVE DAYS. The slips have a "Leave Day" line: the days someone was away, each costing a day's pay (basic / 30). It is
--    typed from the accountant's own register (the attendance rows are too thin to work it out), so the payroll record now
--    keeps the number of days (halves allowed) beside the money. payroll.leave_days; fs_finance_payroll shows it as
--    "leaveDays" (appended, so nothing that reads the view changes).
--
-- 2. THE LENGTH OF THEIR SHIFT. The sheets price an hour as a day's pay over THAT PERSON'S own shift hours (a 7.5-hour shift
--    makes the hour dearer than an 8-hour one), so overtime has to be priced the same way. overtime_days gains shift_minutes,
--    the length of the person's shift on that day from work_shift() (0064): the one place their hours are decided in SQL.
--    Appended as the last column, so nothing that reads the view changes.
--
-- Nothing is dropped and no row is touched. Safe to run twice.
-- ============================================================================


-- ─── 1. Leave days ───────────────────────────────────────────────────────────

alter table public.payroll add column if not exists leave_days numeric(5,1) not null default 0;
alter table public.payroll drop constraint if exists payroll_leave_days_range;
alter table public.payroll add constraint payroll_leave_days_range check (leave_days >= 0 and leave_days <= 31);

create or replace view fs_finance_payroll as
  select p.id::text as id,
    p.month,
    p.year,
    p.basic_npr         as "basicNPR",
    p.salary_npr        as "salaryNPR",
    p.bonus_npr         as "bonusNPR",
    p.overtime_npr      as "overtimeNPR",
    p.deduction_npr     as "deductionNPR",
    p.pf_deduction_npr  as "pfDeductionNPR",
    p.late_deduction_npr as "lateDeductionNPR",
    p.late_days         as "lateDays",
    p.late_cuts_count   as "lateCutsCount",
    p.total_deductions_npr as "totalDeductionsNPR",
    p.gross_npr         as "grossNPR",
    p.net_npr           as "netNPR",
    p.note,
    p.logged_by         as "loggedBy",
    coalesce(p.legacy_staff_id, pe.legacy_firebase_uid) as "staffId",
    coalesce(p.legacy_staff_name, pe.full_name) as "staffName",
    coalesce(p.legacy_role, '') as role,
    p.person_id,
    pe.location         as region,
    p.receivable_due_npr    as "receivableDueNPR",
    p.advance_npr           as "advanceNPR",
    p.tds_npr               as "tdsNPR",
    p.tds_rate_pct          as "tdsRatePct",
    p.unapproved_absences   as "unapprovedAbsences",
    p.overtime_minutes      as "overtimeMinutes",
    p.bonus_reason          as "bonusReason",
    p.leave_days            as "leaveDays"
  from payroll p
  left join people pe on pe.id = p.person_id;
alter view fs_finance_payroll set (security_invoker = on);


-- ─── 2. The shift's length, beside the overtime that counted ─────────────────

create or replace view public.overtime_days as
  select a.id,
         a.person_id,
         to_char(a.date, 'YYYY-MM-DD') as date,
         to_char(a.from_time, 'HH24:MI') as from_time,
         to_char(a.until_time, 'HH24:MI') as until_time,
         a.reason,
         a.note,
         c.clocked_in_at,
         c.clocked_out_at,
         case
           when c.clocked_in_at is null or c.clocked_out_at is null then 0
           else greatest(0, floor(extract(epoch from (
                  least(c.clocked_out_at, (a.date + a.until_time) at time zone 'Asia/Kathmandu')
                - greatest(c.clocked_in_at, (a.date + greatest(a.from_time, sh.s_end)) at time zone 'Asia/Kathmandu')
                )) / 60))::integer
         end as minutes,
         floor(extract(epoch from (sh.s_end - sh.s_start)) / 60)::integer as shift_minutes
    from public.overtime_approvals a
    cross join lateral public.work_shift(a.person_id, a.date) sh
    left join lateral (
      select min(k.clocked_in_at) as clocked_in_at, max(k.clocked_out_at) as clocked_out_at
        from public.clock_ins k
       where k.person_id = a.person_id and k.date = a.date
    ) c on true;
alter view public.overtime_days set (security_invoker = on);

revoke all on public.overtime_days from anon;
grant select on public.overtime_days to authenticated, service_role;

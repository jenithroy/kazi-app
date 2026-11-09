-- ============================================================================
-- 0067_payroll_leave_amount.sql
--
-- LEAVE AMOUNT. Payroll used to keep the leave as a number of days (0066: payroll.leave_days), each costing a day's pay
-- (basic / 30). Whoever does the payroll now types how much the leave takes off, in rupees, so the record keeps that
-- amount: payroll.leave_amount_npr; fs_finance_payroll shows it as "leaveAmountNPR" (appended, so nothing that reads the
-- view changes).
--
-- leave_days is left as it is. A record made while leave was typed in days still holds them, and the app reads those as
-- days x (basic / 30) until the record is saved again, which writes the amount and sets leave_days back to 0.
--
-- Nothing is dropped and no row is touched. Safe to run twice.
-- ============================================================================

alter table public.payroll add column if not exists leave_amount_npr numeric(12,2) not null default 0;
alter table public.payroll drop constraint if exists payroll_leave_amount_range;
alter table public.payroll add constraint payroll_leave_amount_range check (leave_amount_npr >= 0);

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
    p.leave_days            as "leaveDays",
    p.leave_amount_npr      as "leaveAmountNPR"
  from payroll p
  left join people pe on pe.id = p.person_id;
alter view fs_finance_payroll set (security_invoker = on);

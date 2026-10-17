-- =====================================================================
-- 0005 — widen attendance.status to the values both apps actually write.
-- The live data uses "Half-day" (hyphen, lowercase d), not "Half Day".
-- Distinct values in Firestore at migration time:
--   Absent 676, Present 235, Late 42, Half-day 4, Leave 1
-- =====================================================================

alter table attendance drop constraint attendance_status_check;
alter table attendance add constraint attendance_status_check
  check (status in ('Present','Late','Absent','Half-day','Leave'));

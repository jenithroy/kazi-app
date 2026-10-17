-- =====================================================================
-- 0109 — `chat_presence`: who is on the clock right now.
--
-- Chat's presence dot used to be derived from the *schedule* on
-- `fs_employees` (`scheduleStart` / `scheduleEnd` / `scheduleWorkingDays`),
-- which is a roster, not a fact: it told everyone that Rishav was "Off shift ·
-- starts 09:00" while he was standing in the building with an open punch.
-- Presence is now the punch itself — clocked in, not yet clocked out.
--
-- It has to be its own view because `clock_ins` is RLS'd down to your own rows
-- unless you hold `attendance` at tier >= 2 (see 0006), so a normal member of
-- staff reading `fs_clock_ins` sees only themselves and everybody else would
-- show as off. This view runs as owner (`security_invoker = off`, exactly as
-- `fs_employees` does since 0102) and exposes *only* the person's id and when
-- they clocked in — no GPS, no hours, no salary-adjacent column. Who is in the
-- building is not sensitive; it is the thing the whole floor can see by
-- looking up.
--
-- The 16-hour window is not decoration. Forgetting to clock out is the single
-- most common thing in this table — Anmol has five open punches going back to
-- August — and without a cutoff every one of them would pin somebody "on
-- shift" forever. A punch older than a long double shift is a forgotten
-- clock-out, not a person still at their machine.
-- =====================================================================

drop view if exists chat_presence;

create view chat_presence with (security_invoker = off) as
  select c.person_id::text        as "personId",
         min(c.clocked_in_at)     as "since"
  from clock_ins c
  where c.clocked_out_at is null
    and c.clocked_in_at > now() - interval '16 hours'
  group by c.person_id;

grant select on chat_presence to authenticated;

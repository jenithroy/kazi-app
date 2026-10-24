/**
 * The Attendance tab of a profile card: a month at a time, how many days present, late, absent and on leave, and the days
 * themselves with when they clocked in and out.
 *
 * It reads the person's rows with the same reading the Attendance page uses (`personMonth` in lib/attendance.js), so the counts
 * here and the page's report for the same person cannot disagree: a half-day counts as present, a Saturday only shows if something was
 * recorded on it, a past day with a clock-in and no clock-out is Absent, and a day nobody marked is "No record", never a made-up Absent.
 * The card only shows this tab to someone the database lets read these rows (lib/personProfile.js `seesOf`).
 */
import { useMemo, useState } from "react";
import { Icons, cn } from "../ui";
import { useHolidays } from "../../hooks/useHolidays";
import { usePersonDays } from "../../hooks/usePersonProfile";
import { STATE_LABEL, STATE_TONE, dayShort, humanNote, isoFromDate, monthOf, monthTitle, stateOf } from "../../lib/attendance";
import { dayTimes, hoursLabel, isLatestMonth, monthOfDays, stepMonth } from "../../lib/personProfile";
import { Skel, Stat, Tag, useMinute } from "./ProfileBits";

const FIRST_DAYS = 8;     // the newest days shown before "Show all"

const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

function DayItem({ day, today }) {
  const { iso, record, clock, off } = day;
  const state = stateOf(record, { closed: Boolean(off) });
  const { inT, outT, mins } = dayTimes(clock);
  const here = iso === today && inT && !outT;                         // in right now
  // what somebody wrote on the day (a reason for leave or absence), not the clock-in's own "GPS" on every line
  const note = humanNote(record) || (state === "closed" && off?.kind === "holiday" ? off.name : "");
  const label = state === "closed" ? (off?.kind === "holiday" ? "Holiday" : "Day off") : STATE_LABEL[state];
  const times = inT ? `${inT} – ${outT || (here ? "now" : "—")}` : "—";

  return (
    <li className={cn("kpp-day", state === "closed" && "is-off")}>
      <span className="kpp-day-d">{dayShort(iso)}</span>
      <Tag tone={STATE_TONE[state] || "mute"}>{label}</Tag>
      <span className="kpp-day-t">{times}</span>
      <span className="kpp-day-w">{mins != null ? hoursLabel(mins) || `${mins}m` : ""}</span>
      {note ? <span className="kpp-day-n" title={note}>{note}</span> : null}
    </li>
  );
}

export default function AttendancePanel({ person, enabled = true }) {
  const now = useMinute();
  const today = isoFromDate(now);
  const { rows: holidays } = useHolidays();
  const [month, setMonth] = useState(() => monthOf(today));
  const [all, setAll] = useState(false);
  const latest = isLatestMonth(month, today);
  const data = usePersonDays(person.id, { enabled, from: month.start, to: month.end, poll: latest });

  const sum = useMemo(
    () => monthOfDays({ records: data.records, clocks: data.clocks, month, today, holidays, region: person.location }),
    [data.records, data.clocks, month, today, holidays, person.location],
  );

  const go = (by) => {
    if (by > 0 && latest) return;
    setMonth((m) => stepMonth(m, by));
    setAll(false);
  };
  const days = all ? sum.days : sum.days.slice(0, FIRST_DAYS);
  const ready = data.status === "ready";
  const facts = [
    sum.minutes > 0 && `${hoursLabel(sum.minutes)} worked`,
    sum.cuts > 0 && `${sum.cuts} salary ${plural(sum.cuts, "cut")}`,
    sum.onTimePct != null && `On time ${sum.onTimePct}%`,
  ].filter(Boolean);

  return (
    <section className="kprof-sec kpp-att" aria-label="Attendance">
      <div className="kpp-month">
        <button type="button" className="kpp-step" onClick={() => go(-1)} aria-label="Previous month">
          <Icons.ChevronLeft size={16} sw={2} aria-hidden="true" />
        </button>
        <h4 className="kpp-month-t">{monthTitle(month)}</h4>
        {/* aria-disabled, not disabled: a disabled button that holds the cursor drops it */}
        <button type="button" className="kpp-step" onClick={() => go(1)} aria-label="Next month" aria-disabled={latest || undefined}>
          <Icons.ChevronRight size={16} sw={2} aria-hidden="true" />
        </button>
        {!latest && <button type="button" className="kpp-link" onClick={() => { setMonth(monthOf(today)); setAll(false); }}>This month</button>}
      </div>

      {data.status === "error" && (
        <div role="alert">
          <p className="kprof-note kprof-note--err">{data.error}</p>
          <button type="button" className="ghost-button" onClick={data.reload}>Try again</button>
        </div>
      )}
      {ready && data.error ? <p className="kprof-note kprof-note--err" role="status">{data.error}</p> : null}

      {(data.status === "loading" || data.status === "idle") && (
        <div className="kpp-wait" aria-hidden="true"><Skel w="100%" /><Skel w="80%" /><Skel w="90%" /></div>
      )}

      {ready && (
        <>
          <div className="kpp-stats">
            <Stat n={sum.present} label="Present" />
            <Stat n={sum.late} label="Late" tone="warn" />
            <Stat n={sum.absent} label="Absent" tone="bad" />
            <Stat n={sum.leave} label="Leave" tone="info" />
          </div>
          {facts.length > 0 && <p className="kprof-note kpp-facts">{facts.join(" · ")}</p>}

          {sum.days.length === 0 || sum.blank ? (
            <p className="kprof-note">Nothing recorded for {monthTitle(month)} yet.</p>
          ) : (
            <>
              <ul className="kpp-days">
                {days.map((d) => <DayItem key={d.iso} day={d} today={today} />)}
              </ul>
              {sum.days.length > FIRST_DAYS && (
                <button type="button" className="kpp-link kpp-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
                  {all ? "Show fewer days" : `Show all ${sum.days.length} days`}
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

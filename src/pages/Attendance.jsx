/**
 * Attendance, on the same frosted-glass bento frame as the Dashboard and Tasks: one screen, no
 * page scroll, lists scroll inside their tiles. What it shows depends on who is looking:
 *
 *   team page   position tier 2+ with Attendance: clock-in (if they may edit), the day's ring and
 *               filter key, the roll call (or one person's report), the team calendar and the month
 *   staff page  everyone else: clock-in, today, their own month as a calendar, counts, recent days
 *
 * The sums live in lib/attendance.js. This file loads the month, keeps what is selected, and
 * saves one person at a time when someone with edit rights changes a status.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteRow, fetchAll, upsertRow } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit, sectionVisible, tier } from "../utils/permissions";
import { setEmployeeScheduleOverrides } from "../constants";
import { Avatar, Icons, hueFromName } from "../components/ui";
import { BentoGrid, BentoPage } from "../components/bento/Bento";
import ConfirmDialog from "../components/tasks/ConfirmDialog";
import ClockTile from "../components/attendance/ClockTile";
import DayTile from "../components/attendance/DayTile";
import RosterTile from "../components/attendance/RosterTile";
import ReportTile from "../components/attendance/ReportTile";
import MonthTile from "../components/attendance/MonthTile";
import StatsTile from "../components/attendance/StatsTile";
import TodayTile from "../components/attendance/TodayTile";
import RecentTile from "../components/attendance/RecentTile";
import {
  STATE_LABEL, addDays, buildRoster, dateInMonth, dayTitle, daySummary, hoursFor, isoFromDate, monthOf,
  monthTitle, personMonth, shiftMonth, stateOf, teamMonth,
} from "../lib/attendance";
import "../components/attendance/attendance.css";

const POLL_MS = 60000;      // attendance is not in the realtime feed, so the page looks again every minute
const TOAST_MS = 9000;
const NOTHING = {};         // what the calendar is given while a month is still loading
const NO_DAYS = new Map();

/** The current moment, refreshed on a timer, so "today" and "in for 3h" keep up without a reload. */
function useNow(ms) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export default function Attendance() {
  const { profile } = useAuth();
  const me = profile?.personId || "";
  // The database lets position tier 2+ with Attendance read everyone's rows and tier 2+ with edit
  // change them; anyone else only ever gets their own. The page shows exactly that and no more.
  const seesTeam = tier(profile) >= 2 && sectionVisible(profile, "attendance");
  const canEdit = tier(profile) >= 2 && sectionCanEdit(profile, "attendance");
  const canClock = !seesTeam || canEdit;

  const now = useNow(60000);
  const today = isoFromDate(now);

  const [month, setMonth] = useState(() => monthOf(isoFromDate(new Date())));
  const [date, setDate] = useState(() => isoFromDate(new Date()));
  const [data, setData] = useState({ status: "loading", month: "", staff: [], records: [], clocks: [], error: "" });
  const [mode, setMode] = useState("day");                 // team: "day" (roll call) | "report"
  const [filter, setFilter] = useState("");
  const [edit, setEdit] = useState(false);
  const [reportId, setReportId] = useState("");
  const [busy, setBusy] = useState(() => new Set());
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const seq = useRef(0);
  const toastTimer = useRef(0);

  /* ── loading ───────────────────────────────────────────── */

  const load = useCallback(async ({ silent = false } = {}) => {
    const mine = ++seq.current;
    if (!silent) setData((d) => ({ ...d, status: d.status === "ready" ? "ready" : "loading" }));
    try {
      const range = [{ field: "date", op: "gte", value: month.start }, { field: "date", op: "lte", value: month.end }];
      const [staffAll, records, clocks, employees] = await Promise.all([
        seesTeam ? fetchAll("users") : Promise.resolve([]),
        fetchAll("attendance", { filters: range }),
        fetchAll("clock_ins", { filters: range }),
        fetchAll("employees").catch(() => []),         // only the work schedules; the page reads fine without them
      ]);
      if (mine !== seq.current) return;                // a newer look is on its way
      setEmployeeScheduleOverrides(employees);         // honour schedules edited in Employee Directory
      setData({
        status: "ready", month: month.start, error: "",
        staff: staffAll.filter((m) => m.status !== "Inactive"), records, clocks,
      });
    } catch (err) {
      console.error("Failed to load attendance data:", err);
      if (mine !== seq.current) return;
      setData((d) => (d.status === "ready" && d.month === month.start
        ? { ...d, error: "Could not refresh just now. This is what was loaded last." }
        : { ...d, status: "error", error: err?.message || "Could not load attendance." }));
    }
  }, [month.start, month.end, seesTeam]);

  useEffect(() => { load(); }, [load]);

  const isThisMonth = month.start === monthOf(today).start;
  useEffect(() => {
    if (!isThisMonth) return undefined;
    const look = () => { if (!document.hidden) load({ silent: true }); };
    const id = setInterval(look, POLL_MS);
    document.addEventListener("visibilitychange", look);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", look); };
  }, [load, isThisMonth]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const ready = data.status === "ready" && data.month === month.start;

  /* ── what is on screen ─────────────────────────────────── */

  const meEntry = useMemo(
    () => ({ personId: me, name: profile?.name || "You", jobRole: profile?.positionLabel || "" }),
    [me, profile?.name, profile?.positionLabel],
  );
  const staff = useMemo(() => (seesTeam ? data.staff : [meEntry]), [seesTeam, data.staff, meEntry]);
  const records = useMemo(() => (seesTeam ? data.records : data.records.filter((r) => r.person_id === me)), [seesTeam, data.records, me]);
  const clocks = useMemo(() => (seesTeam ? data.clocks : data.clocks.filter((c) => c.person_id === me)), [seesTeam, data.clocks, me]);

  const roster = useMemo(
    () => buildRoster({
      staff,
      records: records.filter((r) => r.date === date),
      clocks: clocks.filter((c) => c.date === date),
      date, today, now,
    }),
    [staff, records, clocks, date, today, now],
  );
  const summary = useMemo(() => daySummary(roster), [roster]);
  const shown = useMemo(() => (filter ? roster.filter((r) => r.state === filter) : roster), [roster, filter]);
  const team = useMemo(() => (seesTeam ? teamMonth({ staff, records, clocks, month, today }) : null), [seesTeam, staff, records, clocks, month, today]);
  const mine = useMemo(
    () => personMonth({ records: records.filter((r) => r.person_id === me), clocks: clocks.filter((c) => c.person_id === me), month, today }),
    [records, clocks, me, month, today],
  );
  const myDays = useMemo(() => new Map(mine.days.map((d) => [d.iso, d])), [mine]);
  const myRow = roster.find((r) => r.personId === me) || null;

  const reportOptions = useMemo(
    () => staff.filter((s) => s.personId).map((s) => ({
      value: s.personId, label: s.name, hint: s.jobRole,
      icon: <Avatar name={s.name} personId={s.personId} hue={hueFromName(s.name)} size={22} />,
    })).sort((a, b) => a.label.localeCompare(b.label)),
    [staff],
  );
  const reportPerson = team?.people.find((p) => p.personId === (reportId || me)) || null;

  /* ── moving around ─────────────────────────────────────── */

  const goDate = (iso) => {
    setDate(iso);
    const m = monthOf(iso);
    if (m.start !== month.start) setMonth(m);
  };
  const stepMonth = (by) => {
    const m = shiftMonth(month, by);
    setMonth(m);
    setDate((d) => dateInMonth(m, d, today));
  };
  const backToToday = () => goDate(today);

  /* ── saving one person ─────────────────────────────────── */

  const flash = useCallback((next) => {
    clearTimeout(toastTimer.current);
    setToast(next);
    if (next) toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const keepRow = (saved) => setData((d) => ({
    ...d,
    records: d.records.some((r) => r.id === saved.id) ? d.records.map((r) => (r.id === saved.id ? saved : r)) : [...d.records, saved],
  }));
  const dropRow = (id) => setData((d) => ({ ...d, records: d.records.filter((r) => r.id !== id) }));
  const working = (id, on) => setBusy((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  /**
   * Save one person's day. `patch` is { status } or { status: "Late", cut }. Resolves to whether it
   * saved. Only that person's row is written; the toast offers Undo, which puts the old row back
   * (or removes the one this created).
   */
  const mark = useCallback(async (row, patch) => {
    const prev = row.record;                           // what is stored now; null when nothing has been marked
    const status = patch.status ?? prev?.status;
    const first = row.name.split(" ")[0];
    const body = {
      date, person_id: row.personId, staffName: row.name, role: row.role,
      status,
      // the same status keeps its hours (turning the cut on or off must not touch them); a new one gets what it means
      hours: status === prev?.status && prev?.hours != null ? Number(prev.hours) || 0 : hoursFor(status, row.worked),
      note: prev?.note ?? "",
      loggedBy: profile?.name || "Unknown",
      lateCutApplied: status === "Late" ? (patch.cut ?? prev?.lateCutApplied === true) : false,
      lateMinutes: status === "Late" ? Number(prev?.lateMinutes) || 0 : 0,
    };
    working(row.personId, true);
    try {
      const saved = await upsertRow("attendance", body, ["person_id", "date"]);
      // a write the database does not allow can come back as the row it was; only the stored status proves it took
      if (!saved || saved.status !== status) throw new Error("The database kept the old status.");
      keepRow(saved);

      const undo = async () => {
        flash(null);
        working(row.personId, true);
        try {
          if (prev) {
            keepRow(await upsertRow("attendance", {
              date, person_id: row.personId, staffName: row.name, role: row.role,
              status: prev.status, hours: Number(prev.hours) || 0, note: prev.note ?? "", loggedBy: prev.loggedBy ?? "",
              lateCutApplied: prev.lateCutApplied === true, lateMinutes: Number(prev.lateMinutes) || 0,
            }, ["person_id", "date"]));
          } else {
            await deleteRow("attendance", saved.id);
            dropRow(saved.id);
          }
          flash({ text: `${first}: change undone` });
        } catch (err) {
          console.error("Failed to undo attendance change:", err);
          flash({ text: `Could not undo ${first}'s change. Try again.`, bad: true });
        } finally {
          working(row.personId, false);
        }
      };

      flash({
        text: patch.cut !== undefined
          ? `${first}: 25% cut ${patch.cut ? "on" : "off"}`
          : `${first}: ${STATE_LABEL[row.state]} → ${STATE_LABEL[stateOf({ status })]}`,
        undo,
      });
      return true;
    } catch (err) {
      console.error("Failed to save attendance:", err);
      flash({ text: `Could not save ${first}. Check your connection and try again.`, bad: true });
      return false;
    } finally {
      working(row.personId, false);
    }
  }, [date, profile?.name, flash]);

  const onSet = (row, status) => {
    if (!canEdit || busy.has(row.personId)) return;
    if (row.record?.status === status && !row.missedClockOut) return;
    // taking a late mark off also takes the salary cut off: ask first
    if (row.lateCut && status !== "Late") { setConfirm({ row, status }); return; }
    mark(row, { status });
  };
  const onCut = (row) => { if (canEdit && !busy.has(row.personId)) mark(row, { status: "Late", cut: !row.lateCut }); };

  /* ── the page ──────────────────────────────────────────── */

  const out = summary.absent + summary.none;
  const sub = seesTeam ? (
    <>
      <span>{dayTitle(date)}</span>
      {summary.total > 0 && <span>{summary.here} in</span>}
      {summary.late > 0 && <span>{summary.late} late</span>}
      {out > 0 && summary.total > 0 && <span className="kb-bad">{out} {date === today ? "not in" : "absent or unmarked"}</span>}
      {!canEdit && <span>View only</span>}
    </>
  ) : (
    <>
      <span>{dayTitle(date)}</span>
      <span>{mine.present} present</span>
      {mine.late > 0 && <span>{mine.late} late</span>}
      {mine.absent > 0 && <span className="kb-bad">{mine.absent} absent</span>}
    </>
  );

  const layout = seesTeam ? (canClock ? "att-team" : "att-view") : "att-me";
  const loadingTiles = !ready;
  // The calendar keeps its frame (and the keyboard focus in it) while another month loads; only the very first load blanks it.
  const firstLoad = !data.month;

  return (
    <BentoPage className="at-page">
      <header className="kb-head">
        <div className="kb-head-l">
          <h1>Attendance</h1>
          <p className="kb-head-sub">{ready ? sub : data.status === "error" ? null : <span>Loading…</span>}</p>
        </div>
        <div className="kb-head-r">
          {date !== today && <button type="button" className="kb-pillbtn" onClick={backToToday}>Back to today</button>}
          <button type="button" className="kb-pillbtn" onClick={() => load()} aria-label="Refresh attendance">
            <Icons.RefreshCw size={13} sw={1.9} aria-hidden="true" /> Refresh
          </button>
        </div>
      </header>

      {data.error && data.status === "ready" && (
        <div className="at-banner" role="status">
          <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
          <span>{data.error}</span>
        </div>
      )}

      {data.status === "error" ? (
        <div className="kb-error" role="alert">
          <p>Attendance could not load: {data.error}</p>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={() => load()}>Try again</button>
        </div>
      ) : seesTeam ? (
        <BentoGrid layout={layout}>
          {canClock && <ClockTile profile={profile} onClockChange={() => load({ silent: true })} />}
          <DayTile rows={roster} summary={summary} filter={filter} onFilter={setFilter} date={date} today={today} loading={loadingTiles} />
          {mode === "day" ? (
            <RosterTile
              rows={roster} shown={shown} filter={filter} onFilter={setFilter}
              date={date} today={today} onStep={(n) => goDate(addDays(date, n))} onToday={backToToday}
              canEdit={canEdit} edit={edit && canEdit} onEdit={setEdit} busyIds={busy} onSet={onSet} onCut={onCut}
              toast={toast} mode={mode} onMode={(m) => { setEdit(false); setMode(m); }} loading={loadingTiles}
            />
          ) : (
            <ReportTile
              options={reportOptions} personId={reportPerson?.personId || ""} onPerson={setReportId} person={reportPerson}
              month={month} today={today} mode={mode} onMode={setMode} loading={loadingTiles}
            />
          )}
          <MonthTile kind="team" month={month} onMonth={stepMonth} date={date} onPick={goDate} today={today} byDay={ready ? team.byDay : NOTHING} loading={firstLoad} />
          <StatsTile kind="team" summary={team} label={monthTitle(month)} loading={loadingTiles} />
        </BentoGrid>
      ) : (
        <BentoGrid layout={layout}>
          <ClockTile profile={profile} onClockChange={() => load({ silent: true })} />
          <TodayTile row={myRow} date={date} today={today} loading={loadingTiles} />
          <MonthTile kind="me" month={month} onMonth={stepMonth} date={date} onPick={goDate} today={today} days={ready ? myDays : NO_DAYS} loading={firstLoad} />
          <StatsTile kind="me" summary={mine} label={monthTitle(month)} loading={loadingTiles} />
          <RecentTile days={mine.days} today={today} date={date} onPick={goDate} loading={loadingTiles} />
        </BentoGrid>
      )}

      {confirm && (
        <ConfirmDialog
          title="Take off the salary cut?"
          confirmLabel="Change status"
          busyLabel="Saving…"
          onConfirm={() => mark(confirm.row, { status: confirm.status })}
          onClose={() => setConfirm(null)}
        >
          {confirm.row.name} was marked late with a 25% salary cut on {dayTitle(date)}. Making them {STATE_LABEL[stateOf({ status: confirm.status })].toLowerCase()} takes the cut off too. You can undo it straight after.
        </ConfirmDialog>
      )}
    </BentoPage>
  );
}

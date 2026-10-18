import { useEffect, useRef, useState } from "react";
import { fetchAll, insertRow, updateRow, upsertRow } from "../lib/db";
import { haversineDistance } from "../utils/geo";
import { WORK_SITE, GEOFENCE_RADIUS_M, GPS_ACCURACY_THRESHOLD_M, calculateAttendanceStatus, setEmployeeScheduleOverrides } from "../constants";
import { todayDate, isSaturday, tsDate } from "../utils/date";
import { Icons } from "./ui";
import { awardPoints } from "../utils/rewardService";
import { useReward } from "../context/RewardContext";
import { getCurrentPosition, hapticSuccess } from "../utils/native";
import { useHolidays } from "../hooks/useHolidays";
import { holidayOn } from "../lib/holidayDays";

function fmtHM(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function hoursBetween(inDate, outDate) {
  return Math.max(0, Math.round(((outDate - inDate) / 3600000) * 10) / 10);
}
function fmtElapsed(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/**
 * `variant` picks how it is drawn; what it does is the same in both.
 *   ring   one circle: press it and it clocks you in (no separate confirm step). `showTime` puts
 *          the time of day in the circle while it waits to be pressed (the Attendance page)
 *   strip  one compact line at the foot of another tile (managers, beside the team's attendance)
 */
export default function ClockInCard({ profile, onClockChange, variant = "ring", showTime = false }) {
  const today = todayDate();
  // a holiday closes the office like a Saturday does: nobody is expected, so there is nothing to clock in to
  const { rows: holidays } = useHolidays();
  const holiday = holidayOn(today, holidays, profile?.location);
  const isOfficeClosedToday = isSaturday(today) || Boolean(holiday);
  // Attendance and clock-ins are keyed by the person's row in `people`, not by
  // the Firebase uid they happened to sign in with — someone can now arrive
  // through either provider and must land on the same attendance record.
  const personId = profile?.personId || "";
  const { showPointsToast } = useReward();

  const [status, setStatus] = useState("checking_status"); // checking_status, idle, locating, success, far, low-accuracy, gps-error, clocked, clocked_out
  const [clockDist, setClockDist] = useState(null);
  const [clockCoords, setClockCoords] = useState(null); // { lat, lng, accuracy }
  const [clockTime, setClockTime] = useState(new Date());
  const [clockInDocId, setClockInDocId] = useState(null);
  const [clockedAtStr, setClockedAtStr] = useState(null);
  const [clockInDate, setClockInDate] = useState(null);      // Date of today's clock-in (for hours calc)
  const [clockedOutAtStr, setClockedOutAtStr] = useState(null);
  const [workedHours, setWorkedHours] = useState(null);
  const [confirmingOut, setConfirmingOut] = useState(false);

  // Live timer
  useEffect(() => {
    const t = setInterval(() => setClockTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load per-employee work schedules so the late-arrival calc on clock-in
  // respects times edited in Employee Directory → Schedule.
  useEffect(() => {
    fetchAll("employees")
      .then(setEmployeeScheduleOverrides)
      .catch(err => console.warn("Could not load employee schedules:", err));
  }, []);

  // Fetch initial clock-in status
  useEffect(() => {
    async function checkCurrentStatus() {
      if (!personId) return;
      try {
        const rows = await fetchAll("clock_ins", {
          filters: [{ field: "person_id", value: personId }, { field: "date", value: today }],
        });
        if (rows.length) {
          const docData = rows[0];
          setClockInDocId(docData.id);
          setClockDist(docData.distanceToSiteM ?? null);

          const inDate = tsDate(docData.clockedInAt);
          setClockInDate(inDate);
          setClockedAtStr(inDate ? fmtHM(inDate) : "earlier");

          if (docData.clockedOutAt) {
            const outDate = tsDate(docData.clockedOutAt);
            setClockedOutAtStr(outDate ? fmtHM(outDate) : "earlier");
            setWorkedHours(inDate && outDate ? hoursBetween(inDate, outDate) : null);
            setStatus("clocked_out");
          } else {
            setStatus("clocked");
          }
        } else {
          setStatus("idle");
        }
      } catch (err) {
        console.error("Error fetching clock-in status:", err);
        setStatus("idle");
      }
    }
    checkCurrentStatus();
  }, [personId, today]);

  const RADIUS = GEOFENCE_RADIUS_M;
  const ringPct = clockDist == null ? 0 : Math.max(0, Math.min(100, (1 - clockDist / RADIUS) * 100));

  // The ring clocks in on one press: once the GPS check has passed there is nothing left to confirm.
  // Waiting for the state to land (rather than calling confirm inside startClock) keeps the distance
  // and coordinates it saves the real ones.
  const autoConfirmed = useRef(false);
  useEffect(() => {
    if (variant !== "ring") return;
    if (status === "success" && !autoConfirmed.current) {
      autoConfirmed.current = true;
      confirmClockIn();
    } else if (status !== "success" && status !== "saving") {
      autoConfirmed.current = false;
    }
  }, [variant, status]);

  const startClock = async () => {
    setStatus("locating");
    setClockDist(null);
    setClockCoords(null);

    try {
      const pos = await getCurrentPosition();
      const { latitude, longitude, accuracy } = pos.coords;
      const dist = Math.round(haversineDistance(latitude, longitude, WORK_SITE.lat, WORK_SITE.lng));

      setClockDist(dist);
      setClockCoords({ lat: latitude, lng: longitude, accuracy: Math.round(accuracy) });

      // Reject unreliable GPS readings
      if (accuracy > GPS_ACCURACY_THRESHOLD_M) {
        setStatus("low-accuracy");
        return;
      }

      setStatus(dist > RADIUS ? "far" : "success");
    } catch (err) {
      console.error("GPS error:", err);
      setClockDist(null);
      setStatus("gps-error");
    }
  };

  // Only reached from a reading that passed startClock (close enough, accurate enough): there is no way
  // to clock in without one, on purpose. Someone whose phone cannot get a fix is marked by hand by an admin.
  const confirmClockIn = async () => {
    try {
      setStatus("saving");
      // Double check to prevent duplicates
      const existing = await fetchAll("clock_ins", {
        filters: [{ field: "person_id", value: personId }, { field: "date", value: today }],
      });

      let docId = clockInDocId;
      if (!existing.length) {
        const clockData = {
          person_id: personId,
          staffName: profile?.name || "Unknown",
          role: profile?.positionLabel || "",
          date: today,
          lat: clockCoords?.lat ?? null,
          lng: clockCoords?.lng ?? null,
          accuracyM: clockCoords?.accuracy ?? null,
          distanceToSiteM: clockDist,
          clockedInAt: new Date().toISOString(),
        };
        const saved = await insertRow("clock_ins", clockData);
        docId = saved.id;
        setClockInDocId(docId);
      } else {
        docId = existing[0].id;
        setClockInDocId(docId);
      }

      // Compute and sync attendance record
      const now = new Date();
      const statusCalc = calculateAttendanceStatus(profile?.name || "", now);
      
      // One attendance row per person per day — enforced by a unique
      // constraint rather than by naming the document, so a second clock-in
      // updates today's row instead of creating a duplicate.
      await upsertRow("attendance", {
        date: today,
        person_id: personId,
        staffName: profile?.name || "Unknown",
        role: profile?.positionLabel || "",
        status: statusCalc.status,
        hours: 8,
        note: "GPS clock-in",
        loggedBy: "GPS",
        lateCutApplied: statusCalc.lateCutApplied,
        lateMinutes: statusCalc.lateMinutes,
      }, ["person_id", "date"]);

      setClockedAtStr(fmtHM(now));
      setClockInDate(now);
      setClockedOutAtStr(null);
      setWorkedHours(null);
      setStatus("clocked");
      hapticSuccess();

      // Award attendance points if clocked in on time
      if (statusCalc.status === "Present" && personId) {
        const pts = await awardPoints({
          uid: personId,
          displayName: profile?.name || "",
          eventType: "attendance_present",
          sourceId: personId + "_" + today,
          reason: "On-time attendance",
        });
        if (pts) showPointsToast(pts, "On-time attendance");
      }

      if (onClockChange) onClockChange();
    } catch (err) {
      console.error("Error clocking in:", err);
      setStatus("idle");
    }
  };

  const handleClockOut = async () => {
    if (!clockInDocId) return;
    try {
      setConfirmingOut(false);
      setStatus("saving");
      const now = new Date();
      const hours = clockInDate ? hoursBetween(clockInDate, now) : null;

      await updateRow("clock_ins", clockInDocId, {
        clockedOutAt: new Date().toISOString(),
        ...(hours != null ? { workedHours: hours } : {}),
      });

      // Record actual worked hours on the attendance row
      await upsertRow("attendance", {
        date: today,
        person_id: personId,
        ...(hours != null ? { hours } : {}),
      }, ["person_id", "date"]);

      setClockedOutAtStr(fmtHM(now));
      setWorkedHours(hours);
      setStatus("clocked_out");
      hapticSuccess();
      if (onClockChange) onClockChange();
    } catch (err) {
      console.error("Error clocking out:", err);
      setStatus("clocked"); // stay clocked in — the clock-out didn't save
    }
  };

  // Undo an accidental clock-out (or returning after a break)
  const handleClockBackIn = async () => {
    if (!clockInDocId) return;
    try {
      setStatus("saving");
      // Clearing a column is just setting it null here — no deleteField()
      // sentinel, because the column exists whether or not it holds a value.
      await updateRow("clock_ins", clockInDocId, {
        clockedOutAt: null,
        workedHours: null,
      });
      // Revert the attendance row to the clocked-in default so reports don't
      // keep the shortened worked-hours figure while the day is still running.
      await upsertRow("attendance", {
        date: today,
        person_id: personId,
        hours: 8,
      }, ["person_id", "date"]);
      setClockedOutAtStr(null);
      setWorkedHours(null);
      setStatus("clocked");
      hapticSuccess();
      if (onClockChange) onClockChange();
    } catch (err) {
      console.error("Error clocking back in:", err);
      setStatus("clocked_out");
    }
  };

  // One circle. Same state and handlers; drawn for a tile (see .kb-clockring in bento.css).
  if (variant === "ring") {
    const C = 2 * Math.PI * 45;
    const elapsed = clockInDate ? Math.max(0, clockTime - clockInDate) : 0;
    const retry = () => { setClockDist(null); startClock(); };
    const act = (kind, label, onClick) => (
      <button type="button" className={`kb-btn kb-btn--${kind} kb-act`} onClick={onClick}>{label}</button>
    );

    let tone = "";      // "" | "ok" | "err"
    let pct = 0;        // how much of the circle is drawn
    let busy = false;   // spinning: something is in flight
    let main = <Icons.MapPin size={28} sw={1.7} />;
    let mainText = "";  // the words in `main`, if it has any: the button's spoken name has to start with what is seen on it
    const say = (words) => { mainText = words; return <span>{words}</span>; };
    let label = "";
    let note = "";
    let press = null;   // what the circle does when pressed
    let extra = null;

    if (status === "checking_status") {
      busy = true; main = <Icons.Clock size={28} sw={1.7} />; label = "Checking";
    } else if (isOfficeClosedToday && status === "idle") {
      tone = "ok"; pct = 100; main = <Icons.Check size={28} sw={1.9} />; label = holiday ? "Holiday" : "Closed today";
      note = holiday ? `${holiday.name}: the office is closed.` : "Saturday is the company holiday.";
    } else if (status === "idle") {
      label = "Clock in"; press = startClock; note = `We check you are within ${RADIUS} m of the workshop.`;
      if (showTime) main = say(fmtHM(clockTime));
    } else if (status === "locating") {
      busy = true; main = <Icons.Crosshair size={28} sw={1.7} />; label = "Locating"; note = "Finding your position…";
    } else if (status === "success" || status === "saving") {
      busy = true; main = <Icons.Check size={28} sw={1.9} />; label = "Clocking in"; note = "Saving your clock-in…";
    } else if (status === "far") {
      tone = "err"; pct = 100; press = retry;
      main = say(clockDist && clockDist !== 9999 ? `${(clockDist / 1000).toFixed(1)} km` : "Far"); label = "Too far";
      note = `Move within ${RADIUS} m of the workshop, then press to try again.`;
    } else if (status === "low-accuracy" || status === "gps-error") {
      tone = "err"; pct = 100; press = retry; main = <Icons.Alert size={28} sw={1.7} />;
      label = status === "gps-error" ? "No location" : "Weak GPS";
      note = status === "gps-error"
        ? "Allow location for this site in your browser or phone settings, then press to try again."
        : `Accuracy ${clockCoords?.accuracy} m; it needs to be under ${GPS_ACCURACY_THRESHOLD_M} m. Move outdoors, then press to try again.`;
    } else if (status === "clocked") {
      tone = "ok"; pct = Math.min(100, (elapsed / (8 * 3600000)) * 100);
      main = say(clockInDate ? fmtElapsed(elapsed) : "In"); label = "on the clock";
      note = `In at ${clockedAtStr || "—"}`;
      extra = confirmingOut
        ? <>{act("ghost", "Cancel", () => setConfirmingOut(false))}{act("primary", "Confirm clock-out", handleClockOut)}</>
        : act("ghost", "Clock out", () => setConfirmingOut(true));
    } else if (status === "clocked_out") {
      tone = "ok"; pct = 100; main = say(workedHours != null ? `${workedHours}h` : "Done"); label = "day complete";
      note = `${clockedAtStr || "—"} to ${clockedOutAtStr || "—"}`;
      extra = act("ghost", "Clock back in", handleClockBackIn);
    }

    return (
      <div className="kb-clockring" data-tour="clock-in">
        <button
          type="button"
          className={`kb-ringbtn${tone ? ` kb-ringbtn--${tone}` : ""}${press ? " is-press" : ""}`}
          onClick={press && !busy ? press : undefined}
          aria-disabled={!press || busy || undefined}
          aria-label={`${[mainText, label].filter(Boolean).join(" ")}. ${note}`}
        >
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="45" fill="none" strokeWidth="6" className="kb-ring-track" />
            {pct > 0 && (
              <circle cx="50" cy="50" r="45" fill="none" strokeWidth="6" strokeLinecap="round" className="kb-ringbtn-arc"
                strokeDasharray={`${(pct / 100) * C} ${C}`} transform="rotate(-90 50 50)" />
            )}
            {busy && <circle cx="50" cy="50" r="45" fill="none" strokeWidth="6" strokeLinecap="round" className="kb-ringbtn-spin" strokeDasharray={`${C * 0.22} ${C}`} />}
          </svg>
          <span className="kb-ringbtn-c">
            <span className="kb-ringbtn-main">{main}</span>{" "}
            <span className="kb-ringbtn-l">{label}</span>
          </span>
        </button>
        <div className="kb-clockring-side">
          <p className="kb-clockring-note" role={tone === "err" ? "alert" : "status"}>{note}</p>
          {extra && <div className="kb-clockring-acts">{extra}</div>}
        </div>
      </div>
    );
  }

  // The strip. Same state, same handlers, drawn for a tile (see .kb-clock in bento.css).
  if (variant === "strip") {
    const btn = (kind, label, onClick, disabled) => (
      <button type="button" className={`kb-btn kb-btn--${kind} kb-act`} onClick={onClick} disabled={disabled}>{label}</button>
    );
    const away = clockDist && clockDist !== 9999 ? `${(clockDist / 1000).toFixed(2)} km` : "too far";
    const retry = () => { setStatus("idle"); setClockDist(null); };

    let tone = "";
    let Icon = Icons.MapPin;
    let headline = "";
    let detail = "";
    let acts = null;

    if (status === "checking_status") {
      Icon = Icons.Clock; headline = "Checking attendance…";
    } else if (isOfficeClosedToday && status === "idle") {
      Icon = Icons.Check; tone = "ok"; headline = "Office closed today"; detail = holiday ? `${holiday.name} is a holiday. No clock-in needed.` : "Saturdays are a company holiday. No clock-in needed.";
    } else if (status === "idle") {
      headline = "Ready to clock in"; detail = `GPS-checked within ${RADIUS} m of the workshop.`;
      acts = btn("primary", "Clock in", startClock);
    } else if (status === "locating") {
      Icon = Icons.Crosshair; headline = "Finding you…"; acts = btn("ghost", "Locating…", undefined, true);
    } else if (status === "saving") {
      Icon = Icons.Crosshair; headline = "Saving…"; acts = btn("ghost", "Saving…", undefined, true);
    } else if (status === "success") {
      Icon = Icons.Check; tone = "ok"; headline = "You're at the workshop";
      detail = `${clockDist} m from the office, inside the ${RADIUS} m geofence.`;
      acts = [btn("ghost", "Cancel", retry), btn("primary", "Confirm clock-in", () => confirmClockIn())];
    } else if (status === "far") {
      Icon = Icons.Alert; tone = "err"; headline = "Outside the workshop geofence";
      detail = `You are ${away} away. Move within ${RADIUS} m to clock in.`;
      acts = btn("ghost", "Try again", retry);
    } else if (status === "low-accuracy") {
      Icon = Icons.Alert; tone = "err"; headline = "GPS signal too weak";
      detail = `Accuracy ${clockCoords?.accuracy} m; it needs to be under ${GPS_ACCURACY_THRESHOLD_M} m. Move outdoors and try again.`;
      acts = btn("ghost", "Try again", startClock);
    } else if (status === "gps-error") {
      Icon = Icons.Alert; tone = "err"; headline = "Location unavailable";
      detail = "Allow location for this site in your browser or phone settings, then try again.";
      acts = btn("ghost", "Try again", startClock);
    } else if (status === "clocked") {
      Icon = Icons.Check; tone = "ok"; headline = `Clocked in at ${clockedAtStr || "—"}`;
      detail = confirmingOut
        ? "Clocking out records the end of your work day."
        : clockInDate ? `${fmtElapsed(clockTime - clockInDate)} on the clock` : "";
      acts = confirmingOut
        ? [btn("ghost", "Cancel", () => setConfirmingOut(false)), btn("primary", "Confirm clock-out", handleClockOut)]
        : btn("ghost", "Clock out", () => setConfirmingOut(true));
    } else if (status === "clocked_out") {
      Icon = Icons.Check; tone = "ok"; headline = `Day complete · ${clockedAtStr || "—"} to ${clockedOutAtStr || "—"}`;
      detail = workedHours != null ? `${workedHours} h logged today.` : "";
      acts = btn("ghost", "Clock back in", handleClockBackIn);
    }

    return (
      <div className={`kb-clock kb-clock--${variant}`} data-tour="clock-in">
        <div className={`kb-clock-msg${tone ? ` kb-clock-msg--${tone}` : ""}`} role={tone === "err" ? "alert" : undefined}>
          <Icon size={16} sw={1.9} />
          <div><b>{headline}</b>{detail ? <span>{detail}</span> : null}</div>
        </div>
        {acts && <div className="kb-clock-acts">{acts}</div>}
      </div>
    );
  }

  return null;
}

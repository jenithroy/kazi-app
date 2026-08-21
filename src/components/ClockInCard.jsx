import { useEffect, useState } from "react";
import { addDoc, collection, deleteField, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { haversineDistance } from "../utils/geo";
import { WORK_SITE, GEOFENCE_RADIUS_M, GPS_ACCURACY_THRESHOLD_M, calculateAttendanceStatus } from "../constants";
import { todayDate, isSaturday } from "../utils/date";
import { Icons, Btn, Card, Pill } from "./ui";
import { awardPoints } from "../utils/rewardService";
import { useReward } from "../context/RewardContext";
import { getCurrentPosition, hapticSuccess } from "../utils/native";

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

export default function ClockInCard({ profile, onClockChange }) {
  const today = todayDate();
  const isOfficeClosedToday = isSaturday(today);
  const staffId = profile?.uid || profile?.id || "";
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

  // Fetch initial clock-in status
  useEffect(() => {
    async function checkCurrentStatus() {
      if (!staffId) return;
      try {
        const snap = await getDocs(query(
          collection(db, "clock_ins"),
          where("staffId", "==", staffId),
          where("date", "==", today)
        ));
        if (!snap.empty) {
          const docData = snap.docs[0].data();
          const docId = snap.docs[0].id;
          setClockInDocId(docId);
          setClockDist(docData.distanceToSiteM ?? null);

          const inDate = docData.clockedInAt?.toDate ? docData.clockedInAt.toDate() : null;
          setClockInDate(inDate);
          setClockedAtStr(inDate ? fmtHM(inDate) : "earlier");

          if (docData.clockedOutAt) {
            const outDate = docData.clockedOutAt.toDate ? docData.clockedOutAt.toDate() : null;
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
  }, [staffId, today]);

  const RADIUS = GEOFENCE_RADIUS_M;
  const ringPct = clockDist == null ? 0 : Math.max(0, Math.min(100, (1 - clockDist / RADIUS) * 100));

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

  const confirmClockIn = async (isBypass = false) => {
    try {
      setStatus("saving");
      // Double check to prevent duplicates
      const existing = await getDocs(query(
        collection(db, "clock_ins"),
        where("staffId", "==", staffId),
        where("date", "==", today)
      ));
      
      let docId = clockInDocId;
      if (existing.empty) {
        const clockData = {
          staffId,
          staffName: profile?.name || "Unknown",
          role: profile?.jobRole || profile?.role || "",
          date: today,
          lat: clockCoords?.lat ?? null,
          lng: clockCoords?.lng ?? null,
          accuracyM: clockCoords?.accuracy ?? null,
          distanceToSiteM: isBypass ? (clockDist ?? null) : clockDist,
          clockedInAt: serverTimestamp(),
        };
        if (isBypass) {
          clockData.bypassUsed = true;
        }
        const clockRef = await addDoc(collection(db, "clock_ins"), clockData);
        docId = clockRef.id;
        setClockInDocId(docId);
      } else {
        docId = existing.docs[0].id;
        setClockInDocId(docId);
      }

      // Compute and sync attendance record
      const now = new Date();
      const statusCalc = calculateAttendanceStatus(profile?.name || "", now);
      
      const attRef = doc(db, "attendance", `${today}_${staffId}`);
      await setDoc(attRef, {
        date: today,
        staffId,
        staffName: profile?.name || "Unknown",
        role: profile?.jobRole || profile?.role || "",
        status: statusCalc.status,
        hours: 8,
        note: isBypass ? "GPS clock-in (low-accuracy bypass)" : "GPS clock-in",
        loggedBy: "GPS",
        createdAt: serverTimestamp(),
        lateCutApplied: statusCalc.lateCutApplied,
        lateMinutes: statusCalc.lateMinutes,
      }, { merge: true });

      setClockedAtStr(fmtHM(now));
      setClockInDate(now);
      setClockedOutAtStr(null);
      setWorkedHours(null);
      setStatus("clocked");
      hapticSuccess();

      // Award attendance points if clocked in on time
      if (statusCalc.status === "Present" && staffId) {
        const pts = await awardPoints({
          uid: staffId,
          displayName: profile?.name || "",
          eventType: "attendance_present",
          sourceId: staffId + "_" + today,
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

      await setDoc(doc(db, "clock_ins", clockInDocId), {
        clockedOutAt: serverTimestamp(),
        ...(hours != null ? { workedHours: hours } : {}),
      }, { merge: true });

      // Record actual worked hours on the attendance row
      const attRef = doc(db, "attendance", `${today}_${staffId}`);
      await setDoc(attRef, {
        note: "GPS clock-in & out",
        ...(hours != null ? { hours } : {}),
      }, { merge: true });

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
      await setDoc(doc(db, "clock_ins", clockInDocId), {
        clockedOutAt: null,
        workedHours: deleteField(),
      }, { merge: true });
      // Revert the attendance row to the clocked-in default so reports don't
      // keep the shortened worked-hours figure while the day is still running.
      await setDoc(doc(db, "attendance", `${today}_${staffId}`), { note: "GPS clock-in", hours: 8 }, { merge: true });
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

  if (status === "checking_status") {
    return (
      <Card pad={false} className="kem-clock" style={{ padding: "32px 24px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ color: "var(--ink-4)" }}>Verifying attendance status…</div>
      </Card>
    );
  }

  if (isOfficeClosedToday && status === "idle") {
    return (
      <Card pad={false} className="kem-clock" style={{ padding: "32px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
        <Icons.Check size={26} sw={1.8} style={{ color: "var(--mint-deep)" }} />
        <div style={{ fontWeight: 600, fontSize: 15 }}>Office closed today</div>
        <div style={{ fontSize: 13, color: "var(--ink-4)" }}>Saturdays are a company holiday — no clock-in needed.</div>
      </Card>
    );
  }

  const isBypassing = status === "low-accuracy";

  return (
    <Card pad={false} className="kem-clock">
      <div className="kem-clock-grid">
        {/* Ring */}
        <div className="kem-clock-ring">
          <div className="kem-clock-rings">
            <svg viewBox="0 0 200 200" width="200" height="200">
              <defs>
                <linearGradient id="clk-g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--mint)" />
                  <stop offset="100%" stopColor="var(--mint-deep)" />
                </linearGradient>
              </defs>
              <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(15,46,34,.06)" strokeWidth="3" strokeDasharray="3 4"/>
              {status !== "idle" && status !== "checking_status" && (
                <circle cx="100" cy="100" r="78" fill="none"
                  stroke={status === "far" || status === "gps-error" ? "var(--terra)" : "url(#clk-g)"} strokeWidth="10"
                  strokeDasharray={`${(ringPct/100)*490} 490`} strokeLinecap="round"
                  transform="rotate(-90 100 100)" style={{ transition: "stroke-dasharray .6s ease" }}/>
              )}
              {(status === "locating" || status === "saving") && (
                <circle cx="100" cy="100" r="60" fill="none" stroke="var(--mint)" strokeWidth="2"
                  strokeDasharray="20 380" style={{ transformOrigin: "100px 100px", animation: "spin 1.2s linear infinite" }}/>
              )}
              <circle cx="100" cy="100" r="64" fill="#fff"/>
            </svg>
            <div className="kem-clock-inner">
              {status === "idle"         && <><Icons.MapPin size={24} sw={1.8}/><div className="kem-clock-inner-l">Ready to clock in</div></>}
              {status === "locating"     && <><Icons.Crosshair size={26} sw={1.8}/><div className="kem-clock-inner-l">Locating…</div></>}
              {status === "saving"       && <><Icons.Crosshair size={26} sw={1.8}/><div className="kem-clock-inner-l">Saving…</div></>}
              {status === "success"      && <><div className="num-xl mono" style={{fontSize:26,color:"var(--mint-deep)"}}>{clockDist}m</div><div className="kem-clock-inner-l">from workshop</div></>}
              {status === "far"          && <><div className="num-xl mono" style={{fontSize:22,color:"var(--terra)"}}>{clockDist && clockDist !== 9999 ? `${(clockDist/1000).toFixed(2)}km` : "—"}</div><div className="kem-clock-inner-l">out of range</div></>}
              {status === "low-accuracy" && <><Icons.Alert size={26} style={{color:"var(--terra)"}}/><div className="kem-clock-inner-l" style={{color:"var(--terra)"}}>Weak GPS</div></>}
              {status === "gps-error"    && <><Icons.Alert size={26} style={{color:"var(--terra)"}}/><div className="kem-clock-inner-l" style={{color:"var(--terra)"}}>GPS Error</div></>}
              {status === "clocked"      && (clockInDate
                ? <><div className="num-xl mono" style={{fontSize:22,color:"var(--mint-deep)"}}>{fmtElapsed(clockTime - clockInDate)}</div><div className="kem-clock-inner-l">on the clock</div></>
                : <><Icons.Check size={28} sw={2.2} style={{color:"var(--mint-deep)"}}/><div className="kem-clock-inner-l">Clocked in</div></>)}
              {status === "clocked_out"  && <><div className="num-xl mono" style={{fontSize:24,color:"var(--mint-deep)"}}>{workedHours != null ? `${workedHours}h` : "✓"}</div><div className="kem-clock-inner-l">day complete</div></>}
            </div>
          </div>
        </div>

        {/* Side Info */}
        <div className="kem-clock-side">
          <div className="kem-clock-head">
            <div>
              <div className="kem-clock-name">Hi {profile?.name?.split(" ")[0]},</div>
              <div className="kem-clock-time">
                <span className="num-xl mono" style={{fontSize:32}}>{clockTime.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</span>
                <span className="kem-clock-zone">Kathmandu</span>
              </div>
            </div>
            <div className="kem-clock-geo">
              <Icons.Wifi size={14} sw={1.8}/>
              <span>GPS · Geofence {RADIUS}m</span>
            </div>
          </div>

          {status === "idle" && (
            <>
              <p className="kem-clock-msg">Tap to verify you're at the workshop. Clock-in is GPS-checked and your time is stamped server-side.</p>
              <div className="kem-clock-actions">
                <Btn kind="mint" size="lg" icon={<Icons.MapPin size={16} sw={2}/>} onClick={startClock}>Clock in</Btn>
              </div>
            </>
          )}

          {status === "locating" && (
            <div className="kem-clock-actions"><Btn kind="soft" size="lg" disabled>Locating…</Btn></div>
          )}

          {status === "saving" && (
            <div className="kem-clock-actions"><Btn kind="soft" size="lg" disabled>Saving log…</Btn></div>
          )}

          {status === "success" && (
            <>
              <div className="kem-clock-banner kem-clock-banner--ok">
                <Icons.Check size={18} sw={2.2}/>
                <div>
                  <div>You're at the workshop.</div>
                  <span><strong className="mono">{clockDist}m</strong> from the office · within {RADIUS}m geofence</span>
                </div>
              </div>
              <div className="kem-clock-actions">
                <Btn kind="ghost" size="md" onClick={() => { setStatus("idle"); setClockDist(null); }}>Cancel</Btn>
                <Btn kind="mint" size="lg" icon={<Icons.Check size={16} sw={2.2}/>} onClick={() => confirmClockIn(false)}>Confirm clock-in</Btn>
              </div>
            </>
          )}

          {status === "far" && (
            <>
              <div className="kem-clock-banner kem-clock-banner--err">
                <Icons.Alert size={18}/>
                <div>
                  <div>You're outside the workshop geofence.</div>
                  <span>You are <strong className="mono">{clockDist && clockDist !== 9999 ? `${(clockDist/1000).toFixed(2)}km` : "too far"}</strong> away. Move within {RADIUS}m to clock in.</span>
                </div>
              </div>
              <div className="kem-clock-actions">
                <Btn kind="soft" size="md" onClick={() => { setStatus("idle"); setClockDist(null); }}>Try again</Btn>
              </div>
            </>
          )}

          {status === "low-accuracy" && (
            <>
              <div className="kem-clock-banner kem-clock-banner--err">
                <Icons.Alert size={18}/>
                <div>
                  <div>GPS signal too weak</div>
                  <span>Accuracy: <strong className="mono">{clockCoords?.accuracy}m</strong> (requires &lt;{GPS_ACCURACY_THRESHOLD_M}m). Move outdoors, wait for a signal, or bypass.</span>
                </div>
              </div>
              <div className="kem-clock-actions" style={{ display: "flex", gap: 10 }}>
                <Btn kind="soft" size="md" onClick={startClock}>Try again</Btn>
                <Btn kind="primary" size="md" icon={<Icons.Check size={14} sw={2.2}/>} onClick={() => confirmClockIn(true)}>Clock In Anyway</Btn>
              </div>
            </>
          )}

          {status === "gps-error" && (
            <>
              <div className="kem-clock-banner kem-clock-banner--err">
                <Icons.Alert size={18}/>
                <div>
                  <div>GPS location unavailable.</div>
                  <span>Could not determine your location. Please check your browser/phone permissions, or use low-accuracy bypass to clock in.</span>
                </div>
              </div>
              <div className="kem-clock-actions" style={{ display: "flex", gap: 10 }}>
                <Btn kind="soft" size="md" onClick={startClock}>Try again</Btn>
                <Btn kind="primary" size="md" icon={<Icons.Check size={14} sw={2.2}/>} onClick={() => confirmClockIn(true)}>Clock In Anyway</Btn>
              </div>
            </>
          )}

          {status === "clocked" && (
            <>
              <div className="kem-clock-banner kem-clock-banner--ok">
                <Icons.Check size={18} sw={2.2}/>
                <div>
                  <div>Clocked in at <strong className="mono">{clockedAtStr || "—"}</strong></div>
                  <span>
                    {confirmingOut
                      ? "Clocking out records the end of your work day."
                      : <>Have a productive day, {profile?.name?.split(" ")[0]}.</>}
                  </span>
                </div>
              </div>
              <div className="kem-clock-actions" style={{ display: "flex", gap: 10 }}>
                {confirmingOut ? (
                  <>
                    <Btn kind="ghost" size="md" onClick={() => setConfirmingOut(false)}>Cancel</Btn>
                    <Btn kind="mint" size="md" icon={<Icons.Check size={14} sw={2.2}/>} onClick={handleClockOut}>Confirm clock-out</Btn>
                  </>
                ) : (
                  <Btn kind="outline" size="md" onClick={() => setConfirmingOut(true)}>Clock out</Btn>
                )}
              </div>
            </>
          )}

          {status === "clocked_out" && (
            <>
              <div className="kem-clock-banner kem-clock-banner--ok">
                <Icons.Check size={18} sw={2.2}/>
                <div>
                  <div>Day complete — in <strong className="mono">{clockedAtStr || "—"}</strong> · out <strong className="mono">{clockedOutAtStr || "—"}</strong></div>
                  <span>{workedHours != null ? <><strong className="mono">{workedHours}h</strong> logged today. </> : null}See you tomorrow, {profile?.name?.split(" ")[0]}.</span>
                </div>
              </div>
              <div className="kem-clock-actions">
                <Btn kind="ghost" size="md" onClick={handleClockBackIn}>Clock back in</Btn>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

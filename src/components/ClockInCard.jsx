import { useEffect, useState } from "react";
import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { haversineDistance } from "../utils/geo";
import { WORK_SITE, GEOFENCE_RADIUS_M, GPS_ACCURACY_THRESHOLD_M, calculateAttendanceStatus } from "../constants";
import { todayDate } from "../utils/date";
import { Icons, Btn, Card, Pill } from "./ui";

export default function ClockInCard({ profile, onClockChange }) {
  const today = todayDate();
  const staffId = profile?.uid || profile?.id || "";

  const [status, setStatus] = useState("checking_status"); // checking_status, idle, locating, success, far, low-accuracy, clocked
  const [clockDist, setClockDist] = useState(null);
  const [clockCoords, setClockCoords] = useState(null); // { lat, lng, accuracy }
  const [clockTime, setClockTime] = useState(new Date());
  const [clockInDocId, setClockInDocId] = useState(null);
  const [clockedAtStr, setClockedAtStr] = useState(null);

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
          
          if (docData.clockedOutAt) {
            setStatus("idle");
          } else {
            if (docData.clockedInAt?.toDate) {
              const date = docData.clockedInAt.toDate();
              setClockedAtStr(`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`);
            } else {
              setClockedAtStr("earlier");
            }
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

  const startClock = () => {
    if (!navigator.geolocation) {
      setClockDist(9999);
      setStatus("far");
      return;
    }
    setStatus("locating");
    setClockDist(null);
    setClockCoords(null);
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
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
      },
      (err) => {
        console.error("GPS error:", err);
        setClockDist(9999);
        setStatus("far");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
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

      setClockedAtStr(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
      setStatus("clocked");
      
      if (onClockChange) onClockChange();
    } catch (err) {
      console.error("Error clocking in:", err);
      setStatus("idle");
    }
  };

  const handleClockOut = async () => {
    if (clockInDocId) {
      try {
        setStatus("saving");
        const ref = doc(db, "clock_ins", clockInDocId);
        await setDoc(ref, { clockedOutAt: serverTimestamp() }, { merge: true });
        
        // Mark attendance as clocked out in notes
        const attRef = doc(db, "attendance", `${today}_${staffId}`);
        await setDoc(attRef, {
          note: "GPS clock-in & out",
        }, { merge: true });
        
      } catch (err) {
        console.error("Error clocking out:", err);
      }
    }
    setStatus("idle");
    setClockDist(null);
    setClockCoords(null);
    setClockInDocId(null);
    setClockedAtStr(null);
    
    if (onClockChange) onClockChange();
  };

  if (status === "checking_status") {
    return (
      <Card pad={false} className="kem-clock" style={{ padding: "32px 24px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ color: "var(--ink-4)" }}>Verifying attendance status…</div>
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
                  stroke={status === "far" ? "var(--terra)" : "url(#clk-g)"} strokeWidth="10"
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
              {(status === "locating" || status === "saving") && <><Icons.Crosshair size={26} sw={1.8}/><div className="kem-clock-inner-l">Locating…</div></>}
              {status === "success"      && <><div className="num-xl mono" style={{fontSize:26,color:"var(--mint-deep)"}}>{clockDist}m</div><div className="kem-clock-inner-l">from workshop</div></>}
              {status === "far"          && <><div className="num-xl mono" style={{fontSize:22,color:"var(--terra)"}}>{clockDist && clockDist !== 9999 ? `${(clockDist/1000).toFixed(2)}km` : "—"}</div><div className="kem-clock-inner-l">out of range</div></>}
              {status === "low-accuracy" && <><Icons.Alert size={26} style={{color:"var(--terra)"}}/><div className="kem-clock-inner-l" style={{color:"var(--terra)"}}>Weak GPS</div></>}
              {status === "clocked"      && <><Icons.Check size={28} sw={2.2} style={{color:"var(--mint-deep)"}}/><div className="kem-clock-inner-l">Clocked in</div></>}
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

          {status === "clocked" && (
            <>
              <div className="kem-clock-banner kem-clock-banner--ok">
                <Icons.Check size={18} sw={2.2}/>
                <div>
                  <div>Clocked in at <strong className="mono">{clockedAtStr || "—"}</strong></div>
                  <span>Have a productive day, {profile?.name?.split(" ")[0]}.</span>
                </div>
              </div>
              <div className="kem-clock-actions">
                <Btn kind="outline" size="md" onClick={handleClockOut}>Clock out</Btn>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

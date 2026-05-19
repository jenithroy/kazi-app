import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import { db } from "../firebase";
import { todayDate, startOfWeekDate } from "../utils/date";
import { haversineDistance } from "../utils/geo";
import { WORK_SITE, GEOFENCE_RADIUS_M, GPS_ACCURACY_THRESHOLD_M } from "../constants";
import { Pill, Icons, cn } from "../components/ui";
import { Bars } from "../components/viz";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATUS_OPTIONS = ["Present", "Absent", "Late", "Half-day", "Leave"];

function statusTone(s) {
  switch (s) {
    case "Present":  return "mint";
    case "Late":     return "amber";
    case "Absent":   return "terra";
    case "Leave":    return "blue";
    default:         return "neutral";
  }
}

function getWeekDays(weekStart) {
  const base = new Date(weekStart);
  return DAY_LABELS.map((label, i) => {
    const d = new Date(base); d.setDate(base.getDate() + i);
    return { label, date: d.toISOString().slice(0, 10), day: d.getDate() };
  });
}

function initials(name = "") {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
}

function hueFromName(name = "") {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return h;
}

/* ─── Employee GPS Clock-in Card ──────────────────── */
function ClockInCard({ profile, today, alreadyClockedIn }) {
  // idle | locating | success | outside | denied | error | low-accuracy
  const [status,    setStatus]    = useState(alreadyClockedIn ? "success" : "idle");
  const [clockedAt, setClockedAt] = useState(
    alreadyClockedIn?.clockedInAt?.toDate
      ? `${String(alreadyClockedIn.clockedInAt.toDate().getHours()).padStart(2,"0")}:${String(alreadyClockedIn.clockedInAt.toDate().getMinutes()).padStart(2,"0")}`
      : null
  );

  async function handleClockIn() {
    if (!navigator.geolocation) { setStatus("error"); return; }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;

        // Reject unreliable GPS readings
        if (accuracy > GPS_ACCURACY_THRESHOLD_M) {
          setStatus("low-accuracy");
          return;
        }

        const dist = haversineDistance(latitude, longitude, WORK_SITE.lat, WORK_SITE.lng);
        if (dist > GEOFENCE_RADIUS_M) { setStatus("outside"); return; }

        try {
          const staffId = profile?.uid || profile?.id || "";

          // Prevent duplicate clock-ins for the same day
          const existing = await getDocs(query(
            collection(db, "clock_ins"),
            where("staffId", "==", staffId),
            where("date", "==", today)
          ));
          if (!existing.empty) {
            const prev = existing.docs[0].data();
            setClockedAt(
              prev.clockedInAt?.toDate
                ? `${String(prev.clockedInAt.toDate().getHours()).padStart(2,"0")}:${String(prev.clockedInAt.toDate().getMinutes()).padStart(2,"0")}`
                : "earlier"
            );
            setStatus("success");
            return;
          }

          await addDoc(collection(db, "clock_ins"), {
            staffId,
            staffName: profile?.name || "Unknown",
            role: profile?.jobRole || profile?.role || "",
            date: today, lat: latitude, lng: longitude,
            accuracyM: Math.round(accuracy),
            distanceToSiteM: Math.round(dist),
            clockedInAt: serverTimestamp(),
          });

          // Auto-sync: also create/update an attendance record as "Present" (or "Late" if after 10 AM)
          const hour = new Date().getHours();
          const autoStatus = hour >= 10 ? "Late" : "Present";
          const attRef = doc(db, "attendance", `${today}_${staffId}`);
          await setDoc(attRef, {
            date: today,
            staffId,
            staffName: profile?.name || "Unknown",
            role: profile?.jobRole || profile?.role || "",
            status: autoStatus,
            hours: 8,
            note: "GPS clock-in",
            loggedBy: "GPS",
            createdAt: serverTimestamp(),
          }, { merge: true });

          const now = new Date();
          setClockedAt(`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`);
          setStatus("success");
        } catch { setStatus("error"); }
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  return (
    <div className="kazi-card" style={{ padding: "32px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
      {/* animated ring */}
      <div style={{ position: "relative", width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {status === "locating" && (
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid var(--mint-2)", animation: "ring-expand 1.2s ease-out infinite" }} />
        )}
        <div style={{
          width: 64, height: 64, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          background: status === "success" ? "var(--mint-soft)" : status === "outside" || status === "error" || status === "denied" || status === "low-accuracy" ? "var(--terra-soft)" : "var(--bg-2)",
          border: `2px solid ${status === "success" ? "var(--mint-2)" : status === "outside" || status === "error" || status === "low-accuracy" ? "var(--terra)" : "var(--line-strong)"}`,
          transition: "all .3s",
        }}>
          {status === "success" && <Icons.Check size={26} sw={2.5} style={{ color: "var(--mint-deep)" }} />}
          {(status === "outside" || status === "error" || status === "denied" || status === "low-accuracy") && <Icons.Alert size={24} style={{ color: "var(--terra)" }} />}
          {(status === "idle" || status === "locating") && <Icons.MapPin size={24} style={{ color: "var(--ink-3)" }} />}
        </div>
      </div>

      <div>
        <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 600 }}>GPS Clock-In</h3>
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>
          {status === "idle"         && `Must be within ${GEOFENCE_RADIUS_M}m of ${WORK_SITE.name}`}
          {status === "locating"     && "Acquiring GPS signal…"}
          {status === "success"      && `Clocked in at ${clockedAt} · verified`}
          {status === "outside"      && `You're outside the geofence — move closer to the office`}
          {status === "denied"       && "Location access denied — enable GPS in browser settings"}
          {status === "error"        && "Could not get location — check device GPS and retry"}
          {status === "low-accuracy" && `GPS signal too weak (>${GPS_ACCURACY_THRESHOLD_M}m) — try again outdoors`}
        </p>
      </div>

      <button
        className="primary-button"
        onClick={handleClockIn}
        disabled={status === "locating" || status === "success"}
        style={{ padding: "12px 40px", fontSize: 14 }}
      >
        {status === "locating" ? "Locating…" : status === "success" ? "✓ Clocked In" : "Clock In Now"}
      </button>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────── */
function Attendance() {
  const { profile } = useAuth();
  const canEdit  = sectionCanEdit(profile, "attendance");
  const isEmployee = profile?.role === "employee";

  const today     = todayDate();
  const weekStart = startOfWeekDate();
  const weekDays  = useMemo(() => getWeekDays(weekStart), [weekStart]);

  const [rows,       setRows]       = useState([]);
  const [saving,     setSaving]     = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [message,    setMessage]    = useState("");
  const [weekCounts, setWeekCounts] = useState([0,0,0,0,0,0,0]);
  const [clockIns,   setClockIns]   = useState([]);   // today's clock_ins docs
  const [editingRow, setEditingRow] = useState(null);

  useEffect(() => { loadAll().catch(console.error); }, []);

  async function loadAll() {
    setLoading(true);
    const weekEnd = weekDays[6].date;
    const [usersSnap, weekSnap, todayAttSnap, clockSnap] = await Promise.all([
      getDocs(query(collection(db, "users"), where("role", "in", ["nepal_admin","employee"]))),
      getDocs(query(collection(db, "attendance"), where("date", ">=", weekStart), where("date", "<=", weekEnd))),
      getDocs(query(collection(db, "attendance"), where("date", "==", today))),
      getDocs(query(collection(db, "clock_ins"),  where("date", "==", today))),
    ]);

    const staff   = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const weekRec = weekSnap.docs.map(d => d.data());

    setWeekCounts(weekDays.map(({ date }) =>
      weekRec.filter(r => r.date === date && ["Present","Late","Half-day"].includes(r.status)).length
    ));

    setClockIns(clockSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    const todayRec = todayAttSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Always show every staff member — use their saved status if it exists, otherwise default to Absent
    const attMap = Object.fromEntries(todayRec.map(r => [r.staffId, r]));
    setRows(staff.map(m => {
      const rec = attMap[m.uid || m.id];
      return {
        id:        rec?.id        || "",
        staffId:   m.uid          || m.id,
        staffName: m.name,
        role:      m.jobRole      || m.role,
        status:    rec?.status    || "Absent",
        hours:     rec?.hours     ?? 8,
        note:      rec?.note      || "",
      };
    }));
    setLoading(false);
  }

  async function saveRows() {
    if (!canEdit) return;
    setSaving(true); setMessage("");
    try {
      const batch = writeBatch(db);
      rows.forEach(row => {
        const ref = doc(db, "attendance", row.id || `${today}_${row.staffId}`);
        batch.set(ref, { date: today, staffId: row.staffId, staffName: row.staffName, role: row.role, status: row.status, hours: Number(row.hours || 0), note: row.note, loggedBy: profile?.name || "Unknown", createdAt: serverTimestamp() }, { merge: true });
      });
      await batch.commit();
      setMessage("Attendance saved.");
      await loadAll();
    } catch { setMessage("Could not save."); }
    finally { setSaving(false); }
  }

  const weekLabels = weekDays.map(({ label, day }) => `${label} ${day}`);
  const myClockIn  = clockIns.find(c => c.staffId === (profile?.uid || profile?.id));
  const myRow      = rows.find(r => r.staffId === (profile?.uid || profile?.id));

  /* ─── Employee view ─────────────────────────────── */
  if (isEmployee) {
    return (
      <AppLayout>
        <div className="kscr fade-in">
          <div className="kph">
            <div><h2>Attendance</h2><p>Your daily log · {new Date(today).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</p></div>
          </div>

          <ClockInCard profile={profile} today={today} alreadyClockedIn={myClockIn || null} />

          {/* My status today */}
          {myRow && (
            <div className="kazi-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: `oklch(55% .16 ${hueFromName(myRow.staffName)})`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{initials(myRow.staffName)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{myRow.staffName}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{myRow.role}</div>
              </div>
              <Pill tone={statusTone(myRow.status)} dot>{myRow.status}</Pill>
              {myClockIn && <span style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--mono)" }}>{myClockIn.clockedInAt?.toDate ? myClockIn.clockedInAt.toDate().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "—"}</span>}
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  /* ─── Admin view ────────────────────────────────── */
  const currentMonth = new Date(today).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <AppLayout>
      <div className="kscr fade-in">

        {/* Header */}
        <div className="kph">
          <div><h2>Attendance</h2><p>Daily log · {currentMonth}</p></div>
          <div className="kph-a">
            <button className="ghost-button" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icons.Calendar size={13} /> {currentMonth}
            </button>
            {canEdit && (
              <button className="primary-button" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={saveRows} disabled={saving}>
                <Icons.Plus size={13} sw={2.2} /> {saving ? "Saving…" : "Log manually"}
              </button>
            )}
          </div>
        </div>

        {!canEdit && <p className="banner-warning">UK admin — view only.</p>}
        {message   && <p className="banner-info">{message}</p>}

        {/* This week bar chart */}
        <div className="kazi-card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>This week</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 14 }}>Present count per day</div>
          <Bars data={weekCounts} labels={weekLabels} max={Math.max(...weekCounts, 1) + 1} height={120} color="var(--mint-deep)" />
        </div>

        {/* Staff log today */}
        <div className="kazi-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em" }}>Staff log · today</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>Clock-in times</div>
          </div>
          {loading ? (
            <div style={{ padding: "24px 20px", color: "var(--ink-4)" }}>Loading…</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Status</th>
                    <th>Clock-in</th>
                    <th>Distance</th>
                    <th>Method</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const clockRec = clockIns.find(c => c.staffId === row.staffId);
                    const isEditing = editingRow === i;
                    const clockTime = clockRec?.clockedInAt?.toDate
                      ? clockRec.clockedInAt.toDate().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})
                      : null;
                    const distM = clockRec?.distanceToSiteM;

                    return (
                      <tr key={row.staffId || i}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            <div style={{ width: 30, height: 30, borderRadius: "50%", background: `oklch(55% .16 ${hueFromName(row.staffName)})`, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {initials(row.staffName)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{row.staffName}</div>
                              <div style={{ fontSize: 11, color: "var(--ink-4)" }}>{row.role}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {isEditing && canEdit ? (
                            <select value={row.status} onChange={e => setRows(cur => cur.map((r,j) => j===i ? {...r, status: e.target.value} : r))}
                              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line-strong)", fontSize: 12, fontFamily: "var(--font)" }}>
                              {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                            </select>
                          ) : (
                            <Pill tone={statusTone(row.status)} dot>{row.status}</Pill>
                          )}
                        </td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{clockTime || "—"}</td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink-3)" }}>
                          {distM != null ? `${distM}m` : "—"}
                        </td>
                        <td>
                          {clockTime ? (
                            <Pill tone="ghost" icon={<Icons.MapPin size={11}/>}>GPS</Pill>
                          ) : canEdit && isEditing ? (
                            <span style={{ fontSize: 11, color: "var(--ink-4)", fontStyle: "italic" }}>manual</span>
                          ) : "—"}
                        </td>
                        <td>
                          {canEdit ? (
                            isEditing ? (
                              <div style={{ display: "flex", gap: 6 }}>
                                <button className="ghost-button" style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => { saveRows(); setEditingRow(null); }}>Save</button>
                                <button className="ghost-button" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => setEditingRow(null)}>✕</button>
                              </div>
                            ) : (
                              <button className="ghost-button" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setEditingRow(i)}>Edit</button>
                            )
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </AppLayout>
  );
}

export default Attendance;

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import { db } from "../firebase";
import { todayDate } from "../utils/date";
import { haversineDistance } from "../utils/geo";
import { WORK_SITE, GEOFENCE_RADIUS_M, GPS_ACCURACY_THRESHOLD_M, getEmployeeScheduleForDate, calculateAttendanceStatus, parseLocalDate } from "../constants";
import { Pill, Icons, cn } from "../components/ui";
import ClockInCard from "../components/ClockInCard";

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

function initials(name = "") {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
}

function hueFromName(name = "") {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return h;
}

function toLocalISOString(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}



/* ─── Monthly Calendar View Component ──────────────── */
function MonthCalendar({ currentMonthDate, setCurrentMonthDate, selectedDate, setSelectedDate, monthRecords }) {
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1; // Mon-Sun (Mon is 0 index for us)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const grid = [];
  for (let i = 0; i < offset; i++) grid.push(null);
  for (let i = 1; i <= daysInMonth; i++) {
    grid.push(toLocalISOString(new Date(year, month, i)));
  }

  // Aggregate counts per date
  const counts = {};
  monthRecords.forEach(r => {
    if (!counts[r.date]) counts[r.date] = { present: 0, late: 0, absent: 0, leave: 0 };
    if (r.status === "Present" || r.status === "Half-day") counts[r.date].present++;
    else if (r.status === "Late") counts[r.date].late++;
    else if (r.status === "Absent") counts[r.date].absent++;
    else if (r.status === "Leave") counts[r.date].leave++;
  });

  return (
    <div className="kazi-card" style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{currentMonthDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ghost-button" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setCurrentMonthDate(new Date(year, month - 1, 1))}>← Prev</button>
          <button className="ghost-button" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setCurrentMonthDate(new Date(year, month + 1, 1))}>Next →</button>
        </div>
      </div>
      
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, textAlign: "center", marginBottom: 8 }}>
        {DAY_LABELS.map(d => <div key={d} style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase" }}>{d}</div>)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {grid.map((dateStr, idx) => {
          if (!dateStr) return <div key={`empty-${idx}`} style={{ minHeight: 60, background: "var(--bg)", borderRadius: 8 }} />;
          
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === todayDate();
          const dayNum = parseInt(dateStr.slice(-2), 10);
          const c = counts[dateStr] || { present: 0, late: 0, absent: 0, leave: 0 };
          
          return (
            <button 
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              style={{
                minHeight: 65, padding: "6px", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "space-between", borderRadius: 8,
                background: isSelected ? "var(--mint-soft)" : "var(--bg-2)",
                border: `1.5px solid ${isSelected ? "var(--mint-2)" : isToday ? "var(--line-strong)" : "transparent"}`,
                cursor: "pointer", transition: "all 0.2s"
              }}
            >
              <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? "var(--mint-deep)" : "var(--ink)" }}>{dayNum}</span>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
                {c.present > 0 && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--mint-2)" }} title={`${c.present} Present`} />}
                {c.late > 0 && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--amber-2)" }} title={`${c.late} Late`} />}
                {c.absent > 0 && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--terra-2)" }} title={`${c.absent} Absent`} />}
                {c.leave > 0 && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--blue-2)" }} title={`${c.leave} Leave`} />}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 16, justifyContent: "center", fontSize: 11, color: "var(--ink-4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--mint-2)" }}/> Present</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--amber-2)" }}/> Late</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--terra-2)" }}/> Absent</div>
      </div>
    </div>
  );
}

/* ─── Employee Monthly Report ──────────────────────── */
function SummaryStat({ label, value, color }) {
  return (
    <div style={{ minWidth: 84 }}>
      <div style={{ fontSize: 10.5, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || "var(--ink)" }}>{value}</div>
    </div>
  );
}

function EmployeeMonthReport({ staff, staffId, setStaffId, currentMonthDate, setCurrentMonthDate, monthRecords }) {
  const [monthClockIns, setMonthClockIns] = useState([]);
  const [loadingClocks, setLoadingClocks] = useState(false);

  const year  = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const monthStart = toLocalISOString(new Date(year, month, 1));
  const monthEnd   = toLocalISOString(new Date(year, month + 1, 0));
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  useEffect(() => {
    if (!staffId) { setMonthClockIns([]); return; }
    setLoadingClocks(true);
    getDocs(query(
      collection(db, "clock_ins"),
      where("staffId", "==", staffId),
      where("date", ">=", monthStart),
      where("date", "<=", monthEnd)
    )).then(snap => setMonthClockIns(snap.docs.map(d => d.data())))
      .catch(err => { console.error("Failed to load clock-ins for report:", err); setMonthClockIns([]); })
      .finally(() => setLoadingClocks(false));
  }, [staffId, monthStart, monthEnd]);

  const attByDate = {};
  monthRecords.filter(r => r.staffId === staffId).forEach(r => { attByDate[r.date] = r; });
  const clockByDate = {};
  monthClockIns.forEach(c => { clockByDate[c.date] = c; });

  const days = [];
  for (let i = 1; i <= daysInMonth; i++) days.push(toLocalISOString(new Date(year, month, i)));

  const summary = days.reduce((acc, d) => {
    const att = attByDate[d];
    if (att) {
      if (att.status === "Present" || att.status === "Half-day") acc.present++;
      else if (att.status === "Late") { acc.late++; if (att.lateCutApplied) acc.cuts++; }
      else if (att.status === "Absent") acc.absent++;
      else if (att.status === "Leave") acc.leave++;
      acc.hours += Number(att.hours || 0);
    }
    return acc;
  }, { present: 0, late: 0, absent: 0, leave: 0, cuts: 0, hours: 0 });

  return (
    <div className="kazi-card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={staffId}
            onChange={e => setStaffId(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line-strong)", fontSize: 13, fontFamily: "var(--font)" }}
          >
            <option value="">Select employee…</option>
            {staff.map(s => <option key={s.uid || s.id} value={s.uid || s.id}>{s.name}</option>)}
          </select>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{currentMonthDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ghost-button" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setCurrentMonthDate(new Date(year, month - 1, 1))}>← Prev</button>
          <button className="ghost-button" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setCurrentMonthDate(new Date(year, month + 1, 1))}>Next →</button>
        </div>
      </div>

      {!staffId ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-4)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🗓️</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Select an employee to see their monthly attendance</div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, padding: "14px 20px", borderBottom: "1px solid var(--line)" }}>
            <SummaryStat label="Present"      value={summary.present} color="var(--mint-deep)" />
            <SummaryStat label="Late"         value={summary.late}    color="var(--amber-deep)" />
            <SummaryStat label="Salary cuts"  value={summary.cuts}    color="var(--terra)" />
            <SummaryStat label="Absent"       value={summary.absent}  color="var(--terra)" />
            <SummaryStat label="Leave"        value={summary.leave}   color="var(--blue-2)" />
            <SummaryStat label="Total hours"  value={`${summary.hours}h`} />
          </div>

          {loadingClocks ? (
            <div style={{ padding: "16px 20px" }}>
              {[1,2,3,4,5].map(i => <div key={i} className="kskel kskel-row" />)}
            </div>
          ) : (
            <div className="table-wrap katt-table-wrap">
              <table>
                <thead>
                  <tr><th>Date</th><th>Status</th><th>Clock-in</th><th>Clock-out</th><th>Hours</th><th>Note</th></tr>
                </thead>
                <tbody>
                  {days.map(d => {
                    const att = attByDate[d];
                    const clk = clockByDate[d];
                    const inT  = clk?.clockedInAt?.toDate  ? clk.clockedInAt.toDate().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})  : null;
                    const outT = clk?.clockedOutAt?.toDate ? clk.clockedOutAt.toDate().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : null;
                    const dateLabel = new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
                    return (
                      <tr key={d}>
                        <td style={{ fontSize: 12.5 }}>{dateLabel}</td>
                        <td>
                          {att ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <Pill tone={statusTone(att.status)} dot>{att.status}</Pill>
                              {att.status === "Late" && att.lateCutApplied && (
                                <span style={{ fontSize: 10, background: "var(--terra-soft)", color: "var(--terra)", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>25% Cut</span>
                              )}
                            </div>
                          ) : <span style={{ color: "var(--ink-4)", fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{inT  || "—"}</td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{outT || "—"}</td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink-3)" }}>{att?.hours != null ? `${att.hours}h` : "—"}</td>
                        <td style={{ fontSize: 12, color: "var(--ink-4)" }}>{att?.note || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Main Component ──────────────────────────────── */
function Attendance() {
  const { profile } = useAuth();
  const canEdit  = sectionCanEdit(profile, "attendance");
  const isEmployee = profile?.role === "employee" || profile?.role === "nepal_staff";

  const today = todayDate();
  const [selectedDate, setSelectedDate] = useState(today);
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date(today));

  const [rows,       setRows]       = useState([]);
  const [saving,     setSaving]     = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [message,    setMessage]    = useState("");
  const [clockIns,   setClockIns]   = useState([]);
  const [editingRow, setEditingRow] = useState(null);
  const [monthRecords, setMonthRecords] = useState([]);
  const [confirmPending, setConfirmPending] = useState(null);
  const [staffList,  setStaffList]  = useState([]);
  const [viewMode,   setViewMode]   = useState("daily"); // daily | employee
  const [reportStaffId, setReportStaffId] = useState("");

  useEffect(() => {
    loadAll().catch(err => {
      console.error("Failed to load attendance data:", err);
      setMessage("Could not load attendance data. Please refresh.");
    });
  }, [selectedDate, currentMonthDate]);

  async function loadAll() {
    setLoading(true);
    
    // Calculate month bounds for calendar data
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const monthStart = toLocalISOString(new Date(year, month, 1));
    const monthEnd = toLocalISOString(new Date(year, month + 1, 0));

    const [usersSnap, monthAttSnap, selectedAttSnap, clockSnap] = await Promise.all([
      getDocs(query(collection(db, "users"), where("role", "in", ["nepal_admin","employee","nepal_staff"]))),
      getDocs(query(collection(db, "attendance"), where("date", ">=", monthStart), where("date", "<=", monthEnd))),
      getDocs(query(collection(db, "attendance"), where("date", "==", selectedDate))),
      getDocs(query(collection(db, "clock_ins"),  where("date", "==", selectedDate))),
    ]);

    const staff = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    setStaffList(staff);

    setMonthRecords(monthAttSnap.docs.map(d => d.data()));
    setClockIns(clockSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    const selectedRec = selectedAttSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const attMap = Object.fromEntries(selectedRec.map(r => [r.staffId, r]));
    
    setRows(staff.map(m => {
      const rec = attMap[m.uid || m.id];
      return {
        id:             rec?.id             || "",
        staffId:        m.uid               || m.id,
        staffName:      m.name,
        role:           m.jobRole           || m.role,
        status:         rec?.status         || "Absent",
        hours:          rec?.hours          ?? 8,
        note:           rec?.note           || "",
        lateCutApplied: rec?.lateCutApplied || false,
        lateMinutes:    rec?.lateMinutes    || 0,
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
        const ref = doc(db, "attendance", row.id || `${selectedDate}_${row.staffId}`);
        batch.set(ref, { 
          date: selectedDate, 
          staffId: row.staffId, 
          staffName: row.staffName, 
          role: row.role, 
          status: row.status, 
          hours: Number(row.hours || 0), 
          note: row.note, 
          loggedBy: profile?.name || "Unknown", 
          createdAt: serverTimestamp(),
          lateCutApplied: row.status === "Late" ? (row.lateCutApplied ?? false) : false,
          lateMinutes: row.status === "Late" ? (row.lateMinutes ?? 0) : 0,
        }, { merge: true });
      });
      await batch.commit();
      setMessage("Attendance saved.");
      await loadAll();
    } catch (err) { console.error("Failed to save attendance:", err); setMessage("Could not save attendance. Please check your connection and try again."); }
    finally { setSaving(false); }
  }

  const myClockIn  = clockIns.find(c => c.staffId === (profile?.uid || profile?.id));
  const myRow      = rows.find(r => r.staffId === (profile?.uid || profile?.id));

  /* ─── Employee view ─────────────────────────────── */
  if (isEmployee) {
    return (
        <div className="kscr fade-in">
          <div className="kph">
            <div><h2>Attendance</h2><p>Your daily log · {new Date(today).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</p></div>
          </div>

          <ClockInCard profile={profile} onClockChange={loadAll} />

          {myRow && (
            <div className="kazi-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: `oklch(55% .16 ${hueFromName(myRow.staffName)})`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{initials(myRow.staffName)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{myRow.staffName}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {myRow.role}
                  {(() => {
                    const sched = getEmployeeScheduleForDate(myRow.staffName, parseLocalDate(today));
                    if (!sched) return null;
                    return ` · Schedule: ${sched.start} - ${sched.end}`;
                  })()}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Pill tone={statusTone(myRow.status)} dot>{myRow.status}</Pill>
                {myRow.status === "Late" && myRow.lateCutApplied && (
                  <span style={{ fontSize: 10, background: "var(--terra-soft)", color: "var(--terra)", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>25% Salary Cut</span>
                )}
                {myRow.status === "Late" && !myRow.lateCutApplied && (
                  <span style={{ fontSize: 10, background: "var(--amber-soft)", color: "var(--amber-deep)", padding: "2px 6px", borderRadius: 4, fontWeight: 500 }}>Grace Period</span>
                )}
                {myClockIn && (
                  <span style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--mono)" }}>
                    {myClockIn.clockedInAt?.toDate ? myClockIn.clockedInAt.toDate().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "—"}
                    {myClockIn.clockedOutAt?.toDate ? ` → ${myClockIn.clockedOutAt.toDate().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}` : ""}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
    );
  }

  /* ─── Admin view ────────────────────────────────── */
  const selectedDateStrFormatted = new Date(selectedDate).toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month: "long", year: "numeric" });

  return (
    <>
      <div className="kscr fade-in">
        {/* Header */}
        <div className="kph">
          <div><h2>Attendance</h2><p>Manage daily logs and clock-ins</p></div>
          <div className="kph-a">
            {canEdit && viewMode === "daily" && (
              <button className="primary-button" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={saveRows} disabled={saving}>
                <Icons.Plus size={13} sw={2.2} /> {saving ? "Saving…" : "Save Changes"}
              </button>
            )}
          </div>
        </div>

        {!canEdit && <p className="banner-warning">UK admin — view only.</p>}
        {message   && <p className="banner-info">{message}</p>}

        {profile && ["anushapantaa@gmail.com", "basnetanamol21@gmail.com"].includes(profile.email?.toLowerCase()) && (
          <ClockInCard profile={profile} onClockChange={loadAll} />
        )}

        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <button
            className={viewMode === "daily" ? "primary-button" : "ghost-button"}
            style={{ padding: "6px 14px", fontSize: 12.5 }}
            onClick={() => setViewMode("daily")}
          >
            Daily log
          </button>
          <button
            className={viewMode === "employee" ? "primary-button" : "ghost-button"}
            style={{ padding: "6px 14px", fontSize: 12.5 }}
            onClick={() => setViewMode("employee")}
          >
            Employee report
          </button>
        </div>

        {viewMode === "employee" ? (
          <EmployeeMonthReport
            staff={staffList}
            staffId={reportStaffId}
            setStaffId={setReportStaffId}
            currentMonthDate={currentMonthDate}
            setCurrentMonthDate={setCurrentMonthDate}
            monthRecords={monthRecords}
          />
        ) : (
        <div className="katt-grid">
          {/* Left: Month Calendar */}
          <MonthCalendar
            currentMonthDate={currentMonthDate}
            setCurrentMonthDate={setCurrentMonthDate}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            monthRecords={monthRecords}
          />

          {/* Right: Staff log for selected date */}
          <div className="kazi-card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em" }}>Staff log</div>
              <div style={{ fontSize: 13, color: "var(--ink)", marginTop: 4, fontWeight: 500 }}>{selectedDateStrFormatted}</div>
            </div>
            {loading ? (
              <div style={{ padding: "16px 20px" }}>
                {[1,2,3,4,5].map(i => <div key={i} className="kskel kskel-row" />)}
              </div>
            ) : rows.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-4)" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>No staff records for this date</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Staff will appear here once added to the system</div>
              </div>
            ) : (
              <div className="table-wrap katt-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Schedule</th>
                      <th>Status</th>
                      <th>Clock-in</th>
                      <th>Clock-out</th>
                      <th>Hours</th>
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
                      const clockOutTime = clockRec?.clockedOutAt?.toDate
                        ? clockRec.clockedOutAt.toDate().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})
                        : null;
                      const workedH = clockRec?.clockedInAt?.toDate && clockRec?.clockedOutAt?.toDate
                        ? Math.max(0, Math.round(((clockRec.clockedOutAt.toDate() - clockRec.clockedInAt.toDate()) / 3600000) * 10) / 10)
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
                          <td style={{ fontSize: 12, color: "var(--ink-3)", verticalAlign: "middle" }}>
                            {(() => {
                              const sched = getEmployeeScheduleForDate(row.staffName, parseLocalDate(selectedDate));
                              if (!sched) return "—";
                              return `${sched.start} - ${sched.end}`;
                            })()}
                          </td>
                          <td>
                            {isEditing && canEdit ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <select value={row.status} onChange={e => {
                                  const newStatus = e.target.value;
                                  const oldStatus = row.status;
                                  if (newStatus !== oldStatus && oldStatus === "Late") {
                                    setConfirmPending({ rowIndex: i, oldStatus, newStatus });
                                  } else {
                                    setRows(cur => cur.map((r,j) => j===i ? {
                                      ...r,
                                      status: newStatus,
                                      lateCutApplied: newStatus === "Late" ? r.lateCutApplied : false
                                    } : r));
                                  }
                                }}
                                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line-strong)", fontSize: 12, fontFamily: "var(--font)", width: "100px" }}>
                                  {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                                </select>
                                {row.status === "Late" && (
                                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--terra)", marginTop: 4, cursor: "pointer", fontWeight: 500 }}>
                                    <input type="checkbox" checked={row.lateCutApplied || false} 
                                      onChange={e => setRows(cur => cur.map((r,j) => j===i ? {...r, lateCutApplied: e.target.checked} : r))} />
                                    25% Salary Cut
                                  </label>
                                )}
                              </div>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <Pill tone={statusTone(row.status)} dot>{row.status}</Pill>
                                {row.status === "Late" && row.lateCutApplied && (
                                  <span style={{ fontSize: 10, background: "var(--terra-soft)", color: "var(--terra)", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>25% Cut</span>
                                )}
                                {row.status === "Late" && !row.lateCutApplied && (row.lateMinutes > 0 ? (
                                  <span style={{ fontSize: 10, background: "var(--amber-soft)", color: "var(--amber-deep)", padding: "2px 6px", borderRadius: 4, fontWeight: 500 }} title={`${row.lateMinutes}m late`}>Grace (≤10m)</span>
                                ) : (
                                  <span style={{ fontSize: 10, background: "var(--amber-soft)", color: "var(--amber-deep)", padding: "2px 6px", borderRadius: 4, fontWeight: 500 }}>Grace</span>
                                ))}
                                {row.status === "Late" && row.lateMinutes > 0 && (
                                  <span style={{ fontSize: 10, background: "var(--amber-soft)", color: "var(--amber-deep)", padding: "2px 6px", borderRadius: 4, fontWeight: 500, fontFamily: "var(--mono)" }}>
                                    {row.lateMinutes}m late
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{clockTime || "—"}</td>
                          <td style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{clockOutTime || "—"}</td>
                          <td style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink-3)" }}>
                            {workedH != null ? `${workedH}h` : "—"}
                          </td>
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
        )}

      </div>

      {/* ─── Late-status change confirmation modal ─── */}
      {confirmPending && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div style={{ background: "var(--bg)", borderRadius: 12, padding: "24px 28px", maxWidth: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Change attendance status?</div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 20 }}>
              Changing from <strong>{confirmPending.oldStatus}</strong> → <strong>{confirmPending.newStatus}</strong> will remove the late salary deduction record for this staff member.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="ghost-button" onClick={() => setConfirmPending(null)}>Cancel</button>
              <button style={{ background: "var(--terra)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                onClick={() => {
                  const { rowIndex, newStatus } = confirmPending;
                  setRows(cur => cur.map((r, j) => j === rowIndex ? { ...r, status: newStatus, lateCutApplied: false } : r));
                  setConfirmPending(null);
                }}>
                Yes, change status
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Attendance;

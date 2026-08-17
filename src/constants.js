export const GBP_RATE = 200;

// Was hiding finance_purchases/journal_entries created before a fixed instant (a "soft
// wipe" — no data deleted, just not rendered). Turned off: it was silently hiding real
// transactions (factory setup costs, etc.), not just stale test data. Set to epoch 0 so
// createdAfterCutoff() is effectively a no-op everywhere it's still called.
export const HISTORICAL_DATA_CUTOFF_MS = 0;

export function createdAfterCutoff(data, cutoffMs = HISTORICAL_DATA_CUTOFF_MS) {
  const ts = data?.createdAt;
  // A doc just written with serverTimestamp() reads back as `null` locally until the
  // server round-trip resolves it — that's "created now", not "no timestamp at all".
  if (ts === null) return true;
  const ms = typeof ts?.toMillis === "function" ? ts.toMillis() : (ts?.seconds ? ts.seconds * 1000 : 0);
  return ms > cutoffMs;
}

// ── Geofence ──────────────────────────────────────────────────────────────────
// Update lat/lng to the exact GPS coordinates of the office entrance.
export const WORK_SITE = { lat: 27.681622874006003, lng: 85.33697354663745, name: "Kazi Office, Nepal" };
export const GEOFENCE_RADIUS_M = 100; // metres
export const GPS_ACCURACY_THRESHOLD_M = 500; // reject readings with worse accuracy than this

export const TASK_COLUMNS = ["To Do", "In Progress", "Done", "Blocked"];

export const TASK_CATEGORIES = [
  { label: "Research",      color: "#7C6FCD" },
  { label: "Manufacturing", color: "#2D9B6F" },
  { label: "Hiring",        color: "#E07B39" },
  { label: "Marketing",     color: "#D64E8A" },
  { label: "Finance",       color: "#2980B9" },
  { label: "Operations",    color: "#6D8B3A" },
  { label: "Admin",         color: "#8E8E93" },
  { label: "Other",         color: "#AEAEB2" },
];

export const TEAM_MEMBERS = [
  // UK Admins
  { name: "Finn", role: "Director", location: "uk", email: "finnqrk@gmail.com", appRole: "uk_admin" },
  { name: "Zen", role: "Director", location: "uk", email: "hi.zenuk@gmail.com", appRole: "uk_admin" },
  // Nepal Admins
  { name: "Wilson", role: "Operations Head", location: "nepal", email: "wilsonshah98765@gmail.com", appRole: "nepal_admin" },
  { name: "Anmol", role: "Operations Intern", location: "nepal", email: "Basnetanamol21@gmail.com", appRole: "nepal_staff" },
  { name: "Monika", role: "Marketing Co-ordinator", location: "nepal", email: "bhusal.monika14@gmail.com", appRole: "nepal_staff" },
  { name: "Sunam Deepa", role: "Accountant", location: "nepal", email: "deepasunam581@gmail.com", appRole: "nepal_staff" },
  { name: "Admin", role: "System Admin", location: "nepal", email: "admin@kazi.com", appRole: "super_admin" },
  { name: "Rishav", role: "Developer", location: "nepal", email: "crrishav.business@gmail.com", appRole: "super_admin" },
  // Employees
  { name: "Sarbagya Karki", role: "Content Editor", location: "nepal", email: "sarbagyakarkig8@gmail.com", appRole: "nepal_staff" },
];

export const EMPLOYEE_SCHEDULES = {
  "Wilson": { start: "11:00", end: "21:00" },
  "Monika": { start: "12:30", end: "19:00" },
  "Anmol": { start: "10:30", end: "18:00" },
};

export function getEmployeeScheduleForDate(employeeName, dateObj) {
  if (!employeeName) return null;
  const nameKey = Object.keys(EMPLOYEE_SCHEDULES).find(
    k => k.toLowerCase() === employeeName.toLowerCase()
  );
  if (!nameKey) return null;

  const sched = EMPLOYEE_SCHEDULES[nameKey];
  if (sched.days) {
    const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayName = daysOfWeek[dateObj.getDay()];
    return sched.days[dayName] || null;
  }
  return sched;
}

export function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function calculateAttendanceStatus(employeeName, clockInDate) {
  const sched = getEmployeeScheduleForDate(employeeName, clockInDate);
  if (!sched) {
    const hour = clockInDate.getHours();
    return {
      status: hour >= 10 ? "Late" : "Present",
      lateCutApplied: false,
      lateMinutes: 0
    };
  }

  const [startHour, startMin] = sched.start.split(":").map(Number);
  const scheduledTime = new Date(clockInDate);
  scheduledTime.setHours(startHour, startMin, 0, 0);

  const diffMs = clockInDate.getTime() - scheduledTime.getTime();
  const diffMins = diffMs / (1000 * 60);

  if (diffMins > 10) {
    return {
      status: "Late",
      lateCutApplied: true,
      lateMinutes: Math.round(diffMins)
    };
  } else if (diffMins > 0) {
    return {
      status: "Late",
      lateCutApplied: false,
      lateMinutes: Math.round(diffMins)
    };
  } else {
    return {
      status: "Present",
      lateCutApplied: false,
      lateMinutes: 0
    };
  }
}


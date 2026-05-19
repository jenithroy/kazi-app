export const GBP_RATE = 200;

// ── Geofence ──────────────────────────────────────────────────────────────────
// Update lat/lng to the exact GPS coordinates of the office entrance.
export const WORK_SITE = { lat: 27.687339997894547, lng: 85.2987224234393, name: "Kazi Office, Nepal" };
export const GEOFENCE_RADIUS_M = 100; // metres
export const GPS_ACCURACY_THRESHOLD_M = 150; // reject readings with worse accuracy than this

export const TASK_COLUMNS = ["To Do", "In Progress", "Done", "Blocked"];

export const TEAM_MEMBERS = [
  // UK Admins
  { name: "Fin", role: "Director", location: "uk", email: "fin@kazi.com", appRole: "uk_admin" },
  { name: "Zen", role: "Director", location: "uk", email: "zen@kazi.com", appRole: "uk_admin" },
  // Nepal Admins
  { name: "Wilson", role: "Operations Head", location: "nepal", email: "wilsonshah98765@gmail.com", appRole: "nepal_admin" },
  { name: "Anmol", role: "Operations Intern", location: "nepal", email: "Basnetanamol21@gmail.com", appRole: "nepal_admin" },
  { name: "Admin", role: "System Admin", location: "nepal", email: "admin@kazi.com", appRole: "super_admin" },
  // Employees
  { name: "Monika", role: "Marketing Co-ordinator", location: "nepal", email: "bhusal.monika14@gmail.com", appRole: "employee" },
  { name: "Anusha", role: "Fashion Intern", location: "nepal", email: "anushapantaa@gmail.com", appRole: "employee" },
  { name: "Sudhansu", role: "Operations Assistant", location: "nepal", email: "sa4715666@gmail.com", appRole: "employee" },
  { name: "Bedhant", role: "Management", location: "nepal", email: "bedhant@kazi.com", appRole: "employee" },
];

/**
 * Employees & HR: the rules and the sums, with no React in them. The page, its tiles and its cards draw what these say.
 *
 *   hoursOf      the hours the attendance rules will use for a person: their own, else the built-in table's, else none
 *   weekOf       a person's week as the attendance rules read it, day by day (the card's "week at a glance")
 *   summarise    the four numbers at the top of the page
 *   filterPeople / orderPeople / countPeople    the list
 *   personForm / patchOf / createPayload / formProblem    the card: what is typed, what changed, what is written
 *
 * Two facts shape this file:
 *   - The directory view hides phone, address, pay, bank, PAN and join date (it returns null) from everyone except the person
 *     themselves and staff at tier 2 or above (migration 0029). A null there can mean "hidden", not "empty", so the sums that
 *     use those fields are only drawn for someone who can see them, and a save writes only what was changed (the old form wrote
 *     back everything it had loaded, hidden nulls included).
 *   - `scheduleWorkingDays` unset means every day is a working day in the attendance rules (constants.js), not Sun–Fri.
 */
import { EMPLOYEE_SCHEDULES, WEEKDAYS } from "../constants";

export const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

export const DEPARTMENTS = ["Management", "Operations", "Production", "Finance", "HR", "Marketing", "IT", "Other"];
export const DEFAULT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
export const LOCATIONS = [["nepal", "Nepal"], ["uk", "UK"]];
export const locationLabel = (l) => (l === "uk" ? "UK" : "Nepal");

/** Fields the directory view returns as null to anyone who may not see them (see the top of this file). */
export const PRIVATE_FIELDS = ["phone", "address", "basicSalaryNPR", "bankName", "bankBranch", "bankAccount", "panNumber", "joinDate", "telegramId"];

/** Who may see those fields for `row`: the person themselves, and staff at tier 2 or above (the view's own rule). */
export const seesPrivate = (profile, row) => Boolean(profile) && ((row && row.id === profile.personId) || (profile.tier ?? -1) >= 2);

export const isActive = (e) => e?.status === "Active";
export const hhmm = (t) => (t ? String(t).slice(0, 5) : "");
const clean = (v) => String(v ?? "").trim();

/* ── Working hours ─────────────────────────────────────────────── */

/** The built-in hours for a name, as constants.js looks them up (case-insensitive, no trimming). */
function builtIn(name) {
  const key = Object.keys(EMPLOYEE_SCHEDULES).find((k) => k.toLowerCase() === String(name || "").toLowerCase());
  return key ? EMPLOYEE_SCHEDULES[key] : null;
}

const dayList = (v) => (Array.isArray(v) && v.length ? v : null);                // null: every day counts
const overrides = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const usable = (o) => Boolean(o && (o.start || o.end));

/**
 * A person's own hours, the way the old directory summarised them (same words), for the list and the card.
 * `off` is the days left off and `exceptions` are "Tue 09:30–15:30" lines. Null when start or end is missing.
 * An unset working-days list means every day counts, as in the attendance rules.
 */
export function scheduleSummary(emp) {
  if (!emp.scheduleStart || !emp.scheduleEnd) return null;
  const start = hhmm(emp.scheduleStart);
  const end = hhmm(emp.scheduleEnd);
  const days = dayList(emp.scheduleWorkingDays);
  const off = days ? WEEKDAYS.filter((d) => !days.includes(d)) : [];
  const exceptions = Object.entries(overrides(emp.scheduleDayOverrides))
    .filter(([, v]) => usable(v))
    .sort(([a], [b]) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b))
    .map(([d, v]) => `${d} ${hhmm(v.start) || start}–${hhmm(v.end) || end}`);
  return { time: `${start}–${end}`, off, exceptions, days };
}

/** The short way to say which days a person works: "Sun only", "off Sat", or nothing when every day counts. */
export function daysNote(h) {
  if (!h.days) return "";
  const on = WEEKDAYS.filter((d) => h.days.includes(d));
  if (on.length === 7) return "";
  if (on.length <= 3) return `${on.join(", ")} only`;
  return `off ${WEEKDAYS.filter((d) => !h.days.includes(d)).join(", ")}`;
}

/**
 * What the attendance rules will use for this person:
 *   own      the hours on their record (all of constants.js's lateness checks use these first)
 *   builtin  none on the record, but the built-in table (constants.js) names them
 *   none     neither: anyone arriving at 10:00 or later is marked late
 */
export function hoursOf(emp) {
  const own = scheduleSummary(emp);
  if (own) return { source: "own", ...own };
  const b = builtIn(emp.name);
  if (b && b.start && b.end) return { source: "builtin", time: `${b.start}–${b.end}`, off: [], exceptions: [], days: null };
  return { source: "none", time: "", off: [], exceptions: [], days: null };
}

/**
 * The week as the attendance rules read it (constants.js getEmployeeScheduleForDate), one entry per weekday:
 * { day, state: "none" | "off" | "on" | "exception", start?, end? }. Takes a form or a record: they share field names.
 */
export function weekOf(x) {
  const start = hhmm(x.scheduleStart);
  const end = hhmm(x.scheduleEnd);
  const days = dayList(x.scheduleWorkingDays);
  const ovr = overrides(x.scheduleDayOverrides);
  return WEEKDAYS.map((day) => {
    if (!start || !end) return { day, state: "none" };
    if (days && !days.includes(day)) return { day, state: "off" };
    const o = ovr[day];
    if (usable(o)) return { day, state: "exception", start: hhmm(o.start) || start, end: hhmm(o.end) || end };
    return { day, state: "on", start, end };
  });
}

/**
 * The week the attendance rules will use for this person: their own hours (`weekOf`), else the built-in table's on every day, else
 * nothing. `builtin` is true for the second. Takes a form or a record (they share field names) and the person's name.
 */
export function effectiveWeek(x, name) {
  if (hhmm(x.scheduleStart) && hhmm(x.scheduleEnd)) return { builtin: false, week: weekOf(x) };
  const b = builtIn(name);
  if (b && b.start && b.end) return { builtin: true, week: weekOf({ scheduleStart: b.start, scheduleEnd: b.end }) };
  return { builtin: false, week: weekOf(x) };
}

/* ── The list ──────────────────────────────────────────────────── */

const byName = (a, b) => clean(a.name).localeCompare(clean(b.name), undefined, { sensitivity: "base" });

/** Active people first, then by name. */
export function orderPeople(rows) {
  return rows.slice().sort((a, b) => (isActive(b) - isActive(a)) || byName(a, b));
}

export function countPeople(rows) {
  const active = rows.filter(isActive).length;
  return { active, inactive: rows.length - active, all: rows.length };
}

const haystack = (e) => [e.name, e.role, e.department, e.email, e.phone].map((v) => String(v || "").toLowerCase()).join("\n");

/**
 * status    "active" | "inactive" | "all"
 * focus     "" | "nohours" (no hours of their own or built in) | "prod" (tagged as production workers)
 * location  "" | "nepal" | "uk"
 */
export function filterPeople(rows, { status = "active", focus = "", location = "", query = "" } = {}) {
  const q = clean(query).toLowerCase();
  return rows.filter((e) => {
    if (status === "active" && !isActive(e)) return false;
    if (status === "inactive" && isActive(e)) return false;
    if (focus === "nohours" && hoursOf(e).source !== "none") return false;
    if (focus === "prod" && !e.isProductionWorker) return false;
    if (location && (e.location === "uk" ? "uk" : "nepal") !== location) return false;
    return !q || haystack(e).includes(q);
  });
}

/**
 * The numbers at the top. `pay` is false when the viewer cannot see pay (it is hidden in the view, so a sum of it would read
 * as nothing at all). Only active people are counted, as the old page's payroll total was, except production workers: the labour
 * rate (finance.js labourRatePerUnit) counts everyone who is tagged, whatever their status, so the tile does too (`prodInactive`
 * says how many of them have left).
 */
export function summarise(rows, { pay = true } = {}) {
  const active = rows.filter(isActive);
  const paid = pay ? active.filter((e) => Number(e.basicSalaryNPR) > 0) : [];
  const tagged = rows.filter((e) => e.isProductionWorker);
  return {
    active: active.length,
    inactive: rows.length - active.length,
    nepal: active.filter((e) => e.location !== "uk").length,
    uk: active.filter((e) => e.location === "uk").length,
    basic: paid.reduce((s, e) => s + Number(e.basicSalaryNPR), 0),
    withPay: paid.length,
    noHours: active.filter((e) => hoursOf(e).source === "none").length,
    prod: tagged.length,
    prodInactive: tagged.filter((e) => !isActive(e)).length,
  };
}

/* ── Options for the card's dropdowns ──────────────────────────── */

/** Highest tier first, then by label: the old dropdown's order. */
export function positionOptions(positions) {
  return positions
    .slice()
    .sort((a, b) => (b.tier - a.tier) || String(a.label).localeCompare(String(b.label)))
    .map((p) => ({ value: p.id, label: p.label }));
}

/** Everyone but the person themselves, as the old "Reports to" list had it. */
export function managerOptions(rows, selfId) {
  return [
    { value: "", label: "No manager" },
    ...orderPeople(rows.filter((e) => e.id !== selfId)).map((e) => ({ value: e.id, label: clean(e.name), hint: e.role || undefined })),
  ];
}

/** The department list, with the person's own when it is not one of ours, and a way to say none. */
export function departmentOptions(current) {
  const list = DEPARTMENTS.slice();
  if (current && !list.includes(current)) list.unshift(current);
  return [{ value: "", label: "Not set" }, ...list.map((d) => ({ value: d, label: d }))];
}

/* ── The card: what is typed, what changed, what is written ───── */

const cloneOverrides = (v) => {
  const out = {};
  for (const [d, o] of Object.entries(overrides(v))) if (o && typeof o === "object") out[d] = { start: hhmm(o.start), end: hhmm(o.end) };
  return out;
};

/** The card's form. `row` is null for a new person (the old form's starting values). `today` is the office's date. */
export function personForm(row, today = "") {
  const r = row || {};
  return {
    name: r.name || "",
    positionId: r.positionId || "",
    department: row ? r.department || "" : "Operations",
    email: r.email || "",
    phone: r.phone || "",
    address: r.address || "",
    joinDate: row ? r.joinDate || "" : today,
    location: r.location === "uk" ? "uk" : "nepal",
    status: r.status === "Inactive" ? "Inactive" : "Active",
    reportsTo: r.reportsTo || "",
    isProductionWorker: Boolean(r.isProductionWorker),
    basicSalaryNPR: Number(r.basicSalaryNPR) ? String(Number(r.basicSalaryNPR)) : "",
    panNumber: r.panNumber || "",
    bankName: r.bankName || "",
    bankBranch: r.bankBranch || "",
    bankAccount: r.bankAccount || "",
    scheduleStart: hhmm(r.scheduleStart),
    scheduleEnd: hhmm(r.scheduleEnd),
    scheduleWorkingDays: row ? (Array.isArray(r.scheduleWorkingDays) ? r.scheduleWorkingDays.slice() : null) : DEFAULT_DAYS.slice(),
    scheduleDayOverrides: cloneOverrides(r.scheduleDayOverrides),
  };
}

// to the paisa. The exponent form keeps 100.555 at 10055.5 (so it rounds to 100.56, as the database would) where 100.555 * 100 is 10055.4999…
const paisa = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  const r = Math.round(Number(`${x}e2`));
  return Number.isFinite(r) ? r : Math.round(x * 100);
};
const sameText = (a, b) => clean(a) === clean(b);
const sameTime = (a, b) => hhmm(a) === hhmm(b);
const sameDays = (a, b) => {
  if (a == null || b == null) return a == null && b == null;
  const key = (list) => WEEKDAYS.filter((d) => list.includes(d)).join(",");
  return key(a) === key(b) && a.length === b.length;
};
const sameOverrides = (a, b) => {
  const flat = (o) => WEEKDAYS.filter((d) => o?.[d]).map((d) => `${d}:${hhmm(o[d].start)}-${hhmm(o[d].end)}`).join("|");
  return flat(a) === flat(b);
};

/**
 * Each written field: how two values are compared (so a change is only a change that means something: null and "" are the same
 * phone number) and what is written when it changed (an emptied optional field is stored as null, as the database allows).
 */
const FIELDS = {
  name: { same: sameText, out: clean },
  positionId: { same: sameText, out: clean },
  department: { same: sameText, out: (v) => clean(v) || null },
  email: { same: sameText, out: clean },
  phone: { same: sameText, out: (v) => clean(v) || null },
  address: { same: sameText, out: (v) => clean(v) || null },
  joinDate: { same: sameText, out: (v) => clean(v) || null },
  location: { same: sameText, out: clean },
  status: { same: sameText, out: clean },
  reportsTo: { same: sameText, out: (v) => clean(v) || null },
  isProductionWorker: { same: (a, b) => Boolean(a) === Boolean(b), out: Boolean },
  // the column is numeric(12,2): written to the paisa, so what the database holds is what was written (100.555 would come back as 100.56)
  basicSalaryNPR: { same: (a, b) => paisa(a) === paisa(b), out: (v) => paisa(v) / 100 },
  panNumber: { same: sameText, out: (v) => clean(v) || null },
  bankName: { same: sameText, out: (v) => clean(v) || null },
  bankBranch: { same: sameText, out: (v) => clean(v) || null },
  bankAccount: { same: sameText, out: (v) => clean(v) || null },
  scheduleStart: { same: sameTime, out: (v) => hhmm(v) || null },
  scheduleEnd: { same: sameTime, out: (v) => hhmm(v) || null },
  scheduleWorkingDays: { same: sameDays, out: (v) => v },
  scheduleDayOverrides: { same: sameOverrides, out: cloneOverrides },
};

/** The fields of `now` that differ from `was`, as the values to write. Nothing else: a field somebody else changed meanwhile is not put back. */
export function patchOf(was, now) {
  const patch = {};
  for (const [key, f] of Object.entries(FIELDS)) if (!f.same(was[key], now[key])) patch[key] = f.out(now[key]);
  return patch;
}

/** Every field, for a new person. */
export function createPayload(form) {
  const out = {};
  for (const [key, f] of Object.entries(FIELDS)) out[key] = f.out(form[key]);
  return out;
}

/**
 * Whether what was written is what the database now holds. Row-level security drops a refused update without an error and hands
 * the row back as it was, so a save is only believed once it has been read back. Fields the viewer cannot see are not checked
 * (the view returns null for them whatever was written).
 */
export function sameValue(key, written, held) {
  const f = FIELDS[key];
  return f ? f.same(held, written) : true;
}

/**
 * The first thing wrong with a form, or null. `section` is the card section the field is in. `was` is the form as the card opened,
 * for a person who is being changed (null for a new one): a position or an email that was already empty and was not touched is not
 * a reason to refuse a change to something else, because the save writes only what was changed.
 */
export function formProblem(form, was = null) {
  const email = clean(form.email);
  if (!clean(form.name)) return { message: "Give them a name.", section: "details" };
  if (!clean(form.positionId) && (!was || clean(was.positionId))) return { message: "Choose a position. It decides what they can open.", section: "details" };
  if (!email && (!was || clean(was.email))) return { message: "Add an email. It is what they sign in with.", section: "details" };
  if (email && (!was || !sameText(was.email, email)) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { message: "That email doesn't look right.", section: "details" };
  if (Number(form.basicSalaryNPR) < 0) return { message: "Basic pay can't be less than nothing.", section: "pay" };
  if (Number(form.basicSalaryNPR) >= 1e10) return { message: "That basic pay is more than the database can hold.", section: "pay" };
  return null;
}

/** The friendliest words for a failed write. */
export function writeProblem(err) {
  const text = String(err?.message || err || "");
  if (/people_email_key|duplicate key/i.test(text)) return "Someone on the team already has that email.";
  if (/row-level security|permission denied/i.test(text)) return "The database refused it. You may not have permission to change people.";
  return text || "the database refused it";
}

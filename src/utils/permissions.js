/**
 * Permission checks, backed by the position matrix in Supabase.
 *
 * Nothing here decides anything. The database already did: `my_permissions`
 * and `my_finance_tabs` are views that run app_can_view()/app_can_edit() for
 * whoever is holding the token, and AuthContext loads the answers onto the
 * profile at sign-in. These functions only read that answer back.
 *
 * That matters, because the same policies run again on every query. If the UI
 * ever disagrees with the database the database wins — a button the UI wrongly
 * shows leads to a failed write, never to leaked data. The old model was the
 * other way round: permissions lived in a per-user map that the client wrote
 * to itself, so the UI *was* the enforcement.
 *
 * Access follows from a person's position (director, accountant, video editor,
 * …) via position_permissions. There is no per-person permission editing in the
 * UI any more; change someone's position and their access changes with it.
 */

// The database is the source of truth for section ids. Code has historically
// used a few short names, which `sections.aliases` records; anything not found
// falls through unchanged.
const STATIC_ALIASES = {
  qc: "quality_control",
  "quality-control": "quality_control",
  "order-management": "orders",
  "employees-hr": "employees",
  "admin-panel": "admin",
  "bug-report": "bug_report",
  "bug-reports": "bug_report",
  fabrics: "library",
  patterns: "library",
};

/** Map whatever the caller passed onto a real section id. */
function sectionId(profile, key) {
  if (!key) return "";
  const k = String(key).trim();
  if (profile?.permissions?.[k]) return k;
  return profile?.aliases?.[k] || STATIC_ALIASES[k] || k;
}

/** Finance tab ids are snake_case in the database, camelCase in older code. */
function financeTabId(key) {
  if (!key) return "";
  return String(key)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s&]+/g, "_")
    .toLowerCase();
}

/**
 * Can this person open the section at all?
 * Absence means no — a permission that was never granted is not a permission.
 */
export function sectionVisible(profile, key) {
  if (!profile) return false;
  return profile.permissions?.[sectionId(profile, key)]?.canView === true;
}

/** Can this person change things in the section? */
export function sectionCanEdit(profile, key) {
  if (!profile) return false;
  return profile.permissions?.[sectionId(profile, key)]?.canEdit === true;
}

/**
 * Finance is split into tabs (expenses, payroll, P&L, …) gated separately from
 * the Finance section itself, so an accountant can see payroll without seeing
 * the balance sheet.
 */
export function financeTabAllowed(profile, key) {
  if (!profile) return false;
  return profile.financeTabs?.[financeTabId(key)] === true;
}

/** Editing a finance tab needs both the section and the tab. */
export function financeTabCanEdit(profile, key) {
  return sectionCanEdit(profile, "finance") && financeTabAllowed(profile, key);
}

/** Tab label as shown in Finance.jsx → tab id in the database. */
export const FINANCE_TAB_KEYS = {
  expenses: "expenses",
  payroll: "payroll",
  purchases: "purchases",
  "vat bills": "vat_bills",
  journal: "journal",
  ledger: "ledger",
  "p&l": "pl",
  "balance sheet": "balance_sheet",
  bank: "bank",
  "order p&l": "order_pl",
  kpi: "kpi",
};

/** Every section this person can open, for building the sidebar. */
export function visibleSections(profile) {
  if (!profile?.permissions) return [];
  return Object.entries(profile.permissions)
    .filter(([, p]) => p.canView)
    .map(([id]) => id);
}

/**
 * Seniority, 0 (labour) to 4 (developer/system admin), straight off the
 * person's position. Use it for "directors and above" style checks rather than
 * testing for a named position.
 */
export function tier(profile) {
  return Number.isFinite(profile?.tier) ? profile.tier : -1;
}

export const isDirector = (profile) => tier(profile) >= 3;
export const isSystemAdmin = (profile) => tier(profile) >= 4;

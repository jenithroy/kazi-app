/**
 * Role-based access control, ported from the reference app's
 * `src/utils/permissions.js` (`sectionVisible` / `sectionCanEdit` /
 * `financeTabAllowed` + `NAV_BY_ROLE` + `DEFAULT_NEPAL_ADMIN_PERMISSIONS`).
 *
 * Mock-era: the profile comes from `mock-auth` (role derived from the email,
 * plus a dev role switcher). When real auth lands, only the profile
 * *source* changes — every function below stays as-is.
 *
 * Per-user overrides (`profile.permissions`, shape mirrors the live
 * `users/{uid}.permissions`) beat the role default:
 *   - `permissions[section] === true  ` → force-visible + editable
 *   - `permissions[section] === false ` → force-hidden
 *   - `permissions.finance === { expenses: true, ... }` → per-tab Finance gate
 */

import { isAtLeast, ROLE_RANK, type Role } from './roles';

/** One entry per real module/route (the More hub + the 4 tabs). */
export type SectionId =
  | 'dashboard'
  | 'tasks'
  | 'inventory'
  // The product library — fabrics & trims, processes, tech packs. A grant of
  // its own in Postgres (`sections.library`), separate from `inventory`: the
  // two coordinator positions may read the library and not touch it, and the
  // RLS on `fabrics` / `processes` / `patterns` reads THIS section, so the
  // Inventory screen has to gate its library editors on it rather than on the
  // stock grant beside them.
  | 'library'
  | 'finance'
  | 'sales'
  | 'order-management'
  | 'customers'
  | 'billing'
  | 'purchases'
  | 'production'
  | 'accounting'
  | 'budget-requirements'
  | 'employees-hr'
  | 'attendance'
  | 'marketing'
  // Chat. The id stays `messenger`: it is the primary key of `sections` in
  // Postgres and the join key in `position_permissions` — only the label moved.
  | 'messenger'
  | 'admin-panel'
  | 'changelog'
  | 'bug-report'
  // Usage & Activity — who's using the ERP, how much, and for what. Postgres
  // section id is `usage_analytics`; off for everyone except tier-4 roles by
  // default (the reference app's own default), granted from there on.
  | 'usage';

/**
 * The Finance sub-tabs, each gated individually (reference `financeTabAllowed`).
 *
 * `payroll` is one of them in the database even though mobile renders it inside
 * Employees rather than Finance — the permission is the same row either way, so
 * the gate reads it from the same place the web app does.
 */
export type FinanceTabId =
  | 'expenses'
  | 'payroll'
  | 'purchases'
  | 'vat-bills'
  | 'journal'
  | 'ledger'
  | 'pnl'
  | 'balance-sheet'
  | 'bank'
  | 'order-pnl'
  | 'kpi'
  | 'day-book';

export const FINANCE_TABS: FinanceTabId[] = [
  'expenses', 'payroll', 'purchases', 'vat-bills', 'journal', 'ledger',
  'pnl', 'balance-sheet', 'bank', 'order-pnl', 'kpi', 'day-book',
];

/**
 * Messenger's own sub-tabs — today just Leads, split off from the wider
 * `messenger` section (reference migration `0033_leads_permission.sql`, mirrored
 * from `jenithroy/kazi-app`). Unlike Finance's tabs, view and edit are both
 * genuinely distinct grants here: reading a customer's DMs and replying to them
 * as the business are not the same level of trust.
 */
export type MessengerTabId = 'leads';

export interface MessengerTabGrant {
  canView: boolean;
  canEdit: boolean;
}

export type PermissionOverrides = Partial<Record<Exclude<SectionId, 'finance'>, boolean>> & {
  /** `finance` alone can also be a per-sub-tab map. */
  finance?: boolean | Partial<Record<FinanceTabId, boolean>>;
  messengerTabs?: Partial<Record<MessengerTabId, MessengerTabGrant>>;
  /**
   * `my_permissions.can_edit`, kept in its own map because view and edit are
   * separate grants: several positions may read Customers, Inventory or
   * Production and not write to them, and the map above only says what is
   * *visible*.
   */
  canEdit?: Partial<Record<SectionId, boolean>>;
};

export interface Profile {
  email: string;
  name: string;
  initials: string;
  role: Role;
  /** Free-text job title (reference `jobRole`), display-only. */
  jobRole?: string;
  /** `positions.id` in Postgres. Absent under mock-auth. */
  positionId?: string;
  /** `people.id` in Postgres. Absent under mock-auth, where chat falls back to its mock. */
  personId?: string;
  permissions?: PermissionOverrides;
  /** Supabase Auth user id — present on the real-auth path only. */
  uid?: string;
  /** Operating location (`nepal` / `uk`), display-only. */
  location?: 'nepal' | 'uk';
  /** `employees.status`; `Inactive` blocks access to the app. */
  status?: 'Active' | 'Inactive';
  /** AD ISO string — account creation date, shown on the Account screen. */
  createdAt?: string;
}

export const ALL_SECTIONS: SectionId[] = [
  'dashboard', 'tasks', 'inventory', 'library', 'finance', 'sales', 'order-management', 'customers', 'billing',
  'purchases', 'production', 'accounting', 'budget-requirements',
  'employees-hr', 'attendance', 'marketing', 'messenger', 'admin-panel', 'changelog',
  'bug-report', 'usage',
];

/** Default nav per role (reference `NAV_BY_ROLE`). Overrides can still add/remove entries. */
export const NAV_BY_ROLE: Record<Role, SectionId[]> = {
  super_admin: ALL_SECTIONS,
  uk_admin: ALL_SECTIONS.filter((s) => s !== 'admin-panel'),
  nepal_admin: [
    'dashboard', 'tasks', 'inventory', 'library', 'finance', 'sales', 'order-management', 'customers', 'billing',
    'purchases', 'production', 'accounting', 'budget-requirements',
    'employees-hr', 'attendance', 'marketing', 'messenger', 'changelog', 'bug-report',
  ],
  nepal_staff: [
    'dashboard', 'tasks', 'inventory', 'library', 'production',
    'budget-requirements', 'attendance', 'marketing', 'messenger',
    'customers', 'sales', 'order-management', 'changelog', 'bug-report',
  ],
  employee: ['dashboard', 'tasks', 'attendance', 'messenger', 'budget-requirements', 'changelog', 'bug-report'],
};

/** Sections each role may edit (not just view). `'*'` = everything it can see. */
const EDIT_BY_ROLE: Record<Role, SectionId[] | '*'> = {
  super_admin: '*',
  uk_admin: '*',
  nepal_admin: '*',
  nepal_staff: ['tasks', 'attendance', 'messenger', 'production', 'inventory', 'library', 'budget-requirements', 'marketing', 'order-management', 'bug-report'],
  employee: ['tasks', 'attendance', 'messenger', 'budget-requirements', 'bug-report'],
};

/**
 * The finance-heavy default the reference ships for the "accountant" persona
 * (a `nepal_admin` with these overrides on top of the general Nepal-admin nav).
 */
export const DEFAULT_NEPAL_ADMIN_PERMISSIONS: PermissionOverrides = {
  finance: { expenses: true, payroll: true, purchases: true, 'vat-bills': true, journal: true, ledger: true, pnl: true, 'balance-sheet': true, bank: true, 'order-pnl': true, kpi: true },
  billing: true,
  accounting: true,
  purchases: true,
  customers: true,
  'budget-requirements': true,
};

// ---- Resolvers ----

/** Is this section shown in the nav for this profile? */
export function sectionVisible(profile: Profile | null, id: SectionId): boolean {
  if (!profile) return false;
  const override = profile.permissions?.[id];
  if (override === true) return true;
  if (override === false) return false;
  if (id === 'finance' && profile.permissions?.finance && typeof profile.permissions.finance === 'object') {
    return Object.values(profile.permissions.finance).some(Boolean);
  }
  return NAV_BY_ROLE[profile.role].includes(id);
}

/** May this profile create / edit / delete inside this section? */
export function sectionCanEdit(profile: Profile | null, id: SectionId): boolean {
  if (!profile || !sectionVisible(profile, id)) return false;
  const granted = profile.permissions?.canEdit?.[id];
  if (granted !== undefined) return granted;
  if (profile.permissions?.[id] === true) return true;
  const editable = EDIT_BY_ROLE[profile.role];
  return editable === '*' || editable.includes(id);
}

/** Is this one Finance sub-tab available to this profile? */
export function financeTabAllowed(profile: Profile | null, tab: FinanceTabId): boolean {
  if (!profile || !sectionVisible(profile, 'finance')) return false;
  const fin = profile.permissions?.finance;
  if (fin && typeof fin === 'object') return !!fin[tab];
  if (fin === true) return true;
  // No explicit finance override: Nepal-admin-and-up see every tab, others none.
  return isAtLeast(profile.role, 'nepal_admin');
}

/**
 * May this profile see payroll — salaries, deductions, slips?
 *
 * The `payroll` permission lives with the Finance tabs in Postgres, but the
 * screen it gates on mobile is Employees, so this deliberately does *not* go
 * through `financeTabAllowed` (which additionally demands the Finance section).
 * With no explicit grant it falls back to role: Nepal admin and above.
 */
export function payrollVisible(profile: Profile | null): boolean {
  if (!profile) return false;
  const fin = profile.permissions?.finance;
  if (fin && typeof fin === 'object') return !!fin.payroll;
  if (fin === true) return true;
  return isAtLeast(profile.role, 'nepal_admin');
}

/** Convenience: can this profile approve budget / payroll runs (UK director or above)? */
export function canApprove(profile: Profile | null): boolean {
  return !!profile && ROLE_RANK[profile.role] >= ROLE_RANK.uk_admin;
}

/** `positions.id` for a UK director — Attendance is Nepal-staff self-tracking, and directors never clock in. Not `managing-director`, a separate (currently unheld) position. */
const DIRECTOR_POSITION_ID = 'director';

/** Raw position check, for callers holding an employee/roster record rather than a `Profile`. */
export function isDirectorPosition(positionId: string | null | undefined): boolean {
  return positionId === DIRECTOR_POSITION_ID;
}

/**
 * Is this profile a director? Real auth carries `positionId`; mock auth does
 * not, so it falls back to the coarse `uk_admin` role — the only mock-auth
 * accounts on that role today are the two directors. (A future
 * `managing-director` hire, also UK/tier-3, would also coarse-map to
 * `uk_admin` under mock auth and be mis-flagged here; nobody holds that
 * position yet, so this is a theoretical gap, not a live one.)
 */
export function isDirector(profile: Profile | null): boolean {
  if (!profile) return false;
  if (profile.positionId) return isDirectorPosition(profile.positionId);
  return profile.role === 'uk_admin';
}

/**
 * May this profile read this Messenger tab (Leads)?
 *
 * No role-based fallback, unlike Finance's tabs — the reference migration
 * starts every role locked out except tier-4 super admins, on purpose: Leads
 * is customer-facing, and nobody should inherit it by accident. Mirrors the
 * web app's `messengerTabAllowed()` (`src/utils/permissions.js`) exactly.
 */
export function messengerTabAllowed(profile: Profile | null, tab: MessengerTabId): boolean {
  return profile?.permissions?.messengerTabs?.[tab]?.canView === true;
}

/** May this profile act on this Messenger tab — reply, attach, take over? Mirrors `messengerTabCanEdit()`. */
export function messengerTabCanEdit(profile: Profile | null, tab: MessengerTabId): boolean {
  return sectionCanEdit(profile, 'messenger') && profile?.permissions?.messengerTabs?.[tab]?.canEdit === true;
}

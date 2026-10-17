/**
 * The signed-in person's identity and permissions, read from Postgres.
 *
 * This replaces the app-side permission resolution that used to live in
 * `permissions.ts` (`NAV_BY_ROLE` + per-user overrides + the hardcoded
 * per-email special cases ported from the web app's `AuthContext.jsx`).
 *
 * Those tables are now rows in Supabase — `positions`, `position_permissions`,
 * `position_finance_tabs` — and the same rules are enforced by RLS on every
 * table. What comes back here is therefore only a UI hint: it tells the app
 * which tabs are worth rendering. If it were wrong or tampered with, the
 * database would still refuse the underlying read or write.
 *
 * `me()` resolves the caller's token to a `people` row. `app_person_id()`
 * accepts both a native Supabase uuid `sub` and a legacy Firebase uid, so this
 * works whichever session the app is running on.
 */

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

import type { FinanceTabId, MessengerTabId, PermissionOverrides, SectionId } from './permissions';

/** Canonical section id in Postgres → the mobile app's `SectionId`. */
const SECTION_TO_MOBILE: Record<string, SectionId> = {
  dashboard: 'dashboard',
  tasks: 'tasks',
  attendance: 'attendance',
  production: 'production',
  inventory: 'inventory',
  orders: 'order-management',
  sales: 'sales',
  customers: 'customers',
  billing: 'billing',
  purchases: 'purchases',
  finance: 'finance',
  accounting: 'accounting',
  budget: 'budget-requirements',
  employees: 'employees-hr',
  marketing: 'marketing',
  messenger: 'messenger',
  admin: 'admin-panel',
  changelog: 'changelog',
  bug_report: 'bug-report',
  usage_analytics: 'usage',
  // The product library has no screen of its own on mobile — fabrics & trims,
  // processes and tech packs are tabs inside Inventory, so whether you SEE them
  // follows the `inventory` grant. What the `library` row settles is whether you
  // may edit those rows, which is what its RLS on `fabrics` / `processes` /
  // `patterns` asks. So it is mapped from `can_edit`, not `can_view`, below —
  // the two coordinator positions read the library and may not touch it.
  library: 'library',
  // `content` exists in Postgres for the web app; the mobile app has no screen
  // for it, so it is intentionally dropped, and `quality_control` joined it
  // when the QC module was retired: `qc_logs`
  // held four rows ever — two written by the migration's own seed, and one real
  // inspection saved twice by a double-tap. `directors` joined them in turn when
  // the role register was dropped from mobile — it only ever *read* `positions` /
  // `position_permissions`, which the Admin Panel already shows and can edit.
  // The rows stay in `sections` / `position_permissions` for the web app; mobile
  // just ignores the grant.
  // (`payroll` is a finance *tab*, mapped in TAB_TO_MOBILE below.)
};

/** `messenger_tabs.id` in Postgres → the mobile app's `MessengerTabId`. Just one today. */
const MESSENGER_TAB_TO_MOBILE: Record<string, MessengerTabId> = {
  leads: 'leads',
};

const TAB_TO_MOBILE: Record<string, FinanceTabId> = {
  expenses: 'expenses',
  // Rendered under Employees on mobile, but it is a finance tab in Postgres.
  payroll: 'payroll',
  purchases: 'purchases',
  vat_bills: 'vat-bills',
  journal: 'journal',
  ledger: 'ledger',
  pl: 'pnl',
  balance_sheet: 'balance-sheet',
  bank: 'bank',
  order_pl: 'order-pnl',
  kpi: 'kpi',
  day_book: 'day-book',
};

export interface SupabaseIdentity {
  personId: string;
  fullName: string;
  email: string;
  positionId: string | null;
  positionLabel: string | null;
  tier: number;
  location: 'nepal' | 'uk' | null;
  permissions: PermissionOverrides;
}

interface MeRow {
  person_id: string;
  full_name: string;
  email: string;
  position_id: string | null;
  position_label: string | null;
  tier: number | null;
  location: string | null;
}
interface PermRow { section_id: string; can_view: boolean; can_edit: boolean }
interface TabRow { tab_id: string; can_view: boolean }
interface MessengerTabRow { tab_id: string; can_view: boolean; can_edit: boolean }

/**
 * `ok: true` means the database answered: `identity` is the caller, or null
 * when the token resolves to nobody. `ok: false` means we never got an answer
 * — a network drop, a rejected token — which callers must NOT read as "this
 * person has no access", or a hiccup would sign a valid user out.
 */
export type IdentityResult =
  | { ok: true; identity: SupabaseIdentity | null }
  | { ok: false; error: unknown };

/**
 * Resolve the caller. A signed-in account with no `people` row comes back as
 * `{ ok: true, identity: null }` — that is how a departed staff member keeps a
 * login but loses all access.
 */
export async function fetchIdentityResult(): Promise<IdentityResult> {
  if (!isSupabaseConfigured) return { ok: true, identity: null };
  try {
    const sb = getSupabase();
    const [meRes, permRes, tabRes, messengerTabRes] = await Promise.all([
      sb.rpc('me'),
      sb.from('my_permissions').select('section_id, can_view, can_edit'),
      sb.from('my_finance_tabs').select('tab_id, can_view'),
      sb.from('my_messenger_tabs').select('tab_id, can_view, can_edit'),
    ]);
    // Any one of the four failing has to fail the whole load: losing
    // `my_permissions` alone would drop the explicit `false` grants and let
    // `sectionVisible` fall back to the role default, re-granting sections RLS
    // then refuses on every tap.
    for (const res of [meRes, permRes, tabRes, messengerTabRes]) {
      if (res.error) throw res.error;
    }

    const me = (meRes.data as MeRow[] | null)?.[0];
    if (!me) return { ok: true, identity: null };

    const canEdit: NonNullable<PermissionOverrides['canEdit']> = {};
    const permissions: PermissionOverrides = {};
    for (const row of ((permRes.data ?? []) as PermRow[])) {
      const key = SECTION_TO_MOBILE[row.section_id];
      if (!key || key === 'finance') continue;
      // An explicit `false` matters: `sectionVisible` treats it as final, which
      // is what stops a stale role default from re-granting something.
      // `library` is the one section read off `can_edit` — see the note above.
      permissions[key] = key === 'library' ? row.can_edit : row.can_view;
      canEdit[key] = row.can_edit;
    }
    if (Object.keys(canEdit).length) permissions.canEdit = canEdit;

    const finance: Partial<Record<FinanceTabId, boolean>> = {};
    for (const row of ((tabRes.data ?? []) as TabRow[])) {
      const key = TAB_TO_MOBILE[row.tab_id];
      if (key) finance[key] = row.can_view;
    }
    if (Object.keys(finance).length) permissions.finance = finance;

    const messengerTabs: Partial<Record<MessengerTabId, { canView: boolean; canEdit: boolean }>> = {};
    for (const row of ((messengerTabRes.data ?? []) as MessengerTabRow[])) {
      const key = MESSENGER_TAB_TO_MOBILE[row.tab_id];
      if (key) messengerTabs[key] = { canView: row.can_view, canEdit: row.can_edit };
    }
    if (Object.keys(messengerTabs).length) permissions.messengerTabs = messengerTabs;

    const identity: SupabaseIdentity = {
      personId: me.person_id,
      fullName: me.full_name,
      email: me.email,
      positionId: me.position_id,
      positionLabel: me.position_label,
      tier: me.tier ?? 0,
      location: me.location === 'uk' ? 'uk' : me.location === 'nepal' ? 'nepal' : null,
      permissions,
    };
    return { ok: true, identity };
  } catch (error) {
    return { ok: false, error };
  }
}


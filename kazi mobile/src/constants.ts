import type { ComponentProps } from 'react';
import type { Feather } from '@expo/vector-icons';

type FeatherIconName = ComponentProps<typeof Feather>['name'];

export interface ModuleEntry {
  id: string;
  label: string;
  route: string;
  icon: FeatherIconName;
  /** One-line description shown on the More hub card. */
  blurb: string;
}

// Every module that is not a permanent tab for everyone. Chat is deliberately
// absent: it is the centre button on every layout, so a More card for it would
// be a second door to the same room. The rest are reached from the More hub or
// from a dashboard quick link.
//
// Purchases and Accounting are absent for the same reason Chat is: both live
// *inside* Finance. Purchases is one of its tabs (`finance_tabs.purchases` in
// Postgres, rendered by the shared `PurchasesPane`), and Accounting is the same
// hub in `variant="accounting"` — Finance minus five tabs. Their `/purchases`
// and `/accounting` routes stay alive so notification deep links still resolve;
// they just no longer earn a card of their own. Billing does: it is document
// work (invoices, quotations, challans, payments), a separate `sections` row in
// Postgres, and nobody's Finance tab.
//
// Five of these modules are also somebody's bottom-bar tab, and their `route`
// points at the `/module/...` copy rather than the tab path on purpose: opening
// a module from More or a quick link is a push with a back chevron for
// everyone, instead of silently jumping to the tab for whoever happens to live
// in it. The tab paths (`/production`, `/inventory`, …) stay exactly as they
// were, so the bar and every stored deep link are untouched.
export const MORE_MODULES: ModuleEntry[] = [
  { id: 'sales', label: 'Sales', route: '/sales', icon: 'trending-up', blurb: 'Pipeline overview' },
  { id: 'order-management', label: 'Production', route: '/module/production', icon: 'tool', blurb: 'Order pipeline, stages, priority' },
  { id: 'inventory', label: 'Inventory', route: '/module/inventory', icon: 'package', blurb: 'Stock levels, movements, library' },
  { id: 'customers', label: 'Customers', route: '/customers', icon: 'users', blurb: 'Accounts and contacts' },
  { id: 'billing', label: 'Billing', route: '/module/billing', icon: 'file-text', blurb: 'Invoices, challans, payments' },
  { id: 'finance', label: 'Finance', route: '/module/finance', icon: 'dollar-sign', blurb: 'Expenses, purchases, ledger, P&L' },
  { id: 'budget-requirements', label: 'Budget & Requirements', route: '/budget-requirements', icon: 'briefcase', blurb: 'Requests and approvals' },
  { id: 'employees-hr', label: 'Employees & HR', route: '/employees-hr', icon: 'clipboard', blurb: 'Staff registry, roles' },
  { id: 'attendance', label: 'Attendance', route: '/attendance', icon: 'clock', blurb: 'Daily shift records' },
  { id: 'marketing', label: 'Marketing', route: '/module/marketing', icon: 'send', blurb: 'Campaigns and leads' },
  { id: 'admin-panel', label: 'Admin Panel', route: '/admin-panel', icon: 'shield', blurb: 'Access and roles' },
  { id: 'usage', label: 'Usage & Activity', route: '/usage', icon: 'activity', blurb: 'Who is using the ERP' },
  { id: 'changelog', label: 'Changelog', route: '/changelog', icon: 'list', blurb: "What's new" },
  { id: 'bug-report', label: 'Bug Report', route: '/bug-report', icon: 'alert-triangle', blurb: 'Log an issue you hit' },
];

export const MODULES_BY_ID: Record<string, ModuleEntry> = Object.fromEntries(
  MORE_MODULES.map((m) => [m.id, m]),
);

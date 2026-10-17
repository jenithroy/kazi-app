import type { BugReport, BugStatus, Severity } from './types';

export const SEVERITY_META: Record<Severity, { label: string; dot: string; order: number }> = {
  low: { label: 'Low', dot: '#8A9A92', order: 0 },
  medium: { label: 'Medium', dot: '#B98514', order: 1 },
  high: { label: 'High', dot: '#C4652E', order: 2 },
  critical: { label: 'Critical', dot: '#B23B3B', order: 3 },
};

export const SEVERITY_ORDER: Severity[] = ['low', 'medium', 'high', 'critical'];

/** Status → StatusPill kind (from components/ui/status-pill) + label. */
export const STATUS_META: Record<BugStatus, { label: string; pill: 'draft' | 'at-risk' | 'on-track' | 'shipped' }> = {
  open: { label: 'Open', pill: 'at-risk' },
  'in-progress': { label: 'In progress', pill: 'on-track' },
  resolved: { label: 'Resolved', pill: 'shipped' },
  closed: { label: 'Closed', pill: 'draft' },
};

export const STATUS_ORDER: BugStatus[] = ['open', 'in-progress', 'resolved', 'closed'];

/** Forward status transition offered on the detail sheet (terminal = closed). */
export const NEXT_STATUS: Record<BugStatus, BugStatus | null> = {
  open: 'in-progress',
  'in-progress': 'resolved',
  resolved: 'closed',
  closed: null,
};

export const BUG_AREAS = [
  'Dashboard',
  'Finance',
  'Billing',
  'Inventory',
  'Production',
  'Quality Control',
  'Sales',
  'Attendance',
  'Employees & HR',
  'Chat',
  'Other',
] as const;

/** Gap-free "BUG-0NN" from the current max. */
export function nextBugRef(reports: BugReport[]): string {
  const max = reports.reduce((m, r) => {
    const n = parseInt(r.ref.replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `BUG-${String(max + 1).padStart(3, '0')}`;
}

export const seedBugReports: BugReport[] = [
  {
    id: 'b1',
    ref: 'BUG-001',
    title: 'VAT total rounds up by रु 1 on multi-line invoices',
    area: 'Billing',
    severity: 'high',
    steps: 'Add 3+ lines with odd rates, toggle VAT on. Printed PDF total is रु 1 over the on-screen total.',
    status: 'in-progress',
    reportedBy: 'Sunam Deepa',
    createdAt: '2026-08-24T09:12:00',
    screenshot: true,
  },
  {
    id: 'b2',
    ref: 'BUG-002',
    title: 'Clock-in stays on "locating" when GPS is denied',
    area: 'Attendance',
    severity: 'medium',
    steps: 'Deny location permission, open Attendance, tap Clock in. Spinner never resolves; no "clock in anyway" prompt.',
    status: 'open',
    reportedBy: 'Bishnu Gurung',
    createdAt: '2026-08-26T06:40:00',
    screenshot: false,
  },
  {
    id: 'b3',
    ref: 'BUG-003',
    title: 'Low-stock banner counts discontinued items',
    area: 'Inventory',
    severity: 'low',
    steps: 'Items marked inactive still count toward the "below reorder" KPI on the stock list.',
    status: 'open',
    reportedBy: 'Ritu Shrestha',
    createdAt: '2026-08-27T11:05:00',
    screenshot: false,
  },
  {
    id: 'b4',
    ref: 'BUG-004',
    title: 'Production batch output accepts passed > checked',
    area: 'Production',
    severity: 'critical',
    steps: 'In Log output, enter passed higher than checked. Save succeeds and QC pass-rate shows >100%.',
    status: 'open',
    reportedBy: 'Kamala Thapa',
    createdAt: '2026-08-28T14:22:00',
    screenshot: true,
  },
  {
    id: 'b5',
    ref: 'BUG-005',
    title: 'Chat unread badge lags one message behind',
    area: 'Chat',
    severity: 'low',
    steps: 'Receive a message while on the thread list. Badge only updates after pull-to-refresh.',
    status: 'resolved',
    reportedBy: 'Dan Miller',
    createdAt: '2026-08-21T16:48:00',
    screenshot: false,
  },
  {
    id: 'b6',
    ref: 'BUG-006',
    title: 'Ledger running balance wrong after deleting a journal entry',
    area: 'Finance',
    severity: 'high',
    steps: 'Delete a mid-month journal entry. Cash/Bank running balance below it is not recomputed until reload.',
    status: 'closed',
    reportedBy: 'Sunam Deepa',
    createdAt: '2026-08-18T10:30:00',
    screenshot: false,
  },
];

/**
 * Pure derivations for the three role-based dashboard variants. Each takes the
 * already-fetched module arrays (any of which may be `undefined` while loading
 * or `[]` when a Firestore read was denied) and always returns a fully-formed,
 * zero-filled result — the screen can render immediately and fill in.
 */
import { paid as invoicePaid, balance as invoiceBalance, isOverdue, nprOf, statusFull } from '@/data/billing/utils';
import type { Invoice } from '@/data/billing/types';
import type { Expense } from '@/data/finance/types';
import type { StockItem } from '@/data/inventory/types';
import { STAGES } from '@/data/sales/mock';
import type { Order } from '@/data/sales/types';
import type { Task } from '@/data/tasks/types';
import type { TeamMember } from '@/data/attendance/types';

import type { CalendarEntry } from '@/data/marketing/types';

import type {
  AccountantDashboard,
  AttendanceBreakdown,
  DashKpi,
  DesignerDashboard,
  DirectorDashboard,
  LowStockRow,
  MarketingDashboard,
  MyDayDashboard,
  MyDayTask,
  OpsDashboard,
  StageDatum,
  TaskBoardCounts,
} from './types';

import { moneyCompact } from '@/lib/money';

const thisMonth = (): string => new Date().toISOString().slice(0, 7);

/**
 * "रु 41.2L" above a lakh, plain grouped rupees below it — or the pound
 * equivalent. The hooks that call these selectors keep `moneySignature()` in
 * their `useMemo` deps, so a currency change re-derives the tiles.
 */
const compactNpr = moneyCompact;

function firstName(name: string | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

/** Loose first-name match — mock rosters use first names, real profiles carry a full name. */
function samePerson(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function attendanceBreakdown(roster: TeamMember[] | undefined): {
  breakdown: AttendanceBreakdown;
  onRoll: number;
} {
  const list = roster ?? [];
  const breakdown: AttendanceBreakdown = { present: 0, late: 0, absent: 0, leave: 0 };
  for (const m of list) {
    if (m.status === 'present' || m.status === 'half') breakdown.present += 1;
    else if (m.status === 'late') breakdown.late += 1;
    else if (m.status === 'absent') breakdown.absent += 1;
    else if (m.status === 'leave') breakdown.leave += 1;
  }
  // `off` — nobody's working day — belongs in none of the four cells, so the
  // header counts what the cells actually add up to rather than the whole roster.
  const onRoll = breakdown.present + breakdown.late + breakdown.absent + breakdown.leave;
  return { breakdown, onRoll };
}

function orderStages(orders: Order[] | undefined): { stages: StageDatum[]; activeTotal: number } {
  const active = (orders ?? []).filter((o) => o.status === 'active');
  const stages = STAGES.map((s) => ({
    id: s.id,
    label: s.short,
    count: active.filter((o) => o.stage === s.id).length,
  }));
  return { stages, activeTotal: active.length };
}

function lowStockRows(stock: StockItem[] | undefined): LowStockRow[] {
  return (stock ?? [])
    .filter((i) => i.qty <= i.threshold)
    .map((i) => ({ id: i.id, name: i.name, qty: i.qty, threshold: i.threshold, unit: i.unit }));
}

function financeMTD(expenses: Expense[] | undefined): number {
  const m = thisMonth();
  return (expenses ?? [])
    .filter((e) => (e.date || '').slice(0, 7) === m)
    .reduce((n, e) => n + (e.amountNPR || 0), 0);
}

function taskBoardCounts(tasks: Task[] | undefined): { counts: TaskBoardCounts; openTotal: number } {
  const list = tasks ?? [];
  const counts: TaskBoardCounts = {
    blocked: list.filter((t) => t.status === 'blocked').length,
    progress: list.filter((t) => t.status === 'progress').length,
    inactive: list.filter((t) => t.status === 'inactive').length,
    done: list.filter((t) => t.status === 'done').length,
  };
  return { counts, openTotal: counts.blocked + counts.progress + counts.inactive };
}

// ---- Ops (nepal_admin / super_admin) ---------------------------------------

export function deriveOps(input: {
  orders?: Order[];
  tasks?: Task[];
  roster?: TeamMember[];
  stock?: StockItem[];
  expenses?: Expense[];
  canViewFinance: boolean;
}): OpsDashboard {
  const { breakdown, onRoll } = attendanceBreakdown(input.roster);
  const { stages, activeTotal } = orderStages(input.orders);
  const { counts, openTotal } = taskBoardCounts(input.tasks);
  const low = lowStockRows(input.stock);
  const mtd = financeMTD(input.expenses);

  const kpis: DashKpi[] = [
    {
      id: 'staff-today',
      label: 'Staff in today',
      value: `${breakdown.present + breakdown.late}`,
      route: '/attendance',
      section: 'attendance',
    },
    {
      id: 'active-orders',
      label: 'Active orders',
      value: `${activeTotal}`,
      route: '/production',
      section: 'order-management',
    },
    {
      id: 'open-tasks',
      label: 'Open tasks',
      value: `${openTotal}`,
      delta: counts.blocked ? { tone: 'bad', text: `${counts.blocked} blocked` } : undefined,
      route: '/tasks',
      section: 'tasks',
    },
  ];
  if (input.canViewFinance) {
    kpis.push({
      id: 'finance-mtd',
      label: 'Spend · MTD',
      value: compactNpr(mtd),
      route: '/finance',
      section: 'finance',
    });
  }

  return {
    kpis,
    stages,
    activeOrdersTotal: activeTotal,
    attendance: breakdown,
    attendanceOnRoll: onRoll,
    taskBoard: counts,
    openTasksTotal: openTotal,
    lowStock: low,
    financeMTD: mtd,
  };
}

// ---- Director (uk_admin) -------------------------------------------------------

export function deriveDirector(input: {
  invoices?: Invoice[];
  orders?: Order[];
  roster?: TeamMember[];
}): DirectorDashboard {
  // All-time collected (reference `totalPaidNPR`) — seed/live invoices don't
  // reliably carry an ISO issue date to filter month-to-date on.
  const { paidNPR, outstandingNPR, overdueNPR, counts: invoiceCounts } = invoiceTotals(input.invoices);

  const { stages, activeTotal } = orderStages(input.orders);
  const { breakdown, onRoll } = attendanceBreakdown(input.roster);

  const kpis: DashKpi[] = [
    {
      id: 'revenue-paid',
      label: 'Revenue · collected',
      value: compactNpr(paidNPR),
      route: '/finance',
      section: 'finance',
    },
    {
      id: 'outstanding',
      label: 'Outstanding',
      value: compactNpr(outstandingNPR),
      delta:
        overdueNPR > 0
          ? { tone: 'bad', text: `${compactNpr(overdueNPR)} overdue` }
          : { tone: 'good', text: 'none overdue' },
      route: '/billing',
      section: 'billing',
    },
    {
      id: 'active-orders',
      label: 'Active orders',
      value: `${activeTotal}`,
      route: '/production',
      section: 'order-management',
    },
    {
      id: 'staff-today',
      label: 'Staff in today',
      value: `${breakdown.present + breakdown.late}`,
      route: '/attendance',
      section: 'attendance',
    },
  ];

  return {
    kpis,
    invoices: { paidNPR, outstandingNPR, overdueNPR },
    invoiceCounts,
    stages,
    activeOrdersTotal: activeTotal,
    attendance: breakdown,
    attendanceOnRoll: onRoll,
  };
}

// ---- My day (employee / nepal_staff) ----------------------------------------

export function deriveMyDay(input: {
  tasks?: Task[];
  roster?: TeamMember[];
  expenses?: Expense[];
  myName: string;
  canViewFinance: boolean;
}): MyDayDashboard {
  const me = firstName(input.myName);

  // `tasks.assignee` is a display name, so this now matches the real person
  // rather than a stand-in roster id.
  const mine = (input.tasks ?? []).filter((t) => !!t.assignee && samePerson(firstName(t.assignee), me));
  const myTasks = mine
    .filter((t) => t.status !== 'done')
    .map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, status: t.status }));
  const tasksDone = mine.filter((t) => t.status === 'done').length;

  const rosterMe = (input.roster ?? []).find((m) => samePerson(firstName(m.name), me));
  const month = rosterMe?.month;

  return {
    myTasks,
    myOpenCount: myTasks.length,
    attendanceMonth: {
      present: month?.present ?? 0,
      late: month?.late ?? 0,
      leave: month?.leave ?? 0,
      absent: month?.absent ?? 0,
    },
    tasksDone,
    financeMTD: input.canViewFinance ? financeMTD(input.expenses) : 0,
  };
}

// ---- Accountant -------------------------------------------------------------

/** Invoice money + counts, shared by the Owner and Accountant variants. */
function invoiceTotals(invoices: Invoice[] | undefined) {
  const list = (invoices ?? []).filter((v) => !v.cancelled);
  let paidNPR = 0;
  let outstandingNPR = 0;
  let overdueNPR = 0;
  const counts = { paid: 0, partial: 0, overdue: 0, draft: 0 };

  for (const v of list) {
    paidNPR += nprOf(v, invoicePaid(v));
    outstandingNPR += nprOf(v, invoiceBalance(v));
    if (isOverdue(v)) overdueNPR += nprOf(v, invoiceBalance(v));

    const s = statusFull(v);
    if (s === 'Paid') counts.paid += 1;
    else if (s === 'Partial') counts.partial += 1;
    else if (s === 'Overdue') counts.overdue += 1;
    else if (s === 'Draft') counts.draft += 1;
  }
  return { paidNPR, outstandingNPR, overdueNPR, counts };
}

export function deriveAccountant(input: {
  invoices?: Invoice[];
  expenses?: Expense[];
}): AccountantDashboard {
  const { paidNPR, outstandingNPR, overdueNPR, counts } = invoiceTotals(input.invoices);
  const mtd = financeMTD(input.expenses);

  const kpis: DashKpi[] = [
    {
      id: 'outstanding',
      label: 'Outstanding',
      value: compactNpr(outstandingNPR),
      delta:
        overdueNPR > 0
          ? { tone: 'bad', text: `${compactNpr(overdueNPR)} overdue` }
          : { tone: 'good', text: 'none overdue' },
      route: '/billing',
      section: 'billing',
    },
    {
      id: 'spend-mtd',
      label: 'Spend · MTD',
      value: compactNpr(mtd),
      route: '/finance',
      section: 'finance',
    },
    {
      id: 'revenue-paid',
      label: 'Collected',
      value: compactNpr(paidNPR),
      route: '/finance',
      section: 'finance',
    },
    {
      id: 'unpaid-count',
      label: 'Invoices unpaid',
      value: `${counts.partial + counts.overdue + counts.draft}`,
      delta: counts.overdue ? { tone: 'bad', text: `${counts.overdue} overdue` } : undefined,
      route: '/billing',
      section: 'billing',
    },
  ];

  return {
    kpis,
    invoices: { paidNPR, outstandingNPR, overdueNPR },
    invoiceCounts: counts,
    financeMTD: mtd,
  };
}

// ---- Fashion designer -------------------------------------------------------

/** Open tasks assigned to `myName`, newest-status-first is left to the screen. */
function myOpenTasks(tasks: Task[] | undefined, myName: string): MyDayTask[] {
  const me = firstName(myName);
  return (tasks ?? [])
    .filter((t) => !!t.assignee && samePerson(firstName(t.assignee), me) && t.status !== 'done')
    .map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, status: t.status }));
}

export function deriveDesigner(input: {
  tasks?: Task[];
  orders?: Order[];
  stock?: StockItem[];
  myName: string;
}): DesignerDashboard {
  const mine = myOpenTasks(input.tasks, input.myName);
  const { stages, activeTotal } = orderStages(input.orders);
  const low = lowStockRows(input.stock);

  const kpis: DashKpi[] = [
    { id: 'my-tasks', label: 'Your open tasks', value: `${mine.length}`, route: '/tasks', section: 'tasks' },
    {
      id: 'active-orders',
      label: 'Active orders',
      value: `${activeTotal}`,
      route: '/production',
      section: 'order-management',
    },
    {
      id: 'low-stock',
      label: 'Below reorder',
      value: `${low.length}`,
      delta: low.length ? { tone: 'bad', text: 'needs a PO' } : { tone: 'good', text: 'all stocked' },
      route: '/inventory',
      section: 'inventory',
    },
  ];

  return { kpis, myTasks: mine, myOpenCount: mine.length, stages, activeOrdersTotal: activeTotal, lowStock: low };
}

// ---- Marketing / content ----------------------------------------------------

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function deriveMarketing(input: {
  tasks?: Task[];
  entries?: CalendarEntry[];
  myName: string;
}): MarketingDashboard {
  const mine = myOpenTasks(input.tasks, input.myName);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const month = thisMonth();

  const dated = (input.entries ?? []).map((e) => {
    // `m` is 0-indexed in the calendar store, as `new Date(y, m, d)` expects.
    const when = new Date(e.y, e.m, e.d);
    when.setHours(0, 0, 0, 0);
    return {
      id: e.id,
      title: e.title,
      kind: e.kind as string,
      person: e.person,
      date: `${e.y}-${pad2(e.m + 1)}-${pad2(e.d)}`,
      inDays: Math.round((when.getTime() - today.getTime()) / 86_400_000),
    };
  });

  const upcoming = dated
    .filter((e) => e.inDays >= 0)
    .sort((a, b) => a.inDays - b.inDays)
    .slice(0, 5);

  const kpis: DashKpi[] = [
    {
      id: 'upcoming',
      label: 'Scheduled ahead',
      value: `${dated.filter((e) => e.inDays >= 0).length}`,
      route: '/marketing',
      section: 'marketing',
    },
    {
      id: 'this-month',
      label: 'This month',
      value: `${dated.filter((e) => e.date.slice(0, 7) === month).length}`,
      route: '/marketing',
      section: 'marketing',
    },
    { id: 'my-tasks', label: 'Your open tasks', value: `${mine.length}`, route: '/tasks', section: 'tasks' },
  ];

  return {
    kpis,
    myTasks: mine,
    myOpenCount: mine.length,
    upcoming,
    thisMonthCount: dated.filter((e) => e.date.slice(0, 7) === month).length,
  };
}

/**
 * Per-event rendered copy + deep link. `notify()` runs the event through here
 * to build each notification doc's `title` / `body` / `deepLink`.
 */

import type { SectionId } from '@/auth/permissions';

import type { NotificationEvent } from './types';

const SECTION_ROUTE: Record<SectionId, string> = {
  dashboard: '/',
  tasks: '/tasks',
  inventory: '/inventory',
  // The library lives inside Inventory; it has no route of its own.
  library: '/inventory',
  finance: '/finance',
  sales: '/sales',
  'order-management': '/production',
  customers: '/customers',
  billing: '/billing',
  purchases: '/purchases',
  production: '/production',
  accounting: '/accounting',
  'budget-requirements': '/budget-requirements',
  'employees-hr': '/employees-hr',
  attendance: '/attendance',
  marketing: '/marketing',
  messenger: '/chat',
  'admin-panel': '/admin-panel',
  changelog: '/changelog',
  'bug-report': '/bug-report',
  usage: '/usage',
};

interface Copy {
  title: string;
  body: string;
}

type Describe = (ev: NotificationEvent, actorName: string) => Copy;

const ref = (ev: NotificationEvent) => (ev.targetRef ? ` ${ev.targetRef}` : '');
const p = (ev: NotificationEvent) => (ev.payload ?? {}) as Record<string, unknown>;

const CATALOG: Record<string, Describe> = {
  'task.assigned': (ev, a) => ({ title: `New task${ref(ev)}`, body: `${a} assigned this task to you.` }),
  'task.reassigned': (ev, a) => ({ title: `Task${ref(ev)} reassigned`, body: `${a} changed who this task is assigned to.` }),
  'task.status_changed': (ev, a) => ({ title: `Task${ref(ev)} ${String(p(ev).status ?? 'updated').toLowerCase()}`, body: `${a} moved this task to ${p(ev).status ?? 'a new status'}.` }),
  'task.note_added': (ev, a) => ({ title: `Note on task${ref(ev)}`, body: `${a} added a note.` }),
  'task.due_soon': (ev) => ({ title: `Task${ref(ev)} due soon`, body: 'This task is due within 24 hours.' }),
  'task.overdue': (ev) => ({ title: `Task${ref(ev)} overdue`, body: 'This task has passed its due date.' }),

  'marketing.entry_created': (ev, a) => ({ title: 'New marketing entry', body: `${a} added ${p(ev).label ?? 'an entry'} to the calendar.` }),
  'marketing.entry_updated': (ev, a) => ({ title: 'Marketing calendar updated', body: `${a} changed ${p(ev).label ?? 'an entry'}.` }),
  'marketing.entry_deleted': (ev, a) => ({ title: 'Marketing entry removed', body: `${a} deleted ${p(ev).label ?? 'an entry'}.` }),
  'marketing.pending_approval': (ev, a) => ({ title: 'Marketing content needs approval', body: `${a} submitted ${p(ev).label ?? 'an entry'} for approval.` }),
  'marketing.approved': (ev, a) => ({ title: 'Marketing content approved', body: `${a} approved ${p(ev).label ?? 'your entry'}.` }),
  'marketing.rejected': (ev, a) => ({ title: 'Marketing content rejected', body: `${a} rejected ${p(ev).label ?? 'your entry'}.` }),

  'production.batch_created': (ev, a) => ({ title: `Production batch${ref(ev)} started`, body: `${a} created a new batch.` }),
  'production.output_logged': (ev, a) => ({ title: `Output logged${ref(ev)}`, body: `${a} logged production output.` }),
  'production.batch_blocked': (ev, a) => ({ title: `Batch${ref(ev)} blocked`, body: `${a} flagged this batch as blocked.` }),
  'production.stage_advanced': (ev, a) => ({ title: `Order${ref(ev)} moved stage`, body: `${a} advanced this order to ${p(ev).status ?? 'the next stage'}.` }),

  'order.created': (ev, a) => ({ title: `New order${ref(ev)}`, body: `${a} created this order.` }),
  'order.assigned': (ev, a) => ({ title: `Order${ref(ev)} assigned to you`, body: `${a} assigned this order to you.` }),
  'order.priority_raised': (ev, a) => ({ title: `Order${ref(ev)} priority raised`, body: `${a} set priority to ${p(ev).priority ?? 'high'}.` }),
  'order.stage_changed': (ev, a) => ({ title: `Order${ref(ev)} stage changed`, body: `${a} moved this order to ${p(ev).status ?? 'a new stage'}.` }),
  'order.dispatched': (ev, a) => ({ title: `Order${ref(ev)} dispatched`, body: `${a} marked this order dispatched.` }),
  'order.cancelled': (ev, a) => ({ title: `Order${ref(ev)} cancelled`, body: `${a} cancelled this order.` }),

  'invoice.created': (ev, a) => ({ title: `Invoice${ref(ev)} created`, body: `${a} created a new invoice.` }),
  'invoice.sent': (ev, a) => ({ title: `Invoice${ref(ev)} sent`, body: `${a} sent this invoice to the client.` }),
  'invoice.paid': (ev, a) => ({ title: `Invoice${ref(ev)} paid`, body: `${a} recorded payment on this invoice.` }),
  'invoice.overdue': (ev) => ({ title: `Invoice${ref(ev)} overdue`, body: 'This invoice is past its due date and unpaid.' }),
  'invoice.cancelled': (ev, a) => ({ title: `Invoice${ref(ev)} cancelled`, body: `${a} cancelled this invoice.` }),

  'expense.logged': (ev, a) => ({ title: 'Expense logged', body: `${a} logged an expense${p(ev).label ? ` — ${p(ev).label}` : ''}.` }),
  'purchase.logged': (ev, a) => ({ title: 'Purchase logged', body: `${a} logged a purchase${p(ev).label ? ` — ${p(ev).label}` : ''}.` }),
  'expense.marked_paid': (ev, a) => ({ title: 'Expense marked paid', body: `${a} marked your logged expense as paid.` }),
  'journal.posted': (ev, a) => ({ title: 'Journal entry posted', body: `${a} posted a journal entry.` }),
  'bank.tx_imported': (ev, a) => ({ title: 'Bank transaction added', body: `${a} added a bank transaction.` }),
  'finance.large_amount': (ev, a) => ({ title: 'Large finance entry', body: `${a} logged an entry of NPR ${Number(p(ev).amountNPR ?? 0).toLocaleString('en-IN')}.` }),

  'budget_request.submitted': (ev, a) => ({ title: `Budget request${ref(ev)}`, body: `${a} submitted a request for approval.` }),
  'budget_request.approved': (ev, a) => ({ title: `Request${ref(ev)} approved`, body: `${a} approved your budget request.` }),
  'budget_request.rejected': (ev, a) => ({ title: `Request${ref(ev)} rejected`, body: `${a} rejected your budget request.` }),
  'requirement.added': (ev, a) => ({ title: 'New requirement', body: `${a} added a requirement.` }),

  'purchase_order.created': (ev, a) => ({ title: 'New purchase order', body: `${a} created a purchase order.` }),
  'purchase.received': (ev, a) => ({ title: 'Purchase received', body: `${a} recorded a received purchase — stock updated.` }),

  'inventory.low_stock': (ev) => ({ title: 'Low stock', body: `${p(ev).label ?? 'An item'} is at or below its reorder level.` }),
  'inventory.adjusted': (ev, a) => ({ title: 'Stock adjusted', body: `${a} adjusted stock for ${p(ev).label ?? 'an item'}.` }),
  'inventory.item_added': (ev, a) => ({ title: 'New inventory item', body: `${a} added ${p(ev).label ?? 'an item'}.` }),
  'inventory.library_changed': (ev, a) => ({ title: 'Library updated', body: `${a} changed ${p(ev).label ?? 'a library item'}.` }),

  'attendance.clock_in_flagged': (ev, a) => ({ title: 'Clock-in flagged', body: `${a}'s clock-in was outside the work site or bypassed the geofence.` }),
  'attendance.absent_late': (ev) => ({ title: 'Attendance recorded', body: `You were marked ${p(ev).status ?? 'absent/late'}.` }),
  'payroll.run_finalised': (ev, a) => ({ title: 'Payroll finalised', body: `${a} finalised the ${p(ev).label ?? 'monthly'} payroll run.` }),
  'payroll.needs_approval': (ev, a) => ({ title: 'Payroll needs approval', body: `${a} submitted a payroll run for approval.` }),
  'employee.added': (ev, a) => ({ title: 'New employee', body: `${a} added ${p(ev).label ?? 'an employee'} to the directory.` }),
  'employee.deactivated': (ev, a) => ({ title: 'Employee deactivated', body: `${a} deactivated ${p(ev).label ?? 'an employee'}.` }),
  'employee.login_created': (ev, a) => ({ title: 'App login created', body: `${a} created an app login${p(ev).label ? ` for ${p(ev).label}` : ''}.` }),

  'message.received': (ev, a) => ({ title: `Message from ${a}`, body: String(p(ev).label ?? 'You have a new message.') }),
  // No `a` here on purpose — the "actor" resolved by notify() is whichever
  // staff phone happened to be polling when this fired, not the lead who
  // actually sent the message.
  'lead.message_received': (ev) => ({ title: 'New lead message', body: String(p(ev).label ?? 'A lead sent a new message.') }),

  'permissions.changed': (ev, a) => ({ title: 'Your access changed', body: `${a} updated permissions. Changes apply at your next sign-in.` }),
  'stage_config.changed': (ev, a) => ({ title: 'Production stages updated', body: `${a} changed the stage configuration.` }),

  'bug_report.submitted': (ev, a) => ({ title: `Bug report${ref(ev)}`, body: `${a} reported a bug${p(ev).label ? ` — ${p(ev).label}` : ''}.` }),
  'bug_report.status_changed': (ev, a) => ({ title: `Bug report${ref(ev)} ${String(p(ev).status ?? 'updated').toLowerCase()}`, body: `${a} moved your report to ${p(ev).status ?? 'a new status'}.` }),
};

export function describeEvent(ev: NotificationEvent, actorName: string): Copy {
  const fn = CATALOG[ev.eventType];
  if (fn) return fn(ev, actorName);
  return { title: 'Update', body: `${actorName} made a change${ref(ev)}.` };
}

export function deepLinkFor(ev: NotificationEvent): string | null {
  if (ev.payload?.threadId) return `/chat?thread=${ev.payload.threadId}`;
  // Billing already supports opening a specific invoice by id or ref
  // (billing.tsx's `focus` prop) — every invoice.* event already carries the
  // invoice's ref as targetRef, so this is free precision, no payload change.
  if (ev.section === 'billing' && ev.targetRef) return `/billing?focus=${encodeURIComponent(ev.targetRef)}`;
  return SECTION_ROUTE[ev.section] ?? null;
}

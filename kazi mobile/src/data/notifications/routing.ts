/**
 * Pure recipient routing — no backend, no React. Given an event and the
 * recipient roster, decide who gets notified and with what urgency. This is the
 * piece that stays identical when the source modules move from mock to
 * Postgres; only the callers of `notify()` change.
 *
 * See the plan / FRONTEND_GAP_PLAN for the full event→recipient matrix.
 */

import { sectionCanEdit, sectionVisible, type Profile, type SectionId } from '@/auth/permissions';
import type { Role } from '@/auth/roles';

import type { NotifActor, NotifType, NotificationEvent, ResolvedRecipient, RosterMember } from './types';

type Predicate = (member: RosterMember, ev: NotificationEvent, roster: RosterMember[]) => boolean;

interface Rule {
  type: NotifType;
  reason: string;
  when: Predicate;
  /**
   * Which admin-toggleable category (`src/data/notifications/categories.ts`)
   * this rule belongs to, if any. Only ever set on a "broadcast" rule — one
   * that fires because of a role/position/section grant, not because this
   * specific person is the assignee/creator/participant/mentioned. Those
   * personal rules are never gated by anything an admin can switch off; they
   * have no `category`.
   */
  category?: string;
}

const TYPE_RANK: Record<NotifType, number> = { info: 0, mention: 1, action: 2 };

function asProfile(m: RosterMember): Profile {
  return { email: m.email, name: m.name, initials: '', role: m.role };
}

function samePerson(m: RosterMember, who: string | null | undefined): boolean {
  if (!who) return false;
  const w = who.trim().toLowerCase();
  if (!w) return false;
  return m.email.toLowerCase() === w || m.name.trim().toLowerCase() === w;
}

// ---- predicate builders -------------------------------------------------------

const ROLE = (...roles: Role[]): Predicate => (m) => roles.includes(m.role);
/** Roster member holds one of these `positions.id` values — precise where `ROLE` is too coarse (e.g. "the Operations Head" specifically, not every Nepal admin). */
const POSITION = (...ids: string[]): Predicate => (m) => !!m.positionId && ids.includes(m.positionId);
const VIEW = (section: SectionId): Predicate => (m) => sectionVisible(asProfile(m), section);
const EDIT = (section: SectionId): Predicate => (m) => sectionCanEdit(asProfile(m), section);
const APPROVER: Predicate = (m) => m.role === 'uk_admin' || m.role === 'super_admin';
const LOC = (loc: 'nepal' | 'uk'): Predicate => (m) => m.location === loc;
const LEADS_ACCESS: Predicate = (m) => !!m.leadsAccess;

/** Roster member matches `payload[field]` by name or email. */
const ID = (field: string): Predicate => (m, ev) => samePerson(m, (ev.payload as Record<string, unknown>)?.[field] as string);

/** Roster member appears in the string[] at `payload[field]`. */
const IN_LIST = (field: string): Predicate => (m, ev) => {
  const list = (ev.payload as Record<string, unknown>)?.[field];
  return Array.isArray(list) && list.some((n) => samePerson(m, String(n)));
};

const and = (...ps: Predicate[]): Predicate => (m, ev, r) => ps.every((p) => p(m, ev, r));

// ---- the matrix -------------------------------------------------------------

const RULES: Record<string, Rule[]> = {
  // Tasks — always the assignee, never admin-toggleable (there's no "role"
  // this belongs to, only "you're the one holding it").
  'task.assigned': [{ type: 'action', reason: 'This task was assigned to you', when: ID('assignee') }],
  'task.reassigned': [{ type: 'action', reason: 'This task was assigned to you', when: ID('assignee') }],
  'task.status_changed': [{ type: 'info', reason: "You're assigned to this task", when: ID('assignee') }],
  'task.note_added': [{ type: 'info', reason: "You're assigned to this task", when: ID('assignee') }],
  'task.due_soon': [{ type: 'action', reason: "You're assigned to this task", when: ID('assignee') }],
  'task.overdue': [{ type: 'action', reason: "You're assigned to this task", when: ID('assignee') }],

  // Marketing
  'marketing.entry_created': [
    { type: 'info', reason: 'You work in Marketing', when: POSITION('marketing-coordinator', 'content-coordinator'), category: 'marketing' },
  ],
  'marketing.entry_updated': [
    { type: 'info', reason: 'You work in Marketing', when: POSITION('marketing-coordinator', 'content-coordinator'), category: 'marketing' },
    { type: 'info', reason: 'You created this entry', when: ID('createdBy') },
  ],
  'marketing.entry_deleted': [
    { type: 'info', reason: 'You work in Marketing', when: POSITION('marketing-coordinator', 'content-coordinator'), category: 'marketing' },
    { type: 'info', reason: 'You created this entry', when: ID('createdBy') },
  ],
  'marketing.pending_approval': [{ type: 'action', reason: 'You approve marketing content', when: APPROVER }],
  'marketing.approved': [{ type: 'action', reason: 'You submitted this entry', when: ID('createdBy') }],
  'marketing.rejected': [{ type: 'action', reason: 'You submitted this entry', when: ID('createdBy') }],

  // Production (routing defined, not currently fired by any mutation hook)
  'production.batch_created': [
    { type: 'info', reason: 'You work in Production', when: and(VIEW('production'), LOC('nepal')) },
  ],
  'production.output_logged': [
    { type: 'info', reason: 'You work in Production', when: and(VIEW('production'), LOC('nepal')) },
  ],
  'production.batch_blocked': [
    { type: 'action', reason: 'You manage Nepal operations', when: ROLE('nepal_admin', 'super_admin') },
    { type: 'action', reason: "You're on this production stage", when: IN_LIST('workerNames') },
  ],
  'production.stage_advanced': [
    { type: 'info', reason: 'You are the Operations Head', when: POSITION('operations-head'), category: 'production_stage' },
    { type: 'info', reason: "You're in Operations", when: POSITION('operations-intern'), category: 'production_stage' },
  ],

  // Orders / Sales
  'order.created': [
    { type: 'info', reason: 'You are the Operations Head', when: POSITION('operations-head'), category: 'new_order' },
    { type: 'info', reason: "You're in Operations", when: POSITION('operations-intern'), category: 'new_order' },
  ],
  'order.assigned': [{ type: 'action', reason: 'This order was assigned to you', when: ID('assignee') }],
  'order.priority_raised': [
    { type: 'action', reason: "You're assigned to this order", when: ID('assignee') },
    { type: 'action', reason: 'You manage operations', when: ROLE('nepal_admin', 'super_admin') },
  ],
  // Production stage moves — the Operations Head and the Operations Interns.
  'order.stage_changed': [
    { type: 'info', reason: 'You are the Operations Head', when: POSITION('operations-head'), category: 'production_stage' },
    { type: 'info', reason: "You're in Operations", when: POSITION('operations-intern'), category: 'production_stage' },
  ],
  'order.dispatched': [
    { type: 'info', reason: "You're in Operations — add production cost", when: POSITION('operations-intern'), category: 'order_dispatched' },
    { type: 'info', reason: 'You handle Billing — invoice this', when: POSITION('accountant'), category: 'order_dispatched' },
  ],
  'order.cancelled': [
    { type: 'action', reason: "You're assigned to this order", when: ID('assignee') },
    { type: 'action', reason: 'You created this order', when: ID('createdBy') },
    { type: 'action', reason: 'You are the Operations Head', when: POSITION('operations-head'), category: 'order_cancelled' },
    { type: 'action', reason: 'You handle Finance', when: POSITION('accountant'), category: 'order_cancelled' },
  ],

  // Billing
  'invoice.created': [{ type: 'info', reason: 'You handle Billing', when: POSITION('accountant'), category: 'invoices' }],
  'invoice.sent': [{ type: 'info', reason: 'You handle Billing', when: POSITION('accountant'), category: 'invoices' }],
  'invoice.paid': [
    { type: 'info', reason: 'You created this invoice', when: ID('createdBy') },
    { type: 'info', reason: 'You handle Finance', when: POSITION('accountant'), category: 'invoices' },
  ],
  'invoice.overdue': [{ type: 'action', reason: 'You handle Billing', when: POSITION('accountant'), category: 'invoices' }],
  'invoice.cancelled': [{ type: 'action', reason: 'You handle Billing', when: POSITION('accountant'), category: 'invoices' }],

  // Finance / Accounting
  'expense.logged': [{ type: 'info', reason: 'You handle Finance', when: POSITION('accountant'), category: 'expenses_purchases' }],
  'purchase.logged': [{ type: 'info', reason: 'You handle Finance', when: POSITION('accountant'), category: 'expenses_purchases' }],
  'expense.marked_paid': [{ type: 'info', reason: 'You logged this expense', when: ID('loggedBy') }],
  'journal.posted': [{ type: 'info', reason: 'You handle Accounting', when: POSITION('accountant'), category: 'expenses_purchases' }],
  'bank.tx_imported': [{ type: 'info', reason: 'You handle Finance', when: POSITION('accountant'), category: 'expenses_purchases' }],
  'finance.large_amount': [{ type: 'action', reason: 'You oversee large spend', when: POSITION('director'), category: 'large_spend' }],

  // Budget & Requirements
  'budget_request.submitted': [
    { type: 'action', reason: 'You approve budget requests', when: POSITION('director'), category: 'budget_requests' },
  ],
  'budget_request.approved': [{ type: 'action', reason: 'You submitted this request', when: ID('requestedBy') }],
  'budget_request.rejected': [{ type: 'action', reason: 'You submitted this request', when: ID('requestedBy') }],
  // requirement.added: no notification, by request.

  // Purchases (routing defined, not currently fired by any mutation hook)
  'purchase_order.created': [{ type: 'info', reason: 'You handle Finance', when: POSITION('accountant'), category: 'expenses_purchases' }],
  'purchase.received': [
    { type: 'info', reason: 'You handle Inventory', when: VIEW('inventory'), category: 'inventory' },
    { type: 'info', reason: 'You requested this', when: ID('requestedBy') },
  ],

  // Inventory — routine edits notify nobody, by request.
  // inventory.low_stock: no notification, by request.
  // inventory.adjusted: no notification, by request.
  // inventory.item_added: no notification, by request.
  // inventory.library_changed: no notification, by request.

  // Attendance / HR
  // attendance.clock_in_flagged: no notification, by request.
  'attendance.absent_late': [{ type: 'info', reason: 'This is your attendance record', when: ID('employee') }],
  'payroll.run_finalised': [
    { type: 'info', reason: 'Your salary slip is ready', when: IN_LIST('people') },
    { type: 'info', reason: "You're a director", when: ROLE('uk_admin'), category: 'payroll' },
  ],
  'payroll.needs_approval': [{ type: 'action', reason: 'You approve payroll runs', when: APPROVER }],
  'employee.added': [{ type: 'info', reason: "You're a director", when: POSITION('director'), category: 'employees' }],
  'employee.deactivated': [{ type: 'info', reason: "You're a director", when: POSITION('director'), category: 'employees' }],
  'employee.login_created': [
    { type: 'info', reason: 'Your app login was created', when: ID('employee') },
    { type: 'info', reason: 'You handle Employees & HR', when: EDIT('employees-hr'), category: 'employees' },
  ],

  // Chat — 'message.received' is now only reached for the "group created"
  // event (useCreateThread); every actual message notification, including
  // @mentions, is server-side (chat_messages_notify_trg / chat_mentions_notify_trg,
  // 0116 / 0120), which is why there's no 'message.mention' entry here any more.
  // Bypasses the section-visibility guard — personal by nature (you're
  // literally in the thread) — no `category`, the per-thread mute is the
  // right control surface here, not a role-wide admin toggle.
  'message.received': [{ type: 'mention', reason: 'You are in this conversation', when: IN_LIST('participants') }],

  // Leads — anyone with the Leads tab, unless they muted this specific lead
  // (notify.ts applies the per-lead mute filter; LEADS_ACCESS only decides
  // who's eligible in the first place; `category` lets an admin turn the
  // whole thing off for a position).
  'lead.message_received': [{ type: 'action', reason: 'A lead sent a new message', when: LEADS_ACCESS, category: 'leads' }],

  // Admin Panel — security-adjacent; deliberately not admin-toggleable.
  'permissions.changed': [
    { type: 'action', reason: 'Your access changed', when: IN_LIST('people') },
    { type: 'action', reason: "You're a system admin", when: ROLE('super_admin') },
  ],
  'stage_config.changed': [
    { type: 'info', reason: 'You manage Nepal operations', when: ROLE('nepal_admin') },
    { type: 'info', reason: "You're on an affected stage", when: IN_LIST('workerNames') },
  ],

  // Bug Report
  'bug_report.submitted': [{ type: 'action', reason: "You're a system admin", when: ROLE('super_admin') }],
  'bug_report.status_changed': [{ type: 'info', reason: 'You submitted this report', when: ID('submittedBy') }],
};

/** Event types whose recipients skip the "can you view this section" guard. */
function bypassesViewGuard(eventType: string, type: NotifType): boolean {
  return type === 'mention' || eventType.startsWith('message.');
}

export function knownEventType(eventType: string): boolean {
  return eventType in RULES;
}

/**
 * Resolve the recipients of one event. Applies the universal post-filters:
 * drop the actor, enforce section visibility (except mentions/messages),
 * dedupe by email, and let `action` beat `info` when a member matches both.
 *
 * Does NOT apply the admin-toggleable category gate (see `categories.ts`) —
 * that needs a DB read, and this function stays pure/synchronous on purpose.
 * `notify()` applies it as a post-filter, the same way it applies the mute
 * filters.
 */
export function recipientsFor(
  ev: NotificationEvent,
  roster: RosterMember[],
  actor: NotifActor | null,
): ResolvedRecipient[] {
  const rules = RULES[ev.eventType];
  if (!rules || rules.length === 0) return [];

  const out: ResolvedRecipient[] = [];
  const seen = new Set<string>();

  for (const member of roster) {
    if (seen.has(member.email.toLowerCase())) continue;
    if (actor && member.email.toLowerCase() === actor.email.toLowerCase()) continue;

    let best: { type: NotifType; reason: string; category?: string } | null = null;
    for (const rule of rules) {
      if (!rule.when(member, ev, roster)) continue;
      if (!best || TYPE_RANK[rule.type] > TYPE_RANK[best.type]) {
        best = { type: rule.type, reason: rule.reason, category: rule.category };
      }
    }
    if (!best) continue;

    if (!bypassesViewGuard(ev.eventType, best.type) && !sectionVisible(asProfile(member), ev.section)) {
      continue;
    }

    seen.add(member.email.toLowerCase());
    out.push({ member, type: best.type, matchedRule: best.reason, category: best.category ?? null });
  }

  return out;
}

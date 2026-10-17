import type { AvatarTint } from '@/components/ui/avatar';

export type TaskStatus = 'blocked' | 'progress' | 'inactive' | 'done';
export type TaskPriority = 'high' | 'med' | 'low';

/**
 * Someone a task can be assigned to — one row of the live `employees`
 * directory. Tasks store the **name**, not this id: the reference ERP's
 * `tasks.assignee` is a plain name string, and matching it to a directory id is
 * unreliable (see the identity notes in `data/attendance/live-shared.ts`).
 */
export interface Assignee {
  /** `employees` doc id — list key only. */
  id: string;
  name: string;
  initials: string;
  tint: AvatarTint;
  role: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  /** Progress notes — distinct from `description` in the reference ERP. */
  notes: string;
  /** AD ISO `YYYY-MM-DD`; `''` = no due date. */
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Free text; `''` = uncategorised. One of `TASK_CATEGORIES` by convention, but not enforced — live data isn't. */
  category: string;
  /** Display name of the person it's on, `''` when nobody's picked it up. */
  assignee: string;
  /** Display name of a linked customer, `''` when none. */
  customer: string;
  /** Free-text reference (e.g. an order code) — not a linked record, matching the reference ERP. */
  orderRef: string;
  /** Display name of who created it. `''` for older/seed rows. Powers the `createdBy`-keyed notification rules. */
  createdBy: string;
}

/**
 * Live `tasks` reader. Maps the reference ERP's `tasks` docs onto the mobile
 * `Task` shape, and reads the assignee picker's list from `employees`.
 *
 * Live shape (sampled 2026-09-27):
 *   tasks      { title, description, status: "To Do"|"In Progress"|"Blocked"|"Done",
 *                assignee: string (a plain display name, often ""), priority: "high"|"med"|"low",
 *                dueDate: string ("" or an AD `YYYY-MM-DD`), customer, orderRef, notes,
 *                category (free text), createdBy, createdAt }
 *   employees  { name, email, role, status: "Active"|… }
 *
 * `assignee` is carried through as the raw name — the reference stores a name,
 * not an id, so mapping it to a directory id and back would only lose data.
 * `dueDate` is carried through as-is (an empty string means no due date); it is
 * no longer bucketed, so the app can show and edit the real date.
 */

import { str } from '@/lib/data/normalise';
import { readCollection, type DocData } from '@/lib/supabase/read';

import { assigneeFromName } from './mock';
import type { Assignee, Task, TaskPriority, TaskStatus } from './types';

const STATUS_MAP: Record<string, TaskStatus> = {
  'to do': 'inactive',
  todo: 'inactive',
  'in progress': 'progress',
  progress: 'progress',
  blocked: 'blocked',
  'on hold': 'blocked',
  done: 'done',
  complete: 'done',
  completed: 'done',
};

function mapStatus(raw: unknown): TaskStatus {
  return STATUS_MAP[str(raw).trim().toLowerCase()] ?? 'inactive';
}

const PRIORITY_MAP: Record<string, TaskPriority> = {
  high: 'high',
  med: 'med',
  medium: 'med',
  low: 'low',
};

function mapPriority(raw: unknown): TaskPriority {
  return PRIORITY_MAP[str(raw).trim().toLowerCase()] ?? 'med';
}

function mapTaskDoc(id: string, d: DocData): Task | null {
  const title = str(d.title).trim();
  if (!title) return null;
  return {
    id,
    title,
    description: str(d.description).trim(),
    notes: str(d.notes).trim(),
    dueDate: str(d.dueDate).trim(),
    status: mapStatus(d.status),
    priority: mapPriority(d.priority),
    category: str(d.category).trim(),
    assignee: str(d.assignee).trim(),
    customer: str(d.customer).trim(),
    orderRef: str(d.orderRef).trim(),
    createdBy: str(d.createdBy).trim(),
  };
}

export async function fetchTasks(): Promise<Task[]> {
  return readCollection('tasks', mapTaskDoc);
}

/**
 * Who a task can be assigned to: the live Employee Directory, active staff only,
 * sorted by name. A staffer with no name is skipped — `tasks.assignee` is the
 * name, so a blank one would be indistinguishable from unassigned.
 */
export async function fetchAssignees(): Promise<Assignee[]> {
  const rows = await readCollection<Assignee>('employees', (id, d) => {
    const name = str(d.name).trim();
    if (!name) return null;
    const status = str(d.status).trim().toLowerCase();
    if (status && status !== 'active') return null;
    return assigneeFromName(name, id, str(d.role).trim());
  });
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

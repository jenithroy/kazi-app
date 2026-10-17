import { tintFromSeed } from '@/components/ui/avatar';

import type { Assignee, Task, TaskPriority, TaskStatus } from './types';

// Blocked sorts first, then In progress, Inactive, Done — the order staff
// actually triage in, not alphabetical (style guide's own rule for this screen).
export const STATUS_ORDER: TaskStatus[] = ['blocked', 'progress', 'inactive', 'done'];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  blocked: 'Blocked',
  progress: 'In progress',
  inactive: 'To do',
  done: 'Done',
};

// Highest first — the order staff triage priority in.
export const PRIORITY_ORDER: TaskPriority[] = ['high', 'med', 'low'];

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: 'High',
  med: 'Medium',
  low: 'Low',
};

/** The reference ERP's fixed category list (`src/constants.js`). Free text on the wire — a live value outside this list is shown, just not offered. */
export const TASK_CATEGORIES = [
  'Research', 'Manufacturing', 'Hiring', 'Marketing', 'Finance', 'Operations', 'Admin', 'Other',
] as const;

/** Initials for an avatar: first letters of the first two words. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Build the display half of an assignee from a bare name. */
export function assigneeFromName(name: string, id = name, role = ''): Assignee {
  return { id, name, initials: initialsOf(name), tint: tintFromSeed(name), role };
}

/** Stand-in directory for the mock data source; the live list comes from `employees`. */
export const MOCK_ASSIGNEES: Assignee[] = [
  assigneeFromName('Sita Rai', 'sr', 'Cutting'),
  assigneeFromName('Anil Karki', 'ak', 'Cutting'),
  assigneeFromName('Pramila Thapa', 'pt', 'Sewing'),
  assigneeFromName('Rabin Bhandari', 'rb', 'Finishing'),
  assigneeFromName('Manisha Gurung', 'mk', 'Packing'),
];

function isoDaysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function seed(partial: Pick<Task, 'id' | 'title' | 'status' | 'assignee'> & Partial<Task>): Task {
  return {
    description: '',
    notes: '',
    dueDate: isoDaysFromToday(0),
    priority: 'med',
    category: '',
    customer: '',
    orderRef: '',
    createdBy: '',
    ...partial,
  };
}

export const seedTasks: Task[] = [
  seed({ id: 't1', title: 'Sample approval — hoodie hood lining', status: 'progress', assignee: 'Sita Rai', priority: 'high', category: 'Manufacturing' }),
  seed({ id: 't2', title: 'Chase fabric ETA from Everest Mills', status: 'blocked', assignee: 'Anil Karki', priority: 'high', category: 'Operations' }),
  seed({ id: 't3', title: 'Re-check needle inspection log', status: 'progress', assignee: 'Pramila Thapa', dueDate: isoDaysFromToday(1) }),
  seed({ id: 't4', title: 'Set up cutting table for chino run', status: 'progress', assignee: 'Rabin Bhandari', category: 'Manufacturing' }),
  seed({ id: 't5', title: 'Trims count for packing line', status: 'inactive', assignee: 'Manisha Gurung', dueDate: isoDaysFromToday(5), priority: 'low' }),
  seed({ id: 't6', title: 'Shift handover notes to night lead', status: 'done', assignee: 'Sita Rai' }),
  seed({ id: 't7', title: 'Photograph AQL defects for buyer', status: 'blocked', assignee: '', dueDate: isoDaysFromToday(5), priority: 'high' }),
];

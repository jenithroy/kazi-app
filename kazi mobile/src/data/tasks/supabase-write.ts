/**
 * Live `tasks` writers — same collection the reference ERP uses.
 *
 * The mobile `Task` now mirrors the live doc field-for-field (description,
 * notes, priority, category, customer, orderRef, a real dueDate) — on create we
 * fill the live shape, on update we patch everything the mobile edit owns.
 *
 * Since migration 0041 the board's columns are rows in `task_columns` and
 * `fs_tasks.status` is derived from them:
 *
 *   'Done' when lower(tasks.status) = 'done', else COALESCE(column label,
 *   tasks.status, 'To Do')
 *
 * so a status written on its own is ignored for any task that has a section —
 * moving one between columns means writing `section_id`. "Done" is not a
 * section (the reference bars the name, `Tasks.jsx` keeps finished tasks in a
 * separate bar): it stays the literal status, stamped with `completed_at`.
 */

import { str } from '@/lib/data/normalise';
import { doc, getDoc , getDb } from '@/lib/supabase/collections';
import { readCollection } from '@/lib/supabase/read';

import { createDocument, patchDocument, removeDocument } from '@/lib/supabase/write';
import { getActor } from '@/data/notifications/actor';

import type { Task, TaskStatus } from './types';

const COLLECTION = 'tasks';

const STATUS_TO_LIVE: Record<TaskStatus, string> = {
  blocked: 'Blocked',
  progress: 'In Progress',
  inactive: 'To Do',
  done: 'Done',
};

/**
 * The `task_columns` row whose label is this status, or null when the board has
 * no such column — the live board carries only "To Do" and "In Progress", and
 * mobile must not invent sections the web app's own editor owns. With no
 * section the view falls back to `tasks.status`, which is why an unmatched
 * status is still written and still reads back correctly.
 *
 * Read on every save rather than cached: someone renaming a column on the web
 * would otherwise file tasks into a section that no longer exists.
 */
async function sectionIdFor(status: TaskStatus): Promise<string | null> {
  if (status === 'done') return null;
  const want = STATUS_TO_LIVE[status].toLowerCase();
  const columns = await readCollection('task_columns', (id, d) => ({ id, label: str(d.label).trim().toLowerCase() }));
  return columns.find((c) => c.label === want)?.id ?? null;
}

/**
 * Every field the mobile edit owns — everything but `createdBy`, which is
 * stamped once on create and never re-patched (see {@link saveTask}).
 *
 * `dueDate` writes real `null` rather than `''` for "no due date": the column
 * is a Postgres `date`, which rejects an empty string.
 *
 * `completedAt` is written only on the transition, the way `Tasks.jsx` does it:
 * stamped when a task becomes done, cleared when it is reopened, and otherwise
 * left alone so editing a finished task's title cannot move its finish date.
 */
async function toLive(task: Task, existing: Record<string, unknown> | null) {
  const done = task.status === 'done';
  const wasDone = str(existing?.status).trim().toLowerCase() === 'done';
  return {
    title: task.title,
    description: task.description,
    notes: task.notes,
    status: STATUS_TO_LIVE[task.status],
    priority: task.priority,
    category: task.category,
    assignee: task.assignee,
    customer: task.customer,
    orderRef: task.orderRef,
    dueDate: task.dueDate || null,
    // Finishing a task never moves it between sections, so the current one is
    // left untouched (undefined is dropped before the write).
    sectionId: done ? undefined : await sectionIdFor(task.status),
    completedAt: done === wasDone ? undefined : done ? new Date().toISOString() : null,
  };
}

/** Upsert — patches when the row id already exists, else creates. */
export async function saveTask(task: Task): Promise<void> {
  let existing: Record<string, unknown> | null = null;
  try {
    const snap = await getDoc(doc(getDb(), COLLECTION, task.id));
    existing = snap.exists() ? snap.data() : null;
  } catch {
    existing = null;
  }
  const fields = await toLive(task, existing);
  if (existing) {
    await patchDocument(COLLECTION, task.id, fields);
  } else {
    await createDocument(COLLECTION, {
      ...fields,
      createdBy: getActor()?.name ?? 'kazi-mobile',
    });
  }
}

export async function deleteTask(id: string): Promise<void> {
  await removeDocument(COLLECTION, id);
}

/** Undo-after-delete — re-creates the row (a fresh doc id). */
export async function restoreTask(task: Task, _index: number): Promise<void> {
  await createDocument(COLLECTION, {
    ...(await toLive(task, null)),
    createdBy: task.createdBy || getActor()?.name || 'kazi-mobile',
  });
}

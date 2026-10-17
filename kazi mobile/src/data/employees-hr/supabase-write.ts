/**
 * Live `employees` writers — the reference ERP's own collection.
 *
 * The mobile `Employee.id` is a sequential number assigned by the reader over
 * the doc-id-sorted roster; it doesn't address a live doc. `docIds()`
 * re-derives the exact same ordering, so a numeric id maps back to its doc id
 * for updates / deletes and for the manager a `reportsTo` points at.
 *
 * Two things the field mapping has to get right, both of which used to make
 * every live write fail (and fall back to mock-only, so the UI lied):
 *
 *   - `role` is NOT a column. It is the position's label, joined in by the
 *     compat view. What grants access is `positionId` → `people.position_id`,
 *     a foreign key into `positions`, so writing a typed-in job title there
 *     was a guaranteed FK violation.
 *   - `people` has no `updated_by` column, so stamping one rejected the whole
 *     statement. The row's `updated_at` is what records the edit.
 *
 * `email` is NOT NULL on `people`, so an added employee must have one.
 *
 * Payroll month approvals (`fetchApprovals` / `approveMonth`) have no live
 * collection and stay mock-only.
 */

import { str } from '@/lib/data/normalise';
import { collection, getDb, getDocs } from '@/lib/supabase/collections';
import { createDocument, patchDocument } from '@/lib/supabase/write';

import type { Employee } from './types';

const COLLECTION = 'employees';

/** Live row ids in the same order `supabase.ts` numbers them (1-based). */
async function docIds(): Promise<string[]> {
  const snap = await getDocs(collection(getDb(), COLLECTION));
  return snap.docs
    .filter((d) => str((d.data() as Record<string, unknown>).name).trim())
    .map((d) => d.id)
    .sort((a, b) => a.localeCompare(b));
}

/** An empty text field must clear the column, not write '' into a date/uuid. */
const orNull = (v: string) => (v.trim() ? v.trim() : null);

function toLive(e: Partial<Employee>, ids: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (e.name !== undefined) out.name = e.name;
  if (e.positionId !== undefined) out.positionId = orNull(e.positionId);
  if (e.dept !== undefined) out.department = orNull(e.dept);
  if (e.active !== undefined) out.status = e.active ? 'Active' : 'Inactive';
  if (e.joined !== undefined) out.joinDate = orNull(e.joined);
  if (e.email !== undefined) out.email = e.email.trim();
  if (e.phone !== undefined) out.phone = orNull(e.phone);
  if (e.address !== undefined) out.address = orNull(e.address);
  if (e.pan !== undefined) out.panNumber = orNull(e.pan);
  if (e.location !== undefined) out.location = orNull(e.location);
  if (e.productionWorker !== undefined) out.isProductionWorker = e.productionWorker;
  if (e.bank !== undefined) out.bankName = orNull(e.bank);
  if (e.acct !== undefined) out.bankAccount = orNull(e.acct);
  if (e.branch !== undefined) out.bankBranch = orNull(e.branch);
  if (e.basic !== undefined) out.basicSalaryNPR = e.basic;
  // The shift. `schedule_start` / `schedule_end` are `time` columns, so a blank
  // has to clear rather than write ''. Attendance writes these same three.
  if (e.schedule !== undefined) {
    out.scheduleStart = orNull(e.schedule.start);
    out.scheduleEnd = orNull(e.schedule.end);
    out.scheduleWorkingDays = e.schedule.workingDays;
    out.scheduleDayOverrides = e.schedule.dayOverrides;
  }
  // `reportsTo` is a numeric mobile id on the way in, a `people.id` uuid on the
  // way out. `undefined` means "no manager" and must clear the column.
  if ('reportsTo' in e) out.reportsTo = e.reportsTo ? (ids[e.reportsTo - 1] ?? null) : null;
  return out;
}

export async function addEmployee(employee: Employee): Promise<void> {
  if (!employee.email.trim()) throw new Error('addEmployee: an email address is required');
  await createDocument(COLLECTION, toLive(employee, await docIds()));
}

export async function updateEmployee(id: number, updates: Partial<Employee>): Promise<void> {
  const ids = await docIds();
  const docId = ids[id - 1];
  if (!docId) throw new Error(`updateEmployee: no live doc for mobile id ${id}`);
  const fields = toLive(updates, ids);
  if (Object.keys(fields).length > 0) await patchDocument(COLLECTION, docId, fields);
}

/**
 * Soft delete. A `DELETE` on `people` cascades through `attendance`,
 * `clock_ins`, the chat tables, `person_permission_overrides`, `user_points`,
 * `worker_sessions`, `shift_logs` and `mobile_notifications`, and NULLs
 * `payroll.person_id` — so it takes a person's whole history with it and cannot
 * be undone. `Inactive` is what the web ERP itself uses for a leaver, and it is
 * what blocks the app login.
 */
export async function deleteEmployee(id: number): Promise<void> {
  const docId = (await docIds())[id - 1];
  if (!docId) throw new Error(`deleteEmployee: no live doc for mobile id ${id}`);
  await patchDocument(COLLECTION, docId, { status: 'Inactive' });
}

/** Undo of the soft delete above: reinstate the `Active` status the snapshot holds. */
export async function restoreEmployees(previous: Employee[]): Promise<void> {
  const [ids, snap] = await Promise.all([docIds(), getDocs(collection(getDb(), COLLECTION))]);
  const statusOf = new Map(snap.docs.map((d) => [d.id, str((d.data() as Record<string, unknown>).status).trim()]));
  const stale = previous
    .filter((e) => e.active)
    .map((e) => ids[e.id - 1])
    .filter((docId): docId is string => !!docId && /inactive/i.test(statusOf.get(docId) ?? ''));
  await Promise.all(stale.map((docId) => patchDocument(COLLECTION, docId, { status: 'Active' })));
}

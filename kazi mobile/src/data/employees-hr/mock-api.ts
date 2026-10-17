import { simulateLatency } from '../mock/delay';
import { MONTHS, PEOPLE } from './mock';
import type { Employee, MonthKey, PayMonth } from './types';

let db: Employee[] = [...PEOPLE];
let approvals: Record<string, boolean> = {};

export async function fetchEmployees(): Promise<Employee[]> {
  await simulateLatency();
  return [...db];
}

export async function addEmployee(employee: Employee): Promise<void> {
  await simulateLatency(300);
  db = [...db, employee];
}

export async function updateEmployee(id: number, updates: Partial<Employee>): Promise<void> {
  await simulateLatency(250);
  db = db.map((e) => (e.id === id ? { ...e, ...updates } : e));
}

/** Remove an employee (item 28) — real backend also revokes the Supabase login. */
export async function deleteEmployee(id: number): Promise<void> {
  await simulateLatency(250);
  db = db.filter((e) => e.id !== id);
}

export async function restoreEmployees(previous: Employee[]): Promise<void> {
  await simulateLatency(150);
  db = [...previous];
}

export async function fetchPayMonths(): Promise<PayMonth[]> {
  await simulateLatency();
  return [...MONTHS];
}

export async function fetchApprovals(): Promise<Record<string, boolean>> {
  await simulateLatency();
  return { ...approvals };
}

export async function approveMonth(key: MonthKey): Promise<void> {
  await simulateLatency(300);
  approvals = { ...approvals, [key]: true };
}

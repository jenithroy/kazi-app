import { simulateLatency } from '../mock/delay';
import { seedCustomers } from './mock';
import type { Customer } from './types';

let db: Customer[] = [...seedCustomers];

export async function fetchCustomers(): Promise<Customer[]> {
  await simulateLatency();
  return [...db];
}

export async function addCustomer(customer: Customer): Promise<void> {
  await simulateLatency(300);
  db = [...db, customer];
}

export async function updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
  await simulateLatency(250);
  db = db.map((c) => (c.id === id ? { ...c, ...updates } : c));
}

export async function deleteCustomer(id: string): Promise<void> {
  await simulateLatency(250);
  db = db.filter((c) => c.id !== id);
}

export async function restoreCustomers(previous: Customer[]): Promise<void> {
  await simulateLatency(150);
  db = [...previous];
}

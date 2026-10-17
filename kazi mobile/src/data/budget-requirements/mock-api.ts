import { simulateLatency } from '../mock/delay';
import { seedBudgetRequests, seedRequirements } from './mock';
import type { BudgetRequest, Requirement } from './types';

let db: Requirement[] = [...seedRequirements];
let requestsDb: BudgetRequest[] = seedBudgetRequests.map((r) => ({ ...r }));

export async function fetchRequirements(): Promise<Requirement[]> {
  await simulateLatency();
  return [...db];
}

export async function addRequirement(entry: Requirement): Promise<void> {
  await simulateLatency(300);
  db = [entry, ...db];
}

export async function updateRequirement(id: string, updates: Partial<Requirement>): Promise<void> {
  await simulateLatency(250);
  db = db.map((r) => (r.id === id ? { ...r, ...updates } : r));
}

export async function restoreRequirements(previous: Requirement[]): Promise<void> {
  await simulateLatency(150);
  db = [...previous];
}

// ---- Budget Requests (item 17) ----

export async function fetchBudgetRequests(): Promise<BudgetRequest[]> {
  await simulateLatency();
  return [...requestsDb];
}

export async function addBudgetRequest(entry: BudgetRequest): Promise<void> {
  await simulateLatency(300);
  requestsDb = [entry, ...requestsDb];
}

export async function updateBudgetRequest(id: string, updates: Partial<BudgetRequest>): Promise<void> {
  await simulateLatency(250);
  requestsDb = requestsDb.map((r) => (r.id === id ? { ...r, ...updates } : r));
}

export async function restoreBudgetRequests(previous: BudgetRequest[]): Promise<void> {
  await simulateLatency(150);
  requestsDb = [...previous];
}

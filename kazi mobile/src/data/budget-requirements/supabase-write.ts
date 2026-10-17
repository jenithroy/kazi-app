/**
 * Live `budget_requests` writers — one reference ERP collection feeds both mobile
 * tabs; the `type` field ("budget" | "requirement") discriminates.
 */

import { createDocument, patchDocument } from '@/lib/supabase/write';
import { getActor } from '@/data/notifications/actor';

import type { BudgetRequest, Requirement } from './types';

const COLLECTION = 'budget_requests';

const REQ_STATUS_TO_LIVE = { pending: 'Pending', approved: 'Approved', declined: 'Rejected' } as const;

// ---- Requirements ----

function requirementToLive(r: Partial<Requirement>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: 'requirement' };
  if (r.item !== undefined) out.title = r.item;
  if (r.cat !== undefined) out.category = r.cat;
  if (r.amountGBP !== undefined) out.amount = r.amountGBP;
  if (r.amount !== undefined) out.amountNPR = r.amount;
  if (r.quantity !== undefined) out.quantity = r.quantity;
  if (r.priority !== undefined) out.urgency = r.priority;
  if (r.status !== undefined) out.status = REQ_STATUS_TO_LIVE[r.status];
  if (r.note !== undefined) out.notes = r.note;
  if (r.who !== undefined) out.requestedBy = r.who;
  if (r.team !== undefined) out.requestedByRole = r.team;
  if (r.decidedBy !== undefined) out.reviewedBy = r.decidedBy;
  return out;
}

export async function addRequirement(entry: Requirement): Promise<void> {
  await createDocument(COLLECTION, {
    ...requirementToLive(entry),
    requestedBy: entry.who || getActor()?.name || 'kazi-mobile',
  });
}

export async function updateRequirement(id: string, updates: Partial<Requirement>): Promise<void> {
  await patchDocument(COLLECTION, id, requirementToLive(updates));
}

export async function restoreRequirements(_previous: Requirement[]): Promise<void> {
  /* snapshot undo — not reversed in Postgres this pass */
}

// ---- Budget requests ----

function budgetToLive(b: Partial<BudgetRequest>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: 'budget' };
  if (b.title !== undefined) out.title = b.title;
  if (b.category !== undefined) out.category = b.category;
  if (b.amountGBP !== undefined) out.amount = b.amountGBP;
  if (b.amountNPR !== undefined) out.amountNPR = b.amountNPR;
  if (b.urgency !== undefined) out.urgency = b.urgency;
  if (b.status !== undefined) out.status = b.status;
  if (b.justification !== undefined) out.notes = b.justification;
  if (b.requestedBy !== undefined) out.requestedBy = b.requestedBy;
  if (b.requestedByRole !== undefined) out.requestedByRole = b.requestedByRole;
  if (b.reviewedBy !== undefined) out.reviewedBy = b.reviewedBy;
  return out;
}

export async function addBudgetRequest(entry: BudgetRequest): Promise<void> {
  await createDocument(COLLECTION, {
    ...budgetToLive(entry),
    requestedBy: entry.requestedBy || getActor()?.name || 'kazi-mobile',
  });
}

export async function updateBudgetRequest(id: string, updates: Partial<BudgetRequest>): Promise<void> {
  await patchDocument(COLLECTION, id, budgetToLive(updates));
}

export async function restoreBudgetRequests(_previous: BudgetRequest[]): Promise<void> {
  /* snapshot undo — not reversed in Postgres this pass */
}

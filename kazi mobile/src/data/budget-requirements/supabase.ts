/**
 * Live `budget_requests` reader (Track B, read-only). One live collection feeds
 * both mobile tabs — `type` discriminates. Writes stay on `mock-api.ts`.
 *
 * Live shape (sampled 2026-08-30): { type ("budget"/"requirement"), title,
 *   category, amount (GBP), amountNPR, quantity, urgency (Low/Medium/High),
 *   status (Pending/Approved/Rejected), notes, requestedBy, requestedByRole,
 *   reviewedBy?, createdAt }
 *
 * Gaps handled locally (see plan §Batch 1): `ref` (`BR-`/`REQ-`) generated from
 * the doc id; Requirements-only `by`/`quote` default.
 */

import { GBP_RATE } from '@/lib/currency';
import { num, str, tsToISO } from '@/lib/data/normalise';
import { readCollection, type DocData } from '@/lib/supabase/read';

import type {
  BudgetCategory,
  BudgetRequest,
  Category,
  Priority,
  RequestStatus,
  Requirement,
  ReviewStatus,
} from './types';

const BUDGET_CATEGORIES: BudgetCategory[] = ['Equipment', 'Materials', 'Services', 'Training', 'Travel', 'Other'];
const REQ_CATEGORIES: Category[] = [
  'Raw Materials',
  'Tools',
  'Machinery',
  'Equipment',
  'Office Supplies',
  'Safety Equipment',
  'Other',
];

function mapUrgency(raw: unknown): Priority {
  const s = str(raw).trim().toLowerCase();
  if (s === 'high') return 'High';
  if (s === 'low') return 'Low';
  return 'Medium';
}

function mapReviewStatus(raw: unknown): ReviewStatus {
  const s = str(raw).trim().toLowerCase();
  if (s === 'approved') return 'Approved';
  if (s === 'rejected' || s === 'declined') return 'Rejected';
  return 'Pending';
}

function mapRequestStatus(raw: unknown): RequestStatus {
  const s = str(raw).trim().toLowerCase();
  if (s === 'approved') return 'approved';
  if (s === 'rejected' || s === 'declined') return 'declined';
  return 'pending';
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function isBudget(d: DocData): boolean {
  return str(d.type).trim().toLowerCase() === 'budget';
}

function mapBudgetRequestDoc(id: string, d: DocData): BudgetRequest | null {
  if (!isBudget(d)) return null;
  const title = str(d.title).trim();
  if (!title) return null;
  const catRaw = str(d.category).trim();
  return {
    id,
    ref: `BR-${id.slice(0, 4).toUpperCase()}`,
    title,
    category: BUDGET_CATEGORIES.find((c) => c.toLowerCase() === catRaw.toLowerCase()) ?? 'Other',
    amountGBP: num(d.amount),
    amountNPR: num(d.amountNPR) || Math.round(num(d.amount) * GBP_RATE),
    urgency: mapUrgency(d.urgency),
    status: mapReviewStatus(d.status),
    justification: str(d.notes).trim(),
    requestedBy: str(d.requestedBy).trim(),
    requestedByRole: str(d.requestedByRole).trim(),
    reviewedBy: str(d.reviewedBy).trim() || undefined,
    date: tsToISO(d.createdAt),
  };
}

function mapRequirementDoc(id: string, d: DocData): Requirement | null {
  if (isBudget(d)) return null; // everything that isn't a budget ask is a requirement
  const item = str(d.title).trim();
  if (!item) return null;
  const catRaw = str(d.category).trim();
  const who = str(d.requestedBy).trim();
  const amountGBP = num(d.amount);
  return {
    id,
    ref: `REQ-${id.slice(0, 4).toUpperCase()}`,
    item,
    cat: REQ_CATEGORIES.find((c) => c.toLowerCase() === catRaw.toLowerCase()) ?? 'Other',
    quantity: str(d.quantity).trim(),
    amount: num(d.amountNPR) || Math.round(amountGBP * GBP_RATE),
    amountGBP,
    priority: mapUrgency(d.urgency),
    status: mapRequestStatus(d.status),
    who,
    init: initialsOf(who),
    team: str(d.requestedByRole).trim(),
    date: tsToISO(d.createdAt),
    by: 'This month',
    quote: '',
    note: str(d.notes).trim(),
    decidedBy: str(d.reviewedBy).trim() || undefined,
  };
}

export async function fetchBudgetRequests(): Promise<BudgetRequest[]> {
  return readCollection('budget_requests', mapBudgetRequestDoc);
}

export async function fetchRequirements(): Promise<Requirement[]> {
  return readCollection('budget_requests', mapRequirementDoc);
}

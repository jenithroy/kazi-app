import { moneyLakh } from '@/lib/money';

import { STAGES, stageIndex } from './mock';
import type { Order, OrderPriority, StageId } from './types';

export function initials(name: string): string {
  return name
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/** "रु 43.2L" / "£21.6k" — the design's `lakh()` helper, in the display currency. */
export function lakh(n: number): string {
  return moneyLakh(n);
}

/**
 * Priority is not a column — the reference app derives it from how close the
 * delivery date is (`Production.jsx` → `orderPriority`), and an order with no
 * delivery date is Normal by definition. Same thresholds here so the two apps
 * flag the same orders.
 */
export function priorityOf(order: Pick<Order, 'deliveryDate' | 'shipDays'>): OrderPriority {
  if (!order.deliveryDate) return 'normal';
  if (order.shipDays <= 5) return 'urgent';
  if (order.shipDays <= 12) return 'high';
  return 'normal';
}

/**
 * Which of the three lists an order belongs to. `delivered` counts as finished
 * even when the row still says Active — a handful of live rows were moved to
 * the last stage without their status being updated, and an order sitting in
 * Delivered is not work in progress by any reading.
 */
export type OrderGroup = 'open' | 'completed' | 'cancelled';

export function groupOf(order: Order): OrderGroup {
  if (order.status === 'cancelled') return 'cancelled';
  if (order.status === 'completed' || order.stage === 'delivered') return 'completed';
  return 'open';
}

/** An order still moving through the pipeline. */
export function isOpen(order: Order): boolean {
  return groupOf(order) === 'open';
}

/** 0–100 across the ten stages, matching the reference `stageProgress`. */
export function stageProgress(stage: StageId): number {
  const i = stageIndex(stage);
  return i < 0 ? 0 : Math.round((i / (STAGES.length - 1)) * 100);
}

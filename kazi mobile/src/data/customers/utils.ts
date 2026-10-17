import { moneyFromGBP } from '@/lib/money';

import type { Customer } from './types';

export function initials(name: string): string {
  return name
    .split(/[\s&.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/**
 * Customer invoices are booked in pounds, so this converts the other way when
 * the display currency is rupees. Screens that call it need `useMoneySignature()`.
 */
export function gbp(n: number): string {
  return moneyFromGBP(n);
}

export function owed(c: Customer): number {
  return c.invoices.filter((i) => i.status !== 'paid').reduce((n, i) => n + (i.outstanding ?? i.amount), 0);
}

export function lifetime(c: Customer): number {
  return c.invoices.reduce((n, i) => n + i.amount, 0);
}

export function hasOverdue(c: Customer): boolean {
  return c.invoices.some((i) => i.status === 'overdue');
}

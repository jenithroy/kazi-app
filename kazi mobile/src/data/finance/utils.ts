import { money, moneyLakh } from '@/lib/money';

export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

/** "रु 41.2L" / "£20.6k" — the design's `lakh()` helper, in the display currency. */
export function lakh(n: number): string {
  return moneyLakh(n);
}

/** An NPR figure in the display currency. Screens that call it need `useMoneySignature()`. */
export function rupees(n: number): string {
  return money(n);
}

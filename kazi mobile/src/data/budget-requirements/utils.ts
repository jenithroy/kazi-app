import { money as displayMoney, moneyCompact, moneyFromGBP } from '@/lib/money';

import { PRIORITY } from './mock';
import type { Priority } from './types';

/** 3-bar priority meter — bars up to the priority's rank take its hue, the rest take `offColor`. */
export function priorityBarColors(priority: Priority, offColor: string): [string, string, string] {
  const { rank, hue } = PRIORITY[priority];
  return [rank >= 1 ? hue : offColor, rank >= 2 ? hue : offColor, rank >= 3 ? hue : offColor];
}

export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

/** A request amount in the display currency. Screens that call it need `useMoneySignature()`. */
export function money(n: number): string {
  return displayMoney(n);
}

/** "रु 1.9L" / "£950" style compact formatting, matching the design's own `short()` helper. */
export function short(n: number): string {
  return moneyCompact(n);
}

/**
 * The request's own `amountGBP` field (item 17). Shown as `£1,450` in pounds and
 * converted back at the live rate when the display currency is rupees, so the
 * two amounts on a request never read as different money.
 */
export function gbp(n: number): string {
  return moneyFromGBP(n);
}

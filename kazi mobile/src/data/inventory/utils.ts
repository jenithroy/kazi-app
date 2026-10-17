import type { ItemCost, StockItem, StockLevel } from './types';

export function stockRatio(item: Pick<StockItem, 'qty' | 'threshold'>): number {
  // Most live rows carry no reorder level at all. Without a threshold there is
  // no bar to fill against, so show it full rather than dividing by zero.
  if (item.threshold <= 0) return 1;
  return item.qty / (item.threshold * 2);
}

export function stockLevel(item: Pick<StockItem, 'qty' | 'threshold'>): StockLevel {
  if (item.threshold <= 0) return 'ok';
  if (item.qty < item.threshold) return 'low';
  if (item.qty < item.threshold * 1.15) return 'near';
  return 'ok';
}

/**
 * The upstream `total` column is null on rows nobody has re-saved since the
 * columns were added, so always recompute rather than trusting it.
 */
export function costTotal(c: ItemCost): number {
  return c.fabric + c.labour + c.rib + c.trims + c.others;
}

/** Stock rows carry the code as `#kazi1001`; `product_costs` keys on `kazi1001`. */
export function costCode(sku: string): string {
  return sku.trim().replace(/^#/, '').toLowerCase();
}

/** The cost breakdown for a stock item, matched on product code. */
export function costFor(item: Pick<StockItem, 'sku'>, costs: ItemCost[]): ItemCost | null {
  const key = costCode(item.sku);
  if (!key) return null;
  return costs.find((c) => c.code.toLowerCase() === key) ?? null;
}

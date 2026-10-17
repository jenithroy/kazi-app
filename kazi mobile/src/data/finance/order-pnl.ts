/**
 * Order P&L — per-order revenue vs material / labour / overhead / shipping cost,
 * with an auto labour rate derived from last month's production payroll. Orders
 * come from the Sales module (`src/data/sales`); cost records live in the
 * finance `order_costs` mock collection, keyed by `Order.id`.
 *
 * Reference: `Finance.jsx` "Order P&L" tab. The reference reads units-passed
 * from `production` batch counts; mobile's production mock has no monthly output
 * figure, so `unitsPassed` is passed in (seeded — `LAST_MONTH_UNITS_PASSED`).
 */

import type { Employee, PayMonth } from '../employees-hr/types';
import { pay } from '../employees-hr/utils';
import type { Order } from '../sales/types';
import { PRODUCTION_DEPTS } from './mock';
import type { OrderCosts } from './types';

/**
 * NPR per unit = last month's production-worker gross payroll ÷ units passed QC
 * last month. Returns `null` when either input is missing, so the tab simply
 * shows no auto rate rather than a bogus zero.
 */
export function autoLabourRate(employees: Employee[], lastMonth: PayMonth, unitsPassed: number): number | null {
  const payroll = employees
    .filter((e) => e.active && PRODUCTION_DEPTS.includes(e.dept))
    .reduce((n, e) => n + pay(e, lastMonth).gross, 0);
  if (payroll <= 0 || unitsPassed <= 0) return null;
  return payroll / unitsPassed;
}

export interface OrderPnlRow {
  order: Order;
  revenue: number;
  material: number;
  labour: number;
  /** Labour came from the auto rate (no saved cost record for this order). */
  labourIsAuto: boolean;
  overhead: number;
  shipping: number;
  totalCost: number;
  profit: number;
  /** null when revenue is 0. Callers show a "No costs" state when `!hasCosts`. */
  margin: number | null;
  hasCosts: boolean;
}

export function buildOrderPnl(
  orders: Order[],
  costsByOrder: Record<string, OrderCosts>,
  labourRate: number | null,
): OrderPnlRow[] {
  return orders.map((order) => {
    const costs = costsByOrder[order.id];
    const hasRecord = costs != null;
    const revenue = order.value;
    const material = costs?.material ?? 0;
    const autoLabour = !hasRecord && labourRate ? Math.round(labourRate * order.qty) : 0;
    const labour = hasRecord ? costs.labour : autoLabour;
    const labourIsAuto = !hasRecord && autoLabour > 0;
    const overhead = costs?.overhead ?? 0;
    const shipping = costs?.shipping ?? 0;
    const totalCost = material + labour + overhead + shipping;
    const profit = revenue - totalCost;
    return {
      order,
      revenue,
      material,
      labour,
      labourIsAuto,
      overhead,
      shipping,
      totalCost,
      profit,
      margin: revenue > 0 ? (profit / revenue) * 100 : null,
      hasCosts: totalCost > 0,
    };
  });
}

export interface OrderPnlSummary {
  revenue: number;
  cost: number;
  profit: number;
  /** Mean margin over rows that have both revenue and cost data. null if none. */
  avgMargin: number | null;
  withCostCount: number;
}

export function summariseOrderPnl(rows: OrderPnlRow[]): OrderPnlSummary {
  const revenue = rows.reduce((n, r) => n + r.revenue, 0);
  const cost = rows.reduce((n, r) => n + r.totalCost, 0);
  const withMargin = rows.filter((r) => r.revenue > 0 && r.hasCosts && r.margin != null);
  return {
    revenue,
    cost,
    profit: revenue - cost,
    avgMargin: withMargin.length ? withMargin.reduce((n, r) => n + (r.margin as number), 0) / withMargin.length : null,
    withCostCount: withMargin.length,
  };
}

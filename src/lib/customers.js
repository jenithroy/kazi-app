/**
 * The Customers page's plain logic: which customers are late, who the biggest are, and how the list is
 * searched and narrowed. Nothing here draws anything or talks to the database, so it can be reasoned
 * about (and tested) on its own.
 *
 * The roll-up that turns customers, orders, invoices and payments into one row per customer is the
 * Sales page's (`rollUp` in ./sales): it is the old Customers page's, carried over once, so the two
 * pages can never add the same money up two ways. This file only adds what the Customers page shows
 * on top of those rows.
 *
 * Words used throughout:
 *   row       a customer with everything that belongs to them added up (see rollUp)
 *   owing     owes something (over half a rupee, so a rounding crumb is not a debt)
 *   overdue   owes money on an invoice whose due date has passed (the same test rollUp uses)
 *   quiet     no orders and no invoices at all
 *   today     always handed in, as the office's (Kathmandu's) "YYYY-MM-DD", so every sum is repeatable
 */
import { toNPR } from "../utils/currency";
import { daysBetween } from "./sales";

/** What one customer owes on invoices that are past their due date: how many, how much, the oldest due date and how many days late that is. */
export function lateOf(c, today) {
  let n = 0;
  let amount = 0;
  let oldest = "";
  for (const i of c.invoices) {
    if (i.status === "Cancelled") continue;           // a cancelled invoice is not a debt
    const owed = Math.max(0, toNPR(i.totalNPR, i.currency) - toNPR(i.amountPaid, i.currency));
    if (owed > 0.5 && i.dueDate && i.dueDate < today) {
      n += 1;
      amount += owed;
      if (!oldest || i.dueDate < oldest) oldest = i.dueDate;
    }
  }
  const days = oldest ? daysBetween(oldest, today) : 0;
  return { n, amount, oldest, days: Number.isFinite(days) ? Math.max(0, days) : 0 };
}

const byName = (a, b) => (a.name || "").localeCompare(b.name || "");

/** The customers who owe past their due date, the biggest late amount first (then the longest late, then by name). */
export function overdueList(rows, today) {
  return rows
    .map((c) => ({ c, late: lateOf(c, today) }))
    .filter((x) => x.late.n > 0)
    .sort((a, b) => b.late.amount - a.late.amount || b.late.days - a.late.days || byName(a.c, b.c));
}

/**
 * The customers who have been invoiced the most, up to `n`: each with their share of everything invoiced and
 * how long their bar is next to the biggest's (the biggest is 100).
 */
export function biggest(rows, n = 5) {
  const total = rows.reduce((s, c) => s + c.invoicedNPR, 0);
  const list = rows
    .filter((c) => c.invoicedNPR > 0.5)
    .sort((a, b) => b.invoicedNPR - a.invoicedNPR || byName(a, b))
    .slice(0, n);
  const top = list[0]?.invoicedNPR || 0;
  return list.map((c) => ({
    c,
    share: total > 0 ? (c.invoicedNPR / total) * 100 : 0,
    pct: top > 0 ? (c.invoicedNPR / top) * 100 : 0,
  }));
}

/** How many customers each filter would show. */
export function countsOf(rows) {
  return {
    all: rows.length,
    owing: rows.filter((c) => c.outstandingNPR > 0.5).length,
    overdue: rows.filter((c) => c.overdueNPR > 0.5).length,
    quiet: rows.filter((c) => !c.isActive).length,
  };
}

const digits = (v) => String(v ?? "").replace(/\D/g, "");

/**
 * The customers a filter and a search leave in (not ordered: the table's heads do that).
 * A search looks at the name, the contact person, the email, the phone (by its digits, so "9841 234" finds
 * "+977-9841-234567") and the city.
 */
export function filterRows(rows, { query = "", filter = "all" } = {}) {
  let list = rows;
  if (filter === "owing") list = list.filter((c) => c.outstandingNPR > 0.5);
  else if (filter === "overdue") list = list.filter((c) => c.overdueNPR > 0.5);
  else if (filter === "quiet") list = list.filter((c) => !c.isActive);
  const q = query.trim().toLowerCase();
  if (q) {
    const qd = digits(q);
    list = list.filter((c) =>
      [c.name, c.contactPerson, c.email, c.phone, c.city].some((v) => String(v || "").toLowerCase().includes(q))
      || (qd.length >= 3 && digits(c.phone).includes(qd)));
  }
  return list;
}

/** "3 orders · 120 pcs": what a customer's orders come to, for the line under a name when the table has no room for an Orders column. */
export function ordersLine(c) {
  if (c.orders.length === 0) return "";
  const n = `${c.orders.length} ${c.orders.length === 1 ? "order" : "orders"}`;
  return c.units > 0 ? `${n} · ${c.units.toLocaleString()} pcs` : n;
}

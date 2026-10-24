/**
 * What the dashboards share: loading, the sums behind the tiles, and the small
 * live queries (dispatch, bank) more than one tile reads. The maths is carried
 * over from the old Dashboard unchanged; only where it lives has moved.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAll, loadCollections, subscribe } from "../../lib/db";
import { useRegion } from "../../context/RegionContext";
import { useCurrency } from "../../context/CurrencyContext";
import { toNPR } from "../../utils/currency";
import { todayDate, tsMillis } from "../../utils/date";
import { filterCollections } from "../../utils/region";

/* ── Loading ────────────────────────────────────────────── */

/**
 * Load a dashboard's collections, work them into `data`, and reload when any
 * of the `live` ones change, when the region switches, or when the exchange
 * rate lands (invoice sums convert at the live rate).
 *
 * `collections` maps a key to a collection name, as loadCollections takes it;
 * one a position cannot read comes back empty instead of failing, so a
 * restricted tile never blanks the page. `derive(cols, { today })` is pure.
 * `regional: false` skips the region filter, for dashboards about one person.
 *
 * Pass module-level constants for all three: they are not watched for change.
 */
export function useDashData({ collections, live = [], derive, regional = true }) {
  const { region } = useRegion();
  const { ratesVersion } = useCurrency();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  const deriveRef = useRef(derive);
  deriveRef.current = derive;

  useEffect(() => {
    let alive = true;
    (async () => {
      const loaded = await loadCollections(collections);
      const cols = regional ? filterCollections(loaded, region) : loaded;
      const next = deriveRef.current(cols, { today: todayDate() });
      if (alive) { setData(next); setError(null); }
    })().catch((e) => {
      console.error(e);
      if (alive) setError(e.message || "Failed to load.");
    });
    return () => { alive = false; };
  }, [tick, region, ratesVersion]);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const offs = live.map((name) => subscribe(name, bump));
    return () => offs.forEach((off) => off());
  }, []);

  return { data, error, reload: () => setTick((t) => t + 1) };
}

/* ── Sums ───────────────────────────────────────────────── */

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Who is in today. `present` already counts the late arrivals, as it always has. */
export function attendanceToday(attendance, totalStaff, today) {
  const rows = attendance.filter((r) => r.date === today);
  const present = rows.filter((r) => ["Present", "Late", "Half-day"].includes(r.status)).length;
  const late = rows.filter((r) => r.status === "Late").length;
  const leave = rows.filter((r) => r.status === "Leave").length;
  return { present, late, leave, absent: Math.max(0, totalStaff - present - leave), total: totalStaff };
}

export function taskSummary(tasks, users, today) {
  const done = tasks.filter((t) => t.status === "Done").length;
  const TASK_TARGET = 10; // tickets per person per month
  return {
    tasksByCol: {
      todo:        tasks.filter((t) => t.status === "To Do").length,
      in_progress: tasks.filter((t) => t.status === "In Progress").length,
      blocked:     tasks.filter((t) => t.status === "Blocked").length,
      done,
    },
    recentTasks: tasks.filter((t) => t.status !== "Done").slice(0, 5),
    overdueTasks: tasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== "Done"),
    totalDone: done,
    totalTarget: Math.max(users.length, 1) * TASK_TARGET,
  };
}

/**
 * Invoices by where they stand. Overdue is its own bucket (open and past due),
 * so the four buckets never count an invoice twice.
 */
export function invoiceSummary(invoices, today) {
  const live = invoices.filter((i) => i.status !== "Cancelled");
  const npr = (i) => toNPR(i.totalNPR, i.currency);
  const isPaid = (i) => i.status === "Paid";
  const isDraft = (i) => i.status === "Draft";
  const isLate = (i) => !isPaid(i) && !isDraft(i) && i.dueDate && i.dueDate < today;
  const bucket = (test) => {
    const rows = live.filter(test);
    return { n: rows.length, npr: rows.reduce((s, i) => s + npr(i), 0) };
  };
  const paid = bucket(isPaid);
  const overdue = bucket(isLate);
  const open = bucket((i) => !isPaid(i) && !isDraft(i) && !isLate(i));
  const draft = bucket(isDraft);
  return {
    invoiceBuckets: { paid, open, overdue, draft },
    outstandingNPR: open.npr + overdue.npr,
    overdueInvoices: live.filter(isLate),
    overdueInvoiceTotalNPR: overdue.npr,
  };
}

/**
 * This month's money in and out. Expenses here are expenses + purchases +
 * payroll (an estimate from base salaries until a payroll run exists), which
 * is what the old Finance snapshot added up.
 */
export function moneySummary({ invoices, expenses, purchases, payroll, employees, orders, orderCosts }, createdAfterCutoff) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthExpOnlyNPR = expenses.filter((e) => (e.date || "").slice(0, 7) === thisMonth).reduce((s, e) => s + Number(e.amountNPR || 0), 0);
  const monthPurchNPR = purchases.filter((p) => createdAfterCutoff(p))
    .filter((p) => (p.date || "").slice(0, 7) === thisMonth)
    .reduce((s, p) => s + Number(p.amountNPR || p.amount || 0), 0);

  const curMonthName = MONTH_NAMES[new Date().getMonth()];
  const curYear = new Date().getFullYear();
  const payrollRecs = payroll.filter((p) => p.month === curMonthName && Number(p.year) === curYear);
  const payrollIsEstimate = payrollRecs.length === 0;
  const monthPayrollNPR = payrollIsEstimate
    ? employees.filter((e) => e.status === "Active").reduce((s, e) => s + Number(e.basicSalaryNPR || 0), 0)
    : payrollRecs.reduce((s, p) => s + Number(p.grossNPR || p.netNPR || p.amountNPR || p.amount || 0), 0);

  // Real weekly expense trend (last 7 weeks)
  const weeklyExpTrend = Array.from({ length: 7 }, (_, i) => {
    const wEnd = new Date(); wEnd.setDate(wEnd.getDate() - i * 7);
    const wStart = new Date(wEnd); wStart.setDate(wStart.getDate() - 6);
    const wKey = wStart.toISOString().slice(0, 10);
    const wKeyEnd = wEnd.toISOString().slice(0, 10);
    return expenses.filter((e) => e.date >= wKey && e.date <= wKeyEnd).reduce((s, e) => s + Number(e.amountNPR || 0), 0);
  }).reverse();
  const weeklyExpLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i) * 7);
    return `W${Math.ceil(d.getDate() / 7)}`;
  });

  const totalRevNPR = orders.reduce((s, o) => s + Number(o.totalValueNPR || 0), 0);
  const totalCostNPR = orderCosts.reduce((s, c) => s + Number(c.material || 0) + Number(c.labour || 0) + Number(c.overhead || 0) + Number(c.shipping || 0), 0);
  const totalProfitNPR = totalRevNPR - totalCostNPR;

  return {
    monthExpNPR: monthExpOnlyNPR + monthPurchNPR + monthPayrollNPR,
    monthPurchNPR, monthPayrollNPR, payrollIsEstimate,
    weeklyExpTrend, weeklyExpLabels,
    thisMonthRevNPR: invoices
      .filter((inv) => (inv.date || "").slice(0, 7) === thisMonth && inv.status !== "Cancelled" && inv.status !== "Draft")
      .reduce((s, inv) => s + toNPR(inv.totalNPR, inv.currency), 0),
    totalRevNPR, totalCostNPR, totalProfitNPR,
    avgMargin: totalRevNPR > 0 ? ((totalProfitNPR / totalRevNPR) * 100).toFixed(1) : "0.0",
  };
}

/**
 * Who is not at work today, by name. Late arrivals are in but worth knowing about;
 * leave and absence are marked on the day; anyone on the roster with no mark at all
 * is "not in yet", which is all the data can honestly say.
 */
export function whosOut(attendance, users, today) {
  const rows = attendance.filter((r) => r.date === today);
  const marked = new Set(rows.map((r) => (r.staffName || "").toLowerCase()));
  const out = [];
  rows.forEach((r) => {
    if (r.status === "Late") out.push({ name: r.staffName, personId: r.person_id, kind: "late", note: r.lateMinutes ? `${r.lateMinutes} min late` : "Late" });
    else if (r.status === "Leave") out.push({ name: r.staffName, personId: r.person_id, kind: "leave", note: "On leave" });
    else if (r.status === "Absent") out.push({ name: r.staffName, personId: r.person_id, kind: "absent", note: "Absent" });
  });
  users
    .filter((u) => u.status !== "Inactive" && ["nepal_admin", "employee", "nepal_staff"].includes(u.role))
    .forEach((u) => { if (!marked.has((u.name || "").toLowerCase())) out.push({ name: u.name, personId: u.personId, kind: "absent", note: "Not in yet" }); });
  const rank = { absent: 0, leave: 1, late: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/** "5 min ago", "3 h ago", "2 d ago" — for things that arrive on their own, like leads. */
export function ago(ts) {
  const ms = tsMillis(ts);
  if (!ms) return "";
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins || 1} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}

/** Days from today to a YYYY-MM-DD date; negative is in the past. */
export function daysFromToday(iso) {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const when = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Math.round((when - startOfToday) / 86400000);
}

/** This person's attendance rows for the current month, and the counts the calendar tile shows. */
export function useAttendanceMonth(personId) {
  const [state, setState] = useState({ loading: true, counts: { present: 0, late: 0, leave: 0 }, monthAtt: [] });
  const load = useCallback(async () => {
    let all = [];
    try {
      all = await fetchAll("attendance", { filters: [{ field: "person_id", value: personId }] });
    } catch (_) { /* the rest of the dashboard still renders */ }
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthAtt = all.filter((r) => r.date?.slice(0, 7) === monthKey);
    setState({
      loading: false,
      monthAtt,
      counts: {
        present: monthAtt.filter((r) => r.status === "Present").length,
        late: monthAtt.filter((r) => r.status === "Late").length,
        leave: monthAtt.filter((r) => r.status === "Leave").length,
      },
    });
  }, [personId]);
  useEffect(() => { load(); }, [load]);
  return [state, load];
}

/** The next few things on the content calendar, soonest first, with days to go. */
export function upcomingEntries(items, limit = 6) {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  return items
    .filter((e) => e.scheduledDate)
    .map((e) => {
      const when = new Date(`${String(e.scheduledDate).slice(0, 10)}T00:00:00`);
      return { ...e, inDays: Math.round((when - startOfToday) / 86400000) };
    })
    .filter((e) => !Number.isNaN(e.inDays) && e.inDays >= 0)
    .sort((a, b) => a.inDays - b.inDays)
    .slice(0, limit);
}

/* ── Production ─────────────────────────────────────────── */

/** An order that is still on the floor: not done, not cancelled, not delivered. */
export const isInProgress = (o) =>
  !["Completed", "Cancelled", "Delivered"].includes(o.status) && !["Delivered", "Cancelled"].includes(o.stage);

/** Newest first, the way the old "Active orders" row ordered them. */
export const newestFirst = (orders) =>
  [...orders].sort((a, b) => (b.date || b.createdAt || "").localeCompare(a.date || a.createdAt || ""));

export const PIPE_STAGES = [
  { id: "Order Received", label: "Received" },
  { id: "Cutting",        label: "Cutting" },
  { id: "Stitching",      label: "Stitching" },
  { id: "Quality Check",  label: "QC" },
  { id: "Shipped",        label: "Dispatch" },
];

/** How many of these orders sit in each of the five pipeline stages (finer stages fold into the nearest). */
export function countByStage(orders) {
  return PIPE_STAGES.map((st) => ({
    ...st,
    n: orders.filter((o) =>
      o.stage === st.id ||
      (st.id === "Stitching" && ["Fabric Sourcing", "Stitching", "Finishing & Pressing", "Embellishment"].includes(o.stage)) ||
      (st.id === "Shipped" && ["Shipped", "Delivered", "Packing"].includes(o.stage))
    ).length,
  }));
}

/** Live hand-offs to the floor: who has been asked to do what, and whether they answered. */
export function useAssignments() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchAll("order_assignments", {
        filters: [{ field: "status", op: "in", value: ["pending", "accepted", "in_progress", "timed_out"] }],
      })
        .then((r) => { if (alive) setRows(r); })
        .catch(() => { if (alive) setRows((cur) => cur ?? []); }); // the tile still reads without it
    load();
    const off = subscribe("order_assignments", load);
    return () => { alive = false; off(); };
  }, []);

  return useMemo(() => {
    if (!rows) return { loading: true, byOrder: {}, counts: { timedOut: 0, pending: 0, active: 0 } };
    const byOrder = {};
    rows.forEach((a) => {
      // keep the most recent hand-off per order
      if (!byOrder[a.orderId] || tsMillis(a.assignedAt) > tsMillis(byOrder[a.orderId].assignedAt)) byOrder[a.orderId] = a;
    });
    const counts = {
      timedOut: rows.filter((a) => a.status === "timed_out").length,
      pending: rows.filter((a) => a.status === "pending").length,
      active: rows.filter((a) => a.status === "accepted" || a.status === "in_progress").length,
    };
    return { loading: false, byOrder, counts };
  }, [rows]);
}

/* ── Stock ──────────────────────────────────────────────── */

/** Items at or under their reorder point (an item with no reorder point is never "low"). */
export function lowStockItems(inventory) {
  return inventory
    .map((item) => {
      const qty = Number(item.quantity ?? (Number(item.openingStock || 0) + Number(item.stockIn || 0) - Number(item.stockUsed || 0)));
      const reorder = Number(item.reorderPoint ?? item.minLevel ?? 0);
      return { item, qty, reorder };
    })
    .filter(({ qty, reorder }) => reorder > 0 && qty <= reorder);
}

/* ── Bank ───────────────────────────────────────────────── */

const BANK_VIEWERS = ["zen", "finn", "wilson", "admin"];
export const canSeeBank = (profile) => BANK_VIEWERS.includes((profile?.name || "").toLowerCase());

/** The latest bank transaction; its running balance is the balance. Only fetched for those who may see it. */
export function useBank(profile) {
  const allowed = canSeeBank(profile);
  const [state, setState] = useState({ loading: allowed, txn: null });
  useEffect(() => {
    if (!allowed) { setState({ loading: false, txn: null }); return undefined; }
    let alive = true;
    const load = async () => {
      try {
        const rows = await fetchAll("bank_transactions", { orderBy: "timestamp", orderDir: "desc", limit: 1 });
        if (alive) setState({ loading: false, txn: rows[0] || null });
      } catch (error) {
        console.error("Error fetching bank balance:", error);
        if (alive) setState((s) => ({ ...s, loading: false }));
      }
    };
    load();
    // The n8n importer writes these in the background, so keep watching.
    const off = subscribe("bank_transactions", load);
    return () => { alive = false; off(); };
  }, [allowed]);
  return { allowed, ...state };
}

/* ── Small formatters ───────────────────────────────────── */

export const shortDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

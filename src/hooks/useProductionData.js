/**
 * Everything the Production page reads, and how it keeps it fresh.
 *
 *   reload()        reads every collection the page and its dialogs use (once at the start, and
 *                   after anything that changes more than orders: a new order, an invoice, stock)
 *   reloadOrders()  reads only the orders, which is all a stage move, a hold, a note or a new date
 *                   changes. The page also asks for this every minute while it is on screen and
 *                   when the tab comes back, because nobody else's change reaches it otherwise.
 *
 * The labour rate is last month's production payroll divided by the pieces that passed QC that
 * month in the batch log, so a month with no batches has no rate.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAll } from "../lib/db";

const POLL_MS = 60000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const NONE = {
  orders: [], employees: [], invoices: [], orderCosts: {}, labourRatePerUnit: null,
  fabrics: [], samples: [], customers: [], challans: [], quotations: [], deductedRefs: new Set(),
};

const STALE = "Could not refresh just now. This is what was loaded last.";

const newestFirst = (rows) => [...rows].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

export default function useProductionData({ canDeductStock }) {
  // state: loading | ready | error. A failed refresh keeps what was on screen and says so; it remembers
  // which kind failed, so a good look at the orders does not hide that the rest could not be read.
  const [status, setStatus] = useState({ state: "loading", full: "", orders: "" });
  const ready = useRef(false);
  ready.current = status.state === "ready";
  const [data, setData] = useState(NONE);
  const token = useRef(0);            // every read takes one, so a slow answer cannot overwrite a newer one
  const fullApplied = useRef(0);
  const ordersApplied = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++token.current;
    try {
      const [batchRows, orderRows, empRows, invRows, costRows, payrollData, fabricRows, sampleRows, customerRows, challanRows, quotationRows, deductionRows] = await Promise.all([
        fetchAll("production"),
        fetchAll("orders"),
        fetchAll("employees"),
        fetchAll("invoices"),
        fetchAll("order_costs"),
        fetchAll("finance_payroll"),
        fetchAll("fabrics"),
        fetchAll("samples"),
        fetchAll("customers"),
        // Challans and quotations are only read to offer them (as an order's document, and for the
        // client names on them). A role that cannot read them still gets the invoices.
        fetchAll("challans").catch(() => []),
        fetchAll("quotations").catch(() => []),
        // Which orders already had their materials deducted. Only asked for by people who can act on
        // it: the database returns nothing to anyone without inventory access, which would read as
        // "nothing deducted".
        canDeductStock
          ? fetchAll("stock_movements", { filters: [{ field: "source", value: "production" }] }).catch(() => [])
          : Promise.resolve([]),
      ]);
      if (mine < fullApplied.current) return;
      fullApplied.current = mine;

      // Keyed by the order it belongs to, which is what the cards look up.
      const orderCosts = {};
      costRows.forEach((c) => { if (c.orderId) orderCosts[c.orderId] = c; });

      // Auto labour rate: last month's payroll divided by the units produced then.
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
      const prodWorkers = new Set(empRows.filter((e) => e.isProductionWorker).map((e) => (e.name || "").toLowerCase()));
      const lastMonthPayroll = payrollData
        .filter((p) => p.month === MONTHS[lastMonth.getMonth()] && Number(p.year) === lastMonth.getFullYear())
        .filter((p) => prodWorkers.size === 0 || prodWorkers.has((p.staffName || "").toLowerCase()))
        .reduce((s, p) => s + Number(p.netNPR || 0), 0);
      const lastMonthUnits = batchRows
        .filter((b) => (b.date || "").slice(0, 7) === lastMonthKey)
        .reduce((s, b) => s + Number(b.passed || 0), 0);

      // A newer read of just the orders may already have landed; if so, keep its orders.
      const takeOrders = mine >= ordersApplied.current;
      if (takeOrders) ordersApplied.current = mine;
      setData((d) => ({
        orders: takeOrders ? newestFirst(orderRows) : d.orders,
        employees: empRows.filter((e) => e.status !== "Inactive"),
        invoices: invRows,
        orderCosts,
        labourRatePerUnit: lastMonthPayroll > 0 && lastMonthUnits > 0 ? lastMonthPayroll / lastMonthUnits : null,
        fabrics: fabricRows,
        samples: sampleRows,
        customers: customerRows,
        challans: challanRows,
        quotations: quotationRows,
        deductedRefs: new Set(deductionRows.map((m) => m.sourceId).filter(Boolean)),
      }));
      setStatus({ state: "ready", full: "", orders: "" });
    } catch (err) {
      console.error("Failed to load production data:", err);
      if (mine < fullApplied.current) return;
      // Whatever was on screen stays; only the very first read has nothing to fall back on.
      setStatus((s) => (s.state === "ready"
        ? { ...s, full: STALE }
        : { state: "error", full: err?.message || "Could not load production.", orders: "" }));
    }
  }, [canDeductStock]);

  const reloadOrders = useCallback(async () => {
    const mine = ++token.current;
    try {
      const rows = await fetchAll("orders");
      if (mine < ordersApplied.current) return;
      ordersApplied.current = mine;
      setData((d) => ({ ...d, orders: newestFirst(rows) }));
      setStatus((s) => (s.orders ? { ...s, orders: "" } : s));
    } catch (err) {
      console.error("Failed to refresh orders:", err);
      if (mine < ordersApplied.current) return;      // a newer read of the orders already landed: this failure is old news
      setStatus((s) => (s.state === "ready" ? { ...s, orders: STALE } : s));
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    // Only while the page has loaded: a page showing "could not load" waits for Try again, which reads everything.
    const look = () => { if (!document.hidden && ready.current) reloadOrders(); };
    const id = setInterval(look, POLL_MS);
    document.addEventListener("visibilitychange", look);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", look); };
  }, [reloadOrders]);

  const addCustomer = useCallback((c) => setData((d) => ({ ...d, customers: [...d.customers, c] })), []);

  return { ...data, status: status.state, error: status.full || status.orders, reload, reloadOrders, addCustomer };
}

/**
 * Sales, on the same frosted-glass bento frame as the Dashboard, Tasks and Attendance: one screen, no
 * page scroll, the lists scroll inside their tiles.
 *
 * It is two old pages on one screen. The old Sales page was the order pipeline; the old Customers page
 * was the chain customer -> orders -> invoices -> payments, which answers who pays, who owes and who is
 * worth having. Both answer "how is selling going", so they live here now:
 *
 *   top row   invoiced, collected and still owed (the customers' rows added up), and the pipeline,
 *             whose stage cells also filter the orders list under it
 *   left      customers: search, "owing", and every customer's money in a table whose heads sort; a row
 *             opens that customer's card (details, invoices, payments, orders; with edit rights it also
 *             saves, merges a duplicate and deletes)
 *   right     orders, newest first: open, delivered or all
 *
 * The tables are the shared DataTable and the card is the shared EditCard (DESIGN.md). The sums live in
 * lib/sales.js. This file loads the five collections, keeps what is selected, and does the writes (save,
 * merge, delete), each of which checks that the database really did it: row-level security drops a
 * refused write without an error.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteRow, fetchAll, fetchOne, insertRow, subscribe, updateRow } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { useRegion } from "../context/RegionContext";
import { useCurrency } from "../context/CurrencyContext";
import { RegionSwitch } from "../components/RegionSwitch";
import { countUntagged, filterByRegion } from "../utils/region";
import { sectionCanEdit, sectionVisible } from "../utils/permissions";
import { kathmanduDate } from "../utils/date";
import useMedia from "../hooks/useMedia";
import { BentoGrid, BentoPage } from "../components/bento/Bento";
import { Icons } from "../components/ui";
import { InvoicedTile, CollectedTile, OwedTile } from "../components/sales/MoneyTiles";
import PipelineTile from "../components/sales/PipelineTile";
import CustomersTile from "../components/sales/CustomersTile";
import OrdersTile from "../components/sales/OrdersTile";
import CustomerCard from "../components/sales/CustomerCard";
import OrderDetails from "../components/sales/OrderDetails";
import MergeDialog from "../components/sales/MergeDialog";
import {
  customerTotals, invoiceForOrder, invoicedByMonth, isDelivered, orderSums, ordersFor, rollUp, stageCounts, unlinkedInvoices,
  visibleCustomers,
} from "../lib/sales";
import "../components/sales/sales.css";

const PHONE_ROWS = 8;     // a phone's page scrolls, so each list shows this many until "Show all" is pressed

const SOURCES = [
  { key: "customers", collection: "customers", opts: { orderBy: "name", orderDir: "asc" } },
  { key: "orders", collection: "orders" },
  { key: "invoices", collection: "invoices" },
  { key: "payments", collection: "payments" },
  { key: "orderCosts", collection: "order_costs" },
];

const EMPTY_RAW = { customers: [], orders: [], invoices: [], payments: [], orderCosts: [] };

const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);
const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

export default function Sales() {
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "customers");
  const seesMoney = sectionVisible(profile, "billing");
  const { region } = useRegion();
  const { fmt, ratesVersion } = useCurrency();
  const phone = useMedia("(max-width: 768px)");

  const [raw, setRaw] = useState(EMPTY_RAW);
  const [status, setStatus] = useState("loading");        // loading | ready | error
  const [lost, setLost] = useState([]);                   // collections the last look could not read
  const seq = useRef(0);

  // "today" is the office's date, as Production's is, and moves on at midnight without a reload
  const [today, setToday] = useState(() => kathmanduDate());
  useEffect(() => {
    const id = setInterval(() => setToday(kathmanduDate()), 60000);
    return () => clearInterval(id);
  }, []);

  const [query, setQuery] = useState("");
  const [owing, setOwing] = useState(false);
  const [view, setView] = useState("open");
  const [stage, setStage] = useState("");
  const [oQuery, setOQuery] = useState("");
  const [moreCustomers, setMoreCustomers] = useState(false);
  const [moreOrders, setMoreOrders] = useState(false);
  const [panel, setPanel] = useState(null);               // null, or { id (null for a new customer), tab }: the customer's card
  const [orderId, setOrderId] = useState(null);           // the order whose card is open
  const [merging, setMerging] = useState(null);           // the id of the customer being merged into another

  /* ── loading ───────────────────────────────────────────── */

  // Each collection on its own: one that fails (or that this position cannot read) must not blank the others.
  const load = useCallback(async () => {
    const mine = ++seq.current;
    const settled = await Promise.allSettled(SOURCES.map((s) => fetchAll(s.collection, s.opts)));
    if (mine !== seq.current) return;                // a newer look is on its way
    const got = {};
    const missed = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") got[SOURCES[i].key] = r.value;
      else {
        missed.push(SOURCES[i].collection);
        console.error(`Sales: could not load ${SOURCES[i].collection}:`, r.reason);
      }
    });
    setLost(missed);
    if (missed.length === SOURCES.length) { setStatus((s) => (s === "ready" ? "ready" : "error")); return; }
    setRaw((prev) => ({ ...prev, ...got }));
    setStatus("ready");
  }, []);

  useEffect(() => { load(); }, [load]);

  // Orders and invoices are in the live feed, so the page follows them; everything else is looked at again when the tab comes back.
  useEffect(() => {
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = setTimeout(load, 800); };
    const offs = ["orders", "invoices"].map((c) => subscribe(c, later));
    const back = () => { if (!document.hidden) later(); };
    document.addEventListener("visibilitychange", back);
    return () => {
      clearTimeout(timer);
      offs.forEach((off) => off());
      document.removeEventListener("visibilitychange", back);
    };
  }, [load]);

  const ready = status === "ready";

  /* ── what is on screen ─────────────────────────────────── */

  // A customer belongs to one arm of the business, and their orders, invoices and payments follow them rather than being
  // filtered separately: otherwise an untagged invoice would vanish from a customer who is visible and the totals would
  // silently stop adding up. The orders list and pipeline go by each order's own region.
  const rows = useMemo(() => {
    const orderCosts = {};
    raw.orderCosts.forEach((c) => { if (c.orderId) orderCosts[c.orderId] = c; });
    return rollUp({
      customers: filterByRegion(raw.customers, region),
      orders: raw.orders,
      invoices: raw.invoices,
      payments: raw.payments,
      orderCosts,
    }, today);
    // ratesVersion: invoice sums convert at the live rate, so new rates mean new sums
  }, [raw, region, today, ratesVersion]);

  const totals = useMemo(() => customerTotals(rows), [rows]);
  const months = useMemo(() => invoicedByMonth(rows, today), [rows, today]);
  const unlinked = useMemo(() => unlinkedInvoices(filterByRegion(raw.invoices, region)), [raw.invoices, region, ratesVersion]);
  // Margin is only known where costs were entered by hand (Finance -> Order P&L); until anyone has, the column stays out of the way
  const hasMargin = totals.withCosts > 0;
  const customers = useMemo(() => visibleCustomers(rows, { query, onlyOwing: owing }), [rows, query, owing]);
  const counts = useMemo(() => ({ all: rows.length, active: totals.active, owing: rows.filter((c) => c.outstandingNPR > 0.5).length }), [rows, totals.active]);

  const orders = useMemo(() => filterByRegion(raw.orders, region), [raw.orders, region]);
  const sums = useMemo(() => orderSums(orders, today), [orders, today]);
  const stages = useMemo(() => stageCounts(orders), [orders]);
  const orderCounts = useMemo(() => ({ open: sums.open, delivered: orders.filter(isDelivered).length, all: orders.length }), [orders, sums.open]);
  const orderRows = useMemo(() => ordersFor(orders, view, stage, oQuery), [orders, view, stage, oQuery]);

  const customerIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  // the merge dialog reads its customer from the rows each time, so after a reload it shows what is there now, not what was there when it opened
  const mergingRow = merging ? rows.find((r) => r.id === merging) || null : null;
  useEffect(() => { if (merging && ready && !mergingRow) setMerging(null); }, [merging, ready, mergingRow]);
  const openRow = panel?.id ? rows.find((r) => r.id === panel.id) || null : null;
  // a customer who is no longer there (merged away, deleted, or filed on the other side of the region switch) closes their panel
  useEffect(() => { if (panel?.id && ready && !openRow) setPanel(null); }, [panel, ready, openRow]);

  // the same for an order's card: an order that has gone (deleted in Production, or filed on the other side of the switch) closes it
  const openOrder = orderId ? orders.find((o) => o.id === orderId) || null : null;
  useEffect(() => { if (orderId && ready && !openOrder) setOrderId(null); }, [orderId, ready, openOrder]);
  const orderInvoice = useMemo(() => (openOrder ? invoiceForOrder(openOrder, raw.invoices) : null), [openOrder, raw.invoices]);

  const pickStage = (next) => { setStage(next); if (next && view === "delivered") setView("open"); setMoreOrders(false); };
  const pickView = (next) => { setView(next); if (next === "delivered") setStage(""); setMoreOrders(false); };

  // steady functions, so the tables' columns are not rebuilt on every keystroke elsewhere
  const openCustomer = useCallback((id, tab) => setPanel({ id, tab }), []);
  const openOrderCard = useCallback((id) => setOrderId(id), []);
  // from an order to the customer behind it: one card at a time, so the order's closes as the customer's opens
  const orderToCustomer = () => { const id = openOrder?.customer_id; setOrderId(null); if (id) openCustomer(id, "orders"); };

  /* ── writes ────────────────────────────────────────────── */

  async function saveCustomer(payload, id) {
    try {
      if (id) {
        const saved = await updateRow("customers", id, payload);
        // a refused update comes back without an error, as the row it was
        const kept = saved && Object.keys(payload).every((k) => same(saved[k], payload[k]));
        if (!kept) throw new Error("The database kept the old details.");
      } else {
        await insertRow("customers", payload);
      }
      setPanel(null);
      await load();
      return { ok: true };
    } catch (err) {
      console.error("Failed to save customer:", err);
      return { ok: false, message: "Not saved. You may not have permission to edit customers." };
    }
  }

  /* What still points at a customer, read fresh. The page's copy can be minutes old, and deleting a customer unlinks (the
     links are ON DELETE SET NULL) whatever the copy did not know about. */
  async function linkedCount(customerId) {
    const [o, i, p] = await Promise.all([
      fetchAll("orders", { filters: [{ field: "customer_id", value: customerId }] }),
      fetchAll("invoices", { filters: [{ field: "customerId", value: customerId }] }),
      fetchAll("payments", { filters: [{ field: "customerId", value: customerId }] }),
    ]);
    return o.length + i.length + p.length;
  }

  /* Repoint the losing customer's records, then remove them. Done row by row from the client because that is the only write
     path the app has; the orders/invoices/payments FKs make the result consistent either way. Each move is checked before
     anything is deleted, so a refused one cannot end with a customer gone and their records left behind; and so is
     whatever was added to them since the page last looked. */
  async function mergeCustomers(source, targetId) {
    try {
      const moved = await Promise.all([
        ...source.orders.map(async (o) => (await updateRow("orders", o.id, { customer_id: targetId }))?.customer_id === targetId),
        ...source.invoices.map(async (i) => (await updateRow("invoices", i.id, { customerId: targetId }))?.customerId === targetId),
        ...source.payments.map(async (p) => (await updateRow("payments", p.id, { customerId: targetId }))?.customerId === targetId),
      ]);
      if (moved.some((ok) => !ok)) throw new Error("The database refused to move some records.");
      if ((await linkedCount(source.id)) > 0) {
        await load();
        return { ok: false, message: `Something new was added to ${source.name} while you were merging, so they were not deleted. Merge again to move it too.` };
      }
      await deleteRow("customers", source.id);
      if (await fetchOne("customers", source.id)) {
        await load();
        return { ok: false, message: `Everything was moved, but ${source.name} could not be deleted. You may not have permission to edit customers.` };
      }
      setMerging(null);
      setPanel(null);
      await load();
      return { ok: true };
    } catch (err) {
      console.error("Merge failed:", err);
      await load();
      return { ok: false, message: "Merge failed partway. Check the customer before trying again." };
    }
  }

  async function deleteCustomer(c) {
    try {
      if ((await linkedCount(c.id)) > c.orders.length + c.invoices.length + c.payments.length) {
        await load();
        return { ok: false, message: `Something new was linked to ${c.name} since you opened them, so nothing was deleted. Have another look.` };
      }
      await deleteRow("customers", c.id);
      if (await fetchOne("customers", c.id)) throw new Error("The database kept the customer.");
    } catch (err) {
      console.error("Failed to delete customer:", err);
      return { ok: false, message: "Could not delete. You may not have permission to edit customers." };
    }
    setPanel(null);
    await load();
    return { ok: true };
  }

  /* ── the page ──────────────────────────────────────────── */

  const sub = ready ? (
    <>
      <span>{sums.open} {plural(sums.open, "order")} open</span>
      {seesMoney && totals.outstanding > 0.5 && <span>{fmt(totals.outstanding)} owed</span>}
      {seesMoney && totals.overdue > 0.5 && <span className="kb-bad">{fmt(totals.overdue)} overdue</span>}
      {/* what the money tiles leave out: it is said up here, where every window size shows it */}
      {seesMoney && unlinked.n > 0 && <span title="They are left out of the totals on this page">{unlinked.n} {plural(unlinked.n, "invoice")} ({fmt(unlinked.npr)}) not linked to a customer</span>}
    </>
  ) : status === "error" ? null : <span>Loading…</span>;

  const loading = !ready;

  return (
    <BentoPage className="sl-page">
      <header className="kb-head">
        <div className="kb-head-l">
          <h1>Sales</h1>
          <p className="kb-head-sub">{sub}</p>
        </div>
        <div className="kb-head-r">
          <RegionSwitch untagged={countUntagged(raw.orders) + countUntagged(raw.customers)} size="sm" />
          {canEdit && (
            <button type="button" className="kb-btn kb-btn--primary sl-newbtn" onClick={() => openCustomer(null)}>
              <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> Add customer
            </button>
          )}
        </div>
      </header>

      {ready && lost.length > 0 && (
        <div className="sl-banner" role="status">
          <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
          <span>Could not load {lost.join(", ").replace("order_costs", "order costs")}, so some figures may be missing or out of date.</span>
        </div>
      )}

      {status === "error" ? (
        <div className="kb-error" role="alert">
          <p>Sales could not load. Check your connection and try again.</p>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={load}>Try again</button>
        </div>
      ) : (
        <BentoGrid layout="sales">
          <InvoicedTile totals={totals} months={months} thisMonthNPR={months[months.length - 1]?.npr || 0} loading={loading} />
          <CollectedTile totals={totals} loading={loading} />
          <OwedTile totals={totals} loading={loading} />
          <PipelineTile stages={stages} sums={sums} stage={stage} onStage={pickStage} loading={loading} />
          <CustomersTile
            rows={customers} counts={counts} hasMargin={hasMargin}
            query={query} onQuery={(v) => { setQuery(v); setMoreCustomers(false); }}
            filter={owing ? "owing" : "all"} onFilter={(v) => { setOwing(v === "owing"); setMoreCustomers(false); }}
            activeId={panel?.id || undefined} onOpen={(id) => openCustomer(id)}
            canAdd={canEdit} onAdd={() => openCustomer(null)}
            capped={phone ? PHONE_ROWS : 0} showAll={moreCustomers} onShowAll={() => setMoreCustomers(true)}
            loading={loading}
          />
          <OrdersTile
            rows={orderRows} counts={orderCounts} view={view} onView={pickView}
            stage={stage} onStage={pickStage} query={oQuery} onQuery={(v) => { setOQuery(v); setMoreOrders(false); }}
            today={today} activeId={orderId || undefined} onOpen={openOrderCard}
            capped={phone ? PHONE_ROWS : 0} showAll={moreOrders} onShowAll={() => setMoreOrders(true)}
            loading={loading}
          />
        </BentoGrid>
      )}

      {openOrder && (
        <OrderDetails
          key={openOrder.id}
          order={openOrder}
          invoice={orderInvoice}
          canSeeInvoices={seesMoney}
          today={today}
          canOpenCustomer={sectionVisible(profile, "customers") && Boolean(openOrder.customer_id) && customerIds.has(openOrder.customer_id)}
          canOpenProduction={sectionVisible(profile, "production")}
          onOpenCustomer={orderToCustomer}
          onClose={() => setOrderId(null)}
        />
      )}

      {panel && (!panel.id || openRow) && (
        <CustomerCard
          key={panel.id || "new"}
          customer={openRow}
          startSection={panel.tab}
          canEdit={canEdit}
          region={region}
          today={today}
          onClose={() => setPanel(null)}
          onSave={saveCustomer}
          onAskMerge={(c) => setMerging(c.id)}
          onDelete={deleteCustomer}
        />
      )}

      {mergingRow && (
        <MergeDialog source={mergingRow} rows={rows} onClose={() => setMerging(null)} onMerge={mergeCustomers} />
      )}
    </BentoPage>
  );
}

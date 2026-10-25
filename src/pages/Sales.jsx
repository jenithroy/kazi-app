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
 *   left      customers: a search, ONE Filters button (components/filters: the side of the business, All | Owing |
 *             Overdue, city, money, last paid, who has no activity or orders being made) and every customer's money in
 *             a table whose heads sort; a row opens that customer's card (details, invoices, payments, orders; with
 *             edit rights it also saves, merges a duplicate and deletes)
 *   right     orders, newest first, under their own search and Filters button: Open | Delivered | All and the pipeline's
 *             stage (the same choices the strip makes), customer, fabric, due, order and delivery days, value, on hold
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
import { countUntagged, filterByRegion } from "../utils/region";
import { sectionCanEdit, sectionVisible } from "../utils/permissions";
import { kathmanduDate } from "../utils/date";
import useMedia from "../hooks/useMedia";
import useShowAll from "../hooks/useShowAll";
import { BentoGrid, BentoPage } from "../components/bento/Bento";
import { Icons, cn } from "../components/ui";
import useFilters from "../components/filters/useFilters";
import { addDays } from "../lib/calendar";
import { InvoicedTile, CollectedTile, OwedTile } from "../components/sales/MoneyTiles";
import PipelineTile from "../components/sales/PipelineTile";
import CustomersTile from "../components/sales/CustomersTile";
import OrdersTile from "../components/sales/OrdersTile";
import CustomerCard from "../components/sales/CustomerCard";
import OrderDetails from "../components/sales/OrderDetails";
import MergeDialog from "../components/sales/MergeDialog";
import {
  PIPE_STAGES, customerTotals, deliveredOn, fmtDay, invoiceForOrder, invoicedByMonth, isDelivered, isOpen, orderSums, orderWhen, ordersFor, rollUp,
  stageCounts, stageShort, unlinkedInvoices, visibleCustomers,
} from "../lib/sales";
import { filterRows } from "../lib/customers";
import { mergeCustomerRows } from "../lib/customerWrites";
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
  const { region, label: regionLabel } = useRegion();
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
  const [view, setView] = useState("open");               // the orders' main view (it opens on what is being made), so the panel only mirrors it
  const [stage, setStage] = useState("");                 // the stage the pipeline strip has pressed: the panel mirrors it too
  const [oQuery, setOQuery] = useState("");
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
  const counts = useMemo(() => ({ all: rows.length, active: totals.active, owing: rows.filter((c) => c.outstandingNPR > 0.5).length }), [rows, totals.active]);

  // The customers table has its own search and its own Filters button. The search is lib/sales.js's (`visibleCustomers`, which also orders by
  // what they have been invoiced); "owing" asks it about one customer at a time, so the rule is the old one, and "overdue" is the Customers page's
  // (lib/customers.js). Anything about money is only offered to a position that can see invoices: without them it would read as noughts.
  const searchedCustomers = useMemo(() => visibleCustomers(rows, { query }), [rows, query]);
  const customerDefs = useMemo(() => [
    {
      id: "owing", label: "Which customers", kind: "chips",
      test: (c, v) => (v === "owing" ? visibleCustomers([c], { onlyOwing: true }).length > 0 : filterRows([c], { filter: v }).length > 0),
      options: [
        { value: "all", label: "All" },
        { value: "owing", label: "Owing", tone: counts.owing > 0 ? "warn" : undefined },
        ...(seesMoney ? [{ value: "overdue", label: "Overdue", tone: rows.some((c) => c.overdueNPR > 0.5) ? "bad" : undefined }] : []),
      ],
    },
    { id: "city", label: "City", kind: "select", of: (c) => c.city, any: "Any city", none: "No city" },
    ...(seesMoney ? [
      { id: "owes", label: "Owes", kind: "range", get: (c) => c.outstandingNPR, unit: "NPR", pill: "Owes" },
      { id: "invoiced", label: "Invoiced", kind: "range", get: (c) => c.invoicedNPR, unit: "NPR", pill: "Invoiced" },
      { id: "lastPaid", label: "Last paid between", kind: "dates", get: (c) => c.lastPaidOn || "", show: fmtDay, pill: "Last paid" },
    ] : []),
    { id: "quiet", label: "No activity", kind: "toggle", text: "No activity yet", pill: "No activity", test: (c) => !c.isActive },
    { id: "making", label: "Orders being made", kind: "toggle", text: "Has orders being made", pill: "Orders being made", test: (c) => c.orders.some(isOpen) },
  ], [counts.owing, rows, seesMoney]);
  const ctf = useFilters(customerDefs, searchedCustomers);
  const customers = ctf.rows;
  const customersFiltered = Boolean(query) || ctf.count > 0;
  // a phone shows eight rows until "Show all" is pressed; narrowing the list by anything puts the cap back (as it always did)
  const [moreCustomers, showAllCustomers] = useShowAll(`${query}|${JSON.stringify(ctf.values)}`);

  const orders = useMemo(() => filterByRegion(raw.orders, region), [raw.orders, region]);
  const sums = useMemo(() => orderSums(orders, today), [orders, today]);
  const stages = useMemo(() => stageCounts(orders), [orders]);
  const orderCounts = useMemo(() => ({ open: sums.open, delivered: orders.filter(isDelivered).length, all: orders.length }), [orders, sums.open]);

  // The stage the strip presses sits with the view (a stage only means something for an order still being made), and both are the page's:
  // the panel mirrors them (and the strip mirrors the panel) as choices of its own. Everything else about the orders is the panel's.
  const pickStage = useCallback((next) => { setStage(next); if (next) setView((v) => (v === "delivered" ? "open" : v)); }, []);
  const pickView = useCallback((next) => { setView(next); if (next === "delivered") setStage(""); }, []);
  const searchedOrders = useMemo(() => ordersFor(orders, view, stage, oQuery), [orders, view, stage, oQuery]);
  const orderDefs = useMemo(() => {
    const soon = addDays(today, 7);
    const dueOf = (o) => o.deliveryDate || o.dueDate || "";
    // what pressing a choice would show (with the search, and with the other choice the press leaves alone)
    const nIn = (v, s) => ordersFor(orders, v, s, oQuery).length;
    return [
      {
        id: "view", label: "Show", kind: "chips", controlled: { value: view, set: pickView },
        options: [
          { value: "open", label: "Open", count: nIn("open", stage) },
          { value: "delivered", label: "Delivered", count: nIn("delivered", "") },
          { value: "all", label: "All", count: nIn("all", stage) },
        ],
      },
      {
        id: "stage", label: "Stage", kind: "chips", controlled: { value: stage, set: pickStage },
        options: [
          { value: "", label: "Any", count: nIn(view, "") },
          // (the names the strip uses, so the panel and the strip read the same)
          ...PIPE_STAGES.map((s) => ({ value: s, label: stageShort(s), count: nIn(view === "delivered" ? "open" : view, s) })),
        ],
      },
      { id: "customer", label: "Customer", kind: "select", of: (o) => o.customerName, any: "Any customer", none: "No customer" },
      { id: "fabric", label: "Fabric", kind: "select", of: (o) => o.fabricType, any: "Any fabric", none: "No fabric" },
      {
        id: "due", label: "Due", kind: "chips",
        options: [
          { value: "any", label: "Any time" }, { value: "late", label: "Late", tone: "bad" }, { value: "today", label: "Today" },
          { value: "week", label: "Next 7 days" }, { value: "later", label: "Later" }, { value: "none", label: "No due date" },
        ],
        test: (o, v) => {
          const d = dueOf(o);
          if (v === "none") return !d;
          if (!d) return false;
          if (v === "late") return orderWhen(o, today).late;
          if (v === "today") return d === today;
          if (v === "week") return d > today && d <= soon;
          return d > soon;
        },
      },
      { id: "dueDates", label: "Due between", kind: "dates", get: dueOf, show: fmtDay, pill: "Due" },
      { id: "ordered", label: "Ordered between", kind: "dates", get: (o) => o.date || "", show: fmtDay, pill: "Ordered" },
      { id: "deliveredOn", label: "Delivered between", kind: "dates", get: (o) => (isDelivered(o) ? deliveredOn(o) : ""), show: fmtDay, pill: "Delivered" },
      { id: "value", label: "Order value", kind: "range", get: (o) => (Number(o.totalValueNPR) > 0 ? Number(o.totalValueNPR) : null), unit: "NPR", pill: "Order value" },
      { id: "hold", label: "On hold", kind: "toggle", text: "On hold", pill: "On hold", test: (o) => o.status === "On Hold" },
    ];
  }, [orders, view, stage, oQuery, today, pickView, pickStage]);
  const otf = useFilters(orderDefs, searchedOrders);
  const orderRows = otf.rows;
  const ordersFiltered = Boolean(oQuery || stage) || otf.count > 0;
  const [moreOrders, showAllOrders] = useShowAll(`${view}|${stage}|${oQuery}|${JSON.stringify(otf.values)}`);

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

  /* Merge a duplicate into another customer: the shared write (lib/customerWrites.js) moves their orders, invoices, payments AND tech
     packs, checking each move, before the duplicate is deleted. */
  async function mergeCustomers(source, targetId) {
    const res = await mergeCustomerRows(source, targetId);
    if (res.ok) { setMerging(null); setPanel(null); }
    if (res.reload) await load();
    return res;
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

  // what the money tiles leave out: said up in the header on a laptop, where every window size shows it, and on a phone (where a
  // tooltip cannot be read) as a plain note under the money tiles
  const unlinkedNote = ready && seesMoney && unlinked.n > 0;

  const sub = ready ? (
    <>
      {/* the side of the business is in the Filters panels, so the header says which one is on screen */}
      <span>{regionLabel} · {sums.open} {plural(sums.open, "order")} open</span>
      {seesMoney && totals.outstanding > 0.5 && <span>{fmt(totals.outstanding)} owed</span>}
      {seesMoney && totals.overdue > 0.5 && <span className="kb-bad">{fmt(totals.overdue)} overdue</span>}
      {!phone && unlinkedNote && <span title="They are left out of the totals on this page">{unlinked.n} {plural(unlinked.n, "invoice")} ({fmt(unlinked.npr)}) not linked to a customer</span>}
    </>
  ) : status === "error" ? null : <span>Loading…</span>;

  const loading = !ready;

  return (
    <BentoPage className={cn("sl-page", phone && unlinkedNote && "sl-page--note")}>
      <header className="kb-head kb-head--stack">
        <div className="kb-head-l">
          <h1>Sales</h1>
          <p className="kb-head-sub">{sub}</p>
        </div>
        <div className="kb-head-r">
          {canEdit && (
            <button type="button" className="kb-btn kb-btn--primary sl-newbtn kb-head-act" onClick={() => openCustomer(null)}>
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
          {phone && unlinkedNote && (
            <p className="sl-unlinked" style={{ gridArea: "note" }}>
              <Icons.Alert size={14} sw={1.9} aria-hidden="true" />
              <span>{unlinked.n} {plural(unlinked.n, "invoice")} ({fmt(unlinked.npr)}) {plural(unlinked.n, "is", "are")} not linked to a customer, so {plural(unlinked.n, "it is", "they are")} left out of the totals above.</span>
            </p>
          )}
          {/* on a phone the pipeline is left out: pressing a stage changes the orders list far below it, out of sight */}
          {!phone && <PipelineTile stages={stages} sums={sums} stage={stage} onStage={pickStage} loading={loading} />}
          <CustomersTile
            rows={customers} counts={counts} hasMargin={hasMargin}
            query={query} onQuery={setQuery} filters={ctf} filtered={customersFiltered} untagged={countUntagged(raw.customers)}
            activeId={panel?.id || undefined} onOpen={(id) => openCustomer(id)}
            canAdd={canEdit} onAdd={() => openCustomer(null)}
            capped={phone ? PHONE_ROWS : 0} showAll={moreCustomers} onShowAll={showAllCustomers}
            loading={loading}
          />
          <OrdersTile
            rows={orderRows} counts={orderCounts} view={view}
            stage={stage} onStage={pickStage} query={oQuery} onQuery={setOQuery} filters={otf} filtered={ordersFiltered} untagged={countUntagged(raw.orders)}
            today={today} activeId={orderId || undefined} onOpen={openOrderCard}
            capped={phone ? PHONE_ROWS : 0} showAll={moreOrders} onShowAll={showAllOrders}
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

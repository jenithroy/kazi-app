/**
 * Customers, on the same frosted-glass bento frame as the Dashboard, Sales and Budget: one screen, no page scroll, the list
 * scrolls inside its pane.
 *
 * It answers the question this page was rebuilt for: who owes what, who pays, and who is worth having. Every customer's
 * orders, invoices and payments are added up (the roll-up is the Sales page's, which is the old Customers page's), and the
 * page puts them like this:
 *
 *   top row   invoiced, collected and still owed (the customers' rows added up)
 *   left      every customer with their money, in a table whose heads sort, under a search and ONE Filters button
 *             (components/filters: the side of the business, All | Owing | Overdue | No activity, city, how much is owed and
 *             for how long, invoiced, last paid, when they were added, whether they have orders); a row opens that customer's
 *             card (details, invoices, payments, orders; with edit rights it also saves, merges a duplicate and deletes)
 *   right     two short lists: who is overdue and by how long, and the biggest customers
 *
 * What a position sees follows what the database lets it read: invoices and payments need Billing, orders need Orders. Without
 * Billing the money would read as noughts, so the money tiles, the rail and the money columns are left out and the page is a
 * directory (name, contact, orders). The same goes for a collection that could not be read yet (a failed first look is an empty
 * list, and an empty invoice list reads as "nothing owed"): the page draws no money, or no orders, until it has been read once.
 * What a card may offer follows the right to WRITE what it would touch: a merge moves orders, invoices and payments, so it needs
 * to edit all three; a delete leaves them unlinked, so it needs to see all of them to say what it is leaving.
 *
 * The table is the shared DataTable and the card is the shared EditCard (DESIGN.md). The sums live in lib/customers.js and
 * lib/sales.js, the reads in hooks/useCustomersData.js and the writes (each of which checks that the database really did it)
 * in lib/customerWrites.js. This file keeps what is selected and connects them.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRegion } from "../context/RegionContext";
import { useCurrency } from "../context/CurrencyContext";
import { countUntagged, filterByRegion } from "../utils/region";
import { sectionCanEdit, sectionVisible } from "../utils/permissions";
import { kathmanduDate, tsMillis } from "../utils/date";
import useMedia from "../hooks/useMedia";
import useShowAll from "../hooks/useShowAll";
import useCustomersData from "../hooks/useCustomersData";
import { BentoGrid, BentoPage } from "../components/bento/Bento";
import { Icons } from "../components/ui";
import useFilters from "../components/filters/useFilters";
import { CollectedTile, InvoicedTile, OwedTile } from "../components/customers/Tiles";
import { BiggestTile, OverdueTile } from "../components/customers/Rail";
import CustomersPane from "../components/customers/CustomersPane";
import CustomerCard from "../components/sales/CustomerCard";
import MergeDialog from "../components/sales/MergeDialog";
import { customerTotals, fmtDay, isOpen, rollUp } from "../lib/sales";
import { biggest, countsOf, filterRows, lateOf, overdueList } from "../lib/customers";
import { deleteCustomerRow, mergeCustomerRows, saveCustomerRow } from "../lib/customerWrites";
import "../components/customers/customers.css";

const PHONE_ROWS = 8;     // a phone's page scrolls, so the list shows this many until "Show all" is pressed

const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);
/** The Kathmandu day a timestamp falls on, "YYYY-MM-DD" (or "" when there is none). */
const dayOfTs = (ts) => { const ms = tsMillis(ts); return ms ? kathmanduDate(ms) : ""; };

export default function Customers() {
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "customers");
  const { region, label: regionLabel } = useRegion();
  const { fmt, ratesVersion } = useCurrency();
  const phone = useMedia("(max-width: 768px)");
  const { raw, status, lost, known, reload } = useCustomersData();
  const ready = status === "ready";
  const first = status === "loading";                      // the first look is still on its way: the page is drawn as it will be, in skeletons

  // Invoices and payments are Billing's and orders are Orders': a position without them sees noughts, and so does a page whose first read
  // of them failed. Either way the money (or the orders) is left out rather than drawn as noughts.
  const moneyPerm = sectionVisible(profile, "billing");
  const ordersPerm = sectionVisible(profile, "orders");
  const money = moneyPerm && (first || Boolean(known.invoices && known.payments));
  const orders = ordersPerm && (first || Boolean(known.orders));
  const canMerge = money && orders && sectionCanEdit(profile, "billing") && sectionCanEdit(profile, "orders");
  const canDelete = money && orders;

  // "today" is the office's date, as Production's and Sales' is, and moves on at midnight without a reload
  const [today, setToday] = useState(() => kathmanduDate());
  useEffect(() => {
    const id = setInterval(() => setToday(kathmanduDate()), 60000);
    return () => clearInterval(id);
  }, []);

  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState(null);               // null, or { id (null for a new customer), tab }: the customer's card
  const [merging, setMerging] = useState(null);           // the id of the customer being merged into another
  const [retrying, setRetrying] = useState(false);        // "Try again" has been pressed and the look is on its way

  /* ── what is on screen ─────────────────────────────────── */

  // A customer belongs to one arm of the business, and their orders, invoices and payments follow them rather than being filtered
  // separately: otherwise an untagged invoice would vanish from a customer who is visible, and the totals would silently stop
  // adding up.
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
  const counts = useMemo(() => countsOf(rows), [rows]);
  const billed = useMemo(() => rows.filter((c) => c.invoicedNPR > 0.5).length, [rows]);
  const late = useMemo(() => overdueList(rows, today), [rows, today]);
  const top = useMemo(() => biggest(rows), [rows]);
  // Margin is only known where costs were entered by hand (Finance -> Order P&L); until anyone has, the column stays out of the way
  const hasMargin = totals.withCosts > 0;

  // Who is listed: the search is lib/customers.js's own (`filterRows`), everything else is in the Filters panel. "All | Owing | Overdue |
  // No activity" asks `filterRows` about one customer at a time, so the rules are the old ones. What needs invoices (money) or orders is
  // only offered to a position that can see them: a customer's money reads as noughts without Billing, and nobody "has orders" without Orders.
  const searched = useMemo(() => filterRows(rows, { query }), [rows, query]);
  const filterDefs = useMemo(() => {
    const is = (c, filter) => filterRows([c], { filter }).length > 0;
    return [
      ...(money ? [{
        id: "filter", label: "Which customers", kind: "chips", test: (c, v) => is(c, v),
        options: [
          { value: "all", label: "All" },
          { value: "owing", label: "Owing", tone: counts.owing > 0 ? "warn" : undefined },
          { value: "overdue", label: "Overdue", tone: counts.overdue > 0 ? "bad" : undefined },
          ...(money && orders ? [{ value: "quiet", label: "No activity" }] : []),
        ],
      }] : []),
      { id: "city", label: "City", kind: "select", of: (c) => c.city, any: "Any city", none: "No city" },
      ...(money ? [
        { id: "owes", label: "Owes", kind: "range", get: (c) => c.outstandingNPR, unit: "NPR", pill: "Owes" },
        { id: "lateDays", label: "Days overdue", kind: "range", get: (c) => (c.overdueNPR > 0.5 ? lateOf(c, today).days : null), unit: "days", pill: "Late by" },
        { id: "invoiced", label: "Invoiced", kind: "range", get: (c) => c.invoicedNPR, unit: "NPR", pill: "Invoiced" },
        { id: "lastPaid", label: "Last paid between", kind: "dates", get: (c) => c.lastPaidOn || "", show: fmtDay, pill: "Last paid" },
      ] : []),
      { id: "added", label: "Added between", kind: "dates", get: (c) => dayOfTs(c.createdAt), show: fmtDay, pill: "Added" },
      ...(orders ? [
        { id: "hasOrders", label: "Has orders", kind: "toggle", text: "Has orders", pill: "Has orders", test: (c) => c.orders.length > 0 },
        { id: "making", label: "Orders being made", kind: "toggle", text: "Has orders being made", pill: "Orders being made", test: (c) => c.orders.some(isOpen) },
      ] : []),
    ];
  }, [money, orders, counts, today]);
  const tf = useFilters(filterDefs, searched);
  const { clear: clearFilters } = tf;
  const list = tf.rows;
  const filtered = Boolean(query) || tf.count > 0;
  // a phone shows eight rows until "Show all" is pressed; narrowing the list by anything puts the cap back (as it always did)
  const [more, showAllNow] = useShowAll(`${query}|${JSON.stringify(tf.values)}`);

  // the merge dialog reads its customer from the rows each time, so after a reload it shows what is there now, not what was there when it opened
  const mergingRow = merging ? rows.find((r) => r.id === merging) || null : null;
  useEffect(() => { if (merging && ready && !mergingRow) setMerging(null); }, [merging, ready, mergingRow]);
  const openRow = panel?.id ? rows.find((r) => r.id === panel.id) || null : null;
  // a customer who is no longer there (merged away, deleted, or filed on the other side of the region switch) closes their card
  useEffect(() => { if (panel?.id && ready && !openRow) setPanel(null); }, [panel, ready, openRow]);

  // steady functions, so the table's columns are not rebuilt on every keystroke elsewhere
  const openCustomer = useCallback((id, tab) => setPanel({ id, tab }), []);
  const clearAll = () => { setQuery(""); clearFilters(); };
  // the Overdue tile's count puts the WHOLE list in the table: a search or a filter left on would narrow it again
  const seeOverdue = () => { setQuery(""); clearFilters(); tf.set("filter", "overdue"); };
  const retry = async () => { setRetrying(true); try { await reload(); } finally { setRetrying(false); } };

  /* ── writes (lib/customerWrites.js checks each one; this closes and looks again) ─── */

  async function saveCustomer(payload, id) {
    const res = await saveCustomerRow(payload, id);
    if (res.ok) { setPanel(null); await reload(); }
    return res;
  }

  // The cursor is never dropped: a customer who has gone (merged away or deleted) takes their row with them, so once the list has
  // been read again the cursor goes to the row that took its place. (Which row it was is read before the write, while the open
  // customer's row is still the highlighted one.) React draws the new list a moment after `reload()` returns, so the table's row
  // count (`aria-rowcount`, the whole list, not the phone's first eight) is watched until it changes: focusing sooner would land on
  // the row that is about to be removed. A customer who was not in the table (opened from the rail) changes nothing there, so the
  // wait ends after a short while and the cursor goes to the first row.
  function cursorAfterRemoval() {
    const table = () => document.querySelector('[data-tile="cust"] .dt');
    const rowsNow = [...document.querySelectorAll('[data-tile="cust"] .dt-body .dt-row')];
    const at = Math.max(0, rowsNow.findIndex((r) => r.classList.contains("is-active")));
    const count = table()?.getAttribute("aria-rowcount");
    return () => {
      const started = performance.now();
      const go = () => {
        if (table()?.getAttribute("aria-rowcount") === count && performance.now() - started < 800) { requestAnimationFrame(go); return; }
        const hits = document.querySelectorAll('[data-tile="cust"] .dt-body .dt-hit');
        // the last customer gone leaves no row: the cursor goes to the search box rather than to nothing
        (hits[Math.min(at, hits.length - 1)] || document.querySelector('[data-tile="cust"] .dt-search input'))?.focus({ preventScroll: true });
      };
      requestAnimationFrame(go);
    };
  }

  async function mergeCustomers(source, targetId) {
    const settle = cursorAfterRemoval();
    const res = await mergeCustomerRows(source, targetId);
    if (res.ok) { setMerging(null); setPanel(null); }
    if (res.reload) await reload();
    if (res.ok) settle();
    return res;
  }

  async function deleteCustomer(c) {
    const settle = cursorAfterRemoval();
    const res = await deleteCustomerRow(c);
    if (res.ok) setPanel(null);
    if (res.reload) await reload();
    if (res.ok) settle();
    return res;
  }

  // "Show all" removes its own button, so the cursor goes to the first row it added
  const showAllRows = () => {
    showAllNow();
    requestAnimationFrame(() => document.querySelector(`[data-tile="cust"] .dt-body .dt-row:nth-child(${PHONE_ROWS + 1}) .dt-hit`)?.focus({ preventScroll: true }));
  };

  /* ── the page ──────────────────────────────────────────── */

  // Without Billing and Orders both, a customer with nothing to show is not "quiet", only unseen: the page says nothing about activity
  const activityKnown = money && orders;
  // what the banner says is left out: a position's own lack of rights is not a failure, so only what it may see and could not read
  const moneyOut = moneyPerm && !first && !money;
  const ordersOut = ordersPerm && !first && !orders;

  const sub = ready ? (
    <>
      {/* the side of the business is in the Filters panel, so the header says which one is on screen */}
      <span>{regionLabel} · {rows.length} {plural(rows.length, "customer")}</span>
      {activityKnown && counts.quiet > 0 && <span>{rows.length - counts.quiet} with activity</span>}
      {money && totals.overdue > 0.5 && <span className="kb-bad">{fmt(totals.overdue)} overdue</span>}
    </>
  ) : status === "error" ? null : <span>Loading…</span>;

  const loading = !ready;

  return (
    <BentoPage className="cu-page">
      <header className="kb-head kb-head--stack">
        <div className="kb-head-l">
          <h1>Customers</h1>
          <p className="kb-head-sub">{sub}</p>
        </div>
        <div className="kb-head-r">
          {canEdit && (
            <button type="button" className="kb-btn kb-btn--primary cu-newbtn kb-head-act" onClick={() => openCustomer(null)}>
              <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> Add customer
            </button>
          )}
        </div>
      </header>

      {ready && lost.length > 0 && (
        <div className="cu-banner" role="status">
          <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
          <span>
            Could not load {lost.join(", ").replace("order_costs", "order costs")}, so {moneyOut || ordersOut
              ? `${[moneyOut && "the money", ordersOut && "the orders"].filter(Boolean).join(" and ")} ${moneyOut && ordersOut ? "are" : "is"} left out until ${moneyOut && ordersOut ? "they can" : "it can"} be read.`
              : "some figures may be missing or out of date."}
          </span>
          <button type="button" onClick={retry} disabled={retrying}>{retrying ? "Trying…" : "Try again"}</button>
        </div>
      )}

      {status === "error" ? (
        <div className="kb-error" role="alert">
          <p>Customers could not load. Check your connection and try again.</p>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={retry} disabled={retrying}>{retrying ? "Trying…" : "Try again"}</button>
        </div>
      ) : (
        <BentoGrid layout={money ? "customers" : "customers-plain"}>
          {money && (
            <>
              <InvoicedTile totals={totals} billed={billed} loading={loading} />
              <CollectedTile totals={totals} loading={loading} />
              <OwedTile totals={totals} loading={loading} />
              {/* before the table in the page's order: a phone draws it above the table (grid areas), and the order a keyboard or a screen reader goes in must be the one on screen */}
              <OverdueTile list={late} loading={loading} onOpen={openCustomer} onSeeAll={phone ? undefined : seeOverdue} />
            </>
          )}
          <CustomersPane
            rows={list} counts={counts}
            money={money} orders={orders} margin={hasMargin} year={today.slice(0, 4)}
            query={query} onQuery={setQuery} filters={tf} filtered={filtered} untagged={countUntagged(raw.customers)} onClear={clearAll}
            activeId={panel?.id || undefined} onOpen={(id) => openCustomer(id)}
            canAdd={canEdit} onAdd={() => openCustomer(null)}
            capped={phone ? PHONE_ROWS : 0} showAll={more} onShowAll={showAllRows}
            loading={loading}
          />
          {money && <BiggestTile list={top} loading={loading} onOpen={openCustomer} />}
        </BentoGrid>
      )}

      {panel && (!panel.id || openRow) && (
        <CustomerCard
          key={panel.id || "new"}
          customer={openRow}
          startSection={panel.tab}
          canEdit={canEdit}
          seesMoney={money}
          seesOrders={orders}
          canMerge={canMerge}
          canDelete={canDelete}
          region={region}
          today={today}
          // closes only the card it belongs to: a save or a delete that finishes after the next card has been opened (the page reads again
          // before the old card's own close arrives) must not close that one
          onClose={() => setPanel((cur) => (cur === panel ? null : cur))}
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

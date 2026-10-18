/**
 * Order P&L: what each order brought in against what it cost to make. Costs are typed in (a row opens the order's costs); labour starts
 * from the automatic rate until a labour cost is entered. Cancelled orders are left out of the totals.
 */
import { useMemo, useState } from "react";
import DataTable from "../../table/DataTable";
import { FilterChips, SearchBox } from "../../table/Bar";
import { EmptyNote } from "../../bento/Bento";
import { Icons } from "../../ui";
import FinPane from "../FinPane";
import CostCard from "../cards/CostCard";
import { useFin, emptyWords } from "../FinanceContext";
import { Amt, Chip, ExportButton, Foot, FootSum, NameCell, plural, useMoney, usePhoneRows } from "../parts";
import { orderPnlRows, orderPnlTotals, orderStatusMatches } from "../../../lib/finance";

const has = (hay, q) => String(hay || "").toLowerCase().includes(q);
const stateOf = (o) => o.status || o.stage || "Active";

export default function OrderPnlTab() {
  const f = useFin();
  const { orders, regionOrders, orderCosts, labourRate, canEditTab, loading, fyActive, fy } = f;
  const money = useMoney();
  const canEdit = canEditTab("order p&l");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);                    // an order's id

  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () => orderPnlRows(orders.filter((o) => orderStatusMatches(o, status) && (!q || has(o.orderId || o.id, q) || has(o.customerName, q))), orderCosts, labourRate),
    [orders, status, q, orderCosts, labourRate],
  );
  const totals = useMemo(() => orderPnlTotals(rows), [rows]);
  const [capped, more] = usePhoneRows(rows);
  const counts = useMemo(() => ({
    all: orders.length,
    active: orders.filter((o) => orderStatusMatches(o, "active")).length,
    completed: orders.filter((o) => orderStatusMatches(o, "completed")).length,
  }), [orders]);

  const order = open ? regionOrders.find((o) => o.id === open) || null : null;

  const columns = useMemo(() => [
    {
      // a narrow table has no room for what the order is worth or its margin: they go under the order
      id: "order", label: "Order", grow: true, min: 160, max: 480, sort: (r) => (r.orderId || r.id || "").toLowerCase(),
      render: (r, { dropped }) => (
        <NameCell
          main={r.orderId || r.id} rest={r.customerName || ""}
          extra={[dropped.has("rev") && `Worth ${money(r.revenue)}`, dropped.has("margin") && r.hasCosts && r.margin !== null && `${r.margin.toFixed(1)}% margin`]}
        />
      ),
    },
    { id: "qty", label: "Pieces", width: 84, align: "end", drop: 5, sort: (r) => Number(r.quantity) || 0, render: (r) => <span className="dt-num">{Number(r.quantity || 0).toLocaleString()}</span> },
    { id: "rev", label: "Worth", width: 124, align: "end", drop: 2, first: "desc", sort: (r) => r.revenue, render: (r) => <Amt n={r.revenue} strong /> },
    {
      id: "cost", label: "Cost", width: 124, align: "end", drop: 4, first: "desc", sort: (r) => r.totalCost,
      render: (r) => (r.hasCosts ? <Amt n={r.totalCost} tone="bad" /> : <span className="dt-dim">—</span>),
    },
    {
      id: "profit", label: "Profit", width: 124, align: "end", first: "desc", sort: (r) => (r.hasCosts ? r.profit : null),
      render: (r) => (r.hasCosts ? <Amt n={r.profit} strong tone={r.profit >= 0 ? "good" : "bad"} sign={r.profit >= 0 ? "+ " : ""} /> : <span className="dt-dim">—</span>),
    },
    {
      id: "margin", label: "Margin", width: 104, align: "end", drop: 3, first: "desc", sort: (r) => (r.hasCosts ? r.margin : null),
      render: (r) => (!r.hasCosts ? <Chip tone="warn">No costs</Chip> : r.margin === null ? <span className="dt-dim">—</span> : <Chip tone={r.margin >= 20 ? "good" : r.margin >= 0 ? "warn" : "bad"}>{r.margin.toFixed(1)}%</Chip>),
    },
    { id: "state", label: "Status", width: 112, drop: 6, sort: (r) => stateOf(r).toLowerCase(), render: (r) => <span className="dt-clip dt-dim">{stateOf(r)}</span> },
  ], [money]);

  const csv = useMemo(() => [
    { label: "Order", value: (r) => r.orderId || r.id }, { label: "Customer", value: (r) => r.customerName }, { label: "Pieces", value: (r) => r.quantity },
    { label: "Worth NPR", value: (r) => r.revenue }, { label: "Material", value: (r) => r.mat }, { label: "Labour", value: (r) => r.lab },
    { label: "Overhead", value: (r) => r.ovh }, { label: "Shipping", value: (r) => r.shp }, { label: "Total cost", value: (r) => r.totalCost },
    { label: "Profit", value: (r) => (r.hasCosts ? r.profit : "") }, { label: "Margin %", value: (r) => (r.hasCosts && r.margin !== null ? r.margin.toFixed(1) : "") },
  ], []);

  const empty = emptyWords({ fyActive, fy, noun: "orders", regionCount: regionOrders.length, fallback: "No orders yet. They appear here once they are created." });

  return (
    <>
      <FinPane
        title="Order P&L" note={`${rows.length} of ${orders.length}`} id="fin-pane" labelledBy="fin-tab-order-p-l"
        tools={(
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Search orders" label="Search orders by number or customer" />
            <FilterChips
              label="Which orders" value={status} onChange={setStatus}
              options={[{ value: "all", label: "All", count: counts.all }, { value: "active", label: "Active", count: counts.active }, { value: "completed", label: "Completed", count: counts.completed }]}
            />
          </>
        )}
        actions={<ExportButton name="order-pnl" columns={csv} rows={rows} />}
        foot={(
          <Foot>
            <FootSum count label={plural(rows.length, "order")} value={rows.length} />
            <FootSum label="Worth" value={money(totals.revenue)} />
            <FootSum label="Costs" value={money(totals.cost)} />
            <FootSum label={totals.costed ? `Profit on the ${totals.costed} with costs` : "Profit"} value={totals.profit == null ? "—" : money(totals.profit)} tone={totals.profit == null ? undefined : totals.profit >= 0 ? "good" : "bad"} />
            <FootSum label="Average margin" value={totals.avgMargin != null ? `${totals.avgMargin.toFixed(1)}%` : "—"} />
          </Foot>
        )}
      >
        {labourRate ? (
          <div className="fn-note fn-note--good">
            <Icons.Check size={15} sw={2} aria-hidden="true" />
            <span><b>Automatic labour: {money(labourRate)} a piece</b>, from last month's payroll divided by the pieces passed. Enter a labour cost on an order to override it.</span>
          </div>
        ) : null}
        <DataTable
          className="fn-dense" label="Order profit and loss" rows={capped} rowKey={(r) => r.id} columns={columns}
          defaultSort={{ id: "order", dir: "desc" }} onOpen={(r) => setOpen(r.id)} activeKey={open || undefined}
          rowLabel={(r) => `${canEdit ? "Edit" : "See"} the costs of ${r.orderId || r.id}`} loading={loading}
          empty={<EmptyNote icon={<Icons.File size={22} sw={1.5} />}>{orders.length === 0 ? empty : "Nothing matches that."}</EmptyNote>}
        />
        {more}
      </FinPane>
      {order && <CostCard key={order.id} order={order} onClose={() => setOpen(null)} />}
    </>
  );
}

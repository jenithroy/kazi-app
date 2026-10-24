/**
 * Order P&L: what each order brought in against what it cost to make. Costs are typed in (a row opens the order's costs); labour starts
 * from the automatic rate until a labour cost is entered. Cancelled orders are left out of the totals.
 */
import { useMemo, useState } from "react";
import DataTable from "../../table/DataTable";
import { FindBar } from "../FilterMenu";
import useTabFilters from "../useTabFilters";
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
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);                    // an order's id

  const q = query.trim().toLowerCase();
  const found = useMemo(
    () => orderPnlRows(orders.filter((o) => !q || has(o.orderId || o.id, q) || has(o.customerName, q)), orderCosts, labourRate),
    [orders, q, orderCosts, labourRate],
  );
  // What the Filters panel offers for this list: active or finished, costs entered or not, a profit or a loss, a customer, a stage, what it is worth, its margin.
  const defs = useMemo(() => [
    {
      id: "status", label: "Orders", kind: "chips",
      options: [{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "completed", label: "Completed" }],
      test: (r, v) => orderStatusMatches(r, v),
    },
    {
      id: "costs", label: "Costs", kind: "chips",
      options: [{ value: "any", label: "Any" }, { value: "with", label: "Costs entered" }, { value: "without", label: "No costs yet", tone: "warn" }],
      test: (r, v) => (v === "with" ? r.hasCosts : !r.hasCosts),
    },
    {
      id: "result", label: "Result", kind: "chips",
      options: [{ value: "any", label: "Any" }, { value: "profit", label: "Profit" }, { value: "loss", label: "Loss", tone: "bad" }],
      test: (r, v) => r.hasCosts && (v === "profit" ? r.profit >= 0 : r.profit < 0),
    },
    { id: "customer", label: "Customer", kind: "select", of: (r) => r.customerName, any: "Any customer", none: "No customer" },
    { id: "stage", label: "Stage", kind: "select", of: stateOf, any: "Any stage" },
    { id: "worth", label: "Worth", kind: "range", get: (r) => r.revenue, unit: "NPR" },
    { id: "margin", label: "Margin", kind: "range", get: (r) => (r.hasCosts ? r.margin : null), unit: "%" },
  ], []);
  const tf = useTabFilters(defs, found);
  const rows = tf.rows;
  const totals = useMemo(() => orderPnlTotals(rows), [rows]);
  const [capped, more] = usePhoneRows(rows);

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
        tools={<FindBar value={query} onChange={setQuery} placeholder="Search orders" label="Search orders by number or customer" filters={tf} />}
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

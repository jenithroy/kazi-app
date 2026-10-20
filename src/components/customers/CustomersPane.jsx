import { useMemo } from "react";
import { Icons } from "../ui";
import { EmptyNote, Money, Tile } from "../bento/Bento";
import DataTable, { TwoLine } from "../table/DataTable";
import { FilterChips, SearchBox } from "../table/Bar";
import { Initials } from "../sales/parts";
import { fmtDay } from "../../lib/sales";
import { ordersLine } from "../../lib/customers";

const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/** "17 Sept" in this year, "17 Sept 2025" in any other: someone who last paid long ago must not read as someone who paid this year. */
const lastPaid = (iso, year) => (String(iso).slice(0, 4) === year ? fmtDay(iso).replace(/ \d{4}$/, "") : fmtDay(iso));

/** A customer's name with their initials; under it the city and, when the table has no room for an Orders column, what they have ordered. */
function NameCell({ c, dropped, orders, quiet }) {
  const bits = [];
  if (orders && dropped.has("orders")) bits.push(ordersLine(c));
  if (c.city) bits.push(c.city);
  return (
    <TwoLine
      lead={<Initials name={c.name} />}
      main={<span title={c.name}>{c.name}{quiet && !c.isActive && <em className="cu-quiet">no activity</em>}</span>}
      sub={bits.filter(Boolean).join(" · ")}
    />
  );
}

/**
 * The columns. The name and what is owed never go; the rest step aside as the table narrows (`drop`, the bigger the sooner),
 * so a phone ends up with a name and the one number that matters. `money` is whether this position can see invoices and
 * payments; without it the table is a directory (name, contact, orders) rather than a column of noughts. `orders` is whether it
 * can see orders; `quiet` whether it can tell a customer with no activity from one it just cannot see anything of.
 */
function columnsFor({ money, orders, quiet, margin, year }) {
  const name = {
    id: "name", label: "Customer", grow: true, min: 190, max: 400, sort: (c) => (c.name || "").toLowerCase(),
    render: (c, { dropped }) => <NameCell c={c} dropped={dropped} orders={orders} quiet={quiet} />,
  };
  const ordersCol = {
    id: "orders", label: "Orders", width: 92, align: "end", drop: money ? 7 : undefined, first: "desc", sort: (c) => c.orders.length,
    render: (c) => (c.orders.length > 0 ? (
      <span className="dt-stack">
        <span className="dt-num">{c.orders.length}</span>
        {c.units > 0 && <small>{c.units.toLocaleString()} pcs</small>}
      </span>
    ) : <span className="dt-dim">—</span>),
  };

  if (!money) {
    return [
      name,
      {
        id: "contact", label: "Contact", width: 200, drop: 5, sort: (c) => (c.contactPerson || c.phone || c.email || "").toLowerCase(),
        render: (c) => (c.contactPerson || c.phone || c.email ? (
          <span className="dt-two-t cu-contact">
            <b>{c.contactPerson || c.phone || c.email}</b>
            {c.contactPerson && (c.phone || c.email) ? <span>{c.phone || c.email}</span> : null}
          </span>
        ) : <span className="dt-dim">—</span>),
      },
      ...(orders ? [ordersCol] : []),
    ];
  }

  return [
    name,
    ...(orders ? [ordersCol] : []),
    {
      id: "invoiced", label: "Invoiced", width: 112, align: "end", drop: 3, first: "desc", sort: (c) => c.invoicedNPR,
      render: (c) => <span className="dt-num"><Money npr={c.invoicedNPR} /></span>,
    },
    {
      id: "collected", label: "Collected", width: 124, align: "end", drop: 4, first: "desc", sort: (c) => c.collectedNPR,
      render: (c) => (c.collectedNPR > 0.5 ? (
        <span className="dt-stack">
          <span className="dt-num dt-good"><Money npr={c.collectedNPR} /></span>
          <span className="cu-mini" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, c.collectedPct))}%` }} /></span>
        </span>
      ) : <span className="dt-dim">—</span>),
    },
    {
      id: "owed", label: "Owed", width: 124, align: "end", first: "desc", sort: (c) => c.outstandingNPR,
      render: (c) => (c.outstandingNPR > 0.5 ? (
        <span className="dt-stack">
          <span className="dt-num dt-strong cu-owed"><Money npr={c.outstandingNPR} /></span>
          {c.overdueNPR > 0.5 && <small className="cu-late-s"><Money npr={c.overdueNPR} compact /> overdue</small>}
        </span>
      ) : <span className="dt-dim">—</span>),
    },
    ...(margin ? [{
      id: "margin", label: "Margin", width: 100, align: "end", drop: 5, first: "desc", sort: (c) => c.marginPct,
      render: (c) => (c.marginPct == null
        ? <span className="dt-dim cu-nocost" title="No costs entered against this customer's orders">no cost data</span>
        : <span className={`dt-num dt-strong ${c.marginPct >= 0 ? "dt-good" : "dt-bad"}`}>{c.marginPct.toFixed(1)}%</span>),
    }] : []),
    {
      id: "last", label: "Last paid", width: 112, align: "end", drop: 6, first: "desc", sort: (c) => c.lastPaidOn || null,
      render: (c) => (c.lastPaidOn ? (
        <span className="dt-stack">
          <span className="dt-num">{lastPaid(c.lastPaidOn, year)}</span>
          {c.avgDaysToPay != null && <small>~{c.avgDaysToPay}d to pay</small>}
        </span>
      ) : <span className="dt-dim">—</span>),
    },
  ];
}

/**
 * Every customer: search, a filter that carries counts (All · Owing · Overdue · No activity), and a table that scrolls inside the
 * pane, whose heads sort. A row opens that customer's card.
 *
 * What it shows depends on what the position may see. With Billing it is the money chain (invoiced, collected, owed and how late,
 * last paid); without it, a directory (contact and orders), because the invoices would read as noughts. With neither Billing nor
 * Orders it cannot tell a quiet customer from one it simply cannot see anything of, so it says nothing about activity.
 */
export default function CustomersPane({
  rows, counts, money, orders, margin, year, query, onQuery, filter, onFilter, onClear, activeId, onOpen, loading, canAdd, onAdd,
  capped, showAll, onShowAll,
}) {
  const quiet = money && orders;
  const columns = useMemo(() => columnsFor({ money, orders, quiet, margin, year }), [money, orders, quiet, margin, year]);
  const narrowed = Boolean(query) || filter !== "all";

  // while the first look is on its way nothing is counted: "All 0 · Owing 0" beside skeleton rows would say nobody owes anything
  const n = (v) => (loading ? undefined : v);
  const options = [
    { value: "all", label: "All", count: n(counts.all) },
    ...(money ? [
      { value: "owing", label: "Owing", count: n(counts.owing), tone: !loading && counts.owing > 0 ? "warn" : undefined },
      { value: "overdue", label: "Overdue", count: n(counts.overdue), tone: !loading && counts.overdue > 0 ? "bad" : undefined },
    ] : []),
    ...(quiet ? [{ value: "quiet", label: "No activity", count: n(counts.quiet) }] : []),
  ];

  return (
    <Tile
      area="cust"
      icon={<Icons.Customers size={14} sw={1.8} />}
      title="Customers"
      note={loading ? undefined : narrowed ? `${rows.length} of ${counts.all}` : `${counts.all} ${plural(counts.all, "customer")}`}
      section="customers"
      align="top"
      className="cu-pane"
    >
      <div className="cu-tools">
        <SearchBox value={query} onChange={onQuery} placeholder="Search customers" label="Search customers by name, contact, phone, email or city" />
        {options.length > 1 && <FilterChips label="Which customers" value={filter} onChange={onFilter} options={options} />}
      </div>

      {/* nothing to list is said outside the table: a table whose body holds only a message is not a table to a screen reader */}
      {!loading && rows.length === 0 ? (
        <div className="dt-empty">
          <EmptyNote icon={<Icons.Customers size={22} sw={1.5} />}>
            {counts.all === 0
              ? <>No customers yet. They appear here automatically when an order is raised for them.{canAdd && <> Or <button type="button" className="cu-link" onClick={onAdd}>add one</button>.</>}</>
              : <>Nothing matches that. <button type="button" className="cu-link" onClick={onClear}>Show everyone</button></>}
          </EmptyNote>
        </div>
      ) : (
        <DataTable
          label="Customers"
          rows={rows}
          limit={capped > 0 && !showAll ? capped : undefined}
          rowKey={(c) => c.id}
          columns={columns}
          defaultSort={money ? { id: "invoiced", dir: "desc" } : { id: "name", dir: "asc" }}
          onOpen={(c) => onOpen(c.id)}
          rowLabel={(c) => `Open ${c.name}.${money ? (c.outstandingNPR > 0.5 ? " Owes money." : " Nothing owed.") : ""}`}
          activeKey={activeId}
          loading={loading}
        />
      )}

      {capped > 0 && rows.length > capped && !showAll && (
        <div className="cu-morerow"><button type="button" className="cu-more" onClick={onShowAll}>Show all {rows.length}</button></div>
      )}
    </Tile>
  );
}

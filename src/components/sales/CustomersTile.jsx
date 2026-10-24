import { useMemo } from "react";
import { Icons } from "../ui";
import { EmptyNote, Money, Tile } from "../bento/Bento";
import DataTable, { TwoLine } from "../table/DataTable";
import { FindBar } from "../filters/FilterMenu";
import { Initials } from "./parts";
import { fmtDay } from "../../lib/sales";

const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

const subOf = (c) => [
  `${c.orders.length} ${plural(c.orders.length, "order")}`,
  c.units > 0 ? `${c.units.toLocaleString()} pcs` : "",
  c.city,
].filter(Boolean).join(" · ");

/** The customers' columns. The first four say what matters; the rest step aside as the table narrows (`drop`, the bigger the sooner). */
function columnsFor(hasMargin) {
  return [
    {
      id: "name", label: "Customer", grow: true, min: 170, max: 420, sort: (c) => (c.name || "").toLowerCase(),
      render: (c) => (
        <TwoLine
          lead={<Initials name={c.name} />}
          main={<span title={c.name}>{c.name}{!c.isActive && <em className="sl-quiet">no activity</em>}</span>}
          sub={subOf(c)}
        />
      ),
    },
    {
      id: "invoiced", label: "Invoiced", width: 112, align: "end", drop: 3, first: "desc", sort: (c) => c.invoicedNPR,
      render: (c) => <span className="dt-num"><Money npr={c.invoicedNPR} /></span>,
    },
    {
      id: "collected", label: "Collected", width: 124, align: "end", drop: 4, first: "desc", sort: (c) => c.collectedNPR,
      render: (c) => (c.collectedNPR > 0.5 ? (
        <span className="dt-stack">
          <span className="dt-num dt-good"><Money npr={c.collectedNPR} /></span>
          <span className="sl-mini" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, c.collectedPct))}%` }} /></span>
        </span>
      ) : <span className="dt-dim">—</span>),
    },
    {
      id: "owed", label: "Owed", width: 124, align: "end", first: "desc", sort: (c) => c.outstandingNPR,
      render: (c) => (c.outstandingNPR > 0.5 ? (
        <span className="dt-stack">
          <span className="dt-num dt-strong sl-owed"><Money npr={c.outstandingNPR} /></span>
          {c.overdueNPR > 0.5 && <small className="sl-late"><Money npr={c.overdueNPR} compact /> overdue</small>}
        </span>
      ) : <span className="dt-dim">—</span>),
    },
    ...(hasMargin ? [{
      id: "margin", label: "Margin", width: 100, align: "end", drop: 5, first: "desc", sort: (c) => c.marginPct,
      render: (c) => (c.marginPct == null
        ? <span className="dt-dim sl-nocost" title="No costs entered against this customer's orders">no cost data</span>
        : <span className={`dt-num dt-strong ${c.marginPct >= 0 ? "dt-good" : "dt-bad"}`}>{c.marginPct.toFixed(1)}%</span>),
    }] : []),
    {
      id: "last", label: "Last paid", width: 112, align: "end", drop: 6, first: "desc", sort: (c) => c.lastPaidOn || null,
      render: (c) => (c.lastPaidOn ? (
        <span className="dt-stack">
          <span className="dt-num">{fmtDay(c.lastPaidOn).replace(/ \d{4}$/, "")}</span>
          {c.avgDaysToPay != null && <small>~{c.avgDaysToPay}d to pay</small>}
        </span>
      ) : <span className="dt-dim">—</span>),
    },
  ];
}

/**
 * Every customer with the money that belongs to them: what they have been invoiced, what has come in (and how
 * much of it), what they still owe and how much of that is late, their margin where costs were entered, and when
 * they last paid. A row opens that customer's card. A search and one Filters button (All | Owing | Overdue, the side of the
 * business, city, money and the rest are in its panel) sit above a table that scrolls inside the tile; the heads sort it.
 * `filters` is the page's `useFilters` result for this table, `filtered` whether the search or a filter is narrowing it, `untagged`
 * how many customers have no side yet.
 */
export default function CustomersTile({
  rows, counts, hasMargin, query, onQuery, filters, filtered, untagged, activeId, onOpen, loading, canAdd, onAdd,
  capped, showAll, onShowAll,
}) {
  const columns = useMemo(() => columnsFor(hasMargin), [hasMargin]);
  const quiet = counts.all - counts.active;

  return (
    <Tile
      area="cust"
      icon={<Icons.Customers size={14} sw={1.8} />}
      title="Customers"
      note={filtered ? `${rows.length} of ${counts.all}` : `${counts.all} ${plural(counts.all, "client")}${quiet > 0 ? ` · ${quiet} quiet` : ""}`}
      section="customers"
      align="top"
      className="sl-pane"
    >
      <div className="sl-tools fn-barrow">
        <FindBar
          filters={filters} value={query} onChange={onQuery} placeholder="Search customers"
          label="Search customers by name, contact, email or city" scope={{ region: { untagged } }} name="customers"
        />
      </div>

      <DataTable
        label="Customers"
        rows={rows}
        limit={capped > 0 && !showAll ? capped : undefined}
        rowKey={(c) => c.id}
        columns={columns}
        defaultSort={{ id: "invoiced", dir: "desc" }}
        onOpen={(c) => onOpen(c.id)}
        rowLabel={(c) => `Open ${c.name}. ${c.outstandingNPR > 0.5 ? "Owes money." : "Nothing owed."}`}
        activeKey={activeId}
        loading={loading}
        empty={(
          <EmptyNote icon={<Icons.Customers size={22} sw={1.5} />}>
            {counts.all === 0
              ? <>No customers yet. They appear here automatically when an order is raised for them.{canAdd && <> Or <button type="button" className="sl-link" onClick={onAdd}>add one</button>.</>}</>
              : "Nothing matches that."}
          </EmptyNote>
        )}
      />

      {capped > 0 && rows.length > capped && !showAll && (
        <div className="sl-morerow"><button type="button" className="sl-more" onClick={onShowAll}>Show all {rows.length}</button></div>
      )}
    </Tile>
  );
}

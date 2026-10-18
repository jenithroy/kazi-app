import { useMemo } from "react";
import { Icons } from "../ui";
import { EmptyNote, Money, Tile } from "../bento/Bento";
import DataTable, { TwoLine } from "../table/DataTable";
import { FilterChips, SearchBox } from "../table/Bar";
import { StageTag } from "./parts";
import { ORDER_STAGES } from "../../constants/enums";
import { deliveredOn, isDelivered, isOpen, orderWhen } from "../../lib/sales";

function columnsFor(today) {
  return [
    {
      id: "id", label: "Order", width: 76, drop: 5, first: "desc", sort: (o) => o.orderId || "",
      render: (o) => <span className="dt-id dt-dim">{o.orderId || "—"}</span>,
    },
    {
      id: "customer", label: "Customer", grow: true, min: 160, max: 420, sort: (o) => (o.customerName || "").toLowerCase(),
      render: (o) => <TwoLine main={<span title={o.customerName || ""}>{o.customerName || "No customer"}</span>} sub={o.styleName || "No style yet"} />,
    },
    {
      id: "stage", label: "Stage", width: 132, sort: (o) => ORDER_STAGES.indexOf(o.stage),
      render: (o, { compact }) => {
        const closed = !isOpen(o) && !isDelivered(o);
        const w = orderWhen(o, today);
        return (
          <span className="sl-o-stage">
            {closed ? <span className="kb-tag kb-tag--bad">{o.status || "Closed"}</span> : <StageTag stage={o.stage} short />}
            {o.status === "On Hold" && <span className="kb-tag kb-tag--warn">On hold</span>}
            {/* a phone has no room for the Due column, so what matters in it, that the order is late, rides under the stage */}
            {compact && w.late && <small className="sl-late">{w.note}</small>}
          </span>
        );
      },
    },
    {
      id: "qty", label: "Pieces", width: 100, align: "end", drop: 4, first: "desc", sort: (o) => Number(o.quantity || 0),
      render: (o) => {
        const value = Number(o.totalValueNPR || 0);
        return (
          <span className="dt-stack">
            <span className="dt-num">{Number(o.quantity || 0).toLocaleString()}<span className="sl-unit">pcs</span></span>
            {value > 0 && <small><Money npr={value} compact /></small>}
          </span>
        );
      },
    },
    {
      id: "due", label: "Due", width: 112, align: "end", drop: 3, sort: (o) => (isDelivered(o) ? deliveredOn(o) : o.deliveryDate || o.dueDate || null),
      render: (o) => {
        const w = orderWhen(o, today);
        return (
          <span className="dt-stack">
            <span className={`dt-num ${w.late ? "dt-bad sl-late-d" : ""}`}>{w.late && <Icons.Alert size={12} sw={2} aria-hidden="true" />}{w.date}</span>
            {w.note && <small className={w.late ? "sl-late" : undefined}>{w.note}</small>}
          </span>
        );
      },
    },
  ];
}

/**
 * The orders themselves, newest first: still open, delivered, or all of them, narrowed to one stage when the pipeline
 * strip has one pressed. A row is the button: pressing anywhere on it opens that order's card. The table scrolls inside
 * the tile; the heads sort it (until one is pressed it stays newest first).
 */
export default function OrdersTile({
  rows, counts, view, onView, stage, onStage, query, onQuery, today, activeId, onOpen, loading,
  capped, showAll, onShowAll,
}) {
  const filtered = Boolean(query || stage);
  const columns = useMemo(() => columnsFor(today), [today]);

  return (
    <Tile
      area="ord"
      icon={<Icons.Sales size={14} sw={1.8} />}
      title="Orders"
      note={filtered ? `${rows.length} of ${counts[view]}` : view === "all" ? `${rows.length} orders` : `${rows.length} ${view}`}
      section="orders"
      align="top"
      className="sl-pane"
    >
      <div className="sl-tools">
        <FilterChips
          label="Which orders"
          value={view}
          onChange={onView}
          options={[
            { value: "open", label: "Open", count: counts.open },
            { value: "delivered", label: "Delivered", count: counts.delivered },
            { value: "all", label: "All", count: counts.all },
          ]}
        />
        <SearchBox value={query} onChange={onQuery} placeholder="Search orders" label="Search orders by customer, style or number" />
        {stage && (
          <button type="button" className="dt-chip is-on" onClick={() => onStage("")} aria-label={`Showing only ${stage}. Show every stage`}>
            {stage} <Icons.X size={12} sw={2.2} aria-hidden="true" />
          </button>
        )}
      </div>

      <DataTable
        label="Orders"
        rows={rows}
        limit={capped > 0 && !showAll ? capped : undefined}
        rowKey={(o) => o.id}
        columns={columns}
        onOpen={(o) => onOpen(o.id)}
        rowLabel={(o) => `Open ${o.orderId || "the order"}, ${o.customerName || "no customer"}, ${o.styleName || "no style"}, ${isOpen(o) || isDelivered(o) ? o.stage : o.status}`}
        activeKey={activeId}
        loading={loading}
        empty={(
          <EmptyNote icon={<Icons.Production size={22} sw={1.5} />}>
            {counts.all === 0 ? "No orders yet." : filtered ? "No orders match that." : view === "delivered" ? "Nothing delivered yet." : "No orders in progress."}
          </EmptyNote>
        )}
      />

      {capped > 0 && rows.length > capped && !showAll && (
        <div className="sl-morerow"><button type="button" className="sl-more" onClick={onShowAll}>Show all {rows.length}</button></div>
      )}
    </Tile>
  );
}

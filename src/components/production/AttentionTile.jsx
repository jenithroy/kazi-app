import { Icons } from "../ui";
import { EmptyNote, Tile } from "../bento/Bento";
import { dueInfo, stageShort } from "../../lib/production";

function Group({ title, count, quick, onQuick, children }) {
  return (
    <section className="pr-att-g">
      <header>
        <h3>{title} <b>{count}</b></h3>
        <button type="button" className="pr-link" onClick={() => onQuick(quick)}>See in list</button>
      </header>
      <ul>{children}</ul>
    </section>
  );
}

function Item({ order, tail, tone, onOpen }) {
  return (
    <li>
      <button type="button" className="pr-att-row" onClick={() => onOpen(order)}>
        <span className="pr-att-id">{order.orderId}</span>
        <span className="pr-att-main">
          <b>{order.customerName || "No customer"}</b>
          <span>{[order.styleName, stageShort(order.stage)].filter(Boolean).join(" · ")}</span>
        </span>
        <span className={tone ? `pr-att-r is-${tone}` : "pr-att-r"}>{tail}</span>
      </button>
    </li>
  );
}

/**
 * What wants someone's eyes: orders that are late (the most late first), orders on hold, and, for
 * people who can deduct stock, orders past quality check whose materials were never taken out of
 * stock. It is tinted only while something is late, as the dashboard's tiles are when they ask for
 * attention; "See in list" shows exactly those orders in the list.
 */
export default function AttentionTile({ items, today, showStock, onOpen, onQuick, loading }) {
  const { overdue, hold, stock } = items;
  const total = overdue.length + hold.length + (showStock ? stock.length : 0);

  return (
    <Tile
      area="attn"
      tone={overdue.length ? "terra" : total ? "amber" : "wash"}
      icon={<Icons.Alert size={14} sw={1.8} />}
      title="Needs attention"
      note={total ? `${total}` : undefined}
      loading={loading}
      align="top"
      className="pr-attn"
    >
      {total === 0 ? (
        <EmptyNote icon={<Icons.Check size={22} sw={1.7} />}>Nothing is late, on hold or waiting on stock.</EmptyNote>
      ) : (
        <div className="pr-att kb-fill">
          {overdue.length > 0 && (
            <Group title="Late" count={overdue.length} quick="overdue" onQuick={onQuick}>
              {overdue.map((o) => <Item key={o.id} order={o} tone="bad" tail={dueInfo(o, today).short} onOpen={onOpen} />)}
            </Group>
          )}
          {hold.length > 0 && (
            <Group title="On hold" count={hold.length} quick="hold" onQuick={onQuick}>
              {hold.map((o) => <Item key={o.id} order={o} tone="warn" tail="On hold" onOpen={onOpen} />)}
            </Group>
          )}
          {showStock && stock.length > 0 && (
            <Group title="Stock not deducted" count={stock.length} quick="stock" onQuick={onQuick}>
              {stock.map((o) => <Item key={o.id} order={o} tone="warn" tail="Not deducted" onOpen={onOpen} />)}
            </Group>
          )}
        </div>
      )}
    </Tile>
  );
}

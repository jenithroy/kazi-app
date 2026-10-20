/**
 * The two short lists beside the table: who is late with their money, and who the biggest customers are.
 *
 * Both read the rows the page already built. Each row is one button that opens that customer's card on their invoices (its spoken name
 * is what it shows, with no label of its own: a label that left out the amount would not contain the visible text). They are lists
 * that show the rows that fit (`kb-list`), so a short window shows the first few and a tall one all of them; the table beside them
 * has the whole picture (its Overdue filter lists every late customer). Both are locked for a position that cannot open Billing:
 * without the invoices there is nothing to rank or to chase.
 */
import { useLayoutEffect, useRef } from "react";
import { EmptyNote, Money, Tile } from "../bento/Bento";
import { Icons } from "../ui";
import { Star } from "../bento/icons";

const ico = { size: 14, sw: 1.8 };
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/**
 * A list shows only the rows that fit: the rest wrap into a second column beyond its edge, where `overflow: hidden` hides them. They
 * would still be in the Tab order (a key press would scroll the list sideways to a row nobody can see) and in what a screen reader
 * reads, so the rows that are not on show are made inert, and looked at again whenever the list changes size or its rows change.
 */
function FitList({ children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return undefined;
    const apply = () => {
      const box = list.getBoundingClientRect();
      for (const row of list.children) {
        const r = row.getBoundingClientRect();
        row.inert = r.left >= box.right - 1 || r.top >= box.bottom - 1;
      }
    };
    apply();
    const watch = new ResizeObserver(apply);
    watch.observe(list);
    return () => watch.disconnect();
  });
  return <ul ref={ref} className="kb-list kb-fill">{children}</ul>;
}

/**
 * Customers who owe past their due date, the biggest late amount first, with how late the oldest invoice is. A short window shows
 * only the first few, so the count in its head is a button that puts the whole list in the table (`onSeeAll`; a phone leaves it
 * out: its list shows every row, and the table it would change is far below).
 */
export function OverdueTile({ list, loading, onOpen, onSeeAll }) {
  const n = list.length;
  const count = `${n} ${plural(n, "customer")}`;
  return (
    <Tile
      area="late"
      tone={n > 0 ? "default" : "wash"}
      section="billing"
      icon={<Icons.Clock {...ico} />}
      title="Overdue"
      note={n > 0 ? (onSeeAll ? (
        <button type="button" className="cu-seeall" onClick={onSeeAll} aria-label={`Show the ${count} who are overdue in the table`}>
          {count}<Icons.ChevronRight size={12} sw={2.2} aria-hidden="true" />
        </button>
      ) : count) : undefined}
      loading={loading}
      align="top"
      className="cu-rail"
    >
      {n === 0 ? (
        <EmptyNote icon={<Icons.Check size={22} sw={1.8} />}>Nobody is past their due date.</EmptyNote>
      ) : (
        <FitList>
          {list.map(({ c, late }) => (
            <li key={c.id} className="kb-row cu-rrow">
              <button type="button" className="cu-rbtn" title={`Open ${c.name}`} onClick={() => onOpen(c.id, "invoices")}>
                <span className="cu-rbtn-t">
                  <b>{c.name}</b>
                  <span>{late.days} {plural(late.days, "day")} late{late.n > 1 ? ` · ${late.n} invoices` : ""}</span>
                </span>
                <span className="cu-rbtn-q cu-late"><b><Money npr={late.amount} compact /></b></span>
              </button>
            </li>
          ))}
        </FitList>
      )}
    </Tile>
  );
}

/** The customers invoiced the most. A row is tinted as far as its share of the biggest's, which says it without a chart of its own. */
export function BiggestTile({ list, loading, onOpen }) {
  return (
    <Tile
      area="big"
      section="billing"
      icon={<Star {...ico} />}
      title="Biggest customers"
      note={list.length > 0 ? "by invoiced" : undefined}
      loading={loading}
      align="top"
      className="cu-rail"
    >
      {list.length === 0 ? (
        <EmptyNote icon={<Icons.Customers size={22} sw={1.5} />}>Nothing has been invoiced yet.</EmptyNote>
      ) : (
        <FitList>
          {list.map(({ c, share, pct }) => (
            <li key={c.id} className="kb-row cu-rrow">
              <button
                type="button"
                className="cu-rbtn cu-rbtn--bar"
                style={{ "--p": `${Math.max(4, Math.round(pct))}%` }}
                title={`Open ${c.name}`}
                onClick={() => onOpen(c.id, "invoices")}
              >
                <span className="cu-rbtn-t">
                  <b>{c.name}</b>
                  <span>{share >= 1 ? `${Math.round(share)}%` : "under 1%"} of all invoiced</span>
                </span>
                <span className="cu-rbtn-q"><b><Money npr={c.invoicedNPR} compact /></b></span>
              </button>
            </li>
          ))}
        </FitList>
      )}
    </Tile>
  );
}

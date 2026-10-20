/**
 * DataTable: the glass list the new look uses wherever a page is a table.
 *
 * What was wrong with the old tables, and what this does about it:
 *   - They were 12 to 15 columns wide, so the one button on the row sat a whole screen from its name.
 *     Here a row is the button: pressing anywhere on it opens the thing (a card in the middle of the
 *     screen), so there is nothing to hunt for and nothing to scroll sideways to reach.
 *   - They scrolled sideways on a small screen. Here the table works out how many columns fit its
 *     own width and drops the least important ones (`drop`, highest first) until the rest do. A
 *     phone ends up with a name and the one number that matters.
 *   - The columns were spread across the whole window, so the eye had to travel. Here the first
 *     column stops growing at `max` and the others sit straight after it; spare width is left empty.
 *
 *   <DataTable
 *     label="Stock items" rows={rows} rowKey={(r) => r.id}
 *     columns={[
 *       { id: "item", label: "Item", grow: true, sort: (r) => r.item, render: (r) => <TwoLine … /> },
 *       { id: "bal",  label: "Balance", width: 110, align: "end", sort: (r) => r.balance, render: (r) => … },
 *       { id: "val",  label: "Value", width: 110, align: "end", drop: 2, render: (r) => … },
 *     ]}
 *     defaultSort={{ id: "item", dir: "asc" }}
 *     onOpen={(r) => …} rowLabel={(r) => `Open ${r.item}`} />
 *
 * A column: `render(row, { compact, dropped })` draws the cell (`dropped` is the set of ids of the columns
 * this width had no room for, so the name cell can carry what a dropped date or status would have said);
 * `sort(row)` returns what to sort by (no `sort`,
 * not sortable); `width` is in px (the `grow` column is the one that takes what is left, between
 * `min` and `max`); `drop` is how soon it goes when the table is narrow (a bigger number goes first;
 * no `drop` means it is never dropped); `align: "end"` right-aligns it (numbers always are).
 *
 * The row's own button is one stretched, invisible `<button class="dt-hit">`; anything inside a cell
 * that has to be pressed on its own (a "Log" button) carries `className="dt-act"` so it sits above it.
 * Up / Down / Home / End move between rows.
 *
 * `kindOf(row)` lets a list carry headings and sums: "group" (a heading across the row, text in
 * `row.label`), "sum" (a subtotal) and "total" are drawn as such and are never sorted or opened.
 *
 * `limit` draws only the first so many rows, after the sort (a phone's page scrolls, so a page may ask
 * for a short list and offer "Show all" itself).
 *
 * `focusBody` makes the scrolling part a Tab stop. A table with rows to press already has one (the row's
 * button); a table with none (a read-only list) has nothing a keyboard can reach, so it could not be
 * scrolled by one (axe: scrollable-region-focusable). Pass it for a list that nobody opens.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icons, cn } from "../ui";
import "./table.css";

const COMPACT_BELOW = 520;        // under this the table is a phone's list: name on the left, the numbers right
const GAP = 16;
const PAD = 16;

function compare(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/** The columns that fit `width`: drop the most droppable one until the rest do. */
export function fitColumns(columns, width) {
  if (!width) return columns;
  let cols = columns.slice();
  const need = (list) => {
    const fixed = list.filter((c) => !c.grow).reduce((s, c) => s + (c.width ?? 96), 0);
    const grow = list.find((c) => c.grow);
    return PAD * 2 + fixed + (grow ? (grow.min ?? 160) : 0) + GAP * Math.max(0, list.length - 1);
  };
  while (cols.length > 1 && need(cols) > width) {
    let at = -1;
    let best = -1;
    cols.forEach((c, i) => { if (c.drop != null && c.drop > best) { best = c.drop; at = i; } });
    if (at < 0) break;
    cols.splice(at, 1);
  }
  return cols;
}

export default function DataTable({
  label, rows, rowKey, columns, defaultSort, onOpen, rowLabel, activeKey, kindOf, empty, loading, className, skeletonRows = 6, limit, focusBody,
}) {
  const rootRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [sort, setSort] = useState(defaultSort || null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const read = () => setWidth(Math.round(el.getBoundingClientRect().width));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const compact = width > 0 && width < COMPACT_BELOW;
  const visible = useMemo(() => fitColumns(columns, width), [columns, width]);
  const dropped = useMemo(() => new Set(columns.filter((c) => !visible.includes(c)).map((c) => c.id)), [columns, visible]);

  const template = useMemo(() => {
    const t = visible.map((c) => {
      if (c.grow) return compact ? "minmax(0, 1fr)" : `minmax(${c.min ?? 160}px, ${c.max ?? 420}px)`;
      return `${c.width ?? 96}px`;
    });
    if (!compact) t.push("minmax(0, 1fr)");        // the spare width: it keeps the cells together on the left
    return t.join(" ");
  }, [visible, compact]);

  const sorted = useMemo(() => {
    if (!sort || kindOf) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col || !col.sort) return rows;
    const dir = sort.dir === "desc" ? -1 : 1;
    const keyed = rows.map((r, i) => ({ r, i, v: col.sort(r) }));
    keyed.sort((x, y) => {
      const xn = x.v == null || x.v === "";
      const yn = y.v == null || y.v === "";
      if (xn || yn) return xn === yn ? x.i - y.i : xn ? 1 : -1;       // empty values last, whichever way it runs
      return compare(x.v, y.v) * dir || x.i - y.i;
    });
    return keyed.map((k) => k.r);
  }, [rows, sort, columns, kindOf]);

  function pressHead(col) {
    if (!col.sort) return;
    setSort((cur) => (cur && cur.id === col.id ? { id: col.id, dir: cur.dir === "asc" ? "desc" : "asc" } : { id: col.id, dir: col.first || "asc" }));
  }

  function onBodyKey(e) {
    const hit = e.target.closest?.(".dt-hit");
    if (!hit) return;
    const hits = Array.from(e.currentTarget.querySelectorAll(".dt-hit"));
    const i = hits.indexOf(hit);
    const next = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? hits.length - 1 : -1;
    if (next < 0 || next >= hits.length) return;
    e.preventDefault();
    hits[next].focus({ preventScroll: true });
    hits[next].scrollIntoView({ block: "nearest" });
  }

  // `limit`: draw only the first so many rows. It cuts after the sort, so what is left is the top of the list the heads asked for.
  const shown = limit > 0 && sorted.length > limit ? sorted.slice(0, limit) : sorted;
  const none = !loading && rows.length === 0;
  const cellProps = { compact, dropped };

  return (
    <div
      ref={rootRef}
      className={cn("dt", compact && "dt--compact", className)}
      role="table"
      aria-label={label}
      aria-rowcount={sorted.length + 1}
      style={{ "--dt-cols": template }}
    >
      <div className="dt-head" role="row">
        {visible.map((c) => {
          const on = sort && sort.id === c.id;
          return (
            <div
              key={c.id}
              role="columnheader"
              className={cn("dt-th", c.align === "end" && "dt-end", on && "is-sorted")}
              aria-sort={c.sort ? (on ? (sort.dir === "desc" ? "descending" : "ascending") : "none") : undefined}
            >
              {c.sort ? (
                <button type="button" className="dt-sort" onClick={() => pressHead(c)}>
                  <span>{c.label}</span>
                  <Icons.ChevronDown className={cn("dt-sort-i", on && sort.dir === "asc" && "is-up")} size={12} sw={2.4} aria-hidden="true" />
                </button>
              ) : (
                <span>{c.label}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="dt-body" role="rowgroup" onKeyDown={onBodyKey} tabIndex={focusBody ? 0 : undefined}>
        {loading && Array.from({ length: skeletonRows }, (_, i) => (
          <div key={i} className="dt-row dt-row--skel" role="row" aria-hidden="true">
            {visible.map((c, k) => (
              <div key={c.id} className={cn("dt-cell", c.align === "end" && "dt-end")} role="cell">
                <span className="kb-skel" style={{ width: c.grow ? `${48 + ((i * 17 + k * 11) % 30)}%` : "60%" }} />
              </div>
            ))}
          </div>
        ))}

        {none && <div className="dt-empty">{empty}</div>}

        {!loading && shown.map((row, rowIndex) => {
          const kind = kindOf ? kindOf(row) : undefined;
          const key = rowKey(row);
          if (kind === "group") {
            return (
              <div key={key} className="dt-row dt-group" role="row">
                <div role="cell" aria-colspan={visible.length} className="dt-cell">{row.label}</div>
              </div>
            );
          }
          const openable = Boolean(onOpen) && !kind;
          return (
            <div
              key={key}
              role="row"
              aria-rowindex={rowIndex + 2}
              className={cn("dt-row", openable && "is-open", kind && `dt-${kind}`, activeKey != null && activeKey === key && "is-active")}
            >
              {visible.map((c, i) => (
                <div key={c.id} role="cell" className={cn("dt-cell", c.align === "end" && "dt-end", c.className)}>
                  {i === 0 && openable && (
                    <button type="button" className="dt-hit" aria-label={rowLabel ? rowLabel(row) : "Open"} onClick={() => onOpen(row)} />
                  )}
                  {c.render(row, cellProps)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A two-line cell: the thing's name over a quieter line about it. */
export function TwoLine({ main, sub, lead }) {
  return (
    <span className="dt-two">
      {lead ? <span className="dt-lead">{lead}</span> : null}
      <span className="dt-two-t">
        <b title={typeof main === "string" ? main : undefined}>{main}</b>
        {sub ? <span>{sub}</span> : null}
      </span>
    </span>
  );
}

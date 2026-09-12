import { Fragment, useMemo, useRef, useState } from "react";
import { Btn, IconBtn } from "./Btn";
import { EmptyState, ErrorState } from "./Feedback";
import { Icons } from "./Icons";
import { useElementWidth } from "./useElementWidth";
import { cn } from "./utils";

/* ── Data table ───────────────────────────────────────── */

const INTERACTIVE = "button, a, input, select, textarea, label, [role='menuitem']";

function compare(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

const isBlank = (v) => v == null || v === "";

/**
 * Rows of records. A real <table> when there is room, stacked cards when its
 * own container is narrow (a phone, a sheet, a side column).
 *
 * columns: [{
 *   key       field name; also the default cell value and sort value
 *   header    column heading
 *   render    (row, index) => cell content, when the raw value is not enough
 *   align     "left" | "right" (right for numbers and money)
 *   phone     where the column goes on a card:
 *               "title" | "subtitle" | "meta" (default) | "amount" | "status"
 *               | "detail" (behind a Details toggle) | "hide"
 *   sortable, sortValue (row) => comparable
 *   footer    (rows) => content for the totals row
 *   width     a CSS width for the column on the table
 *   mono      codes and ids in Geist Mono (never wrapped)
 *   nowrap    keep short values such as dates on one line in the table
 *   wideOnly  hide the column on cards without saying so (same as phone: "hide")
 * }]
 *
 *   rows, rowKey      the records and a function giving each a stable key
 *   actions           (row) => <RowActions …/>: last column, or the card's footer
 *   onRowClick        (row) => …: makes the row open something; Enter works too
 *   expandable        (row) => content shown under an expanded row
 *   rowTone           (row) => "warn" | "danger" | "muted": tints the row
 *   loading, error, onRetry, empty   the other states; `empty` is what to say
 *                     when there are no rows (text or a node)
 *   defaultSort       { key, dir: "asc" | "desc" }; or control it with sort + onSortChange
 *   manualSort        rows arrive already sorted; do not sort them here
 *   stickyFirst       keep the first column in view while the table scrolls sideways
 *   cardsBelow        container width in px below which rows become cards (640)
 *   caption           what the table lists, for screen readers
 */
export function DataTable({
  columns,
  rows = [],
  rowKey = (row, i) => row.id ?? i,
  actions,
  onRowClick,
  expandable,
  rowTone,
  loading = false,
  loadingRows = 4,
  error,
  onRetry,
  empty = "Nothing to show yet.",
  sort: sortProp,
  onSortChange,
  defaultSort = null,
  manualSort = false,
  stickyFirst = false,
  cardsBelow = 640,
  caption,
  className,
}) {
  const rootRef = useRef(null);
  const width = useElementWidth(rootRef);
  const asCards = width != null && width < cardsBelow;

  const [innerSort, setInnerSort] = useState(defaultSort);
  const sort = sortProp !== undefined ? sortProp : innerSort;
  const setSort = (next) => {
    onSortChange?.(next);
    if (sortProp === undefined) setInnerSort(next);
  };
  const toggleSort = (key) => {
    const dir = sort?.key === key && sort.dir === "asc" ? "desc" : "asc";
    setSort({ key, dir });
  };

  const [expanded, setExpanded] = useState(() => new Set());
  const toggleExpanded = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const sortedRows = useMemo(() => {
    if (manualSort || !sort?.key) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const value = col.sortValue || ((row) => row[col.key]);
    const factor = sort.dir === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (isBlank(va) && isBlank(vb)) return 0;
      if (isBlank(va)) return 1; // blanks last, whichever way it is sorted
      if (isBlank(vb)) return -1;
      return compare(va, vb) * factor;
    });
  }, [rows, columns, sort, manualSort]);

  const cell = (col, row, i) => {
    const v = col.render ? col.render(row, i) : row[col.key];
    return isBlank(v) ? <span className="k-dt-dash">—</span> : v;
  };
  const hasFooter = columns.some((c) => c.footer);
  const rowClick = (row) => (e) => {
    if (!onRowClick) return;
    if (e.target.closest(INTERACTIVE) && e.target.closest(INTERACTIVE) !== e.currentTarget) return;
    onRowClick(row, e);
  };

  /* ── states ── */
  let state = null;
  if (error) {
    state = <ErrorState size="sm" title={error} onRetry={onRetry} />;
  } else if (!loading && rows.length === 0) {
    state = typeof empty === "string" ? <EmptyState size="sm">{empty}</EmptyState> : empty;
  }

  /* ── cards ── */
  if (asCards) {
    const role = (r) => columns.filter((c) => !c.wideOnly && (c.phone || "meta") === r);
    const [titles, subs, metas, amounts, statuses, details] =
      ["title", "subtitle", "meta", "amount", "status", "detail"].map(role);
    const sortable = columns.filter((c) => c.sortable);

    return (
      <div ref={rootRef} className={cn("k-dt", "k-dt--cards", className)}>
        {sortable.length > 0 && rows.length > 1 && !state && (
          <div className="k-dt-cardbar">
            <label className="k-dt-cardbar-l">
              <span className="k-sr">Sort by</span>
              <span className="k-select k-select--sm">
                <select
                  className="k-input k-select-el"
                  value={sort?.key || ""}
                  onChange={(e) => setSort(e.target.value ? { key: e.target.value, dir: sort?.dir || "asc" } : null)}
                >
                  <option value="">Default order</option>
                  {sortable.map((c) => <option key={c.key} value={c.key}>Sort by {String(c.header).toLowerCase()}</option>)}
                </select>
                <Icons.ChevronDown size={14} aria-hidden="true" />
              </span>
            </label>
            {sort?.key && (
              <IconBtn
                size="sm"
                kind="secondary"
                icon={sort.dir === "desc" ? <Icons.ArrowDown size={14} /> : <Icons.ArrowUp size={14} />}
                label={sort.dir === "desc" ? "Descending; switch to ascending" : "Ascending; switch to descending"}
                onClick={() => setSort({ key: sort.key, dir: sort.dir === "desc" ? "asc" : "desc" })}
              />
            )}
          </div>
        )}

        {state || (
          <ul className="k-dt-cards" aria-label={caption}>
            {loading
              ? Array.from({ length: Math.min(loadingRows, 3) }, (_, i) => (
                  <li key={`skel-${i}`} className="k-dt-card" aria-hidden="true">
                    <span className="k-shimmer k-dt-skel k-dt-skel--title" />
                    <span className="k-shimmer k-dt-skel" />
                  </li>
                ))
              : sortedRows.map((row, i) => {
                  const key = rowKey(row, i);
                  const open = expanded.has(key);
                  const tone = rowTone?.(row);
                  const hasDetail = details.length > 0 || Boolean(expandable);
                  return (
                    <li
                      key={key}
                      className={cn("k-dt-card", tone && `is-${tone}`, onRowClick && "is-clickable")}
                      onClick={rowClick(row)}
                    >
                      <div className="k-dt-card-head">
                        <div className="k-dt-card-id">
                          {titles.map((c) => (
                            <div key={c.key} className={cn("k-dt-card-title", c.mono && "is-mono")}>
                              {onRowClick
                                ? <button type="button" className="k-dt-card-link" onClick={() => onRowClick(row)}>{cell(c, row, i)}</button>
                                : cell(c, row, i)}
                            </div>
                          ))}
                          {subs.map((c) => <div key={c.key} className="k-dt-card-sub">{cell(c, row, i)}</div>)}
                        </div>
                        {(amounts.length > 0 || statuses.length > 0) && (
                          <div className="k-dt-card-side">
                            {amounts.map((c) => <div key={c.key} className="k-dt-card-amount">{cell(c, row, i)}</div>)}
                            {statuses.map((c) => <div key={c.key}>{cell(c, row, i)}</div>)}
                          </div>
                        )}
                      </div>

                      {metas.length > 0 && (
                        <dl className="k-dt-card-meta">
                          {metas.map((c) => (
                            <div key={c.key}>
                              <dt>{c.header}</dt>
                              <dd className={cn(c.mono && "is-mono")}>{cell(c, row, i)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}

                      {open && hasDetail && (
                        <div className="k-dt-card-detail">
                          {details.length > 0 && (
                            <dl className="k-dt-card-meta">
                              {details.map((c) => (
                                <div key={c.key}>
                                  <dt>{c.header}</dt>
                                  <dd className={cn(c.mono && "is-mono")}>{cell(c, row, i)}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                          {expandable?.(row)}
                        </div>
                      )}

                      {(hasDetail || actions) && (
                        <div className="k-dt-card-foot">
                          {hasDetail && (
                            <Btn
                              kind="ghost"
                              size="sm"
                              aria-expanded={open}
                              iconRight={open ? <Icons.ChevronUp size={13} /> : <Icons.ChevronDown size={13} />}
                              onClick={() => toggleExpanded(key)}
                            >
                              {open ? "Hide details" : "Details"}
                            </Btn>
                          )}
                          {actions && <div className="k-dt-card-actions">{actions(row)}</div>}
                        </div>
                      )}
                    </li>
                  );
                })}
          </ul>
        )}

        {hasFooter && !state && !loading && (
          <dl className="k-dt-totals">
            {columns.filter((c) => c.footer).map((c) => (
              <div key={c.key}>
                <dt>{c.header}</dt>
                <dd>{typeof c.footer === "function" ? c.footer(rows) : c.footer}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    );
  }

  /* ── table ── */
  const visibleCols = columns;
  const span = visibleCols.length + (expandable ? 1 : 0) + (actions ? 1 : 0);

  return (
    <div ref={rootRef} className={cn("k-dt", className)}>
      <div className="k-dt-scroll">
        <table className="k-dt-table">
          {caption && <caption className="k-sr">{caption}</caption>}
          <thead>
            <tr>
              {expandable && <th className="k-dt-expand-cell" aria-label="Details" />}
              {visibleCols.map((c, ci) => {
                const sorted = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(c.align === "right" && "is-num", c.nowrap && "is-nowrap", stickyFirst && ci === 0 && "is-sticky")}
                    style={c.width ? { width: c.width } : undefined}
                    aria-sort={c.sortable ? (sorted ? (sort.dir === "desc" ? "descending" : "ascending") : "none") : undefined}
                  >
                    {c.sortable ? (
                      <button type="button" className="k-dt-sort" onClick={() => toggleSort(c.key)}>
                        <span>{c.header}</span>
                        {sorted
                          ? (sort.dir === "desc" ? <Icons.ArrowDown size={12} sw={2} /> : <Icons.ArrowUp size={12} sw={2} />)
                          : <Icons.Sort size={12} sw={1.8} />}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
              {actions && <th className="k-dt-actions-cell"><span className="k-sr">Actions</span></th>}
            </tr>
          </thead>

          <tbody>
            {state ? (
              <tr className="k-dt-staterow"><td colSpan={span}>{state}</td></tr>
            ) : loading ? (
              Array.from({ length: loadingRows }, (_, i) => (
                <tr key={`skel-${i}`} aria-hidden="true">
                  {Array.from({ length: span }, (_, j) => (
                    <td key={j}><span className="k-shimmer k-dt-skel" /></td>
                  ))}
                </tr>
              ))
            ) : (
              sortedRows.map((row, i) => {
                const key = rowKey(row, i);
                const open = expanded.has(key);
                const tone = rowTone?.(row);
                return (
                  <Fragment key={key}>
                    <tr
                      className={cn(onRowClick && "is-clickable", tone && `is-${tone}`, open && "is-expanded")}
                      onClick={rowClick(row)}
                      tabIndex={onRowClick ? 0 : undefined}
                      onKeyDown={onRowClick ? (e) => {
                        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                          e.preventDefault();
                          onRowClick(row, e);
                        }
                      } : undefined}
                    >
                      {expandable && (
                        <td className="k-dt-expand-cell">
                          <IconBtn
                            size="sm"
                            icon={open ? <Icons.ChevronUp size={14} /> : <Icons.ChevronDown size={14} />}
                            label={open ? "Hide details" : "Show details"}
                            aria-expanded={open}
                            onClick={() => toggleExpanded(key)}
                          />
                        </td>
                      )}
                      {visibleCols.map((c, ci) => (
                        <td
                          key={c.key}
                          className={cn(c.align === "right" && "is-num", c.mono && "is-mono", c.nowrap && "is-nowrap", stickyFirst && ci === 0 && "is-sticky")}
                        >
                          {cell(c, row, i)}
                        </td>
                      ))}
                      {actions && <td className="k-dt-actions-cell">{actions(row)}</td>}
                    </tr>
                    {open && expandable && (
                      <tr className="k-dt-detail">
                        <td colSpan={span}>{expandable(row)}</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>

          {hasFooter && !state && !loading && (
            <tfoot>
              <tr>
                {expandable && <td />}
                {visibleCols.map((c, ci) => (
                  <td key={c.key} className={cn(c.align === "right" && "is-num", c.nowrap && "is-nowrap", stickyFirst && ci === 0 && "is-sticky")}>
                    {typeof c.footer === "function" ? c.footer(rows) : c.footer}
                  </td>
                ))}
                {actions && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

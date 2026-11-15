import { useEffect, useRef } from "react";
import { Icons, cn } from "../ui";
import { EmptyNote, Tile } from "../bento/Bento";
import { Undo } from "../bento/icons";
import { FindBar } from "../filters/FilterMenu";
import OrderRow from "./OrderRow";
import CalendarView from "./CalendarView";
import { WebGlobe } from "./WebMark";

/**
 * The orders themselves: a list, or the same orders by delivery date on a calendar. What it shows
 * is decided by the pipeline strip (a stage, or the finished ones), the search box and the Filters
 * button beside it (the side of the business, "This month", the quick views the other tiles set,
 * a customer, a day range…); this tile only draws it.
 *
 * The list keeps its column heads and its search in place and scrolls inside the tile.
 */
/** Up / Down / Home / End move between the rows' open-buttons, so a long list is not forty Tab stops. */
function onListKey(e) {
  const hit = e.target.closest?.(".pr-hit");
  if (!hit) return;
  const hits = [...e.currentTarget.querySelectorAll(".pr-hit")];
  const i = hits.indexOf(hit);
  const next = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? hits.length - 1 : -1;
  if (next < 0 || next >= hits.length) return;
  e.preventDefault();
  hits[next].focus({ preventScroll: true });
  hits[next].scrollIntoView({ block: "nearest" });
}

/**
 * `filters` is the page's Filters (useFilters, with "This month" and "Where from" added to what is narrowing); `filtered` says the list is narrower
 * than the strip's choice.
 *
 * Website orders (lib/webOrders.js): `source` is the "Where from" choice. `webNew` is how many website orders nobody has opened yet; while the
 * list shows only the team's own, a button for them sits right beside the Filters button and `onWebNew` shows them. `isNewWeb(order)` says
 * which rows carry the "New" tag. `listFocus` changes when the button is pressed: the cursor then goes to the first new order (or the list).
 */
export default function OrdersTile({
  rows, base, title, view, mode, query, filters, filtered, untagged, today, canEdit, busyIds, hasOrders, loading, notice,
  source = "team", webNew = 0, isNewWeb, listFocus = 0,
  onQuery, onMode, onOpen, onAdvance, onClearAll, onNoDate, onWebNew,
}) {
  const empty = rows.length === 0;
  const listRef = useRef(null);

  // The button for the new website orders was pressed: the list now shows them, so the cursor goes to the first one (the button is gone).
  useEffect(() => {
    if (!listFocus) return;
    const list = listRef.current;
    const target = list?.querySelector(".pr-row.is-new .pr-hit") || list?.querySelector(".pr-hit") || list;
    target?.focus();
  }, [listFocus]);

  const webButton = webNew > 0 && source === "team" ? (
    <button
      type="button"
      className="pr-webnew"
      onClick={onWebNew}
      aria-label={`${webNew} new ${webNew === 1 ? "order" : "orders"} from the website`}
      title="Show the new orders from the website"
    >
      <WebGlobe size={13} />
      <span className="pr-webnew-n">{webNew}</span>{" "}
      <span className="pr-webnew-t">new</span>
    </button>
  ) : null;

  return (
    <Tile
      area="orders"
      icon={<Icons.Production size={14} sw={1.8} />}
      title={title}
      note={loading ? undefined : filtered ? `${rows.length} of ${base}` : `${rows.length}`}
      loading={loading}
      align="top"
      className={cn("pr-orders", mode === "calendar" && "is-cal")}
    >
      <div className="pr-bar fn-barrow">
        <FindBar
          filters={filters}
          scope={{ region: { untagged } }}
          after={webButton}
          search={(
            <label className="pr-search">
              <Icons.Search size={14} sw={1.9} aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search orders" aria-label="Search orders" />
            </label>
          )}
        />

        <span className="pr-grow" />

        <div className="pr-sw" role="group" aria-label="Show orders as">
          <button type="button" className={cn("pr-sw-btn", mode === "list" && "is-on")} aria-pressed={mode === "list"} onClick={() => onMode("list")}>
            <Icons.Menu size={13} sw={1.9} aria-hidden="true" /> List
          </button>
          <button type="button" className={cn("pr-sw-btn", mode === "calendar" && "is-on")} aria-pressed={mode === "calendar"} onClick={() => onMode("calendar")}>
            <Icons.Calendar size={13} sw={1.9} aria-hidden="true" /> Calendar
          </button>
        </div>
      </div>

      {mode === "calendar" ? (
        <CalendarView rows={rows} today={today} onOpen={onOpen} onNoDate={view === "open" ? onNoDate : undefined} />
      ) : (
        <>
          {!empty && (
            <div className="pr-th" aria-hidden="true">
              <span className="pr-c-id">Order</span>
              <span className="pr-c-main">Customer</span>
              <span className="pr-c-stage">{view === "closed" ? "Outcome" : "Stage"}</span>
              <span className="pr-c-qty">Qty</span>
              <span className="pr-c-val">Value</span>
              <span className="pr-c-due">Due</span>
              <span className="pr-c-who" />
              <span className="pr-c-act" />
            </div>
          )}

          {empty ? (
            <EmptyNote icon={<Icons.Production size={22} sw={1.5} />}>
              {!hasOrders
                ? source === "website"
                  ? <>No website orders yet. They show here when a customer orders on the website.</>
                  : <>No orders yet.{canEdit ? " Press New order to add the first one." : ""}</>
                : filtered || filters.count > 0
                  ? <>Nothing matches. <button type="button" className="pr-link" onClick={onClearAll}>Clear the filters</button></>
                  : view === "closed" ? "No finished orders yet." : "No orders at this stage right now."}
            </EmptyNote>
          ) : (
            <ul ref={listRef} className="pr-list kb-fill" tabIndex={0} aria-label="Orders" onKeyDown={onListKey}>
              {rows.map((o) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  today={today}
                  canEdit={canEdit}
                  busy={busyIds.has(o.id)}
                  isNew={isNewWeb ? isNewWeb(o) : false}
                  onOpen={onOpen}
                  onAdvance={onAdvance}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {/* what just changed, with Undo; the same quiet strip the Attendance and Tasks pages use */}
      {notice && (
        <div className={cn("pr-toast", notice.bad && "is-bad")} role="status">
          <span>{notice.text}</span>
          {notice.undo && <button type="button" onClick={notice.undo}><Undo size={13} sw={2} aria-hidden="true" /> Undo</button>}
        </div>
      )}
    </Tile>
  );
}

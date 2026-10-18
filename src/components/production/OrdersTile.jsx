import { Icons, cn } from "../ui";
import { EmptyNote, Tile } from "../bento/Bento";
import { Undo } from "../bento/icons";
import OrderRow from "./OrderRow";
import CalendarView from "./CalendarView";
import { QUICK } from "../../lib/production";

/**
 * The orders themselves: a list, or the same orders by delivery date on a calendar. What it shows
 * is decided by the pipeline strip (a stage, or the finished ones), the search box, the "This
 * month" switch and the quick filter the other tiles set; this tile only draws it.
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

export default function OrdersTile({
  rows, base, title, view, mode, query, quick, monthOnly, today, canEdit, busyIds, hasOrders, loading, notice,
  onQuery, onQuick, onMode, onMonthOnly, onOpen, onAdvance, onClearAll, onNoDate,
}) {
  const filtered = Boolean(query || quick);
  const empty = rows.length === 0;

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
      <div className="pr-bar">
        <label className="pr-search">
          <Icons.Search size={14} sw={1.9} aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search orders" aria-label="Search orders" />
        </label>

        {quick && (
          <button type="button" className="pr-pill is-on" onClick={() => onQuick("")} aria-label={`Showing only ${QUICK[quick].toLowerCase()}. Show all`}>
            {QUICK[quick]} <Icons.X size={12} sw={2.2} aria-hidden="true" />
          </button>
        )}

        <button type="button" className={cn("pr-pill", monthOnly && "is-on")} aria-pressed={monthOnly} onClick={() => onMonthOnly(!monthOnly)}>
          This month
        </button>

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
                ? <>No orders yet.{canEdit ? " Press New order to add the first one." : ""}</>
                : filtered || monthOnly
                  ? <>Nothing matches. <button type="button" className="pr-link" onClick={onClearAll}>Clear the filters</button></>
                  : view === "closed" ? "No finished orders yet." : "No orders at this stage right now."}
            </EmptyNote>
          ) : (
            <ul className="pr-list kb-fill" tabIndex={0} aria-label="Orders" onKeyDown={onListKey}>
              {rows.map((o) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  today={today}
                  canEdit={canEdit}
                  busy={busyIds.has(o.id)}
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

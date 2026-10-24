import { useMemo } from "react";
import { Icons } from "../ui";
import { EmptyNote, Tile } from "../bento/Bento";
import DataTable, { TwoLine } from "../table/DataTable";
import { FindBar } from "../filters/FilterMenu";
import PersonLink from "../profile/PersonLink";
import { Amount, StatusTag, Strip, UrgencyTag, Who } from "./parts";
import { tsMillis } from "../../utils/date";
import {
  ageDays, agoLabel, askedDay, daysLabel, decidedDay, fmtShort, isRequirement, isUrgent, isWaiting, kindLabel, plural,
  requestAmount, statusLabel, urgencyRank,
} from "../../lib/budget";

/**
 * The name cell. On a wide table the line under the name is the reason given (or the quantity); on a narrow one the facts that
 * matter most for a decision ride there instead (who asked, how long it has waited, a High mark, and a decided request's verdict).
 * Category, type and quantity are the first to go when width runs out: they are in the request's card.
 */
function WhatCell({ row, today, dropped }) {
  const waiting = isWaiting(row);
  const extra = [];
  if (dropped.has("who") && row.requestedBy) extra.push(row.requestedBy);
  if (dropped.has("asked")) extra.push(waiting ? daysLabel(ageDays(row, today)) : fmtShort(askedDay(row)));
  if (dropped.has("act") && !waiting) extra.push(statusLabel(row));
  const note = row.notes?.trim() || (isRequirement(row) && row.quantity ? `Quantity ${row.quantity}` : "");
  const text = extra.filter(Boolean).join(" · ") || note;
  // High is the one urgency worth a mark on a narrow row; it leads the line so a long name cannot push it off the end
  const high = dropped.has("urg") && isUrgent(row);
  const sub = high ? <><span className="kb-tag kb-tag--bad bd-mini">High</span>{text ? ` ${text}` : ""}</> : text;
  return <TwoLine main={row.title || "Untitled"} sub={sub} />;
}

function AskedCell({ row, today }) {
  const day = askedDay(row);
  if (!day) return <span className="dt-dim">—</span>;
  return (
    <span className="dt-stack">
      <span className="dt-num">{fmtShort(day)}</span>
      <small>{agoLabel(ageDays(row, today))}</small>
    </span>
  );
}

/** Where a row is in its list, so the page can put the cursor on whatever takes its place. */
const placeOf = (e) => {
  const row = e.currentTarget.closest(".dt-row");
  return row ? [...row.parentElement.children].indexOf(row) : 0;
};

/** Reject and Approve on a waiting request (for whoever may decide); on a decided one, what was decided, by whom and when. */
function DecisionCell({ row, canDecide, busy, onDecide }) {
  if (isWaiting(row)) {
    if (!canDecide) return <StatusTag row={row} />;
    const mine = busy && busy.id === row.id ? busy.status : null;
    return (
      <span className="bd-acts">
        <button
          type="button" className="kb-btn kb-btn--bad dt-act" disabled={Boolean(busy)} aria-busy={mine === "Rejected" || undefined}
          aria-label={`Reject ${row.title || "this request"}`} onClick={(e) => onDecide(row, "Rejected", placeOf(e))}
        >
          {mine === "Rejected" ? <span className="kb-spin" aria-hidden="true" /> : <Icons.X size={14} sw={2.2} aria-hidden="true" />}
          Reject
        </button>
        <button
          type="button" className="kb-btn kb-btn--good dt-act" disabled={Boolean(busy)} aria-busy={mine === "Approved" || undefined}
          aria-label={`Approve ${row.title || "this request"}`} onClick={(e) => onDecide(row, "Approved", placeOf(e))}
        >
          {mine === "Approved" ? <span className="kb-spin" aria-hidden="true" /> : <Icons.Check size={14} sw={2.4} aria-hidden="true" />}
          Approve
        </button>
      </span>
    );
  }
  const day = decidedDay(row);
  return (
    <span className="bd-decided">
      <StatusTag row={row} />
      <small>
        <PersonLink className="kpl--clip" name={row.reviewedBy || undefined}>{[row.reviewedBy, day && fmtShort(day)].filter(Boolean).join(" · ")}</PersonLink>
      </small>
    </span>
  );
}

function columnsFor({ today, canDecide, busy, onDecide }) {
  return [
    {
      id: "what", label: "Request", grow: true, min: 200, max: 560, sort: (r) => (r.title || "").toLowerCase(),
      render: (r, { dropped }) => <WhatCell row={r} today={today} dropped={dropped} />,
    },
    {
      id: "who", label: "Asked by", width: 176, drop: 5, sort: (r) => (r.requestedBy || "").toLowerCase(),
      render: (r) => <Who row={r} />,
    },
    {
      id: "cat", label: "Category", width: 150, drop: 6, sort: (r) => (r.category || "").toLowerCase(),
      render: (r) => <TwoLine main={r.category || "—"} sub={[kindLabel(r), isRequirement(r) ? r.quantity : ""].filter(Boolean).join(" · ")} />,
    },
    {
      id: "urg", label: "Urgency", width: 92, drop: 3, sort: (r) => urgencyRank(r.urgency),
      render: (r) => <UrgencyTag urgency={r.urgency} />,
    },
    {
      id: "amt", label: "Amount", width: 150, align: "end", first: "desc", sort: (r) => requestAmount(r)?.npr ?? null,
      render: (r) => <Amount row={r} />,
    },
    {
      id: "asked", label: "Asked", width: 108, align: "end", drop: 4, sort: (r) => tsMillis(r.createdAt) || null,
      render: (r) => <AskedCell row={r} today={today} />,
    },
    {
      id: "act", label: "Decision", width: 218, drop: 2,
      render: (r) => <DecisionCell row={r} canDecide={canDecide} busy={busy} onDecide={onDecide} />,
    },
  ];
}

const emptyText = ({ all, status, filtered }) => {
  if (all === 0) return "No requests yet. Press New request to ask for something.";
  if (filtered) return "No requests match that.";
  return { waiting: "All caught up. Nothing is waiting for a decision.", approved: "Nothing has been approved yet.", rejected: "Nothing has been rejected." }[status] || "No requests.";
};

/**
 * The requests themselves: waiting first, the most urgent on top and the one that has waited longest above the others.
 * A search and one Filters button hold everything that narrows them (Waiting | Approved | Rejected | All with their counts, the
 * side of the business, urgency, type and the rest); `filters` is the page's `useFilters` result, `filtered` whether the search or a
 * filter is narrowing the list, `untagged` how many requests have no side yet. A row is the button (anywhere you press opens that
 * request's card), and on a waiting one Reject and Approve are one press away. The table scrolls inside the pane and its heads sort it.
 */
export default function RequestsPane({
  rows, counts, status, filters, filtered, untagged, query, onQuery,
  today, canDecide, busy, onDecide, onOpen, activeId, loading,
  strip, onStripClose, capped, showAll, onShowAll,
}) {
  const columns = useMemo(() => columnsFor({ today, canDecide, busy, onDecide }), [today, canDecide, busy, onDecide]);
  const total = counts[status];

  return (
    <Tile
      area="list"
      icon={<Icons.Budget size={14} sw={1.8} />}
      title="Requests"
      note={filtered ? `${rows.length} of ${total}` : status === "all" ? `${rows.length} ${plural(rows.length, "request")}` : `${rows.length} ${status}`}
      align="top"
      className="bd-pane"
    >
      <div className="bd-tools fn-barrow">
        <FindBar
          filters={filters} value={query} onChange={onQuery} placeholder="Search requests"
          label="Search requests by item, person, category or note" scope={{ region: { untagged } }}
        />
      </div>

      {!canDecide && <p className="bd-viewonly">You can ask for things here. Approving and rejecting is for admins.</p>}

      {/* With nothing to list there is no table at all: a table body that holds only a message is a broken table to a screen
          reader, and a head of column names over "All caught up" says nothing. */}
      {!loading && rows.length === 0 ? (
        <div className="dt-empty">
          <EmptyNote icon={status === "waiting" && !filtered && counts.all > 0 ? <Icons.Check size={22} sw={1.6} /> : <Icons.Budget size={22} sw={1.5} />}>
            {emptyText({ all: counts.all, status, filtered })}
          </EmptyNote>
        </div>
      ) : (
        <DataTable
          label="Requests"
          rows={rows}
          limit={capped > 0 && !showAll ? capped : undefined}
          rowKey={(r) => r.id}
          columns={columns}
          onOpen={(r) => onOpen(r.id)}
          rowLabel={(r) => `Open ${r.title || "this request"}, asked by ${r.requestedBy || "someone"}, ${statusLabel(r).toLowerCase()}`}
          activeKey={activeId}
          loading={loading}
        />
      )}

      {capped > 0 && rows.length > capped && !showAll && (
        <div className="bd-morerow"><button type="button" className="bd-more" onClick={onShowAll}>Show all {rows.length}</button></div>
      )}

      <Strip strip={strip} onClose={onStripClose} />
    </Tile>
  );
}

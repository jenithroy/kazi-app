/** The Leads conversation list — same shell classes as the Team pane, so the
 * two tabs read as one page, but with no compose/pin/leave: a lead is
 * created by the customer messaging in, never by staff.
 *
 * Ordered by value tier first, recency second — but the order is frozen
 * while the pointer is over the list, so a re-score landing mid-poll can't
 * shuffle a row out from under someone's cursor. New conversations that
 * arrive while frozen still show up, just appended rather than sorted in
 * until the freeze lifts. */

import { useMemo, useRef, useState } from "react";
import { Icons } from "../ui";
import { leadPreview, listTime, valueRank } from "../../lib/leadsFormat";
import LeadAvatar from "./LeadAvatar";
import ValueBadge from "./ValueBadge";

function byValueThenRecency(a, b) {
  const rankDiff = valueRank(b) - valueRank(a);
  if (rankDiff !== 0) return rankDiff;
  return new Date(b.lastMessage?.createdAt || 0) - new Date(a.lastMessage?.createdAt || 0);
}

function LeadRow({ lead, active, onOpen }) {
  const title = lead.name || "Instagram user";
  return (
    <div
      className={`kchat-row${active ? " kchat-row--active" : ""}`}
      onClick={() => onOpen(lead.convo)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(lead.convo);
        }
      }}
      role="button"
      tabIndex={0}
      aria-current={active || undefined}
    >
      <LeadAvatar convo={lead.convo} name={lead.name} profilePic={lead.profilePic} size={40} />

      <div className="kchat-row-body">
        <div className="kchat-row-top">
          <span className="kchat-row-name">{title}</span>
          <span className="kchat-row-time">{listTime(lead.lastMessage?.createdAt)}</span>
        </div>

        <div className="kchat-row-bottom">
          <span className="kchat-row-preview">{leadPreview(lead)}</span>
          <span className="kchat-row-marks">
            <ValueBadge value={lead.value} />
            {lead.isMuted ? (
              <span className="kchat-lead-chip" title="You're handling this conversation">
                <Icons.BellOff size={10} /> You
              </span>
            ) : (
              <span className="kchat-lead-chip kchat-lead-chip--bot" title="The bot is replying automatically">
                <Icons.Bot size={10} /> Bot
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function LeadsList({ leads, activeConvo, loading, onOpen }) {
  const [query, setQuery] = useState("");
  const [frozen, setFrozen] = useState(false);
  const orderRef = useRef([]);

  const sorted = useMemo(() => [...leads].sort(byValueThenRecency), [leads]);

  if (!frozen || orderRef.current.length === 0) {
    orderRef.current = sorted.map((l) => l.convo);
  }

  const byConvo = useMemo(() => new Map(leads.map((l) => [l.convo, l])), [leads]);
  const ordered = useMemo(() => {
    const known = new Set(orderRef.current);
    const rows = orderRef.current.map((id) => byConvo.get(id)).filter(Boolean);
    for (const lead of sorted) {
      if (!known.has(lead.convo)) rows.push(lead);
    }
    return rows;
    // orderRef.current is intentionally read as a snapshot each render, not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byConvo, sorted, frozen]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((lead) => [lead.name || "", leadPreview(lead)].join(" ").toLowerCase().includes(q));
  }, [ordered, query]);

  return (
    <div className="kchat-list">
      <div className="kchat-list-hd">
        <div>
          <h3 className="kchat-list-title">Lead inbox</h3>
          <p className="kchat-list-sub">
            {loading ? "Loading…" : `${leads.length} conversation${leads.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      <div className="kchat-search">
        <Icons.Search size={13} />
        <input
          type="search"
          placeholder="Search leads"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search leads"
        />
        {query && (
          <button type="button" className="kchat-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
            <Icons.X size={12} />
          </button>
        )}
      </div>

      <div className="kchat-rows" onMouseEnter={() => setFrozen(true)} onMouseLeave={() => setFrozen(false)}>
        {loading ? (
          [0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="kchat-row kchat-row--skeleton">
              <span className="kchat-skel kchat-skel--av" />
              <div className="kchat-row-body">
                <span className="kchat-skel kchat-skel--line" style={{ width: "45%" }} />
                <span className="kchat-skel kchat-skel--line" style={{ width: "75%" }} />
              </div>
            </div>
          ))
        ) : visible.length === 0 ? (
          <div className="kchat-empty kchat-empty--sm">
            <Icons.Bot size={22} sw={1.4} />
            <p>{query ? `Nothing matches “${query}”.` : "No conversations yet — they'll appear here as customers DM you."}</p>
          </div>
        ) : (
          visible.map((lead) => (
            <LeadRow key={lead.convo} lead={lead} active={lead.convo === activeConvo} onOpen={onOpen} />
          ))
        )}
      </div>
    </div>
  );
}

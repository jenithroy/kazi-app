/** The Leads conversation list — same shell classes as the Team pane, so the
 * two tabs read as one page, but with no compose/pin/leave: a lead is
 * created by the customer messaging in, never by staff. */

import { useMemo, useState } from "react";
import { Avatar, Icons } from "../ui";
import { hueFor } from "../../lib/chatFormat";
import { leadPreview, listTime } from "../../lib/leadsFormat";

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
      <span className="kchat-av" style={{ width: 40, height: 40 }}>
        <Avatar name={title} hue={hueFor(lead.convo)} size={40} />
      </span>

      <div className="kchat-row-body">
        <div className="kchat-row-top">
          <span className="kchat-row-name">{title}</span>
          <span className="kchat-row-time">{listTime(lead.lastMessage?.createdAt)}</span>
        </div>

        <div className="kchat-row-bottom">
          <span className="kchat-row-preview">{leadPreview(lead)}</span>
          <span className="kchat-row-marks">
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((lead) =>
      [lead.name || "", leadPreview(lead)].join(" ").toLowerCase().includes(q)
    );
  }, [leads, query]);

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

      <div className="kchat-rows">
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

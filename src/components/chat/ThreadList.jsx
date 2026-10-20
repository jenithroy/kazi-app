/**
 * The conversation list -- the left pane on a desktop, the whole screen on a
 * phone until a thread is opened.
 */

import { useMemo, useRef, useState } from "react";
import { Icons } from "../ui";
import { SearchBox } from "../table/Bar";
import { Menu, MenuDivider, MenuItem, ThreadAvatar } from "./ChatBits";
import {
  listTime,
  previewOf,
  threadMemberNames,
  threadRole,
  threadTitle,
} from "../../lib/chatFormat";

function ThreadRow({ thread, last, unread, active, onOpen, onSetRead, onSetFlag, onLeave }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef(null);
  const hasUnread = unread > 0;

  return (
    <div className={`kchat-row${active ? " kchat-row--active" : ""}`}>
      {/* The row is one button stretched over it (what the screen reader reads: who, what was last said, how many are unread);
          the row's menu is a second button above it, so neither is inside the other. */}
      <button
        type="button"
        className="kchat-row-hit"
        onClick={() => onOpen(thread.id)}
        aria-current={active || undefined}
        aria-label={[threadTitle(thread), previewOf(thread, last), hasUnread ? `${unread} unread` : ""].filter(Boolean).join(", ")}
      />
      <ThreadAvatar thread={thread} size={40} />

      <div className="kchat-row-body">
        <div className="kchat-row-top">
          <span className={`kchat-row-name${hasUnread ? " kchat-row-name--unread" : ""}`}>
            {threadTitle(thread)}
          </span>
          <span className="kchat-row-time">{listTime(last?.at || thread.createdAt)}</span>
        </div>

        <div className="kchat-row-bottom">
          <span className={`kchat-row-preview${hasUnread ? " kchat-row-preview--unread" : ""}`}>
            {previewOf(thread, last)}
          </span>

          <span className="kchat-row-marks">
            {thread.pinned && <Icons.Pin size={11} aria-label="Pinned" />}
            {thread.muted && <Icons.BellOff size={11} aria-label="Muted" />}
            {hasUnread && <span className="kchat-badge">{unread > 99 ? "99+" : unread}</span>}
          </span>
        </div>
      </div>

      <div className="kchat-row-menu">
        <button
          ref={menuTrigger}
          type="button"
          className="kchat-icon-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={`Options for ${threadTitle(thread)}`}
        >
          <Icons.More size={14} />
        </button>

        <Menu open={menuOpen} onClose={() => setMenuOpen(false)} triggerRef={menuTrigger} label={`Options for ${threadTitle(thread)}`}>
          <MenuItem
            icon={Icons.Check}
            onClick={() => {
              // Read when it has unread; unread when it does not.
              onSetRead(thread.id, hasUnread);
              setMenuOpen(false);
            }}
          >
            {hasUnread ? "Mark as read" : "Mark as unread"}
          </MenuItem>
          <MenuItem
            icon={Icons.Pin}
            onClick={() => {
              onSetFlag(thread.id, "pinned", !thread.pinned);
              setMenuOpen(false);
            }}
          >
            {thread.pinned ? "Unpin" : "Pin to top"}
          </MenuItem>
          <MenuItem
            icon={thread.muted ? Icons.Bell : Icons.BellOff}
            onClick={() => {
              onSetFlag(thread.id, "muted", !thread.muted);
              setMenuOpen(false);
            }}
          >
            {thread.muted ? "Unmute" : "Mute"}
          </MenuItem>
          <MenuDivider />
          <MenuItem
            icon={Icons.Trash}
            danger
            onClick={() => {
              setMenuOpen(false);
              onLeave(thread);
            }}
          >
            {thread.kind === "group" ? "Leave group" : "Delete conversation"}
          </MenuItem>
        </Menu>
      </div>
    </div>
  );
}

export default function ThreadList({
  threads,
  lastByThread,
  unread,
  totalUnread,
  activeId,
  loading,
  canCompose,
  onOpen,
  onCompose,
  onSetRead,
  onSetFlag,
  onLeave,
}) {
  const [query, setQuery] = useState("");

  /**
   * Search covers the name, the job title, everyone in a group, and the last
   * message -- the four things people actually remember a conversation by.
   */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) =>
      [threadTitle(t), threadRole(t), threadMemberNames(t), previewOf(t, lastByThread[t.id])]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [threads, lastByThread, query]);

  const summary = totalUnread > 0
    ? `${totalUnread} unread · ${threads.length} conversation${threads.length === 1 ? "" : "s"}`
    : `${threads.length} conversation${threads.length === 1 ? "" : "s"} · all read`;

  return (
    <section className="kb-tile kchat-list" style={{ gridArea: "list" }} aria-label="Conversations">
      <div className="kchat-list-hd">
        <div>
          <h2 className="kchat-list-title">Team chat</h2>
          <p className="kchat-list-sub">{loading ? "Loading…" : summary}</p>
        </div>
        {canCompose && (
          <button type="button" className="kchat-compose" onClick={onCompose} title="New conversation" aria-label="New conversation">
            <Icons.Plus size={15} sw={2.2} />
          </button>
        )}
      </div>

      <SearchBox value={query} onChange={setQuery} placeholder="Search people, groups or messages" label="Search conversations" />

      <div className="kchat-rows">
        {loading ? (
          // Skeletons rather than a spinner: the list keeps its shape, so
          // nothing jumps when the real rows land.
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
            <Icons.Message size={22} sw={1.4} />
            <p>{query ? `Nothing matches “${query}”.` : "No conversations yet."}</p>
            {!query && canCompose && (
              <button type="button" className="kb-btn kb-btn--primary" onClick={onCompose}>
                Start one
              </button>
            )}
          </div>
        ) : (
          visible.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              last={lastByThread[thread.id]}
              unread={unread[thread.id] || 0}
              active={thread.id === activeId}
              onOpen={onOpen}
              onSetRead={onSetRead}
              onSetFlag={onSetFlag}
              onLeave={onLeave}
            />
          ))
        )}
      </div>
    </section>
  );
}

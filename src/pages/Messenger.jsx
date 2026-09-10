/**
 * Messenger.
 *
 * Two inboxes behind one page, because they are two different jobs that happen
 * to both be chat:
 *
 *   **Team** -- staff talking to each other. Backed by the `chat_*` tables the
 *   mobile app introduced (migrations 0105-0109) in this same Supabase
 *   project, so a message typed on the cutting floor arrives here and a reply
 *   typed here arrives on the phone. Everything below is a client for that
 *   schema; none of it is web-only state.
 *
 *   **Leads** -- people arriving from Meta ads, answered by a bot with a human
 *   able to take over. That half needs a backend and tables that do not exist
 *   yet, so the tab is present and honest about being unbuilt rather than
 *   hidden until it works.
 *
 * The page it replaces read `fs_messages`, the abandoned Firestore-era table
 * that migration 0105 describes as holding one test row. Nothing was migrated
 * because there was nothing in it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icons } from "../components/ui";
import { useTeamChat } from "../hooks/useTeamChat";
import { uploadAttachment } from "../lib/chat";
import { threadTitle } from "../lib/chatFormat";
import ThreadList from "../components/chat/ThreadList";
import ThreadView from "../components/chat/ThreadView";
import {
  ConfirmDialog,
  ContactDialog,
  GroupDialog,
  MediaViewer,
  NewChatDialog,
} from "../components/chat/ChatDialogs";

/* ── the leads tab, until it has a backend ────────────── */

function LeadsPlaceholder() {
  return (
    <div className="kchat-placeholder">
      <span className="kchat-placeholder-ico">
        <Icons.Bot size={26} sw={1.4} />
      </span>
      <h3>Lead inbox</h3>
      <p>
        Conversations from Instagram and Messenger land here, answered by the assistant and ranked by how much
        the lead looks worth. Nothing is connected yet -- the bot service and its tables come next.
      </p>
      <ul className="kchat-placeholder-list">
        <li>A Meta webhook writing every inbound message straight to Supabase</li>
        <li>Replies drafted by the assistant, with a one-click human takeover that mutes it</li>
        <li>A score per lead, with the evidence behind it shown rather than asserted</li>
      </ul>
    </div>
  );
}

/* ── page ─────────────────────────────────────────────── */

export default function Messenger() {
  const chat = useTeamChat();

  const [tab, setTab] = useState("team");
  const [activeId, setActiveId] = useState(null);
  const [showThreadOnMobile, setShowThreadOnMobile] = useState(false);

  const [composing, setComposing] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [media, setMedia] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const { threads, messages, unread, totalUnread, loading, error } = chat;

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeId) || null,
    [threads, activeId]
  );

  /**
   * Keep a thread selected on a desktop, where an empty right-hand pane is
   * just wasted space -- but never auto-open one on a phone, where that would
   * bury the list the moment the page loads.
   */
  useEffect(() => {
    if (loading || !threads.length) return;
    if (activeId && threads.some((t) => t.id === activeId)) return;
    const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 861px)").matches;
    if (wide) setActiveId(threads[0].id);
  }, [loading, threads, activeId]);

  const openThread = useCallback((id) => {
    setActiveId(id);
    setShowThreadOnMobile(true);
  }, []);

  /** Ctrl/Cmd+K jumps to the filter, the shortcut every list in every app has trained people to expect. */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.querySelector(".kchat-list .kchat-search input")?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const askToLeave = (thread) =>
    setConfirm({
      title: thread.kind === "group" ? "Leave this group?" : "Delete this conversation?",
      body:
        thread.kind === "group"
          ? `You will stop receiving messages from ${threadTitle(thread)}. Everyone else keeps the group and its history.`
          : `This removes ${threadTitle(thread)} from your list. They keep every message, and re-opening the conversation later brings your history back.`,
      confirmLabel: thread.kind === "group" ? "Leave group" : "Delete for me",
      onConfirm: async () => {
        await chat.leave(thread.id);
        if (activeId === thread.id) {
          setActiveId(null);
          setShowThreadOnMobile(false);
        }
      },
    });

  const askToDelete = (message) =>
    setConfirm({
      title: "Delete this message?",
      body: "It will be replaced by “This message was deleted” for everyone in the conversation. Any attachment is removed too.",
      confirmLabel: "Delete",
      onConfirm: () => chat.remove(message.threadId, [message.id]),
    });

  return (
    <div className="kscr fade-in kchat-shell">
      {/* Tabs. The team badge counts unread across every conversation, so the
          page is worth glancing at from another module. */}
      <div className="kchat-tabs">
        <button type="button" className={tab === "team" ? "is-on" : ""} onClick={() => setTab("team")}>
          <Icons.Message size={14} />
          Team
          {totalUnread > 0 && <span className="kchat-badge kchat-badge--tab">{totalUnread > 99 ? "99+" : totalUnread}</span>}
        </button>
        <button type="button" className={tab === "leads" ? "is-on" : ""} onClick={() => setTab("leads")}>
          <Icons.Bot size={14} />
          Leads
          <span className="kchat-soon">Soon</span>
        </button>
      </div>

      {error && (
        <div className="kchat-error">
          <Icons.Alert size={14} />
          <span>{error}</span>
          <button type="button" onClick={chat.dismissError} aria-label="Dismiss">
            <Icons.X size={12} />
          </button>
        </div>
      )}

      {tab === "leads" ? (
        <LeadsPlaceholder />
      ) : (
        <div className={`kchat-panes${showThreadOnMobile ? " kchat-panes--thread" : ""}`}>
          <ThreadList
            threads={threads}
            lastByThread={chat.lastByThread}
            unread={unread}
            totalUnread={totalUnread}
            activeId={activeId}
            loading={loading}
            canCompose={chat.canPost}
            onOpen={openThread}
            onCompose={() => setComposing(true)}
            onSetRead={chat.markRead}
            onSetFlag={chat.setFlag}
            onLeave={askToLeave}
          />

          {activeThread ? (
            <ThreadView
              thread={activeThread}
              messages={messages[activeThread.id] || []}
              unread={unread[activeThread.id] || 0}
              canPost={chat.canPost}
              canManageGroup={chat.rights.manage}
              onBack={() => setShowThreadOnMobile(false)}
              onSend={chat.send}
              onUpload={uploadAttachment}
              onReact={(messageId, emoji) => chat.react(activeThread.id, messageId, emoji)}
              onEdit={(messageId, text) => chat.edit(activeThread.id, messageId, text)}
              onDelete={askToDelete}
              onMarkRead={chat.markRead}
              onSetFlag={chat.setFlag}
              onLeave={askToLeave}
              onOpenContact={() => setShowContact(true)}
              onOpenGroup={() => setEditingGroup(true)}
              onOpenMedia={setMedia}
            />
          ) : (
            <div className="kchat-thread kchat-thread--empty">
              <div className="kchat-empty">
                <span className="kchat-placeholder-ico">
                  <Icons.Message size={26} sw={1.4} />
                </span>
                <h4>{loading ? "Loading your conversations" : "No conversation open"}</h4>
                <p>
                  {loading
                    ? "One moment."
                    : threads.length
                    ? "Pick someone on the left, or start a new conversation."
                    : "Start a conversation with anyone on the staff list."}
                </p>
                {!loading && chat.canPost && (
                  <button type="button" className="primary-button" onClick={() => setComposing(true)}>
                    New conversation
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {composing && (
        <NewChatDialog
          directory={chat.directory}
          canCreateGroup={chat.rights.create}
          onClose={() => setComposing(false)}
          onStartDm={async (personId) => openThread(await chat.startDm(personId))}
          onStartGroup={async (name, memberIds) => openThread(await chat.startGroup(name, memberIds))}
        />
      )}

      {editingGroup && activeThread?.kind === "group" && (
        <GroupDialog
          thread={activeThread}
          directory={chat.directory}
          onClose={() => setEditingGroup(false)}
          onSave={chat.saveGroup}
        />
      )}

      {showContact && activeThread && (
        <ContactDialog thread={activeThread} onClose={() => setShowContact(false)} />
      )}

      {media && <MediaViewer attachment={media} onClose={() => setMedia(null)} />}

      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

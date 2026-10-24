/**
 * Chat. (It was called Messenger; the file, the /messenger route and the
 * `messenger` permission id keep that name because links, push notifications
 * and the permission matrix point at it.)
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
 *   **Leads** -- people DMing the Instagram account, answered automatically by
 *   `meta-dm-bot` (a separate Python service, not part of this build) with a
 *   human able to take over. This half is a client for that service's own API
 *   (`app/dashboard.py`, `lib/leadsBot.js`), not Supabase -- the bot's tables
 *   live in the same Supabase project but are reached only through its API,
 *   since replying needs the Instagram access token that only the bot holds.
 *
 * The page it replaces read `fs_messages`, the abandoned Firestore-era table
 * that migration 0105 describes as holding one test row. Nothing was migrated
 * because there was nothing in it.
 *
 * The look is the glass one (components/chat/chat.css): the header holds the title and the two inbox tabs, and under it two panes on
 * one screen, the conversations on the left and the open conversation on the right. A phone shows one pane at a time. What is read,
 * who may post, and every write are the hooks' and lib/chat.js's, unchanged.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icons } from "../components/ui";
import { BentoGrid, BentoPage } from "../components/bento/Bento";
import { useAuth } from "../context/AuthContext";
import { useTeamChat } from "../hooks/useTeamChat";
import { useLeadsChat } from "../hooks/useLeadsChat";
import { uploadAttachment } from "../lib/chat";
import { threadTitle } from "../lib/chatFormat";
import { messengerTabAllowed, messengerTabCanEdit } from "../utils/permissions";
import ThreadList from "../components/chat/ThreadList";
import ThreadView from "../components/chat/ThreadView";
import LeadsList from "../components/leads/LeadsList";
import LeadsThread from "../components/leads/LeadsThread";
import "../components/chat/chat.css";
import {
  ConfirmDialog,
  ContactDialog,
  GroupDialog,
  MediaViewer,
  NewChatDialog,
} from "../components/chat/ChatDialogs";

/* ── page ─────────────────────────────────────────────── */

/** Nothing open on the right: say what to do, and on the team inbox offer the one button that starts a conversation. */
function EmptyPane({ icon: Icon, title, text, action }) {
  return (
    <section className="kb-tile kchat-thread kchat-thread--empty" style={{ gridArea: "thread" }} aria-label="No conversation open">
      <div className="kchat-empty">
        <span className="kchat-placeholder-ico">
          <Icon size={26} sw={1.4} />
        </span>
        <h3>{title}</h3>
        <p>{text}</p>
        {action}
      </div>
    </section>
  );
}

export default function Messenger() {
  const { profile } = useAuth();
  const chat = useTeamChat();

  const canViewLeads = messengerTabAllowed(profile, "leads");
  const canEditLeads = messengerTabCanEdit(profile, "leads");

  const [tab, setTab] = useState("team");
  const [activeId, setActiveId] = useState(null);
  const [showThreadOnMobile, setShowThreadOnMobile] = useState(false);

  // Permission can change under someone mid-session (role edited elsewhere,
  // or this is the first render before the profile has resolved) — bounce
  // back to Team rather than leaving a tab open that's no longer allowed.
  useEffect(() => {
    if (tab === "leads" && !canViewLeads) setTab("team");
  }, [tab, canViewLeads]);

  const leadsChat = useLeadsChat(tab === "leads" && canViewLeads);
  const activeLead = useMemo(
    () => leadsChat.leads.find((l) => l.convo === leadsChat.activeConvo) || null,
    [leadsChat.leads, leadsChat.activeConvo]
  );
  const openLead = useCallback(
    (convo) => {
      leadsChat.openLead(convo);
      setShowThreadOnMobile(true);
    },
    [leadsChat]
  );

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
    const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 769px)").matches;
    if (wide) setActiveId(threads[0].id);
  }, [loading, threads, activeId]);

  const openThread = useCallback((id) => {
    setActiveId(id);
    setShowThreadOnMobile(true);
  }, []);

  /**
   * "Message" on someone's profile card brings you here as /messenger?with=<person id>. Open the conversation you already have with
   * them, or start one the way "New conversation" does (the same RPC, which hands back the existing one if there is one), put the
   * cursor in the message box, and take the person out of the address so a reload does not do it again. A reason it cannot be done
   * goes in the strip at the top, in words.
   */
  const [params, setParams] = useSearchParams();
  const withId = params.get("with");
  const [startError, setStartError] = useState("");
  const [wanted, setWanted] = useState(null);                  // a conversation to open as soon as the list has it
  const [focusToken, setFocusToken] = useState(0);
  const startedFor = useRef("");
  const { directory, canPost, me, startDm } = chat;
  useEffect(() => {
    if (!withId) { startedFor.current = ""; return; }
    if (loading || startedFor.current === withId) return;      // wait for the first read; once for each person
    startedFor.current = withId;
    (async () => {
      try {
        const mine = threads.find((t) => t.kind === "dm" && t.memberIds[0] === withId);
        if (mine) setWanted(mine.id);
        else if (withId === me || error) { /* yourself, or the read failed and its reason is already on screen: the page as it is */ }
        else if (!canPost) setStartError("Your role can read conversations here but not start one.");
        else if (!directory.some((p) => p.id === withId)) setStartError("That person is not on the staff list.");
        else setWanted(await startDm(withId));
      } catch (err) {
        console.error("[chat] could not open the conversation:", err);
        setStartError(err.message || "Could not start that conversation.");
      } finally {
        setParams((p) => { const next = new URLSearchParams(p); next.delete("with"); return next; }, { replace: true });
      }
    })();
  }, [withId, loading, threads, directory, canPost, me, error, startDm, setParams]);
  // "Open Chat" after a record was sent to a group (components/share/ShareDialog.jsx) arrives as /messenger?thread=<conversation id>.
  const threadParam = params.get("thread");
  useEffect(() => {
    if (!threadParam || loading) return;
    if (threads.some((t) => t.id === threadParam)) setWanted(threadParam);
    setParams((p) => { const next = new URLSearchParams(p); next.delete("thread"); return next; }, { replace: true });
  }, [threadParam, loading, threads, setParams]);
  // Open it once the list holds it (a new conversation is in the list a moment after it was made; selecting it sooner would be undone by
  // the effect above that keeps some conversation selected), then put the cursor in the message box.
  useEffect(() => {
    if (!wanted || !threads.some((t) => t.id === wanted)) return;
    openThread(wanted);
    setFocusToken((n) => n + 1);
    setWanted(null);
  }, [wanted, threads, openThread]);

  /** Ctrl/Cmd+K jumps to the filter, the shortcut every list in every app has trained people to expect. */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.querySelector(".kchat-list .dt-search input")?.focus();
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

  // the two tabs: the arrow keys, Home and End move between them
  const tabs = canViewLeads ? ["team", "leads"] : ["team"];
  const onTabKey = (e) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key) || tabs.length < 2) return;
    e.preventDefault();
    const list = e.currentTarget;          // (the event's own currentTarget is gone by the time the frame comes)
    const at = tabs.indexOf(tab);
    const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (at + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setTab(tabs[next]);
    setShowThreadOnMobile(false);
    requestAnimationFrame(() => list.querySelector('[aria-selected="true"]')?.focus());
  };

  const bannerText = startError || (tab === "leads" ? leadsChat.error : error);
  const dismissBanner = startError ? () => setStartError("") : tab === "leads" ? leadsChat.dismissError : chat.dismissError;

  return (
    <BentoPage className="ch-page">
      <header className="kb-head">
        <div className="kb-head-l">
          <h1>Chat</h1>
        </div>
        <div className="kb-head-r">
          {/* The team badge counts unread across every conversation, so the page is worth glancing at from another module. */}
          <div className="dt-tabs ch-tabs" role="tablist" aria-label="Which inbox" onKeyDown={onTabKey}>
            <button
              type="button" role="tab" id="ch-tab-team" aria-selected={tab === "team"} tabIndex={tab === "team" ? 0 : -1} className="dt-tab"
              aria-label={totalUnread > 0 ? `Team ${totalUnread} unread` : undefined}   /* starts with the words on screen ("Team 16"), as the name must */
              onClick={() => { setTab("team"); setShowThreadOnMobile(false); }}
            >
              <Icons.Message size={14} aria-hidden="true" />
              <span>{"Team "}</span>
              {totalUnread > 0 && <span className="kchat-badge" aria-hidden="true">{totalUnread > 99 ? "99+" : totalUnread}</span>}
            </button>
            {canViewLeads && (
              <button
                type="button" role="tab" id="ch-tab-leads" aria-selected={tab === "leads"} tabIndex={tab === "leads" ? 0 : -1} className="dt-tab"
                onClick={() => { setTab("leads"); setShowThreadOnMobile(false); }}
              >
                <Icons.Bot size={14} aria-hidden="true" />
                <span>Leads</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {bannerText && (
        <div className="fn-banner fn-banner--bad" role="alert">
          <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
          <span>{bannerText}</span>
          <button type="button" onClick={dismissBanner} aria-label="Dismiss"><Icons.X size={14} sw={2} aria-hidden="true" /></button>
        </div>
      )}

      {tab === "leads" ? (
        <BentoGrid layout={showThreadOnMobile ? "chat-thread" : "chat"}>
          <LeadsList
            leads={leadsChat.leads}
            activeConvo={leadsChat.activeConvo}
            loading={leadsChat.loading}
            onOpen={openLead}
          />

          {activeLead ? (
            <LeadsThread
              lead={activeLead}
              messages={leadsChat.messages}
              loading={leadsChat.threadLoading}
              sending={leadsChat.sending}
              canPost={canEditLeads}
              onBack={() => setShowThreadOnMobile(false)}
              onSend={(text) => leadsChat.reply(activeLead.convo, text)}
              onSendAttachment={(file) => leadsChat.sendAttachment(activeLead.convo, file)}
              onTakeover={(muted) => leadsChat.takeover(activeLead.convo, muted)}
              onOpenMedia={setMedia}
            />
          ) : (
            <EmptyPane
              icon={Icons.Bot}
              title={leadsChat.loading ? "Loading the lead inbox" : "No conversation open"}
              text={
                leadsChat.loading
                  ? "One moment."
                  : leadsChat.leads.length
                  ? "Pick a conversation on the left."
                  : "Conversations will appear here as customers DM your Instagram account."
              }
            />
          )}
        </BentoGrid>
      ) : (
        <BentoGrid layout={showThreadOnMobile ? "chat-thread" : "chat"}>
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
              focusToken={focusToken}
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
            <EmptyPane
              icon={Icons.Message}
              title={loading ? "Loading your conversations" : "No conversation open"}
              text={
                loading
                  ? "One moment."
                  : threads.length
                  ? "Pick someone on the left, or start a new conversation."
                  : "Start a conversation with anyone on the staff list."
              }
              action={
                !loading && chat.canPost ? (
                  <button type="button" className="kb-btn kb-btn--primary" onClick={() => setComposing(true)}>
                    New conversation
                  </button>
                ) : null
              }
            />
          )}
        </BentoGrid>
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
    </BentoPage>
  );
}

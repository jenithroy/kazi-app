import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { useToast } from '@/components/toast/toast-provider';
import { isBlocked, ScreenGate } from '@/components/ui/screen-gate';
import { ScreenHeader } from '@/components/ui/screen-header';
import { TabStrip } from '@/components/ui/tab-strip';
import { ViewSwap } from '@/components/ui/view-swap';
import { useTheme } from '@/theme/theme-provider';
import {
  useChatRealtime,
  useCreateThread,
  useDeleteMessages,
  useDeleteThread,
  useDirectory,
  useGroupRights,
  useMessages,
  useSendMessage,
  useSetThreadFlag,
  useSetThreadRead,
  useThreads,
  useToggleReaction,
  useUnread,
  useUpdateGroup,
} from '@/data/chat/hooks';
import { isSupabaseConfigured } from '@/lib/supabase';
import { TYPING_IN } from '@/data/chat/mock';
import type { Attachment, ChatView, Message, MessageId, PersonId, ThreadId } from '@/data/chat/types';
import { myId, sortThreads, threadTitle } from '@/data/chat/utils';
import {
  useLeadMessages,
  useLeads,
  useReplyToLead,
  useSendLeadAttachment,
  useSetLeadTakeover,
} from '@/data/leads/hooks';
import type { LeadConvoId } from '@/data/leads/types';

import { LeadsListView, type LeadSort } from './leads/leads-list-view';
import { LeadThreadView } from './leads/lead-thread-view';
import { NewChatSheet } from './new-chat-sheet';
import { ThreadListView } from './thread-list-view';
import { ThreadView } from './thread-view';

/** Outermost first — `ViewSwap` reads the direction of travel from this. Team and Leads share the same two keys: a tab switch only ever happens list-to-list, so it plays no transition at all — only opening/leaving a thread does. */
const CHAT_VIEW_ORDER: readonly ChatView[] = ['list', 'thread'];

type MessengerTab = 'team' | 'leads';

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err ?? 'Something went wrong'));

export interface ChatProps {
  /** Deep link: a `chat_threads.id` to open on mount, from a chat push notification. */
  threadId?: string;
}

export function Chat({ threadId }: ChatProps = {}) {
  const theme = useTheme();
  const toast = useToast();
  const { can, messengerTab, messengerTabEdit } = useAuth();
  const canPost = can('messenger');
  const canViewLeads = messengerTab('leads');
  const canEditLeads = messengerTabEdit('leads');

  const directoryQuery = useDirectory();
  const rightsQuery = useGroupRights();
  const threadsQuery = useThreads();
  const messagesQuery = useMessages();
  const unreadQuery = useUnread();
  const { data: directory } = directoryQuery;
  const { data: rights } = rightsQuery;
  const { data: threads } = threadsQuery;
  const { data: messages, refetch: refetchMessages } = messagesQuery;
  const { data: unread, refetch: refetchUnread } = unreadQuery;

  // Threads, messages and reactions arrive as they happen; the reads above
  // reassemble whatever moved.
  useChatRealtime();

  const sendMessage = useSendMessage();
  const toggleReaction = useToggleReaction();
  const deleteMessages = useDeleteMessages();
  const setThreadRead = useSetThreadRead();
  const setThreadFlag = useSetThreadFlag();
  const deleteThread = useDeleteThread();
  const createThread = useCreateThread();
  const updateGroup = useUpdateGroup();

  const [view, setView] = useState<ChatView>('list');
  const [activeId, setActiveId] = useState<ThreadId | null>(null);
  const [composing, setComposing] = useState(false);
  /** Bumped on every open so `NewChatSheet` remounts with fresh state instead of resetting it in an effect. */
  const [composeSession, setComposeSession] = useState(0);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncedAt, setSyncedAt] = useState('just now');
  const [threadHandled, setThreadHandled] = useState(false);

  const [tabChoice, setTab] = useState<MessengerTab>('team');
  // Permission can change under someone mid-session (role edited elsewhere,
  // or this is the first render before the profile has resolved) — derived
  // rather than synced back with an effect, so a tab that's no longer
  // allowed never has a chance to render before this clamps it to Team.
  const tab: MessengerTab = tabChoice === 'leads' && !canViewLeads ? 'team' : tabChoice;
  const [activeConvo, setActiveConvo] = useState<LeadConvoId | null>(null);
  const [leadsRefreshing, setLeadsRefreshing] = useState(false);
  // Held here rather than in `LeadsListView`, which unmounts while a lead's
  // conversation is open — a state local to it would reset on every back nav.
  const [leadSort, setLeadSort] = useState<LeadSort>('value');

  const leadsQuery = useLeads(tab === 'leads' && canViewLeads);
  const leads = leadsQuery.data ?? [];
  const activeLead = activeConvo ? (leads.find((l) => l.convo === activeConvo) ?? null) : null;
  const leadMessagesQuery = useLeadMessages(tab === 'leads' ? activeConvo : null);
  const replyToLead = useReplyToLead();
  const sendLeadAttachment = useSendLeadAttachment();
  const setLeadTakeover = useSetLeadTakeover();

  /** Everyone but me — the compose sheet and the group editor both work from this. */
  const people = useMemo(() => (directory ?? []).filter((p) => p.id !== myId()), [directory]);

  /** Last message per thread — drives both the preview and the list's recency order. */
  const lastByThread = useMemo(() => {
    const out: Record<ThreadId, Message | undefined> = {};
    for (const [id, list] of Object.entries(messages ?? {})) out[id] = list[list.length - 1];
    return out;
  }, [messages]);

  const ordered = useMemo(() => {
    const lastAt: Record<ThreadId, number> = {};
    for (const [id, m] of Object.entries(lastByThread)) lastAt[id] = m?.at ?? 0;
    return sortThreads(threads ?? [], lastAt);
  }, [threads, lastByThread]);

  if (
    isBlocked(directoryQuery, threadsQuery, messagesQuery, unreadQuery) ||
    !directory ||
    !threads ||
    !messages ||
    !unread
  ) {
    return (
      <ScreenGate
        queries={[directoryQuery, threadsQuery, messagesQuery, unreadQuery]}
        header={<ScreenHeader title="Chat" showBack={false} />}
      />
    );
  }

  // The rights read is not in the gate: it decides whether one row is offered,
  // and the database refuses the write regardless, so a slow or failed read
  // should not keep the whole screen off. Unknown means "not yet".
  const canCreateGroup = rights?.create ?? false;
  const canManageGroup = rights?.manage ?? false;

  const totalUnread = Object.values(unread).reduce((n, c) => n + c, 0);

  /** Only shown once there is a second inbox to switch to. */
  const tabStrip = canViewLeads ? (
    <TabStrip<MessengerTab>
      tabs={[
        { id: 'team', label: 'Team', count: totalUnread },
        { id: 'leads', label: 'Leads' },
      ]}
      active={tab}
      onChange={setTab}
    />
  ) : undefined;

  function openThread(id: ThreadId) {
    setActiveId(id);
    setView('thread');
    if ((unread?.[id] ?? 0) > 0) setThreadRead.mutate({ threadId: id, read: true });
  }

  // Deep link: open a specific thread on mount (from a chat push notification's
  // /chat?thread=<id>). Latched by threadHandled so it only steals focus once —
  // same one-shot-during-render pattern as Billing's `focus` prop.
  if (!threadHandled && threadId) {
    const match = threads.find((t) => t.id === threadId);
    if (match) {
      setThreadHandled(true);
      setTab('team');
      openThread(match.id);
    }
  }

  function handleBack() {
    setView('list');
    setActiveId(null);
  }

  /** Shared by the list's FAB and the deleted-thread screen's "Start a new message". */
  function openCompose() {
    if (!canPost) return;
    setComposeError(null);
    setComposeSession((n) => n + 1);
    setComposing(true);
  }

  /** Both compose paths — pick a person, or "reply privately" from a group message. */
  function startDm(personId: PersonId) {
    setComposeError(null);
    createThread.mutate(
      { kind: 'dm', personId },
      {
        onSuccess: (thread) => {
          setComposing(false);
          openThread(thread.id);
        },
        onError: (err) => setComposeError(messageOf(err)),
      },
    );
  }

  function createGroup(name: string, memberIds: PersonId[]) {
    setComposeError(null);
    createThread.mutate(
      { kind: 'group', name, memberIds },
      {
        onSuccess: (thread) => {
          setComposing(false);
          openThread(thread.id);
          toast.show({ message: `${thread.name} created with ${memberIds.length} others`, tone: 'ok' });
        },
        onError: (err) => setComposeError(messageOf(err)),
      },
    );
  }

  function saveGroup(threadId: ThreadId, name: string, memberIds: PersonId[]) {
    setGroupError(null);
    updateGroup.mutate(
      { threadId, name, memberIds },
      {
        onSuccess: () => toast.show({ message: `${name} updated`, tone: 'ok' }),
        onError: (err) => {
          setGroupError(messageOf(err));
          toast.show({ message: messageOf(err), tone: 'bad' });
        },
      },
    );
  }

  function handleDeleteThread(threadId: ThreadId) {
    const gone = threads?.find((t) => t.id === threadId);
    deleteThread.mutate(threadId, {
      onError: (err) => toast.show({ message: messageOf(err), tone: 'bad' }),
    });
    if (activeId === threadId) handleBack();
    if (gone) {
      toast.show({
        message: gone.kind === 'group' ? `You left ${threadTitle(gone)}` : `${threadTitle(gone)} removed from your list`,
        tone: 'ok',
      });
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([directoryQuery.refetch(), threadsQuery.refetch(), refetchMessages(), refetchUnread()]);
    setSyncedAt('just now');
    setRefreshing(false);
  }

  async function handleLeadsRefresh() {
    setLeadsRefreshing(true);
    await leadsQuery.refetch();
    setLeadsRefreshing(false);
  }

  const activeThread = activeId ? threads.find((t) => t.id === activeId) : undefined;

  const composeSheet = (
    <NewChatSheet
      key={composeSession}
      visible={composing}
      people={people}
      busy={createThread.isPending}
      error={composeError}
      canCreateGroup={canCreateGroup}
      onClose={() => setComposing(false)}
      onStartDm={startDm}
      onCreateGroup={createGroup}
    />
  );

  if (tab === 'leads' && activeLead) {
    return (
      <ViewSwap viewKey="thread" order={CHAT_VIEW_ORDER} style={[styles.flex, { backgroundColor: theme.background }]}>
        <LeadThreadView
          // Keyed by conversation so the draft and recording reset moving between leads, same as Team's thread key.
          key={activeLead.convo}
          lead={activeLead}
          messages={leadMessagesQuery.data ?? []}
          loading={leadMessagesQuery.isLoading}
          sending={replyToLead.isPending || sendLeadAttachment.isPending}
          canPost={canEditLeads}
          takeoverBusy={setLeadTakeover.isPending}
          onBack={() => setActiveConvo(null)}
          onSendText={(text) => replyToLead.mutateAsync({ convo: activeLead.convo, text })}
          onSendAttachment={(file) => sendLeadAttachment.mutateAsync({ convo: activeLead.convo, file })}
          onTakeover={(muted) =>
            setLeadTakeover.mutate(
              { convo: activeLead.convo, muted },
              { onError: (err) => toast.show({ message: messageOf(err), tone: 'bad' }) },
            )
          }
        />
      </ViewSwap>
    );
  }

  if (view === 'thread' && activeThread) {
    return (
      <ViewSwap viewKey="thread" order={CHAT_VIEW_ORDER} style={[styles.flex, { backgroundColor: theme.background }]}>
        <ThreadView
          // Keyed by thread so the draft, reply and selection reset when you
          // move between conversations rather than leaking across them.
          key={activeThread.id}
          thread={activeThread}
          messages={messages[activeThread.id] ?? []}
          people={people}
          // The mock's scripted typing indicator has no live counterpart —
          // there is no presence channel — so it stays behind the mock.
          typingId={isSupabaseConfigured || activeThread.missing ? undefined : TYPING_IN[activeThread.id]}
          canPost={canPost}
          canManageGroup={canManageGroup}
          unread={unread[activeThread.id] ?? 0}
          onBack={handleBack}
          onSend={async (text, replyTo, attachment: Attachment | undefined) => {
            try {
              await sendMessage.mutateAsync({ threadId: activeThread.id, text, replyTo, attachment, thread: activeThread });
              return true;
            } catch (err) {
              // The optimistic bubble is rolled back on failure; without this the
              // message just disappears and the send looks like it never happened.
              toast.show({ message: messageOf(err), tone: 'bad' });
              return false;
            }
          }}
          onToggleReaction={(messageId, emoji) => toggleReaction.mutate({ threadId: activeThread.id, messageId, emoji })}
          onDeleteMessages={(ids: MessageId[]) => deleteMessages.mutate({ threadId: activeThread.id, ids })}
          onSetRead={(read) => setThreadRead.mutate({ threadId: activeThread.id, read })}
          onSetFlag={(flag, value) => setThreadFlag.mutate({ threadId: activeThread.id, flag, value })}
          onDeleteThread={() => handleDeleteThread(activeThread.id)}
          onSaveGroup={(name, memberIds) => saveGroup(activeThread.id, name, memberIds)}
          groupSaving={updateGroup.isPending}
          groupError={groupError}
          onReplyPrivately={startDm}
          onCompose={() => {
            handleBack();
            openCompose();
          }}
        />
        {composeSheet}
      </ViewSwap>
    );
  }

  if (tab === 'leads') {
    return (
      <ViewSwap viewKey="list" order={CHAT_VIEW_ORDER} style={[styles.flex, { backgroundColor: theme.background }]}>
        <LeadsListView
          tabStrip={tabStrip}
          leads={leads}
          loading={leadsQuery.isLoading}
          activeConvo={activeConvo}
          refreshing={leadsRefreshing}
          onRefresh={handleLeadsRefresh}
          onOpen={setActiveConvo}
          sort={leadSort}
          onChangeSort={setLeadSort}
        />
      </ViewSwap>
    );
  }

  return (
    <ViewSwap viewKey="list" order={CHAT_VIEW_ORDER} style={[styles.flex, { backgroundColor: theme.background }]}>
      <ThreadListView
        tabStrip={tabStrip}
        threads={ordered}
        lastByThread={lastByThread}
        unread={unread}
        pulledAt={syncedAt}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onOpen={openThread}
        canCompose={canPost}
        onCompose={openCompose}
        onSetRead={(threadId, read) => setThreadRead.mutate({ threadId, read })}
        onSetFlag={(threadId, flag, value) => setThreadFlag.mutate({ threadId, flag, value })}
        onDeleteThread={handleDeleteThread}
      />
      {composeSheet}
    </ViewSwap>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});

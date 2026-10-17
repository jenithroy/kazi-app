import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { notify } from '@/data/notifications/notify';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

import { chatKeys } from './keys';
import * as api from './api';
import { myId, personFor, setChatDirectory } from './identity';
import type { Attachment, GroupRights, Message, MessageId, PersonId, Thread, ThreadId } from './types';

type MessageMap = Record<ThreadId, Message[]>;
type UnreadMap = Record<ThreadId, number>;

/**
 * The staff roster. Every name, avatar and job title in chat resolves through
 * `identity.ts`, which this fills — so it is fetched once and kept fresh
 * rather than being read per screen.
 *
 * It also carries presence, which is the reason for the poll: names and job
 * titles change about once a quarter, but a clock-in changes the dot beside
 * every one of them, and nothing pushes that. Five minutes is well inside the
 * granularity anyone reads a presence dot at.
 */
export function useDirectory() {
  const query = useQuery({
    queryKey: chatKeys.directory(),
    queryFn: api.fetchDirectory,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const people = query.data;
  useEffect(() => {
    if (people) setChatDirectory(people);
  }, [people]);
  return query;
}

/** Whether this person's position may start a group, and reshape one. */
export function useGroupRights() {
  return useQuery<GroupRights>({ queryKey: chatKeys.rights(), queryFn: api.fetchGroupRights, staleTime: 5 * 60_000 });
}

export function useThreads() {
  return useQuery({ queryKey: chatKeys.threads(), queryFn: api.fetchThreads });
}

export function useMessages() {
  return useQuery({ queryKey: chatKeys.messages(), queryFn: api.fetchMessages });
}

export function useUnread() {
  return useQuery({ queryKey: chatKeys.unread(), queryFn: api.fetchUnread });
}

/**
 * Live updates, straight from Postgres.
 *
 * The four `chat_*` tables are in the `supabase_realtime` publication, so any
 * insert anywhere reaches every client. The payload is deliberately ignored:
 * a message row alone cannot say who has read it or how its reactions now
 * stand, and the reads above already assemble exactly that. So a change just
 * invalidates, and React Query refetches the parts that moved.
 *
 * Realtime carries the RLS of the subscriber, so this only ever wakes on
 * threads the person is actually in.
 */
export function useChatRealtime(enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) return;
    const sb = getSupabase();

    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.messages() });
      queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
    };

    const channel = sb
      .channel('chat-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reactions' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_members' }, () => {
        refresh();
        queryClient.invalidateQueries({ queryKey: chatKeys.threads() });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_threads' }, () => {
        queryClient.invalidateQueries({ queryKey: chatKeys.threads() });
      })
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [enabled, queryClient]);
}

/**
 * Every mutation below writes the cache optimistically and rolls back on
 * error: a chat that waits on a round-trip before showing your own tap feels
 * broken even when the round-trip is fast.
 */
function useOptimistic<TVars, TData>(
  key: QueryKey,
  mutationFn: (vars: TVars) => Promise<unknown>,
  apply: (current: TData | undefined, vars: TVars) => TData,
  onSuccess?: (vars: TVars) => void,
  invalidate: QueryKey[] = [],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async (vars: TVars) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TData>(key);
      queryClient.setQueryData<TData>(key, apply(previous, vars));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData<TData>(key, context.previous);
    },
    onSuccess: (_data, vars) => onSuccess?.(vars),
    // The server decides the id, the timestamp and the receipt; a settled
    // mutation re-reads rather than trusting the optimistic stand-in.
    onSettled: () => {
      for (const k of invalidate) queryClient.invalidateQueries({ queryKey: k });
    },
  });
}

export interface SendMessageVars {
  threadId: ThreadId;
  text: string;
  replyTo?: MessageId;
  attachment?: Attachment;
  /** Only used for the notification copy — the thread itself is looked up by id. */
  thread?: Thread;
}

export function useSendMessage() {
  return useOptimistic<SendMessageVars, MessageMap>(
    chatKeys.messages(),
    ({ threadId, text, replyTo, attachment }) => api.sendMessage(threadId, text, replyTo, attachment),
    (current, { threadId, text, replyTo, attachment }) => ({
      ...(current ?? {}),
      [threadId]: [
        ...(current?.[threadId] ?? []),
        {
          id: `pending-${Date.now()}`,
          threadId,
          authorId: myId(),
          text,
          at: Date.now(),
          replyTo,
          attachment,
          reactions: [],
          pending: true,
        },
      ],
    }),
    // Both the "you're in this conversation" notification and @mention
    // detection are server-side now (chat_messages_notify_trg / 0116,
    // chat_mentions_notify_trg / 0120) — they have to be, so a message sent
    // from the ERP web app's own chat client notifies too. Calling notify()
    // here as well would double it up for every kazi-mobile-originated send.
    undefined,
    [chatKeys.messages(), chatKeys.threads()],
  );
}

export interface ReactionVars {
  threadId: ThreadId;
  messageId: MessageId;
  emoji: string;
}

export function useToggleReaction() {
  return useOptimistic<ReactionVars, MessageMap>(
    chatKeys.messages(),
    ({ threadId, messageId, emoji }) => api.toggleReaction(threadId, messageId, emoji),
    (current, { threadId, messageId, emoji }) => {
      const me = myId();
      return {
        ...(current ?? {}),
        [threadId]: (current?.[threadId] ?? []).map((m) => {
          if (m.id !== messageId) return m;
          const existing = m.reactions.find((r) => r.emoji === emoji);
          if (!existing) return { ...m, reactions: [...m.reactions, { emoji, by: [me] }] };
          const by = existing.by.includes(me) ? existing.by.filter((id) => id !== me) : [...existing.by, me];
          return { ...m, reactions: m.reactions.map((r) => (r.emoji === emoji ? { ...r, by } : r)).filter((r) => r.by.length > 0) };
        }),
      };
    },
  );
}

export interface DeleteMessagesVars {
  threadId: ThreadId;
  ids: MessageId[];
}

export function useDeleteMessages() {
  return useOptimistic<DeleteMessagesVars, MessageMap>(
    chatKeys.messages(),
    ({ threadId, ids }) => api.deleteMessages(threadId, ids),
    (current, { threadId, ids }) => {
      const set = new Set(ids);
      return {
        ...(current ?? {}),
        [threadId]: (current?.[threadId] ?? []).map((m) =>
          set.has(m.id) ? { ...m, text: '', deleted: true, attachment: undefined, reactions: [] } : m,
        ),
      };
    },
  );
}

export interface SetReadVars {
  threadId: ThreadId;
  read: boolean;
}

export function useSetThreadRead() {
  return useOptimistic<SetReadVars, UnreadMap>(
    chatKeys.unread(),
    ({ threadId, read }) => api.setThreadRead(threadId, read),
    (current, { threadId, read }) => ({
      ...(current ?? {}),
      [threadId]: read ? 0 : Math.max(1, current?.[threadId] ?? 0),
    }),
    undefined,
    [chatKeys.unread(), chatKeys.messages()],
  );
}

export interface ThreadFlagVars {
  threadId: ThreadId;
  flag: 'pinned' | 'muted';
  value: boolean;
}

export function useSetThreadFlag() {
  return useOptimistic<ThreadFlagVars, Thread[]>(
    chatKeys.threads(),
    ({ threadId, flag, value }) => api.setThreadFlag(threadId, flag, value),
    (current, { threadId, flag, value }) => (current ?? []).map((t) => (t.id === threadId ? { ...t, [flag]: value } : t)),
  );
}

export function useDeleteThread() {
  return useOptimistic<ThreadId, Thread[]>(
    chatKeys.threads(),
    (threadId) => api.deleteThread(threadId),
    (current, threadId) => (current ?? []).filter((t) => t.id !== threadId),
    undefined,
    [chatKeys.threads(), chatKeys.messages(), chatKeys.unread()],
  );
}

export type CreateThreadVars = { kind: 'dm'; personId: PersonId } | { kind: 'group'; name: string; memberIds: PersonId[] };

/** Not optimistic — the caller needs the server-assigned id to navigate into the new thread. */
export function useCreateThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: CreateThreadVars) =>
      vars.kind === 'dm' ? api.createDm(vars.personId) : api.createGroup(vars.name, vars.memberIds),
    onSuccess: (thread, vars) => {
      queryClient.setQueryData<Thread[]>(chatKeys.threads(), (current) => {
        const rest = (current ?? []).filter((t) => t.id !== thread.id);
        return [...rest, thread];
      });
      queryClient.setQueryData<MessageMap>(chatKeys.messages(), (current) => ({ [thread.id]: [], ...(current ?? {}) }));
      queryClient.setQueryData<UnreadMap>(chatKeys.unread(), (current) => ({ ...(current ?? {}), [thread.id]: 0 }));
      if (vars.kind === 'group') {
        notify({
          eventType: 'message.received',
          section: 'messenger',
          payload: { participants: vars.memberIds.map((id) => personFor(id).name), label: `${vars.name} created` },
        });
      }
    },
    // Re-opening an existing dm brings back its history, which the placeholder
    // above cannot know about.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.threads() });
      queryClient.invalidateQueries({ queryKey: chatKeys.messages() });
    },
  });
}

export interface UpdateGroupVars {
  threadId: ThreadId;
  name: string;
  memberIds: PersonId[];
}

/**
 * Rename a group and set who is in it. Not optimistic: removals are a
 * server-side soft-leave the database may legitimately refuse, and a members
 * list that briefly shows the wrong people is worse than one that waits.
 */
export function useUpdateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, name, memberIds }: UpdateGroupVars) => api.updateGroup(threadId, name, memberIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.threads() });
    },
  });
}

import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { HeaderAccount } from '@/components/ui/header-account';
import { Icon } from '@/components/ui/icon';
import { PermissionNotice } from '@/components/ui/permission-notice';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useTheme } from '@/theme/theme-provider';
import * as haptics from '@/lib/haptics';
import { useScrollTop } from '@/lib/use-scroll-top';
import { fontFamily } from '@/theme';
import type { Message, Thread, ThreadId } from '@/data/chat/types';
import { previewOf, threadMemberNames, threadRole, threadTitle, useTimeTick } from '@/data/chat/utils';

import { ThreadActionsSheet } from './thread-actions-sheet';
import { ThreadRow } from './thread-row';

export interface ThreadListViewProps {
  /** Already sorted — pinned first, then most recent. */
  threads: Thread[];
  lastByThread: Record<ThreadId, Message | undefined>;
  unread: Record<ThreadId, number>;
  pulledAt: string;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (id: ThreadId) => void;
  /** Hidden compose FAB + a read-only banner when the profile can't post here. */
  canCompose?: boolean;
  /** Opens the parent's `NewChatSheet` — shared with the deleted-thread screen's own compose button. */
  onCompose: () => void;
  onSetRead: (threadId: ThreadId, read: boolean) => void;
  onSetFlag: (threadId: ThreadId, flag: 'pinned' | 'muted', value: boolean) => void;
  onDeleteThread: (threadId: ThreadId) => void;
  /** The Team/Leads switcher, rendered right under the header — absent for anyone without Leads access. */
  tabStrip?: React.ReactNode;
}

/** Native `RefreshControl` stands in for the design's own tap-to-refresh dashed slot — same deliberate simplification already used for Dashboard's pull-to-refresh. */
export function ThreadListView({
  threads,
  lastByThread,
  unread,
  pulledAt,
  refreshing,
  onRefresh,
  onOpen,
  canCompose = true,
  onCompose,
  onSetRead,
  onSetFlag,
  onDeleteThread,
  tabStrip,
}: ThreadListViewProps) {
  const theme = useTheme();
  const scrollRef = useScrollTop();
  // One timer for the whole list rather than one per row.
  useTimeTick();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [optionsFor, setOptionsFor] = useState<ThreadId | null>(null);

  const optionsThread = threads.find((t) => t.id === optionsFor) ?? null;

  const unreadThreads = threads.filter((t) => (unread[t.id] ?? 0) > 0);
  const totalUnread = unreadThreads.reduce((n, t) => n + (unread[t.id] ?? 0), 0);
  const unreadSummary = totalUnread > 0 ? `${totalUnread} unread · ${threads.length} conversations` : `${threads.length} conversations · all read`;

  const visibleThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const haystack = [
        threadTitle(t),
        threadRole(t),
        threadMemberNames(t),
        previewOf(t, lastByThread[t.id]),
        t.ref ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [threads, lastByThread, query]);

  const toggleSearch = () => {
    setSearching((on) => {
      if (on) setQuery('');
      return !on;
    });
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader
        title="Chat"
        subtitle={unreadSummary}
        showBack={false}
        rightSlot={
          // `leading` rather than a wrapper of our own, so search sits in the
          // same 40px row as the bell and avatar every other header uses.
          <HeaderAccount
            leading={
              <Pressable
                onPress={toggleSearch}
                accessibilityRole="button"
                accessibilityLabel={searching ? 'Close search' : 'Search conversations'}
                style={[
                  styles.searchButton,
                  { backgroundColor: searching ? theme.accent : theme.surface, borderColor: searching ? theme.accent : theme.border },
                ]}
              >
                <Icon name={searching ? 'x' : 'search'} size={17} color={searching ? theme.accentText : theme.textSecondary} />
              </Pressable>
            }
          />
        }
      />

      {tabStrip}

      {searching ? (
        <View style={[styles.searchBarWrap, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
          <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Icon name="search" size={16} color={theme.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder="Search people, groups or messages"
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.textPrimary, fontFamily: fontFamily.regular }]}
              returnKeyType="search"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Icon name="x" size={14} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
      >
        <PermissionNotice section="messenger" message="View only — you can’t post in these threads." />

        {totalUnread > 0 ? (
          <Pressable
            onPress={() => unreadThreads.forEach((t) => onSetRead(t.id, true))}
            style={[styles.markAll, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Icon name="check-circle" size={14} color={theme.accentDeep} />
            <Text style={[styles.markAllLabel, { color: theme.accentDeep }]}>
              Mark all {unreadThreads.length === 1 ? 'as read' : `${unreadThreads.length} conversations read`}
            </Text>
          </Pressable>
        ) : null}

        {visibleThreads.map((t, i) => (
          <ThreadRow
            key={t.id}
            thread={t}
            last={lastByThread[t.id]}
            unread={unread[t.id] ?? 0}
            index={i}
            onPress={() => onOpen(t.id)}
            onLongPress={() => {
              haptics.pressed();
              setOptionsFor(t.id);
            }}
          />
        ))}

        {visibleThreads.length === 0 ? (
          <Text style={[styles.emptyNote, { color: theme.textSecondary }]}>
            {query.trim() ? `No conversations match “${query.trim()}”` : 'No conversations yet'}
          </Text>
        ) : null}

        <Text style={[styles.syncNote, { color: theme.textSecondary }]}>Hold a conversation for options · synced {pulledAt}</Text>
      </ScrollView>

      {canCompose ? (
        <Pressable
          onPress={onCompose}
          style={[styles.fab, { backgroundColor: theme.accent, boxShadow: theme.shadows.floating }]}
        >
          <Icon name="edit" size={21} color={theme.accentText} />
        </Pressable>
      ) : null}

      <ThreadActionsSheet
        thread={optionsThread}
        unread={optionsThread ? (unread[optionsThread.id] ?? 0) : 0}
        onClose={() => setOptionsFor(null)}
        onOpen={() => {
          if (optionsThread) onOpen(optionsThread.id);
          setOptionsFor(null);
        }}
        onSetRead={(read) => {
          if (optionsThread) onSetRead(optionsThread.id, read);
          setOptionsFor(null);
        }}
        onTogglePin={() => {
          if (optionsThread) onSetFlag(optionsThread.id, 'pinned', !optionsThread.pinned);
          setOptionsFor(null);
        }}
        onToggleMute={() => {
          if (optionsThread) onSetFlag(optionsThread.id, 'muted', !optionsThread.muted);
          setOptionsFor(null);
        }}
        onDelete={() => {
          if (optionsThread) onDeleteThread(optionsThread.id);
          setOptionsFor(null);
        }}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBarWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  markAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 38,
    borderRadius: 13,
    borderWidth: 1,
  },
  markAllLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 12.5,
  },
  emptyNote: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 24,
  },
  content: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 100,
    gap: 10,
  },
  syncNote: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.12 * 10,
    textTransform: 'uppercase',
    textAlign: 'center',
    paddingTop: 8,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

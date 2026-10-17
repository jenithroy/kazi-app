import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { HeaderAccount } from '@/components/ui/header-account';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { useScrollTop } from '@/lib/use-scroll-top';
import { byRecency, byValueThenRecency, leadPreview } from '@/data/leads/format';
import type { Lead, LeadConvoId } from '@/data/leads/types';

import { LeadRow } from './lead-row';

export type LeadSort = 'value' | 'recency';

export interface LeadsListViewProps {
  tabStrip?: ReactNode;
  leads: Lead[];
  loading: boolean;
  activeConvo: LeadConvoId | null;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (convo: LeadConvoId) => void;
  /** Lifted to `Chat` — this view unmounts while a conversation is open, so its own state would reset on every back navigation. */
  sort: LeadSort;
  onChangeSort: (sort: LeadSort) => void;
}

const SORT_STYLE: Record<LeadSort, { icon: 'zap' | 'clock'; label: string; next: LeadSort; hint: string }> = {
  value: { icon: 'zap', label: 'Value', next: 'recency', hint: 'Sorted by value — switch to most recent' },
  recency: { icon: 'clock', label: 'Recent', next: 'value', hint: 'Sorted by most recent — switch to value' },
};

/** Same shell as the Team list, minus compose/pin/leave — a lead is created by the customer messaging in, never by staff. */
export function LeadsListView({
  tabStrip,
  leads,
  loading,
  activeConvo,
  refreshing,
  onRefresh,
  onOpen,
  sort,
  onChangeSort,
}: LeadsListViewProps) {
  const theme = useTheme();
  const scrollRef = useScrollTop();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const sorted = useMemo(
    () => [...leads].sort(sort === 'value' ? byValueThenRecency : byRecency),
    [leads, sort],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((lead) => [lead.name ?? '', leadPreview(lead)].join(' ').toLowerCase().includes(q));
  }, [sorted, query]);

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
        subtitle={loading ? 'Loading…' : `${leads.length} lead${leads.length === 1 ? '' : 's'}`}
        showBack={false}
        rightSlot={
          // `leading` rather than a wrapper of our own, so search sits in the
          // same 40px row as the bell and avatar every other header uses —
          // Team's thread list does the same, so switching tabs only moves
          // the subtitle underneath, not this row.
          <HeaderAccount
            leading={
              <Pressable
                onPress={toggleSearch}
                accessibilityRole="button"
                accessibilityLabel={searching ? 'Close search' : 'Search leads'}
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

      {tabStrip ? (
        <View style={styles.tabRow}>
          {tabStrip}
          <Pressable
            onPress={() => onChangeSort(SORT_STYLE[sort].next)}
            accessibilityRole="button"
            accessibilityLabel={SORT_STYLE[sort].hint}
            style={[styles.sortButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Icon name={SORT_STYLE[sort].icon} size={12} color={theme.textPrimary} />
            <Text style={[styles.sortLabel, { color: theme.textPrimary }]}>{SORT_STYLE[sort].label}</Text>
          </Pressable>
        </View>
      ) : null}

      {searching ? (
        <View style={[styles.searchBarWrap, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
          <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Icon name="search" size={16} color={theme.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder="Search leads"
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
        {loading && leads.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.textSecondary} />
          </View>
        ) : visible.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="cpu" size={22} color={theme.textSecondary} />
            <Text style={[styles.emptyNote, { color: theme.textSecondary }]}>
              {query.trim()
                ? `No conversations match “${query.trim()}”`
                : "No conversations yet — they'll appear here as customers DM your Instagram account."}
            </Text>
          </View>
        ) : (
          visible.map((lead, i) => (
            <LeadRow key={lead.convo} lead={lead} active={lead.convo === activeConvo} index={i} onPress={() => onOpen(lead.convo)} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingRight: 20,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  sortLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
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
  content: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 100,
    gap: 10,
  },
  loading: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  empty: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyNote: {
    fontSize: 13,
    textAlign: 'center',
  },
});

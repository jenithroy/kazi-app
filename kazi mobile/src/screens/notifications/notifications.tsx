import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useNotifications } from '@/data/notifications/context';
import { openNotificationLink } from '@/data/notifications/open-notification';
import type { NotificationRecord } from '@/data/notifications/types';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { useCalendarPreference } from '@/lib/calendar-preference';
import { dateText, isoDay } from '@/lib/date-display';
import { useScrollTop } from '@/lib/use-scroll-top';

import { FilterChips, type NotifFilter } from './filter-chips';
import { NotificationRow } from './notification-row';

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yest)) return 'Yesterday';
  return dateText(isoDay(iso));
}

export function Notifications() {
  const theme = useTheme();
  // `dayLabel` reads the calendar preference, so subscribe to it.
  useCalendarPreference();
  const { records, loading, error, unreadCount, markAllRead, markReadById } = useNotifications();
  const [filter, setFilter] = useState<NotifFilter>('all');
  const scrollRef = useScrollTop();
  const [refreshing, setRefreshing] = useState(false);

  const visible = useMemo(() => {
    switch (filter) {
      case 'unread':
        return records.filter((r) => !r.read);
      case 'for-you':
        return records.filter((r) => r.type === 'action' || r.type === 'mention');
      case 'mentions':
        return records.filter((r) => r.type === 'mention');
      default:
        return records;
    }
  }, [records, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, NotificationRecord[]>();
    for (const r of visible) {
      const key = dayLabel(r.createdAtISO);
      const bucket = map.get(key);
      if (bucket) bucket.push(r);
      else map.set(key, [r]);
    }
    return [...map.entries()];
  }, [visible]);

  const onPressRow = (r: NotificationRecord) => {
    if (!r.read) markReadById(r.id);
    openNotificationLink(r.deepLink);
  };

  const onRefresh = () => {
    // The snapshot listener keeps the list live; this is just the pull affordance.
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        rightSlot={
          unreadCount > 0 ? (
            <Pressable onPress={markAllRead} hitSlop={8}>
              <Text style={[styles.markAll, { color: theme.accentDeep }]}>Mark all read</Text>
            </Pressable>
          ) : null
        }
      />
      <FilterChips active={filter} onPick={setFilter} unreadCount={unreadCount} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        >
          {!isSupabaseConfigured ? (
            <View style={[styles.banner, { backgroundColor: theme.warningWash, borderColor: theme.border }]}>
              <Icon name="wifi-off" size={14} color={theme.warningWashText} />
              <Text style={[styles.bannerText, { color: theme.warningWashText }]}>
                Notifications need the live backend — nothing to show yet.
              </Text>
            </View>
          ) : error ? (
            <View style={[styles.banner, { backgroundColor: theme.warningWash, borderColor: theme.border }]}>
              <Icon name="wifi-off" size={14} color={theme.warningWashText} />
              <Text style={[styles.bannerText, { color: theme.warningWashText }]}>
                Couldn’t reach notifications. Showing what’s cached.
              </Text>
            </View>
          ) : null}

          {groups.length === 0 ? (
            <EmptyState
              icon="bell"
              title="Nothing here"
              message={
                filter === 'all'
                  ? 'You’ll be notified when something relevant to your work changes.'
                  : 'No notifications match this filter.'
              }
            />
          ) : (
            groups.map(([label, items]) => (
              <View key={label} style={styles.group}>
                <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>{label}</Text>
                {items.map((r) => (
                  <NotificationRow key={r.id} record={r} onPress={onPressRow} />
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40, gap: 18 },
  markAll: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  group: { gap: 8 },
  groupLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.12 * 10,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bannerText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 12 * 1.4 },
});

import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FilterChips, type FilterChip } from '@/components/ui/filter-chips';
import { SearchField } from '@/components/ui/search-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { ActionFilterKey, FeedDayGroup } from '@/data/usage/types';

import { ActivityFeedItem } from './activity-feed-item';

const ACTION_FILTERS: FilterChip<ActionFilterKey>[] = [
  { id: 'all', label: 'Everything' },
  { id: 'view', label: 'Page opens' },
  { id: 'write', label: 'Changes' },
  { id: 'sign_in', label: 'Sign-ins' },
];

export interface ActivityFeedCardProps {
  totalEntries: number;
  truncated: boolean;
  action: ActionFilterKey;
  onActionChange: (a: ActionFilterKey) => void;
  query: string;
  onQueryChange: (q: string) => void;
  days: FeedDayGroup[];
  remaining: number;
  onShowMore: () => void;
}

export function ActivityFeedCard({ totalEntries, truncated, action, onActionChange, query, onQueryChange, days, remaining, onShowMore }: ActivityFeedCardProps) {
  const theme = useTheme();

  return (
    <Card elevation="raised" style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Activity</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {totalEntries.toLocaleString()} entries{truncated ? ' (most recent 600 events)' : ''}
        </Text>
      </View>

      <SearchField value={query} onChange={onQueryChange} placeholder="Search activity…" />
      <FilterChips chips={ACTION_FILTERS} active={action} onChange={onActionChange} />

      {days.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>Nothing matches those filters.</Text>
      ) : (
        <View>
          {days.map((group, gi) => (
            <View key={group.key} style={gi > 0 ? styles.dayGap : undefined}>
              <Text style={[styles.dayLabel, { color: theme.textSecondary }]}>{group.label}</Text>
              {group.items.map((entry, i) => (
                <View
                  key={entry.id}
                  style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border } : undefined}
                >
                  <ActivityFeedItem entry={entry} />
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {remaining > 0 ? (
        <Button label={`Show more (${remaining.toLocaleString()} left)`} variant="secondary" onPress={onShowMore} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, gap: 14 },
  headerRow: { gap: 2 },
  title: { fontFamily: fontFamily.semibold, fontSize: 15 },
  subtitle: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  empty: { fontSize: 13, paddingVertical: 8 },
  dayGap: { marginTop: 14 },
  dayLabel: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.1 * 10, textTransform: 'uppercase', marginBottom: 4 },
});

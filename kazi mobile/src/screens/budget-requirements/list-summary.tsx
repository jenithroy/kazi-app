import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { RequirementsFilter } from '@/data/budget-requirements/types';

export interface ListSummaryProps {
  approvedTotal: string;
  pendingTotal: string;
  capLeft: string;
  capPct: number;
  pendPct: number;
  capLine: string;
  capOf: string;
  isAdmin: boolean;
  queueTitle: string;
  queueSub: string;
  onShowPending: () => void;
  filters: { id: RequirementsFilter; label: string; count: number }[];
  activeFilter: RequirementsFilter;
  onFilterChange: (f: RequirementsFilter) => void;
}

export function ListSummary({
  approvedTotal,
  pendingTotal,
  capLeft,
  capPct,
  pendPct,
  capLine,
  capOf,
  isAdmin,
  queueTitle,
  queueSub,
  onShowPending,
  filters,
  activeFilter,
  onFilterChange,
}: ListSummaryProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <Card elevation="hero" style={styles.capCard}>
        <View style={styles.capRow}>
          <View style={styles.gap5}>
            <Text style={[styles.eyebrow, { color: theme.onHero.textMuted }]}>Approved</Text>
            <Text style={[styles.capValue, tabularNums, { color: theme.onHero.text }]}>{approvedTotal}</Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              <Text style={[styles.statValue, tabularNums, { color: theme.onHero.warningWashText }]}>{pendingTotal}</Text>
              <Text style={[styles.statLabel, { color: theme.onHero.textMuted }]}>Pending</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statValue, tabularNums, { color: theme.onHero.accent }]}>{capLeft}</Text>
              <Text style={[styles.statLabel, { color: theme.onHero.textMuted }]}>Left</Text>
            </View>
          </View>
        </View>
        <View style={styles.gap7}>
          <View style={[styles.capTrack, { backgroundColor: theme.onHero.track }]}>
            <View style={{ width: `${capPct}%`, backgroundColor: theme.onHero.accent }} />
            <View style={{ width: `${pendPct}%`, backgroundColor: theme.onHero.warning }} />
          </View>
          <View style={styles.capLabelsRow}>
            <Text style={[styles.capLabel, tabularNums, { color: theme.onHero.textMuted }]}>{capLine}</Text>
            <Text style={[styles.capLabel, tabularNums, { color: theme.onHero.textMuted }]}>{capOf}</Text>
          </View>
        </View>
      </Card>

      {isAdmin ? (
        <Pressable onPress={onShowPending} style={[styles.queueBanner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.queueDot, { backgroundColor: theme.warning }]} />
          <View style={styles.queueTextWrap}>
            <Text style={[styles.queueTitle, { color: theme.textPrimary }]} numberOfLines={1}>
              {queueTitle}
            </Text>
            <Text style={[styles.queueSub, { color: theme.textSecondary }]} numberOfLines={1}>
              {queueSub}
            </Text>
          </View>
          <Icon name="chevron-right" size={16} color={theme.textSecondary} />
        </Pressable>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {filters.map((f) => {
          const on = activeFilter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => onFilterChange(f.id)}
              style={[styles.chip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
            >
              <Text style={[styles.chipLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{f.label}</Text>
              <Text style={[styles.chipCount, tabularNums, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{f.count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingHorizontal: 20, paddingBottom: 12 },
  segmented: { flexDirection: 'row', padding: 3, borderRadius: 12, borderWidth: 1, gap: 3, alignSelf: 'flex-start' },
  segmentButton: { height: 34, paddingHorizontal: 14, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  capCard: { padding: 17, gap: 14 },
  capRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 },
  gap5: { gap: 5 },
  gap7: { gap: 7 },
  eyebrow: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase' },
  capValue: { fontFamily: fontFamily.semibold, fontSize: 28, letterSpacing: -0.025 * 28, lineHeight: 28 },
  statsRow: { flexDirection: 'row', gap: 16 },
  statCell: { alignItems: 'flex-end', gap: 3 },
  statValue: { fontSize: 16, fontWeight: '600', lineHeight: 16 },
  statLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.1 * 9.5, textTransform: 'uppercase' },
  capTrack: { height: 7, borderRadius: 99, overflow: 'hidden', flexDirection: 'row' },
  capLabelsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  capLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.08 * 9.5, textTransform: 'uppercase' },
  queueBanner: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 16, borderWidth: 1, padding: 12 },
  queueDot: { width: 8, height: 8, borderRadius: 99, flexShrink: 0 },
  queueTextWrap: { flex: 1, gap: 2, minWidth: 0 },
  queueTitle: { fontSize: 13.5, fontWeight: '600' },
  queueSub: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  chipsRow: { gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1 },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  chipCount: { fontFamily: fontFamily.mono, fontSize: 10.5, opacity: 0.85 },
});

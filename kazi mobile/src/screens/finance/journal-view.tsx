import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { DualDate } from '@/components/ui/dual-date';
import { EmptyState } from '@/components/ui/empty-state';
import { Money } from '@/components/ui/money';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { JournalEntry } from '@/data/finance/types';

export interface JournalViewProps {
  entries: JournalEntry[];
  canEdit: boolean;
  onOpen: (entry: JournalEntry) => void;
}

export function JournalView({ entries, canEdit, onOpen }: JournalViewProps) {
  const theme = useTheme();
  const total = entries.reduce((n, e) => n + e.amountNPR, 0);

  return (
    <View style={styles.wrap}>
      <View style={styles.totalRow}>
        <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </Text>
        <Money npr={total} compact inline size={12} />
      </View>

      {entries.length === 0 ? (
        <EmptyState icon="book" title="No journal entries" message="Post a double-entry to see it here." />
      ) : (
        entries.map((e, i) => (
          <Animated.View key={e.id} entering={FadeInUp.delay(Math.min(i, 6) * 25).duration(200)}>
            <Pressable
              onPress={canEdit ? () => onOpen(e) : undefined}
              style={[styles.row, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}
            >
              <View style={styles.headRow}>
                <Text style={[styles.desc, { color: theme.textPrimary }]} numberOfLines={1}>
                  {e.description}
                </Text>
                <Money npr={e.amountNPR} size={14} align="right" style={styles.amount} />
              </View>
              <View style={styles.legs}>
                <View style={[styles.legChip, { backgroundColor: theme.accentWash }]}>
                  <Text style={[styles.legTag, { color: theme.accentWashText }]}>DR</Text>
                  <Text style={[styles.legName, { color: theme.accentWashText }]} numberOfLines={1}>
                    {e.debitAccount}
                  </Text>
                </View>
                <View style={[styles.legChip, { backgroundColor: theme.draftWash }]}>
                  <Text style={[styles.legTag, { color: theme.textSecondary }]}>CR</Text>
                  <Text style={[styles.legName, { color: theme.textSecondary }]} numberOfLines={1}>
                    {e.creditAccount}
                  </Text>
                </View>
              </View>
              <View style={styles.metaRow}>
                <DualDate iso={e.date} inline size={10} bsStyle="numeric" secondary={false} />
                <Text style={[styles.meta, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
                  {e.reference}
                  {e.partyName ? ` · ${e.partyName}` : ''} · {e.createdBy}
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 },
  totalLabel: { fontFamily: fontFamily.mono, fontSize: 10.5, letterSpacing: 0.12 * 10.5, textTransform: 'uppercase' },
  row: { borderRadius: 16, padding: 14, gap: 9 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  desc: { flex: 1, fontSize: 14, fontWeight: '600' },
  amount: { flexShrink: 0 },
  legs: { flexDirection: 'row', gap: 7 },
  legChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 9, borderRadius: 8, minWidth: 0 },
  legTag: { fontFamily: fontFamily.mono, fontSize: 9.5, fontWeight: '700' },
  legName: { flex: 1, fontSize: 11.5, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { flex: 1, fontFamily: fontFamily.mono, fontSize: 10 },
});

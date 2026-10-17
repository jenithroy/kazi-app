import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Money } from '@/components/ui/money';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { Process } from '@/data/inventory/types';

export interface ProcessesViewProps {
  processes: Process[];
  query: string;
  onOpen: (process: Process) => void;
}

/**
 * The process catalogue, dearest step first.
 *
 * Each record carries a long hand-written spec — work-centre capacity, routing
 * times, BOM scrap factors — so the row shows the rate and a two-line preview,
 * and the sheet carries the whole thing. The rate is the headline because the
 * list doubles as a price list.
 */
export function ProcessesView({ processes, query, onOpen }: ProcessesViewProps) {
  const theme = useTheme();

  if (processes.length === 0) {
    return (
      <EmptyState
        icon="search"
        title={query ? 'Nothing matches' : 'No processes yet'}
        message={query ? 'Try a shorter search.' : 'Add a production step and its rate with the button below.'}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      {processes.map((p, index) => (
        <Animated.View key={p.id} entering={FadeInUp.delay(Math.min(index, 8) * 25).duration(200)}>
          <Card>
            <Pressable onPress={() => onOpen(p)} style={styles.body}>
              <View style={styles.head}>
                <View style={styles.headText}>
                  <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={2}>
                    {p.name}
                  </Text>
                  <View style={styles.metaRow}>
                    {p.category ? (
                      <View style={[styles.chip, { backgroundColor: theme.draftWash }]}>
                        <Text style={[styles.chipText, { color: theme.draftWashText }]}>{p.category}</Text>
                      </View>
                    ) : null}
                    {p.leadTimeDays > 0 ? (
                      <Text style={[styles.lead, tabularNums, { color: theme.textSecondary }]}>
                        {p.leadTimeDays}d lead
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.rate}>
                  <Money npr={p.costPerUnit} size={16} align="right" />
                  <Text style={[styles.rateUnit, { color: theme.textSecondary }]}>per unit</Text>
                </View>
              </View>

              {p.description ? (
                <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={2}>
                  {p.description}
                </Text>
              ) : null}
            </Pressable>
          </Card>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  body: { padding: 15, gap: 9 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headText: { flex: 1, gap: 6, minWidth: 0 },
  name: { fontFamily: fontFamily.semibold, fontSize: 15.5, letterSpacing: -0.01 * 15.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  chip: { height: 22, paddingHorizontal: 9, borderRadius: 999, justifyContent: 'center' },
  chipText: { fontSize: 10.5, fontWeight: '600', textTransform: 'capitalize' },
  lead: { fontFamily: fontFamily.mono, fontSize: 11 },
  rate: { alignItems: 'flex-end', gap: 2 },
  rateUnit: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.08 * 9.5, textTransform: 'uppercase' },
  preview: { fontSize: 12.5, lineHeight: 12.5 * 1.45 },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { lakh } from '@/data/finance/utils';
import type { FiscalYear } from '@/data/finance/types';

export interface YearsViewProps {
  years: FiscalYear[];
  onOpen: (year: FiscalYear) => void;
}

export function YearsView({ years, onOpen }: YearsViewProps) {
  const theme = useTheme();

  return (
    <View style={styles.group}>
      {years.map((y) => (
        <Pressable
          key={y.id}
          onPress={() => onOpen(y)}
          style={[
            styles.card,
            { backgroundColor: theme.surface, boxShadow: theme.shadows.card, borderColor: y.current ? (theme.scheme === 'light' ? '#BFE4D2' : theme.accent) : theme.border },
          ]}
        >
          <View style={styles.topRow}>
            <View style={styles.textWrap}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: theme.textPrimary }]}>{y.label}</Text>
                <View style={[styles.statusPill, { backgroundColor: y.current ? theme.accentWash : theme.draftWash }]}>
                  <Text style={[styles.statusPillText, { color: y.current ? theme.accentWashText : theme.textSecondary, fontWeight: y.current ? '600' : '500' }]}>
                    {y.current ? 'Open' : 'Closed'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.range, tabularNums, { color: theme.textSecondary }]}>
                {y.range} · {y.records.toLocaleString()} records
              </Text>
            </View>
            <Icon name="chevron-right" size={16} color={theme.textSecondary} />
          </View>
          <View style={styles.statsRow}>
            <Stat label="Money in" value={lakh(y.moneyIn)} />
            <Stat label="Money out" value={lakh(y.moneyOut)} />
            <Stat label="Net" value={`${y.net < 0 ? '−' : ''}${lakh(Math.abs(y.net))}`} tone={y.net < 0 ? theme.dangerWashText : undefined} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.statWrap}>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, tabularNums, { color: tone ?? theme.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 12 },
  card: { borderRadius: 20, padding: 16, gap: 13, borderWidth: 1 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  textWrap: { flex: 1, gap: 4, minWidth: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 17, fontWeight: '600', letterSpacing: -0.015 * 17 },
  statusPill: { height: 22, paddingHorizontal: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  statusPillText: { fontSize: 11 },
  range: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  statsRow: { flexDirection: 'row', gap: 18 },
  statWrap: { gap: 3 },
  statLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.11 * 9.5, textTransform: 'uppercase' },
  statValue: { fontSize: 15, fontWeight: '600' },
});

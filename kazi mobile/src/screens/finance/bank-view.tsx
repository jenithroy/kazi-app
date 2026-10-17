import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Card } from '@/components/ui/card';
import { DualDate } from '@/components/ui/dual-date';
import { EmptyState } from '@/components/ui/empty-state';
import { Money } from '@/components/ui/money';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { BankTransaction } from '@/data/finance/types';

export interface BankViewProps {
  transactions: BankTransaction[];
  canEdit: boolean;
  onDelete: (tx: BankTransaction) => void;
}

export function BankView({ transactions, canEdit, onDelete }: BankViewProps) {
  const theme = useTheme();

  const totalIn = transactions.filter((t) => t.direction === 'Credit').reduce((n, t) => n + t.amountNPR, 0);
  const totalOut = transactions.filter((t) => t.direction === 'Debit').reduce((n, t) => n + t.amountNPR, 0);
  const rows = [...transactions].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <View style={styles.wrap}>
      <Card elevation="hero" style={styles.strip}>
        <View style={styles.stripCell}>
          <Money npr={totalIn} compact hero size={16} primaryStyle={{ color: theme.onHero.accent }} />
          <Text style={[styles.stripLabel, { color: theme.onHero.textMuted }]}>In</Text>
        </View>
        <View style={styles.stripCell}>
          <Money npr={totalOut} compact hero size={16} primaryStyle={{ color: theme.onHero.dangerWashText }} />
          <Text style={[styles.stripLabel, { color: theme.onHero.textMuted }]}>Out</Text>
        </View>
        <View style={styles.stripCell}>
          <Money npr={totalIn - totalOut} compact hero size={16} />
          <Text style={[styles.stripLabel, { color: theme.onHero.textMuted }]}>Net</Text>
        </View>
      </Card>

      {rows.length === 0 ? (
        <EmptyState icon="credit-card" title="No bank transactions" message="Log one manually, or wait for the bank feed." />
      ) : (
        rows.map((t, i) => {
          const inbound = t.direction === 'Credit';
          return (
            <Animated.View key={t.id} entering={FadeInUp.delay(Math.min(i, 6) * 25).duration(200)}>
              <Pressable
                onLongPress={canEdit ? () => onDelete(t) : undefined}
                style={[styles.row, { backgroundColor: theme.surface, boxShadow: theme.shadows.card, borderLeftColor: inbound ? theme.accent : theme.danger }]}
              >
                <View style={styles.textWrap}>
                  <Text style={[styles.desc, { color: theme.textPrimary }]} numberOfLines={1}>
                    {t.description}
                  </Text>
                  <Text style={[styles.meta, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
                    {t.bankAccount} · {t.category}
                  </Text>
                  <View style={styles.metaRow}>
                    <DualDate iso={t.date} inline size={10} bsStyle="numeric" secondary={false} />
                    <Text style={[styles.ref, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
                      {t.reference}
                    </Text>
                  </View>
                </View>
                <View style={styles.right}>
                  <Text style={[styles.sign, { color: inbound ? theme.accentWashText : theme.dangerWashText }]}>{inbound ? '+' : '−'}</Text>
                  <Money npr={t.amountNPR} size={14} align="right" />
                </View>
              </Pressable>
            </Animated.View>
          );
        })
      )}

      {canEdit && rows.length > 0 ? (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>Long-press a transaction to delete</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  strip: { flexDirection: 'row', padding: 15, gap: 12 },
  stripCell: { flex: 1, alignItems: 'center', gap: 4 },
  stripLabel: { fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.11 * 9, textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: 12, borderRadius: 16, padding: 13, borderLeftWidth: 4 },
  textWrap: { flex: 1, gap: 3, minWidth: 0 },
  desc: { fontSize: 14, fontWeight: '600' },
  meta: { fontFamily: fontFamily.mono, fontSize: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ref: { flex: 1, fontFamily: fontFamily.mono, fontSize: 9.5 },
  right: { flexDirection: 'row', alignItems: 'flex-start', gap: 3, flexShrink: 0 },
  sign: { fontSize: 14, fontWeight: '700' },
  hint: { fontSize: 11, textAlign: 'center', paddingTop: 2 },
});

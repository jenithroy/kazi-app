import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { CLIENTS } from '@/data/billing/mock';
import type { OpenChallan } from '@/data/billing/types';
import { n0, short } from '@/data/billing/utils';

export interface ChallansSheetProps {
  visible: boolean;
  challans: OpenChallan[];
  onClose: () => void;
  onRaise: (challan: OpenChallan) => void;
}

export function ChallansSheet({ visible, challans, onClose, onRaise }: ChallansSheetProps) {
  const theme = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Delivered, not invoiced" maxHeight={620}>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Goods out · awaiting an invoice</Text>

      {challans.length === 0 ? (
        <Card elevation="raised" style={styles.emptyCard}>
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Everything is invoiced</Text>
          <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>All challans have a matching invoice.</Text>
        </Card>
      ) : (
        challans.map((k) => {
          const clientName = k.clientName?.trim() || CLIENTS[k.client]?.name || '—';
          return (
            <Card key={k.id} elevation="raised" style={styles.card}>
              <View style={styles.topRow}>
                <View style={styles.textWrap}>
                  <Text style={[styles.client, { color: theme.textPrimary }]}>{clientName}</Text>
                  <Text style={[styles.meta, tabularNums, { color: theme.textSecondary }]}>
                    {k.no} · {k.date} · {n0(k.pcs)} pcs · {k.so}
                  </Text>
                </View>
                <Text style={[styles.value, tabularNums, { color: theme.textPrimary }]}>{short(k.cur, k.pcs * k.rate)}</Text>
              </View>
              <Button label="Raise invoice" variant="secondary" onPress={() => onRaise(k)} fullWidth />
            </Card>
          );
        })
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase', marginTop: -12 },
  emptyCard: { padding: 26, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '600' },
  emptyHint: { fontSize: 13, textAlign: 'center' },
  card: { padding: 15, gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  textWrap: { flex: 1, gap: 3, minWidth: 0 },
  client: { fontSize: 15, fontWeight: '600', lineHeight: 15 * 1.25 },
  meta: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  value: { fontSize: 14, fontWeight: '600', flexShrink: 0 },
});

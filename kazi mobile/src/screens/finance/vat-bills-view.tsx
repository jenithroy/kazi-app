import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { DualDate } from '@/components/ui/dual-date';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { VatBill } from '@/data/finance/types';

export interface VatBillsViewProps {
  bills: VatBill[];
  canEdit: boolean;
  focusExpenseId?: string | null;
  onOpen: (bill: VatBill) => void;
  onDelete: (bill: VatBill) => void;
  onUpload: () => void;
}

export function VatBillsView({ bills, canEdit, focusExpenseId, onOpen, onDelete, onUpload }: VatBillsViewProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.count, { color: theme.textSecondary }]}>
          {bills.length} {bills.length === 1 ? 'bill' : 'bills'} on file
        </Text>
        {canEdit ? (
          <Pressable onPress={onUpload} style={[styles.uploadButton, { backgroundColor: theme.accent }]}>
            <Icon name="upload" size={14} color={theme.accentText} />
            <Text style={[styles.uploadLabel, { color: theme.accentText }]}>Upload</Text>
          </Pressable>
        ) : null}
      </View>

      {bills.length === 0 ? (
        <EmptyState icon="file-text" title="No VAT bills yet" message="Attach a bill scan from an expense, or upload one here." />
      ) : (
        bills.map((b, i) => {
          const focused = b.expenseId === focusExpenseId;
          return (
            <Animated.View key={b.id} entering={FadeInUp.delay(Math.min(i, 6) * 25).duration(200)}>
              <Pressable
                onPress={() => onOpen(b)}
                onLongPress={canEdit ? () => onDelete(b) : undefined}
                style={[
                  styles.row,
                  { backgroundColor: theme.surface, boxShadow: theme.shadows.card, borderColor: focused ? theme.accent : 'transparent', borderWidth: focused ? 1.5 : 0 },
                ]}
              >
                <View style={[styles.fileIcon, { backgroundColor: theme.draftWash }]}>
                  <Icon name={b.kind === 'pdf' ? 'file-text' : 'image'} size={16} color={theme.textSecondary} />
                </View>
                <View style={styles.textWrap}>
                  <Text style={[styles.item, { color: theme.textPrimary }]} numberOfLines={1}>
                    {b.item}
                  </Text>
                  <Text style={[styles.file, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
                    {b.fileName} · {b.expenseId.toUpperCase()}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={[styles.uploadedBy, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
                      {b.uploadedBy}
                    </Text>
                    <DualDate iso={b.date} inline size={10} bsStyle="numeric" secondary={false} />
                  </View>
                </View>
                <Icon name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
            </Animated.View>
          );
        })
      )}

      {canEdit && bills.length > 0 ? (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>Long-press a bill to delete</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  count: { fontFamily: fontFamily.mono, fontSize: 10.5, letterSpacing: 0.12 * 10.5, textTransform: 'uppercase' },
  uploadButton: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 32, paddingHorizontal: 13, borderRadius: 999 },
  uploadLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 13 },
  fileIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  textWrap: { flex: 1, gap: 3, minWidth: 0 },
  item: { fontSize: 14, fontWeight: '600' },
  file: { fontFamily: fontFamily.mono, fontSize: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadedBy: { fontFamily: fontFamily.mono, fontSize: 10, flexShrink: 1 },
  hint: { fontSize: 11, textAlign: 'center', paddingTop: 2 },
});

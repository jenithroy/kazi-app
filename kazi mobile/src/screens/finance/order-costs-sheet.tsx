import { StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii, tabularNums } from '@/theme';
import type { Order } from '@/data/sales/types';

export interface OrderCostsDraft {
  material: string;
  labour: string;
  overhead: string;
  shipping: string;
}

export interface OrderCostsSheetProps {
  visible: boolean;
  order: Order | null;
  /** A saved cost record already exists for this order (enables "Clear costs"). */
  hasRecord: boolean;
  draft: OrderCostsDraft;
  canEdit: boolean;
  /** Auto labour rate NPR/unit, shown as a hint on the labour field when no record exists yet. */
  labourRate: number | null;
  onChange: (patch: Partial<OrderCostsDraft>) => void;
  onSave: () => void;
  onClear?: () => void;
  onClose: () => void;
}

const FIELDS: { key: keyof OrderCostsDraft; label: string; placeholder: string }[] = [
  { key: 'material', label: 'Material', placeholder: 'Fabric, trims, thread…' },
  { key: 'labour', label: 'Labour', placeholder: 'Cutting, sewing, finishing…' },
  { key: 'overhead', label: 'Overhead', placeholder: 'Factory, utilities, depreciation…' },
  { key: 'shipping', label: 'Shipping', placeholder: 'Freight, packaging, customs…' },
];

const toNum = (s: string) => parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;

export function OrderCostsSheet({
  visible,
  order,
  hasRecord,
  draft,
  canEdit,
  labourRate,
  onChange,
  onSave,
  onClear,
  onClose,
}: OrderCostsSheetProps) {
  const theme = useTheme();

  const revenue = order?.value ?? 0;
  const material = toNum(draft.material);
  const labour = toNum(draft.labour);
  const overhead = toNum(draft.overhead);
  const shipping = toNum(draft.shipping);
  const totalCost = material + labour + overhead + shipping;
  const profit = revenue - totalCost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : null;
  const profitPositive = profit >= 0;

  const summaryRows: { label: string; value: number; strong?: boolean }[] = [
    { label: 'Revenue', value: revenue, strong: true },
    { label: 'Material', value: material },
    { label: 'Labour', value: labour },
    { label: 'Overhead', value: overhead },
    { label: 'Shipping', value: shipping },
    { label: 'Total cost', value: totalCost, strong: true },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Order cost entry" maxHeight={760}>
      {order ? (
        <Text style={[styles.sub, tabularNums, { color: theme.textSecondary }]}>
          {order.ref} · {order.customer} · {order.qty.toLocaleString('en-IN')} pcs
        </Text>
      ) : null}

      <View style={[styles.summary, { backgroundColor: theme.draftWash, borderColor: theme.border }]}>
        {summaryRows.map((r) => (
          <View key={r.label} style={styles.summaryRow}>
            <Text style={[r.strong ? styles.summaryLabelStrong : styles.summaryLabel, { color: theme.textSecondary }]}>{r.label}</Text>
            <Money npr={r.value} size={r.strong ? 13 : 12} secondary={false} align="right" />
          </View>
        ))}
        <View style={[styles.summaryRow, styles.profitRow, { borderTopColor: theme.border }]}>
          <Text style={[styles.summaryLabelStrong, { color: profitPositive ? theme.accentWashText : theme.dangerWashText }]}>
            {profitPositive ? 'Profit' : 'Loss'}
            {margin != null ? `  ·  ${margin.toFixed(1)}%` : ''}
          </Text>
          <Money
            npr={Math.abs(profit)}
            size={14}
            secondary={false}
            align="right"
            primaryStyle={{ color: profitPositive ? theme.accentWashText : theme.dangerWashText }}
          />
        </View>
      </View>

      {FIELDS.map((f) => (
        <View key={f.key} style={styles.group}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>{f.label} · NPR</Text>
          <View style={[styles.amountRow, { borderColor: toNum(draft[f.key]) > 0 ? theme.accent : theme.border, backgroundColor: theme.surface }]}>
            <Text style={[styles.rupeeSign, { color: theme.textSecondary }]}>रु</Text>
            <TextInput
              value={draft[f.key]}
              onChangeText={(v) => onChange({ [f.key]: v })}
              placeholder={f.key === 'labour' && !hasRecord && labourRate ? `${Math.round(labourRate).toLocaleString('en-IN')} /unit auto` : '0'}
              keyboardType="numeric"
              editable={canEdit}
              placeholderTextColor={theme.textSecondary}
              style={[styles.amountInput, { color: theme.textPrimary }]}
            />
          </View>
        </View>
      ))}

      {canEdit ? (
        <Button label="Save costs" onPress={onSave} />
      ) : (
        <Text style={[styles.readonly, { color: theme.textSecondary }]}>View-only — you don’t have edit access to Finance.</Text>
      )}
      {canEdit && hasRecord && onClear ? <Button label="Clear costs" variant="dangerOutline" onPress={onClear} /> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sub: { fontFamily: fontFamily.mono, fontSize: 11, marginBottom: 4 },
  summary: { borderRadius: radii.md, borderWidth: 1, padding: 12, gap: 6, marginBottom: 4 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 12.5 },
  summaryLabelStrong: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  profitRow: { borderTopWidth: 1, paddingTop: 8, marginTop: 2 },
  group: { gap: 7 },
  label: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
  rupeeSign: { fontFamily: fontFamily.mono, fontSize: 14 },
  amountInput: { flex: 1, fontSize: 20, fontWeight: '600', letterSpacing: -0.02 * 20, padding: 0 },
  readonly: { fontSize: 12, textAlign: 'center', paddingVertical: 4 },
});

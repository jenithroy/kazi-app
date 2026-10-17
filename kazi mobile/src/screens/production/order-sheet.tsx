import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { money } from '@/lib/money';
import { FABRIC_TYPES, STAGES } from '@/data/sales/mock';
import type { OrderDraft, OrderStatus, StageId } from '@/data/sales/types';

export interface OrderSheetProps {
  visible: boolean;
  mode: 'new' | 'edit' | null;
  draft: OrderDraft | null;
  onClose: () => void;
  onChange: (patch: Partial<OrderDraft>) => void;
  onSave: () => void;
}

const toNum = (s: string) => parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;

const STATUSES: { id: OrderStatus; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'on-hold', label: 'On Hold' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

/**
 * Field-for-field the reference web app's order form (`Production.jsx` →
 * `emptyOrderForm`), minus the two things a phone has no business doing:
 * issuing an invoice inline, and picking a region.
 */
export function OrderSheet({ visible, mode, draft, onClose, onChange, onSave }: OrderSheetProps) {
  const theme = useTheme();
  if (!draft) return null;

  const canSave = draft.customer.trim().length > 1 && draft.product.trim().length > 0 && toNum(draft.qty) > 0;

  const qty = toNum(draft.qty);
  const price = toNum(draft.pricePerPc);
  const fabricCost = toNum(draft.fabricCostPerPc);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={mode === 'new' ? 'New order' : `Edit ${draft.ref}`}>
      <View style={styles.pairRow}>
        <View style={styles.pairCell}>
          <TextField label="Order date" value={draft.orderDate} onChangeText={(v) => onChange({ orderDate: v })} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
        </View>
        <View style={styles.pairCell}>
          <TextField label="Delivery date" value={draft.deliveryDate} onChangeText={(v) => onChange({ deliveryDate: v })} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
        </View>
      </View>

      <TextField label="Customer name" value={draft.customer} onChangeText={(v) => onChange({ customer: v })} placeholder="e.g. RetailCorp UK" autoCapitalize="words" />
      <TextField label="Style / item name" value={draft.product} onChangeText={(v) => onChange({ product: v })} placeholder="e.g. Men's Hoodie" autoCapitalize="sentences" />

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Fabric type</Text>
        <View style={styles.chipWrap}>
          {FABRIC_TYPES.map((f) => {
            const on = draft.fabricType === f;
            return (
              <Pressable
                key={f}
                onPress={() => onChange({ fabricType: f })}
                style={[styles.chip, { backgroundColor: on ? theme.accentWash : theme.surface, borderColor: on ? theme.accentWashText : theme.border }]}
              >
                <Text style={[styles.chipLabel, { color: on ? theme.accentWashText : theme.textPrimary }]}>{f}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.pairRow}>
        <View style={styles.pairCell}>
          <TextField label="Colorway" value={draft.colorway} onChangeText={(v) => onChange({ colorway: v })} placeholder="e.g. Black, Navy" autoCapitalize="words" />
        </View>
        <View style={styles.pairCell}>
          <TextField label="Sample" value={draft.sampleName} onChangeText={(v) => onChange({ sampleName: v })} placeholder="Optional" autoCapitalize="words" />
        </View>
      </View>

      <View style={styles.pairRow}>
        <View style={styles.pairCell}>
          <TextField label="Quantity (pcs)" value={draft.qty} onChangeText={(v) => onChange({ qty: v })} placeholder="0" keyboardType="number-pad" />
        </View>
        <View style={styles.pairCell}>
          <TextField label="Price / pc (NPR)" value={draft.pricePerPc} onChangeText={(v) => onChange({ pricePerPc: v })} placeholder="0" keyboardType="number-pad" />
        </View>
      </View>

      <View style={styles.pairRow}>
        <View style={styles.pairCell}>
          <TextField label="Fabric used (g / pc)" value={draft.fabricGramsUsed} onChangeText={(v) => onChange({ fabricGramsUsed: v })} placeholder="e.g. 900" keyboardType="number-pad" />
        </View>
        <View style={styles.pairCell}>
          <TextField label="Fabric cost / pc" value={draft.fabricCostPerPc} onChangeText={(v) => onChange({ fabricCostPerPc: v })} placeholder="0" keyboardType="number-pad" />
        </View>
      </View>

      {qty > 0 && price > 0 ? (
        <View style={[styles.totalBox, { backgroundColor: theme.draftWash, borderColor: theme.border }]}>
          <Text style={[styles.totalLine, tabularNums, { color: theme.textPrimary }]}>
            Order value: {money(qty * price)}
          </Text>
          <Text style={[styles.totalMeta, tabularNums, { color: theme.textSecondary }]}>
            {qty.toLocaleString('en-US')} pcs × {money(price)}
          </Text>
          {fabricCost > 0 ? (
            <Text style={[styles.totalMeta, tabularNums, { color: theme.textSecondary }]}>
              Material cost: {money(qty * fabricCost)}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.pairRow}>
        <View style={styles.pairCell}>
          <TextField label="Invoice / challan ref" value={draft.invoiceRef} onChangeText={(v) => onChange({ invoiceRef: v })} placeholder="INV001 / CH-001" autoCapitalize="characters" />
        </View>
        <View style={styles.pairCell}>
          <TextField label="Assigned to" value={draft.assignedTo} onChangeText={(v) => onChange({ assignedTo: v })} placeholder="Owner" autoCapitalize="words" />
        </View>
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{mode === 'new' ? 'Initial stage' : 'Stage'}</Text>
        <View style={styles.chipWrap}>
          {STAGES.map((s) => {
            const on = draft.stage === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => onChange({ stage: s.id as StageId })}
                style={[styles.chip, { backgroundColor: on ? s.bg : theme.surface, borderColor: on ? s.dot : theme.border }]}
              >
                <View style={[styles.chipDot, { backgroundColor: s.dot }]} />
                <Text style={[styles.chipLabel, { color: on ? s.fg : theme.textPrimary }]}>{s.short}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Status</Text>
        <View style={styles.chipWrap}>
          {STATUSES.map((st) => {
            const on = draft.status === st.id;
            return (
              <Pressable
                key={st.id}
                onPress={() => onChange({ status: st.id })}
                style={[styles.chip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
              >
                <Text style={[styles.chipLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{st.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.footer}>
        <Button label={mode === 'new' ? 'Create order' : 'Save changes'} onPress={onSave} disabled={!canSave} fullWidth style={styles.save} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  pairRow: { flexDirection: 'row', gap: 10 },
  pairCell: { flex: 1 },
  group: { gap: 9 },
  label: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.14 * 10, textTransform: 'uppercase' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1 },
  chipDot: { width: 6, height: 6, borderRadius: 99 },
  chipLabel: { fontFamily: fontFamily.medium, fontSize: 12.5 },
  totalBox: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 3 },
  totalLine: { fontFamily: fontFamily.semibold, fontSize: 14 },
  totalMeta: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  footer: { paddingTop: 4 },
  save: { height: 54 },
});

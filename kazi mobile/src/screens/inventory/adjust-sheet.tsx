import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii, tabularNums } from '@/theme';
import type { StockItem, StockMovementDraft, StockMoveKind } from '@/data/inventory/types';

export interface AdjustSheetProps {
  visible: boolean;
  item: StockItem | null;
  draft: StockMovementDraft;
  onClose: () => void;
  onChange: (patch: Partial<StockMovementDraft>) => void;
  onSubmit: () => void;
}

const KINDS: { id: StockMoveKind; label: string; hint: string }[] = [
  { id: 'in', label: 'Stock in', hint: 'GRN / return to store — adds to on-hand' },
  { id: 'out', label: 'Stock out', hint: 'Issue to cutting / sampling / wastage' },
  { id: 'adjust', label: 'Adjust to', hint: 'Set the on-hand count after a cycle count' },
];

const toNum = (s: string) => parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;

export function AdjustSheet({ visible, item, draft, onClose, onChange, onSubmit }: AdjustSheetProps) {
  const theme = useTheme();
  const qty = toNum(draft.qty);
  const current = item?.qty ?? 0;
  const projected =
    draft.kind === 'in' ? current + qty : draft.kind === 'out' ? Math.max(0, current - qty) : qty;
  const ready = qty > 0 || (draft.kind === 'adjust' && draft.qty.trim() !== '');

  return (
    <BottomSheet visible={visible} onClose={onClose} title={item ? `Move stock · ${item.name}` : 'Move stock'} maxHeight={620}>
      {item ? (
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          On hand {current.toLocaleString()} {item.unit} · reorder at {item.threshold.toLocaleString()}
        </Text>
      ) : null}

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Movement</Text>
        {KINDS.map((k) => {
          const on = draft.kind === k.id;
          return (
            <Pressable
              key={k.id}
              onPress={() => onChange({ kind: k.id })}
              style={[styles.kindRow, { borderColor: on ? theme.accent : theme.border, backgroundColor: on ? theme.accentWash : theme.surface }]}
            >
              <View style={[styles.radio, { borderColor: on ? theme.accent : theme.border }]}>
                {on ? <View style={[styles.radioDot, { backgroundColor: theme.accent }]} /> : null}
              </View>
              <View style={styles.kindTextWrap}>
                <Text style={[styles.kindLabel, { color: theme.textPrimary }]}>{k.label}</Text>
                <Text style={[styles.kindHint, { color: theme.textSecondary }]}>{k.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          {draft.kind === 'adjust' ? 'New on-hand count' : 'Quantity'} {item ? `· ${item.unit}` : ''}
        </Text>
        <View style={[styles.amountRow, { borderColor: qty > 0 ? theme.accent : theme.border, backgroundColor: theme.surface }]}>
          <TextInput
            value={draft.qty}
            onChangeText={(v) => onChange({ qty: v })}
            placeholder="0"
            keyboardType="numeric"
            placeholderTextColor={theme.textSecondary}
            style={[styles.amountInput, { color: theme.textPrimary }]}
          />
        </View>
        <Text style={[styles.projected, tabularNums, { color: theme.textSecondary }]}>
          On hand after: {projected.toLocaleString()} {item?.unit ?? ''}
        </Text>
      </View>

      <TextField label="Reason" value={draft.reason} onChangeText={(v) => onChange({ reason: v })} placeholder="Issued to cutting…" compact />
      <TextField label="Reference" value={draft.ref} onChangeText={(v) => onChange({ ref: v })} placeholder="BATCH-120 · PO-2419" compact />

      <Pressable onPress={onSubmit} disabled={!ready} style={[styles.saveButton, { backgroundColor: ready ? theme.accent : theme.draftWash }]}>
        <Text style={[styles.saveLabel, { color: ready ? theme.accentText : theme.draftWashText }]}>
          {ready ? 'Post movement' : 'Enter a quantity'}
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase', marginTop: -12 },
  group: { gap: 8 },
  label: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase' },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 13, borderWidth: 1, padding: 13 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  kindTextWrap: { flex: 1, gap: 2, minWidth: 0 },
  kindLabel: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  kindHint: { fontSize: 11, lineHeight: 11 * 1.4 },
  amountRow: { flexDirection: 'row', alignItems: 'center', height: 60, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
  amountInput: { flex: 1, fontSize: 26, fontWeight: '600', letterSpacing: -0.02 * 26, padding: 0 },
  projected: { fontFamily: fontFamily.mono, fontSize: 11 },
  saveButton: { height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveLabel: { fontSize: 15, fontWeight: '600' },
});

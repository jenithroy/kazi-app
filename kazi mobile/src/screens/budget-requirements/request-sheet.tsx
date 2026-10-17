import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { TextField } from '@/components/ui/text-field';
import { useCurrency } from '@/lib/currency-context';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii, tabularNums } from '@/theme';
import { BUDGET_CATEGORIES, BUDGET_CATEGORY } from '@/data/budget-requirements/mock';
import { gbp, priorityBarColors, short } from '@/data/budget-requirements/utils';
import type { BudgetCategory, BudgetRequestDraft, Priority } from '@/data/budget-requirements/types';

export interface RequestSheetProps {
  visible: boolean;
  draft: BudgetRequestDraft;
  who: string;
  onClose: () => void;
  onChange: (patch: Partial<BudgetRequestDraft>) => void;
  onSubmit: () => void;
}

const PRIORITIES: Priority[] = ['Low', 'Medium', 'High'];

export function RequestSheet({ visible, draft, who, onClose, onChange, onSubmit }: RequestSheetProps) {
  const theme = useTheme();
  // Live rate, so this echo agrees with what the request will read as once filed.
  const { rate } = useCurrency();
  const amountGBP = parseFloat(draft.amountGBP.replace(/[^0-9.]/g, '')) || 0;
  const amountNPR = Math.round(amountGBP * rate);
  const justificationReady = draft.justification.trim().length >= 12;
  const ready = amountGBP > 0 && justificationReady;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="New budget request" maxHeight={760}>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{who}</Text>

      <TextField label="Title" value={draft.title} onChangeText={(v) => onChange({ title: v })} placeholder="e.g. Reconditioned bartack (spare)" />

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Category</Text>
        <View style={styles.categoryGrid}>
          {BUDGET_CATEGORIES.map((c: BudgetCategory) => {
            const on = draft.category === c;
            return (
              <Pressable
                key={c}
                onPress={() => onChange({ category: c })}
                style={[styles.categoryButton, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
              >
                <View style={[styles.categoryMark, { backgroundColor: on ? theme.accent : BUDGET_CATEGORY[c].mark }]} />
                <Text style={[styles.categoryLabel, { color: on ? theme.selectedText : theme.textPrimary }]} numberOfLines={1}>
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Amount · GBP</Text>
        <View style={[styles.amountRow, { borderColor: amountGBP > 0 ? theme.accent : theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.sign, { color: theme.textSecondary }]}>£</Text>
          <TextInput
            value={draft.amountGBP}
            onChangeText={(v) => onChange({ amountGBP: v })}
            placeholder="0"
            keyboardType="numeric"
            placeholderTextColor={theme.textSecondary}
            style={[styles.amountInput, { color: theme.textPrimary }]}
          />
        </View>
        <Text style={[styles.convert, tabularNums, { color: theme.textSecondary }]}>
          ≈ {short(amountNPR)} · auto-converted at {rate.toLocaleString('en-US', { maximumFractionDigits: 2 })}
        </Text>
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Urgency</Text>
        <View style={styles.priorityRow}>
          {PRIORITIES.map((p) => {
            const on = draft.urgency === p;
            const bars = priorityBarColors(p, on ? 'rgba(233,241,236,0.3)' : theme.border);
            return (
              <Pressable
                key={p}
                onPress={() => onChange({ urgency: p })}
                style={[styles.priorityButton, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
              >
                <View style={styles.bars}>
                  <View style={[styles.bar, { height: 6, backgroundColor: bars[0] }]} />
                  <View style={[styles.bar, { height: 9, backgroundColor: bars[1] }]} />
                  <View style={[styles.bar, { height: 12, backgroundColor: bars[2] }]} />
                </View>
                <Text style={[styles.priorityLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{p}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Justification · required</Text>
        <TextInput
          value={draft.justification}
          onChangeText={(v) => onChange({ justification: v.slice(0, 400) })}
          placeholder="Why is this spend needed, and what happens if it waits?"
          placeholderTextColor={theme.textSecondary}
          multiline
          style={[styles.textarea, { backgroundColor: theme.surface, borderColor: justificationReady ? theme.border : theme.dangerWashText, color: theme.textPrimary }]}
        />
        <Text style={[styles.noteCount, tabularNums, { color: theme.textSecondary }]}>
          {justificationReady ? `${draft.justification.trim().length} / 400` : 'Add at least a sentence'}
        </Text>
      </View>

      <Pressable onPress={onSubmit} disabled={!ready} style={[styles.saveButton, { backgroundColor: ready ? theme.accent : theme.draftWash }]}>
        <Text style={[styles.saveLabel, tabularNums, { color: ready ? theme.accentText : theme.draftWashText }]}>
          {amountGBP <= 0 ? 'Add an amount' : !justificationReady ? 'Add a justification' : `Submit ${gbp(amountGBP)}`}
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase', marginTop: -12 },
  group: { gap: 8 },
  label: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryButton: { width: '47%', flexGrow: 1, height: 46, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  categoryMark: { width: 7, height: 7, borderRadius: 2, flexShrink: 0 },
  categoryLabel: { fontFamily: fontFamily.semibold, fontSize: 13.5, flexShrink: 1 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 64, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
  sign: { fontFamily: fontFamily.mono, fontSize: 15 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '600', letterSpacing: -0.02 * 28, padding: 0 },
  convert: { fontFamily: fontFamily.mono, fontSize: 11 },
  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityButton: { flex: 1, height: 58, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 3, borderRadius: 1 },
  priorityLabel: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  textarea: { minHeight: 96, paddingHorizontal: 15, paddingVertical: 13, borderRadius: 14, borderWidth: 1, fontSize: 14.5, lineHeight: 14.5 * 1.5, textAlignVertical: 'top' },
  noteCount: { fontFamily: fontFamily.mono, fontSize: 10, alignSelf: 'flex-end' },
  saveButton: { height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  saveLabel: { fontSize: 16, fontWeight: '600' },
});

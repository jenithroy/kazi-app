import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { toGBP } from '@/lib/currency';
import { useCurrency } from '@/lib/currency-context';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii, tabularNums } from '@/theme';
import { CATEGORY } from '@/data/budget-requirements/mock';
import { money, priorityBarColors } from '@/data/budget-requirements/utils';
import type { ByOption, Category, Priority, RequirementDraft } from '@/data/budget-requirements/types';

export interface AddSheetProps {
  visible: boolean;
  draft: RequirementDraft;
  who: string;
  onClose: () => void;
  onChange: (patch: Partial<RequirementDraft>) => void;
  onSubmit: () => void;
}

const CATEGORIES = Object.keys(CATEGORY) as Category[];
const PRIORITIES: Priority[] = ['Low', 'Medium', 'High'];
const BY_OPTIONS: ByOption[] = ['This week', 'This month', 'Next month'];

const PRIORITY_HINT: Record<Priority, string> = {
  High: 'High goes to the top of the admin queue today — use it when a line stops.',
  Medium: 'Medium is reviewed in the daily 5pm pass.',
  Low: 'Low is batched into the monthly budget review.',
};

export function AddSheet({ visible, draft, who, onClose, onChange, onSubmit }: AddSheetProps) {
  const theme = useTheme();
  // The live GBP rate, so the two amount fields agree with what the rest of the
  // app is converting at rather than with a constant from 2024.
  const { rate, live } = useCurrency();
  const amountValue = parseInt(draft.amount.replace(/[^0-9]/g, ''), 10) || 0;
  const amountReady = amountValue > 0;

  // Dual NPR ↔ GBP cost entry (item 17) — type either side, the other converts at the live rate.
  const handleAmount = (side: 'npr' | 'gbp', raw: string) => {
    if (side === 'npr') {
      const npr = parseInt(raw.replace(/[^0-9]/g, ''), 10) || 0;
      onChange({ amount: raw, amountGBP: npr > 0 ? String(Math.round(toGBP(npr, rate))) : '', autoSide: npr > 0 ? 'gbp' : null });
    } else {
      const g = parseFloat(raw.replace(/[^0-9.]/g, '')) || 0;
      onChange({ amountGBP: raw, amount: g > 0 ? String(Math.round(g * rate)) : '', autoSide: g > 0 ? 'npr' : null });
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="New requirement">
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{who}</Text>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Category</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((c) => {
            const on = draft.cat === c;
            return (
              <Pressable
                key={c}
                onPress={() => onChange({ cat: c })}
                style={[styles.categoryButton, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
              >
                <View style={[styles.categoryMark, { backgroundColor: on ? theme.accent : CATEGORY[c].mark }]} />
                <Text style={[styles.categoryLabel, { color: on ? theme.selectedText : theme.textPrimary }]} numberOfLines={1}>
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <TextField label="What is needed" value={draft.item} onChangeText={(v) => onChange({ item: v })} placeholder="e.g. Bartack machine head" />

      <TextField label="Quantity" value={draft.quantity} onChangeText={(v) => onChange({ quantity: v })} placeholder="e.g. 50 units" />

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Estimated cost</Text>
        <View style={[styles.amountRow, { borderColor: amountReady ? theme.accent : theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.rupeeSign, { color: theme.textSecondary }]}>रु</Text>
          <TextInput
            value={draft.amount}
            onChangeText={(v) => handleAmount('npr', v)}
            placeholder="0"
            keyboardType="numeric"
            placeholderTextColor={theme.textSecondary}
            style={[styles.amountInput, { color: theme.textPrimary }]}
          />
          {draft.autoSide === 'npr' ? <Text style={[styles.autoTag, { color: theme.textSecondary, borderColor: theme.border }]}>auto</Text> : null}
        </View>
        <View style={[styles.gbpRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.rupeeSign, { color: theme.textSecondary }]}>£</Text>
          <TextInput
            value={draft.amountGBP}
            onChangeText={(v) => handleAmount('gbp', v)}
            placeholder="0"
            keyboardType="numeric"
            placeholderTextColor={theme.textSecondary}
            style={[styles.gbpInput, { color: theme.textPrimary }]}
          />
          {draft.autoSide === 'gbp' ? <Text style={[styles.autoTag, { color: theme.textSecondary, borderColor: theme.border }]}>auto</Text> : null}
        </View>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>Enter either — the other converts at £1 = रु {rate.toLocaleString('en-US', { maximumFractionDigits: 2 })}{live ? '' : ' (offline rate)'}.</Text>
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Priority</Text>
        <View style={styles.priorityRow}>
          {PRIORITIES.map((p) => {
            const on = draft.priority === p;
            const bars = priorityBarColors(p, on ? 'rgba(233,241,236,0.3)' : theme.border);
            return (
              <Pressable
                key={p}
                onPress={() => onChange({ priority: p })}
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
        <Text style={[styles.hint, { color: theme.textSecondary }]}>{PRIORITY_HINT[draft.priority]}</Text>
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Needed by</Text>
        <View style={styles.byRow}>
          {BY_OPTIONS.map((d) => {
            const on = draft.by === d;
            return (
              <Pressable
                key={d}
                onPress={() => onChange({ by: d })}
                style={[styles.byButton, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
              >
                <Text style={[styles.byLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{d}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Additional context</Text>
        <TextInput
          value={draft.note}
          onChangeText={(v) => onChange({ note: v.slice(0, 400) })}
          placeholder="What breaks if this waits? Quotes, vendor, line affected."
          placeholderTextColor={theme.textSecondary}
          multiline
          style={[styles.textarea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
        />
        <Text style={[styles.noteCount, tabularNums, { color: theme.textSecondary }]}>{draft.note.length} / 400</Text>
      </View>

      <Pressable
        onPress={() => onChange({ quote: !draft.quote })}
        style={[styles.quoteZone, { backgroundColor: draft.quote ? theme.accentWash : theme.surfaceRaised, borderColor: draft.quote ? theme.accent : theme.border }]}
      >
        <View style={[styles.quoteIcon, { backgroundColor: theme.accentWash }]}>
          <Icon name="upload" size={18} color={theme.accentWashText} />
        </View>
        <View style={styles.quoteTextWrap}>
          <Text style={[styles.quoteTitle, { color: theme.textPrimary }]}>{draft.quote ? 'quote-0185.jpg attached' : 'Attach a quotation'}</Text>
          <Text style={[styles.quoteHint, { color: theme.textSecondary }]}>
            {draft.quote ? '820 KB · tap to remove' : 'Optional, but approvals are 2 days faster with one'}
          </Text>
        </View>
      </Pressable>

      <View style={styles.footer}>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryText, { color: theme.textSecondary }]} numberOfLines={1}>
            {draft.cat} · {draft.priority.toLowerCase()} priority
          </Text>
          <Text style={[styles.summaryBy, tabularNums, { color: theme.textSecondary }]}>{draft.by}</Text>
        </View>
        <Pressable onPress={onSubmit} disabled={!amountReady} style={[styles.saveButton, { backgroundColor: amountReady ? theme.accent : theme.draftWash }]}>
          <Text style={[styles.saveLabel, tabularNums, { color: amountReady ? theme.accentText : theme.draftWashText }]}>
            {amountReady ? `Submit ${money(amountValue)}` : 'Add an amount'}
          </Text>
        </Pressable>
      </View>
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
  rupeeSign: { fontFamily: fontFamily.mono, fontSize: 15 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '600', letterSpacing: -0.02 * 28, padding: 0 },
  gbpRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
  gbpInput: { flex: 1, fontSize: 18, fontWeight: '600', letterSpacing: -0.02 * 18, padding: 0 },
  autoTag: { fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.12 * 9, textTransform: 'uppercase', borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityButton: { flex: 1, height: 58, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 3, borderRadius: 1 },
  priorityLabel: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  hint: { fontSize: 12, lineHeight: 12 * 1.45 },
  byRow: { flexDirection: 'row', gap: 8 },
  byButton: { flex: 1, height: 46, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  byLabel: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  textarea: { minHeight: 96, paddingHorizontal: 15, paddingVertical: 13, borderRadius: 14, borderWidth: 1, fontSize: 14.5, lineHeight: 14.5 * 1.5, textAlignVertical: 'top' },
  noteCount: { fontFamily: fontFamily.mono, fontSize: 10, alignSelf: 'flex-end' },
  quoteZone: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', padding: 18 },
  quoteIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quoteTextWrap: { flex: 1, gap: 3, minWidth: 0 },
  quoteTitle: { fontSize: 14, fontWeight: '600' },
  quoteHint: { fontSize: 12, lineHeight: 12 * 1.45 },
  footer: { gap: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  summaryText: { flex: 1, fontSize: 13.5 },
  summaryBy: { fontSize: 11, flexShrink: 0 },
  saveButton: { height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  saveLabel: { fontSize: 16, fontWeight: '600' },
});

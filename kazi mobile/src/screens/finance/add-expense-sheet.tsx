import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { DateField } from '@/components/ui/date-field';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii, tabularNums } from '@/theme';
import { CATEGORIES, expenseCategory } from '@/data/finance/mock';
import { fmt } from '@/data/finance/utils';
import type { ExpenseCategoryId, ExpenseSource } from '@/data/finance/types';

export interface ExpenseDraft {
  amount: string;
  categoryId: ExpenseCategoryId;
  note: string;
  source: ExpenseSource;
  /** AD ISO date the expense is posted against. */
  date: string;
  /** A VAT bill scan is attached (mock: a boolean flag). */
  hasReceipt: boolean;
}

export interface AddExpenseSheetProps {
  visible: boolean;
  draft: ExpenseDraft;
  onClose: () => void;
  onChange: (patch: Partial<ExpenseDraft>) => void;
  onSave: () => void;
}

const SOURCES: ExpenseSource[] = ['Cash', 'Bank', 'Payable'];

export function AddExpenseSheet({ visible, draft, onClose, onChange, onSave }: AddExpenseSheetProps) {
  const theme = useTheme();
  const amountValue = parseInt(draft.amount.replace(/[^0-9]/g, ''), 10) || 0;
  const amountReady = amountValue > 0;
  const category = expenseCategory(draft.categoryId);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add expense">
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Posts to FY 2082/83 · Bhadra</Text>

      <DateField label="Date" value={draft.date} onChange={(iso) => onChange({ date: iso })} pickerTitle="Expense date" />

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Amount · NPR</Text>
        <View style={[styles.amountRow, { borderColor: amountReady ? theme.accent : theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.rupeeSign, { color: theme.textSecondary }]}>रु</Text>
          <TextInput
            value={draft.amount}
            onChangeText={(v) => onChange({ amount: v })}
            placeholder="0"
            keyboardType="numeric"
            placeholderTextColor={theme.textSecondary}
            style={[styles.amountInput, { color: theme.textPrimary }]}
          />
        </View>
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Category</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((c) => {
            const on = draft.categoryId === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => onChange({ categoryId: c.id })}
                style={[styles.categoryButton, { backgroundColor: on ? c.bg : theme.surface, borderColor: on ? c.fg : theme.border }]}
              >
                <Text style={[styles.categoryTag, { color: on ? c.fg : theme.textSecondary }]}>{c.tag}</Text>
                <Text style={[styles.categoryLabel, { color: on ? c.fg : theme.textPrimary }]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <TextField label="Description" value={draft.note} onChangeText={(v) => onChange({ note: v })} placeholder="e.g. Generator diesel · 200 L" />

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Paid from</Text>
        <View style={styles.sourceRow}>
          {SOURCES.map((s) => {
            const on = draft.source === s;
            return (
              <Pressable
                key={s}
                onPress={() => onChange({ source: s })}
                style={[styles.sourceButton, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
              >
                <Text style={[styles.sourceLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{s}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        onPress={() => onChange({ hasReceipt: !draft.hasReceipt })}
        style={[styles.receiptRow, { backgroundColor: draft.hasReceipt ? theme.accentWash : theme.surfaceRaised, borderColor: draft.hasReceipt ? theme.accent : theme.border }]}
      >
        <View style={[styles.receiptIcon, { backgroundColor: theme.accentWash }]}>
          <Icon name="upload" size={18} color={theme.accentWashText} />
        </View>
        <View style={styles.receiptTextWrap}>
          <Text style={[styles.receiptTitle, { color: theme.textPrimary }]}>{draft.hasReceipt ? 'VAT bill attached' : 'Attach the VAT bill'}</Text>
          <Text style={[styles.receiptHint, { color: theme.textSecondary }]}>
            {draft.hasReceipt ? 'bill-scan.jpg · tap to remove' : 'Tap to attach · required to claim input VAT'}
          </Text>
        </View>
      </Pressable>

      <View style={styles.footer}>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryText, { color: theme.textSecondary }]}>
            {category.label} · paid from {draft.source.toLowerCase()}
          </Text>
        </View>
        <Pressable
          onPress={onSave}
          disabled={!amountReady}
          style={[styles.saveButton, { backgroundColor: amountReady ? theme.accent : theme.draftWash }]}
        >
          <Text style={[styles.saveLabel, tabularNums, { color: amountReady ? theme.accentText : theme.draftWashText }]}>
            {amountReady ? `Post रु ${fmt(amountValue)}` : 'Enter an amount'}
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
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 64, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 52, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
  rupeeSign: { fontFamily: fontFamily.mono, fontSize: 15 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '600', letterSpacing: -0.02 * 28, padding: 0 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // 15 categories, several of them long ("Software & Subscriptions") — the
  // pills size to their label and wrap rather than sitting on a 2-column grid.
  categoryButton: { height: 40, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  categoryTag: { fontFamily: fontFamily.mono, fontSize: 10 },
  categoryLabel: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  sourceRow: { flexDirection: 'row', gap: 8 },
  sourceButton: { flex: 1, height: 48, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sourceLabel: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, padding: 18 },
  receiptIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  receiptTextWrap: { flex: 1, gap: 3, minWidth: 0 },
  receiptTitle: { fontSize: 14, fontWeight: '600' },
  receiptHint: { fontSize: 12, lineHeight: 12 * 1.45 },
  footer: { gap: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryText: { fontSize: 13.5 },
  saveButton: { height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  saveLabel: { fontSize: 16, fontWeight: '600' },
});

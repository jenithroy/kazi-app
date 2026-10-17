import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';
import { BANK_TX_CATEGORIES } from '@/data/finance/mock';
import type { BankDirection } from '@/data/finance/types';

export interface BankTxDraft {
  bankChoice: string; // one of the chart's bank accounts, or 'Other'
  otherBank: string;
  date: string;
  description: string;
  amount: string;
  direction: BankDirection;
  category: string;
  reference: string;
}

export interface BankTxSheetProps {
  visible: boolean;
  draft: BankTxDraft;
  /** Bank accounts from the live chart — the sheet must not invent its own. */
  banks: string[];
  onClose: () => void;
  onChange: (patch: Partial<BankTxDraft>) => void;
  onSave: () => void;
}

export function BankTxSheet({ visible, draft, banks, onClose, onChange, onSave }: BankTxSheetProps) {
  const theme = useTheme();

  const amount = parseInt(draft.amount.replace(/[^0-9]/g, ''), 10) || 0;
  const bankName = draft.bankChoice === 'Other' ? draft.otherBank.trim() : draft.bankChoice;
  const ready = amount > 0 && !!bankName && draft.description.trim().length > 0;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Log bank transaction" maxHeight={720}>
      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Bank</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {[...banks, 'Other'].map((b) => {
            const on = draft.bankChoice === b;
            return (
              <Pressable
                key={b}
                onPress={() => onChange({ bankChoice: b })}
                style={[styles.chip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
              >
                <Text style={[styles.chipLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{b.replace('Bank - ', '')}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {draft.bankChoice === 'Other' ? (
          <TextField value={draft.otherBank} onChangeText={(v) => onChange({ otherBank: v })} placeholder="Bank / wallet name" />
        ) : null}
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Direction</Text>
        <View style={styles.dirRow}>
          {(['Credit', 'Debit'] as BankDirection[]).map((d) => {
            const on = draft.direction === d;
            const money = d === 'Credit';
            return (
              <Pressable
                key={d}
                onPress={() => onChange({ direction: d })}
                style={[
                  styles.dirButton,
                  { backgroundColor: on ? (money ? theme.accentWash : theme.dangerWash) : theme.surface, borderColor: on ? (money ? theme.accent : theme.danger) : theme.border },
                ]}
              >
                <Text style={[styles.dirLabel, { color: on ? (money ? theme.accentWashText : theme.dangerWashText) : theme.textPrimary }]}>
                  {d} · {money ? 'money in' : 'money out'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Amount · NPR</Text>
        <View style={[styles.amountRow, { borderColor: amount > 0 ? theme.accent : theme.border, backgroundColor: theme.surface }]}>
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

      <TextField label="Description" value={draft.description} onChangeText={(v) => onChange({ description: v })} placeholder="e.g. Customer receipt · SO-2290" />

      <View style={styles.group}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Category</Text>
        <View style={styles.wrapRow}>
          {BANK_TX_CATEGORIES.map((c) => {
            const on = draft.category === c;
            return (
              <Pressable
                key={c}
                onPress={() => onChange({ category: c })}
                style={[styles.pill, { backgroundColor: on ? theme.accentWash : theme.surface, borderColor: on ? theme.accent : theme.border }]}
              >
                <Text style={[styles.pillLabel, { color: on ? theme.accentWashText : theme.textPrimary }]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <TextField label="Reference" value={draft.reference} onChangeText={(v) => onChange({ reference: v })} placeholder="Transaction / cheque no." />

      <DateField label="Date" value={draft.date} onChange={(iso) => onChange({ date: iso })} pickerTitle="Transaction date" />

      <Button label={ready ? `Log रु ${amount.toLocaleString('en-IN')}` : 'Fill in bank, amount & description'} onPress={onSave} disabled={!ready} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase' },
  chipRow: { gap: 7, paddingVertical: 1 },
  chip: { height: 40, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  dirRow: { gap: 8 },
  dirButton: { height: 46, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dirLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 60, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
  rupeeSign: { fontFamily: fontFamily.mono, fontSize: 15 },
  amountInput: { flex: 1, fontSize: 26, fontWeight: '600', letterSpacing: -0.02 * 26, padding: 0 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  pillLabel: { fontFamily: fontFamily.semibold, fontSize: 12 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 52, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
});

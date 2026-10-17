/**
 * Edit one Cash/Bank ledger row in place — the mobile form of the reference
 * `Finance.jsx` ledger tab, where clicking a row turns Particulars and the
 * Dr/Cr amount into inputs and `commitLedgerDraft` patches the source doc
 * (`bank_transactions` / `journal_entries`). Purchase rows are not edited here:
 * the reference sends those to the Purchases page, and so does the caller.
 */

import { StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';
import { useDateText } from '@/lib/date-display';

/** Which source doc the row came from — the reference's `sourceType`. */
export type LedgerDraftKind = 'bank' | 'journal' | 'expense';

export interface LedgerDraft {
  kind: LedgerDraftKind;
  id: string;
  account: string;
  date: string;
  /** The row's own reference (`EXP081`, `JV-0332`, …) — shown, never edited. */
  ref: string;
  side: 'dr' | 'cr';
  particulars: string;
  amount: string;
}

const KIND_LABEL: Record<LedgerDraftKind, string> = {
  bank: 'Bank transaction',
  journal: 'Journal entry',
  expense: 'Expense',
};

export interface LedgerEntrySheetProps {
  visible: boolean;
  draft: LedgerDraft | null;
  canEdit: boolean;
  onChange: (patch: Partial<LedgerDraft>) => void;
  onClose: () => void;
  onSave: () => void;
}

export function LedgerEntrySheet({ visible, draft, canEdit, onChange, onClose, onSave }: LedgerEntrySheetProps) {
  const theme = useTheme();
  const dateText = useDateText();
  if (!draft) return null;

  const amount = parseInt(draft.amount.replace(/[^0-9]/g, ''), 10) || 0;
  const sideLabel = draft.side === 'dr' ? 'Dr — money in' : 'Cr — money out';

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Edit ledger entry">
      <Text style={[styles.meta, { color: theme.textSecondary }]}>
        {KIND_LABEL[draft.kind]} · {draft.account} · {draft.date ? dateText(draft.date) : '—'}
        {draft.ref ? ` · ${draft.ref}` : ''}
      </Text>

      <TextField
        label="Particulars"
        value={draft.particulars}
        onChangeText={(particulars) => onChange({ particulars })}
        placeholder="What this entry was for"
        autoCapitalize="sentences"
      />

      <View style={styles.amountGroup}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{sideLabel}</Text>
        <View style={[styles.amountRow, { borderColor: theme.accent, backgroundColor: theme.surface }]}>
          <Text style={[styles.rupeeSign, { color: theme.textSecondary }]}>रु</Text>
          <TextInput
            value={draft.amount}
            onChangeText={(v) => onChange({ amount: v })}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={theme.textSecondary}
            style={[styles.amountInput, { color: theme.textPrimary }]}
          />
        </View>
      </View>

      <Button
        label={`Save · रु ${amount.toLocaleString('en-IN')}`}
        onPress={onSave}
        disabled={!canEdit || amount <= 0 || !draft.particulars.trim()}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  meta: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase', marginTop: -12 },
  amountGroup: { gap: 7 },
  label: { fontFamily: fontFamily.mono, fontSize: 10.5, letterSpacing: 0.11 * 10.5, textTransform: 'uppercase' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 64, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
  rupeeSign: { fontFamily: fontFamily.mono, fontSize: 15 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '600', letterSpacing: -0.02 * 28, padding: 0 },
});

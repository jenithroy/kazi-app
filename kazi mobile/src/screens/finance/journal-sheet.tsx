import { StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';
import { ADVANCE_ACCOUNTS } from '@/data/finance/mock';
import type { Account } from '@/data/finance/types';

import { AccountPicker } from './account-picker';

export interface JournalDraft {
  id: string | null;
  date: string;
  amount: string;
  debitAccount: string;
  creditAccount: string;
  description: string;
  reference: string;
  partyName: string;
}

export interface JournalSheetProps {
  visible: boolean;
  draft: JournalDraft;
  accounts: Account[];
  onClose: () => void;
  onChange: (patch: Partial<JournalDraft>) => void;
  onSave: () => void;
  onDelete?: () => void;
}

export function isAdvanceAccount(name: string): boolean {
  return ADVANCE_ACCOUNTS.includes(name);
}

export function JournalSheet({ visible, draft, accounts, onClose, onChange, onSave, onDelete }: JournalSheetProps) {
  const theme = useTheme();

  const amount = parseInt(draft.amount.replace(/[^0-9]/g, ''), 10) || 0;
  const needsParty = isAdvanceAccount(draft.debitAccount) || isAdvanceAccount(draft.creditAccount);
  const sameAccount = !!draft.debitAccount && draft.debitAccount === draft.creditAccount;

  let error = '';
  if (sameAccount) error = 'Debit and credit must be different accounts';
  else if (needsParty && !draft.partyName.trim()) error = 'Advance accounts need a party name';

  const ready = amount > 0 && !!draft.debitAccount && !!draft.creditAccount && draft.description.trim().length > 0 && !error;
  const editing = draft.id !== null;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={editing ? 'Edit journal entry' : 'Post journal entry'} maxHeight={720}>
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

      <AccountPicker
        label="Debit account"
        value={draft.debitAccount}
        accounts={accounts}
        excludeName={draft.creditAccount}
        onPick={(name) => onChange({ debitAccount: name })}
      />
      <AccountPicker
        label="Credit account"
        value={draft.creditAccount}
        accounts={accounts}
        excludeName={draft.debitAccount}
        onPick={(name) => onChange({ creditAccount: name })}
      />

      {needsParty ? (
        <TextField label="Party name" value={draft.partyName} onChangeText={(v) => onChange({ partyName: v })} placeholder="e.g. Northfield Apparel" />
      ) : null}

      <TextField label="Description" value={draft.description} onChangeText={(v) => onChange({ description: v })} placeholder="What is this entry for?" />
      <TextField label="Reference" value={draft.reference} onChangeText={(v) => onChange({ reference: v })} placeholder="e.g. JV-0332" />

      <DateField label="Date" value={draft.date} onChange={(iso) => onChange({ date: iso })} pickerTitle="Entry date" />

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.dangerWash }]}>
          <Icon name="alert-triangle" size={13} color={theme.dangerWashText} />
          <Text style={[styles.errorText, { color: theme.dangerWashText }]}>{error}</Text>
        </View>
      ) : draft.debitAccount && draft.creditAccount ? (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Dr {draft.debitAccount} · Cr {draft.creditAccount}
        </Text>
      ) : null}

      <Button label={editing ? 'Save changes' : `Post रु ${amount.toLocaleString('en-IN')}`} onPress={onSave} disabled={!ready} />
      {editing && onDelete ? <Button label="Delete entry" variant="dangerOutline" onPress={onDelete} /> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 60, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
  rupeeSign: { fontFamily: fontFamily.mono, fontSize: 15 },
  amountInput: { flex: 1, fontSize: 26, fontWeight: '600', letterSpacing: -0.02 * 26, padding: 0 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 52, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  errorText: { flex: 1, fontSize: 12, fontWeight: '600' },
  hint: { fontFamily: fontFamily.mono, fontSize: 10.5 },
});

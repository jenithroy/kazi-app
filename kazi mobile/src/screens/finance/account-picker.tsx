import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { Account, AccountType } from '@/data/finance/types';

const TYPE_ORDER: AccountType[] = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

export interface AccountPickerProps {
  label: string;
  value: string;
  accounts: Account[];
  onPick: (name: string) => void;
  /** Grey out this account (e.g. the one already chosen for the other leg). */
  excludeName?: string;
}

/** Inline expand-to-select account field — no nested modal. */
export function AccountPicker({ label, value, accounts, onPick, excludeName }: AccountPickerProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={[styles.field, { backgroundColor: theme.surface, borderColor: open ? theme.accent : theme.border }]}
      >
        <Text style={[styles.value, { color: value ? theme.textPrimary : theme.textSecondary }]} numberOfLines={1}>
          {value || 'Select an account'}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
      </Pressable>

      {open ? (
        <ScrollView style={[styles.list, { borderColor: theme.border }]} nestedScrollEnabled contentContainerStyle={styles.listContent}>
          {TYPE_ORDER.map((type) => {
            const rows = accounts.filter((a) => a.type === type);
            if (!rows.length) return null;
            return (
              <View key={type}>
                <Text style={[styles.groupHeader, { color: theme.textSecondary, backgroundColor: theme.surfaceRaised }]}>{type}</Text>
                {rows.map((a) => {
                  const on = a.name === value;
                  const disabled = a.name === excludeName;
                  return (
                    <Pressable
                      key={a.id}
                      disabled={disabled}
                      onPress={() => {
                        onPick(a.name);
                        setOpen(false);
                      }}
                      style={[styles.row, { opacity: disabled ? 0.35 : 1, backgroundColor: on ? theme.accentWash : 'transparent' }]}
                    >
                      <Text style={[styles.rowText, { color: on ? theme.accentWashText : theme.textPrimary }]}>{a.name}</Text>
                      {on ? <Icon name="check" size={14} color={theme.accentWashText} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase' },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 52, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1 },
  value: { flex: 1, fontSize: 15, fontWeight: '600' },
  list: { maxHeight: 240, borderWidth: 1, borderRadius: 14 },
  listContent: { paddingVertical: 4 },
  groupHeader: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.12 * 9.5, textTransform: 'uppercase', paddingHorizontal: 14, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11 },
  rowText: { fontSize: 13.5, fontWeight: '500' },
});

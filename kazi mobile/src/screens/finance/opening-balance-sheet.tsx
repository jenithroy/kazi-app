import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';

export interface OpeningBalanceSheetProps {
  visible: boolean;
  accountName: string;
  current: number;
  onClose: () => void;
  onSave: (value: number) => void;
}

export function OpeningBalanceSheet({ visible, accountName, current, onClose, onSave }: OpeningBalanceSheetProps) {
  const theme = useTheme();
  const [value, setValue] = useState(String(current));

  // Re-seed the field each time the sheet opens, and if the stored balance
  // moves underneath it. Done during render so it never paints the old figure.
  const seed = `${visible}:${current}`;
  const [seededFrom, setSeededFrom] = useState(seed);
  if (seededFrom !== seed) {
    setSeededFrom(seed);
    if (visible) setValue(String(current));
  }

  const num = parseInt(value.replace(/[^0-9]/g, ''), 10) || 0;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Opening balance">
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{accountName}</Text>
      <View style={[styles.amountRow, { borderColor: theme.accent, backgroundColor: theme.surface }]}>
        <Text style={[styles.rupeeSign, { color: theme.textSecondary }]}>रु</Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={theme.textSecondary}
          style={[styles.amountInput, { color: theme.textPrimary }]}
        />
      </View>
      <Button label={`Set opening · रु ${num.toLocaleString('en-IN')}`} onPress={() => onSave(num)} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.11 * 10, textTransform: 'uppercase', marginTop: -12 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 64, paddingHorizontal: 16, borderRadius: radii.lg - 2, borderWidth: 1 },
  rupeeSign: { fontFamily: fontFamily.mono, fontSize: 15 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '600', letterSpacing: -0.02 * 28, padding: 0 },
});

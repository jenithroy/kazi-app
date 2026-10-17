import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * The search pill used above a filtered list. Deliberately not `TextField` —
 * the pill is the chrome, so the input inside it carries no label or border of
 * its own.
 */
export function SearchField({ value, onChange, placeholder = 'Search…' }: SearchFieldProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Icon name="search" size={16} color={theme.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        autoCorrect={false}
        style={[styles.input, { color: theme.textPrimary }]}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChange('')} hitSlop={8}>
          <Text style={[styles.clear, { color: theme.accentDeep }]}>Clear</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, height: 46, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1 },
  input: { flex: 1, fontSize: 14.5, fontFamily: fontFamily.regular, padding: 0 },
  clear: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.08 * 10, textTransform: 'uppercase' },
});

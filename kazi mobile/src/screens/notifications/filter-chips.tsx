import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

export type NotifFilter = 'all' | 'unread' | 'for-you' | 'mentions';

const OPTIONS: { key: NotifFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'for-you', label: 'For you' },
  { key: 'mentions', label: 'Mentions' },
];

export function FilterChips({
  active,
  onPick,
  unreadCount,
}: {
  active: NotifFilter;
  onPick: (f: NotifFilter) => void;
  unreadCount: number;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.bar, { borderBottomColor: theme.border }]}>
      {OPTIONS.map((opt) => {
        const on = opt.key === active;
        const badge = opt.key === 'unread' && unreadCount > 0 ? ` ${unreadCount}` : '';
        return (
          <Pressable
            key={opt.key}
            onPress={() => onPick(opt.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[
              styles.chip,
              { borderColor: on ? theme.selectedBorder : theme.border, backgroundColor: on ? theme.selectedSurface : 'transparent' },
            ]}
          >
            <Text style={[styles.chipText, { color: on ? theme.selectedText : theme.textSecondary }]}>
              {opt.label}
              {badge}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  chipText: { fontFamily: fontFamily.semibold, fontSize: 12 },
});

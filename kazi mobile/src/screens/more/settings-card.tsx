import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCalendarPreference } from '@/lib/calendar-preference';
import { Icon } from '@/components/ui/icon';
import { useCurrency } from '@/lib/currency-context';
import { useTheme, useThemeMode } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

const MODE_LABEL = { system: 'System theme', light: 'Light', dark: 'Dark' } as const;

/** More-hub entry to Settings, summarising what's currently set so the row isn't a blind door. */
export function SettingsCard() {
  const theme = useTheme();
  const { mode } = useThemeMode();
  const { primary } = useCurrency();
  const calendar = useCalendarPreference();

  return (
    <Pressable
      onPress={() => router.push('/settings')}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.surface, boxShadow: theme.shadows.card, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
        <Icon name="sliders" size={17} color={theme.textPrimary} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Settings</Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
          {MODE_LABEL[mode]} · {primary} · {calendar === 'bs' ? 'B.S. dates' : 'A.D. dates'}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 15 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 3, minWidth: 0 },
  title: { fontFamily: fontFamily.semibold, fontSize: 15 },
  meta: { fontSize: 12 },
});

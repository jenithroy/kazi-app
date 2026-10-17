import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/screen-header';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useScrollTop } from '@/lib/use-scroll-top';
import { RoleSwitcher } from '@/screens/more/role-switcher';
import { useTheme } from '@/theme/theme-provider';

import { AppearanceCard } from './appearance-card';
import { CalendarCard } from './calendar-card';
import { CurrencyCard } from './currency-card';
import { HapticsCard } from './haptics-card';

/**
 * Every app-wide display preference, in one place instead of scattered across
 * the More hub and the inside of a date picker. Deliberately short: this is a
 * single-workshop ERP, and a settings screen padded with toggles that don't do
 * anything is worse than no settings screen. Anything account-shaped (password,
 * sign out, the access a role grants) stays on Account.
 */
export function Settings() {
  const theme = useTheme();
  const scrollRef = useScrollTop();

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader title="Settings" subtitle="Appearance · currency · dates · haptics" />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <AppearanceCard />
        <CurrencyCard />
        <CalendarCard />
        <HapticsCard />
        {isSupabaseConfigured ? null : <RoleSwitcher />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
});

import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import type { SectionId } from '@/auth/permissions';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useScrollTop } from '@/lib/use-scroll-top';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { MORE_MODULES } from '@/constants';

import { AccountCard } from './account-card';
import { ModuleCard } from './module-card';
import { NotificationsCard } from './notifications-card';
import { RoleSwitcher } from './role-switcher';
import { SettingsCard } from './settings-card';

export function More() {
  const theme = useTheme();
  const scrollRef = useScrollTop();
  const insets = useSafeAreaInsets();
  const { canView } = useAuth();

  const modules = useMemo(() => MORE_MODULES.filter((m) => canView(m.id as SectionId)), [canView]);

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>More</Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>{modules.length} modules</Text>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <AccountCard />
        <NotificationsCard />
        <SettingsCard />
        {isSupabaseConfigured ? null : <RoleSwitcher />}
        <View style={styles.grid}>
          {modules.map((m) => (
            <ModuleCard key={m.id} module={m} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 3,
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 26,
    letterSpacing: -0.025 * 26,
  },
  meta: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.12 * 10,
    textTransform: 'uppercase',
  },
  content: {
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});

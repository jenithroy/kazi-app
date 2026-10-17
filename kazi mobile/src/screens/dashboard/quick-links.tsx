import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import type { SectionId } from '@/auth/permissions';
import { tabLayoutFor } from '@/auth/tab-layout';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { MODULES_BY_ID } from '@/constants';
import { prefetchRoute } from '@/data/prefetch';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

/**
 * The safety net for the trimmed bottom bar.
 *
 * Each position now carries four or five buttons instead of one per module, so
 * the dashboard has to make up the difference: this renders every section the
 * person can view that is NOT already a button for them. Nothing can become
 * unreachable by editing a layout, because this list is derived from the same
 * layout it compensates for.
 *
 * More still holds the full grid — this is the shortcut, not the index.
 */

/**
 * Tasks has no `MORE_MODULES` card, so name it here. Like the cards, it points
 * at the pushed `/module/...` copy rather than the tab path — a quick link is a
 * page you come back from, not a change of tab.
 */
const TAB_MODULE_LINKS: Partial<Record<SectionId, { label: string; route: string; icon: IconName }>> = {
  tasks: { label: 'Tasks', route: '/module/tasks', icon: 'check-square' },
};

/** Sections that never earn a shortcut: reached elsewhere, or not a destination. */
const NEVER_LINK: SectionId[] = ['dashboard', 'messenger', 'changelog', 'bug-report', 'admin-panel'];

function linkFor(id: SectionId): { label: string; route: string; icon: IconName } | null {
  const tabLink = TAB_MODULE_LINKS[id];
  if (tabLink) return tabLink;
  const mod = MODULES_BY_ID[id];
  return mod ? { label: mod.label, route: mod.route, icon: mod.icon } : null;
}

export interface QuickLinksProps {
  /** Sections to offer, in order. Anything already in the bottom bar is dropped. */
  sections: SectionId[];
}

export function QuickLinks({ sections }: QuickLinksProps) {
  const theme = useTheme();
  const { canView, profile, role } = useAuth();

  const inBar = new Set(tabLayoutFor(profile?.positionId, role).map((s) => s.section));
  const links = sections
    .filter((id) => !inBar.has(id) && !NEVER_LINK.includes(id) && canView(id))
    .map((id) => ({ id, ...linkFor(id) }))
    .filter((l): l is { id: SectionId; label: string; route: string; icon: IconName } => !!l.label);

  if (links.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>Jump to</Text>
      <View style={styles.grid}>
        {links.map((link) => (
          <Pressable
            key={link.id}
            onPress={() => router.push(link.route as never)}
            onPressIn={() => prefetchRoute(link.route)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
          >
            <Card elevation="raised" style={styles.card}>
              <View style={[styles.iconWrap, { backgroundColor: theme.accentWash }]}>
                <Icon name={link.icon} size={16} color={theme.accentWashText} />
              </View>
              <Text style={[styles.label, { color: theme.textPrimary }]} numberOfLines={2}>
                {link.label}
              </Text>
            </Card>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  eyebrow: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.12 * 10,
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cell: {
    width: '30%',
    flexGrow: 1,
  },
  pressed: {
    opacity: 0.92,
  },
  card: {
    padding: 12,
    gap: 9,
    minHeight: 84,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12.5,
    lineHeight: 16,
  },
});

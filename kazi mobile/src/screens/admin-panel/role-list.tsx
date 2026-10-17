import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Avatar, tintFromSeed } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii, tabularNums } from '@/theme';
import type { AccessCounts, RoleRow } from '@/data/admin-panel/types';
import { initialsOf, isSuperTier } from '@/data/admin-panel/utils';

import { AccessBar } from './access-bar';

export interface RoleListProps {
  roles: RoleRow[];
  query: string;
  onQueryChange: (v: string) => void;
  countsFor: (role: RoleRow) => AccessCounts;
  holdersFor: (roleId: string) => number;
  sectionCount: number;
  peopleCount: number;
  onPick: (roleId: string) => void;
}

/**
 * The roles rail, as the screen's first level.
 *
 * The web page shows roles and the matrix side by side; a phone can't, so a
 * role is picked here and its pages open on their own. Each card carries
 * enough — who holds it, how much it reaches — to compare roles without
 * opening any of them.
 */
export function RoleList({
  roles,
  query,
  onQueryChange,
  countsFor,
  holdersFor,
  sectionCount,
  peopleCount,
  onPick,
}: RoleListProps) {
  const theme = useTheme();

  const q = query.trim().toLowerCase();
  const matches = q
    ? roles.filter((r) => `${r.label} ${r.id} ${r.description ?? ''}`.toLowerCase().includes(q))
    : roles;
  const superRoles = matches.filter((r) => isSuperTier(r.tier));
  const normalRoles = matches.filter((r) => !isSuperTier(r.tier));

  const renderRole = (role: RoleRow, index: number) => {
    const counts = countsFor(role);
    const holders = holdersFor(role.id);
    const isSuper = isSuperTier(role.tier);

    return (
      <Animated.View key={role.id} entering={FadeInUp.delay(Math.min(index, 8) * 30).duration(200)}>
        <Pressable
          onPress={() => onPick(role.id)}
          style={({ pressed }) => [
            styles.roleCard,
            { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <View style={styles.roleTop}>
            <Avatar initials={initialsOf(role.label)} size="sm" tint={tintFromSeed(role.id)} />
            <View style={styles.roleText}>
              <View style={styles.roleNameRow}>
                <Text style={[styles.roleName, { color: theme.textPrimary }]} numberOfLines={1}>
                  {role.label}
                </Text>
                {isSuper ? <Icon name="lock" size={12} color={theme.textSecondary} /> : null}
              </View>
              <Text style={[styles.roleMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                {holders === 0 ? 'nobody assigned' : `${holders} ${holders === 1 ? 'person' : 'people'}`}
                {' · '}
                {isSuper ? 'all pages' : `${counts.edit} edit · ${counts.view} view`}
              </Text>
            </View>
            <Icon name="chevron-right" size={16} color={theme.textSecondary} />
          </View>
          <AccessBar counts={counts} height={4} />
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={styles.wrap}>
      <Card elevation="hero" style={styles.statsCard}>
        <Stat label="Roles" value={roles.length} />
        <View style={[styles.statDivider, { backgroundColor: theme.onHero.divider }]} />
        <Stat label="People" value={peopleCount} />
        <View style={[styles.statDivider, { backgroundColor: theme.onHero.divider }]} />
        <Stat label="Pages" value={sectionCount} />
      </Card>

      <View style={[styles.searchRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Icon name="search" size={16} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search roles"
          placeholderTextColor={theme.textSecondary}
          style={[styles.searchInput, { color: theme.textPrimary, fontFamily: fontFamily.regular }]}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => onQueryChange('')} hitSlop={8}>
            <Text style={[styles.clearLabel, { color: theme.accentDeep }]}>clear</Text>
          </Pressable>
        ) : null}
      </View>

      {superRoles.length > 0 ? (
        <View style={styles.group}>
          <View style={styles.groupHead}>
            <Icon name="lock" size={12} color={theme.textSecondary} />
            <Text style={[styles.groupTitle, { color: theme.textPrimary }]}>Super admin</Text>
            <Text style={[styles.groupNote, { color: theme.textSecondary }]}>always full access</Text>
          </View>
          {superRoles.map(renderRole)}
        </View>
      ) : null}

      <View style={styles.group}>
        <View style={styles.groupHead}>
          <Text style={[styles.groupTitle, { color: theme.textPrimary }]}>Roles</Text>
          <Text style={[styles.groupNote, tabularNums, { color: theme.textSecondary }]}>{normalRoles.length}</Text>
        </View>
        {normalRoles.length === 0 ? (
          <EmptyState
            icon="users"
            title={q ? 'No role matches' : 'No roles yet'}
            message={q ? `Nothing matches “${query.trim()}”. Try a shorter word, or clear the search.` : 'Create one, grant it pages, then assign people to it.'}
          />
        ) : (
          normalRoles.map(renderRole)
        )}
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tabularNums, { color: theme.onHero.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.onHero.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 8,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontFamily: fontFamily.semibold, fontSize: 21, letterSpacing: -0.02 * 21 },
  statLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9.5,
    letterSpacing: 0.1 * 9.5,
    textTransform: 'uppercase',
  },
  statDivider: { width: 1, height: 26, opacity: 0.18 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 15,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  clearLabel: { fontFamily: fontFamily.mono, fontSize: 11 },
  group: { gap: 9 },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  groupTitle: { fontFamily: fontFamily.semibold, fontSize: 15, letterSpacing: -0.01 * 15 },
  groupNote: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  roleCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 13,
    gap: 11,
  },
  roleTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  roleText: { flex: 1, gap: 3, minWidth: 0 },
  roleNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roleName: { fontFamily: fontFamily.semibold, fontSize: 15, flexShrink: 1 },
  roleMeta: { fontFamily: fontFamily.mono, fontSize: 10.5 },
});

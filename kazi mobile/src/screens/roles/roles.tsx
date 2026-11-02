import { useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { HeaderAccount } from '@/components/ui/header-account';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useRolesPage } from '@/data/roles/hooks';
import { activeStaff, firstRoleId, groupRoles, holdersOf, jobRoles, myRoleId } from '@/data/roles/rules';
import { useScrollTop } from '@/lib/use-scroll-top';
import { fontFamily } from '@/theme';
import { useTheme } from '@/theme/theme-provider';

import { RoleCard } from './role-card';
import { RolePicker } from './role-picker';
import { OrgTiersCard, SharedDutiesCard } from './side-cards';

/**
 * Roles & Duties: who is in each role, and what that role is expected to log. The website's page, on a phone: the roles as chips
 * (grouped UK / Nepal, your own opened first), then the open role's card, then what everyone on the Nepal team is asked to do and
 * how the roles sit together. Open to everyone signed in: a page telling people what to log is no use if only directors can open it.
 */
export function Roles() {
  const theme = useTheme();
  const scrollRef = useScrollTop();
  const { profile } = useAuth();
  const { data, isLoading, isError, error, refetch, isRefetching } = useRolesPage();
  const [picked, setPicked] = useState<string | null>(null);

  const roles = useMemo(() => jobRoles(data?.positions), [data]);
  const active = useMemo(() => activeStaff(data?.staff), [data]);
  // A directory that can't be read (or has nobody in it) leaves the people out; the roles and duties still draw.
  const directoryVisible = active.length > 0;
  const groups = useMemo(() => groupRoles(roles, active, directoryVisible), [roles, active, directoryVisible]);
  const myId = profile?.personId;
  const mineId = useMemo(() => myRoleId(roles, active, myId), [roles, active, myId]);

  const selectedId = roles.some((r) => r.id === picked) ? picked : firstRoleId(groups, roles, mineId);
  const role = roles.find((r) => r.id === selectedId) ?? null;
  const holders = role && directoryVisible ? holdersOf(active, role.id) : [];

  if (isLoading) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.background }]}>
        <ScreenHeader title="Roles & Duties" subtitle="Who is in each role" rightSlot={<HeaderAccount size="sm" />} />
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.background }]}>
        <ScreenHeader title="Roles & Duties" subtitle="Who is in each role" rightSlot={<HeaderAccount size="sm" />} />
        <View style={styles.errorWrap}>
          <EmptyState icon="wifi-off" title="Couldn’t load roles" message={`${String((error as Error)?.message ?? 'Check your connection')}. Check your connection and try again.`} />
          <Button label="Try again" variant="secondary" onPress={() => refetch()} style={styles.retry} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Roles & Duties"
        subtitle="Who’s in each role"
        rightSlot={<HeaderAccount size="sm" />}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={theme.accent} />}
      >
        {roles.length === 0 ? (
          <EmptyState icon="users" title="No roles yet" message="Roles are set up in the Admin Panel." />
        ) : (
          <>
            <RolePicker groups={groups} active={active} mineId={mineId} selectedId={selectedId} onPick={setPicked} directoryVisible={directoryVisible} />
            {role ? <RoleCard role={role} holders={holders} directoryVisible={directoryVisible} myId={myId} /> : null}
          </>
        )}
        <SharedDutiesCard />
        <OrgTiersCard />
        <Link href={'/bug-report' as never} asChild>
          <Pressable accessibilityRole="link" style={styles.report} hitSlop={8}>
            <Icon name="alert-triangle" size={14} color={theme.link} />
            <Text style={[styles.reportText, { color: theme.link }]}>Report a bug</Text>
          </Pressable>
        </Link>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 16, paddingBottom: 40, gap: 16 },
  errorWrap: { padding: 20, gap: 14 },
  retry: { alignSelf: 'flex-start' },
  report: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', paddingVertical: 6 },
  reportText: { fontFamily: fontFamily.semibold, fontSize: 13 },
});

import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { ROLE_LABEL } from '@/auth/roles';
import { useUnreadCount } from '@/data/notifications/context';
import { useTheme } from '@/theme/theme-provider';

import { DashboardHeader } from './header';
import { AccountantDashboard } from './variants/accountant';
import { DesignerDashboard } from './variants/designer';
import { MarketingDashboard } from './variants/marketing';
import { MyDayDashboard } from './variants/my-day';
import { OpsDashboard } from './variants/ops';
import { OwnerDashboard } from './variants/owner';

type DashboardVariant = () => React.JSX.Element;

/**
 * One dashboard per position, matching the per-position bottom bar in
 * `auth/tab-layout.ts`.
 *
 * The bar now carries four or five buttons instead of one per module, so each
 * variant has to carry the slack: it leads with what that position works in and
 * ends with `QuickLinks`, which offers every section they can view that isn't
 * already a button. Position ids come from `positions.id` in Postgres.
 */
const BY_POSITION: Record<string, DashboardVariant> = {
  director: OwnerDashboard,
  developer: OwnerDashboard,
  'system-admin': OwnerDashboard,

  'operations-head': OpsDashboard,
  // Labelled "Operations Manager" live — Anmol.
  'operations-intern': OpsDashboard,

  accountant: AccountantDashboard,
  'fashion-designer': DesignerDashboard,
  'marketing-coordinator': MarketingDashboard,
  'content-coordinator': MarketingDashboard,
};

export function Dashboard() {
  const theme = useTheme();
  const { profile, role } = useAuth();
  const unreadCount = useUnreadCount();

  // No position on the session (a minimal session, or the dev role
  // switcher under mock auth) — fall back to the coarse role, same as the bar.
  const byRole =
    role === 'uk_admin' || role === 'super_admin'
      ? OwnerDashboard
      : role === 'nepal_admin'
        ? OpsDashboard
        : MyDayDashboard;
  const Variant: DashboardVariant = BY_POSITION[profile?.positionId ?? ''] ?? byRole;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <DashboardHeader
        name={profile ? profile.name.split(' ')[0] : 'there'}
        roleLine={profile ? profile.jobRole?.trim() || ROLE_LABEL[profile.role] : ''}
        initials={profile?.initials ?? 'SR'}
        unreadCount={unreadCount}
        onPressNotifications={() => router.push('/notifications')}
        onPressAccount={() => router.push('/account')}
      />
      <Variant />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});

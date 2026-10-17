import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

export interface DashboardHeaderProps {
  name: string;
  roleLine: string;
  initials: string;
  unreadCount: number;
  onPressNotifications?: () => void;
  onPressAccount?: () => void;
}

export function DashboardHeader({
  name,
  roleLine,
  initials,
  unreadCount,
  onPressNotifications,
  onPressAccount,
}: DashboardHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.row,
        { paddingTop: insets.top + 12, backgroundColor: theme.surfaceRaised, borderBottomColor: theme.border },
      ]}
    >
      <View style={styles.textWrap}>
        <Text style={[styles.greeting, { color: theme.textPrimary }]}>Namaste, {name}</Text>
        <Text style={[styles.role, { color: theme.textSecondary }]}>{roleLine}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={onPressNotifications}
          style={[styles.bellButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Icon name="bell" size={18} color={theme.textPrimary} />
          {unreadCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.danger, borderColor: theme.surfaceRaised }]}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          onPress={onPressAccount}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Account"
        >
          <Avatar initials={initials} tint="dark" size="lg" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  textWrap: {
    gap: 3,
  },
  greeting: {
    fontFamily: fontFamily.semibold,
    fontSize: 22,
    letterSpacing: -0.02 * 22,
  },
  role: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.12 * 10,
    textTransform: 'uppercase',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 99,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFF6F1',
    fontSize: 10,
    fontWeight: '600',
  },
});

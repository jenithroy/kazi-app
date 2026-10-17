import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { useUnreadCount } from '@/data/notifications/context';
import { useTheme } from '@/theme/theme-provider';

import { Avatar, type AvatarSize } from './avatar';
import { Icon } from './icon';

const BELL: Record<AvatarSize, { box: number; radius: number; icon: number }> = {
  lg: { box: 40, radius: 14, icon: 18 },
  md: { box: 36, radius: 13, icon: 16 },
  sm: { box: 34, radius: 12, icon: 16 },
};

export interface HeaderAccountProps {
  /** Matches the avatar size the screen used before — keeps each header's proportions. */
  size?: AvatarSize;
  /** Extra control(s) rendered before the bell — e.g. an export button or a view switch. */
  leading?: ReactNode;
  /** Background the unread badge's ring blends into (defaults to the screen background). */
  badgeRingColor?: string;
}

/**
 * The standard header trailing block: a notifications bell (with unread badge)
 * next to the signed-in user's account avatar. Both are wired to their routes,
 * and the initials always come from the live session so they never drift
 * per-screen.
 */
export function HeaderAccount({ size = 'lg', leading, badgeRingColor }: HeaderAccountProps) {
  const theme = useTheme();
  const { profile } = useAuth();
  const unreadCount = useUnreadCount();
  const bell = BELL[size];
  const initials = profile?.initials?.trim() || '–';

  return (
    <View style={styles.row}>
      {leading}
      <Pressable
        onPress={() => router.push('/notifications')}
        style={[
          styles.bell,
          { width: bell.box, height: bell.box, borderRadius: bell.radius, backgroundColor: theme.surface, borderColor: theme.border },
        ]}
        accessibilityRole="button"
        accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
        <Icon name="bell" size={bell.icon} color={theme.textPrimary} />
        {unreadCount > 0 ? (
          <View style={[styles.badge, { backgroundColor: theme.danger, borderColor: badgeRingColor ?? theme.background }]}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable
        onPress={() => router.push('/account')}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Account"
      >
        <Avatar initials={initials} tint="dark" size={size} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bell: {
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

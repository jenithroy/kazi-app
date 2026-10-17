import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useUnreadCount } from '@/data/notifications/context';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

/** More-hub entry to the Notifications screen, with an unread count. */
export function NotificationsCard() {
  const theme = useTheme();
  const unread = useUnreadCount();

  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.surface, boxShadow: theme.shadows.card, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
        <Icon name="bell" size={17} color={theme.textPrimary} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Notifications</Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {unread > 0 ? `${unread} unread` : 'All caught up'}
        </Text>
      </View>
      {unread > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.danger }]}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : (
        <Icon name="chevron-right" size={18} color={theme.textSecondary} />
      )}
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
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFF6F1', fontFamily: fontFamily.semibold, fontSize: 11 },
});

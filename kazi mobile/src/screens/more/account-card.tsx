import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { ROLE_LABEL } from '@/auth/roles';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

/** Entry point to the Account screen from the More hub (mirrors the Dashboard avatar). */
export function AccountCard() {
  const theme = useTheme();
  const { profile } = useAuth();
  if (!profile) return null;

  return (
    <Pressable
      onPress={() => router.push('/account')}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.surface, boxShadow: theme.shadows.card, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Avatar initials={profile.initials} tint="dark" size="md" />
      <View style={styles.text}>
        <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
          {profile.name}
        </Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
          {profile.jobRole?.trim() || ROLE_LABEL[profile.role]} · Account
        </Text>
      </View>
      <Icon name="chevron-right" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 15 },
  text: { flex: 1, gap: 3, minWidth: 0 },
  name: { fontFamily: fontFamily.semibold, fontSize: 15 },
  meta: { fontSize: 12 },
});

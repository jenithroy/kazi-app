import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

/**
 * Full-screen block shown instead of `(app)` when the signed-in user's
 * `employees` record is `status: "Inactive"` (reference assigns them the
 * `inactive` role). Their only action is to sign out.
 */
export function AccountInactive() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { signOut, profile } = useAuth();

  return (
    <View
      style={[
        styles.flex,
        { backgroundColor: theme.background, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: theme.dangerWash }]}>
          <Icon name="lock" size={22} color={theme.dangerWashText} />
        </View>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Account inactive</Text>
        <Text style={[styles.copy, { color: theme.textSecondary }]}>
          {profile?.name ? `${profile.name}, your` : 'Your'} access to Kazi has been paused by an
          administrator. Contact your operations lead to have it restored.
        </Text>
      </View>
      <Button label="Sign out" variant="secondary" fullWidth onPress={signOut} style={styles.action} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, paddingHorizontal: 28, justifyContent: 'space-between' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 22,
    letterSpacing: -0.02 * 22,
  },
  copy: {
    fontSize: 14,
    lineHeight: 14 * 1.5,
    textAlign: 'center',
    maxWidth: 320,
  },
  action: { marginTop: 12 },
});

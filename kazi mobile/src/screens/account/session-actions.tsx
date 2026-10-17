import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { useToast } from '@/components/toast/toast-provider';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

interface RowProps {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
}

function Row({ icon, label, hint, onPress, disabled }: RowProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [styles.row, { opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }]}
    >
      <Icon name={icon} size={17} color={theme.textPrimary} />
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{label}</Text>
        {hint ? <Text style={[styles.rowHint, { color: theme.textSecondary }]}>{hint}</Text> : null}
      </View>
      <Icon name="chevron-right" size={17} color={theme.textSecondary} />
    </Pressable>
  );
}

export function AccountActions({ email }: { email: string }) {
  const theme = useTheme();
  const toast = useToast();
  const { requestPasswordReset, signOut } = useAuth();
  const [sendingReset, setSendingReset] = useState(false);
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  async function handleResetPassword() {
    if (sendingReset) return;
    if (!isSupabaseConfigured) {
      toast.show({ message: 'Password reset needs the live backend', tone: 'warn' });
      return;
    }
    setSendingReset(true);
    try {
      await requestPasswordReset(email);
      toast.show({ message: `Reset link sent to ${email}`, tone: 'ok' });
    } catch {
      toast.show({ message: "Couldn't send the reset link — try again", tone: 'bad' });
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.raised, borderColor: theme.border }]}>
        <Row
          icon="key"
          label="Change password"
          hint={sendingReset ? 'Sending…' : 'Emails you a secure reset link'}
          onPress={handleResetPassword}
          disabled={sendingReset}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <Row icon="alert-triangle" label="Report a bug" onPress={() => router.push('/bug-report')} />
      </View>

      <Button label="Sign out" variant="dangerOutline" fullWidth onPress={signOut} />

      <Text style={[styles.version, { color: theme.textSecondary }]}>
        Kazi ERP · v{appVersion}
        {isSupabaseConfigured ? '' : ' · mock data'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: fontFamily.medium, fontSize: 14 },
  rowHint: { fontSize: 11.5 },
  divider: { height: StyleSheet.hairlineWidth },
  version: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.1 * 10,
    textTransform: 'uppercase',
    textAlign: 'center',
    paddingTop: 4,
  },
});

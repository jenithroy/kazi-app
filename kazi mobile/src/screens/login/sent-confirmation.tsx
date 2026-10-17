import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

export interface SentConfirmationProps {
  emailShown: string;
  onBack: () => void;
  onResend: () => void;
}

export function SentConfirmation({ emailShown, onBack, onResend }: SentConfirmationProps) {
  const theme = useTheme();

  return (
    <View style={styles.group}>
      <View style={[styles.iconWrap, { backgroundColor: theme.accentWash }]}>
        <Icon name="check" size={28} color={theme.accentWashText} />
      </View>
      <Text style={[styles.title, { color: theme.textPrimary }]}>Check your inbox</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>
        A reset link is on its way to{' '}
        <Text style={{ color: theme.textPrimary, fontFamily: fontFamily.semibold }}>{emailShown}</Text>. It expires in
        30 minutes.
      </Text>
      <View style={styles.actions}>
        <Button label="Back to sign in" variant="secondary" onPress={onBack} fullWidth />
        <Button label="Didn't get it? Resend" variant="ghost" size="small" onPress={onResend} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    alignItems: 'center',
    gap: 14,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 22,
    letterSpacing: -0.02 * 22,
  },
  body: {
    fontSize: 14,
    lineHeight: 14 * 1.55,
    textAlign: 'center',
    maxWidth: 260,
  },
  actions: {
    width: '100%',
    gap: 8,
    paddingTop: 12,
    alignItems: 'center',
  },
});

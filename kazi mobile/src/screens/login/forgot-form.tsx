import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

export interface ForgotFormProps {
  email: string;
  onEmailChange: (v: string) => void;
  loading: boolean;
  onSubmit: () => void;
  onBack: () => void;
}

export function ForgotForm({ email, onEmailChange, loading, onSubmit, onBack }: ForgotFormProps) {
  const theme = useTheme();

  return (
    <View style={styles.group}>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Reset your password</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          We&apos;ll email a reset link. It expires in 30 minutes.
        </Text>
      </View>
      <TextField label="Work email" value={email} onChangeText={onEmailChange} placeholder="sita@kazi.com.np" keyboardType="email-address" />
      <View style={styles.submitWrap}>
        <Button label="Send Reset Link" onPress={onSubmit} loading={loading} fullWidth />
      </View>
      <Button label="Back to sign in" variant="ghost" onPress={onBack} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 14,
  },
  heading: {
    gap: 6,
    paddingBottom: 2,
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 20,
    letterSpacing: -0.015 * 20,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 14 * 1.5,
  },
  submitWrap: {
    marginTop: 10,
  },
});

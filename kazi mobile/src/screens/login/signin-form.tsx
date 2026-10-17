import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';

export interface SigninFormProps {
  email: string;
  onEmailChange: (v: string) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  loading: boolean;
  error: string | null;
  onSubmit: () => void;
  onForgot: () => void;
}

export function SigninForm({ email, onEmailChange, password, onPasswordChange, loading, error, onSubmit, onForgot }: SigninFormProps) {
  const theme = useTheme();

  return (
    <View style={styles.group}>
      <TextField
        label="Work email"
        value={email}
        onChangeText={onEmailChange}
        placeholder="sita@kazi.com.np"
        keyboardType="email-address"
      />
      <TextField
        label="Password"
        labelRight={
          <Pressable onPress={onForgot} hitSlop={8}>
            <Text style={[styles.forgotLink, { color: theme.accentDeep }]}>Forgot password?</Text>
          </Pressable>
        }
        value={password}
        onChangeText={onPasswordChange}
        placeholder="••••••••"
        secureTextEntry
      />
      {error ? <Text style={[styles.error, { color: theme.dangerWashText }]}>{error}</Text> : null}
      <View style={styles.submitWrap}>
        <Button label="Sign In" onPress={onSubmit} loading={loading} fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 14,
  },
  forgotLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  error: {
    fontSize: 13,
  },
  submitWrap: {
    marginTop: 10,
  },
});

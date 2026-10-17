import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RiseIn } from '@/components/ui/rise-in';
import { useBackHandler } from '@/lib/use-back-handler';
import { useTheme } from '@/theme/theme-provider';

import { ForgotForm } from './forgot-form';
import { LogoBlock } from './logo-block';
import { SentConfirmation } from './sent-confirmation';
import { SigninForm } from './signin-form';
import { useLoginFlow } from './use-login-flow';

export function Login() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const flow = useLoginFlow();

  // Forgot-password and its confirmation are views on this one route; back
  // returns to the sign-in form rather than closing the app from under it.
  useBackHandler(() => {
    if (flow.view === 'signin') return false;
    flow.goSignin();
    return true;
  });

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: theme.background }]} behavior="padding">
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.column}>
          <LogoBlock />

          <RiseIn viewKey={flow.view}>
            {flow.view === 'signin' ? (
              <SigninForm
                email={flow.email}
                onEmailChange={flow.setEmail}
                password={flow.password}
                onPasswordChange={flow.setPassword}
                loading={flow.loading}
                error={flow.error}
                onSubmit={flow.submitSignin}
                onForgot={flow.goForgot}
              />
            ) : flow.view === 'forgot' ? (
              <ForgotForm
                email={flow.email}
                onEmailChange={flow.setEmail}
                loading={flow.loading}
                onSubmit={flow.submitReset}
                onBack={flow.goSignin}
              />
            ) : (
              <SentConfirmation emailShown={flow.emailShown} onBack={flow.goSignin} onResend={flow.submitReset} />
            )}
          </RiseIn>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  column: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
});

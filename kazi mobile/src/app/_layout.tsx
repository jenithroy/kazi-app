import { LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import {
  SchibstedGrotesk_400Regular,
  SchibstedGrotesk_500Medium,
  SchibstedGrotesk_600SemiBold,
  SchibstedGrotesk_700Bold,
} from '@expo-google-fonts/schibsted-grotesk';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/auth/auth-context';
import { ToastProvider } from '@/components/toast/toast-provider';
import { NotificationsProvider } from '@/data/notifications/context';
import '@/data/push/handler';
import { usePushRegistration } from '@/data/push/use-push-registration';
import { usePushResponseListener } from '@/data/push/use-push-response-listener';
import { isLeadsBotConfigured, useLeadNotificationWatcher } from '@/data/leads/hooks';
import { AccountInactive } from '@/screens/account/account-inactive';
import { queryClient } from '@/data/client';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useActivityLog } from '@/lib/supabase/use-activity-log';
import { CurrencyProvider } from '@/lib/currency-context';
import { ThemeProvider, useTheme } from '@/theme/theme-provider';

SplashScreen.preventAutoHideAsync();

if (__DEV__) {
  /**
   * Keep LogBox's toasts off the screen.
   *
   * The yellow warning and red error cards sit on top of the app in the exact
   * corner the tab bar and the floating actions live in, so a single noisy
   * dependency makes whole screens untappable while it is being looked at.
   * Nothing is silenced, only un-drawn: every one of these is still printed to
   * the Metro terminal and to the debugger console, which is where a warning
   * can actually be read next to its stack. Flip this to `false` when you want
   * them back on the device.
   *
   * Dev-only either way — LogBox does not exist in a release build.
   *
   * A *fatal* error still takes over the screen. That one is not noise: the
   * alternative is a white screen with no explanation, and it means the app has
   * already stopped running rather than merely complained.
   */
  const HIDE_LOGBOX_TOASTS = true;
  LogBox.ignoreAllLogs(HIDE_LOGBOX_TOASTS);

  // Boot diagnostic: if this logs `false`, the `.env` was not picked up —
  // restart Metro with `npx expo start --clear`. When `true`, watch for
  // `[supabase] <module>: live read OK` / `... live read FAILED` lines.
  console.log('[supabase] isSupabaseConfigured =', isSupabaseConfigured);
}

function RootNavigator() {
  const { session, profile, isLoading, messengerTab } = useAuth();
  const theme = useTheme();
  usePushRegistration();
  usePushResponseListener();
  useLeadNotificationWatcher(!!session && isLeadsBotConfigured && messengerTab('leads'));
  useActivityLog(profile?.personId ?? null);

  // Follows the *resolved* theme rather than the OS: an explicit Light/Dark
  // choice in Settings can disagree with the phone, and `userInterfaceStyle:
  // "automatic"` alone would then leave dark clock glyphs on a dark bar.
  const statusBar = <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />;

  if (isLoading) return statusBar;

  // A signed-in user whose employee record was deactivated gets a dead end,
  // not the app (reference assigns them the `inactive` role).
  if (session && profile?.status === 'Inactive') {
    return (
      <>
        {statusBar}
        <AccountInactive />
      </>
    );
  }

  return (
    <>
      {statusBar}
      {/* Signing in and out swaps the whole app, so it cross-fades rather than
          pushing — there is no spatial relationship between the two halves. */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          animation: 'fade',
          animationDuration: 260,
        }}
      >
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SchibstedGrotesk_400Regular,
    SchibstedGrotesk_500Medium,
    SchibstedGrotesk_600SemiBold,
    SchibstedGrotesk_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  // A font that cannot be fetched must not hold the splash screen for ever —
  // the app renders in the system face instead.
  const fontsSettled = fontsLoaded || !!fontError;

  useEffect(() => {
    if (fontError) console.warn('[fonts] a font asset failed to load — continuing without it', fontError);
  }, [fontError]);

  useEffect(() => {
    if (fontsSettled) SplashScreen.hideAsync();
  }, [fontsSettled]);

  if (!fontsSettled) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <CurrencyProvider>
              <AuthProvider>
                <NotificationsProvider>
                  <ToastProvider>
                    <RootNavigator />
                  </ToastProvider>
                </NotificationsProvider>
              </AuthProvider>
            </CurrencyProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

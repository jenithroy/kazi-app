import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useRootNavigationState } from 'expo-router';

import { useAuth } from '@/auth/auth-context';

import { registerForPushNotifications } from './register-token';

/**
 * Registers this device's Expo push token for the signed-in person. Keyed on
 * `personId` alone, not the whole `session` object — unlike AuthProvider's
 * actor/chat-identity syncs, this does real I/O (a permission prompt, a
 * network round trip to Expo, an RPC call), so a background session refresh
 * must not re-trigger it.
 *
 * Also gated on the router being mounted, plus a short delay: firing
 * `requestPermissionsAsync()` immediately on sign-in races the (auth) →
 * (app) fade transition (`animationDuration: 260` in `_layout.tsx`) — Android
 * can silently no-op a permission request made while the Activity isn't
 * fully resumed yet (no error, no dialog, nothing). Waiting for the router
 * to settle and giving the transition a beat to finish avoids that.
 */
export function usePushRegistration(): void {
  const personId = useAuth().profile?.personId;
  const routerReady = !!useRootNavigationState()?.key;
  const personIdRef = useRef(personId);
  personIdRef.current = personId;

  useEffect(() => {
    if (!personId || !routerReady) return;
    const timer = setTimeout(() => {
      void registerForPushNotifications();
    }, 600);
    return () => clearTimeout(timer);
  }, [personId, routerReady]);

  // A permission granted through system Settings — rather than the in-app
  // dialog, which Android will only ever show once a person has made an
  // explicit choice about it — never tells this app it happened. Re-checking
  // whenever the app returns to the foreground is what actually notices the
  // change and finishes registering a token. registerForPushNotifications()
  // is cheap to re-run when nothing changed (an early return on the first
  // still-not-granted check, no network calls made).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && personIdRef.current) {
        void registerForPushNotifications();
      }
    });
    return () => sub.remove();
  }, []);
}

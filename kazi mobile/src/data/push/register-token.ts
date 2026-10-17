/**
 * Permission + Expo push token registration for the signed-in person.
 * Mirrors notify()'s contract: never throws, warns and drops on failure, and
 * no-ops when Supabase isn't configured.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

import { ensureAndroidChannel, ensureChatReplyCategory } from './channel';

export async function registerForPushNotifications(): Promise<void> {
  if (Platform.OS === 'web') return; // not in scope this pass

  try {
    await ensureAndroidChannel();
    await ensureChatReplyCategory();
    if (!isSupabaseConfigured) {
      console.log('[push] Supabase not configured — skipping registration');
      return;
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    console.log('[push] permission status before request:', status);
    // Android's permission API cannot reliably distinguish "never asked" from
    // "permanently denied" before the first real request — on this project
    // getPermissionsAsync() has been observed reporting 'denied' even on a
    // genuinely fresh install that has never once been asked, so gating the
    // request on status === 'undetermined' meant the dialog would never fire
    // at all. Requesting whenever we're not already granted is safe either
    // way: if the user really has permanently denied it, Android itself
    // no-ops the call (no repeat dialog, no spam).
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      }));
      console.log('[push] permission status after request:', status);
    }
    if (status !== 'granted') {
      console.log('[push] permission not granted — stopping', status);
      return;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn('[push] no eas.projectId in app.json — cannot mint an Expo push token');
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('[push] minted token:', token);
    if (!token) return;

    const { error } = await getSupabase().rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS,
    });
    if (error) throw error;
    console.log('[push] token registered with backend');
  } catch (err) {
    console.warn('[push] registration failed — dropped', err);
  }
}

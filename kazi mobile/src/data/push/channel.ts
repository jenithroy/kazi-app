import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const DEFAULT_CHANNEL_ID = 'default';

/** Matches the categoryId the `mobile_notifications_push` trigger attaches to a chat notification (0119). */
export const CHAT_REPLY_CATEGORY_ID = 'chat-reply';
export const CHAT_REPLY_ACTION_ID = 'reply';

/**
 * Android requires a channel to exist before a notification can show with
 * correct importance/sound. Runs unconditionally on every app start,
 * independent of permission or sign-in state — Android 12 and below have no
 * runtime permission at all, yet still need this channel to exist.
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: 'General',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });
}

/**
 * Registers the quick-reply action a chat push notification can carry
 * (categoryId 'chat-reply', set server-side by 0119 whenever there's a
 * thread to reply to). Cross-platform, unlike the Android channel above —
 * runs unconditionally alongside it for the same reason.
 */
export async function ensureChatReplyCategory(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(CHAT_REPLY_CATEGORY_ID, [
    {
      identifier: CHAT_REPLY_ACTION_ID,
      buttonTitle: 'Reply',
      textInput: { submitButtonTitle: 'Send', placeholder: 'Message…' },
      options: { opensAppToForeground: false },
    },
  ]);
}

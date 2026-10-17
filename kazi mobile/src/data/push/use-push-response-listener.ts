import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useRootNavigationState } from 'expo-router';

import { markOneRead } from '@/data/notifications/supabase';
import { openNotificationLink } from '@/data/notifications/open-notification';
import { sendMessage } from '@/data/chat/api';

import { CHAT_REPLY_ACTION_ID } from './channel';

/** '/chat?thread=<id>' → '<id>' — the shape 0118's trigger writes. Anything else is null. */
function threadIdFromDeepLink(deepLink: string | undefined): string | null {
  if (!deepLink) return null;
  const [path, query] = deepLink.split('?');
  if (path !== '/chat' || !query) return null;
  return new URLSearchParams(query).get('thread');
}

function handle(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data as { deepLink?: string; id?: string } | undefined;
  if (data?.id) void markOneRead(data.id);

  // The quick-reply action (channel.ts's 'chat-reply' category, only ever
  // attached to a chat notification — see 0119) — send straight from here
  // instead of opening the link. opensAppToForeground: false means this can
  // fire without the app ever coming to the front.
  if (response.actionIdentifier === CHAT_REPLY_ACTION_ID) {
    const threadId = threadIdFromDeepLink(data?.deepLink);
    const text = response.userText?.trim();
    if (threadId && text) {
      void sendMessage(threadId, text).catch((err) => console.warn('[push] quick reply failed', err));
    }
    return;
  }

  openNotificationLink(data?.deepLink);
}

/**
 * Tap-through for OS push notifications — the system-tray equivalent of
 * notifications.tsx's onPressRow. Covers a warm/backgrounded tap (the
 * listener) and a cold start where tapping the notification launched the
 * app (getLastNotificationResponseAsync, checked once the router is ready —
 * calling router.push before expo-router's navigator has mounted is a known
 * flaky failure mode for "deep link on cold start").
 */
export function usePushResponseListener(): void {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, []);

  const navState = useRootNavigationState();
  useEffect(() => {
    if (!navState?.key) return;
    // The root Stack resolving (auth) vs (app) is not the same moment the
    // (app) group's own tab navigator has finished mounting underneath it —
    // routerReady here can fire a beat before `/chat?thread=…` has anywhere
    // real to land, which is what a blank screen on a cold-start tap was.
    // Same fix, same reasoning as `use-push-registration.ts`'s 600ms wait.
    const timer = setTimeout(() => {
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (!response) return;
          handle(response);
        })
        .catch((err) => console.warn('[push] cold-start response check failed', err));
    }, 600);
    return () => clearTimeout(timer);
  }, [navState?.key]);
}

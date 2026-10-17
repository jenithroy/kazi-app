/**
 * Shared tap-through: follow a notification's deep link. Used by the in-app
 * Notifications screen (`onPressRow`) and by the OS push response listener,
 * so a system-tray tap and an in-app row tap navigate identically.
 */
import { router } from 'expo-router';

export function openNotificationLink(deepLink: string | null | undefined): void {
  if (deepLink) router.push(deepLink as never);
}

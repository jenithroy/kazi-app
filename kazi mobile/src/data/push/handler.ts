/**
 * Module-scope side effect (same timing idiom as `_layout.tsx`'s
 * `SplashScreen.preventAutoHideAsync()`) — must run before any notification
 * can arrive, so it's registered by importing this file for its effect, not
 * by calling a function from a component.
 */
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

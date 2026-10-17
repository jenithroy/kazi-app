import { Easing } from 'react-native';
import { Stack } from 'expo-router/js-stack';

import { useTheme } from '@/theme/theme-provider';
import { pushDuration } from '@/theme/motion';

/**
 * Everything that is not a tab scene pushes here — native-feeling slide from
 * the right, tab bar out of the way, chevron back.
 *
 * ## The `module/` routes
 *
 * Production, Inventory, Finance, Billing, Marketing and Tasks are each
 * somebody's bottom-bar tab, so they also live in `(tabs)`. Two routes,
 * one screen component, chosen by how you got there: the bar switches tabs, and
 * More (or a dashboard quick link) pushes `/module/<name>`. They cannot share a
 * path — a route group doesn't change the URL, so `(tabs)/production.tsx` has
 * already claimed `/production` — hence the prefix rather than a second file at
 * the same path.
 *
 * Before this, a More card for a module that was your own tab jumped to the tab
 * instead: no push, no animation, no chevron, and the bottom bar still there.
 * `useModulePresentation` now decides that from where the screen is drawn
 * rather than from whose tab it is, so the pushed copy gets the back chevron
 * and folds the bar away for everybody.
 *
 * ## Why the JS stack rather than the native one
 *
 * `expo-router`'s default `Stack` is `react-native-screens`' native stack,
 * where each screen is an Android fragment. A pop dispatched from JS — every
 * back in this app is one, because the chevron is our own `Pressable` calling
 * `router.back()` rather than a native header button — removes the route from
 * navigation state immediately, React unmounts its subtree, and Fabric deletes
 * those views while the fragment is still animating out. What slides away is an
 * empty shell: the screen you are leaving loses its content for the whole
 * length of the back animation.
 *
 * The JS stack has no such gap. It tracks `closingRouteKeys` and keeps a
 * popped route rendered until its animation finishes (see `CardStack`), so the
 * card that slides out is still the screen you were reading. Cards are plain
 * views in one hierarchy, which also means `animationDuration` is no longer an
 * iOS-only knob — the timing below applies on both platforms.
 */

// One spec for both directions: the design has a single easing curve, and a
// push that eases out on the way in and differently on the way back reads as
// two animations rather than one movement reversed. `Easing` here is React
// Native's, not Reanimated's — this drives `Animated`, which the JS stack uses.
const transitionSpec = {
  animation: 'timing',
  config: { duration: pushDuration, easing: Easing.out(Easing.cubic) },
} as const;

export default function AppLayout() {
  const theme = useTheme();
  return (
    <Stack
      // Cards stay in the view tree instead of being detached once they are
      // covered. Re-attaching one costs a layout pass before anything is
      // painted, and that lands in the middle of the back animation — the same
      // blank the tab navigator had (see `(tabs)/_layout.tsx`).
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        // The card background, so the slide never flashes white behind a
        // screen before its own background paints.
        cardStyle: { backgroundColor: theme.background },
        // Stated rather than left to `default`, which is the platform's own
        // choice and differs by Android version — a module pushed from More
        // should travel the same way on every device.
        animation: 'slide_from_right',
        // Overrides the preset's own timing. Android's stock push runs ~350ms,
        // and this is the transition sitting between tapping a More card and
        // reading the module, so it is the one people wait through most.
        transitionSpec: { open: transitionSpec, close: transitionSpec },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="account" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="sales" />
      <Stack.Screen name="customers" />
      <Stack.Screen name="purchases" />
      <Stack.Screen name="accounting" />
      <Stack.Screen name="budget-requirements" />
      <Stack.Screen name="employees-hr" />
      <Stack.Screen name="attendance" />
      <Stack.Screen name="admin-panel" />
      <Stack.Screen name="usage" />
      <Stack.Screen name="changelog" />
      <Stack.Screen name="bug-report" />
      {/* The pushed copies of the six modules that are also tabs. */}
      <Stack.Screen name="module/production" />
      <Stack.Screen name="module/inventory" />
      <Stack.Screen name="module/finance" />
      <Stack.Screen name="module/billing" />
      <Stack.Screen name="module/marketing" />
      <Stack.Screen name="module/tasks" />
      {/* Legacy path kept alive for deep links already stored in Postgres. */}
      <Stack.Screen name="order-management" />
    </Stack>
  );
}

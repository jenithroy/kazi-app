import { useCallback, useMemo } from 'react';
import { Tabs } from 'expo-router/js-tabs';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { CustomTabBar } from '@/components/tab-bar/custom-tab-bar';
import { TabBarVisibilityProvider } from '@/components/tab-bar/tab-bar-visibility';
import { useTheme } from '@/theme/theme-provider';

/**
 * Every screen that is somebody's tab is declared here — the bar itself picks
 * that person's five out of the list (see `auth/tab-layout.ts`). A screen with
 * no button for you is still routable: More and the dashboard cards link
 * straight to it, and because `(tabs)` is a route group the paths are unchanged
 * (`/production`, `/billing`, …). `/order-management` is kept as a redirect
 * for the deep links already written into old notification rows.
 *
 * The provider wraps the navigator so both the bar and the screens sit under
 * it: an open chat thread folds the bar away while it is on screen (see
 * `tab-bar-visibility.tsx`).
 *
 * ## Why tab switches don't animate
 *
 * They used to cross-fade with a small lean (`sceneStyleInterpolator` plus a
 * 220ms `transitionSpec`), and it was wrong on both counts.
 *
 * Visually: every tab screen wears the same header in the same place, so
 * fading one into another smeared two near-identical headers over each other
 * rather than reading as travel.
 *
 * Mechanically it was worse. The interpolator drove scene *opacity* off the
 * navigator's `progress` value, so a scene was only visible while `progress`
 * sat exactly at 0. Coming back to a tab — popping a pushed module off the
 * parent stack, or returning from a module that had folded the bar away —
 * could leave `progress` unsettled, and the scene stayed at opacity 0 with
 * nothing on screen: the whole of More, header included, blank for a beat.
 * That is expo/expo#39514, which the old comment here noted as a reason to
 * avoid the `shift` preset and then reproduced by hand.
 *
 * A tab bar is a set of root destinations with no spatial relationship, so the
 * honest transition is no transition — which is also what makes a press feel
 * instant. Motion in this app now lives where there IS travel: the push from
 * More into a module, and the `kazi-rise` entrances inside a screen.
 */
export default function TabsLayout() {
  const theme = useTheme();

  // Memoised because the visibility provider above re-renders this component
  // every time a screen folds the bar away or gives it back. Fresh option and
  // `tabBar` identities on each of those renders push new descriptors through
  // the navigator for no reason.
  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      sceneStyle: { backgroundColor: theme.background },
      // `animation` is left at its default of 'none' on purpose — see above.
    }),
    [theme.background],
  );

  const renderTabBar = useCallback((props: BottomTabBarProps) => <CustomTabBar {...props} />, []);

  return (
    <TabBarVisibilityProvider>
      <Tabs
        // Without this the tab router's default (`firstRoute`) sends every
        // system back press to the dashboard, from wherever you were — so a
        // module opened from More could only be left by leaving for `index`.
        // `history` makes back retrace the tabs actually visited, which is
        // what makes a module reached from More return *to* More.
        backBehavior="history"
        // Tab scenes stay in the view tree instead of being torn out of it.
        //
        // This defaults to `true` on Android, which makes every scene a native
        // fragment that is detached the moment it stops being the focused tab
        // and re-created when it comes back. Both halves of that show up as a
        // blank screen for exactly the length of a transition: the screen being
        // left loses its content while it is still on screen, and the one
        // arriving needs a layout pass before anything is drawn — which is why
        // More used to come back with its header missing for a beat.
        //
        // It is worse than a tab-to-tab problem, because this navigator is
        // nested *inside* a screen of the (app) stack. Pushing a module from
        // More removes the whole tabs fragment, and popping back re-creates
        // every child fragment it owns at once (react-navigation#12963), so the
        // blank showed up under the stack's slide as well.
        //
        // With detaching off, `ScreenContainer` and `Screen` fall back to plain
        // views toggled with `display: none` (see react-native-screens'
        // `ScreenContainer.tsx`): nothing is destroyed, nothing is re-laid-out,
        // and there is nothing left to blank. The cost is that every visited
        // tab keeps its native views alive — they were already mounted in JS,
        // and there are nine of them at most.
        detachInactiveScreens={false}
        screenOptions={screenOptions}
        tabBar={renderTabBar}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="tasks" />
        <Tabs.Screen name="inventory" />
        <Tabs.Screen name="finance" />
        <Tabs.Screen name="production" />
        <Tabs.Screen name="billing" />
        <Tabs.Screen name="marketing" />
        <Tabs.Screen name="more" />
      </Tabs>
    </TabBarVisibilityProvider>
  );
}

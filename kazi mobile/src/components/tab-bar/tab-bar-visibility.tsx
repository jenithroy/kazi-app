import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useIsFocused } from 'expo-router';

/**
 * Lets a screen inside `(tabs)` fold the bottom bar away while it is showing
 * something the bar would be in the way of.
 *
 * The one caller today is an open chat thread. The composer is pinned to the
 * bottom of the screen, so with the bar still there the input sits on a strip
 * of tab buttons — two competing bottom rows, and the keyboard then has to
 * push both. Every messenger drops its nav for the same reason: inside a
 * conversation, "back" is the only navigation that matters, and the thread
 * header already has it.
 *
 * A counter rather than a boolean: two screens could be mounted at once
 * during a transition, and the bar must stay hidden until the last of them
 * has gone.
 */
interface TabBarVisibility {
  hidden: boolean;
  hide: () => () => void;
}

const TabBarVisibilityContext = createContext<TabBarVisibility | null>(null);

export function TabBarVisibilityProvider({ children }: { children: ReactNode }) {
  const [hiders, setHiders] = useState(0);

  const hide = useCallback(() => {
    setHiders((n) => n + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setHiders((n) => Math.max(0, n - 1));
    };
  }, []);

  const value = useMemo(() => ({ hidden: hiders > 0, hide }), [hiders, hide]);
  return <TabBarVisibilityContext.Provider value={value}>{children}</TabBarVisibilityContext.Provider>;
}

/** Read by `CustomTabBar`. Outside the provider — a screen pushed as its own route — the bar is simply never hidden. */
export function useTabBarHidden(): boolean {
  return useContext(TabBarVisibilityContext)?.hidden ?? false;
}

/**
 * Is this component being drawn *inside* the tab navigator?
 *
 * The provider wraps `<Tabs>` and nothing else, so its presence is an exact
 * answer to "am I a tab scene or a pushed screen" — which is what a module
 * with both presentations actually needs to know. Asking whether the module is
 * one of your bottom-bar buttons is a different question, and answering the
 * first with the second is what used to make Production open without a back
 * chevron when it was reached from More.
 */
export function useInTabs(): boolean {
  return useContext(TabBarVisibilityContext) !== null;
}

/**
 * Hide the bar for as long as this component is mounted, or while `active`.
 * Releases on unmount, so a back gesture mid-animation cannot leave the bar
 * folded away.
 *
 * Also released the moment the screen loses focus. Tab screens stay mounted
 * once visited, so an open chat thread left behind on the Chat tab used to go
 * on hiding the bar from every other tab — you would land on the dashboard
 * with no bar at all and nothing to press. Whoever is on screen now decides.
 */
export function useHideTabBar(active = true): void {
  const ctx = useContext(TabBarVisibilityContext);
  const hide = ctx?.hide;
  const isFocused = useIsFocused();
  const on = active && isFocused;

  useEffect(() => {
    if (!on || !hide) return;
    return hide();
  }, [on, hide]);
}

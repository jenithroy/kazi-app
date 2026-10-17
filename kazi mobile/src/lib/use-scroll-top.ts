import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import type { FlatList, ScrollView } from 'react-native';

/** Anything with a vertical offset we can reset — a ScrollView or a list. */
type Scrollable = ScrollView | FlatList<unknown>;

/**
 * Puts a screen's main scroll view back at the top whenever you arrive at it,
 * and whenever it swaps to another tab of its own.
 *
 * Both halves are needed because nothing in this app unmounts when you leave
 * it. Tab scenes are kept in the view tree on purpose (`detachInactiveScreens`
 * is off in `(tabs)/_layout.tsx`, so that leaving and returning to a tab
 * doesn't blank it), which also means each one keeps the scroll offset it had
 * the last time you were there — you would come back to Finance halfway down a
 * ledger you had stopped reading ten minutes ago. In-screen tabs are the same
 * problem one level down: Finance, Inventory, Attendance and the rest swap the
 * tab body inside a *single* ScrollView, so moving from a long tab to a short
 * one left the offset where the long one had it and the new tab opened part-
 * way down, or blank past its end.
 *
 * The reset is fired twice, on blur and on focus, and neither is redundant:
 *
 * - **Blur** is the one that normally does the work, and it is the one that
 *   looks right — the screen is on its way out, so nothing is seen to move.
 * - **Focus** is the safety net. A blurring tab scene is switched to
 *   `display: none` at about the moment the listener runs, and a scroll
 *   command to a hidden native view is not reliably applied. If it was
 *   dropped, this catches it; if it wasn't, this is a no-op on an offset that
 *   is already 0.
 *
 * `animated: false` throughout — this is not a "back to top" button, it is the
 * screen's starting state, and it should never be seen travelling there.
 *
 * ```tsx
 * const scrollRef = useScrollTop(tab); // resets on arrival and on tab change
 * <ScrollView ref={scrollRef}>…</ScrollView>
 * ```
 */
export function useScrollTop<T extends Scrollable = ScrollView>(resetKey?: string | number | null) {
  const ref = useRef<T | null>(null);

  const toTop = useCallback(() => {
    // Structural check rather than a type test: FlatList/FlashList expose
    // `scrollToOffset`, ScrollView `scrollTo`, and a screen can hold either.
    const node = ref.current as unknown as {
      scrollToOffset?: (o: { offset: number; animated?: boolean }) => void;
      scrollTo?: (o: { y: number; animated?: boolean }) => void;
    } | null;
    if (!node) return;
    if (typeof node.scrollToOffset === 'function') node.scrollToOffset({ offset: 0, animated: false });
    else node.scrollTo?.({ y: 0, animated: false });
  }, []);

  useFocusEffect(
    useCallback(() => {
      toTop();
      return toTop;
    }, [toTop]),
  );

  // Also runs on mount, where it is a no-op on a fresh scroll view.
  useEffect(() => {
    toTop();
  }, [resetKey, toTop]);

  return ref;
}

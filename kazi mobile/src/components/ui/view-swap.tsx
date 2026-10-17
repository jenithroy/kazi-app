import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { distance, duration, easeOut } from '@/theme/motion';

export interface ViewSwapProps {
  /**
   * Identifies the view on screen. Changing it replays the transition; the
   * order of the values decides which way the content travels.
   */
  viewKey: string;
  /**
   * The views this screen can show, outermost first — `['list', 'detail']`.
   * Moving later in the list reads as going deeper (content enters from the
   * right); moving earlier reads as coming back (enters from the left).
   */
  order?: readonly string[];
  /** Applied to the animated container, which stands in for the screen's root view. */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * The transition for a screen that swaps its whole body in place — a list
 * giving way to a detail view, a form, a report.
 *
 * Several modules do this without ever pushing a route (chat's thread, a
 * customer's record, an invoice), so the navigator's own animation never runs
 * and the change lands as a hard cut. This restores the missing half: the
 * `kazi-rise` fade, plus a horizontal lean that says whether you went deeper or
 * came back, which is the part a cut loses entirely.
 *
 * Only the arriving view is animated. Cross-fading the outgoing one as well
 * would mean keeping two potentially heavy subtrees mounted at once, and the
 * screens this wraps are the expensive ones.
 */
export function ViewSwap({ viewKey, order, style: containerStyle, children }: ViewSwapProps) {
  const progress = useSharedValue(1);
  const offset = useSharedValue(0);
  const previous = useRef(viewKey);

  // `useLayoutEffect`, not `useEffect`: the incoming view renders with the
  // progress the *outgoing* one finished on, so resetting it after paint shows
  // the new content in full for a frame before it blinks out and fades back
  // in. This runs before that frame reaches the screen.
  useLayoutEffect(() => {
    if (previous.current === viewKey) return;

    const from = order?.indexOf(previous.current) ?? -1;
    const to = order?.indexOf(viewKey) ?? -1;
    // Unknown views (or no `order`) get a straight rise with no lean, which is
    // the honest reading when there's no depth relationship to express.
    const backwards = from >= 0 && to >= 0 && to < from;
    previous.current = viewKey;

    offset.value = from >= 0 && to >= 0 ? (backwards ? -distance.push : distance.push) : 0;
    progress.value = 0;
    progress.value = withTiming(1, { duration: duration.base, easing: easeOut });
  }, [viewKey, order, progress, offset]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateX: (1 - progress.value) * offset.value },
      { translateY: (1 - progress.value) * distance.rise },
    ],
  }));

  return <Animated.View style={[styles.flex, containerStyle, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  // The screens this wraps own their own layout; the wrapper must not become a
  // height-collapsing box between them and their scroll view.
  flex: { flex: 1 },
});

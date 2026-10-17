import { useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export interface RiseInProps {
  /** Changing this replays the animation — e.g. a view/state key. */
  viewKey: string | number;
  distance?: number;
  duration?: number;
  children: ReactNode;
}

/** The design's `kazi-rise` keyframe: fade in + slide up a few px, ease-out-cubic. Replays whenever `viewKey` changes. */
export function RiseIn({ viewKey, distance = 6, duration = 260, children }: RiseInProps) {
  const progress = useSharedValue(0);

  // Before paint rather than after it: on a `viewKey` change the new children
  // are laid out with the value the last run ended on (1), so resetting in a
  // passive effect flashes them at full opacity for one frame first.
  useLayoutEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) });
  }, [viewKey, duration, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

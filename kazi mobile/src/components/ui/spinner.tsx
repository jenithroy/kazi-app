import { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

export interface SpinnerProps {
  size?: number;
  color: string;
  trackColor?: string;
  thickness?: number;
}

/** Continuous 700ms linear rotation — matches every loading spinner in the design (kazi-spin keyframe). */
export function Spinner({ size = 17, color, trackColor = 'rgba(255,255,255,0.3)', thickness = 2 }: SpinnerProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 700, easing: Easing.linear }), -1);
  }, [rotation]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: thickness,
          borderColor: trackColor,
          borderTopColor: color,
        },
        style,
      ]}
    />
  );
}

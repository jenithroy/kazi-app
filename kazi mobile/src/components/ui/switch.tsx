import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/theme-provider';

export interface SwitchProps {
  value: boolean;
  onValueChange: () => void;
}

const TRACK_WIDTH = 48;
const TRACK_HEIGHT = 28;
const KNOB_SIZE = 22;
const TRAVEL = TRACK_WIDTH - TRACK_HEIGHT + (TRACK_HEIGHT - KNOB_SIZE) - 3; // 20px, matches the design's 48x28 track / 22px knob

export function Switch({ value, onValueChange }: SwitchProps) {
  const theme = useTheme();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 180 });
  }, [value, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [theme.border, theme.accent]),
  }));

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * TRAVEL }],
  }));

  return (
    <Pressable onPress={onValueChange} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.knob, knobStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: 99,
    padding: 3,
    justifyContent: 'center',
  },
  knob: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: 99,
    backgroundColor: '#FFFFFF',
    boxShadow: '0 2px 5px rgba(15,36,29,0.25)',
  },
});

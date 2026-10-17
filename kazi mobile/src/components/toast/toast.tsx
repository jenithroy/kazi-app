import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

export type ToastTone = 'ok' | 'warn' | 'bad';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastProps {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
  bottomOffset?: number;
}

export function Toast({ message, tone = 'ok', action, bottomOffset = 0 }: ToastProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const dotColor = tone === 'ok' ? theme.onDark.accent : tone === 'warn' ? theme.onDark.warningWashText : theme.onDark.dangerWashText;

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(180)}
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 16 + bottomOffset }]}
    >
      <View style={[styles.pill, { backgroundColor: theme.surfaceInverted, boxShadow: theme.shadows.floating }]}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={[styles.message, { color: theme.onDark.text }]} numberOfLines={2}>
          {message}
        </Text>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={8}>
            <Text style={[styles.action, { color: theme.onDark.accent }]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 15,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  message: {
    flex: 1,
    fontSize: 13.5,
  },
  action: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
  },
});

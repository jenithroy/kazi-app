import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  /** `danger` for anything that takes access away. */
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The `window.confirm` the web page leans on, as the app's own compact confirm
 * card — same shape as Customers' delete confirmation.
 */
export function ConfirmSheet({ visible, title, body, confirmLabel, tone = 'danger', busy = false, onCancel, onConfirm }: ConfirmSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  // Mounting is adjusted during render rather than from the effect: by the time
  // an effect ran the sheet would already have missed a frame of its entrance.
  // Unmounting is the opposite — it waits for the exit animation's callback.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      progress.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
    } else if (mounted) {
      progress.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: (1 - progress.value) * 22 }] }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onCancel} statusBarTranslucent>
      <View style={[styles.root, { padding: 16, paddingBottom: Math.max(16, insets.bottom) }]}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onCancel} />
        </Animated.View>

        <Animated.View style={[cardStyle, styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.floating }]}>
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
            <Text style={[styles.body, { color: theme.textSecondary }]}>{body}</Text>
          </View>
          <View style={styles.buttonRow}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} style={styles.flex1} />
            <Button
              label={confirmLabel}
              variant={tone === 'danger' ? 'danger' : 'primary'}
              loading={busy}
              onPress={onConfirm}
              style={styles.flex1}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(13,31,25,0.42)' },
  card: { borderRadius: 22, padding: 20, gap: 14 },
  textWrap: { gap: 6 },
  title: { fontFamily: fontFamily.semibold, fontSize: 18, letterSpacing: -0.02 * 18 },
  body: { fontSize: 13.5, lineHeight: 13.5 * 1.5 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
});

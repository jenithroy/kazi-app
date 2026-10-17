import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii, type Theme } from '@/theme';
import { typePalette } from '@/data/changelog/parse';
import type { Commit } from '@/data/changelog/types';

export interface CommitDetailSheetProps {
  commit: Commit | null;
  onClose: () => void;
}

const OFF_SCREEN = 640;
/** Drag the header this far down, or flick it fast enough, and letting go closes the sheet instead of springing back. */
const DRAG_DISMISS_DISTANCE = 100;
const DRAG_DISMISS_VELOCITY = 800;

export function CommitDetailSheet({ commit, onClose }: CommitDetailSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(!!commit);
  const progress = useSharedValue(0);

  // Mounting is adjusted during render rather than from the effect: by the time
  // an effect ran the sheet would already have missed a frame of its entrance.
  // Unmounting is the opposite — it waits for the exit animation's callback.
  if (commit && !mounted) setMounted(true);

  useEffect(() => {
    if (commit) {
      progress.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    } else if (mounted) {
      progress.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit]);

  // `progress` is a Reanimated shared value, not React state — mutating it
  // outside the open/close effect above is the intended way to drive it from
  // a gesture. The hooks linter's static analysis doesn't model that (it
  // reasons about `.value` the way it reasons about `useState`), so it flags
  // this as if `progress` were immutable render state — see `BottomSheet`,
  // which this sheet's shape is otherwise a copy of.
  const springOpen = () => {
    'worklet';
    // eslint-disable-next-line react-hooks/immutability
    progress.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
  };

  // Swiping down from the header re-purposes `progress` directly, so the
  // backdrop fades and the sheet slides in lockstep with the finger, exactly
  // like the timed open/close does. Confined to the header: the content below
  // holds its own `ScrollView`, and a dismiss gesture spanning the whole sheet
  // would fight it for the same drag.
  const dragToDismiss = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetY(-10)
    .onUpdate((e) => {
      const draggedDown = Math.max(0, e.translationY);
      // eslint-disable-next-line react-hooks/immutability -- see `springOpen` above
      progress.value = 1 - Math.min(draggedDown / OFF_SCREEN, 1);
    })
    .onEnd((e) => {
      const draggedDown = Math.max(0, e.translationY);
      if (draggedDown > DRAG_DISMISS_DISTANCE || e.velocityY > DRAG_DISMISS_VELOCITY) {
        runOnJS(onClose)();
      } else {
        springOpen();
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * OFF_SCREEN }] }));

  if (!mounted || !commit) return null;

  const palette = typePalette(theme, commit.type);
  const dateLabel = new Date(commit.date).toLocaleString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* A RN `Modal` renders into its own view hierarchy, which the app-root
          `GestureHandlerRootView` doesn't reach — same fix `MediaViewer` and
          `BottomSheet` already needed for their own gestures. */}
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.root}>
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
          </Animated.View>

          <Animated.View style={[sheetStyle, styles.sheet, { backgroundColor: theme.surfaceRaised, paddingBottom: insets.bottom, boxShadow: theme.shadows.sheet }]}>
            <GestureDetector gesture={dragToDismiss}>
              <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <View style={styles.headerText}>
                  <View style={styles.headerTop}>
                    <View style={[styles.tag, { backgroundColor: palette.bg }]}>
                      <Text style={[styles.tagLabel, { color: palette.fg }]}>{commit.type}</Text>
                    </View>
                    {commit.scope ? <Text style={[styles.headerScope, { color: theme.textSecondary }]}>{commit.scope}</Text> : null}
                    <Text style={[styles.headerSha, { color: theme.textSecondary }]}>{commit.shortSha}</Text>
                  </View>
                  <Text style={[styles.title, { color: theme.textPrimary }]}>{commit.subject}</Text>
                </View>
                <Pressable onPress={onClose} style={[styles.closeButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Icon name="x" size={16} color={theme.textPrimary} />
                </Pressable>
              </View>
            </GestureDetector>

            <ScrollView contentContainerStyle={styles.content}>
              {commit.body ? (
                <View style={[styles.bodyCard, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.bodyText, { color: theme.textPrimary }]}>{commit.body}</Text>
                </View>
              ) : null}

              <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <InfoRow label="Author" value={commit.authorName} theme={theme} />
                {commit.authorLogin ? <InfoRow label="GitHub" value={`@${commit.authorLogin}`} theme={theme} /> : null}
                <InfoRow label="Date" value={dateLabel} theme={theme} />
                <InfoRow label="SHA" value={commit.shortSha} theme={theme} mono />
              </View>
            </ScrollView>

            <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
              <Button label="Close" variant="secondary" onPress={onClose} style={styles.closeFooterButton} />
              <Button label="View on GitHub" variant="primary" onPress={() => Linking.openURL(commit.url)} style={styles.openButton} />
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function InfoRow({ label, value, theme, mono }: { label: string; value: string; theme: Theme; mono?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[mono ? styles.infoValueMono : styles.infoValue, { color: theme.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1 },
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(10,21,18,0.42)' },
  sheet: { borderTopLeftRadius: radii.xl + 4, borderTopRightRadius: radii.xl + 4, overflow: 'hidden', maxHeight: '86%' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerText: { flex: 1, gap: 7, minWidth: 0 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { height: 22, paddingHorizontal: 9, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  tagLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.11 * 9.5, textTransform: 'uppercase' },
  headerScope: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  headerSha: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  title: { fontFamily: fontFamily.semibold, fontSize: 18, letterSpacing: -0.02 * 18, lineHeight: 18 * 1.25 },
  closeButton: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 12 },
  bodyCard: { borderRadius: radii.lg, padding: 16, boxShadow: '0 1px 2px rgba(15,36,29,0.04)' },
  bodyText: { fontFamily: fontFamily.mono, fontSize: 12.5, lineHeight: 12.5 * 1.6 },
  infoCard: { borderRadius: radii.lg, borderWidth: 1, padding: 14, gap: 9 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoLabel: { flex: 1, fontSize: 13 },
  infoValue: { fontSize: 13 },
  infoValueMono: { fontFamily: fontFamily.mono, fontSize: 12.5 },
  footer: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20, flexDirection: 'row', gap: 9, borderTopWidth: StyleSheet.hairlineWidth },
  closeFooterButton: { flex: 1 },
  openButton: { flex: 1.25 },
});

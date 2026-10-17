import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, radii } from '@/theme';
import { useKeyboardInset } from '@/lib/use-keyboard-inset';

import { Icon } from './icon';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxHeight?: number;
  /**
   * Called before every dismissal — the backdrop, the X and the Android back
   * button alike. Return `true` to swallow it and hold the sheet open, which
   * is how an editor with unsaved changes refuses to be walked away from.
   *
   * A blocked close also scrolls the content to the bottom, because whatever
   * blocked it is conventionally pinned there: refusing to close while the
   * explanation sits off-screen is just a sheet that looks broken.
   */
  blockClose?: () => boolean;
  /** Shown in the sticky header beside the title — e.g. an "unsaved" pill. */
  headerAccessory?: ReactNode;
  /** Hands the content ScrollView back, so the caller can scroll it too. */
  scrollRef?: RefObject<ScrollView | null>;
  /**
   * Freezes the sheet's own scrolling. A sheet that puts a *scrolling* control
   * inside itself — the emoji grid — otherwise has two vertical scroll views
   * competing for one drag, and the outer one wins: the grid looks scrollable
   * and refuses to move. Turning this off while such a control is open leaves
   * exactly one thing responding to the gesture.
   */
  scrollEnabled?: boolean;
  /**
   * Pinned over the content, clear of the scroll — a floating primary action.
   * Laid out in the sheet's bottom-right, above the safe-area inset.
   */
  overlay?: ReactNode;
}

const OFF_SCREEN = 640;
/** Drag the grabber/header this far down, or flick it fast enough, and letting go closes the sheet instead of springing back. */
const DRAG_DISMISS_DISTANCE = 100;
const DRAG_DISMISS_VELOCITY = 800;

/** Backdrop fade + sheet slide-up (`kazi-sheet`), driven manually so the exit animation plays before the Modal unmounts. */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  maxHeight = 660,
  blockClose,
  headerAccessory,
  scrollRef,
  scrollEnabled = true,
  overlay,
}: BottomSheetProps) {
  const theme = useTheme();
  const ownScrollRef = useRef<ScrollView | null>(null);
  const scroll = scrollRef ?? ownScrollRef;
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  // Not `KeyboardAvoidingView`: Android has been edge-to-edge since SDK 54 and
  // the window is never resized when the keyboard opens, so it has nothing to
  // react to. `0` rather than `insets.bottom` — the sheet's own safe-area
  // padding below already covers the keyboard-closed rest state; this only
  // needs to add the keyboard's own height on top of that. See `use-keyboard-inset.ts`.
  const keyboardStyle = useKeyboardInset(0);

  // Mounting is adjusted during render rather than from the effect: by the time
  // an effect ran the sheet would already have missed a frame of its entrance.
  // Unmounting is the opposite — it waits for the exit animation's callback.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      progress.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    } else if (mounted) {
      progress.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  /** Returns whether it actually closed — the drag gesture below needs to know, to spring back a swipe that a dirty draft refused. */
  const requestClose = () => {
    if (blockClose?.()) {
      scroll.current?.scrollToEnd({ animated: true });
      return false;
    }
    onClose();
    return true;
  };

  // `progress` is a Reanimated shared value, not React state — mutating it
  // outside the open/close effect above is the intended way to drive it from
  // a gesture, exactly like the swipe-to-reveal row and the media viewer's
  // pinch/pan already do. The hooks linter's static analysis doesn't model
  // that (it reasons about `.value` the way it reasons about `useState`), so
  // it flags every one of these as if `progress` were immutable render state.
  const springOpen = () => {
    'worklet';
    // eslint-disable-next-line react-hooks/immutability
    progress.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
  };

  const handleDragEnd = () => {
    if (!requestClose()) springOpen();
  };

  // Swiping down from the header/grabber re-purposes `progress` directly, so
  // the backdrop fades and the sheet slides in lockstep with the finger exactly
  // like the timed open/close does — dragged past the threshold (distance or a
  // fast-enough flick) hands off to `requestClose`; anything short of that
  // springs back open. Confined to the header: the content below can hold its
  // own `ScrollView`, and a dismiss gesture spanning the whole sheet would
  // fight it for the same drag the way two nested scroll views already do
  // (see `scrollEnabled` above).
  const dragToDismiss = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetY(-10)
    .onUpdate((e) => {
      const draggedDown = Math.max(0, e.translationY);
      // eslint-disable-next-line react-hooks/immutability -- see `springOpen` above
      progress.value = 1 - Math.min(draggedDown / OFF_SCREEN, 1);
    })
    // `requestClose`, reachable through `handleDragEnd`, reads `scroll.current`
    // to reveal a blocked close — a ref read, but only ever from this real
    // gesture-end callback, never during render; the linter can't see that
    // gesture-handler defers this rather than invoking it while building the
    // gesture below.
    // eslint-disable-next-line react-hooks/refs
    .onEnd((e) => {
      const draggedDown = Math.max(0, e.translationY);
      if (draggedDown > DRAG_DISMISS_DISTANCE || e.velocityY > DRAG_DISMISS_VELOCITY) {
        runOnJS(handleDragEnd)();
      } else {
        springOpen();
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * OFF_SCREEN }] }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={requestClose} statusBarTranslucent>
      {/* A RN `Modal` renders into its own view hierarchy, which the app-root
          `GestureHandlerRootView` doesn't reach — same fix `MediaViewer` already
          needed for its own gestures. */}
      <GestureHandlerRootView style={styles.gestureRoot}>
        {/* A form's own fields are the whole reason someone opens a sheet, so
            the keyboard has to push the sheet up rather than bury them under
            it — `keyboardStyle` pads this container by the keyboard's height. */}
        <Animated.View style={[styles.root, keyboardStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={requestClose} />
          </Animated.View>

          <Animated.View
            style={[
              sheetStyle,
              styles.sheet,
              { maxHeight, backgroundColor: theme.surfaceRaised, paddingBottom: insets.bottom, boxShadow: theme.shadows.sheet },
            ]}
          >
            <GestureDetector gesture={dragToDismiss}>
              <View style={[styles.header, { backgroundColor: theme.surfaceRaised, borderBottomColor: theme.border }]}>
                <View style={[styles.grabber, { backgroundColor: theme.border }]} />
                <View style={styles.headerRow}>
                  <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
                    {title}
                  </Text>
                  {headerAccessory ? <View style={styles.headerAccessory}>{headerAccessory}</View> : null}
                  <Pressable
                    onPress={requestClose}
                    style={[styles.closeButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  >
                    <Icon name="x" size={16} color={theme.textPrimary} />
                  </Pressable>
                </View>
              </View>
            </GestureDetector>
            <ScrollView
              ref={scroll}
              scrollEnabled={scrollEnabled}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
            {overlay ? <View style={styles.overlay}>{overlay}</View> : null}
          </Animated.View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(10,21,18,0.42)',
  },
  sheet: {
    borderTopLeftRadius: radii.xl + 4,
    borderTopRightRadius: radii.xl + 4,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 99,
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAccessory: {
    flexShrink: 0,
  },
  // Takes the slack in the header row, so the close button is pinned to the
  // right edge whether or not an accessory sits between them.
  title: {
    flex: 1,
    minWidth: 0,
    fontFamily: fontFamily.semibold,
    fontSize: 18,
    letterSpacing: -0.015 * 18,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 26,
    gap: 20,
  },
  // Sized to its content and anchored to the sheet's padding box, so it sits
  // above the safe-area inset and lets the content scroll past on either side
  // of it rather than blocking the whole width.
  overlay: {
    position: 'absolute',
    right: 22,
    bottom: 22,
    alignItems: 'flex-end',
  },
});

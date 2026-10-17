import { useEffect, useRef } from 'react';
import { Keyboard, Platform } from 'react-native';
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * How much room the keyboard is taking, as an animated bottom padding.
 *
 * `KeyboardAvoidingView` is the obvious answer and it does not work here.
 * Android has been edge-to-edge since SDK 54 and cannot be opted out of, and
 * an edge-to-edge window is not resized when the keyboard opens — so
 * `adjustResize` changes nothing, the view keeps its full height, and a
 * bottom-pinned composer stays exactly where it was: underneath the keyboard.
 * iOS never resizes the window either; `KeyboardAvoidingView` only papers over
 * that with `behavior="padding"`, and only when the view happens to reach the
 * bottom of the screen, which it does not while a tab bar is mounted.
 *
 * The keyboard *events* are reliable on both platforms, so this measures
 * instead of guessing. iOS gets `keyboardWillShow`, which fires with the
 * system's own duration before the keyboard moves, so the composer rides up
 * with it; Android only has `keyboardDidShow`, so it gets a short timing of
 * its own rather than snapping.
 *
 * `safeBottom` is the floor, not a discount. The inset resolves to
 * `max(safeBottom, keyboardHeight)`: with the keyboard down the view still
 * clears the home indicator, and with it up the keyboard already covers that
 * area so its own height is the whole requirement. Subtracting `safeBottom`
 * from the keyboard height — which is what this did before — leaves the
 * composer sitting exactly one home-indicator's worth of pixels too low, i.e.
 * partly behind the keys, which is precisely the gap it was meant to close.
 *
 * `onOpen` fires as the keyboard appears. Shrinking the view keeps the scroll
 * offset where it was, which quietly hides the newest messages behind the
 * composer — a list that wants to stay pinned to the bottom uses this to
 * follow.
 */
export function useKeyboardInset(safeBottom = 0, onOpen?: () => void) {
  const inset = useSharedValue(safeBottom);
  // Kept in a ref so a caller can pass an inline arrow without re-subscribing
  // the listeners on every render. Written from an effect, not during render.
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    const ios = Platform.OS === 'ios';

    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
      const height = Math.max(safeBottom, event.endCoordinates.height);
      inset.value = withTiming(height, {
        duration: event.duration || (ios ? 250 : 180),
        easing: Easing.out(Easing.quad),
      });
      onOpenRef.current?.();
    });

    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (event) => {
      inset.value = withTiming(safeBottom, {
        duration: event?.duration || (ios ? 250 : 180),
        easing: Easing.out(Easing.quad),
      });
    });

    // A safe-area inset that arrives late (it is 0 on the very first frame)
    // must move the resting value with it, or the composer keeps a stale floor.
    if (inset.value < safeBottom && !Keyboard.isVisible()) inset.value = safeBottom;

    return () => {
      show.remove();
      hide.remove();
    };
  }, [inset, safeBottom]);

  return useAnimatedStyle(() => ({ paddingBottom: inset.value }));
}

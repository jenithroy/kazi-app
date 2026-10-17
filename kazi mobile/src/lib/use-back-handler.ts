import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useIsFocused } from 'expo-router';

/**
 * Android's system back — the gesture and the button — while this screen is
 * focused.
 *
 * Most of this app's screens are one route holding several views: a list that
 * swaps to a detail, a hub with a strip of sub-tabs, a drill-down two levels
 * deep. All of that lives in `useState`, so the navigator knows nothing about
 * it, and a system back went straight past every one of those layers to
 * whatever sat behind the *route* — the dashboard, from any tab. Nothing on
 * screen changed the way the user asked; the app simply left.
 *
 * `handler` returns `true` when it consumed the press (it closed a layer) and
 * `false` to let the press fall through to the navigator, which is what should
 * happen once a screen is showing its own root view.
 *
 * Sheets don't need this. Every one of them is a `Modal`, and `Modal` takes
 * Android back itself through `onRequestClose` without the press ever reaching
 * these listeners — so a screen's handler only has to describe the views it
 * draws *itself*.
 *
 * Registration is gated on focus because listeners are global: without the
 * gate a background tab still holding an open detail would eat the back press
 * belonging to whatever the user is actually looking at.
 *
 * Register **once per screen**, and let that one handler describe the whole
 * stack of views the screen can be showing. React Native calls listeners
 * newest-first and React runs effects children-first, which means a parent
 * registers later and so is asked *before* its own children — the reverse of
 * what nesting two handlers would lead you to expect. Where the layers live in
 * a child component (Chat's open thread), put the single handler in the child
 * and give it the parent's exit callback.
 */
export function useBackHandler(handler: () => boolean): void {
  const isFocused = useIsFocused();
  const latest = useRef(handler);

  // Kept fresh every render, so the listener always closes over the current
  // state without having to be torn down and re-added on each keystroke.
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (!isFocused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => latest.current());
    return () => sub.remove();
  }, [isFocused]);
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import * as Expo from 'expo-haptics';

/**
 * Haptic feedback, and the one switch that turns it all off.
 *
 * The rule this module exists to enforce: a haptic **confirms something you
 * could not otherwise be sure of, or marks a threshold you crossed without
 * looking**. It never decorates a tap that already has a visible result. A
 * button that visibly depresses, a tab that visibly changes, a toast that
 * visibly appears — none of those get one. Buzzing on everything is how people
 * end up switching haptics off at the OS level, which costs you the handful
 * that genuinely carried information.
 *
 * What that leaves, and why each earns it:
 *
 *   `armed`      a swipe passed the point where letting go will act. You are
 *                watching your thumb, not a threshold.
 *   `pressed`    a long-press registered. Nothing is on screen yet to say so.
 *   `changed`    one of a rapid run of edits landed — roll call, eyes on the
 *                list rather than the row you just tapped.
 *   `committed`  something real happened in the world: a punch on the clock,
 *                a record deleted.
 *   `warned`     it worked, but not cleanly — clocked in late, with a cut.
 *   `refused`    it did not happen: off-site clock-in, a write the server
 *                rejected.
 *
 * Every call is fire-and-forget and swallows its own errors. Haptics are
 * unavailable on web, silently ignored on iOS in Low Power Mode, and vary in
 * quality across Android hardware — so nothing may call one as its *only*
 * feedback. Each of these sits alongside a toast, a state change or both.
 */

const KEY = 'kazi-haptics';

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

let enabled = true;
let touched = false;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setHapticsEnabled(next: boolean) {
  touched = true;
  void AsyncStorage.setItem(KEY, next ? 'on' : 'off');
  if (next === enabled) return;
  enabled = next;
  listeners.forEach((fn) => fn());
  // Confirm the switch with the thing the switch controls — turning it on with
  // no feedback leaves you unsure the setting took.
  if (next) void run(() => Expo.impactAsync(Expo.ImpactFeedbackStyle.Medium));
}

// Hydrated at module load, matching `calendar-preference.ts`: a module store
// rather than a context, so a gesture handler can reach it without a provider.
// `touched` guards the race where the switch is flipped before storage answers.
void AsyncStorage.getItem(KEY)
  .then((raw) => {
    if (touched || (raw !== 'on' && raw !== 'off')) return;
    const stored = raw === 'on';
    if (stored === enabled) return;
    enabled = stored;
    listeners.forEach((fn) => fn());
  })
  .catch(() => {});

export function useHapticsEnabled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => enabled,
    () => enabled,
  );
}

/** Never throws and never returns a rejected promise — a failed buzz is not an error worth handling. */
function run(fire: () => Promise<void>) {
  if (!enabled || !supported) return;
  try {
    void fire().catch(() => {});
  } catch {
    // Some Android devices have no vibrator at all.
  }
}

/** A swipe reached the point where releasing will act on it. */
export function armed() {
  run(() => Expo.selectionAsync());
}

/** A long-press registered, before anything has appeared to show it. */
export function pressed() {
  run(() => Expo.impactAsync(Expo.ImpactFeedbackStyle.Light));
}

/** One edit in a rapid sequence landed. */
export function changed() {
  run(() => Expo.selectionAsync());
}

/** Something real happened: a punch, a deletion. */
export function committed() {
  run(() => Expo.notificationAsync(Expo.NotificationFeedbackType.Success));
}

/** It worked, but with a consequence worth noticing. */
export function warned() {
  run(() => Expo.notificationAsync(Expo.NotificationFeedbackType.Warning));
}

/** It did not happen. */
export function refused() {
  run(() => Expo.notificationAsync(Expo.NotificationFeedbackType.Error));
}

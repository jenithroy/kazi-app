import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/** Which calendar dates are entered in. The stored value is always AD. */
export type DateCalendar = 'bs' | 'ad';

// Namespaced key, same shape as the other UI preferences.
const CALENDAR_KEY = 'kazi-date-calendar';

/**
 * One preference for the whole app, exactly as the reference's `DualDateInput`
 * behaves once you flip it: someone who works in Gregorian shouldn't have to
 * re-switch on every sheet — or, now that it persists, on every launch.
 *
 * A module-level store rather than a context, so no screen has to thread a
 * provider through to reach it. Settings exposes it as a real control; the
 * inline toggle on a date field still writes here and still sticks.
 */
let calendar: DateCalendar = 'bs';
let touched = false;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setCalendarPreference(next: DateCalendar) {
  touched = true;
  void AsyncStorage.setItem(CALENDAR_KEY, next);
  if (next === calendar) return;
  calendar = next;
  listeners.forEach((fn) => fn());
}

// Hydrated at module load rather than from a provider, to keep the store
// provider-free. `touched` guards the race where someone opens a date sheet
// and flips the toggle before storage answers — their choice wins.
void AsyncStorage.getItem(CALENDAR_KEY)
  .then((raw) => {
    if (touched) return;
    if (raw !== 'bs' && raw !== 'ad') return;
    if (raw === calendar) return;
    calendar = raw;
    listeners.forEach((fn) => fn());
  })
  .catch(() => {});

/** The current preference, for the pure formatters in `date-display.ts`. */
export function getCalendarPreference(): DateCalendar {
  return calendar;
}

export function useCalendarPreference(): DateCalendar {
  return useSyncExternalStore(
    subscribe,
    () => calendar,
    () => calendar,
  );
}

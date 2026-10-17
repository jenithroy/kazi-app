import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';

import { closeActivity, logActivity, sectionForPath, setCurrentPath } from './activity-log';

/**
 * Records which page somebody is on, and how long they actually spend there —
 * the mobile port of the reference app's `useActivityLog` hook. Mounted once,
 * in the root layout, so every signed-in screen is covered without a single
 * screen having to remember to call anything. Writes are logged separately,
 * from `lib/supabase/write.ts`, for the same reason.
 *
 * One deliberate simplification from the reference: on the web, "hands-on"
 * additionally requires a mouse/key/scroll/touch event within the last five
 * minutes, because a browser tab can sit open and focused while somebody is
 * at lunch. A phone has no such state — the OS itself locks or backgrounds the
 * app well before that becomes a real gap — so here "hands-on" is simply
 * "this screen is focused and the app is foregrounded" (`AppState === 'active'`).
 * Everything else — settle delay, periodic flush, not measuring a screen
 * passed through — matches the reference exactly.
 */

const SETTLE_MS = 800;
const TICK_MS = 15_000;
const FLUSH_EVERY_TICKS = 4;

export function useActivityLog(personId: string | null | undefined): void {
  const pathname = usePathname();
  const signedIn = useRef<string | null>(null);

  useEffect(() => {
    setCurrentPath(pathname);
  }, [pathname]);

  // One sign-in per person per app session (JS runtime) — the closest mobile
  // analogue of the reference's "once per browser tab".
  useEffect(() => {
    if (!personId) return;
    if (signedIn.current === personId) return;
    signedIn.current = personId;
    void logActivity({ action: 'sign_in', path: pathname });
  }, [personId, pathname]);

  useEffect(() => {
    if (!personId) return;

    const section = sectionForPath(pathname);
    if (!section) return; // a route we do not treat as a page

    let eventId: string | null = null;
    let finished = false;
    let activeMs = 0;
    let lastTick = Date.now();
    let ticks = 0;

    const isActive = () => AppState.currentState === 'active';

    /** Add the time since the last tick, if the app was actually in front of them. */
    const settle = () => {
      const now = Date.now();
      if (isActive()) activeMs += now - lastTick;
      lastTick = now;
    };

    const flush = () => {
      settle();
      if (eventId && activeMs > 0) void closeActivity(eventId, activeMs);
    };

    const appStateSub = AppState.addEventListener('change', () => settle());

    const settleTimer = setTimeout(async () => {
      const id = await logActivity({ action: 'view', section, path: pathname });
      if (!id) return;
      eventId = id;
      // They may already have left while that round trip was in flight — in
      // which case the cleanup below has run and this is all there is to do.
      if (finished) flush();
    }, SETTLE_MS);

    const ticker = setInterval(() => {
      settle();
      if (++ticks % FLUSH_EVERY_TICKS === 0 && eventId && activeMs > 0) {
        void closeActivity(eventId, activeMs);
      }
    }, TICK_MS);

    return () => {
      finished = true;
      clearTimeout(settleTimer);
      clearInterval(ticker);
      appStateSub.remove();
      flush();
    };
  }, [personId, pathname]);
}

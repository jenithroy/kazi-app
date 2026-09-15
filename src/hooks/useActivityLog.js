import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { closeActivity, logActivity, sectionForPath } from "../lib/activity";

/**
 * Records which page somebody is on, and how long they actually spend there.
 *
 * Mounted once, in AppLayout, so every signed-in route is covered without a
 * single page having to remember to call anything. Saves are logged separately
 * from lib/db.js for the same reason.
 *
 * "How long" is measured honestly, which means not measuring three things:
 *
 *   - a tab in the background. Hidden time does not count.
 *   - a page left open while somebody is at lunch. Time only accrues while
 *     there has been some sign of life in the last few minutes.
 *   - a page passed through. The view is not even logged until they have been
 *     there long enough to have read something, so clicking Billing on the way
 *     to Finance does not become "opened Billing".
 *
 * The row is written when they arrive and the duration filled in as they go,
 * rather than written on the way out. A browser closed mid-visit would lose an
 * on-the-way-out event entirely, and the visit is the part worth keeping — the
 * duration is a detail, and is also flushed every minute so even that survives.
 */

// Long enough to mean "went there", short enough to feel live in the feed.
const SETTLE_MS = 800;

// No mouse, key, scroll or touch for this long and we stop counting.
const IDLE_MS = 5 * 60 * 1000;

// How often to add up the time so far, and how often to write it down.
const TICK_MS = 15 * 1000;
const FLUSH_EVERY_TICKS = 4;

const INPUT_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "scroll"];

export default function useActivityLog() {
  const { profile } = useAuth();
  const { pathname } = useLocation();
  const personId = profile?.personId || null;

  // One sign-in per person per browser tab, and it must survive the effect
  // re-running (a reloaded profile, StrictMode's double mount in dev).
  const signedIn = useRef(null);

  useEffect(() => {
    if (!personId || typeof window === "undefined") return;
    if (signedIn.current === personId) return;
    signedIn.current = personId;

    const key = `kazi:activity:session:${personId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Private browsing, or storage disabled. A duplicate sign-in row is a
      // far smaller problem than a crash on page load.
    }
    logActivity({ action: "sign_in", path: window.location?.pathname || null });
  }, [personId]);

  useEffect(() => {
    if (!personId || typeof document === "undefined") return;

    const section = sectionForPath(pathname);
    if (!section) return; // a route we do not treat as a page

    let eventId = null;
    let finished = false;
    let activeMs = 0;
    let lastTick = Date.now();
    let lastInput = Date.now();
    let ticks = 0;

    const noteInput = () => { lastInput = Date.now(); };

    /** Add the time since the last tick, if it was time they were really here. */
    const settle = () => {
      const now = Date.now();
      if (document.visibilityState === "visible" && now - lastInput < IDLE_MS) {
        activeMs += now - lastTick;
      }
      lastTick = now;
    };

    const flush = () => {
      settle();
      if (eventId && activeMs > 0) closeActivity(eventId, activeMs);
    };

    // Coming back to the tab must not backdate credit for the time away.
    const onVisibility = () => { settle(); noteInput(); };
    const onPageHide = () => { if (!finished) flush(); };

    const settleTimer = setTimeout(async () => {
      const id = await logActivity({ action: "view", section, path: pathname });
      if (!id) return;
      eventId = id;
      // They may already have left while that round trip was in flight —
      // in which case the cleanup below has run and this is all that is left
      // to do for the visit.
      if (finished) flush();
    }, SETTLE_MS);

    const ticker = setInterval(() => {
      settle();
      if (++ticks % FLUSH_EVERY_TICKS === 0 && eventId && activeMs > 0) {
        closeActivity(eventId, activeMs);
      }
    }, TICK_MS);

    for (const e of INPUT_EVENTS) window.addEventListener(e, noteInput, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      finished = true;
      clearTimeout(settleTimer);
      clearInterval(ticker);
      for (const e of INPUT_EVENTS) window.removeEventListener(e, noteInput);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      flush();
    };
  }, [personId, pathname]);
}

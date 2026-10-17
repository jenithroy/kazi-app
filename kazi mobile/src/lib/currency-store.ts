/**
 * The app-wide currency preference and the GBP→NPR rate behind it.
 *
 * A module-level store rather than a context, for the same reason the calendar
 * preference is one: the money formatters in `money.ts` are plain functions
 * called from ~90 render sites, and threading a provider into every one of them
 * would mean rewriting all of them. They read `currentCurrency()` /
 * `currentRate()`; a screen calls `useMoneySignature()` once to re-render when
 * either changes.
 *
 * The live rate mirrors the reference web app's `CurrencyContext.jsx` exactly:
 * one call to open.er-api.com, cached for six hours, silently falling back to
 * the fixed `GBP_RATE` when the network or the response disappoints.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { GBP_RATE, type Currency } from './currency';

// Namespaced keys — display preferences, not credentials. Safe in AsyncStorage.
const CURRENCY_KEY = 'kazi-primary-currency';
const RATE_KEY = 'kazi-gbp-rate';

/** Same six hours the reference caches for. */
const RATE_TTL_MS = 6 * 60 * 60 * 1000;
const RATE_URL = 'https://open.er-api.com/v6/latest/GBP';
const RATE_TIMEOUT_MS = 8000;

/**
 * A rate outside this band is a broken response, not a moved market — GBP has
 * not traded below 50 or above 1000 NPR in its history, and rendering payroll
 * against a garbage number is worse than rendering it against a stale one.
 */
const RATE_MIN = 50;
const RATE_MAX = 1000;

export interface CurrencySnapshot {
  /** The currency amounts are shown in. */
  primary: Currency;
  /** The other one — shown muted alongside `primary` by `<Money>`. */
  secondary: Currency;
  /** NPR per 1 GBP. */
  rate: number;
  /** True once a live rate has been fetched (or read back from cache); false while on the fixed fallback. */
  live: boolean;
  /** When the live rate was fetched, epoch ms. */
  fetchedAt: number | null;
  /** False until the persisted preference has loaded. Screens can render NPR meanwhile. */
  ready: boolean;
}

let snapshot: CurrencySnapshot = {
  primary: 'NPR',
  secondary: 'GBP',
  rate: GBP_RATE,
  live: false,
  fetchedAt: null,
  ready: false,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function patch(next: Partial<CurrencySnapshot>) {
  snapshot = { ...snapshot, ...next };
  if (next.primary) snapshot.secondary = next.primary === 'NPR' ? 'GBP' : 'NPR';
  emit();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getCurrencySnapshot(): CurrencySnapshot {
  return snapshot;
}

/** For the pure formatters in `money.ts`, which run outside React. */
export function currentCurrency(): Currency {
  return snapshot.primary;
}

/** NPR per 1 GBP — live when we have it, the fixed fallback otherwise. */
export function currentRate(): number {
  return snapshot.rate;
}

// A user who picks a currency before storage answers keeps their pick.
let touched = false;

export function setPrimaryCurrency(next: Currency) {
  touched = true;
  void AsyncStorage.setItem(CURRENCY_KEY, next);
  if (next === snapshot.primary) return;
  patch({ primary: next });
}

export function toggleCurrency() {
  setPrimaryCurrency(snapshot.primary === 'NPR' ? 'GBP' : 'NPR');
}

function cacheIsFresh(): boolean {
  return snapshot.live && snapshot.fetchedAt !== null && Date.now() - snapshot.fetchedAt < RATE_TTL_MS;
}

function acceptRate(rate: unknown, fetchedAt: number): boolean {
  const n = Number(rate);
  if (!Number.isFinite(n) || n < RATE_MIN || n > RATE_MAX) return false;
  patch({ rate: n, live: true, fetchedAt });
  return true;
}

let inFlight: Promise<void> | null = null;

/**
 * Refresh the GBP→NPR rate. A no-op while the cached rate is still inside its
 * six hours unless `force` is set (the pull-to-refresh on the Settings card).
 * Failure is silent by design: the fixed fallback is a usable rate, and a toast
 * about an FX endpoint is not something a workshop can act on.
 */
export function refreshRate(force = false): Promise<void> {
  if (!force && cacheIsFresh()) return Promise.resolve();
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RATE_TIMEOUT_MS);
    try {
      const res = await fetch(RATE_URL, { signal: controller.signal });
      const body = (await res.json()) as { rates?: Record<string, number> };
      const now = Date.now();
      if (acceptRate(body?.rates?.NPR, now)) {
        await AsyncStorage.setItem(RATE_KEY, JSON.stringify({ rate: snapshot.rate, ts: now }));
      }
    } catch {
      // Offline, timed out, or a shape we don't recognise — stay on what we have.
    } finally {
      clearTimeout(timer);
      inFlight = null;
    }
  })();

  return inFlight;
}

async function hydrate() {
  const [[, storedCurrency], [, storedRate]] = await AsyncStorage.multiGet([CURRENCY_KEY, RATE_KEY]);

  if (!touched && (storedCurrency === 'NPR' || storedCurrency === 'GBP')) {
    patch({ primary: storedCurrency, ready: true });
  } else {
    patch({ ready: true });
  }

  // Not `if (storedRate)` alone: the provider's boot fetch can land first, and a
  // cached rate must never overwrite a fresher live one.
  if (storedRate && !snapshot.live) {
    try {
      const { rate, ts } = JSON.parse(storedRate) as { rate: number; ts: number };
      if (Number.isFinite(ts) && Date.now() - ts < RATE_TTL_MS) acceptRate(rate, ts);
    } catch {
      // Corrupt cache entry; the fetch below replaces it.
    }
  }

  void refreshRate();
}

void hydrate().catch(() => {
  patch({ ready: true });
});

/** The whole snapshot, subscribed. Use `useMoneySignature()` when you only need the re-render. */
export function useCurrencyState(): CurrencySnapshot {
  return useSyncExternalStore(subscribe, getCurrencySnapshot, getCurrencySnapshot);
}

export { subscribe as subscribeCurrency };

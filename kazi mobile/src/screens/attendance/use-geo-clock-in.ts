import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import * as Location from 'expo-location';

import { evaluateGeofence, type GeofenceEval } from '@/lib/geo';

export type GeoState = 'idle' | 'locating' | 'ready' | 'denied' | 'blocked' | 'error';

export interface GeoCoords {
  lat: number;
  lng: number;
  accuracyM: number;
}

export interface LocateResult {
  /** Inside the geofence AND accurate enough — safe to clock in without a prompt. */
  ok: boolean;
  coords: GeoCoords | null;
  geo: GeofenceEval | null;
  reason: GeoState;
}

/** How long to wait for a fresh fix before falling back to the last known one. */
const FIX_TIMEOUT_MS = 9_000;
/** Accept a cached fix up to this old when the fresh one times out. */
const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('location timeout')), ms)),
  ]);
}

/**
 * GPS acquisition + geofence check for the clock-in card (plan §2.6, item 26).
 *
 * Permission: checks the current grant first, only prompts when it can, and
 * distinguishes a soft `denied` (can ask again) from a `blocked` one (the user
 * must re-enable it in Settings — use `openSettings()`).
 *
 * Fix: asks for a high-accuracy position, and if that times out falls back to
 * the last known location so a slow GPS doesn't strand the clock-in. Callers
 * clock in only when `locate()` resolves `ok` (inside the fence, accurate
 * enough); every other outcome shows the blocked banner with no override.
 */
export function useGeoClockIn() {
  const [state, setState] = useState<GeoState>('idle');
  const [geo, setGeo] = useState<GeofenceEval | null>(null);

  const reset = useCallback(() => {
    setState('idle');
    setGeo(null);
  }, []);

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const locate = useCallback(async (): Promise<LocateResult> => {
    setState('locating');
    setGeo(null);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) {
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (!perm.granted) {
        const reason: GeoState = perm.canAskAgain ? 'denied' : 'blocked';
        setState(reason);
        return { ok: false, coords: null, geo: null, reason };
      }

      let pos: Location.LocationObject | null = null;
      try {
        pos = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
          FIX_TIMEOUT_MS,
        );
      } catch {
        pos = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
      }
      if (!pos) {
        setState('error');
        return { ok: false, coords: null, geo: null, reason: 'error' };
      }

      const coords: GeoCoords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy ?? Number.POSITIVE_INFINITY,
      };
      const ev = evaluateGeofence(coords.lat, coords.lng, coords.accuracyM);
      setGeo(ev);
      setState('ready');
      return { ok: ev.withinFence && ev.accuracyOk, coords, geo: ev, reason: 'ready' };
    } catch {
      setState('error');
      return { ok: false, coords: null, geo: null, reason: 'error' };
    }
  }, []);

  return { state, geo, locate, reset, openSettings };
}

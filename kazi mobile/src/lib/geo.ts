/**
 * Geofencing helpers for GPS clock-in (plan §2.6, item 26).
 * Ported verbatim from the reference app's `src/utils/geo.js` (Haversine) and
 * `src/constants.js` (WORK_SITE / GEOFENCE_RADIUS_M / GPS_ACCURACY_THRESHOLD_M).
 */

const EARTH_RADIUS_M = 6_371_000;

/**
 * The workshop coordinates a clock-in is measured against (reference `WORK_SITE`
 * = the Kazi office in Kathmandu). Override without a code change by setting
 * `EXPO_PUBLIC_WORK_SITE_LAT` / `EXPO_PUBLIC_WORK_SITE_LNG` (e.g. to relocate the
 * site, or to test the happy path from another location).
 */
const envLat = Number(process.env.EXPO_PUBLIC_WORK_SITE_LAT);
const envLng = Number(process.env.EXPO_PUBLIC_WORK_SITE_LNG);
export const WORK_SITE = {
  lat: Number.isFinite(envLat) ? envLat : 27.681622874006003,
  lng: Number.isFinite(envLng) ? envLng : 85.33697354663745,
  name: process.env.EXPO_PUBLIC_WORK_SITE_NAME || 'Kazi Office, Nepal',
} as const;

/** Clock-in is blocked further than this from `WORK_SITE`. Override: `EXPO_PUBLIC_GEOFENCE_RADIUS_M`. */
export const GEOFENCE_RADIUS_M = Number(process.env.EXPO_PUBLIC_GEOFENCE_RADIUS_M) || 100;

/** A fix worse (larger) than this is treated as untrustworthy — prompt before accepting. */
export const GPS_ACCURACY_THRESHOLD_M = 500;

/** Great-circle distance between two GPS coordinates, in metres. */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Metres from a coordinate to the workshop. */
export function distanceToWorkSite(lat: number, lng: number): number {
  return haversineDistance(lat, lng, WORK_SITE.lat, WORK_SITE.lng);
}

export interface GeofenceEval {
  /** Rounded metres to `WORK_SITE`. */
  distanceM: number;
  /** Rounded reported accuracy radius of the fix. */
  accuracyM: number;
  /** `distanceM <= GEOFENCE_RADIUS_M`. */
  withinFence: boolean;
  /** `accuracyM <= GPS_ACCURACY_THRESHOLD_M`. */
  accuracyOk: boolean;
}

/** Resolve a raw fix into the two gates the clock-in UI cares about. */
export function evaluateGeofence(lat: number, lng: number, accuracyM: number): GeofenceEval {
  const distanceM = Math.round(distanceToWorkSite(lat, lng));
  const acc = Math.round(Number.isFinite(accuracyM) ? accuracyM : GPS_ACCURACY_THRESHOLD_M + 1);
  return {
    distanceM,
    accuracyM: acc,
    withinFence: distanceM <= GEOFENCE_RADIUS_M,
    accuracyOk: acc <= GPS_ACCURACY_THRESHOLD_M,
  };
}

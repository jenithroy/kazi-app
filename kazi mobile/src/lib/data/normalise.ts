/**
 * Read-normalisation helpers for the eventual Firestore swap (Track B).
 *
 * The live `kazi-manufacturing` docs don't match the mobile mock shapes
 * field-for-field — see FRONTEND_GAP_PLAN §6 "Live-vs-reference discrepancies":
 *   - `invoices.items`, `orders.notesList`, `orders.stageHistory` come back
 *     as a JSON **string** OR a native array, unpredictably → `parseMaybeJson`.
 *   - `rate` / `qty` on `invoices.items` and `orders.stageHistory` are stored
 *     as **strings** → `num`.
 *   - Timestamps are Firestore `Timestamp` objects, not ISO strings → `tsToISO`.
 *
 * These are pure functions with no `firebase` import, so they're safe to land
 * and unit-test now, ahead of any real client wiring.
 */

/** A legacy Firestore `Timestamp` shape — still present in rows carried over by the migration. */
interface TimestampLike {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
}

function isTimestampLike(v: unknown): v is TimestampLike {
  return typeof v === 'object' && v !== null && typeof (v as TimestampLike).seconds === 'number';
}

/**
 * A field that is sometimes a JSON string, sometimes already the parsed value.
 * Returns `fallback` when the input is nullish or a string that won't parse.
 */
export function parseMaybeJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value as T;
  const trimmed = value.trim();
  if (trimmed === '') return fallback;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return fallback;
  }
}

/** Coerce a string / number / nullish field to a finite number (`fallback` otherwise). */
export function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^0-9.eE+-]/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/** Coerce a loosely-typed boolean field (`true`/`false`, `"true"`, `1`/`0`). */
export function bool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
  if (typeof value === 'number') return value === 1;
  return fallback;
}

/** Trim to a string, or `fallback` when nullish. */
export function str(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  return String(value);
}

/** Always hand back an array — wraps a lone object, parses a JSON string, drops nullish. */
export function arr<T>(value: unknown): T[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    const parsed = parseMaybeJson<unknown>(value, null);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  }
  return [value as T];
}

/** Legacy `Timestamp` | ISO string | `Date` | `{seconds}` → AD ISO string. */
export function tsToISO(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (isTimestampLike(value)) {
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    return new Date(value.seconds * 1000 + Math.floor(value.nanoseconds / 1e6)).toISOString();
  }
  return fallback;
}

/**
 * Collapse duplicate `accounts` docs by `name` — the live DB has ~114 rows,
 * many user-created variants of the reference's clean 26 (FRONTEND_GAP_PLAN §6).
 * Keeps the earliest-created doc per name; later ones are treated as dupes.
 */
export function dedupeByName<T extends { name?: unknown; createdAt?: unknown }>(docs: T[]): T[] {
  const byName = new Map<string, T>();
  for (const doc of docs) {
    const key = str(doc.name).trim().toLowerCase();
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, doc);
      continue;
    }
    if (tsToISO(doc.createdAt) && tsToISO(doc.createdAt) < tsToISO(existing.createdAt)) {
      byName.set(key, doc);
    }
  }
  return [...byName.values()];
}

/**
 * Live attendance writers — match the reference web app's ClockInCard /
 * Attendance page contract exactly so a mobile punch behaves identically to a
 * web one:
 *
 *   clock IN  → addDoc `clock_ins` { staffId, staffName, role, date, lat, lng,
 *               accuracyM, distanceToSiteM, clockedInAt: serverTimestamp(),
 *               [bypassUsed] }
 *            → setDoc `attendance/{date}_{uid}` (merge) { date, staffId, staffName,
 *               role, status, hours: 8, note, loggedBy, createdAt, lateCutApplied,
 *               lateMinutes }
 *   clock OUT → merge `clock_ins/{id}` { clockedOutAt: serverTimestamp(), workedHours }
 *            → merge `attendance/{date}_{uid}` { note: "GPS clock-in & out", hours }
 *
 * One `clock_ins` doc per person per day (like the web): a second clock-in the
 * same day *reopens* the existing row rather than adding another, so a stale
 * "open" duplicate can't linger after a clock-out made elsewhere.
 *
 * `fetchClockStatus` reads the newest `clock_ins` row for today AND the
 * companion `attendance/{date}_{uid}` doc, and reports the punch summary
 * (status / late minutes / GPS distance) straight from those stored values —
 * the same figures the web shows — instead of recomputing. It only falls back
 * to a local late-calc when no `attendance` row exists yet. "Today" is
 * Asia/Kathmandu (fixed UTC+5:45), not the device timezone.
 *
 * Identity is `people.id` throughout, exactly as the web's ClockInCard uses
 * `profile.personId`. It cannot be an auth uid: the compat views derive
 * `staffId` from `legacy_staff_id` / `legacy_firebase_uid`, so a session signed
 * in through Supabase never matched its own punches and the card reported "not
 * clocked in" to someone who was.
 *
 * Roll-call editing is admin-gated in the UI; RLS is the real boundary.
 */

import { collection, getDocs, query, serverTimestamp, where , getDb } from '@/lib/supabase/collections';

import { evaluateGeofence } from '@/lib/geo';
import { num, str, tsToISO } from '@/lib/data/normalise';
import { createDocument, patchDocument, setDocument } from '@/lib/supabase/write';
import { getActor } from '@/data/notifications/actor';

import { STATUS_TO_HOURS, STATUS_TO_LIVE, employeeById, gradeArrival, readEmployees } from './live-shared';
import type { AttendanceStatus, ClockStatus, PunchSummary } from './types';
import type { ClockToggleInput } from './mock-api';

const CLOCK_INS = 'clock_ins';
const ATTENDANCE = 'attendance';

/** Safe "no active session" state — used when there's no punch today, no UID, or a read fails. */
const NOT_CLOCKED_IN: ClockStatus = { clockedIn: false, inTime: '--:--', outTime: null, elapsedSeconds: 0 };

/** Nepal is a fixed UTC+5:45 with no DST — safe to offset by a constant. */
const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60_000;

/** `YYYY-MM-DD` for an instant, in Asia/Kathmandu — matches the date the web writes. */
function isoDate(at: number | Date = Date.now()): string {
  const ms = at instanceof Date ? at.getTime() : at;
  return new Date(ms + NEPAL_OFFSET_MS).toISOString().slice(0, 10);
}

/** `HH:MM` of an ISO instant, in Asia/Kathmandu. */
function hhmm(iso: string): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  return new Date(ms + NEPAL_OFFSET_MS).toISOString().slice(11, 16);
}

function actorName(fallback = ''): string {
  return getActor()?.name?.trim() || fallback;
}
/** `people.id` for the signed-in user — the key attendance rows are filed under. */
function actorPersonId(): string | null {
  return getActor()?.personId ?? null;
}

/** The signed-in user's directory entry, for their rostered shift. Null if unreadable. */
async function actorEmployee(personId: string) {
  return employeeById(await readEmployees(), personId);
}
function actorRole(): string {
  return getActor()?.role ?? '';
}

interface PunchRow {
  id: string;
  clockedInAt: string;
  clockedOutAt: string | null;
  distanceToSiteM: number | null;
  accuracyM: number | null;
  bypassUsed: boolean;
}

/** Today's `clock_ins` rows for the signed-in user, newest first. */
async function todaysPunches(personId: string): Promise<PunchRow[]> {
  const snap = await getDocs(
    query(collection(getDb(), CLOCK_INS), where('person_id', '==', personId), where('date', '==', isoDate())),
  );
  return snap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        clockedInAt: tsToISO(data.clockedInAt ?? data.createdAt),
        clockedOutAt: data.clockedOutAt ? tsToISO(data.clockedOutAt) : null,
        distanceToSiteM: data.distanceToSiteM == null ? null : num(data.distanceToSiteM),
        accuracyM: data.accuracyM == null ? null : num(data.accuracyM),
        bypassUsed: data.bypassUsed === true || /^true$/i.test(str(data.bypassUsed)),
      };
    })
    .sort((a, b) => b.clockedInAt.localeCompare(a.clockedInAt));
}

interface StoredLate {
  status: 'Present' | 'Late';
  lateMinutes: number;
  lateCutApplied: boolean;
}

/**
 * Today's `attendance` row for the signed-in user — the stored late/status
 * figures the web shows. Queried on `(person_id, date)`, the pair the table is
 * actually unique on. Returns null (→ local fallback calc) if there's no row or
 * the read is denied; never throws.
 */
async function todaysAttendance(personId: string): Promise<StoredLate | null> {
  try {
    const snap = await getDocs(
      query(collection(getDb(), ATTENDANCE), where('person_id', '==', personId), where('date', '==', isoDate())),
    );
    const d = snap.docs[0]?.data() as Record<string, unknown> | undefined;
    if (!d) return null;
    if (d.status == null && d.lateMinutes == null) return null;
    return {
      status: /late/i.test(str(d.status)) ? 'Late' : 'Present',
      lateMinutes: num(d.lateMinutes),
      lateCutApplied: d.lateCutApplied === true || /^true$/i.test(str(d.lateCutApplied)),
    };
  } catch (err) {
    console.warn('[attendance] attendance row read failed — using local late calc', err);
    return null;
  }
}

/** Punch summary from stored values: late/status from the `attendance` row, GPS from the `clock_ins` row. */
function buildSummary(stored: StoredLate | null, punch: PunchRow, fallback: StoredLate): PunchSummary {
  const late = stored ?? fallback;
  return {
    distanceToSiteM: punch.distanceToSiteM,
    accuracyM: punch.accuracyM,
    bypassUsed: punch.bypassUsed,
    status: late.status,
    lateMinutes: late.lateMinutes,
    lateCutApplied: late.lateCutApplied,
  };
}

/**
 * Current clock session: the newest `clock_ins` row for today decides
 * open/closed (an older orphan doesn't override a newer clock-out), and the
 * punch summary comes from the stored `attendance` + `clock_ins` values.
 */
export async function fetchClockStatus(): Promise<ClockStatus> {
  const personId = actorPersonId();
  if (!personId) return { ...NOT_CLOCKED_IN };

  try {
    const punches = await todaysPunches(personId);
    if (punches.length === 0) return { ...NOT_CLOCKED_IN };

    const latest = punches[0];
    const [stored, employee] = await Promise.all([todaysAttendance(personId), actorEmployee(personId)]);
    const summary = buildSummary(stored, latest, gradeArrival(employee, new Date(latest.clockedInAt)));

    if (!latest.clockedOutAt) {
      const startMs = new Date(latest.clockedInAt).getTime();
      const elapsed = Number.isNaN(startMs) ? 0 : Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      return { clockedIn: true, inTime: hhmm(latest.clockedInAt), outTime: null, elapsedSeconds: elapsed, lastPunch: summary };
    }

    const inMs = new Date(latest.clockedInAt).getTime();
    const outMs = new Date(latest.clockedOutAt).getTime();
    const worked = Number.isNaN(inMs) || Number.isNaN(outMs) ? 0 : Math.max(0, Math.floor((outMs - inMs) / 1000));
    return {
      clockedIn: false,
      inTime: hhmm(latest.clockedInAt),
      outTime: hhmm(latest.clockedOutAt),
      elapsedSeconds: worked,
      lastPunch: summary,
    };
  } catch (err) {
    console.warn('[attendance] fetchClockStatus failed — treating as not clocked in', err);
    return { ...NOT_CLOCKED_IN };
  }
}

/**
 * Clock out (close every open punch for today) or clock in (reopen today's row
 * if one exists, else create it) + sync the companion `attendance` doc.
 */
export async function toggleClock(input: ClockToggleInput): Promise<void> {
  const personId = actorPersonId();
  if (!personId) throw new Error('toggleClock: no person id on the session — attendance rows are keyed by `people.id`');
  const name = actorName(input.staffName);
  const role = actorRole();
  const now = new Date();
  const today = isoDate(now);
  const attId = `${today}_${personId}`;

  const punches = await todaysPunches(personId);
  const openPunches = punches.filter((p) => !p.clockedOutAt);

  if (openPunches.length > 0) {
    // Clock OUT — close every open punch (guards against an earlier duplicate).
    let workedHours: number | undefined;
    for (const p of openPunches) {
      const inMs = new Date(p.clockedInAt).getTime();
      const h = Number.isNaN(inMs) ? undefined : Math.max(0, Math.round(((now.getTime() - inMs) / 3_600_000) * 10) / 10);
      if (workedHours == null) workedHours = h;
      await patchDocument(CLOCK_INS, p.id, { clockedOutAt: serverTimestamp(), workedHours: h });
    }
    await setDocument(ATTENDANCE, attId, { note: 'GPS clock-in & out', hours: workedHours }, { merge: true });
    return;
  }

  // The reference grades an arrival against the employee's own rostered start,
  // and against "10:00 or later" when they have no roster at all.
  const late = gradeArrival(await actorEmployee(personId), now);
  const geo = input.coords ? evaluateGeofence(input.coords.lat, input.coords.lng, input.coords.accuracyM) : null;
  const gps = {
    lat: input.coords?.lat ?? null,
    lng: input.coords?.lng ?? null,
    accuracyM: geo ? geo.accuracyM : null,
    distanceToSiteM: geo ? geo.distanceM : null,
  };

  if (punches.length > 0) {
    // Today already has a (closed) punch — reopen it, never add a second doc.
    await patchDocument(CLOCK_INS, punches[0].id, {
      ...gps,
      clockedOutAt: null,
      workedHours: null,
      ...(input.bypassUsed ? { bypassUsed: true } : {}),
    });
  } else {
    await createDocument(CLOCK_INS, {
      staffId: personId,
      staffName: name,
      role,
      date: today,
      ...gps,
      clockedInAt: serverTimestamp(),
      ...(input.bypassUsed ? { bypassUsed: true } : {}),
    });
  }

  await setDocument(
    ATTENDANCE,
    attId,
    {
      date: today,
      staffId: personId,
      staffName: name,
      role,
      status: late.status,
      hours: 8,
      note: input.bypassUsed ? 'GPS clock-in (low-accuracy bypass)' : 'GPS clock-in',
      loggedBy: 'GPS',
      createdAt: serverTimestamp(),
      lateCutApplied: late.lateCutApplied,
      lateMinutes: late.lateMinutes,
    },
    { merge: true },
  );
}

/**
 * Roll-call edit — set a staffer's status for today, upserted on
 * `(person_id, date)` exactly as the reference page's `saveRows` does.
 *
 * `personId` is `people.id`, taken straight off the roster row the admin
 * tapped. The old signature took a display name and went looking for an id in
 * that person's history, which picked the wrong identity for anyone filed under
 * more than one spelling — and wrote a brand-new orphan row when it found none.
 */
export async function setMemberStatus(_id: number, status: AttendanceStatus, personId?: string, staffName?: string): Promise<void> {
  const target = (personId ?? '').trim();
  if (!target) throw new Error('setMemberStatus: person id required for the live write');
  if (status === 'off') return; // display-only — the reference doesn't save its "Closed" placeholder either

  const today = isoDate();
  await setDocument(
    ATTENDANCE,
    `${today}_${target}`,
    {
      date: today,
      staffId: target,
      staffName: (staffName ?? '').trim(),
      status: STATUS_TO_LIVE[status],
      hours: STATUS_TO_HOURS[status],
      loggedBy: getActor()?.name ?? 'kazi-mobile',
      createdAt: serverTimestamp(),
      lateCutApplied: false,
      lateMinutes: 0,
    },
    { merge: true },
  );
}

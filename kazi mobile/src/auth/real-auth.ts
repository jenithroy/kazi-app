/**
 * The real (non-mock) auth implementation. One session, one source: Supabase.
 *
 * **Why only one.** Postgres verifies tokens signed with the project's own key
 * and nothing else, so a Supabase Auth session is the only one that can read
 * or write any data. Firebase Auth used to run alongside this as a fallback for
 * staff who had not set a Supabase password yet — but a Firebase-only session
 * could not read a single row (every request came back `PGRST301`), so it was
 * a login that led to an app full of errors. Every active person now has a
 * Supabase password, so that path was removed rather than kept as a trap.
 *
 * Identity and permissions both come from `me()` (`supabase-profile.ts`), which
 * resolves the signed-in token to a `people` row and its position grants.
 */

import { isSupabaseConfigured } from '@/lib/supabase';

import type { Session } from './mock-auth';
import type { Role } from './roles';
import { minimalSession, sessionFromIdentity } from './session-shape';
import * as supabase from './supabase-auth';
import { fetchIdentityResult } from './supabase-profile';

/** True when the real session source is wired up. */
export const isRealAuthConfigured = isSupabaseConfigured;

// ---- Auth actions ---------------------------------------------------------

/** The Session is delivered by the subscription, not returned — hence the null. */
export async function signIn(email: string, password: string): Promise<Session | null> {
  if (!isSupabaseConfigured) throw new Error('No auth backend is configured.');
  await supabase.signIn(email.trim(), password);
  return null;
}

export async function requestPasswordReset(email: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('No auth backend is configured.');
  await supabase.requestPasswordReset(email);
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured) return;
  await supabase.signOut();
}

/** Real auth has no dev role switch — the switcher is hidden when it is configured. */
export async function setDevRole(_role?: Role): Promise<Session | null> {
  return null;
}

// ---- Session resolution ---------------------------------------------------

/**
 * The last Session the database actually confirmed, per auth user. Every auth
 * event re-resolves the profile — including the SDK's ~50-minute token refresh —
 * so without this a single timed-out lookup replaced a director's session with
 * the minimal one for the rest of the app's life.
 */
let lastResolved: { uid: string; session: Session } | null = null;

/** What to show when the lookup could not be reached: what already worked, else the floor. */
function degradedSession(sb: supabase.SbSession): Session {
  if (lastResolved?.uid === sb.user.id) return lastResolved.session;
  return minimalSession({ uid: sb.user.id, email: sb.user.email });
}

async function resolveSession(sb: supabase.SbSession): Promise<Session | null> {
  const result = await fetchIdentityResult();

  if (result.ok && result.identity) {
    const session = sessionFromIdentity(result.identity, {
      uid: sb.user.id,
      email: sb.user.email,
    });
    lastResolved = { uid: sb.user.id, session };
    return session;
  }

  if (result.ok) {
    // The token is valid but resolves to no active person. Holding on to it
    // would bounce the app between login and dashboard, so drop it.
    console.warn('[auth] this Supabase account matches no active person — signing it out');
    lastResolved = null;
    await supabase.signOut().catch(() => {});
    return null;
  }

  // A network failure is not "no access" — keep the person signed in on the
  // profile that last resolved so they see read errors rather than a silent
  // downgrade to the employee nav.
  console.warn('[auth] identity lookup failed — keeping the last resolved session', result.error);
  return degradedSession(sb);
}

/**
 * One Session from the Supabase auth listener.
 *
 * A slow resolve must never overwrite a newer one, so each emit takes a
 * generation and only delivers if it is still the latest — otherwise a sign-out
 * racing an in-flight profile fetch could be undone by it.
 */
export function subscribe(onSession: (session: Session | null) => void): () => void {
  let generation = 0;
  let disposed = false;

  if (!isSupabaseConfigured) {
    onSession(null);
    return () => {};
  }

  const emit = (sbSession: supabase.SbSession | null) => {
    if (disposed) return;
    const gen = ++generation;
    const deliver = (session: Session | null) => {
      if (!disposed && gen === generation) onSession(session);
    };

    if (!sbSession) {
      deliver(null);
      return;
    }
    resolveSession(sbSession).then(deliver, (err) => {
      console.warn('[auth] profile resolve failed — keeping the last resolved session', err);
      deliver(degradedSession(sbSession));
    });
  };

  // If the listener never reports — a wedged AsyncStorage read, an SDK quirk —
  // the app would sit on the splash screen for ever. Better to show the login
  // screen than to hang.
  let reported = false;
  const watchdog = setTimeout(() => {
    if (reported || disposed) return;
    console.warn('[auth] the session source never reported — continuing signed out');
    emit(null);
  }, 8000);

  const unsub = supabase.subscribe((session) => {
    reported = true;
    clearTimeout(watchdog);
    emit(session);
  });

  return () => {
    disposed = true;
    clearTimeout(watchdog);
    unsub();
  };
}

/**
 * Supabase Auth — the session source Postgres actually trusts.
 *
 * Staff were provisioned native Supabase accounts (`scripts/provision-auth.cjs`
 * in the web app) and `people.auth_uid` links them to their person row. A token
 * minted here is signed with the project's own key, so RLS can verify it;
 * a Firebase ID token cannot be (see `src/lib/supabase.ts`).
 *
 * Everything here talks to the auth-only client. Queries go through
 * `getSupabase()` instead — mixing the two is what the split exists to prevent.
 */

import type { AuthChangeEvent, Session as SbSession } from '@supabase/supabase-js';

import { getSupabaseAuth, isSupabaseConfigured } from '@/lib/supabase';

export type { SbSession };

export async function signIn(email: string, password: string): Promise<SbSession> {
  const { data, error } = await getSupabaseAuth().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  if (!data.session) throw new Error('Supabase returned no session');
  return data.session;
}

/**
 * Sends the recovery mail. The link lands on the web app's reset page (the
 * project's Site URL) — that is where the 8 staff who still have no Supabase
 * password set one; afterwards the same password signs them in here. Mobile
 * has no deep-link recovery handler, so we deliberately pass no `redirectTo`.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await getSupabaseAuth().auth.resetPasswordForEmail(email.trim().toLowerCase());
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await getSupabaseAuth().auth.signOut();
  // `session_not_found` just means we were already signed out.
  if (error && error.name !== 'AuthSessionMissingError') throw error;
}

/**
 * Subscribe to the session. Fires immediately with `INITIAL_SESSION` once the
 * persisted session has been restored, which is how the caller knows this
 * source has reported in.
 *
 * The callback is dispatched off the auth lock with `setTimeout`: supabase-js
 * holds that lock for the duration of the handler, and our listener goes on to
 * query the data client, whose `accessToken` hook reads the session back —
 * a deadlock if done inline.
 */
export function subscribe(onChange: (session: SbSession | null, event: AuthChangeEvent) => void): () => void {
  const { data } = getSupabaseAuth().auth.onAuthStateChange((event, session) => {
    setTimeout(() => onChange(session, event), 0);
  });
  return () => data.subscription.unsubscribe();
}

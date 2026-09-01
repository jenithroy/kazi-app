import { createClient } from "@supabase/supabase-js";
import { auth as firebaseAuth } from "./firebase";

const url     = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing. Copy them from .env.example."
  );
}

/**
 * Two clients, deliberately.
 *
 * People can sign in through Supabase Auth *or* through Firebase — the database
 * accepts both. `app_issuer_ok()` trusts either issuer and `app_person_id()`
 * matches the caller on auth_uid or legacy_firebase_uid, so the same person
 * lands on the same row with the same permissions whichever door they came in.
 *
 * supabase-js cannot do both on one client: setting `accessToken` (the
 * third-party auth hook) makes the whole `.auth` namespace throw. Its own docs
 * say to create a second client, so:
 *
 *   authClient — owns Supabase Auth. Sign-in, password reset, session refresh.
 *   supabase   — owns data. Sends whichever token is currently valid.
 */

/** Supabase Auth only. Never use this for queries — it does not see Firebase sessions. */
export const authClient = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "kazi-supabase-auth",
  },
});

/**
 * The token the data client should present, in preference order:
 *
 *   1. a live Supabase session  — someone who has set a Supabase password
 *   2. a live Firebase ID token — someone still on their old password
 *   3. null                     — signed out; PostgREST falls back to the anon
 *                                 key, which every RLS policy denies
 *
 * Called on every request and often concurrently. Both SDKs cache internally
 * and only hit the network when the token is close to expiry, so this stays
 * cheap; we deliberately do not add a cache on top, because a stale token here
 * would show as a spurious permission error.
 */
async function currentAccessToken() {
  try {
    const { data } = await authClient.auth.getSession();
    if (data?.session?.access_token) return data.session.access_token;
  } catch {
    // Fall through to Firebase — a broken Supabase session must not lock out
    // someone whose Firebase login is perfectly good.
  }

  try {
    const fbUser = firebaseAuth.currentUser;
    if (fbUser) return await fbUser.getIdToken();
  } catch {
    // Signed out, or the refresh failed. Returning null is correct: better to
    // be denied and redirected to login than to hang.
  }

  return null;
}

/** Use this for every query. It carries whichever identity is signed in. */
export const supabase = createClient(url, anonKey, {
  accessToken: currentAccessToken,
});

/**
 * A throwaway client for signing somebody else up.
 *
 * `authClient.auth.signUp()` would replace the current session with the new
 * account's — an admin adding a colleague would find themselves logged in as
 * them. This client persists nothing and refreshes nothing, so the admin's own
 * session is untouched. It is the same trick the Firebase version used with a
 * secondary app instance.
 *
 * Throw it away after one use.
 */
export function createSignupClient() {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `kazi-signup-${Date.now()}`,
    },
  });
}

export { url as SUPABASE_URL };

/**
 * Supabase clients — the app's data backend, replacing Firestore.
 *
 * **Two clients, deliberately.** supabase-js cannot do both jobs on one
 * instance: passing the `accessToken` option makes the whole `.auth` namespace
 * throw ("Not supported in this environment"). So we keep them apart, exactly
 * as the web app does (`jenithroy/kazi-app`, branch
 * `migrate/firestore-to-supabase`, `src/supabase.js`):
 *
 *   - `getSupabaseAuth()` — Supabase Auth only. Owns the session: sign-in,
 *     password reset, refresh, AsyncStorage persistence. Never used to query.
 *   - `getSupabase()` — the data client. Every request carries whatever
 *     `currentAccessToken()` returns.
 *
 * Postgres RLS resolves the token to a `people` row (`app_person_id()` accepts
 * both a native uuid `sub` and a legacy Firebase uid) and derives every
 * permission from that person's position. A signed-in account with no `people`
 * row reads nothing at all — that is deliberate, so departed staff keep their
 * login but lose access.
 *
 * `isSupabaseConfigured` gates the whole live path; unconfigured, every module
 * falls back to its in-memory mock exactly as before.
 */

import { AppState } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

function assertConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured — set EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY. Callers should check `isSupabaseConfigured` first.',
    );
  }
}

let authRef: SupabaseClient | null = null;
let dataRef: SupabaseClient | null = null;

/**
 * Whether the last data request carried a session token at all. `null` means it
 * went out as `anon`, which reads almost nothing — the diagnosis for a whole
 * screen of empty or denied results at once.
 */
export type TokenSource = 'supabase' | null;
let tokenSource: TokenSource = null;
export function lastTokenSource(): TokenSource {
  return tokenSource;
}

/**
 * The session-owning client. Its own `storageKey` keeps it clear of anything
 * else in AsyncStorage, and `autoRefreshToken` is driven by AppState because
 * on native the refresh timer must stop while the app is backgrounded (the
 * documented React Native setup).
 */
export function getSupabaseAuth(): SupabaseClient {
  assertConfigured();
  if (authRef) return authRef;
  authRef = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      storage: AsyncStorage,
      storageKey: 'kazi-mobile-supabase-auth',
      persistSession: true,
      autoRefreshToken: true,
      // No URL to parse on native, and on web it would try to consume a hash
      // fragment expo-router owns.
      detectSessionInUrl: false,
    },
    global: { headers: { 'x-client-info': 'kazi-mobile' } },
  });

  AppState.addEventListener('change', (state) => {
    if (state === 'active') authRef?.auth.startAutoRefresh();
    else authRef?.auth.stopAutoRefresh();
  });
  if (AppState.currentState === 'active') authRef.auth.startAutoRefresh();

  return authRef;
}

/**
 * Decode a JWT's claims without verifying it — diagnosis only, never a
 * decision. Returns `null` for anything that isn't a readable JWT.
 */
function claimsOf(token: string): Record<string, unknown> | null {
  try {
    const body = token.split('.')[1];
    if (!body) return null;
    const padded = body.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(body.length / 4) * 4, '=');
    return JSON.parse(globalThis.atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Say — once per distinct token, in dev only — exactly who the data client is
 * signing requests as.
 *
 * Every failure mode this wiring has had looks identical from a screen: denied
 * or empty results with nothing naming the cause. The cause is in the token, so
 * print it — no token at all means the request went out as `anon`.
 */
let announced = '';
function announce(source: TokenSource, token: string | null): void {
  if (!__DEV__) return;
  const claims = token ? claimsOf(token) : null;
  const who = claims ? String(claims.email ?? claims.sub ?? 'an unnamed subject') : token ? 'an undecodable token' : 'anonymous';
  const key = `${source}:${who}`;
  if (announced === key) return;
  announced = key;

  if (source === 'supabase') {
    const exp = typeof claims?.exp === 'number' ? new Date(claims.exp * 1000).toISOString() : 'unknown';
    console.log(`[supabase] signing data requests as ${who} (Supabase session, expires ${exp})`);
  } else {
    console.warn('[supabase] no session — data requests go out as the anon role and will see almost nothing.');
  }
}

/**
 * The token every data request is signed with: the Supabase session, or nothing.
 *
 * `getSession()` refreshes on its own when the cached token has expired, so this
 * can never hand back something stale.
 */
async function currentAccessToken(): Promise<string | null> {
  try {
    const { data } = await getSupabaseAuth().auth.getSession();
    if (data.session?.access_token) {
      tokenSource = 'supabase';
      announce('supabase', data.session.access_token);
      return data.session.access_token;
    }
  } catch (err) {
    console.warn('[supabase] could not read the auth session', err);
  }

  tokenSource = null;
  announce(null, null);
  return null;
}

/**
 * The bearer token for calling an external service as the signed-in person —
 * `meta-dm-bot`'s dashboard API, chiefly, which checks it against this same
 * Supabase project's `my_permissions`/`my_messenger_tabs` views itself rather
 * than trusting the app. Same token `getSupabase()` signs every query with.
 */
export const getSupabaseAccessToken = (): Promise<string | null> => currentAccessToken();

export function getSupabase(): SupabaseClient {
  assertConfigured();
  if (dataRef) return dataRef;
  dataRef = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    accessToken: currentAccessToken,
    global: { headers: { 'x-client-info': 'kazi-mobile' } },
  });
  return dataRef;
}

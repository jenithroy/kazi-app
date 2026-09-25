/**
 * Permission + identity checks for the Meta Ads routes, ported from
 * meta-dm-bot/app/dashboard.py's _leads_permission() (same shape, same
 * reasoning — that file's docstring explains it best): the caller's own
 * forwarded browser token is sent straight to PostgREST with the ANON key,
 * so RLS resolves to the real signed-in person, never the service key. A
 * 401 from PostgREST (bad/expired token) doubles as the session check —
 * PostgREST verifies the JWT's signature and expiry before RLS even runs.
 *
 * Meta Ads gates on TWO views agreeing, same as Leads' messenger/leads
 * split: the section-level `marketing` permission AND the `meta_ads`
 * marketing-tab permission (see migration 0045_marketing_tabs.sql). Both
 * view and edit are real here — pausing a live campaign or changing a
 * budget is real-money territory, not a read-only tab.
 */

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function bearerToken(request) {
  const header = request.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

/**
 * {view, edit} for whoever the caller's own bearer token identifies, by
 * combining my_permissions (section_id = 'marketing') and
 * my_marketing_tabs (tab_id = 'meta_ads') — both flags must be true for the
 * respective view/edit result, matching marketingTabAllowed()/
 * marketingTabCanEdit() in src/utils/permissions.js.
 *
 * Throws AuthError(401, ...) with no/expired token, AuthError(503, ...) if
 * PostgREST can't be reached or errors — the caller (worker/index.js) turns
 * either into the matching HTTP response.
 */
export async function checkMarketingTabPermission(request, env) {
  const token = bearerToken(request);
  if (!token) {
    throw new AuthError(401, "Sign in to use Meta Ads.");
  }
  const callerHeaders = {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
  };

  let sectionRes, tabRes;
  try {
    [sectionRes, tabRes] = await Promise.all([
      fetch(`${env.SUPABASE_URL}/rest/v1/my_permissions?section_id=eq.marketing&select=can_view,can_edit`, {
        headers: callerHeaders,
      }),
      fetch(`${env.SUPABASE_URL}/rest/v1/my_marketing_tabs?tab_id=eq.meta_ads&select=can_view,can_edit`, {
        headers: callerHeaders,
      }),
    ]);
  } catch {
    throw new AuthError(503, "Could not verify your session — try again.");
  }

  if (sectionRes.status === 401 || tabRes.status === 401) {
    throw new AuthError(401, "Your session has expired — sign in again.");
  }
  if (!sectionRes.ok || !tabRes.ok) {
    throw new AuthError(503, "Could not verify your permissions — try again.");
  }

  const sectionRows = await sectionRes.json();
  const tabRows = await tabRes.json();
  const section = sectionRows[0] || {};
  const tab = tabRows[0] || {};

  return {
    view: !!section.can_view && !!tab.can_view,
    edit: !!section.can_edit && !!tab.can_edit,
  };
}

/**
 * Resolves the caller's own person_id/full_name by proxying PostgREST's
 * rpc/me with their forwarded token — same trick as
 * checkMarketingTabPermission, so this is genuinely who's signed in, not a
 * client-supplied name. Used to stamp meta_sync_runs.triggered_by_* on a
 * manual sync. Returns null if the token maps to nobody (removed from
 * people, or set Inactive) — same "me() comes back empty" case
 * AuthContext.jsx's loadProfile() handles by treating it as signed out.
 */
export async function fetchCallerIdentity(request, env) {
  const token = bearerToken(request);
  if (!token) {
    throw new AuthError(401, "Sign in to use Meta Ads.");
  }

  let res;
  try {
    res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/me`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
  } catch {
    throw new AuthError(503, "Could not identify who's asking — try again.");
  }

  if (res.status === 401) {
    throw new AuthError(401, "Your session has expired — sign in again.");
  }
  if (!res.ok) {
    throw new AuthError(503, "Could not identify who's asking — try again.");
  }

  const data = await res.json();
  const me = Array.isArray(data) ? data[0] : data;
  if (!me) return null;

  return {
    personId: me.person_id ?? null,
    fullName: me.full_name ?? null,
  };
}

/**
 * Who may use the Marketing pages that call the Worker (Reddit Leads, Contact Finder). They have no permission of their own: whoever may use
 * Marketing may use them, to see (view) and to act (edit).
 *
 * The caller's own session token goes to PostgREST with the anon key, so row-level security answers for the real signed-in person (the
 * same way worker/lib/metaAuth.js does it); the service key is never used to decide who somebody is.
 */
import { AuthError } from "./metaAuth.js";

function bearerToken(request) {
  const header = request.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

/** { view, edit } for the caller on the Marketing section. Throws AuthError (401, or 503 when it could not be checked). */
export async function checkMarketingPermission(request, env) {
  const token = bearerToken(request);
  if (!token) throw new AuthError(401, "Sign in to continue.");
  let res;
  try {
    res = await fetch(`${env.SUPABASE_URL}/rest/v1/my_permissions?section_id=eq.marketing&select=can_view,can_edit`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new AuthError(503, "Could not verify your session. Try again.");
  }
  if (res.status === 401) throw new AuthError(401, "Your session has expired. Sign in again.");
  if (!res.ok) throw new AuthError(503, "Could not verify your permissions. Try again.");
  const row = (await res.json())[0] || {};
  return { view: row.can_view === true, edit: row.can_edit === true };
}

export const noEdit = () => Response.json({ error: "Your role can't do this. Ask an admin for Edit on Marketing." }, { status: 403 });

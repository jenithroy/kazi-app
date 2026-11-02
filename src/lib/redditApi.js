/**
 * Client for this app's own Worker routes behind Reddit Leads (worker/lib/redditLeads.js):
 *
 *   POST /api/reddit-leads/sync        "Check now": the same check the schedule runs every 30 minutes
 *   POST /api/reddit-leads/find-email  read one business's public contact pages and say what addresses they show
 *
 * Same-origin, with the session token every query carries (the Worker checks it against the Marketing section itself).
 */
import { getSupabaseAccessToken } from "../supabase";

async function call(path, body) {
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error("Sign in to use Reddit Leads.");

  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body || {}),
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  let json = null;
  try { json = await res.json(); } catch { /* not JSON: said below */ }
  if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : `That didn't work (${res.status}).`);
  if (!json) throw new Error("The server's answer could not be read. Has the Worker been updated with Reddit Leads?");
  return json;
}

/** Run a check now. Resolves to { ok, subreddits, fetched, matched, saved, errors }. */
export const runRedditCheck = () => call("/api/reddit-leads/sync");

/** Read a business's public contact pages. Resolves to the finder's `result` (see worker/lib/contactFinder.js findContacts). */
export async function runEmailFinder(url) {
  const json = await call("/api/reddit-leads/find-email", { url });
  if (!json.result) throw new Error("The server's answer could not be read.");
  return json.result;
}

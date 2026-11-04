/**
 * How a page calls this app's own Worker routes: same-origin, with the session token every query carries (the Worker checks it against the
 * Marketing section itself). Resolves to the JSON answer; throws an Error whose message is something to show a person.
 * `page` is how a person knows the page ("Reddit Leads"), for the messages that name it.
 */
import { getSupabaseAccessToken } from "../supabase";

export async function callWorker(path, body, { page = "this page" } = {}) {
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error(`Sign in to use ${page}.`);

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
  if (!json) throw new Error(`The server's answer could not be read. Has the Worker been updated with ${page}?`);
  return json;
}

/**
 * Client for this app's own Worker routes that talk to the Meta Graph API
 * (worker/index.js: POST /api/meta-ads/sync, POST /api/meta-ads/action).
 *
 * Same-origin — this Worker serves the SPA itself, unlike the Instagram DM
 * bot (a separate service, see lib/leadsBot.js), so there is no separate
 * base URL to configure, just a relative fetch with the same session token
 * every Supabase query already carries.
 */

import { getSupabaseAccessToken } from "../supabase";

async function call(path, options = {}) {
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error("Sign in to use Meta Ads.");

  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `That didn't work (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // Non-JSON error body — the generic message stands.
    }
    throw new Error(message);
  }
  return res.json();
}

/** Pull the latest campaigns/ad sets/ads/insights from Meta. Needs View. */
export const runMetaAdsSync = () => call("/api/meta-ads/sync", { method: "POST" });

/**
 * Pause/resume an entity, or edit its budget. Needs Edit.
 * payload: { entityLevel, entityId, action: "pause"|"resume"|"budget_edit", field?, valueMinor? }
 */
export const runMetaAdsAction = (payload) =>
  call("/api/meta-ads/action", { method: "POST", body: JSON.stringify(payload) });

/**
 * Read helpers for the Meta Ads module. Anything that could grow past a
 * page's worth of rows (insights) always goes through an explicit date
 * filter or a server-aggregated RPC — fetchAll has no pagination, so an
 * unbounded read on a table with a row per entity per day would silently
 * truncate at PostgREST's row cap.
 */

import { fetchAll } from "./db";
import { supabase } from "../supabase";

export const fetchAdAccounts = () =>
  fetchAll("meta_ad_accounts", { orderBy: "name", orderDir: "asc" });

export const fetchCampaigns = () =>
  fetchAll("meta_campaigns", { orderBy: "name", orderDir: "asc" });

export const fetchAdsets = (campaignId) =>
  fetchAll("meta_adsets", {
    filters: [{ field: "campaignId", value: campaignId }],
    orderBy: "name", orderDir: "asc",
  });

export const fetchAds = (adsetId) =>
  fetchAll("meta_ads", {
    filters: [{ field: "adsetId", value: adsetId }],
    orderBy: "name", orderDir: "asc",
  });

/** Campaign-level daily spend/clicks/impressions in a date range — never the raw meta_ad_insights table, to avoid triple-counting across entity levels. */
export const fetchCampaignInsights = (dateFrom, dateTo) =>
  fetchAll("meta_campaign_insights", {
    filters: [
      { field: "date", op: "gte", value: dateFrom },
      { field: "date", op: "lte", value: dateTo },
    ],
    orderBy: "date", orderDir: "asc",
  });

export const fetchSyncRuns = () =>
  fetchAll("meta_sync_runs", { orderBy: "startedAt", orderDir: "desc", limit: 10 });

export const fetchRecentActions = (limit = 25) =>
  fetchAll("meta_ads_actions", { orderBy: "createdAt", orderDir: "desc", limit });

export async function fetchSettings() {
  const rows = await fetchAll("meta_ads_settings");
  return rows[0] || null;
}

/** Server-aggregated: spend/results ranked, highest spend first. */
export async function fetchTopAds(dateFrom, dateTo, limitN = 10) {
  const { data, error } = await supabase.rpc("meta_top_ads", {
    date_from: dateFrom || null,
    date_to: dateTo || null,
    entity_limit: limitN,
  });
  if (error) throw error;
  return data || [];
}

/** Manual attribution: spend vs. tagged customers/orders, per campaign. All-time unless a range is given (spend only is bounded by it — see migration 0047). */
export async function fetchCampaignAttribution(dateFrom, dateTo) {
  const { data, error } = await supabase.rpc("meta_campaign_attribution", {
    date_from: dateFrom || null,
    date_to: dateTo || null,
  });
  if (error) throw error;
  return data || [];
}

/**
 * Read helpers for the Meta Ads module. Anything that could grow past a
 * page's worth of rows (insights) either goes through a server-aggregated
 * RPC or is read a page at a time (allPages): fetchAll has no pagination,
 * so an unbounded read on a table with a row per entity per day would
 * silently truncate at PostgREST's row cap.
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

const PAGE = 1000;                // the most rows the server sends for one request
const MAX_PAGES = 100;

/**
 * Every row of a query that can be longer than the server's limit, read a page at a time. `page(first, last)` returns the query for rows
 * first..last (zero-based, inclusive); the read stops at the first short page. Without this a long range (the "All" button, or 90 days of a
 * busy account) was silently cut at the limit, the earliest days kept and the latest lost.
 */
async function allPages(page) {
  const rows = [];
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const { data, error } = await page(i * PAGE, i * PAGE + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/**
 * Campaign-level daily spend/clicks/impressions in a date range — never the raw meta_ad_insights table, to avoid triple-counting across entity
 * levels. A bound that is missing (null or "": the "All" range, or an open end) is left out of the query: the old read sent `null` as the text
 * "null", which is not a date, so "All" failed. Read in pages (see allPages), in a fixed order so the pages do not overlap.
 */
export const fetchCampaignInsights = (dateFrom, dateTo) =>
  allPages((first, last) => {
    let q = supabase.from("meta_campaign_insights").select("*");
    if (dateFrom) q = q.gte("date", dateFrom);
    if (dateTo) q = q.lte("date", dateTo);
    return q.order("date", { ascending: true }).order("campaignId", { ascending: true }).range(first, last);
  });

/**
 * Daily insights of some ad sets or ads in a range (a missing end is left out). Throws when they cannot be read: the caller says so, since
 * rows that show no numbers look the same as rows that spent nothing.
 */
export async function fetchEntityInsights(entityLevel, entityIds, dateFrom, dateTo) {
  if (!entityIds || entityIds.length === 0) return [];
  return allPages((first, last) => {
    let q = supabase
      .from("meta_ad_insights")
      .select("entity_id, impressions, clicks, spend, conversions, currency, date")
      .eq("entity_level", entityLevel)
      .in("entity_id", entityIds);
    if (dateFrom) q = q.gte("date", dateFrom);
    if (dateTo) q = q.lte("date", dateTo);
    return q.order("date", { ascending: true }).order("entity_id", { ascending: true }).range(first, last);
  });
}

export const fetchSyncRuns = () =>
  fetchAll("meta_sync_runs", { orderBy: "startedAt", orderDir: "desc", limit: 10 });

/** The latest changes made from this app, or, with an `entityId`, the latest changes to that one campaign, ad set or ad (asked of the server, not picked out of the latest few). */
export const fetchRecentActions = (limit = 25, entityId = "") =>
  fetchAll("meta_ads_actions", { filters: entityId ? [{ field: "entityId", value: entityId }] : [], orderBy: "createdAt", orderDir: "desc", limit });

/**
 * Every lead, newest first. One read stops at the server's row limit (1,000), so it goes on from the oldest time it has got until a read
 * comes back short; a lead that shares that time is not counted twice.
 */
export async function fetchMetaLeads() {
  const rows = [];
  const seen = new Set();
  let before = null;
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const page = await fetchAll("meta_leads", { filters: before ? [{ field: "leadCreatedAt", op: "lte", value: before }] : [], orderBy: "leadCreatedAt", orderDir: "desc", limit: PAGE });
    const fresh = page.filter((r) => !seen.has(r.id));
    fresh.forEach((r) => { seen.add(r.id); rows.push(r); });
    before = page.length ? page[page.length - 1].leadCreatedAt : null;
    if (page.length < PAGE || fresh.length === 0 || !before) break;
  }
  return rows;
}

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

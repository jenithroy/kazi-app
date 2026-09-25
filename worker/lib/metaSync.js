/**
 * runMetaAdsSync() — pulls the campaign/adset/ad hierarchy plus a rolling
 * insights window from the Graph API for every active meta_ad_accounts row,
 * and mirrors it into Supabase. Driven by either the cron trigger
 * (worker/index.js's scheduled()) or the "Sync now" button
 * (POST /api/meta-ads/sync).
 *
 * Column names below are copied verbatim from
 * supabase/migrations/0046_meta_ads.sql — see that file for the schema.
 *
 * Never throws once the meta_sync_runs row exists: a failure partway
 * through one account is caught and recorded so the rest of the run can
 * continue (partial success), and a failure before any account finishes
 * still patches the run row to 'failed' rather than leaving it stuck on
 * 'running' forever.
 */

import { metaGet, metaGetAllPages } from "./metaGraph.js";
import { insert, patch, select, upsert } from "./supabaseRest.js";

// Meta's own reporting window people actually look at day-to-day, plus a
// few days of slack for late-attributed conversions. Every sync re-pulls
// this whole window (not just "since the last sync") because Meta's own
// numbers for a given day keep settling for a few days afterward.
const INSIGHTS_WINDOW_DAYS = 37;

const CAMPAIGN_FIELDS =
  "id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time,updated_time";
const ADSET_FIELDS =
  "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,created_time,updated_time";
const AD_FIELDS =
  "id,name,adset_id,campaign_id,status,effective_status,created_time,updated_time,creative{thumbnail_url}";
const INSIGHTS_FIELDS = "campaign_id,adset_id,ad_id,impressions,clicks,spend,reach,actions,date_start";

const PAGE_LIMIT = 200;
const INSIGHTS_PAGE_LIMIT = 500;

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function insightsTimeRange() {
  const until = new Date();
  const since = new Date(until.getTime() - INSIGHTS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { since: isoDate(since), until: isoDate(until) };
}

/** null-safe minor-unit budget: Meta already reports these in minor units
 * (cents), so this is a straight passthrough, never a *100/÷100 rescale. */
function budgetMinor(value) {
  return value != null ? Number(value) : null;
}

/**
 * Syncs one ad account: refreshes its own name/currency/timezone, then its
 * campaign/adset/ad hierarchy, then insights at all three levels. Mutates
 * `counts` and `detail` (both plain objects owned by the caller) rather
 * than returning anything, since every account in the run shares one
 * meta_sync_runs row's totals.
 */
async function syncOneAccount(env, account, counts, detail) {
  const accountId = account.id; // already Meta's own "act_..." string — never re-prefix it

  // --- account profile -------------------------------------------------
  const profile = await metaGet(`/${accountId}`, { fields: "name,currency,timezone_name" }, env);
  const currency = profile.currency || account.currency;
  await upsert(
    env,
    "meta_ad_accounts",
    [
      {
        id: accountId,
        name: profile.name ?? account.name,
        currency,
        timezone_name: profile.timezone_name ?? account.timezone_name,
        last_synced_at: new Date().toISOString(),
      },
    ],
    { onConflict: "id" }
  );

  // --- campaigns ---------------------------------------------------------
  const { items: campaigns, cappedAt: campaignsCapped } = await metaGetAllPages(
    `/${accountId}/campaigns`,
    { fields: CAMPAIGN_FIELDS, limit: PAGE_LIMIT },
    env
  );
  if (campaignsCapped) detail.pagingCaps.push({ accountId, entity: "campaigns" });

  if (campaigns.length) {
    const rows = campaigns.map((c) => ({
      id: c.id,
      ad_account_id: accountId,
      name: c.name,
      status: c.status,
      effective_status: c.effective_status ?? null,
      objective: c.objective ?? null,
      daily_budget_minor: budgetMinor(c.daily_budget),
      lifetime_budget_minor: budgetMinor(c.lifetime_budget),
      created_time: c.created_time ?? null,
      meta_updated_time: c.updated_time ?? null,
      last_synced_at: new Date().toISOString(),
    }));
    await upsert(env, "meta_campaigns", rows, { onConflict: "id" });
    counts.campaigns += rows.length;
  }

  // --- adsets --------------------------------------------------------------
  // Account-level edge (not walked campaign-by-campaign) — adset objects
  // carry their own campaign_id field, which is all the FK needs.
  const { items: adsets, cappedAt: adsetsCapped } = await metaGetAllPages(
    `/${accountId}/adsets`,
    { fields: ADSET_FIELDS, limit: PAGE_LIMIT },
    env
  );
  if (adsetsCapped) detail.pagingCaps.push({ accountId, entity: "adsets" });

  if (adsets.length) {
    const rows = adsets
      .filter((a) => a.campaign_id) // meta_adsets.campaign_id is NOT NULL + FK
      .map((a) => ({
        id: a.id,
        campaign_id: a.campaign_id,
        ad_account_id: accountId,
        name: a.name,
        status: a.status,
        effective_status: a.effective_status ?? null,
        daily_budget_minor: budgetMinor(a.daily_budget),
        lifetime_budget_minor: budgetMinor(a.lifetime_budget),
        created_time: a.created_time ?? null,
        meta_updated_time: a.updated_time ?? null,
        last_synced_at: new Date().toISOString(),
      }));
    await upsert(env, "meta_adsets", rows, { onConflict: "id" });
    counts.adsets += rows.length;
  }

  // --- ads -------------------------------------------------------------
  const { items: ads, cappedAt: adsCapped } = await metaGetAllPages(
    `/${accountId}/ads`,
    { fields: AD_FIELDS, limit: PAGE_LIMIT },
    env
  );
  if (adsCapped) detail.pagingCaps.push({ accountId, entity: "ads" });

  if (ads.length) {
    const rows = ads
      .filter((a) => a.adset_id && a.campaign_id) // meta_ads' FKs are both NOT NULL
      .map((a) => ({
        id: a.id,
        adset_id: a.adset_id,
        campaign_id: a.campaign_id,
        ad_account_id: accountId,
        name: a.name,
        status: a.status,
        effective_status: a.effective_status ?? null,
        creative_thumbnail_url: a.creative?.thumbnail_url ?? null,
        created_time: a.created_time ?? null,
        meta_updated_time: a.updated_time ?? null,
        last_synced_at: new Date().toISOString(),
      }));
    await upsert(env, "meta_ads", rows, { onConflict: "id" });
    counts.ads += rows.length;
  }

  // --- insights, three independent granularities ------------------------
  // Same underlying spend appears at all three levels (Meta's own reporting
  // works that way — see 0046's header) — never summed across levels here
  // or anywhere downstream.
  const timeRange = insightsTimeRange();
  for (const level of ["campaign", "adset", "ad"]) {
    const idField = level === "campaign" ? "campaign_id" : level === "adset" ? "adset_id" : "ad_id";
    const { items, cappedAt } = await metaGetAllPages(
      `/${accountId}/insights`,
      {
        level,
        fields: INSIGHTS_FIELDS,
        time_range: timeRange,
        time_increment: 1,
        limit: INSIGHTS_PAGE_LIMIT,
      },
      env
    );
    if (cappedAt) detail.pagingCaps.push({ accountId, entity: `insights:${level}` });

    const rows = items
      .filter((row) => row[idField] && row.date_start)
      .map((row) => ({
        entity_level: level,
        entity_id: row[idField],
        ad_account_id: accountId,
        date: row.date_start,
        impressions: row.impressions != null ? Number(row.impressions) : 0,
        clicks: row.clicks != null ? Number(row.clicks) : 0,
        spend: row.spend != null ? Number(row.spend) : 0, // major units — Meta reports it that way, never rescaled
        reach: row.reach != null ? Number(row.reach) : 0,
        conversions: row.actions || [], // Meta's raw `actions` array, straight into the jsonb column
        currency, // ad account's currency, snapshotted per row per 0046's schema comment
      }));

    if (rows.length) {
      await upsert(env, "meta_ad_insights", rows, { onConflict: "entity_level,entity_id,date" });
      counts.insightRows += rows.length;
    }
  }
}

/**
 * @param {object} env - Worker env (SUPABASE_URL, SUPABASE_SERVICE_KEY, META_ACCESS_TOKEN, META_API_VERSION)
 * @param {{triggerType: 'cron'|'manual', triggeredByPersonId?: string|null, triggeredByName?: string|null}} opts
 */
export async function runMetaAdsSync(env, { triggerType, triggeredByPersonId = null, triggeredByName = null } = {}) {
  const inserted = await insert(env, "meta_sync_runs", [
    {
      trigger_type: triggerType,
      triggered_by_person_id: triggeredByPersonId,
      triggered_by_name: triggeredByName,
      status: "running",
    },
  ]);
  const runId = inserted?.[0]?.id;
  if (!runId) {
    throw new Error("Could not start a meta_sync_runs record.");
  }

  const counts = { campaigns: 0, adsets: 0, ads: 0, insightRows: 0 };
  const accountsSynced = [];
  const accountErrors = [];
  const detail = { pagingCaps: [] };

  try {
    const accounts = await select(env, "meta_ad_accounts", {
      is_active: "eq.true",
      select: "id,name,currency,timezone_name",
    });

    for (const account of accounts) {
      try {
        await syncOneAccount(env, account, counts, detail);
        accountsSynced.push(account.id);
      } catch (err) {
        accountErrors.push({ accountId: account.id, message: err?.message || String(err) });
      }
    }

    if (accountErrors.length) detail.accountErrors = accountErrors;

    const status =
      accountErrors.length === 0 ? "success" : accountsSynced.length > 0 ? "partial" : "failed";

    await patch(
      env,
      "meta_sync_runs",
      { id: runId },
      {
        status,
        finished_at: new Date().toISOString(),
        ad_accounts_synced: accountsSynced,
        campaigns_synced: counts.campaigns,
        adsets_synced: counts.adsets,
        ads_synced: counts.ads,
        insight_rows_synced: counts.insightRows,
        error_message: accountErrors.length
          ? accountErrors.map((e) => `${e.accountId}: ${e.message}`).join("; ").slice(0, 2000)
          : null,
        detail,
      }
    );

    return {
      runId,
      status,
      adAccountsSynced: accountsSynced,
      campaignsSynced: counts.campaigns,
      adsetsSynced: counts.adsets,
      adsSynced: counts.ads,
      insightRowsSynced: counts.insightRows,
      errors: accountErrors,
    };
  } catch (err) {
    // Something failed outside the per-account loop (e.g. couldn't even
    // list meta_ad_accounts) — record what we can rather than leaving the
    // row stuck on 'running' forever.
    const message = (err?.message || String(err)).slice(0, 2000);
    await patch(
      env,
      "meta_sync_runs",
      { id: runId },
      { status: "failed", finished_at: new Date().toISOString(), error_message: message, detail }
    ).catch(() => {});
    return { runId, status: "failed", error: message };
  }
}

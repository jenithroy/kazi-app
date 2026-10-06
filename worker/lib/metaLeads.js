/**
 * Meta Lead Gen Webhook and Lead Ingestion
 *
 * Handles:
 * 1. Webhook verification GET /api/meta-ads/webhook (hub.mode, hub.challenge, hub.verify_token)
 * 2. Real-time Lead Event POST /api/meta-ads/webhook (extracts leadgen_id, queries Meta Graph API, saves lead)
 * 3. On-demand lead sync POST /api/meta-ads/sync-leads (queries Graph API for leads on lead gen ads/forms)
 */

import { metaGet } from "./metaGraph.js";
import { select, upsert } from "./supabaseRest.js";

const DEFAULT_VERIFY_TOKEN = "kazi_meta_leads_verify";

/**
 * Meta Webhook verification (GET challenge).
 */
export function handleLeadgenWebhookVerify(request, env) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expectedToken = env.META_WEBHOOK_VERIFY_TOKEN || DEFAULT_VERIFY_TOKEN;
  if (mode === "subscribe" && token === expectedToken) {
    return new Response(challenge || "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response("Forbidden", { status: 403 });
}

/**
 * Parses field_data array returned by Meta Graph API into contact info + dictionary.
 */
function parseFieldData(fieldData = []) {
  let fullName = "";
  let phoneNumber = "";
  let email = "";
  let city = "";
  const rawData = {};

  for (const f of fieldData) {
    if (!f || !f.name) continue;
    const key = f.name.toLowerCase().trim();
    const val = Array.isArray(f.values) ? f.values[0] : f.values || "";
    rawData[f.name] = val;

    if (key.includes("full_name") || key === "name") {
      fullName = val;
    } else if (key.includes("first_name")) {
      fullName = fullName ? `${val} ${fullName}` : val;
    } else if (key.includes("last_name")) {
      fullName = fullName ? `${fullName} ${val}` : val;
    } else if (key.includes("phone")) {
      phoneNumber = val;
    } else if (key.includes("email")) {
      email = val;
    } else if (key.includes("city")) {
      city = val;
    }
  }

  return { fullName, phoneNumber, email, city, rawData };
}

/**
 * Fetch a single lead from Meta Graph API by leadgen_id and upsert into Supabase.
 */
export async function fetchAndSaveLead(env, leadgenId, metadata = {}) {
  const leadData = await metaGet(`/${leadgenId}`, {
    fields: "id,created_time,ad_id,ad_name,form_id,field_data",
  }, env);

  const adId = metadata.adId || leadData.ad_id || null;
  const formId = metadata.formId || leadData.form_id || null;

  const { fullName, phoneNumber, email, city, rawData } = parseFieldData(leadData.field_data);

  let adName = leadData.ad_name || null;
  let campaignId = null;
  let campaignName = null;
  let adsetId = null;
  let adsetName = null;
  let adAccountId = null;

  if (adId) {
    try {
      const adRows = await select(env, "meta_ads", {
        id: `eq.${adId}`,
        select: "name,campaign_id,adset_id,ad_account_id,meta_campaigns(name),meta_adsets(name)",
      });
      if (adRows && adRows[0]) {
        const a = adRows[0];
        adName = a.name || adName;
        campaignId = a.campaign_id || null;
        adsetId = a.adset_id || null;
        adAccountId = a.ad_account_id || null;
        campaignName = a.meta_campaigns?.name || null;
        adsetName = a.meta_adsets?.name || null;
      }
    } catch (e) {
      console.warn("Could not lookup ad details for lead:", e);
    }
  }

  const row = {
    id: String(leadgenId),
    ad_account_id: adAccountId,
    campaign_id: campaignId,
    campaign_name: campaignName,
    adset_id: adsetId,
    adset_name: adsetName,
    ad_id: adId,
    ad_name: adName,
    form_id: formId,
    form_name: metadata.formName || null,
    full_name: fullName || null,
    phone_number: phoneNumber || null,
    email: email || null,
    city: city || null,
    raw_data: rawData,
    lead_created_at: leadData.created_time || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await upsert(env, "meta_leads", [row], { onConflict: "id" });
  return row;
}

/**
 * Handle incoming Meta Webhook event POST /api/meta-ads/webhook.
 */
export async function handleLeadgenWebhookEvent(request, env) {
  const payload = await request.json().catch(() => null);
  if (!payload || !Array.isArray(payload.entry)) {
    return Response.json({ ok: false, error: "Invalid webhook payload." }, { status: 400 });
  }

  const savedLeads = [];
  for (const entry of payload.entry) {
    if (!Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (change.field === "leadgen" && change.value) {
        const leadgenId = change.value.leadgen_id;
        const formId = change.value.form_id;
        const adId = change.value.ad_id;
        const pageId = change.value.page_id;
        if (leadgenId) {
          try {
            const saved = await fetchAndSaveLead(env, leadgenId, { formId, adId, pageId });
            savedLeads.push(saved);
          } catch (err) {
            console.error(`Failed to process lead ${leadgenId}:`, err);
          }
        }
      }
    }
  }

  return Response.json({ ok: true, processed: savedLeads.length });
}

/**
 * On-demand sync of leads from Meta Graph API for active lead ads.
 */
export async function syncLeadGenAds(env) {
  // Query all synced ads
  const ads = await select(env, "meta_ads", {
    select: "id,name,campaign_id,adset_id,ad_account_id,meta_campaigns(name),meta_adsets(name)",
    status: "eq.ACTIVE",
    limit: 50,
  });

  let syncedCount = 0;
  for (const ad of ads || []) {
    try {
      const res = await metaGet(`/${ad.id}/leads`, {
        fields: "id,created_time,field_data",
        limit: 25,
      }, env);

      if (Array.isArray(res?.data) && res.data.length > 0) {
        for (const item of res.data) {
          const { fullName, phoneNumber, email, city, rawData } = parseFieldData(item.field_data);
          const row = {
            id: String(item.id),
            ad_account_id: ad.ad_account_id || null,
            campaign_id: ad.campaign_id || null,
            campaign_name: ad.meta_campaigns?.name || null,
            adset_id: ad.adset_id || null,
            adset_name: ad.meta_adsets?.name || null,
            ad_id: ad.id,
            ad_name: ad.name,
            form_id: null,
            form_name: null,
            full_name: fullName || null,
            phone_number: phoneNumber || null,
            email: email || null,
            city: city || null,
            raw_data: rawData,
            lead_created_at: item.created_time || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          await upsert(env, "meta_leads", [row], { onConflict: "id" });
          syncedCount++;
        }
      }
    } catch {
      // Ad might not be a lead gen ad, continue to next
    }
  }

  return { syncedCount };
}

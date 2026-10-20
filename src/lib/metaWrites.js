/**
 * Every write the Meta Ads page makes. Two kinds:
 *
 *   on Meta        pause or resume an ad, change a budget, pull the latest data. These go through the app's own Worker (lib/metaAdsApi.js),
 *                  which is the only thing that holds Meta's key and which refuses a budget above the ceiling whoever asks. Real money.
 *   in the app     what is saved here: the copy of a campaign's state, the change log, a lead's status, a new customer, the guard rails,
 *                  the ad accounts. Each is read back, because row-level security drops a refused update without an error and a write
 *                  that is not checked looks like success.
 *
 * Each resolves to `{ ok, message?, warning?, … }` and touches nothing on screen. For the actions on Meta the order matters and is
 * spelled out: if Meta was not asked (or said no) nothing has changed anywhere, so `ok` is false; once Meta has done it, `ok` is true
 * whatever happens next, and anything the app could not save afterwards (its copy of the state, its log line) comes back as a
 * `warning`, never as a failure: reporting "That didn't work" for a budget Meta did change would invite a second, unwanted attempt.
 */
import { insertRow, updateRow } from "./db";
import { supabase } from "../supabase";
import { kathmanduDate } from "../utils/date";
import { runMetaAdsAction, runMetaAdsSync, runMetaLeadsSync } from "./metaAdsApi";
import { guardPayload } from "./metaCalc";

const COLLECTION = { campaign: "meta_campaigns", adset: "meta_adsets", ad: "meta_ads" };
const NO_PERMISSION = "Not saved. You may not have permission to change this.";
const NO_CONNECTION = "Not saved. Check your connection and try again.";

const denied = (err) => err?.code === "42501" || /row-level security|permission denied/i.test(String(err?.message || ""));
const failure = (err) => ({ ok: false, message: denied(err) ? NO_PERMISSION : NO_CONNECTION });

const logRow = (entity, level, action, field, before, after, confirmedOverCeiling = false) => ({
  entityLevel: level, entityId: entity.id, entityName: entity.name, action, field: field || null, before, after, confirmedOverCeiling,
});

/** What the app could not save after Meta had acted, as one sentence (or ""). */
const afterwards = (failed) => (failed.length ? `Done on Meta, but ${failed.join(" and ")} could not be updated here. Press Sync now to bring this page up to date.` : "");

/**
 * Pause or resume a campaign, ad set or ad. `action` is "pause" or "resume". `hold` is what keeps it from delivering once it is on, if
 * anything does (CAMPAIGN_PAUSED or ADSET_PAUSED, from lib/metaCalc.js `parentHold`): the Worker's answer does not say what the thing's
 * delivery status now is, and "ACTIVE" for an ad set under a paused campaign would be a lie that invites spending.
 */
export async function pauseResume(entity, level, action, hold = null) {
  const status = action === "pause" ? "PAUSED" : "ACTIVE";
  let res;
  try {
    res = await runMetaAdsAction({ entityLevel: level, entityId: entity.id, action });
  } catch (err) {
    return { ok: false, message: err?.message || "That didn't work." };
  }
  const effectiveStatus = res?.newState?.effective_status || (action === "resume" && hold) || status;
  const failed = [];
  try {
    const saved = await updateRow(COLLECTION[level], entity.id, { status, effectiveStatus });
    if (!saved || saved.status !== status) failed.push("this page's copy of its state");
  } catch { failed.push("this page's copy of its state"); }
  try {
    await insertRow("meta_ads_actions", logRow(entity, level, action, null, { status: entity.status }, { status }));
  } catch { failed.push("the change log"); }
  return { ok: true, status, effectiveStatus, warning: afterwards(failed) };
}

/** Change a budget. `field` is "daily_budget" or "lifetime_budget"; `valueMinor` is in the account's minor units (cents). */
export async function editBudget({ entity, level, field, valueMinor, confirmedOverCeiling }) {
  try {
    await runMetaAdsAction({ entityLevel: level, entityId: entity.id, action: "budget_edit", field, valueMinor });
  } catch (err) {
    return { ok: false, message: err?.message || "That didn't work." };
  }
  const key = field === "daily_budget" ? "dailyBudgetMinor" : "lifetimeBudgetMinor";
  const failed = [];
  try {
    const saved = await updateRow(COLLECTION[level], entity.id, { [key]: valueMinor });
    if (!saved || Number(saved[key]) !== valueMinor) failed.push("this page's copy of its budget");
  } catch { failed.push("this page's copy of its budget"); }
  try {
    await insertRow("meta_ads_actions", logRow(entity, level, "budget_edit", field, { [field]: entity[key] }, { [field]: valueMinor }, confirmedOverCeiling));
  } catch { failed.push("the change log"); }
  return { ok: true, key, valueMinor, warning: afterwards(failed) };
}

/** Pull the latest campaigns, ad sets, ads and insights from Meta. */
export async function syncAds() {
  try {
    return { ok: true, res: await runMetaAdsSync() };
  } catch (err) {
    return { ok: false, message: err?.message || "Sync failed." };
  }
}

/** Pull any new leads from active lead ads. */
export async function syncLeads() {
  try {
    return { ok: true, res: await runMetaLeadsSync() };
  } catch (err) {
    return { ok: false, message: err?.message || "Failed to sync leads from Meta." };
  }
}

/** Set a lead's status (new, contacted, qualified, converted, archived). */
export async function setLeadStatus(lead, status) {
  try {
    const saved = await updateRow("meta_leads", lead.id, { status });
    if (!saved) return { ok: false, gone: true, message: "That lead is no longer there." };
    if (String(saved.status) !== status) return { ok: false, message: NO_PERMISSION };
    return { ok: true, row: saved };
  } catch (err) {
    console.error("Failed to set a lead's status:", err);
    return failure(err);
  }
}

/**
 * Make a lead a customer: add the customer (named, with the phone, email and city the form gave, and the campaign it came from),
 * then link the lead to them and mark it converted. A lead that is already a customer is refused, so pressing twice cannot make two.
 * If the customer was created but the lead could not be linked, `partial` says so and `customerId` names them, so nobody adds them again.
 */
export async function convertLead(lead) {
  if (lead.customerId || String(lead.status || "").toLowerCase() === "converted") {
    return { ok: false, message: `${lead.fullName || "This lead"} is already a customer.` };
  }
  let customer;
  try {
    customer = await insertRow("customers", {
      name: lead.fullName || "Meta Ad Lead",
      phone: lead.phoneNumber || "",
      email: lead.email || "",
      city: lead.city || "",
      sourceCampaignId: lead.campaignId || null,
      sourceNote: `Meta Lead Form: ${lead.campaignName || "Ad"} · ${kathmanduDate()}`,
      notes: lead.notes || "",
    });
  } catch (err) {
    console.error("Failed to create a customer from a lead:", err);
    return { ok: false, message: denied(err) ? "The customer was not created. You may not have permission to add customers." : "The customer was not created. Check your connection and try again." };
  }
  const partial = (why) => ({ ok: false, partial: true, customerId: customer?.id || null, message: `The customer was created, but ${why}. Do not add them again: find them in Customers.` });
  if (!customer?.id) return partial("could not be read back to link the lead");
  try {
    const saved = await updateRow("meta_leads", lead.id, { customerId: customer.id, status: "converted" });
    if (!saved || saved.customerId !== customer.id) return partial("the lead could not be marked as converted");
  } catch (err) {
    console.error("Failed to link a lead to its customer:", err);
    return partial("the lead could not be marked as converted");
  }
  return { ok: true, customer };
}

/**
 * Finish what `convertLead` could not: the customer was created (`customerId`) but the lead was not linked to them. Nothing new is
 * created, so pressing this again and again can never make a second customer.
 */
export async function linkLead(lead, customerId) {
  const still = { ok: false, partial: true, customerId, message: "The lead still could not be marked as converted. The customer is there: find them in Customers, do not add them again." };
  try {
    const saved = await updateRow("meta_leads", lead.id, { customerId, status: "converted" });
    if (!saved || saved.customerId !== customerId) return still;
    return { ok: true, customer: { id: customerId } };
  } catch (err) {
    console.error("Failed to link a lead to its customer:", err);
    return still;
  }
}

/** Save the budget guard rails (ceiling, its currency, the confirm multiple). `draft` has been through `guardProblem`. */
export async function saveGuardRails(draft) {
  const payload = guardPayload(draft);
  try {
    const saved = await updateRow("meta_ads_settings", "default", payload);
    const same = saved
      && (saved.budgetCeilingMinor == null ? payload.budgetCeilingMinor == null : Number(saved.budgetCeilingMinor) === payload.budgetCeilingMinor)
      && (saved.budgetCeilingCurrency || null) === payload.budgetCeilingCurrency
      && Number(saved.confirmMultiplier) === payload.confirmMultiplier;
    if (!same) return { ok: false, message: NO_PERMISSION };
    return { ok: true, row: saved };
  } catch (err) {
    console.error("Failed to save the guard rails:", err);
    return failure(err);
  }
}

/** Add an ad account by its id ("act_" and digits). */
export async function addAccount(id) {
  try {
    const { error } = await supabase.from("meta_ad_accounts").insert({ id, is_active: true });
    if (error) {
      if (error.code === "23505" || error.message?.includes("duplicate") || error.message?.includes("already exists")) return { ok: false, message: "That account is already added." };
      throw error;
    }
    return { ok: true };
  } catch (err) {
    console.error("Failed to add an ad account:", err);
    return { ok: false, message: denied(err) ? "You may not have permission to add ad accounts." : err?.message || "Couldn't add that ad account." };
  }
}

/** Start or stop tracking an ad account. */
export async function setAccountActive(account, active) {
  try {
    const saved = await updateRow("meta_ad_accounts", account.id, { isActive: active });
    if (!saved || Boolean(saved.isActive) !== active) return { ok: false, message: NO_PERMISSION };
    return { ok: true, row: saved };
  } catch (err) {
    console.error("Failed to change an ad account:", err);
    return failure(err);
  }
}

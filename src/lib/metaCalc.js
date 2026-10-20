/**
 * The Meta Ads page's rules and sums, with nothing on screen: which dates the address asks for, how the insight rows add up (spend,
 * results, a trend, a campaign's share), what needs attention, what a budget edit may be, how leads are filtered, counted and
 * exported, what the attribution table makes of its rows, how the change log reads, and what the settings form may save.
 *
 * Money here is in each ad account's own currency, exactly (lib/metaMoney.js), never the app's NPR conversion. Nothing in this file
 * reads the clock or the database: the date and the rows come in, so every figure can be worked out by hand and checked.
 */
import { addDays, monthShort, parseISO } from "./calendar";
import {
  countComments, countLeads, countLinkClicks, countMessages, countReactions, summarizeEngagement,
} from "./metaActions";
import { moneyMinor } from "./metaMoney";

export { summarizeEngagement };

/* ── The views and the date range ─────────────────────────────── */

export const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "campaigns", label: "Campaigns" },
  { id: "leads", label: "Leads" },
  { id: "attribution", label: "Attribution" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];
export const viewOf = (v) => (VIEWS.some((x) => x.id === v) ? v : "overview");
/** The views whose numbers follow the date range (Leads, Activity and Settings are not about a period). */
export const RANGE_VIEWS = ["overview", "campaigns", "attribution"];

export const PRESETS = [{ label: "7d", days: 7 }, { label: "30d", days: 30 }, { label: "90d", days: 90 }];

const isoOrBlank = (s) => s === "" || Boolean(parseISO(s));

/**
 * The range the address asks for. No `from` and `to` means the last 30 days; both empty means all time. A value that is not a date
 * is as good as missing, and a range that runs backwards is turned round.
 */
export function rangeOf(params, today) {
  let from = params.has("from") ? params.get("from") : addDays(today, -30);
  let to = params.has("to") ? params.get("to") : today;
  if (!isoOrBlank(from)) from = addDays(today, -30);
  if (!isoOrBlank(to)) to = today;
  if (from && to && from > to) [from, to] = [to, from];
  return { dateFrom: from, dateTo: to };
}

/** "all" | 7 | 30 | 90 | "custom": which button of the range control is pressed. */
export function presetOf({ dateFrom, dateTo }, today) {
  if (!dateFrom && !dateTo) return "all";
  const hit = PRESETS.find((p) => dateFrom === addDays(today, -p.days) && dateTo === today);
  return hit ? hit.days : "custom";
}

/** The range after the person picked `value` for one end of it: not after today, and never backwards (the other end follows). */
export function pickRange({ dateFrom, dateTo }, end, value, today) {
  let from = dateFrom;
  let to = dateTo;
  if (end === "from") from = value; else to = value;
  if (from && from > today) from = today;
  if (to && to > today) to = today;
  if (from && to && from > to) { if (end === "from") to = from; else from = to; }
  return { dateFrom: from, dateTo: to };
}

export const presetRange = (days, today) => ({ dateFrom: addDays(today, -days), dateTo: today });

/** "3 Oct" */
export const fmtShort = (iso) => { const p = parseISO(iso); return p ? `${p.d} ${monthShort(p.m)}` : ""; };

/** Every day from `from` to `to`, or [] when either is missing, the range runs backwards, or it is longer than `cap` days. */
export function daysList(from, to, cap = 400) {
  if (!parseISO(from) || !parseISO(to) || from > to) return [];
  const out = [];
  for (let d = from; d <= to && out.length <= cap; d = addDays(d, 1)) out.push(d);
  return out.length > cap ? [] : out;
}

export function rangeWords({ dateFrom, dateTo }) {
  if (!dateFrom && !dateTo) return "all time";
  if (dateFrom && dateTo) return `${fmtShort(dateFrom)} – ${fmtShort(dateTo)}`;
  return dateFrom ? `since ${fmtShort(dateFrom)}` : `up to ${fmtShort(dateTo)}`;
}

/* ── Time ─────────────────────────────────────────────────────── */

/** "just now", "5m ago", "3h ago", "2d ago"; "Never" for nothing, "—" for something that is not a time. `now` is the clock, in ms. */
export function timeAgo(date, now = Date.now()) {
  if (!date) return "Never";
  const ms = typeof date === "number" ? date : new Date(date).getTime();
  if (Number.isNaN(ms)) return "—";
  const diff = Math.floor((now - ms) / 1000);
  if (diff < 15) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatDateTime(date) {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
}

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const WHEN_YEAR = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
/** "19 Oct, 10:00": a time for a table cell (with the year when it is not this year's). `now` is the clock, in ms. */
export function whenShort(date, now = Date.now()) {
  const d = new Date(date);
  if (!date || Number.isNaN(d.getTime())) return "—";
  return (d.getFullYear() === new Date(now).getFullYear() ? WHEN : WHEN_YEAR).format(d);
}

export function duration(startedAt, finishedAt) {
  if (!startedAt || !finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!(ms >= 0)) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Rows newest first by a time field (the server is asked to sort, but the page does not rely on it: the latest sync and the top of the log must be the latest). */
export const newestFirst = (rows, key) => [...rows].sort((a, b) => String(b[key] ?? "").localeCompare(String(a[key] ?? "")));

/* ── Delivery status ──────────────────────────────────────────── */

/** Meta's delivery statuses: what to call each and how it should look (the tone is a Tag tone: good, info, warn, bad, or none). */
export const STATUS = {
  ACTIVE: { label: "Active", tone: "good" },
  PAUSED: { label: "Paused", tone: "" },
  CAMPAIGN_PAUSED: { label: "Paused by campaign", tone: "" },
  ADSET_PAUSED: { label: "Paused by ad set", tone: "" },
  PENDING_REVIEW: { label: "In review", tone: "info" },
  IN_PROCESS: { label: "Processing", tone: "info" },
  WITH_ISSUES: { label: "Has issues", tone: "warn" },
  PENDING_BILLING_INFO: { label: "Billing needed", tone: "warn" },
  DISAPPROVED: { label: "Disapproved", tone: "bad" },
  ARCHIVED: { label: "Archived", tone: "" },
  DELETED: { label: "Deleted", tone: "" },
};

export const SYNC_STATUS = {
  success: { label: "Synced", tone: "good" },
  partial: { label: "Partly synced", tone: "warn" },
  failed: { label: "Failed", tone: "bad" },
  running: { label: "Syncing", tone: "info" },
};

export function statusOf(effectiveStatus, status) {
  const key = effectiveStatus || status;
  if (!key) return { label: "—", tone: "" };
  if (STATUS[key]) return STATUS[key];
  return { label: key.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), tone: "" };
}

export const PAUSED_BY_PARENT = { CAMPAIGN_PAUSED: "Paused by campaign", ADSET_PAUSED: "Paused by ad set" };
const effective = (e) => String(e.effectiveStatus || e.status || "").toUpperCase();
export const isArchived = (e) => { const s = effective(e); return s === "ARCHIVED" || s === "DELETED"; };
const ISSUES = ["WITH_ISSUES", "PENDING_BILLING_INFO", "DISAPPROVED"];

/** Can this one be paused or resumed from here? Only an active or paused one, not archived or deleted, whose parent is not what is holding it. */
export const canToggle = (e) => !PAUSED_BY_PARENT[e.effectiveStatus] && !isArchived(e) && (e.status === "ACTIVE" || e.status === "PAUSED");
export const hasOwnBudget = (e) => e.dailyBudgetMinor != null || e.lifetimeBudgetMinor != null;

const SWITCHED_OFF = ["PAUSED", "ARCHIVED", "DELETED"];
/**
 * What would keep a thing from delivering once it is switched on: its campaign (for an ad set or an ad) or its ad set (for an ad) being
 * off. Meta then calls it CAMPAIGN_PAUSED or ADSET_PAUSED although its own switch is on. `parents` is `{ campaign, adset }`, as far as they
 * are known here; null when nothing holds it. (Resuming an ad set under a paused campaign used to show a green "Active".)
 */
export function parentHold(level, { campaign = null, adset = null } = {}) {
  const off = (p) => Boolean(p) && SWITCHED_OFF.includes(String(p.status).toUpperCase());
  if (level !== "campaign" && off(campaign)) return "CAMPAIGN_PAUSED";
  if (level === "ad" && off(adset)) return "ADSET_PAUSED";
  return null;
}

/** The campaign filters' counts and the filter itself: all | active | paused | issues (archived ones only when asked for). */
export function filterCampaigns(campaigns, { query = "", status = "all", archived = false }) {
  const q = query.toLowerCase().trim();
  return campaigns.filter((c) => {
    if (!archived && isArchived(c)) return false;
    const eff = effective(c);
    if (status === "active" && eff !== "ACTIVE") return false;
    if (status === "paused" && eff !== "PAUSED" && eff !== "CAMPAIGN_PAUSED") return false;
    if (status === "issues" && !ISSUES.includes(eff)) return false;
    if (q && !c.name?.toLowerCase().includes(q) && !c.objective?.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function campaignCounts(campaigns, archived) {
  const shown = campaigns.filter((c) => archived || !isArchived(c));
  const eff = (c) => effective(c);
  return {
    all: shown.length,
    active: shown.filter((c) => eff(c) === "ACTIVE").length,
    paused: shown.filter((c) => eff(c) === "PAUSED" || eff(c) === "CAMPAIGN_PAUSED").length,
    issues: shown.filter((c) => ISSUES.includes(eff(c))).length,
    archived: campaigns.filter(isArchived).length,
  };
}

/** "Messages", "Lead generation": an objective as words. */
export const objectiveWords = (o) => (o ? String(o).toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "");

/* ── Insight rows added up ────────────────────────────────────── */

/**
 * What a campaign's results are, by what it was made to get: messages for a messaging or engagement campaign, leads for a lead
 * campaign, link clicks for traffic; where its own kind has none, the first of messages, leads and link clicks there is any of.
 */
export function countCampaignResults(actions, objective) {
  if (!actions) return 0;
  const obj = (objective || "").toUpperCase();
  if (obj.includes("MESSAG") || obj.includes("ENGAGEMENT")) {
    const n = countMessages(actions);
    if (n > 0) return n;
  } else if (obj.includes("LEAD")) {
    const n = countLeads(actions);
    if (n > 0) return n;
  } else if (obj.includes("TRAFFIC") || obj.includes("LINK_CLICK")) {
    const n = countLinkClicks(actions);
    if (n > 0) return n;
  }
  const targets = [
    "onsite_conversion.messaging_conversation_started_7d",
    "onsite_conversion.messaging_conversation_started",
    "onsite_conversion.total_messaging_connection",
    "contact",
    "lead",
    "link_click",
  ];
  let list = actions;
  if (typeof actions === "string") { try { list = JSON.parse(actions); } catch { return 0; } }
  if (!Array.isArray(list)) return 0;
  for (const t of targets) {
    const act = list.find((a) => a && a.action_type === t);
    if (act && Number(act.value) > 0) return Number(act.value);
  }
  return 0;
}

/** Rows grouped by their currency (a row with none is "?"). */
export function groupByCurrency(rows) {
  const groups = {};
  for (const r of rows) (groups[r.currency || "?"] ||= []).push(r);
  return groups;
}
/** The chosen currency if there are rows in it, else the first there is, else USD. */
export const pickCurrency = (groups, chosen) => {
  const keys = Object.keys(groups);
  return chosen && keys.includes(chosen) ? chosen : keys[0] || "USD";
};

export function totalsOf(rows, objectiveByCampaign = {}) {
  return {
    spend: rows.reduce((s, r) => s + Number(r.spend || 0), 0),
    clicks: rows.reduce((s, r) => s + Number(r.clicks || 0), 0),
    linkClicks: rows.reduce((s, r) => s + countLinkClicks(r.conversions), 0),
    impressions: rows.reduce((s, r) => s + Number(r.impressions || 0), 0),
    results: rows.reduce((s, r) => s + countCampaignResults(r.conversions, objectiveByCampaign[r.campaignId]), 0),
  };
}

/** Click-through rate: of link clicks where there are any, else of all clicks. */
export function ctrOf(t) {
  const link = t.linkClicks > 0;
  return { label: link ? "CTR (link)" : "CTR (all)", value: t.impressions ? `${(((link ? t.linkClicks : t.clicks) / t.impressions) * 100).toFixed(2)}%` : "—", link };
}

export const METRICS = [
  { id: "spend", label: "Spend" },
  { id: "messages", label: "Messages" },
  { id: "comments", label: "Comments" },
  { id: "leads", label: "Leads" },
  { id: "clicks", label: "Clicks" },
  { id: "impressions", label: "Impressions" },
  { id: "results", label: "All results" },
];

/** One metric per day over the range (a day with nothing is 0); with no usable range, the days that have rows. */
export function trendOf(rows, metric, { dateFrom, dateTo }, objectiveByCampaign = {}) {
  const byDate = {};
  for (const r of rows) {
    let v = 0;
    if (metric === "spend") v = Number(r.spend || 0);
    else if (metric === "clicks") v = Number(r.clicks || 0);
    else if (metric === "impressions") v = Number(r.impressions || 0);
    else if (metric === "messages") v = countMessages(r.conversions);
    else if (metric === "comments") v = countComments(r.conversions);
    else if (metric === "leads") v = countLeads(r.conversions);
    else if (metric === "results") v = countCampaignResults(r.conversions, objectiveByCampaign[r.campaignId]);
    byDate[r.date] = (byDate[r.date] || 0) + v;
  }
  const span = daysList(dateFrom, dateTo);
  const dates = span.length > 0 ? span : Object.keys(byDate).sort();
  return { dates, values: dates.map((d) => byDate[d] || 0) };
}

/** The campaigns that took the most, in order: [{ id, name, spend }]. */
export function spendByCampaign(rows, nameOf = {}, limit = 8) {
  const sums = {};
  for (const r of rows) sums[r.campaignId] = (sums[r.campaignId] || 0) + Number(r.spend || 0);
  return Object.entries(sums).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id, spend]) => ({ id, name: nameOf[id] || id, spend }));
}

/** The first day any row is for, or null. */
export const earliestDate = (rows) => rows.map((r) => r.date).filter(Boolean).sort()[0] || null;
/** "Data starts 3 Oct" when the range reaches back further than the data does. */
export const dataStarts = (earliest, dateFrom) => (earliest && dateFrom && earliest > dateFrom ? `Data starts ${fmtShort(earliest)}` : "");

const ZERO = () => ({ spend: 0, clicks: 0, impressions: 0, messages: 0, comments: 0, leads: 0, reactions: 0 });
function finish(m) {
  m.totalInquiries = m.messages + m.comments + m.leads;
  m.costPerInquiry = m.totalInquiries > 0 ? m.spend / m.totalInquiries : null;
  return m;
}
/** Insight rows added up per campaign (`key` "campaignId") or per ad set / ad (`key` "entity_id"). */
export function metricsBy(rows, key) {
  const map = {};
  for (const r of rows) {
    const id = r[key];
    const m = (map[id] ||= ZERO());
    m.spend += Number(r.spend || 0);
    m.clicks += Number(r.clicks || 0);
    m.impressions += Number(r.impressions || 0);
    m.messages += countMessages(r.conversions);
    m.comments += countComments(r.conversions);
    m.leads += countLeads(r.conversions);
    m.reactions += countReactions(r.conversions);
  }
  for (const id of Object.keys(map)) finish(map[id]);
  return map;
}

/* ── What needs attention ─────────────────────────────────────── */

/** The sentences for the strip above the overview, or [] when all is well. `now` is the clock, in ms. */
export function attentionOf({ campaigns = [], accounts = [], latestSync = null, now = Date.now() }) {
  const issues = [];
  const trouble = campaigns.filter((c) => ["DISAPPROVED", "WITH_ISSUES", "PENDING_BILLING_INFO"].includes(c.effectiveStatus));
  if (trouble.length > 0) issues.push(trouble.length === 1 ? "1 campaign has issues" : `${trouble.length} campaigns have issues`);
  if (latestSync && (latestSync.status === "failed" || latestSync.status === "partial")) issues.push(`Last sync ${latestSync.status}`);
  const stale = accounts.filter((a) => a.isActive && a.lastSyncedAt && now - new Date(a.lastSyncedAt).getTime() > 2 * 3600 * 1000);
  if (stale.length > 0) issues.push("Account sync overdue (>2h)");
  return issues;
}

export function accountLabel(accounts) {
  const active = accounts.filter((a) => a.isActive);
  if (active.length === 1) return `${active[0].name || active[0].id} · ${active[0].currency || "USD"}`;
  if (active.length > 1) return `${active.length} accounts active`;
  return accounts.length > 0 ? "Accounts paused" : "No accounts configured";
}

/** The header's line about the last sync: how it went and when, from the latest run. (A failed run used to read "Synced 5m ago".) */
export function syncLine(run, now = Date.now()) {
  if (!run) return "Never synced";
  const ago = timeAgo(run.finishedAt || run.startedAt, now);
  if (run.status === "failed") return `Last sync failed ${ago}`;
  if (run.status === "partial") return `Synced ${ago}, with errors`;
  if (run.status === "running") return `Sync started ${ago}`;
  return `Synced ${ago}`;
}

const stop = (s) => (/[.!?]$/.test(s) ? s : `${s}.`);
/**
 * What the Worker's sync answered, as a notice `{ tone, text }`. It answers 200 whatever happened and says how it went in `status`:
 * "success", "partial" (some accounts synced, some did not) or "failed" (none did, or it could not start), with `errors` (one per
 * account) or `error`. Reading only the counts reported "Synced ? campaigns" for a token that had expired.
 */
export function syncNotice(res) {
  const r = res || {};
  const n = (v) => (v == null ? "?" : v);
  const counts = `${n(r.campaignsSynced)} campaigns, ${n(r.adsetsSynced)} ad sets, ${n(r.adsSynced)} ads`;
  const lost = [r.error, ...(Array.isArray(r.errors) ? r.errors.map((e) => (e?.accountId ? `${e.accountId}: ${e.message}` : e?.message)) : [])].filter(Boolean).join("; ");
  const hint = errorHint(lost);
  const because = lost ? `: ${lost}` : "";
  if (r.status === "failed") return { tone: "bad", text: `${stop(`Sync failed${because}`)}${hint ? ` ${hint}` : ""}` };
  if (r.status === "partial") return { tone: "warn", text: `${stop(`Synced ${counts}, but not every account${because}`)}${hint ? ` ${hint}` : ""}` };
  if (Array.isArray(r.adAccountsSynced) && r.adAccountsSynced.length === 0) return { tone: "warn", text: "Nothing was synced: no ad account is being tracked. Add one in Settings." };
  return { tone: "info", text: `Synced ${counts}.` };
}

/** True when a sync run hit Meta's paging limit somewhere. (The Worker always writes `pagingCaps`, an empty list when nothing was capped.) */
export const pagingCapped = (run) => {
  const caps = run?.detail?.pagingCaps;
  return Array.isArray(caps) ? caps.length > 0 : Boolean(caps);
};

/* ── A budget edit ────────────────────────────────────────────── */

/**
 * What a budget edit may be, judged as it is typed: more than nothing, not above the ceiling (a hard stop, in the ceiling's currency
 * and the account's, which must be the same), and not more than `confirmMultiplier` times what it is now unless the person has said
 * they meant it. The server judges the ceiling again; this is so the person is told before pressing Save, not after.
 */
export function budgetCheck({ amount, currentMinor, ceilingMinor, ceilingCurrency, currency, confirmMultiplier, confirmed }) {
  const multiple = Number(confirmMultiplier) >= 1 ? Number(confirmMultiplier) : 3;
  const valueMinor = Math.round((Number(amount) || 0) * 100);
  const hasCeiling = ceilingMinor != null;
  const ceilingCur = (ceilingCurrency || "").toUpperCase();
  const accountCur = (currency || "").toUpperCase();

  let blocker = "";
  if (amount !== "" && valueMinor <= 0) blocker = "Enter a budget greater than zero.";
  else if (hasCeiling && !ceilingCur) blocker = "The budget ceiling has no currency set. Set it in Meta Ads → Settings first.";
  else if (hasCeiling && ceilingCur !== accountCur) blocker = `The budget ceiling is in ${ceilingCur} but this ad account spends in ${accountCur || "an unknown currency"}. Change the ceiling's currency in Meta Ads → Settings.`;
  else if (hasCeiling && valueMinor > ceilingMinor) blocker = `Above your ${moneyMinor(ceilingMinor, ceilingCur)} ceiling. Meta Ads → Settings`;

  const overMultiplier = !blocker && currentMinor ? valueMinor > currentMinor * multiple : false;
  const unchanged = !blocker && currentMinor != null && valueMinor > 0 && valueMinor === currentMinor;          // pressing Enter on the untouched box sent a real edit of nothing
  const canSave = !blocker && valueMinor > 0 && !unchanged && (!overMultiplier || Boolean(confirmed));
  return {
    valueMinor, blocker, overMultiplier, unchanged, canSave,
    deltaMinor: currentMinor != null && valueMinor > 0 ? valueMinor - currentMinor : 0,
    // how many times the current budget, to two places and no trailing noughts: 3.05, 3.1, 25 ("3.0×" for a figure over the line read as if it were not)
    ratio: currentMinor ? String(Number((valueMinor / currentMinor).toFixed(2))) : 0,
  };
}

/** Which budget an entity has: daily unless it has only a lifetime one. */
export function budgetFieldOf(entity) {
  const daily = entity.dailyBudgetMinor != null || entity.lifetimeBudgetMinor == null;
  return { daily, field: daily ? "daily_budget" : "lifetime_budget", currentMinor: daily ? entity.dailyBudgetMinor : entity.lifetimeBudgetMinor };
}

/* ── Leads ────────────────────────────────────────────────────── */

export const LEAD_STATUSES = [
  { id: "new", label: "New", tone: "good" },
  { id: "contacted", label: "Contacted", tone: "info" },
  { id: "qualified", label: "Qualified", tone: "info" },
  { id: "converted", label: "Converted", tone: "good" },
  { id: "archived", label: "Archived", tone: "" },
];
export const leadStatus = (l) => String(l.status || "new").toLowerCase();
export function leadStatusMeta(status) {
  const s = String(status || "new").toLowerCase();
  return LEAD_STATUSES.find((o) => o.id === s) || { id: s, label: s.replace(/^./, (c) => c.toUpperCase()), tone: "" };
}

const DEVANAGARI_DIGIT = /[०-९]/g;
/**
 * A phone number as WhatsApp and the dialler want it. `wa` is the number with its country code, digits only (what wa.me takes), or ""
 * when the country cannot be told (a number in national form, such as a landline 01…, cannot be sent to WhatsApp); `tel` is what to dial:
 * "+" and the country code when known, else the digits as written. Written with a "+", with 00 in front (how Nepal dials abroad), as a
 * bare Nepali 98… mobile number, with a 0 before that, or in Devanagari digits: all of these were handled badly or not at all.
 */
export function phoneLinks(phone) {
  const raw = String(phone ?? "").replace(DEVANAGARI_DIGIT, (d) => String(d.charCodeAt(0) - 0x0966));
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { wa: "", tel: "" };
  let intl = "";
  if (/^[^\d]*\+/.test(raw)) intl = digits;
  else if (digits.startsWith("00")) intl = digits.slice(2);
  else if (/^98\d{8}$/.test(digits)) intl = `977${digits}`;
  else if (/^098\d{8}$/.test(digits)) intl = `977${digits.slice(1)}`;
  else if (!digits.startsWith("0") && digits.length >= 10) intl = digits;            // written with its country code and no "+": 9779841234567, 447123456789
  const wa = intl.length >= 8 && intl.length <= 15 ? intl : "";
  return { wa, tel: wa ? `+${wa}` : digits };
}
/** The digits for a WhatsApp link, or "". */
export const cleanPhone = (phone) => phoneLinks(phone).wa;
export const whatsappUrl = (lead) => {
  const n = cleanPhone(lead.phoneNumber);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(`Hello ${lead.fullName || ""}, thank you for contacting Kazi Manufacturing!`)}` : "";
};

export const leadWhen = (l) => l.leadCreatedAt || l.createdAt || "";

export function filterLeads(leads, { status = "all", query = "" }) {
  const q = query.toLowerCase().trim();
  return leads.filter((l) => {
    if (status !== "all" && leadStatus(l) !== status) return false;
    if (q) {
      const hit = l.fullName?.toLowerCase().includes(q) || l.phoneNumber?.includes(q) || l.email?.toLowerCase().includes(q)
        || l.campaignName?.toLowerCase().includes(q) || l.city?.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
}

export function leadStats(leads) {
  const total = leads.length;
  const newLeads = leads.filter((l) => leadStatus(l) === "new").length;
  const contacted = leads.filter((l) => leadStatus(l) === "contacted" || leadStatus(l) === "qualified").length;
  const converted = leads.filter((l) => leadStatus(l) === "converted").length;
  return { total, newLeads, contacted, converted, convRate: total > 0 ? ((converted / total) * 100).toFixed(1) : "0.0" };
}

export const leadCounts = (leads) => ({
  all: leads.length,
  ...Object.fromEntries(LEAD_STATUSES.map((s) => [s.id, leads.filter((l) => leadStatus(l) === s.id).length])),
});

const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;
/**
 * One cell of a CSV file. Quotes are doubled, and a cell that a spreadsheet would run as a formula (it starts with = + - @ or a tab or
 * carriage return, and is not just digits, a sign allowed) gets a ' in front so it opens as the text it is: these cells are what
 * strangers typed into a lead form. ("+977 98…" and "+977-98…" are formulas to a spreadsheet, so only unbroken digits are left alone.)
 */
export function csvCell(value) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export const CSV_HEAD = ["ID", "Full Name", "Phone", "Email", "City", "Status", "Campaign Name", "Ad Name", "Date Received"];
export function leadsCsv(leads) {
  const rows = leads.map((l) => [l.id, l.fullName, l.phoneNumber, l.email, l.city, l.status || "new", l.campaignName, l.adName, leadWhen(l)]);
  return [CSV_HEAD.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
}

/* ── Attribution ──────────────────────────────────────────────── */

/**
 * ROAS is a number only when there is something to measure: spend, at least one tagged order, and a known rate to NPR (order value is
 * in NPR, spend in the account's currency). Otherwise it says why, never "0.00×" and never a "converting…" that does not end.
 * `rates` maps a currency to its NPR value; a currency missing from it is still being fetched, one that is null has no rate.
 */
export function roasOf(r, rates) {
  if (!(Number(r.spend) > 0)) return { text: "—", title: "No spend in this range" };
  if (!(Number(r.taggedOrders) > 0)) return { text: "—", title: "No tagged orders yet" };
  let spendNpr;
  if (r.currency === "NPR") spendNpr = Number(r.spend);
  else if (!(r.currency in rates)) return { text: "…", title: "Fetching exchange rate" };
  else if (rates[r.currency]) spendNpr = Number(r.spend) * rates[r.currency];
  else return { text: "—", title: `No ${r.currency}→NPR rate available` };
  return { text: `${(Number(r.taggedOrderValueNpr) / spendNpr).toFixed(2)}×`, title: "" };
}

export const attributionActive = (r) => Number(r.spend) > 0 || Number(r.taggedCustomers) > 0 || Number(r.taggedOrders) > 0;

/** Most spend first, then most order value. */
export function attributionSorted(rows) {
  return [...rows].sort((a, b) => (Number(b.spend || 0) - Number(a.spend || 0)) || (Number(b.taggedOrderValueNpr || 0) - Number(a.taggedOrderValueNpr || 0)));
}

/** The totals line: customers, orders, order value, spend in each currency, cost per customer (one currency only) and overall ROAS. */
export function attributionTotals(rows, rates) {
  const customers = rows.reduce((s, r) => s + (Number(r.taggedCustomers) || 0), 0);
  const orders = rows.reduce((s, r) => s + (Number(r.taggedOrders) || 0), 0);
  const valueNpr = rows.reduce((s, r) => s + (Number(r.taggedOrderValueNpr) || 0), 0);
  const spend = {};
  for (const r of rows) { const cur = r.currency || "USD"; spend[cur] = (spend[cur] || 0) + (Number(r.spend) || 0); }
  const currencies = Object.keys(spend);
  const costPerCustomer = customers > 0 && currencies.length === 1 ? { currency: currencies[0], amount: spend[currencies[0]] / customers } : null;

  let roas;
  if (orders === 0) roas = { text: "—", title: "No tagged orders yet" };
  else {
    let spendNpr = 0;
    let missing = null;                                    // { currency } for the first one with no rate (a row with no currency has none either)
    for (const r of rows) {
      const s = Number(r.spend) || 0;
      if (s <= 0) continue;
      if (r.currency === "NPR") spendNpr += s;
      else if (rates[r.currency]) spendNpr += s * rates[r.currency];
      else { missing = { currency: r.currency }; break; }
    }
    if (missing) roas = { text: "—", title: `Exchange rate missing for ${missing.currency}` };
    else if (spendNpr <= 0) roas = { text: "—", title: "No spend in this range" };
    else roas = { text: `${(valueNpr / spendNpr).toFixed(2)}×`, title: "Total ROAS across all campaigns" };
  }
  return { customers, orders, valueNpr, spend, currencies, costPerCustomer, roas };
}

/* ── The change log ───────────────────────────────────────────── */

/**
 * One line of the change log as parts the page lays out: who, what they did, to what, and for a budget the before and after. A budget
 * is shown in the currency `currencyOf(action)` gives (the action's account), or as a bare figure when that is not known: the old log
 * wrote every budget in dollars whatever the account spent in.
 */
export function describeAction(a, currencyOf = () => "") {
  const who = a.personName || "Staff";
  const what = a.entityName || a.entityId || "item";
  if (a.action === "pause") return { who, verb: "paused", what };
  if (a.action === "resume") return { who, verb: "resumed", what };
  if (a.action === "budget_edit") {
    const cur = currencyOf(a);
    const show = (minor) => (minor == null ? "—" : cur ? moneyMinor(minor, cur) : (Number(minor) / 100).toFixed(2));
    return {
      who, verb: "changed", what,
      budget: {
        label: a.field === "daily_budget" ? "daily budget" : "lifetime budget",
        before: show(a.before?.[a.field]), after: show(a.after?.[a.field]), over: Boolean(a.confirmedOverCeiling),
      },
    };
  }
  return { who, verb: "updated", what };
}

export function filterActions(actions, { text = "", level = "all" }) {
  const q = text.toLowerCase().trim();
  return actions.filter((a) => {
    if (level !== "all" && a.entityLevel !== level) return false;
    if (q && !a.entityName?.toLowerCase().includes(q) && !a.entityId?.toLowerCase().includes(q) && !a.personName?.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** What to tell a person about a sync that failed, when the error says why. */
export function errorHint(msg) {
  if (!msg) return null;
  const lower = String(msg).toLowerCase();
  // a Meta error code is a whole number: "(#17)" or "code 190", not the 17 inside an account id like act_1234517890
  const code = (...codes) => codes.some((c) => new RegExp(`(^|\\D)${c}(\\D|$)`).test(lower));
  if (lower.includes("token") || lower.includes("expire") || code(190) || lower.includes("oauthexception")) return "Meta access token expired. An admin needs to renew META_ACCESS_TOKEN in Cloudflare worker secrets.";
  if (lower.includes("rate limit") || lower.includes("calls") || code(17, 613)) return "Meta API rate limit reached. Next sync will resume automatically.";
  return null;
}

/* ── Settings ─────────────────────────────────────────────────── */

/** "act_" and the digits in whatever was typed, or "" when there are none. */
export const normalizeAccountId = (raw) => { const d = String(raw ?? "").replace(/[^0-9]/g, ""); return d ? `act_${d}` : ""; };

export const guardDraftOf = (s) => ({
  ceiling: s?.budgetCeilingMinor != null ? (s.budgetCeilingMinor / 100).toString() : "",
  // a ceiling saved with no currency (a row set by hand) stays blank here, to be chosen: showing "USD" for it hid that Meta Ads would refuse every budget
  currency: s?.budgetCeilingCurrency || (s?.budgetCeilingMinor != null ? "" : "USD"),
  multiplier: (s?.confirmMultiplier ?? 3).toString(),
});
export const guardDirty = (draft, saved) => draft.ceiling !== saved.ceiling || draft.currency !== saved.currency || draft.multiplier !== saved.multiplier;

/** What is wrong with the guard rails form, or "". */
export function guardProblem(draft) {
  const mult = Number(draft.multiplier);
  if (!Number.isFinite(mult) || mult < 1) return "The confirm multiple has to be 1 or more.";
  if (draft.ceiling.trim() !== "") {
    const c = Number(draft.ceiling);
    if (!Number.isFinite(c) || c <= 0) return "The ceiling has to be more than zero, or left blank for no ceiling.";
    if (!draft.currency) return "Choose the currency of the ceiling.";
  }
  return "";
}

/** The row the form is saved as. (A ceiling has a currency only when there is a ceiling.) */
export function guardPayload(draft) {
  const ceilingMinor = draft.ceiling.trim() !== "" ? Math.round(Number(draft.ceiling) * 100) : null;
  return { budgetCeilingMinor: ceilingMinor, budgetCeilingCurrency: ceilingMinor != null ? draft.currency : null, confirmMultiplier: Number(draft.multiplier) };
}

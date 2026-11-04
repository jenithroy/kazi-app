/**
 * Reddit Leads, the plain rules: what a lead's status means, how strong a match is, the page's counts, what the search looks in, how a
 * web address is cleaned, and the two spreadsheets. Nothing here draws anything or talks to the database.
 *
 * Words: a LEAD is a Reddit post that scored as someone looking for a manufacturer (the Worker adds them: worker/lib/redditLeads.js).
 * An EMAIL is one address on the team's list, found on a brand's own website (worker/lib/contactFinder.js) and saved from the page.
 */
import { csvCell, timeAgo } from "./metaCalc";
import { kathmanduDate } from "../utils/date";
import { isFreeMail } from "../../worker/lib/freeMail.js";                    // one list of free mail domains for the finder and the download

export { timeAgo, csvCell };

export const NONE = Object.freeze([]);
export const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);
export const num = (n) => Math.round(Number(n) || 0).toLocaleString();

/* ── Status ───────────────────────────────────────────────────── */

export const STATUSES = [
  { id: "new", label: "New", tone: "good" },
  { id: "contacted", label: "Contacted", tone: "info" },
  { id: "replied", label: "Replied", tone: "info" },
  { id: "not_fit", label: "Not a fit", tone: "" },
  { id: "customer", label: "Customer", tone: "good" },
];
export const leadStatus = (l) => (STATUSES.some((s) => s.id === l?.status) ? l.status : "new");
export const statusMeta = (status) => STATUSES.find((s) => s.id === status) || STATUSES[0];

/** How strong a match a score is: what the Match column says. */
export function matchTier(score) {
  const n = Number(score) || 0;
  if (n >= 70) return { id: "strong", label: "Strong", tone: "good" };
  if (n >= 40) return { id: "likely", label: "Likely", tone: "info" };
  return { id: "maybe", label: "Maybe", tone: "" };
}

/* ── Counts ───────────────────────────────────────────────────── */

const DAY = 24 * 3600 * 1000;

/** The four short tiles over the posts: new ones, the last day's, the ones being followed up, the ones that became customers. `now` is ms. */
export function leadStats(leads, now = Date.now()) {
  const stats = { total: leads.length, fresh: 0, lastDay: 0, following: 0, customers: 0 };
  for (const l of leads) {
    const s = leadStatus(l);
    if (s === "new") stats.fresh += 1;
    if (s === "contacted" || s === "replied") stats.following += 1;
    if (s === "customer") stats.customers += 1;
    const at = Date.parse(l.postedAt);
    if (Number.isFinite(at) && now - at <= DAY && now - at >= -3600e3) stats.lastDay += 1;
  }
  return stats;
}

export const statusCounts = (leads) => ({ all: leads.length, ...Object.fromEntries(STATUSES.map((s) => [s.id, leads.filter((l) => leadStatus(l) === s.id).length])) });

/** The email list's tiles: how many addresses, how many on the brand's own domain, how many marked do-not-email, how many this week. */
export function emailStats(emails, now = Date.now()) {
  let own = 0, flagged = 0, week = 0;
  for (const e of emails) {
    if (e.sameDomain) own += 1;
    if (e.doNotEmail) flagged += 1;
    const at = Date.parse(e.foundAt);
    if (Number.isFinite(at) && now - at <= 7 * DAY) week += 1;
  }
  return { total: emails.length, own, flagged, week };
}

/* ── Looking things up ────────────────────────────────────────── */

const lc = (v) => String(v ?? "").toLowerCase();

/** The posts a search matches: its title, what the poster wrote, the subreddit, and what the team wrote on it. */
export function searchLeads(leads, query) {
  const q = lc(query).trim();
  if (!q) return leads;
  return leads.filter((l) => [l.title, l.excerpt, l.subreddit, l.brand, l.website, l.notes].some((f) => lc(f).includes(q)));
}

export function searchEmails(emails, query) {
  const q = lc(query).trim();
  if (!q) return emails;
  return emails.filter((e) => [e.email, e.brand, e.website, e.note, e.sourceUrl].some((f) => lc(f).includes(q)));
}

/** The emails saved against each lead: id -> list. */
export function emailsByLead(emails) {
  const by = new Map();
  for (const e of emails) {
    if (!e.leadId) continue;
    if (!by.has(e.leadId)) by.set(e.leadId, []);
    by.get(e.leadId).push(e);
  }
  return by;
}

/** Whether a saved address is a free public mailbox (Gmail and the like): by the type it was saved with, or by its domain on the list as it is today. */
export const isFreeAddress = (e) => e?.kind === "free" || isFreeMail(String(e?.email ?? "").split("@").pop());

/** What type an address is TODAY: "free" for a free mailbox even if it was saved before the list knew its domain, else the type it was saved with. */
export const kindOf = (e) => (isFreeAddress(e) ? "free" : e?.kind);

/**
 * Of a lead's emails, the one to write to: not flagged, the brand's own domain first, then a company address, then the first found.
 * `allowFree: false` leaves free mail out altogether (what a file for an email tool must do).
 */
export function bestEmail(list, { allowFree = true } = {}) {
  const usable = (list || []).filter((e) => !e.doNotEmail && (allowFree || !isFreeAddress(e)));
  const rank = (e) => (e.sameDomain ? 100 : 0) + (isFreeAddress(e) ? -45 : 25) + (e.kind === "role" ? -18 : 10);
  return usable.slice().sort((a, b) => rank(b) - rank(a))[0] || null;
}

/* ── Web addresses ────────────────────────────────────────────── */

/**
 * What somebody typed as a website, made into an address the database will take ("brand.com" -> "https://brand.com/"), or null when it
 * is not one. An empty box is "" (no website). The Worker and the database check it again; this is for a message before saving.
 */
export function normalizeWebsite(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  if (raw.length > 300 || /\s/.test(raw)) return null;
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  u.hash = "";
  const out = u.toString();
  return out.length > 300 ? null : out;
}

/** "brand.com" for "https://www.brand.com/pages/x". */
export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac", "edu", "or", "ne"]);
/** The name a brand goes by when nobody has typed one: the name in its website's address, not a subdomain ("shop.madforthren.com" and "madforthren.co.uk" -> "Madforthren"). */
export function brandFromSite(url) {
  const labels = domainOf(url).split(".").filter(Boolean);
  if (labels.length === 0) return "";
  const at = labels.length >= 3 && labels[labels.length - 1].length === 2 && SECOND_LEVEL.has(labels[labels.length - 2]) ? labels.length - 3 : Math.max(0, labels.length - 2);
  const d = labels[at] || labels[0];
  return d.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** What the database says when Reddit Leads' tables are not there yet (the migration has not been run). */
export const tableMissing = (err) => /relation .* does not exist|could not find the table|PGRST205|42P01/i.test(String(err?.message || err || ""));

export const NOT_SET_UP = "Reddit Leads isn't set up in the database yet (migration 0064). Ask whoever looks after the database to run it.";

/* ── Settings ─────────────────────────────────────────────────── */

const SUB_OK = /^[A-Za-z0-9_]{2,21}$/;

/** A textarea's lines as a list: trimmed, empty lines dropped, repeats dropped (case-blind, the first wins). */
export function linesOf(text) {
  const seen = new Set();
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const t = line.trim().replace(/\s+/g, " ");
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

/** A subreddit as people write it ("r/Foo", "/r/Foo", "Foo") -> "Foo". */
export const subName = (s) => String(s ?? "").trim().replace(/^\/?r\//i, "");

/** What is wrong with a settings draft, as one sentence, or "" when it can be saved. `draft` has `subs`, `strong`, `weak`, `block` (texts) and `minScore`. */
export function settingsProblem(draft) {
  const subs = subsOf(draft.subs);
  if (subs.length > 30) return "That is more than 30 subreddits. Keep the ones that matter.";
  const badSub = subs.find((s) => !SUB_OK.test(s));
  if (badSub) return `"${badSub}" is not a subreddit name (letters, numbers and underscores, 2 to 21 long).`;
  for (const [label, text] of [["Strong phrases", draft.strong], ["Weak words", draft.weak], ["Phrases that rule a post out", draft.block]]) {
    const list = linesOf(text);
    if (list.length > 80) return `${label}: more than 80 lines.`;
    if (list.some((p) => p.length > 80)) return `${label}: a line is longer than 80 characters.`;
    if (list.some((p) => p.split(" ").filter((t) => t === "*").length > 3)) return `${label}: a phrase can have at most three * in it.`;
  }
  const min = Number(draft.minScore);
  if (!Number.isInteger(min) || min < 1 || min > 200) return "The points needed must be a whole number from 1 to 200.";
  return "";
}

/** The subreddits a textarea names: "r/Foo", "/r/Foo" and "foo" are one, the first spelling kept. */
export function subsOf(text) {
  const seen = new Set();
  return linesOf(text).map(subName).filter((s) => { const k = s.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** The row the settings card saves (the database's own names). */
export const settingsPayload = (draft) => ({
  subreddits: subsOf(draft.subs),
  strong: linesOf(draft.strong),
  weak: linesOf(draft.weak),
  block: linesOf(draft.block),
  minScore: Number(draft.minScore),
});

export const settingsDraft = (s) => ({
  subs: (s?.subreddits || []).join("\n"),
  strong: (s?.strong || []).join("\n"),
  weak: (s?.weak || []).join("\n"),
  block: (s?.block || []).join("\n"),
  minScore: String(s?.minScore ?? 30),
});

/** One line for the header: how the last check went. */
export function checkLine(settings, now = Date.now()) {
  if (!settings || !settings.lastCheckedAt) return "Not checked yet";
  const ago = timeAgo(settings.lastCheckedAt, now);
  if (settings.lastStatus === "failed") return `Last check failed ${ago}`;
  if (settings.lastStatus === "partial") return `Checked ${ago}, some subreddits failed`;
  return `Checked ${ago}`;
}

/* ── Social networks ──────────────────────────────────────────── */

/** The social networks a brand's own website can link to: the key the finder keeps each under, and how it reads in full and in a few letters. */
export const SOCIALS = {
  instagram: { name: "Instagram", short: "IG" },
  facebook: { name: "Facebook", short: "FB" },
  tiktok: { name: "TikTok", short: "TT" },
  linkedin: { name: "LinkedIn", short: "LI" },
  youtube: { name: "YouTube", short: "YT" },
  x: { name: "X", short: "X" },
  pinterest: { name: "Pinterest", short: "Pin" },
};

/** A row's social links as [[network, address], …]: only a network that is known, and only an `http(s)` address (it becomes a link). */
export const socialLinks = (e) => Object.entries(e?.socials || {}).filter(([net, v]) => SOCIALS[net] && typeof v === "string" && /^https?:\/\//.test(v));

/* ── Spreadsheets ─────────────────────────────────────────────── */

const row = (cells) => cells.map(csvCell).join(",");
const csv = (head, rows) => [row(head), ...rows.map(row)].join("\r\n");
const day = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? kathmanduDate(iso) : ""; };
const KIND = { role: "Company address", named: "Named address", free: "Gmail-type address" };
export const kindLabel = (k) => KIND[k] || k;

/**
 * The email list as a CSV for an email tool. An address marked do-not-email is NEVER in it. A Gmail-type address is left out unless
 * `includeFree` (it is often a person, not a company). Returns { text, count, skippedFree, skippedFlagged } so the page can say what
 * was left out.
 */
export function emailsCsv(emails, leads, { includeFree = false } = {}) {
  const byId = new Map((leads || []).map((l) => [l.id, l]));
  let skippedFree = 0, skippedFlagged = 0;
  const kept = [];
  for (const e of emails) {
    if (e.doNotEmail) { skippedFlagged += 1; continue; }
    if (isFreeAddress(e) && !includeFree) { skippedFree += 1; continue; }
    kept.push(e);
  }
  const head = ["Email", "Type", "Brand", "Website", "Found on", "Date found", "Reddit post", "Reddit link", "Lead status", ...Object.values(SOCIALS).map((n) => n.name), "Note"];
  const rows = kept.map((e) => {
    const l = byId.get(e.leadId);
    const s = e.socials || {};
    return [e.email, kindLabel(kindOf(e)), e.brand, e.website, e.sourceUrl, day(e.foundAt), l?.title, l?.url, l ? statusMeta(leadStatus(l)).label : "", ...Object.keys(SOCIALS).map((net) => s[net]), e.note];
  });
  return { text: csv(head, rows), count: kept.length, skippedFree, skippedFlagged };
}

/** The posts as a CSV (what the table shows), each with the best address saved for it, if any. */
export function leadsCsv(leads, emails) {
  const by = emailsByLead(emails || []);
  const head = ["Posted", "Subreddit", "Title", "Link", "Match", "Status", "Brand", "Website", "Best email", "Notes"];
  const rows = leads.map((l) => {
    const best = bestEmail(by.get(l.id), { allowFree: false });                 // a file for people to work from: free mail left out here too
    return [day(l.postedAt), `r/${l.subreddit}`, l.title, l.url, matchTier(l.score).label, statusMeta(leadStatus(l)).label, l.brand, l.website, best?.email, l.notes];
  });
  return { text: csv(head, rows), count: rows.length };
}

/** Save text as a file. A byte-order mark first, so a spreadsheet reads the letters as UTF-8. */
export function downloadCsv(text, name) {
  const blob = new Blob([String.fromCharCode(0xfeff), text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

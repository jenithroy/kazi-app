/**
 * Find a Tender (https://www.find-tender.service.gov.uk), the UK government's notice service, as a source of public contact emails.
 *
 * This is not scraping. The service publishes every notice as open data under the Open Government Licence v3.0 and offers an official way
 * to download it (/api/1.0/ocdsReleasePackages: no key, no sign-in), and that is all this reads. The website's own pages are never opened.
 * Nothing is searched anywhere else, and nothing is signed in to.
 *
 * What a notice holds, and so what is kept: a buyer (a public body) with a contact point; and on an award the suppliers that won it, a few
 * of which give an email. A buyer's address is published for questions about that one notice, so the page does not tick it for saving.
 * Of the award notices in a month roughly 1 in 60 to 90 is about clothing or textiles, a supplier gives an email in about 1 in 12 (and in a
 * month of clothing awards, none did), and almost none is a shop: say so rather than promise more.
 *
 * What one search does: the interface cannot filter by subject, so the period asked for is read in week-long windows, a few at a time, and
 * every notice in them is looked at here. A notice is kept when its category code is clothing or textiles, or its title or description
 * holds one of the words asked for. At most MAX_RELEASES notices are looked at and BUDGET_MS is spent; if that is not enough the answer
 * says it was cut short. One search is a handful of requests (a week of awards is about three pages of 100).
 *
 * Everything in a notice is somebody else's text: web addresses are checked (an `http(s)` address of a public host, nothing else, since a
 * page will make it a link), addresses must look like addresses, lengths are cut, and the "next page" the service names is followed only
 * when it is the service's own.
 *
 * Pure functions are exported so the rules can be tested without a network; `searchTenders` is the one that fetches.
 */
import { isPublicHostname, kindOfEmail, onOwnDomain, plausibleEmail, sameSite } from "./contactFinder.js";

const ORIGIN = "https://www.find-tender.service.gov.uk";
const API = `${ORIGIN}/api/1.0/ocdsReleasePackages`;
export const TENDER_UA = "KaziContactFinder/1.0 (+https://kazimfg.com.np; reads public tender notices)";

const RECORDS = `${ORIGIN}/api/1.0/ocdsRecordPackages`;           // every notice one process has had (planning, tender, award…), by its ocid

const STAGES = new Set(["tender", "award", "planning"]);
const MAX_DAYS = 30;
const MAX_DAYS_PLANNED = 120;       // a planned purchase is announced months ahead, so it is looked for further back (and there are few: about 90 a month)
const WINDOW_DAYS = 7;
const WINDOW_DAYS_PLANNED = 30;     // few notices, so few requests: the service refuses anyone who asks for more than about 15 pages a minute
const MAX_CHECKED = 30;             // planned notices whose later history is looked up (one request each)
const PAGE = 100;
const PARALLEL = 4;
const MAX_RELEASES = 3000;
const MAX_NOTICES = 60;
const BUDGET_MS = 75_000;
const TIMEOUT_MS = 45_000;          // one page: about 1 MB of JSON for 100 notices, which took 14 to 26 s on a busy day (2026-11-14), and the body counts against it
const MAX_TYPED = 12;
const DAY_MS = 86_400_000;

export const DEFAULT_WORDS = ["uniform", "workwear", "clothing", "garment", "textile", "scrubs", "hi-vis"];
// CPV (the EU's category codes): clothing, footwear and accessories (18…), textile fabrics (192…), uniforms (3581…), medical clothing (33199…),
// protective clothing (35113…), textile articles (395…)
const TEXTILE_CPV = ["18", "192", "3581", "33199", "35113", "395"];

/** Something the person who asked should be told, in plain words. `status` is what the Worker answers with. */
export class TenderError extends Error {
  constructor(message, status = 400) { super(message); this.name = "TenderError"; this.status = status; }
}

const short = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/* ── What was asked ───────────────────────────────────────────── */

/**
 * The words to look for: the usual ones always, and after them what was typed ("hoodies, scrubs"), lower case, 2 to 40 letters each, at most
 * MAX_TYPED of them. Typed words add to the usual ones and never replace them: the screen says "add words", and a search that quietly dropped
 * "uniform" because somebody typed "hoodies" would lose notices they had every reason to expect.
 */
export function parseWords(input) {
  const raw = Array.isArray(input) ? input : String(input ?? "").split(/[,;\n]/);
  const words = DEFAULT_WORDS.slice();
  let typed = 0;
  for (const w of raw) {
    const word = short(w, 40).toLowerCase();
    if (word.length < 2 || words.includes(word)) continue;
    words.push(word);
    typed += 1;
    if (typed === MAX_TYPED) break;
  }
  return words;
}

/** `YYYY-MM-DDTHH:MM:SS`, the shape the service wants (no zone, 19 characters). */
const stamp = (ms) => new Date(ms).toISOString().slice(0, 19);

/** [from, to] in week-long pieces, oldest first: [{ from: ms, to: ms }]. */
export function windowsOf(fromMs, toMs, stepDays = WINDOW_DAYS) {
  const out = [];
  for (let at = fromMs; at < toMs; at += stepDays * DAY_MS) out.push({ from: at, to: Math.min(toMs, at + stepDays * DAY_MS) });
  return out;
}

/* ── Reading a notice ─────────────────────────────────────────── */

/** Whether a notice is about clothing or textiles: a category code of those kinds, or one of the words in its title or description. */
export function matchesTopic(release, words) {
  const t = release?.tender || {};
  const lots = Array.isArray(t.lots) ? t.lots : [];
  const items = [...(Array.isArray(t.items) ? t.items : []), ...lots.flatMap((l) => (Array.isArray(l?.items) ? l.items : []))];
  const codes = [t.classification?.id, ...items.map((i) => i?.classification?.id)].filter(Boolean).map(String);
  if (codes.some((c) => TEXTILE_CPV.some((p) => c.startsWith(p)))) return true;
  const text = [t.title, t.description, ...lots.map((l) => l?.title), ...lots.map((l) => l?.description)].filter(Boolean).join(" ").slice(0, 6000).toLowerCase();
  return words.some((w) => text.includes(w));
}

/* ── A planned purchase ("pipeline notice"): clothing, and still only planned ── */

// What a PLANNED purchase must be about is stricter than `matchesTopic`. Of 359 planning notices read in four months (2026-11-14) the loose test kept two,
// and neither was clothing: a waste contract that says "textile", and a webinar series for suppliers whose notice lists 23 category codes, one of them clothing.
// So: the notice's MAIN category or an item's own category is a clothing one (181… occupational clothing, 182… outerwear, 183… garments, 184… special
// clothing and accessories, 3581… uniforms, 33199… medical clothing, 35113… protective clothing), never the long list of "additional" codes; or a clothing word
// stands in the TITLE with nothing about waste, vehicles, software, vouchers, laundry, curtains, events… in it. Words the person typed are looked for in the
// title and description.
const GARMENT_CPV = ["181", "182", "183", "184", "3581", "33199", "35113"];
const GARMENT_TITLE = /\b(?:uniforms?|workwear|work wear|clothing|garments?|apparel|scrubs|hi-?vis|high[- ]visibility|overalls?|jackets?|trousers|shirts?|polo|hoodies?|fleece|coats?|waterproofs?|footwear|boots)\b/i;
const NOT_GARMENT_TITLE = /\b(?:waste|recycl\w*|refuse|vehicles?|atv|cycl\w*|software|case management|vouchers?|laundry|linen|windows?|curtains?|blinds?|furniture|catering|food|webinars?|events?|training|doing business)\b/i;

/** Whether a PLANNED purchase is about clothing (see above). `typed` are the words the person added. */
export function plannedIsGarments(release, typed = []) {
  const t = release?.tender || {};
  const lots = Array.isArray(t.lots) ? t.lots : [];
  const items = [...(Array.isArray(t.items) ? t.items : []), ...lots.flatMap((l) => (Array.isArray(l?.items) ? l.items : []))];
  const codes = [t.classification?.id, ...items.map((i) => i?.classification?.id)].filter(Boolean).map(String);
  if (codes.some((c) => GARMENT_CPV.some((p) => c.startsWith(p)))) return true;
  const title = String(t.title ?? "");
  if (GARMENT_TITLE.test(title) && !NOT_GARMENT_TITLE.test(title)) return true;
  const text = [title, t.description].filter(Boolean).join(" ").slice(0, 6000).toLowerCase();
  return typed.some((w) => text.includes(w));
}

/** Whether a release is a planning notice and nothing more: no tender, award or contract tag, still "planned", no award, no contract. */
export function isOnlyPlanned(release) {
  const tags = Array.isArray(release?.tag) ? release.tag : [];
  if (!tags.includes("planning") || tags.some((g) => g !== "planning")) return false;
  const status = release?.tender?.status;
  if (status !== undefined && status !== "planned") return false;
  return !(Array.isArray(release?.awards) && release.awards.length) && !(Array.isArray(release?.contracts) && release.contracts.length);
}

/**
 * Whether a planned purchase has moved on since: the same process (its ocid) now has a tender, award or contract notice, or was cancelled or withdrawn.
 * Asks the service for the process's record, every notice it has had. true = moved on (leave it out), false = still only planned, null = could not tell
 * (leave it out too: nothing is let in that might already have a winner).
 */
export async function processMovedOn(ocid, fetchImpl = fetch) {
  if (!/^ocds-[a-z0-9]+-[A-Za-z0-9-]{1,60}$/.test(String(ocid ?? ""))) return null;
  let pkg;
  try { pkg = await getPage(`${RECORDS}/${encodeURIComponent(ocid)}`, fetchImpl); } catch { return null; }
  const rec = Array.isArray(pkg?.records) ? pkg.records[0] : null;
  if (!rec) return null;
  const seen = [...(Array.isArray(rec.releases) ? rec.releases : []), rec.compiledRelease].filter((r) => r && typeof r === "object");
  if (seen.length === 0) return null;
  const moved = (r) => {
    const tags = Array.isArray(r.tag) ? r.tag : [];
    return tags.some((g) => g !== "planning")
      || (Array.isArray(r.awards) && r.awards.length > 0) || (Array.isArray(r.contracts) && r.contracts.length > 0)
      || (r.tender?.status !== undefined && r.tender.status !== "planned");
  };
  return seen.some(moved);
}

/** An `http(s)` address of a public host, or null: it will become a link on the page, so nothing else is let through. */
export function webAddress(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 300) return null;                 // refused, not cut: a cut address is a different one
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password || !isPublicHostname(u.hostname)) return null;
  u.hash = "";
  const out = u.toString();
  return out.length <= 300 ? out : null;
}

/** The first thing in a field that is a plausible address, lower case ("A@x.com; b@y.com" gives a@x.com), or "". */
export function cleanEmail(value) {
  for (const part of String(value ?? "").replace(/^mailto:/i, "").split(/[;,\s]+/)) {
    const e = part.trim().toLowerCase();
    if (e && plausibleEmail(e)) return e;
  }
  return "";
}

// A tender's mailbox is usually a team's ("procurement@", "tenders@", "group.procurement@"), and the usual list of role names (info@, hello@) does
// not know those words: without them every one would read as a named person, which is the kind that needs the most care.
const TEAM_WORDS = ["procure", "tender", "purchas", "commercial", "contract", "sourcing", "suppl", "buying", "enquir", "admin", "office", "info", "contact", "sales", "support", "helpdesk", "customer", "service", "team", "finance"];
/** "role" for a team's mailbox, "named" for what looks like a person's, "free" for a Gmail-type one. */
export function kindOfContact(email) {
  const kind = kindOfEmail(email);
  return kind === "named" && TEAM_WORDS.some((w) => email.split("@")[0].includes(w)) ? "role" : kind;
}

const hasRole = (party, role) => Array.isArray(party?.roles) && party.roles.includes(role);
/** "buyer" for a public body that buys (or buys for others), "supplier" for a company that won; anything else (a court, a mediator) is nobody to write to. */
const roleOf = (party) => (hasRole(party, "buyer") || hasRole(party, "centralPurchasingBody") ? "buyer" : hasRole(party, "supplier") ? "supplier" : null);

/** What a notice is worth: the contract's value on an award, the estimate on a tender; null when it says none. */
function valueOf(release) {
  const v = release.contracts?.[0]?.value || release.tender?.value;
  const amount = Number(v?.amount);
  return Number.isFinite(amount) && amount > 0 ? { amount, currency: short(v.currency || "GBP", 3).toUpperCase() } : null;
}

/**
 * One notice as the page shows it, or null when it has no id. `contacts` are the addresses that were given (a buyer's, a supplier's, once each);
 * `withoutEmail` are the winners that gave none, with what else the notice says of them (a website is the way on: the website finder can read it).
 * A winner whose "website" is the buyer's own is a slip in the notice (it happens: a notice for Merseyside Fire's station wear gave the fire
 * service's site for the company that won), and sending somebody to the buyer as if it were the winner would mislead, so that website is dropped.
 */
export function noticeOf(release) {
  const id = short(release?.id, 40);
  if (!id) return null;
  const t = release.tender || {};
  const contacts = [];
  const withoutEmail = [];
  const seen = new Set();
  const parties = Array.isArray(release.parties) ? release.parties : [];
  const siteOf = (p) => webAddress(p?.details?.url) || webAddress(p?.contactPoint?.url) || webAddress(p?.details?.buyerProfile);
  const buyerHosts = parties.filter((p) => roleOf(p) === "buyer").map(siteOf).filter(Boolean).map((u) => new URL(u).hostname);
  for (const p of parties) {
    const role = roleOf(p);
    if (!role) continue;
    const email = cleanEmail(p.contactPoint?.email);
    let website = siteOf(p);
    if (role === "supplier" && website && buyerHosts.some((h) => sameSite(h, new URL(website).hostname))) website = null;
    if (email) {
      if (seen.has(email)) continue;
      seen.add(email);
      contacts.push({
        email, kind: kindOfContact(email), role, party: short(p.name, 120), person: short(p.contactPoint?.name, 80),
        website, ownDomain: website ? onOwnDomain(email, new URL(website).hostname) : false,
      });
    } else if (role === "supplier" && withoutEmail.length < 6) {
      withoutEmail.push({ name: short(p.name, 120), website, phone: short(p.contactPoint?.telephone, 40) });
    }
  }
  const code = t.classification?.id ? { id: short(t.classification.id, 12), description: short(t.classification.description, 80) } : null;
  const tags = Array.isArray(release.tag) ? release.tag : [];
  return {
    id,
    ocid: short(release.ocid, 80),
    url: /^\d{3,7}-\d{4}$/.test(id) ? `${ORIGIN}/Notice/${id}` : null,
    title: short(t.title, 200),
    summary: short(t.description, 240),
    buyer: short(release.buyer?.name || release.parties?.find((p) => roleOf(p) === "buyer")?.name, 120),
    stage: tags.includes("award") ? "award" : tags.includes("tender") ? "tender" : "planning",
    date: typeof release.date === "string" ? release.date : null,
    deadline: typeof t.tenderPeriod?.endDate === "string" ? t.tenderPeriod.endDate : null,
    expected: typeof t.communication?.futureNoticeDate === "string" ? t.communication.futureNoticeDate : null,      // a planned purchase: when its tender notice is due
    value: valueOf(release),
    cpv: code,
    contacts,
    withoutEmail,
  };
}

/* ── Fetching ─────────────────────────────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One page of the service as JSON. A busy service (429 or 503) is waited for once, as it asks (Retry-After, at most 10 s). */
async function getPage(url, fetchImpl) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let res;
    try {
      res = await fetchImpl(url, { headers: { "User-Agent": TENDER_UA, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new TenderError("Find a Tender did not answer in time. Try again in a minute.", 504);
    }
    if (res.status === 429 || res.status === 503) {
      try { await res.body?.cancel(); } catch { /* nothing to cancel */ }
      const asked = res.headers.get("retry-after");
      await sleep((asked !== null && Number.isFinite(Number(asked)) && Number(asked) >= 0 ? Math.min(10, Number(asked)) : 3) * 1000);
      continue;
    }
    if (!res.ok) throw new TenderError(`Find a Tender answered with an error (${res.status}). Try again later.`, 502);
    try {
      return await res.json();
    } catch (err) {
      // the same time limit covers reading the body: a page still arriving when it runs out is a slow answer, not a broken one
      if (err?.name === "TimeoutError" || err?.name === "AbortError") throw new TenderError("Find a Tender is slow to answer right now. Try again in a minute.", 504);
      throw new TenderError("Find a Tender sent something that could not be read.", 502);
    }
  }
  throw new TenderError("Find a Tender is busy right now. Try again in a minute.", 503);
}

/** The next page's address, only when it is the service's own interface (the service names it; a response is not trusted to point anywhere). */
export function nextPage(pkg) {
  const next = pkg?.links?.next;
  if (typeof next !== "string") return null;
  try {
    const u = new URL(next);
    return u.origin === ORIGIN && u.pathname === "/api/1.0/ocdsReleasePackages" ? u.toString() : null;
  } catch { return null; }
}

/**
 * Read the notices of one stage over the last `days` days and keep the ones about clothing or textiles. `input` is { stage: "tender" | "award" |
 * "planning", days: 1 to 30 (1 to 120 for "planning"), words }. Resolves to { stage, days, from, to, words, scanned, matched, capped, notices,
 * message, moved, unchecked }; `notices` is newest first (at most MAX_NOTICES, `matched` says how many there were), and for open tenders only those whose
 * deadline has not passed.
 *
 * "planning" is a purchase a buyer has said it WILL make (a pipeline notice): only the ones about clothing (`plannedIsGarments`, strict) that are still
 * only planned. A planning notice stays in the feed after its tender is published and after it is awarded, so each candidate's whole process is looked up
 * (`processMovedOn`): one that has a tender, an award or a contract by now is left out and counted in `moved`, and one that could not be looked up is left
 * out and counted in `unchecked`: nothing that might already have a winner is let in.
 * Throws a TenderError for a request that cannot be answered.
 */
export async function searchTenders(input, { fetchImpl = fetch, now = Date.now() } = {}) {
  const stage = String(input?.stage ?? "tender");
  if (!STAGES.has(stage)) throw new TenderError("Choose open tenders, awarded contracts or planned tenders.");
  const planned = stage === "planning";
  const maxDays = planned ? MAX_DAYS_PLANNED : MAX_DAYS;
  const days = Number(input?.days ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > maxDays) throw new TenderError(`Choose a period of 1 to ${maxDays} days.`);
  const words = parseWords(input?.words);
  const typed = words.slice(DEFAULT_WORDS.length);          // what the person added (a planned purchase is judged by its categories and title, not by the usual words)
  const from = now - days * DAY_MS;
  const stopAt = Date.now() + BUDGET_MS;

  const found = new Map();                                   // by notice id: a notice that two windows both hold is one
  let scanned = 0;
  let capped = false;

  async function readWindow(w) {
    let url = `${API}?stages=${stage}&limit=${PAGE}&updatedFrom=${stamp(w.from)}&updatedTo=${stamp(w.to)}`;
    while (url) {
      if (scanned >= MAX_RELEASES || Date.now() > stopAt) { capped = true; return; }
      const pkg = await getPage(url, fetchImpl);
      for (const r of Array.isArray(pkg?.releases) ? pkg.releases : []) {
        scanned += 1;
        if (planned ? !(isOnlyPlanned(r) && plannedIsGarments(r, typed)) : !matchesTopic(r, words)) continue;
        const n = noticeOf(r);
        if (n && !found.has(n.id)) found.set(n.id, n);
      }
      url = nextPage(pkg);
    }
  }

  const queue = windowsOf(from, now, planned ? WINDOW_DAYS_PLANNED : WINDOW_DAYS);
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
    while (queue.length) await readWindow(queue.shift());
  }));

  let notices = [...found.values()];
  if (stage === "tender") notices = notices.filter((n) => !n.deadline || Date.parse(n.deadline) > now);          // an open tender is one that can still be bid for
  let moved = 0;
  let unchecked = 0;
  if (planned) {
    // one purchase may be in the feed twice (two notices of one process): once
    const seenProcess = new Set();
    notices = notices.filter((n) => { if (!n.ocid) return true; if (seenProcess.has(n.ocid)) return false; seenProcess.add(n.ocid); return true; });
    const kept = [];
    for (const n of notices.slice(0, MAX_CHECKED)) {
      const gone = await processMovedOn(n.ocid, fetchImpl);
      if (gone === false) kept.push(n);
      else if (gone === true) moved += 1;
      else unchecked += 1;
    }
    unchecked += Math.max(0, notices.length - MAX_CHECKED);
    notices = kept;
  }
  notices.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const matched = notices.length;
  const what = stage === "tender" ? "open tender" : stage === "planning" ? "planned purchase that is still only planned" : "awarded contract";
  const message = matched === 0
    ? `No ${what} from the last ${days} ${days === 1 ? "day" : "days"} is about clothing or textiles${capped ? " in the notices that could be read" : ""}.${moved ? ` ${moved} that were about clothing had already gone to tender or been awarded, so they are left out.` : ""}${unchecked ? ` ${unchecked} could not be checked, so they are left out.` : ""}`
    : "";
  return { stage, days, from: new Date(from).toISOString(), to: new Date(now).toISOString(), words, scanned, matched, capped, notices: notices.slice(0, MAX_NOTICES), message, moved, unchecked };
}

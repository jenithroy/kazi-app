/**
 * What the Contact Finder looks at, and how one press of "Find emails" turns it into a list of companies.
 *
 * "Sources" is the person's own choice, kept in their browser (hooks/useSources.js): which places to take companies from, and how to read them.
 *
 *   tenders  UK public contracts about clothing and textiles (Find a Tender): the companies that won them
 *   reddit   the websites written on the Reddit Leads posts that have no address saved yet
 *   list     companies or websites the person typed, one on each line
 *   ebay     eBay store links or names. eBay's own pages are never read (its rules do not allow programs, and it shows them a security check): a store's NAME is looked for like any company's
 *   search   a web search for the sites of businesses that sell what the person looks for: done in the browser on the person's computer (the finder program:
 *            Bing, then DuckDuckGo, no key), or, without it, through a paid search service the server may have a key for (Brave's)
 *   robots   whether a website's robots.txt is respected (on unless the person turns it off; eBay, social networks and search engines are closed regardless)
 *   window   when a search engine asks for a person (a CAPTCHA), the program may open ONE window on the computer for them to answer it
 *   socials  also look for each company's Facebook and Instagram pages with a search (off: a search engine asks for a person after a search or two, so this is slow)
 *   people   also save a person's own address on the company's domain, not only company addresses (sales@, info@)
 *
 * `buildTargets` is the first step of a run (lib/contactRun.js): it collects the companies from every source that is on, drops repeats, drops the ones
 * already on the list or looked at lately with nothing found, and keeps the first MAX_COMPANIES. It knows nothing of the page or the network: what to call
 * is handed in (`ctx`), so its rules can be tested on their own.
 */
import { MAX_COMPANIES, targetsFromText } from "./autoFind";
import { brandFromSite, emailsByLead, leadStatus, normalizeWebsite } from "./redditLeads";

export const MAX_SEARCHES = 5;                                  // searches (one per line) in one run: each is a request to a search engine, and they are paced
export const TRIED_DAYS = 14;                                   // a company looked at with nothing found is not looked at again for this long
const DAY_MS = 86_400_000;

export const DEFAULT_SOURCES = {
  tenders: { on: true, days: 30, words: "" },
  reddit: { on: true },
  list: { on: false, text: "" },
  ebay: { on: false, text: "" },
  search: { on: false, queries: "" },
  robots: true,
  window: true,
  socials: false,
  people: false,
};

const flag = (v, fallback) => (typeof v === "boolean" ? v : fallback);
const words = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

/** Whatever was stored (or nothing) as a complete, valid set of sources. */
export function normalizeSources(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_SOURCES;
  const days = Number(r.tenders?.days);
  return {
    tenders: { on: flag(r.tenders?.on, d.tenders.on), days: Number.isInteger(days) && days >= 1 && days <= 30 ? days : d.tenders.days, words: words(r.tenders?.words, 300) },
    reddit: { on: flag(r.reddit?.on, d.reddit.on) },
    list: { on: flag(r.list?.on, d.list.on), text: words(r.list?.text, 20000) },
    ebay: { on: flag(r.ebay?.on, d.ebay.on), text: words(r.ebay?.text, 20000) },
    search: { on: flag(r.search?.on, d.search.on), queries: words(r.search?.queries, 2000) },
    robots: flag(r.robots, d.robots),
    window: flag(r.window, d.window),
    socials: flag(r.socials, d.socials),
    people: flag(r.people, d.people),
  };
}

/** The lines of a box as the search phrases they are: trimmed, no blanks, no repeats, at most MAX_SEARCHES. */
export const searchLines = (text) => [...new Set(String(text ?? "").split(/\r?\n/).map((l) => l.trim().replace(/\s+/g, " ")).filter((l) => l.length >= 3))].slice(0, MAX_SEARCHES);

/** How many sources are on, and which have something to look for (a list with nothing typed in it looks at nothing). */
export function activeSources(c) {
  return [
    c.tenders.on && "tenders",
    c.reddit.on && "reddit",
    c.list.on && c.list.text.trim() && "list",
    c.ebay.on && c.ebay.text.trim() && "ebay",
    c.search.on && searchLines(c.search.queries).length > 0 && "search",
  ].filter(Boolean);
}

/* ── Keys: what makes two entries the same company ───────────── */

const LEGAL = new Set(["ltd", "limited", "llp", "lp", "plc", "inc", "llc", "co", "company", "cic"]);
/** A company's name as letters and digits only, without "Ltd" and its like: "Sulis Silks Ltd." and "sulis silks" are one. */
export const nameKey = (name) => String(name ?? "").toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter((w) => w && !LEGAL.has(w)).join("");
/** A website as its host without "www.": "https://www.Sulis.co.uk/shop" is "sulis.co.uk". */
export function siteKey(website) {
  try { return new URL(normalizeWebsite(website) || website).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}
/** The key of a company to look for: its website's host when it has one, else its name. */
export const targetKey = (t) => siteKey(t.website) || nameKey(t.name);

/* ── Where companies come from ────────────────────────────────── */

/** The companies that won the notices of Find a Tender: each once, with the website the notice gives (or the domain of the address it gives, if that is not Gmail-type). */
export function tenderTargets(notices) {
  const out = [];
  const seen = new Set();
  const add = (name, website, title) => {
    const key = nameKey(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ name: String(name).trim(), website: normalizeWebsite(website) || "", about: `Find a Tender: won "${title}"` });
  };
  for (const n of notices || []) {
    for (const w of n.withoutEmail || []) add(w.name, w.website, n.title);
    for (const c of n.contacts || []) {
      if (c.role !== "supplier") continue;
      add(c.party, c.website || (c.kind === "free" ? "" : `https://${String(c.email).split("@")[1] || ""}`), n.title);
    }
  }
  return out;
}

/** The Reddit Leads posts that have a website written on them and no address saved yet, as companies. A post marked Not a fit or Customer is left out. */
export function redditTargets(leads, emails) {
  const byLead = emailsByLead(emails || []);
  return (leads || [])
    .filter((l) => normalizeWebsite(l.website) && !(byLead.get(l.id) || []).length && !["not_fit", "customer"].includes(leadStatus(l)))
    .map((l) => ({ name: l.brand || brandFromSite(l.website), website: normalizeWebsite(l.website), about: `From a Reddit post (r/${l.subreddit})`, leadId: l.id }));
}

/** A list the person typed as companies. `about` says where they came from. */
export function listTargets(text, about) {
  return targetsFromText(text).targets.map((t) => ({ ...t, about }));
}

/**
 * Collect the companies for a run. `config` is the person's sources (`normalizeSources`). `ctx`:
 *   leads, emails                      what the page already has (the Reddit posts, the saved addresses)
 *   tried                              { [targetKey]: when } companies looked at lately with nothing found
 *   now                                the time, for `tried`
 *   findTenders({ stage, days, words })  -> { ok, res: { notices } } | { ok: false, message }
 *   searchWeb(queries)                 -> { ok, res: { results: [{ name, website, about }] } } | { ok: false, message }
 * Resolves to { targets, notes, counts }: `notes` are plain sentences about what each source gave (or why it gave nothing).
 */
export async function buildTargets(config, ctx) {
  const notes = [];
  const groups = [];                                                       // each source's companies, in the order they are looked at
  const now = ctx.now ?? Date.now();

  if (config.list.on && config.list.text.trim()) {
    const t = listTargets(config.list.text, "From a list");
    groups.push(t);
    notes.push(`List: ${t.length} ${t.length === 1 ? "company" : "companies"}.`);
  }
  if (config.ebay.on && config.ebay.text.trim()) {
    const t = listTargets(config.ebay.text, "From an eBay store name");
    groups.push(t);
    notes.push(`eBay stores: ${t.length} ${t.length === 1 ? "name" : "names"} to look up (eBay's own pages are not read).`);
  }
  if (config.reddit.on) {
    const t = redditTargets(ctx.leads, ctx.emails);
    groups.push(t);
    notes.push(t.length ? `Reddit posts: ${t.length} with a website and no address saved yet.` : "Reddit posts: none with a website and no address saved yet.");
  }
  if (config.tenders.on) {
    const res = await ctx.findTenders({ stage: "award", days: config.tenders.days, words: config.tenders.words });
    if (res.ok) {
      const t = tenderTargets(res.res.notices);
      groups.push(t);
      notes.push(t.length
        ? `Find a Tender: ${t.length} ${t.length === 1 ? "company" : "companies"} won clothing or textile contracts in the last ${config.tenders.days} days.`
        : `Find a Tender: no clothing or textile contract was awarded in the last ${config.tenders.days} days that names a winner.`);
    } else {
      notes.push(`Find a Tender could not be read: ${res.message}`);
    }
  }
  const searches = config.search.on ? searchLines(config.search.queries) : [];
  if (searches.length) {
    const res = await ctx.searchWeb(searches);
    if (res.ok) {
      groups.push(res.res.results);
      const made = res.res.searched ?? searches.length;
      notes.push(`Web search: ${res.res.results.length} ${res.res.results.length === 1 ? "website" : "websites"} from ${made} ${made === 1 ? "search" : "searches"}.`);
      if (res.res.blocked) notes.push("A search engine asked for a person to check and nobody answered, so the web search stopped there. Try again in a while.");
      if (res.res.limited) notes.push("The hour's searches on this computer are used up, so the web search stopped there. Try again in a while.");
    } else {
      notes.push(`Web search did not run: ${res.message}`);
    }
  }

  // one company once, not one already on the list, not one looked at lately with nothing found
  const doneSites = new Set((ctx.emails || []).map((e) => siteKey(e.website)).filter(Boolean));
  const doneNames = new Set((ctx.emails || []).map((e) => nameKey(e.brand)).filter(Boolean));
  const seen = new Set();
  const counts = { repeats: 0, onList: 0, lately: 0, cut: 0 };
  const targets = [];
  for (const t of groups.flat()) {
    const key = targetKey(t);
    if (!key) continue;
    if (seen.has(key)) { counts.repeats += 1; continue; }
    seen.add(key);
    if ((t.website && doneSites.has(siteKey(t.website))) || doneNames.has(nameKey(t.name))) { counts.onList += 1; continue; }
    if (now - (ctx.tried?.[key] ?? 0) < TRIED_DAYS * DAY_MS) { counts.lately += 1; continue; }
    if (targets.length >= MAX_COMPANIES) { counts.cut += 1; continue; }
    targets.push(t);
  }
  if (counts.onList) notes.push(`${counts.onList} already on the list, left out.`);
  if (counts.lately) notes.push(`${counts.lately} looked at in the last ${TRIED_DAYS} days with nothing found, left out (Sources has a button to look at them again).`);
  if (counts.cut) notes.push(`Only the first ${MAX_COMPANIES} are looked at in one run; press Find emails again for the other ${counts.cut}.`);
  return { targets, notes, counts };
}

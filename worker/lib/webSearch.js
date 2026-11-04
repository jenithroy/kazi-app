/**
 * Web search for the Contact Finder, through an official search service and nothing else: Brave's Search API, with a key the team pays for
 * (`BRAVE_SEARCH_KEY`, set with `wrangler secret put BRAVE_SEARCH_KEY`). Without the key the route says so and does nothing.
 *
 * Why an API and not Google's or Bing's own pages: a search engine's results page is not for programs (its terms, and its robots.txt, say so, and it
 * answers a program with a block or a CAPTCHA), and getting past that is not something this app does. A search API is the service's own door for
 * exactly this, paid per search, and what it returns is the search results as data: a title, an address and a snippet.
 *
 * What it gives the finder: the WEBSITES of businesses a search turned up (each site's home page, once), to be read for their contact pages like any
 * company's. A result is left out when it is not a business's own site: a social network or marketplace (the finder may not read them), a directory,
 * a review site, a newspaper, a public body, or a page whose title says it is a list or a guide ("Top 10 knitwear makers"). That keeps most of the
 * noise out but not all of it; every address saved this way carries the search it came from, so a person can tell.
 */
import { closedTo, isPublicHostname } from "./contactFinder.js";

const API = "https://api.search.brave.com/res/v1/web/search";
export const MAX_QUERIES = 5;                       // one search each, and each is paid for
const PER_QUERY = 20;                               // the most the service gives for one search
const PAUSE_MS = 1100;                              // the service's free plan allows about one search a second
const TIMEOUT_MS = 10_000;

export class SearchError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "SearchError";
    this.status = status;
  }
}

// Sites that are not one business's own: marketplaces, directories, review and job sites, reference sites, publishers, website builders' own pages.
const NOT_A_BUSINESS = new Set([
  "amazon", "etsy", "alibaba", "aliexpress", "made-in-china", "indiamart", "dhgate", "temu", "shein", "walmart", "gumtree", "depop", "vinted", "poshmark",
  "thomasnet", "kompass", "yell", "thomsonlocal", "scoot", "cylex", "hotfrog", "yelp", "trustpilot", "reviews", "clutch", "sortlist", "companieshouse",
  "dnb", "zoominfo", "crunchbase", "glassdoor", "indeed", "reed", "totaljobs", "monster", "wikipedia", "wikihow", "quora", "reddit", "medium", "substack",
  "wordpress", "blogspot", "tumblr", "wixsite", "weebly", "shopify", "squarespace", "wix", "github", "gov", "nhs", "bbc", "theguardian", "telegraph",
  "forbes", "businessinsider", "which", "pinterest", "flickr", "issuu", "scribd", "slideshare", "academia", "researchgate", "archive", "yahoo", "msn",
]);
const LIST_TITLE = /\b(?:top|best)\s+\d+\b|\b\d+\s+(?:best|top)\b|\bdirectory\b|\blist of\b|\bguide to\b|\bhow to\b|\breviews?\b|\bcompared?\b|\bvs\.?\b|\bnews\b|\bblog\b|\bwikipedia\b|\bjobs?\b|\bvacanc/i;

/** The search results as the businesses' own websites: [{ website, title, query }], each site once. `results` is [{ query, title, url }]. */
export function sitesFrom(results) {
  const out = [];
  const seen = new Set();
  for (const r of results || []) {
    let u;
    try { u = new URL(r.url); } catch { continue; }
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !isPublicHostname(u.hostname)) continue;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (closedTo(host) || seen.has(host)) continue;
    if (host.split(".").some((label) => NOT_A_BUSINESS.has(label))) continue;     // "shop.gov.uk", "uk.trustpilot.com", "somebody.blogspot.com"
    if (LIST_TITLE.test(String(r.title || ""))) continue;
    seen.add(host);
    out.push({ website: `https://${host}/`, title: String(r.title || "").slice(0, 160), query: r.query });
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Search each phrase and gather the websites. `queries` is a list of phrases (at most MAX_QUERIES are used). Resolves to { searched, sites }; throws a
 * SearchError (with a status) that says what to do.
 */
export async function searchSites(queries, env, { fetchImpl = fetch, pause = PAUSE_MS } = {}) {
  const key = env?.BRAVE_SEARCH_KEY;
  if (!key) throw new SearchError("Web search isn't set up on the server yet. It needs a Brave Search API key (BRAVE_SEARCH_KEY): ask whoever looks after the server.", 503);
  const list = [...new Set((Array.isArray(queries) ? queries : []).map((q) => String(q ?? "").trim().replace(/\s+/g, " ")).filter((q) => q.length >= 3 && q.length <= 200))].slice(0, MAX_QUERIES);
  if (list.length === 0) throw new SearchError("Type what to search for first.", 400);

  const results = [];
  for (let i = 0; i < list.length; i += 1) {
    if (i > 0) await sleep(pause);
    let res;
    try {
      res = await fetchImpl(`${API}?${new URLSearchParams({ q: list[i], count: String(PER_QUERY), country: "gb", search_lang: "en" })}`, {
        headers: { Accept: "application/json", "X-Subscription-Token": key }, signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new SearchError("The search service could not be reached. Try again in a moment.", 502);
    }
    if (res.status === 401 || res.status === 403 || res.status === 422) throw new SearchError("The search service refused the key. Check BRAVE_SEARCH_KEY on the server.", 502);
    if (res.status === 429) throw new SearchError("The search service says too many searches were made. Try again later, or check the plan.", 429);
    if (!res.ok) throw new SearchError(`The search service answered with an error (${res.status}).`, 502);
    const json = await res.json().catch(() => null);
    for (const r of json?.web?.results || []) results.push({ query: list[i], title: r?.title, url: r?.url });
  }
  return { searched: list.length, sites: sitesFrom(results) };
}

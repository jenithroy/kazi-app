/**
 * Searching with the browser on this computer, the way a person would: no search service, no key. The finder uses it for three things
 * (server.mjs): the page's "Web search" source, finding a company's website from its name when guessing the address did not work, and finding
 * a company's Facebook and Instagram pages (the links only: the pages themselves are not opened).
 *
 * What it does: opens Bing (then DuckDuckGo) in the browser that is already running, types nothing but a search, and reads the result links
 * off the page. One search at a time, GAP_MS apart (about what a person does), and no more than MAX_PER_HOUR in an hour.
 *
 * What it does not do, on purpose: it does not hide that the browser is automated (the name it gives is the browser's own with the finder's
 * honest one added, as in browser.mjs), it does not rotate names or fake a browser, it does not sign in, and it does not get past a check
 * that asks for a person. When an engine turns the search away (a CAPTCHA, "unusual traffic", HTTP 202 from DuckDuckGo) that engine is left
 * alone for BLOCK_MS and the next is tried; when both turn it away and the person allowed it, ONE visible window opens on the engine so the
 * person can answer the check themselves, and the run goes on from there. The window stays, and when the engine asks again (in a test on a
 * real engine it asked after the first search or the second, whatever the browser) the person is asked again in the same window, up to MAX_ASKS
 * times. If nobody answers in time, searching stops for BLOCK_MS and the run carries on without it.
 *
 * The pure helpers (unwrapResultUrl, looksBlocked, nameTokens, nameMatch, profileOf, websiteFrom, socialsFrom) are exported so they can be tested
 * without a browser (selftest.mjs).
 */
import { sitesFrom } from "../../worker/lib/webSearch.js";

export const MAX_PER_HOUR = 60;           // searches in an hour: about what a person does
export const GAP_MS = 8_000;              // between one search and the next
export const MAX_ASKS = 6;                // times a person is asked to answer a check in one window
export const BLOCK_MS = 15 * 60_000;      // an engine that turned a search away is left alone this long
export const HELP_MS = 120_000;           // how long a visible window waits for a person to answer a check
export const QUERY_MS = 30_000;           // room a new search needs before the job's deadline (the pause, and a slow engine): with less, the job stops with what it has
export const ASK_MIN_MS = 15_000;         // and room worth asking a person in: with less, nobody is asked
const PAGE_MS = 20_000;                   // for a results page to start coming
const RESULTS_MS = 5_000;                 // then for the results themselves to be on it
const HOUR_MS = 3_600_000;

/** Where the engines answer: `kind` says which markup `readResults` reads. */
export const ENGINES = [
  { name: "Bing", kind: "bing", url: (q) => `https://www.bing.com/search?${new URLSearchParams({ q, setlang: "en-GB", cc: "GB" })}` },
  { name: "DuckDuckGo", kind: "ddg", url: (q) => `https://html.duckduckgo.com/html/?${new URLSearchParams({ q, kl: "uk-en" })}` },
];

const ENGINE_HOST = /(?:^|\.)(?:bing\.com|duckduckgo\.com|google\.[a-z.]+|yahoo\.com|yandex\.[a-z]+|baidu\.com|ecosia\.org|startpage\.com)$/;

/* ── Pure helpers ───────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * A result link as the address it leads to. Bing wraps its links (`bing.com/ck/a?...&u=a1<the address, base64>`), DuckDuckGo's page does
 * too (`duckduckgo.com/l/?uddg=<the address>`). "" for anything that is not a public web address, or leads back into a search engine.
 */
export function unwrapResultUrl(raw) {
  let href = String(raw ?? "").trim();
  if (href.startsWith("//")) href = `https:${href}`;
  let u;
  try { u = new URL(href); } catch { return ""; }
  const host = u.hostname.toLowerCase();
  if (/(?:^|\.)duckduckgo\.com$/.test(host)) {
    const to = u.searchParams.get("uddg");
    return to ? unwrapResultUrl(to) : "";
  }
  if (/(?:^|\.)bing\.com$/.test(host)) {
    const wrapped = u.searchParams.get("u");
    if (u.pathname.startsWith("/ck/") && wrapped && wrapped.startsWith("a1")) {
      try { return unwrapResultUrl(Buffer.from(wrapped.slice(2), "base64url").toString("utf8")); } catch { return ""; }
    }
    return "";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "";
  if (ENGINE_HOST.test(host)) return "";
  return u.toString();
}

const NO_RESULTS = /no results|did not match any|didn't match any|did not find any|nothing found|0 results/i;

/**
 * Whether a results page is the engine turning the search away, and not a search with no results. `results` is how many were read off it. Three ways: a status
 * an engine uses for it (DuckDuckGo's 202), the words of a check, or a bare page with nothing on it, not even "no results" (Bing does that too: in a test its first
 * answer was the page's frame and nothing else).
 */
export function looksBlocked({ status = 200, title = "", text = "", results = 0 } = {}) {
  if (results > 0) return false;
  if (status === 202 || status === 403 || status === 429 || status === 503) return true;
  if (/captcha|unusual traffic|verify you are (?:a )?human|are you (?:a )?(?:human|robot)|bots use duckduckgo|automated (?:access|queries|requests)|one last step|solve the challenge|complete the following challenge|confirm this search was made by a human|before you continue/i.test(`${title} ${text}`)) return true;
  return String(text).replace(/\s+/g, " ").trim().length < 400 && !NO_RESULTS.test(text);
}

const LEGAL = new Set(["ltd", "limited", "llp", "lp", "plc", "inc", "llc", "co", "company", "cic", "the", "and", "of", "uk"]);
const alnum = (s) => String(s ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

/** The words of a company's name that tell it from another: no "Ltd", "The", "and". */
export const nameTokens = (name) => alnum(name).split(" ").filter((w) => w && !LEGAL.has(w));

/**
 * How much of a company's name a piece of text carries, 0 to 1: the share of its words found in the text as words. A name of one or two words must be
 * there whole; one of three or more may miss one. `text` is a result's title or whatever else says whose it is. With `joined` the words may also be run
 * together, as in a host name or a handle ("hunterapparel" has "hunter" and "apparel"): that is for an address, never for a title, where "Acme" is not "Acmeville".
 */
export function nameMatch(name, text, { joined = false } = {}) {
  const tokens = nameTokens(name);
  if (!tokens.length) return 0;
  const hay = alnum(text);
  const words = new Set(hay.split(" "));
  const squashed = hay.replace(/ /g, "");
  const found = tokens.filter((t) => words.has(t) || (joined && t.length >= 4 && squashed.includes(t))).length;
  const share = found / tokens.length;
  return tokens.length <= 2 ? (share === 1 ? 1 : 0) : share >= 0.66 ? share : 0;
}

const FB_NOT_PROFILE = new Set(["sharer", "share", "groups", "events", "watch", "reel", "reels", "photo", "photos", "hashtag", "login", "public", "marketplace", "dialog", "plugins", "policies", "help", "business", "ads", "gaming", "stories", "story.php", "permalink.php", "profile.php"]);
const IG_NOT_PROFILE = new Set(["p", "reel", "reels", "stories", "explore", "accounts", "developer", "tv", "directory", "about", "legal", "web"]);

/**
 * A link as the page of a business on Facebook or Instagram: { network, url, handle } with the address cut down to the page itself, or null for a post,
 * a photo, a group, an event, a share link and the like.
 */
export function profileOf(raw) {
  let u;
  try { u = new URL(String(raw ?? "")); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(?:www|m|mobile|web|[a-z]{2}-[a-z]{2})\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  if (!parts.length) return null;
  if (host === "facebook.com" || host === "fb.com") {
    const first = parts[0].toLowerCase();
    if (FB_NOT_PROFILE.has(first)) return null;
    if (first === "pages" && parts.length >= 3) return { network: "facebook", handle: parts[1], url: `https://www.facebook.com/pages/${parts[1]}/${parts[2]}` };
    if (first === "pages") return null;
    return { network: "facebook", handle: parts[0], url: `https://www.facebook.com/${parts[0]}` };
  }
  if (host === "instagram.com" || host === "instagr.am") {
    const first = parts[0].toLowerCase();
    if (IG_NOT_PROFILE.has(first)) return null;
    return { network: "instagram", handle: parts[0].replace(/^@/, ""), url: `https://www.instagram.com/${parts[0].replace(/^@/, "")}/` };
  }
  return null;
}

/**
 * The website of the company called `name` among search results ([{ query, title, url, snippet }]): the first result that is a business's own
 * site (not a directory, a marketplace, a social network, a news site) and says it is that company's. Resolves to the same shape as
 * worker/lib/siteFinder.js `findWebsiteFor`, or { site: null } when no result does:
 *   confidence 0.95  the title carries the whole name and so does the address
 *   confidence 0.90  the title does, or the address does, or both carry the same part of a long name
 *   confidence 0.70  only the title or only the address carries part of it (shown to the person, not used by itself)
 */
export function websiteFrom(name, results) {
  const sites = sitesFrom(results || []);
  let best = null;
  for (const s of sites) {
    const host = new URL(s.website).hostname.replace(/^www\./, "");
    const inTitle = nameMatch(name, s.title);
    const inHost = nameMatch(name, host.split(".").slice(0, -1).join(" "), { joined: true });
    const strong = inTitle >= 1 || inHost >= 1 || (inTitle > 0 && inHost > 0);       // (a long name's title often drops a word like "Solutions": the title and the address agreeing is enough)
    const confidence = inTitle >= 1 && inHost >= 1 ? 0.95 : strong ? 0.9 : inTitle > 0 || inHost > 0 ? 0.7 : 0;
    if (confidence && (!best || confidence > best.confidence)) best = { site: s.website, host, confidence, evidence: `the first search result with its name: "${s.title.slice(0, 80)}"` };
    if (best && best.confidence >= 0.95) break;
  }
  return best ? { ...best, tried: 1, of: 1, via: "search" } : { site: null, host: "", confidence: 0, evidence: "", tried: 1, of: 1, via: "search" };
}

/**
 * The Facebook and Instagram pages of the company called `name` among search results: { facebook?, instagram? } as addresses. A page counts only when its
 * title or its handle carries the company's name: the search is for pages that are called that, and a page of another business is worse than none.
 */
export function socialsFrom(name, results) {
  const out = {};
  for (const r of results || []) {
    const p = profileOf(r.url);
    if (!p || out[p.network]) continue;
    if (nameMatch(name, `${r.title} ${p.handle.replace(/[._-]+/g, " ")}`) >= 1 || nameMatch(name, p.handle.replace(/[._-]+/g, " "), { joined: true }) >= 1) out[p.network] = p.url;
  }
  return out;
}

/* ── The searcher ───────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Read the result links, titles and snippets off the page in the browser: { found: [{ href, title, snippet }], title, text }. */
async function readResults(page, engine, resultsMs = RESULTS_MS) {
  const sel = engine.kind === "bing" ? ".b_algo h2 a" : "a.result__a";
  await page.waitForSelector(sel, { timeout: resultsMs }).catch(() => {});
  return page.evaluate((kind) => {
    const clean = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
    const found = [];
    if (kind === "bing") {
      for (const li of document.querySelectorAll(".b_algo")) {
        const a = li.querySelector("h2 a[href]");
        if (a) found.push({ href: a.href, title: clean(a), snippet: clean(li.querySelector(".b_caption p, .b_lineclamp2, .b_lineclamp3, .b_algoSlug")) });
      }
    } else {
      for (const r of document.querySelectorAll("div.result, div.web-result")) {
        const a = r.querySelector("a.result__a[href]");
        if (a) found.push({ href: a.href, title: clean(a), snippet: clean(r.querySelector(".result__snippet")) });
      }
    }
    return { found, title: document.title, text: (document.body?.innerText || "").slice(0, 2000) };
  }, engine.kind);
}

/** One search of one engine in one browser context: { results: [{ title, url, snippet }], blocked }. Throws only when the page could not be reached at all. */
async function searchOnce(context, engine, query, resultsMs = RESULTS_MS) {
  const page = await context.newPage();
  try {
    const resp = await page.goto(engine.url(query), { waitUntil: "domcontentloaded", timeout: PAGE_MS });
    const read = await readResults(page, engine, resultsMs);
    const seen = new Set();
    const results = [];
    for (const r of read.found) {
      const url = unwrapResultUrl(r.href);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      results.push({ title: r.title, url, snippet: r.snippet });
    }
    const status = resp ? resp.status() : 200;
    return {
      results,
      blocked: looksBlocked({ status, title: read.title, text: read.text, results: results.length }),
      noResults: results.length === 0 && NO_RESULTS.test(read.text),            // the page says there are none, as against a page that merely shows none
      said: results.length ? "" : `HTTP ${status}, "${String(read.title).slice(0, 50)}", ${String(read.text).length} characters: ${String(read.text).replace(/\s+/g, " ").slice(0, 140)}`,   // what an empty page said, for the log
    };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * The searcher: `getContext()` gives the (headless) browser context searches are made in; `openWindow()` (optional) opens a VISIBLE browser for a person to
 * answer a check in, resolving to { context, close }. Everything else (the clock, the pause, the engines) can be replaced for tests.
 */
export function createSearcher({ getContext, openWindow = null, engines = ENGINES, gapMs = GAP_MS, helpMs = HELP_MS, blockMs = BLOCK_MS, maxPerHour = MAX_PER_HOUR, resultsMs = RESULTS_MS, queryMs = QUERY_MS, askMinMs = ASK_MIN_MS, log = () => {}, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const blockedUntil = new Map();                       // engine name -> when it may be tried again
  const times = [];                                     // when searches were made, for the hour's limit
  let last = 0;
  let helper = null;                                    // { context, close } the person answered a check in; searches go on there
  let helperTried = false;                              // a window is opened once; after that, a check stops the searching for blockMs
  let helperUntil = 0;
  let asks = 0;                                         // times a person was asked in the window that is open

  const isBlocked = (e) => (blockedUntil.get(e.name) || 0) > now();

  async function pace() {
    const wait = last + gapMs - now();
    if (wait > 0) await sleep(wait);
    last = now();
  }

  /**
   * A visible window on the first engine, with the person's help: resolves to { results } once results are on the page, or null when nobody answered in time (the
   * window is then closed). `win` is the window a person already answered a check in, asked again; without it a window is opened. A person is waited for
   * `waitMs` at most (the job's deadline may be nearer than `helpMs`).
   */
  async function withAPerson(query, win = null, waitMs = helpMs) {
    helperTried = true;
    asks += 1;
    win ??= await openWindow();
    const engine = engines[0];
    try {
      const page = await win.context.newPage();
      await page.goto(engine.url(query), { waitUntil: "domcontentloaded", timeout: PAGE_MS }).catch(() => {});
      for (let waited = 0; waited < waitMs; waited += 1000) {
        const read = await readResults(page, engine, 800).catch(() => null);
        if (read && read.found.length) {
          const seen = new Set();
          const results = [];
          for (const r of read.found) {
            const url = unwrapResultUrl(r.href);
            if (url && !seen.has(url)) { seen.add(url); results.push({ title: r.title, url, snippet: r.snippet }); }
          }
          await page.close().catch(() => {});
          helper = win;
          helperUntil = now() + 10 * 60_000;
          return { results, engine: engine.name };
        }
        await sleep(1000);
      }
    } catch { /* the window was closed by the person: no help */ }
    await win.close().catch(() => {});
    if (helper === win) helper = null;
    asks = 0;
    return null;
  }

  /**
   * Search for `query`. Resolves to { results, engine, blocked, limited, helped }: `blocked` when the engines turned the search away (and nobody answered),
   * `limited` when the hour's searches are used up. `help: false` never opens a window. `until` (a time, as `now()` gives it) is the deadline of the job this
   * search is part of: with less than `queryMs` left no search is made, and a person is never waited for past it, so that the job ends with what it has
   * instead of being cut off with nothing; that answers `blocked` too, and `timeUp`.
   */
  async function search(query, { help = true, until = 0 } = {}) {
    const q = String(query ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
    if (q.length < 2) return { results: [], engine: null, blocked: false, limited: false, helped: false };
    const left = () => (until ? until - now() : Infinity);
    const wait = () => Math.min(helpMs, left() - 3_000);                 // how long a person may be waited for
    const t = now();
    while (times.length && t - times[0] > HOUR_MS) times.shift();
    if (times.length >= maxPerHour) return { results: [], engine: null, blocked: false, limited: true, helped: false };
    if (left() < queryMs) return { results: [], engine: null, blocked: true, limited: false, helped: false, timeUp: true };
    if (helper && now() > helperUntil) { await helper.close().catch(() => {}); helper = null; }
    await pace();
    times.push(now());

    // a window a person has already answered a check in: it stays good for a while, and when the engine asks again the person is asked again, there
    if (helper) {
      try {
        const out = await searchOnce(helper.context, engines[0], q, resultsMs);
        if (!out.blocked) { helperUntil = now() + 10 * 60_000; return { results: out.results, engine: engines[0].name, blocked: false, limited: false, helped: true }; }
        if (help && asks < MAX_ASKS && left() >= askMinMs) {
          const again = await withAPerson(q, helper, wait());
          if (again) return { results: again.results, engine: again.engine, blocked: false, limited: false, helped: true };
          return { results: [], engine: null, blocked: true, limited: false, helped: false };       // nobody answered: the window is closed, searching stops
        }
      } catch { /* the window is gone: fall through */ }
      await helper?.close().catch(() => {});
      helper = null;
      asks = 0;
      for (const e of engines) blockedUntil.set(e.name, now() + blockMs);
      return { results: [], engine: null, blocked: true, limited: false, helped: false };
    }

    const context = await getContext();
    let blocked = false;
    let doubtful = false;
    for (const engine of engines) {
      if (isBlocked(engine)) { blocked = true; continue; }
      let out;
      try { out = await searchOnce(context, engine, q, resultsMs); } catch (err) { log(`${engine.name} could not be reached: ${String(err?.message || err).split("\n")[0].slice(0, 120)}`); continue; }   // try the next
      if (out.blocked) { log(`${engine.name} turned the search away (a check, or an empty page)`); blockedUntil.set(engine.name, now() + blockMs); blocked = true; continue; }
      log(`${engine.name}: ${out.results.length} result(s) for ${JSON.stringify(q.slice(0, 60))}${out.said ? `  [${out.said}]` : ""}`);
      if (out.results.length === 0 && !out.noResults) { doubtful = true; continue; }          // nothing on the page, and nothing that says there is nothing: the next engine is asked too
      return { results: out.results, engine: engine.name, blocked: false, limited: false, helped: false };
    }
    if (!blocked) return { results: [], engine: null, blocked: false, limited: false, helped: false };   // neither engine could be reached at all

    if (help && openWindow && !helperTried && left() >= askMinMs) {
      const answered = await withAPerson(q, null, wait());
      if (answered) {
        for (const e of engines) blockedUntil.delete(e.name);
        return { results: answered.results, engine: answered.engine, blocked: false, limited: false, helped: true };
      }
    }
    return { results: [], engine: null, blocked: true, limited: false, helped: false };
  }

  /** Whether a search is worth trying now: some engine is not turned away, or a window may still be opened. */
  const available = (help = true) => engines.some((e) => !isBlocked(e)) || Boolean(helper) || (help && Boolean(openWindow) && !helperTried);

  async function close() {
    await helper?.close().catch(() => {});
    helper = null;
  }

  return { search, available, close, state: () => ({ blocked: [...blockedUntil].filter(([, until]) => until > now()).map(([n]) => n), helperOpen: Boolean(helper), searches: times.length }) };
}

/** The page's "Web search": each query searched, the results as the websites of businesses ([{ website, title, query }]). */
export async function searchSites(searcher, queries, { help = true, until = 0 } = {}) {
  const all = [];
  let searched = 0;
  let blocked = false;
  let limited = false;
  let timeUp = false;
  let engine = null;
  for (const q of queries) {
    const out = await searcher.search(q, { help, until });
    if (out.blocked) { blocked = true; timeUp = Boolean(out.timeUp); break; }
    if (out.limited) { limited = true; break; }
    searched += 1;
    engine = out.engine || engine;
    for (const r of out.results) all.push({ query: q, title: r.title, url: r.url });
  }
  return { searched, sites: sitesFrom(all), engine, blocked, limited, timeUp };
}

/** A company's website from its name, by a search for the name (see `websiteFrom`). `blocked` / `limited` as for `search`. */
export async function findWebsiteBySearch(searcher, name, { help = true, until = 0 } = {}) {
  const out = await searcher.search(`"${String(name).replace(/"/g, " ").trim()}"`, { help, until });
  return { ...websiteFrom(name, out.results.map((r) => ({ ...r, query: name }))), blocked: out.blocked, limited: out.limited };
}

/** A company's Facebook and Instagram pages from its name (see `socialsFrom`): { facebook?, instagram?, blocked, limited }. Their pages are not opened. */
export async function findSocialsBySearch(searcher, name, { help = true, until = 0 } = {}) {
  const out = await searcher.search(`"${String(name).replace(/"/g, " ").trim()}" site:facebook.com OR site:instagram.com`, { help, until });
  return { ...socialsFrom(name, out.results), blocked: out.blocked, limited: out.limited };
}

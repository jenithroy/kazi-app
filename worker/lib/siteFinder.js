/**
 * Find a company's own website from its name, with no search engine and no social network anywhere in it.
 *
 * What it does: a company called "Hunter Apparel Solutions Ltd" very often has its site at hunterapparelsolutions.com or .co.uk, so the name is
 * turned into a few guesses (at most 12 host names), each guess's home page is read, and a guess is accepted only when the page really is that
 * company's. Nothing is searched, no profile is opened, no marketplace is touched (a guess that would land on one is never made), and nobody
 * signs in. It is the same kind of request the contact finder makes (worker/lib/contactFinder.js), with the same manners.
 *
 * The manners (a guess is somebody else's server, and most guesses are somebody else's site):
 *   - robots.txt is read first, for every site the request lands on, exactly as the contact finder reads it: a site that asks robots to keep
 *     out, or whose robots.txt cannot be read, is left alone; a missing robots.txt (404) does not stop it;
 *   - one home page per guess, https only, no other page; a redirect to ANOTHER site means the guess is not it and is left;
 *   - the guesses are tried AT_ONCE at a time (three different servers together, never two requests to one server), best first: a guess that
 *     does not exist can take seconds to be told so, and one at a time the right guess was often not reached before the time was up;
 *   - a guess that does not answer (no such site, a refusal, a timeout) is passed over quickly: a site that cannot answer its tiny robots.txt
 *     within ROBOTS_MS is left, and a site that did answer gets up to PROBE_MS in all for its home page (some servers are slow) and a pause before
 *     the next group; all of it stops after BUDGET_MS;
 *   - an honest name goes with every request (getPage sends FINDER_UA).
 *
 * What makes a page "that company's" (a wrong match is worse than none, so this is strict): the company's own words must be on the page, the
 * first of them always, and for a name of two or more words they must be together (as the name, in the page's title, or all near the top), not
 * spread over a long page; a parked or for-sale page never counts, nor does a page about another company with a similar name. A name made of
 * nothing but common words ("The Window Treatments Company") cannot be told apart from the next company that uses those words, so a match is
 * only ever as good as the page: the answer carries a `confidence` and the words of `evidence` for a person to see.
 *
 * Pure functions are exported so the rules can be tested without a network; `findWebsiteFor` is the one that fetches.
 */
import { closedTo, getPage, isPublicHostname, robotsAllows, robotsVerdict, visibleText } from "./contactFinder.js";

const TLDS = [".co.uk", ".com", ".uk"];
const MAX_CANDIDATES = 12;
const MIN_SLUG = 5;                  // a shorter name is never a guess: too many unrelated sites own it
const MAX_SLUG = 40;
const MAX_TOKENS = 8;
const MAX_HTML = 200_000;
const ROBOTS_MS = 5_000;             // a site that cannot answer its robots.txt (a small file) in this long is not answering
const PROBE_MS = 12_000;             // one guess in all: its robots.txt, its home page and any redirects within the site
const BUDGET_MS = 20_000;            // all the guesses (one that has begun is let finish, within the two limits above)
const PAUSE_MS = 300;                // after a group of guesses of which a site answered
const AT_ONCE = 3;                   // guesses tried together: they are different servers, and a guess that does not exist can take seconds to be told so

// Words that say what kind of company it is in law, not which one.
const LEGAL = new Set(["ltd", "limited", "llp", "lp", "plc", "inc", "llc", "corp", "co", "company", "cic", "gmbh"]);
// Words that are in a great many company names: they are kept for the first guess (hunterapparelsolutions) and left out of what a page must show.
const GENERIC = new Set([
  "the", "and", "of", "for", "in", "at", "by", "on", "to", "a", "an", "uk", "gb", "ni", "group", "holdings", "international", "services", "service",
  "solutions", "supplies", "supply", "trading", "sons", "son", "brothers", "bros", "partners", "associates", "enterprises", "industries", "products", "systems",
]);
// A guess that would land on one of these is never made: they are not a company's own website.
const NEVER = new Set([
  "google", "bing", "duckduckgo", "yahoo", "facebook", "instagram", "linkedin", "twitter", "tiktok", "youtube", "pinterest", "reddit", "snapchat",
  "whatsapp", "telegram", "amazon", "etsy", "alibaba", "aliexpress", "gumtree", "wikipedia", "github",
]);

/* ── The name ─────────────────────────────────────────────────── */

const ENTITY = { amp: "&", nbsp: " ", quot: "\"", apos: "'", rsquo: "'", lsquo: "'" };
function decode(text) {
  return String(text ?? "").replace(/&(#?[a-z0-9]{1,8});/gi, (all, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    }
    return ENTITY[e.toLowerCase()] ?? " ";
  });
}

/** Letters and digits in single-spaced lower-case words: "J & B Textiles (UK)" becomes "j and b textiles uk". Accents go, apostrophes vanish, "&" is "and". */
export function normalize(text) {
  return decode(text).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’`]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

/** The names a company goes by: its own, and after "trading as" / "t/a" the name it trades under ("James Boylan Safety Ltd T/A's JBS Group"). */
function variantsOf(name) {
  return String(name ?? "").split(/\s+(?:t\/a'?s?|trading\s+as)\s+/i).slice(0, 2).map((s) => s.trim()).filter(Boolean);
}

function tokensOfVariant(text) {
  const all = normalize(text).split(" ").filter((w) => w && !LEGAL.has(w)).slice(0, MAX_TOKENS);
  return { all, distinctive: all.filter((w) => !GENERIC.has(w)) };
}

/**
 * The words of a company's name: { all, distinctive }, lower case. `all` is the name without its legal ending ("ltd", "limited", "plc"…);
 * `distinctive` is `all` without the words that are in a great many names ("the", "group", "solutions", "sons"…). Of a name with a trading name
 * ("… T/A JBS Group") these are the words of the first part, the company's own.
 */
export function nameTokens(name) {
  return tokensOfVariant(variantsOf(name)[0] ?? "");
}

/** A word without a plural "s" (silks, silk), so a page that says "silk" matches a name that says "Silks". */
const stem = (w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w);

/**
 * The host names to try, best first, at most MAX_CANDIDATES: the whole name run together (hunterapparelsolutions), then the name without its
 * common words (hunterapparel), each ending .co.uk, .com and .uk; and last, for a name of one or two distinctive words, the first word on its
 * own (sulis, for "Sulis Silks"). Letters and digits only, 5 or more of them. Never a search engine, a social network, a marketplace.
 */
export function candidateHosts(name) {
  const variants = variantsOf(name).map(tokensOfVariant).filter((v) => v.distinctive.length > 0);
  const slugs = [];
  const add = (slug) => {
    if (slug.length >= MIN_SLUG && slug.length <= MAX_SLUG && !NEVER.has(slug) && !slugs.includes(slug)) slugs.push(slug);
  };
  for (const v of variants) {
    add(v.all.filter((w) => w !== "the" && w !== "and").join(""));
    add(v.distinctive.join(""));
  }
  for (const v of variants) if (v.distinctive.length <= 2) add(v.distinctive[0]);
  const hosts = [];
  for (const slug of slugs) {
    for (const tld of TLDS) {
      const host = `${slug}${tld}`;
      if (isPublicHostname(host) && !closedTo(host)) hosts.push(host);
    }
  }
  return hosts.slice(0, MAX_CANDIDATES);
}

/* ── Reading a page ───────────────────────────────────────────── */

function titleOf(html) {
  const lower = html.toLowerCase();
  const at = lower.indexOf("<title");
  const gt = at === -1 ? -1 : html.indexOf(">", at);
  if (gt === -1) return "";
  const end = lower.indexOf("</title", gt);
  return decode(html.slice(gt + 1, end === -1 ? gt + 301 : Math.min(end, gt + 301))).replace(/\s+/g, " ").trim();
}

/** What the page says about itself in its description and its sharing tags, found by walking to each "<meta" (at most 40, each read to 700 characters). */
function metaOf(html) {
  const lower = html.toLowerCase();
  let out = "";
  let from = 0;
  for (let looked = 0; looked < 40; looked += 1) {
    const at = lower.indexOf("<meta", from);
    if (at === -1) break;
    from = at + 5;
    const gt = html.indexOf(">", at);
    if (gt === -1 || gt - at > 700) continue;
    const tag = html.slice(at, gt);
    if (!/(?:name|property)\s*=\s*["'](?:description|og:title|og:site_name|og:description|twitter:title)["']/i.test(tag)) continue;
    const m = /content\s*=\s*(?:"([^"]{0,400})"|'([^']{0,400})')/i.exec(tag);
    if (m) out += ` ${m[1] ?? m[2]}`;
  }
  return out;
}

const STRONG_PARKED = [
  "this domain is for sale", "domain is for sale", "domain for sale", "domain may be for sale", "buy this domain", "register this domain",
  "domain parking", "parked domain", "this web page is parked", "domain has been registered", "account suspended", "default web page",
];
const WEAK_PARKED = ["parked", "sedo", "afternic", "godaddy", "hugedomains"];

/** Whether a page is a placeholder and not a company: a parking or for-sale page, a registrar's default page, a suspended account, "coming soon". */
export function looksParked(visible, title = "") {
  const lower = `${title} ${visible}`.toLowerCase().slice(0, 20_000);
  if (STRONG_PARKED.some((p) => lower.includes(p))) return true;
  const little = String(visible).length;
  if (little < 1500 && WEAK_PARKED.some((w) => new RegExp(`\\b${w}\\b`).test(lower))) return true;     // "godaddy" in a footer of a real page is not it
  return little < 600 && lower.includes("coming soon");
}

/**
 * Whether a page is the home page of the company whose words are `variant` ({ all, distinctive }), on `host`: { ok, confidence, evidence, why }.
 * `why` says what was missing when it is not.
 */
export function judgePage(html, variant, host) {
  const { distinctive } = variant;
  const first = distinctive[0];
  if (!first) return { ok: false, confidence: 0, evidence: "", why: "the name has no distinctive word" };
  const title = titleOf(html);
  const visible = visibleText(html);
  if (looksParked(visible, title)) return { ok: false, confidence: 0, evidence: "", why: "a parked or placeholder page" };

  const spaced = normalize(`${title} ${metaOf(html)} ${visible}`);
  const words = new Set(spaced.split(" "));
  const squash = spaced.replace(/ /g, "");
  const top = new Set(normalize(String(visible).slice(0, 8000)).slice(0, 3000).split(" "));
  const titleWords = new Set(normalize(title).split(" "));
  const hasIn = (set, w) => set.has(w) || set.has(stem(w)) || set.has(`${stem(w)}s`);
  const joined = distinctive.join("");
  const phrase = joined.length >= MIN_SLUG && (squash.includes(joined) || (joined.endsWith("s") && squash.includes(joined.slice(0, -1))));
  const initials = distinctive.slice(0, 2).join("");                                    // "wmsugden": the page may write "W M Sugden"
  const strong = distinctive.filter((w) => w.length >= 3);
  const inTitle = hasIn(titleWords, first);

  if (first.length >= 3 ? !hasIn(words, first) : !(initials.length >= MIN_SLUG && squash.includes(initials))) {
    return { ok: false, confidence: 0, evidence: "", why: `the first word (${first}) is not on the page` };
  }
  const share = strong.length ? strong.filter((w) => hasIn(words, w)).length / strong.length : 0;
  if (share < 0.6) return { ok: false, confidence: 0, evidence: "", why: "too few of the company's words are on the page" };
  if (distinctive.length === 1) {
    if (!(inTitle || hasIn(top, first))) return { ok: false, confidence: 0, evidence: "", why: "the name is not in the title or at the top of the page" };
  } else if (!(phrase || inTitle || (share === 1 && strong.every((w) => hasIn(top, w))))) {
    return { ok: false, confidence: 0, evidence: "", why: "the company's words are not together on the page" };
  }

  const label = String(host).replace(/^www\./, "").split(".")[0];
  const confidence = Math.min(1, 0.3 + 0.3 * share + (phrase ? 0.2 : 0) + (inTitle ? 0.15 : 0) + (joined.length >= MIN_SLUG && label.includes(joined) ? 0.1 : 0));
  const evidence = title ? `title: ${title.slice(0, 80)}` : `text: ${String(visible).replace(/\s+/g, " ").trim().slice(0, 80)}`;
  return { ok: true, confidence: Math.round(confidence * 100) / 100, evidence, why: "" };
}

/* ── Fetching ─────────────────────────────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LATE = Symbol("late");
function within(ms, promise) {
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(LATE), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/**
 * One guess: its robots.txt first, then its home page. Resolves to { contacted, html, host, origin }: `html` is the page (null when there is none
 * to judge: no such site, a refusal by the site or by its robots.txt, another site's redirect, a timeout), `contacted` whether any server answered.
 */
async function look(host, fetchImpl, left, respectRobots = true) {
  const robots = new Map();                                        // origin -> its robots.txt answer, read once
  let contacted = false;
  const robotsMs = Math.min(ROBOTS_MS, Math.max(2_000, left));     // the last guesses of a nearly spent budget are given less time, never none
  const probeMs = Math.min(PROBE_MS, Math.max(4_000, left));
  const allow = async (url) => {
    if (!respectRobots) return "ok";                               // switched off by the person who asked (Sources: "Respect robots.txt")
    const u = new URL(url);
    if (!robots.has(u.origin)) {
      const got = await within(robotsMs, getPage(`${u.origin}/robots.txt`, fetchImpl, { site: host }));
      const r = got === LATE ? { status: null, url: "", text: "" } : got;
      if (r.status !== null || r.offSite || r.refused) contacted = true;
      robots.set(u.origin, r);
    }
    const r = robots.get(u.origin);
    const verdict = robotsVerdict(r);
    if (verdict === "deny") return "unreadable";
    if (verdict === "allow") return "ok";
    return robotsAllows(r.text, u.pathname + u.search) ? "ok" : "disallowed";
  };
  const home = await within(probeMs, getPage(`https://${host}/`, fetchImpl, { allow, site: host }));
  if (home === LATE || home.status === null || !home.text) return { contacted, html: null };
  const u = new URL(home.url);
  return { contacted: true, html: home.text.slice(0, MAX_HTML), host: u.hostname, origin: u.origin };
}

/**
 * Find a company's own website from its name. Resolves to { site, host, confidence, evidence, tried }: `site` is "https://host/" or null when no
 * guess was that company's, `confidence` is 0 to 1, `evidence` is a few of the page's own words (its title), `tried` is how many guesses were made
 * and `of` how many there were to make (a miss with `tried` under `of` ran out of time: trying again may find it).
 * It never throws: a guess that goes wrong is a guess passed over.
 */
export async function findWebsiteFor(name, { fetchImpl = fetch, pause = PAUSE_MS, respectRobots = true } = {}) {
  const variants = variantsOf(name).map(tokensOfVariant).filter((v) => v.distinctive.length > 0);
  const hosts = candidateHosts(name);
  const none = (tried) => ({ site: null, host: null, confidence: 0, evidence: "", tried, of: hosts.length });
  if (!variants.length || !hosts.length) return none(0);
  const stopAt = Date.now() + BUDGET_MS;
  let tried = 0;
  for (let at = 0; at < hosts.length; at += AT_ONCE) {
    if (Date.now() > stopAt) break;
    const group = hosts.slice(at, at + AT_ONCE);
    tried += group.length;
    const seen = await Promise.all(group.map(async (host) => {
      try { return await look(host, fetchImpl, stopAt - Date.now(), respectRobots); } catch { return { contacted: false, html: null }; }      // a guess that goes wrong is passed over
    }));
    for (const one of seen) {                                      // in the order of the guesses: the best-placed one that is that company's wins
      if (!one.html) continue;
      let best = null;
      for (const v of variants) {
        const verdict = judgePage(one.html, v, one.host);
        if (verdict.ok && (!best || verdict.confidence > best.confidence)) best = verdict;
      }
      if (best) return { site: `${one.origin}/`, host: one.host, confidence: best.confidence, evidence: best.evidence, tried, of: hosts.length };
    }
    if (seen.some((one) => one.contacted) && pause) await sleep(pause);
  }
  return none(tried);
}

/**
 * What makes a Reddit post a lead, and the row it becomes.
 *
 * Pure functions, nothing here talks to a network or a database, so the rules can be tested on their own (worker/lib/redditLeads.js
 * does the fetching and saving).
 *
 * A post is read as lower-case text (its title and what its author wrote) against four lists the team edits on the page:
 *   strong   a phrase that says "I need a maker" (one is enough: STRONG_POINTS each)
 *   weak     a word that only counts together with others (WEAK_POINTS each, so three weak ones make a lead at the default threshold)
 *   block    a phrase that says it is not a buyer (an ad, a job, a career question): the post is dropped whatever else it says
 *   minScore the points a post needs to be kept
 * A phrase is matched as whole words, so "job" does not hit "jobber". A `*` in a phrase stands for up to three words, so
 * "looking for a * manufacturer" hits "looking for a high-end outerwear manufacturer" as well as "looking for a manufacturer". A phrase may
 * have at most MAX_STARS of them (a dozen would let a long post keep the search busy for minutes), and only the first MAX_TEXT characters
 * of a post are read.
 */

import { isPublicHostname } from "./contactFinder.js";

export const MAX_STARS = 3;
export const MAX_TEXT = 20000;

export const STRONG_POINTS = 40;
export const WEAK_POINTS = 10;

export const DEFAULT_SETTINGS = Object.freeze({
  subreddits: ["ClothingStartups", "streetwearstartup", "clothingbrandstartup", "ClothingBrand", "manufacturing", "smallbusiness", "ecommerce"],
  strong: [
    "looking for a * manufacturer", "looking for * manufacturers", "looking for a * factory", "need a * manufacturer", "need * manufacturer",
    "need a * factory", "find a * manufacturer", "finding a * manufacturer", "find * manufacturers", "manufacturer needed",
    "recommend a * manufacturer", "manufacturer recommendation", "manufacturer recommendations", "who makes", "who can make",
    "cut and sew", "cut & sew", "private label", "white label", "tech pack", "techpack", "low moq", "apparel manufacturer",
    "garment manufacturer", "clothing manufacturer", "small batch", "sample run", "production run",
  ],
  weak: [
    "moq", "minimum order", "sourcing", "supplier", "manufacturer", "manufacturing", "startup", "clothing line", "clothing brand",
    "first collection", "start a clothing", "starting a clothing", "launch my brand", "apparel", "garment",
  ],
  block: [
    "for hire", "we are a * manufacturer", "we are a * manufacturing", "we are a * factory", "we are a * supplier", "we are a * company",
    "we manufacture", "we offer", "we help brands", "our factory", "our services", "dm us", "dm for quote", "get a quote",
    "we are hiring", "i'm hiring", "hiring", "job", "jobs", "salary", "career", "resume", "internship", "interview", "layoff", "union",
  ],
  minScore: 30,
});

/** Sites a post links to that say nothing about the poster's own brand: pictures, video, other social networks, marketplaces. */
const NOT_A_BRAND_SITE = [
  "reddit.com", "redd.it", "redditmedia.com", "imgur.com", "youtube.com", "youtu.be", "giphy.com", "tenor.com", "discord.gg", "discord.com",
  "instagram.com", "facebook.com", "fb.com", "tiktok.com", "twitter.com", "x.com", "linkedin.com", "pinterest.com", "docs.google.com",
  "drive.google.com", "google.com", "wikipedia.org", "alibaba.com", "aliexpress.com", "amazon.com", "etsy.com", "ebay.com", "github.com", "medium.com",
];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Text the database will take. A NUL (and the other control characters) cannot be stored, and half of an emoji (a lone surrogate, which is
 * what cutting a string between its two UTF-16 units leaves) is not valid text: Postgres refuses the WHOLE batch that holds one, so one such
 * post used to stop every later check from saving anything.
 */
export function cleanText(text) {
  const s = String(text ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, " ");
  return typeof s.toWellFormed === "function" ? s.toWellFormed() : s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�");
}

/** Reddit's markdown leaves entities and zero-width spaces in the text; read it as plain words. */
export function plainText(text) {
  return cleanText(text)
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&#x200B;|&#8203;|​/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const patternCache = new Map();
/** A phrase as a regular expression (whole words, `*` = up to three words). A phrase with no letters or digits matches nothing. */
export function phraseRegex(phrase) {
  const key = String(phrase ?? "");
  if (patternCache.has(key)) return patternCache.get(key);
  const tokens = key.toLowerCase().trim().split(/\s+/).filter(Boolean);
  while (tokens[0] === "*") tokens.shift();                              // a star at either end means nothing ("* manufacturer" is "manufacturer")
  while (tokens[tokens.length - 1] === "*") tokens.pop();                // and a leading one would make the search try every position of a long post
  let re = null;
  if (tokens.some((t) => /[a-z0-9]/.test(t)) && tokens.filter((t) => t === "*").length <= MAX_STARS) {
    const body = tokens.map((t) => (t === "*" ? "(?:\\S+\\s+){0,3}" : `${escapeRegex(t)}\\s+`)).join("").replace(/\\s\+$/, "");
    re = new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`);
  }
  if (patternCache.size > 500) patternCache.clear();
  patternCache.set(key, re);
  return re;
}

export const phraseHits = (text, phrase) => { const re = phraseRegex(phrase); return re ? re.test(text) : false; };

/**
 * { score, hits, blockedBy } for one post. `blockedBy` is the first block phrase it contains (the score is 0 then); `hits` lists the
 * phrases that scored, strong ones first.
 */
export function scorePost(post, settings = DEFAULT_SETTINGS) {
  const text = plainText(`${post?.title ?? ""} ${String(post?.selftext ?? "").slice(0, MAX_TEXT)}`).toLowerCase();
  const blockedBy = (settings.block || []).find((p) => phraseHits(text, p)) || null;
  if (blockedBy) return { score: 0, hits: [], blockedBy };
  const strong = (settings.strong || []).filter((p) => phraseHits(text, p));
  const weak = (settings.weak || []).filter((p) => phraseHits(text, p));
  return { score: strong.length * STRONG_POINTS + weak.length * WEAK_POINTS, hits: [...strong, ...weak], blockedBy: null };
}

const URL_RE = /https?:\/\/[^\s)\]>"'<]+/gi;
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
const siteIsNoise = (host) => !host || NOT_A_BRAND_SITE.some((s) => host === s || host.endsWith(`.${s}`));

// What the page and the database will both accept as a website (database: reddit_leads_website_fmt): printable ASCII with no spaces or
// control characters (some systems count U+0085 as white space), at most 300 long, a public host name on a standard port.
const SAFE_URL = /^https?:\/\/[\x21-\x7e]{1,290}$/;
function okWebsite(u) {
  if (u.length > 300 || !SAFE_URL.test(u)) return false;
  try {
    const x = new URL(u);
    return (x.protocol === "http:" || x.protocol === "https:") && !x.username && !x.password && (!x.port || x.port === "80" || x.port === "443") && isPublicHostname(x.hostname);
  } catch { return false; }
}

/** The first web address in a post that looks like the poster's own site (not Reddit, a picture host, another social network, nor anything the page would refuse to save), or "". */
export function websiteOf(post) {
  const urls = [...String(post?.selftext ?? "").slice(0, MAX_TEXT).matchAll(URL_RE)].map((m) => m[0]).concat(post?.url ? [String(post.url)] : []);
  for (const u of urls) {
    const clean = u.replace(/[.,;:!?)]+$/, "");
    if (!siteIsNoise(hostOf(clean)) && okWebsite(clean)) return clean;
  }
  return "";
}

/** `s` cut to at most `n` characters, by WHOLE characters (never between the two halves of an emoji), with an ellipsis when it was cut. */
const clip = (s, n) => { const cps = Array.from(s); return cps.length > n ? `${cps.slice(0, n - 1).join("").trimEnd()}…` : s; };
const SUB_OK = /^[A-Za-z0-9_]{2,21}$/;
const POST_ID_OK = /^[a-z0-9]{3,12}$/;

/**
 * The row to save for a post, or null when it is not a lead (blocked, too few points, not a post we can link to). The row holds only what
 * the scrape knows: what the team writes about a lead (status, brand, notes) is never in it, so saving it cannot overwrite that.
 */
export function leadRow(post, settings = DEFAULT_SETTINGS) {
  if (!post || typeof post !== "object") return null;
  const id = String(post.id ?? "").toLowerCase();
  const sub = String(post.subreddit ?? "");
  const title = plainText(post.title);
  const created = Number(post.created_utc);
  if (!POST_ID_OK.test(id) || !SUB_OK.test(sub) || !title || !Number.isFinite(created) || created <= 0 || created > 4102444800) return null;
  const { score, hits } = scorePost(post, settings);
  if (score < (settings.minScore ?? DEFAULT_SETTINGS.minScore)) return null;
  return {
    reddit_id: id,
    subreddit: sub,
    title: clip(title, 300),
    excerpt: clip(plainText(String(post.selftext ?? "").slice(0, MAX_TEXT)), 600) || null,
    url: `https://www.reddit.com/r/${sub}/comments/${id}/`,
    posted_at: new Date(created * 1000).toISOString(),
    score: Math.min(score, 1000),
    hits: hits.slice(0, 12).map((h) => clip(cleanText(h), 80)),
    // always present (null when there is none): a batch of rows that do not all have the same keys is refused by some PostgREST versions
    website: websiteOf(post) || null,
  };
}

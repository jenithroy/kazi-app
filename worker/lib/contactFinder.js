/**
 * Find a business's public contact emails on its own website.
 *
 * What it does: fetch the home page and up to two "contact" or "about" pages of ONE site, and read the email addresses the site shows
 * (a mailto link, plain text, an address written out as "name [at] site [dot] com", one hidden by Cloudflare, the site's own schema.org
 * data) and the links to its social pages. Nothing else: it does not search Google, open Facebook or Instagram, log in anywhere,
 * or crawl past those three pages.
 *
 * The manners (it is a request the server makes for a person who is signed in, to any address that person types, and a page is somebody
 * else's text, so none of it is trusted):
 *   - only http(s) to a public host name; never an IP address, localhost, a name without a dot or an internal-looking suffix, and
 *     only the standard ports. A redirect is followed up to three times and each stop is checked again, so a public name that
 *     redirects to an internal one is refused. A redirect to ANOTHER SITE (a parked page, Linktree, a social profile) is refused too:
 *     what it shows is not this brand's contact address;
 *   - robots.txt is read first, for every site the request lands on, before any of its pages: a page it disallows is not fetched, and a
 *     robots.txt that cannot be read at all (a server error, a timeout) counts as "keep out" (RFC 9309), while a missing one (404) does not;
 *   - a short timeout, a size cap on every page, a pause between pages, an honest User-Agent that says who is asking;
 *   - reading is bounded: how much of a page is looked at, how many links, how many robots.txt rules, and no pattern whose cost can grow
 *     faster than the text is long (a hostile page took 20 seconds of CPU on an earlier version).
 *
 * Pure functions are exported so the reading rules can be tested without a network; `findContacts` is the one that fetches.
 */
import { isFreeMail } from "./freeMail.js";

export const FINDER_UA = "KaziContactFinder/1.0 (+https://kazimfg.com.np; reads a business's public contact pages only)";
const ROBOTS_TOKEN = "kazicontactfinder";

const MAX_BYTES = 1_500_000;
const MAX_SCAN = 800_000;            // characters of a page that are read: the first and last half of this when a page is longer
const MAX_ANCHORS = 4000;            // links looked at on one page
const MAX_RULES = 400;               // robots.txt rules looked at, and the longest one
const MAX_PATTERN = 200;
const MAX_PATH = 2000;
const TIMEOUT_MS = 9000;
const MAX_REDIRECTS = 3;
const MAX_PAGES = 3;                 // the home page and two more
const PAUSE_MS = 700;
const BUDGET_MS = 40_000;            // after this the pages not yet read are left

/**
 * Sites whose own rules forbid reading their pages with a program, whatever their robots.txt says path by path (and whatever the caller has
 * switched off). The finder does not touch them (not even for the robots.txt) and says what to do instead. eBay: its robots.txt opens "The use of robots or other automated means
 * to access the eBay site without the express permission of eBay is strictly prohibited", its User Agreement bars scrapers and any
 * automated access ("for any purpose, except with the prior express permission of eBay") and collecting users' email addresses without their consent,
 * its store pages answer a plain program with 403 and answered the finder's own Chromium with a "Please verify yourself to continue" security check
 * (one load, 2026-11-05; its robots.txt path rules do leave /str/<name> open, but its header says that is no permission), and its developer licence does not allow sellers' details to be used to
 * write to them: a seller's own website is the way (see worker/lib/emailFinder.js and the Contact Finder page).
 */
const CLOSED_SITES = [
  {
    host: /(^|\.)ebay\.[a-z]{2,3}(\.[a-z]{2})?$/,
    message: "eBay's rules don't allow programs to read its pages, and it shows them a security check, so this can't be read. Find the seller's own website (many sellers have one) and type that instead.",
  },
];

// Social networks and search engines are closed to this reader too, whatever robots.txt is set to: they answer a program with a sign-in page or a
// block, and what they show without one is next to nothing. The brand's own website is the way: it carries its email and links to its social pages.
const SOCIAL = /(?:^|\.)(?:instagram\.com|facebook\.com|fb\.com|fb\.me|linkedin\.com|tiktok\.com|twitter\.com|x\.com|threads\.(?:net|com)|snapchat\.com|youtube\.com|youtu\.be|pinterest\.[a-z]{2,3}(?:\.[a-z]{2})?)$/;
// (Google's own search host in any country, not every Google address: a business's website may well be on sites.google.com)
const SEARCH = /^(?:www\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$|(?:^|\.)bing\.com$|(?:^|\.)duckduckgo\.com$|^(?:[a-z]+\.)?search\.yahoo\.com$|(?:^|\.)yandex\.[a-z]{2,3}$|^(?:www\.)?baidu\.com$|(?:^|\.)ecosia\.org$|(?:^|\.)startpage\.com$|^search\.brave\.com$/;
const SOCIAL_MESSAGE = "Instagram, Facebook and the other social networks don't let programs read their pages (they ask for a sign-in and block automated access), so this can't be read. The brand's own website usually shows the same email and links to its social pages: type that instead.";
const SEARCH_MESSAGE = "Search engines don't let programs read their results pages, so this can't be read. Type the company's own website instead.";

/** Why a host name may not be read at all, in plain words, or "". */
export const closedTo = (host) => {
  const h = String(host ?? "").toLowerCase().replace(/\.$/, "");
  if (SOCIAL.test(h)) return SOCIAL_MESSAGE;
  if (SEARCH.test(h)) return SEARCH_MESSAGE;
  return CLOSED_SITES.find((s) => s.host.test(h))?.message || "";
};

/** Something the person who typed the address should be told, in plain words. */
export class FinderError extends Error {
  constructor(message) { super(message); this.name = "FinderError"; }
}

/* ── Which addresses may be fetched ───────────────────────────── */

const BAD_SUFFIX = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet", ".private", ".test", ".invalid", ".example", ".arpa"];

/** A real, public-looking host name: letters, digits and hyphens in dotted labels, a letter-only last label, not an IP address. */
export function isPublicHostname(host) {
  const h = String(host ?? "").toLowerCase().replace(/\.$/, "");
  if (!h || h.length > 253 || !h.includes(".")) return false;
  if (h === "localhost" || BAD_SUFFIX.some((s) => h.endsWith(s))) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return false;                // an IPv4 or IPv6 address
  const labels = h.split(".");
  if (!labels.every((l) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(l) || /^xn--[a-z0-9-]+$/.test(l))) return false;
  return /^[a-z]{2,}$|^xn--[a-z0-9-]+$/.test(labels[labels.length - 1]);
}

/** What somebody typed ("shop.example.com", "https://example.com/pages/about") as a URL we may fetch, or a FinderError that says why not. */
export function parseSiteUrl(input) {
  let raw = String(input ?? "").trim();
  if (!raw) throw new FinderError("Type the website's address first.");
  if (raw.length > 300) throw new FinderError("That address is too long.");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let u;
  try { u = new URL(raw); } catch { throw new FinderError("That doesn't look like a web address."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new FinderError("Only web addresses (http or https) can be read.");
  if (u.username || u.password) throw new FinderError("An address with a password in it can't be read.");
  if (u.port && u.port !== "80" && u.port !== "443") throw new FinderError("Only the standard web ports can be read.");
  if (!isPublicHostname(u.hostname)) throw new FinderError("That isn't a public website address.");
  u.hash = "";
  return u;
}

const registrable = (host) => String(host).toLowerCase().replace(/^www\./, "");

/** Whether two host names are one site: the same, or one a subdomain of the other (shop.brand.com and brand.com), www ignored. */
export function sameSite(a, b) {
  const x = registrable(a);
  const y = registrable(b);
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

/* ── robots.txt ───────────────────────────────────────────────── */

/**
 * Whether a robots.txt pattern ("/private", "/*.pdf$", "/a*b") matches the start of `path`. A `*` is any run of characters, a trailing `$`
 * pins the end. Matching goes part by part (the text between the stars) with `indexOf`, so its cost is about the path's length however many
 * stars there are: the obvious regular expression takes minutes on `/*a*a*a*a*a*b` against a long path.
 */
export function robotsPatternMatches(pattern, path) {
  let pat = pattern;
  let pinned = false;
  if (pat.endsWith("$")) { pinned = true; pat = pat.slice(0, -1); }
  const parts = pat.split("*");
  if (!path.startsWith(parts[0])) return false;
  let pos = parts[0].length;
  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i];
    if (part === "") continue;
    if (pinned && i === parts.length - 1) return path.length - part.length >= pos && path.endsWith(part);      // the last part must be the path's end
    const at = path.indexOf(part, pos);
    if (at === -1) return false;
    pos = at + part.length;
  }
  if (!pinned) return true;
  return parts.length > 1 && parts[parts.length - 1] === "" ? true : pos === path.length;                       // "…*$" matches to the end; no star: the whole path
}

/** Whether `path` may be fetched under a robots.txt, for our token (else the `*` group). The longest matching rule wins; Allow wins a tie. */
export function robotsAllows(robotsTxt, path) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  let rules = 0;
  for (const lineRaw of String(robotsTxt ?? "").slice(0, 500_000).split(/\r?\n/)) {
    const line = lineRaw.replace(/#.*/, "").trim();
    const m = /^([a-z-]{1,20})\s*:\s*(.{0,400})$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && cur) {
      lastWasAgent = false;
      if (rules < MAX_RULES) { cur.rules.push({ allow: key === "allow", pattern: val }); rules += 1; }
    } else lastWasAgent = false;
  }
  const mine = groups.filter((g) => g.agents.includes(ROBOTS_TOKEN));
  const star = groups.filter((g) => g.agents.includes("*"));
  const use = mine.length ? mine : star;
  const target = String(path ?? "").slice(0, MAX_PATH);
  let best = null;
  for (const g of use) {
    for (const r of g.rules) {
      if (!r.pattern || r.pattern.length > MAX_PATTERN) continue;          // "Disallow:" with nothing after it allows everything
      if (!robotsPatternMatches(r.pattern, target)) continue;
      const len = r.pattern.length;
      if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
    }
  }
  return best ? best.allow : true;
}

/**
 * What a robots.txt answer says about the whole site (RFC 9309): "rules" (read them), "allow" (the file is not there: 4xx other than 429),
 * "deny" (the file could not be read: a server error, 429, a timeout, a refused redirect: keep out until it can).
 */
export function robotsVerdict(res) {
  if (res && res.status === 200) return "rules";
  if (res && res.status !== null && res.status >= 400 && res.status < 500 && res.status !== 429) return "allow";
  return "deny";
}

/* ── Reading a page ───────────────────────────────────────────── */

const ROLE_NAMES = new Set(["info", "hello", "contact", "support", "sales", "admin", "office", "mail", "enquiries", "inquiries", "orders", "service", "team", "help", "care", "wholesale", "press", "hi", "shop", "store", "customerservice", "enquiry", "bookings", "accounts", "marketing", "studio", "hey", "business", "partnerships"]);
const JUNK_DOMAINS = new Set(["example.com", "domain.com", "yourdomain.com", "mysite.com", "yoursite.com", "sentry.io", "wixpress.com", "shopify.com", "godaddy.com", "squarespace.com", "wordpress.com", "schema.org", "w3.org"]);
const JUNK_LOCAL = new Set(["you", "your", "name", "yourname", "user", "username", "email", "youremail", "example", "test", "someone", "johndoe", "john.doe", "janedoe", "jane.doe", "firstname", "lastname", "noreply", "no-reply", "donotreply", "do-not-reply"]);
const ASSET_END = /\.(png|jpe?g|gif|webp|svg|ico|pdf|mp4|css|js|woff2?)$/i;

// Every pattern below is bounded (a page is somebody else's text: a hostile one must not be able to make the server work for minutes).
// Nothing here scans for a run of characters that has no end: emails are found by looking around each "@" (scanEmails), links by
// walking to each "<a" (anchorsIn).
const EMAIL_SHAPE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const CF_RE = /data-cfemail=["']([0-9a-f]{2,400})["']|\/cdn-cgi\/l\/email-protection#([0-9a-f]{2,400})/gi;
const LD_RE = /"email"\s{0,5}:\s{0,5}"([^"]{1,200})"/gi;
const SOCIAL_RE = /https?:\/\/(?:www\.|m\.|mobile\.|[a-z]{2}\.)?(instagram|facebook|tiktok|pinterest|linkedin|youtube|twitter|x)\.com\/(@?[A-Za-z0-9_./%-]{2,80})/gi;
// Only an address WRITTEN OUT with brackets counts ("name [at] brand [dot] com"). The bare words "at" and "dot" are never read as an @ or a
// dot: "visit us at brand.com" is a sentence, not us@brand.com. (Run on text whose white space is already single spaces.)
const OBF_AT = / ?[[({] ?at ?[\])}] ?/gi;
const OBF_DOT = / ?[[({] ?dot ?[\])}] ?/gi;
const HREF_RE = /\shref\s*=\s*(?:"([^"]{0,500})"|'([^']{0,500})'|([^\s"'=<>`]{1,500}))/i;
const LOCAL_CH = /[A-Za-z0-9._%+-]/;
const DOMAIN_CH = /[A-Za-z0-9.-]/;

/** The part of a page that is read: all of it, or its first and last half when it is longer than MAX_SCAN (a footer holds contact details). */
export function scanText(html) {
  const t = String(html ?? "");
  return t.length <= MAX_SCAN ? t : `${t.slice(0, MAX_SCAN / 2)} ${t.slice(-MAX_SCAN / 2)}`;
}

/** The text of a page with its scripts, styles and tags taken out, in time that grows only with its length (an unclosed script drops the rest). */
export function visibleText(html) {
  const src = String(html ?? "");
  const lower = src.toLowerCase();
  let out = "";
  let i = 0;
  let nextScript = lower.indexOf("<script");
  let nextStyle = lower.indexOf("<style");
  while (i < src.length) {
    if (nextScript !== -1 && nextScript < i) nextScript = lower.indexOf("<script", i);
    if (nextStyle !== -1 && nextStyle < i) nextStyle = lower.indexOf("<style", i);
    const starts = [nextScript, nextStyle].filter((n) => n !== -1);
    if (starts.length === 0) { out += src.slice(i); break; }
    const start = Math.min(...starts);
    out += `${src.slice(i, start)} `;
    const end = lower.indexOf(start === nextScript ? "</script" : "</style", start);
    if (end === -1) break;
    const close = lower.indexOf(">", end);
    if (close === -1) break;
    i = close + 1;
  }
  return out.split("<").map((piece, n) => {
    if (n === 0) return piece;
    const gt = piece.indexOf(">");
    return gt === -1 ? ` ${piece}` : ` ${piece.slice(gt + 1)}`;
  }).join("");
}

/**
 * The links of a page as { href, label }, found by walking to each "<a" and reading at most 1,200 characters of its tag and 600 of its
 * text: the work is the number of links (capped) times a constant, whatever the page holds. A tag that is never closed is skipped.
 */
export function anchorsIn(html) {
  const src = scanText(html);
  const lower = src.toLowerCase();
  const out = [];
  let from = 0;
  for (let looked = 0; looked < MAX_ANCHORS * 3 && out.length < MAX_ANCHORS; looked += 1) {
    const i = lower.indexOf("<a", from);
    if (i === -1) break;
    from = i + 2;
    if (!/\s/.test(lower[i + 2] ?? "")) continue;                           // "<abbr>", "<article>"…
    const head = src.slice(i, i + 1200);
    const gt = head.indexOf(">");
    if (gt === -1) continue;
    const m = HREF_RE.exec(head.slice(0, gt));
    if (!m) continue;
    const rest = src.slice(i + gt + 1, i + gt + 601);
    const close = rest.toLowerCase().indexOf("</a");
    out.push({ href: (m[1] ?? m[2] ?? m[3] ?? "").replace(/&amp;/gi, "&"), label: close === -1 ? rest : rest.slice(0, close) });
  }
  return out;
}

/** The email-shaped words in a text, found by looking around each "@" (so the cost never depends on how long a run of letters is). */
export function scanEmails(text) {
  const out = [];
  let at = text.indexOf("@");
  let looked = 0;
  while (at !== -1 && looked < 4000) {
    looked += 1;
    let s = at;
    while (s > 0 && at - s < 64 && LOCAL_CH.test(text[s - 1])) s -= 1;
    let e = at + 1;
    while (e < text.length && e - at < 254 && DOMAIN_CH.test(text[e])) e += 1;
    const tooLong = s > 0 && at - s >= 64 && LOCAL_CH.test(text[s - 1]);           // a 64-character stretch with more behind it is not an address
    const m = tooLong ? null : EMAIL_SHAPE.exec(text.slice(s, e));
    if (m) out.push(m[0]);
    at = text.indexOf("@", e);
  }
  return out;
}

/** An address Cloudflare hid: the first byte is a key, every other byte is the character XOR the key. */
export function decodeCfEmail(hex) {
  try {
    const key = parseInt(hex.slice(0, 2), 16);
    let out = "";
    for (let i = 2; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    return out;
  } catch { return ""; }
}

const tidy = (e) => { let s = String(e ?? ""); try { s = decodeURIComponent(s); } catch { /* keep as written */ } return s.trim().replace(/^[.,;:<>()[\]"' ]+|[.,;:<>()[\]"' ]+$/g, "").split("?")[0].toLowerCase(); };

/** Whether an address is worth keeping: a real shape, not a picture name ("logo@2x.png"), a placeholder ("you@example.com") or a platform's own address. */
export function plausibleEmail(e) {
  if (!e || !e.includes("@") || e.length > 254 || ASSET_END.test(e)) return false;
  const at = e.lastIndexOf("@");
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (!local || local.length > 64 || !domain.includes(".") || JUNK_DOMAINS.has(domain) || JUNK_LOCAL.has(local)) return false;
  if (/@[23]x\./.test(e) || /\d{2,}x\d{2,}/.test(e)) return false;
  return /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/.test(e);
}

/** Every plausible address a page shows, as a Set of lower-case strings. */
export function emailsIn(html) {
  const text0 = scanText(html);
  const found = new Set();
  for (const a of anchorsIn(text0)) if (/^mailto:/i.test(a.href.trim())) found.add(tidy(a.href.trim().slice(7)));
  for (const m of text0.matchAll(CF_RE)) { const d = decodeCfEmail(m[1] || m[2] || ""); if (d) found.add(tidy(d)); }
  for (const m of text0.matchAll(LD_RE)) found.add(tidy(m[1].replace(/^mailto:/i, "")));
  const entities = (s) => s.replace(/&#(?:64|x40);|&commat;/gi, "@").replace(/&#(?:46|x2e);|&period;/gi, ".");
  const visible = entities(visibleText(text0)).replace(/\s+/g, " ").replace(OBF_AT, "@").replace(OBF_DOT, ".");
  for (const e of scanEmails(visible)) found.add(tidy(e));
  for (const e of scanEmails(entities(text0))) found.add(tidy(e));                 // attributes and inline data
  return new Set([...found].filter(plausibleEmail));
}

// the first part of an address that is a share button, a post, a player or a login, not the brand's own page
const NOT_A_PROFILE = new Set(["sharer", "share", "sharer.php", "dialog", "plugins", "tr", "intent", "login", "p", "reel", "explore", "hashtag",
  "watch", "embed", "results", "shorts", "playlist", "feed", "iframe_api", "redirect", "oembed", "home", "i", "search", "settings", "widgets.js", "privacy", "policies"]);

/**
 * The brand's own pages on social networks that a page links to: { instagram: "https://…", facebook: …, tiktok, pinterest, linkedin, youtube, x },
 * the first of each. A link is only ever what the brand's own website shows: no social network is opened or searched (they do not allow it, and
 * most would not show a program anything without a login). Twitter's old address is kept as "x"; a LinkedIn link is kept only when it is a
 * company's page, not a person's own profile.
 */
export function socialLinksIn(html) {
  const out = {};
  for (const m of scanText(html).matchAll(SOCIAL_RE)) {
    const raw = m[1].toLowerCase();
    const net = raw === "twitter" ? "x" : raw;
    const path = m[2].replace(/[/.]+$/, "");
    const first = path.split("/")[0].toLowerCase();
    if (!first || NOT_A_PROFILE.has(first) || out[net]) continue;
    if (net === "linkedin" && !/^(company|showcase|school)\//i.test(path)) continue;                 // the company's page, never a person's own (linkedin.com/in/…)
    out[net] = net === "x" ? `https://x.com/${path}` : `https://www.${net}.com/${path}`;
  }
  return out;
}

const CONTACT_WORDS = ["contact", "about", "support", "help", "connect", "get-in-touch", "reach", "customer-service", "faq"];
const GUESS_PATHS = ["/contact", "/pages/contact", "/pages/contact-us", "/contact-us"];

/** The links on a page to the same site's contact or about pages, best first. */
export function contactLinksIn(html, baseUrl) {
  let base;
  try { base = new URL(baseUrl); } catch { return []; }
  const here = registrable(base.hostname);
  const seen = new Set();
  const scored = [];
  for (const a of anchorsIn(html)) {
    let href;
    try { href = new URL(a.href.trim(), base); } catch { continue; }
    if ((href.protocol !== "http:" && href.protocol !== "https:") || registrable(href.hostname) !== here) continue;
    href.hash = "";
    const key = href.toString();
    if (seen.has(key) || ASSET_END.test(href.pathname)) continue;
    const label = a.label.replace(/<[^>]+>/g, " ").trim().toLowerCase();
    const n = CONTACT_WORDS.filter((w) => href.pathname.toLowerCase().includes(w) || label.includes(w)).length;
    if (n) { seen.add(key); scored.push([n, key]); }
  }
  return scored.sort((x, y) => y[0] - x[0]).map((s) => s[1]).slice(0, 2);
}

/** How an address reads: "free" (Gmail and the like: often a person), "role" (info@, hello@), or "named" (a name at the brand's own domain). */
export function kindOfEmail(email) {
  const [local, domain] = String(email).toLowerCase().split("@");
  if (isFreeMail(domain)) return "free";
  return ROLE_NAMES.has(local) ? "role" : "named";
}

/** Whether an address is on the site it was found on (or the other way round: shop.example.com and example.com). */
export function onOwnDomain(email, host) {
  const d = String(email).split("@")[1] || "";
  const h = registrable(host);
  return d === h || d.endsWith(`.${h}`) || h.endsWith(`.${d}`);
}

/** Higher is a better address to write to: the site's own domain first, then a company address over a free mail one, then a role over a name. */
export function scoreEmail(email, host) {
  const [local, domain] = String(email).split("@");
  let s = onOwnDomain(email, host) ? 100 : 0;
  s += isFreeMail(domain) ? -45 : 25;
  s += ROLE_NAMES.has(local) ? -18 : 10;
  if (/support|help|webmaster|sitemap|mailer/.test(local)) s -= 15;
  return s;
}

/* ── Fetching ─────────────────────────────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readCapped(res) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    chunks.push(value);
    if (total >= MAX_BYTES) { try { await reader.cancel(); } catch { /* done anyway */ } break; }
  }
  const all = new Uint8Array(Math.min(total, MAX_BYTES));
  let at = 0;
  for (const c of chunks) { const room = all.length - at; if (room <= 0) break; all.set(c.length > room ? c.subarray(0, room) : c, at); at += Math.min(c.length, room); }
  return new TextDecoder("utf-8").decode(all);
}

/**
 * GET one page as text, following up to MAX_REDIRECTS redirects by hand so every stop can be checked. Returns { status, url, text }
 * (`text` empty for a non-text answer). `status` is null when nothing could be read: a network failure, a body cut off half way, a
 * redirect loop, or one of the two refusals below, which also say why:
 *   `site`    a host name; a stop (the first address or a redirect) on ANOTHER SITE is refused: { offSite: <that host> }
 *   `allow`   async (url) => "ok" | "disallowed" | "unreadable", asked before EVERY request including each redirect's: { refused: <the answer> }
 */
export async function getPage(rawUrl, fetchImpl = fetch, { allow = null, site = null } = {}) {
  let url = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let u;
    try { u = parseSiteUrl(url); } catch { return { status: null, url, text: "" }; }
    if (site && !sameSite(u.hostname, site)) return { status: null, url: u.toString(), text: "", offSite: u.hostname };
    if (allow) {
      const verdict = await allow(u.toString());
      if (verdict !== "ok") return { status: null, url: u.toString(), text: "", refused: verdict };
    }
    let res;
    try {
      res = await fetchImpl(u.toString(), {
        method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": FINDER_UA, Accept: "text/html,text/plain;q=0.9,*/*;q=0.5", "Accept-Language": "en" },
      });
    } catch { return { status: null, url: u.toString(), text: "" }; }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      try { url = new URL(res.headers.get("location"), u).toString(); } catch { return { status: null, url: u.toString(), text: "" }; }
      try { await res.body?.cancel(); } catch { /* nothing to cancel */ }
      continue;
    }
    const type = (res.headers.get("content-type") || "").toLowerCase();
    const readable = !type || type.includes("text/") || type.includes("html") || type.includes("xml");
    let text = "";
    if (readable && res.status < 400) {
      try { text = await readCapped(res); } catch { return { status: null, url: u.toString(), text: "" }; }      // a connection dropped half way through the body
    }
    return { status: res.status, url: u.toString(), text };
  }
  return { status: null, url, text: "" };
}

/**
 * Read one business's public contact pages. Resolves to
 *   { ok, site, host, pages, emails: [{ email, kind, ownDomain, source }], socials, robotsBlocked, message }
 * (plus `closed: true` for a site that may not be read at all, and `blocked: true` for one that turned this reader away: 401, 403, 429, 503)
 * and throws a FinderError only for an address that may not be fetched at all. A site that cannot be reached, or that sends visitors to
 * another site, is `ok: false` with a message.
 */
export async function findContacts(input, { fetchImpl = fetch, pause = PAUSE_MS, respectRobots = true } = {}) {
  const start = parseSiteUrl(input);
  const deadline = Date.now() + BUDGET_MS;
  const robotsOf = new Map();                              // origin -> its robots.txt answer, read once
  const robotsFor = async (origin) => {
    if (!robotsOf.has(origin)) robotsOf.set(origin, await getPage(`${origin}/robots.txt`, fetchImpl, { site: start.hostname }));
    return robotsOf.get(origin);
  };
  const allow = async (url) => {
    if (!respectRobots) return "ok";                         // the person who asked has switched it off (Sources: "Respect robots.txt"): the site's robots.txt is not read
    const u = new URL(url);
    const r = await robotsFor(u.origin);
    const v = robotsVerdict(r);
    if (v === "deny") return "unreadable";
    if (v === "allow") return "ok";
    return robotsAllows(r.text, u.pathname + u.search) ? "ok" : "disallowed";
  };
  const options = { allow, site: start.hostname };
  const result = (over) => ({ ok: true, site: start.toString(), host: registrable(start.hostname), pages: [], emails: [], socials: {}, robotsBlocked: false, message: "", ...over });
  const refusal = (r) => {
    if (r.refused === "disallowed") return result({ robotsBlocked: true, message: "This site asks robots not to read its pages, so nothing was read." });
    if (r.refused === "unreadable") {
      const asked = robotsOf.get(new URL(r.url).origin);                     // no answer at all means the site itself could not be reached
      return result({ ok: false, message: asked && asked.status === null ? "That site could not be reached."
        : "This site's robots.txt could not be read (the site may have a problem), so nothing was read. Try again later." });
    }
    if (r.offSite) return result({ ok: false, message: `That address sends visitors to another site (${r.offSite}). Type that site's own address instead.` });
    return null;
  };

  // a site whose own rules forbid programs is not touched at all
  const closed = closedTo(start.hostname);
  if (closed) return result({ ok: false, closed: true, message: closed });

  // robots.txt comes first, for every site the request lands on (unless it was switched off): a site that asks robots to keep out is not touched at all
  let home = await getPage(start.toString(), fetchImpl, options);
  const noAnswer = home.status === null && !home.offSite && home.refused !== "disallowed";
  if (noAnswer && start.protocol === "https:") {                 // a few small sites answer on plain http only
    const plain = new URL(start.toString());
    plain.protocol = "http:";
    home = await getPage(plain.toString(), fetchImpl, options);
  }
  const stopped = refusal(home);
  if (stopped) return stopped;
  if (!home.text) {
    const st = home.status;
    return result({
      ok: false,
      blocked: [401, 403, 429, 503].includes(st),
      message: [401, 403, 429, 503].includes(st) ? `That site doesn't let automated readers in (${st}), so nothing could be read. Try its Instagram or Facebook by hand.`
        : st ? `That site answered with an error (${st}), so nothing could be read.` : "That site could not be reached.",
    });
  }
  const homeUrl = new URL(home.url);
  const host = registrable(homeUrl.hostname);
  let robotsBlocked = false;

  const pages = [{ url: home.url, text: home.text }];
  const linked = contactLinksIn(home.text, home.url);
  const targets = (linked.length ? linked : GUESS_PATHS.slice(0, 2).map((p) => new URL(p, homeUrl).toString())).slice(0, MAX_PAGES - 1);
  for (const t of targets) {
    if (Date.now() > deadline) break;
    if (pause) await sleep(pause);
    const p = await getPage(t, fetchImpl, options);
    if (p.refused === "disallowed") { robotsBlocked = true; continue; }
    if (p.text && registrable(new URL(p.url).hostname) === host) pages.push({ url: p.url, text: p.text });
  }

  const byEmail = new Map();
  const socials = {};
  for (const p of pages) {
    for (const e of emailsIn(p.text)) if (!byEmail.has(e)) byEmail.set(e, p.url);
    for (const [net, link] of Object.entries(socialLinksIn(p.text))) if (!socials[net]) socials[net] = link;
  }
  const emails = [...byEmail.entries()]
    .map(([email, source]) => ({ email, kind: kindOfEmail(email), ownDomain: onOwnDomain(email, host), source }))
    .sort((a, b) => scoreEmail(b.email, host) - scoreEmail(a.email, host))
    .slice(0, 8);
  const message = emails.length === 0 ? "No public email address on the pages we may read." : "";
  return { ok: true, site: home.url, host, pages: pages.map((p) => p.url), emails, socials, robotsBlocked, message };
}

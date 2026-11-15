/**
 * Find a brand's logo for "Create by design" on the website (worker/lib/websiteOrders.js serves it as GET /api/website-orders/logo).
 *
 * A visitor types an Instagram name or a website; the page cannot read either (browsers may not read other sites' pages), so the Worker
 * looks for the picture and hands it back. Two ways in, tried in this order:
 *
 *   handle   an Instagram name. The public profile page (https://www.instagram.com/<name>/) is read once, and the picture it names in its own
 *            social-share tags (og:image, the one every link preview reads) is downloaded from Instagram's picture network. No login, no key,
 *            no API, no go-between. That picture is 150 x 150 pixels: the page offers no bigger one and its address is signed, so it cannot be
 *            asked for larger. Small, but a flat logo survives it (the website side warns when a picture is that small).
 *            THE ONE PLACE robots.txt IS NOT OBEYED. Instagram's robots.txt says `User-agent: *` / `Disallow: /` under a notice that automated
 *            collection is prohibited without written permission (read 2026-11-14). The owner of this Worker decided on 2026-11-14, after that
 *            was put to them twice, that a public profile picture is to be read anyway, the way a link preview does. The decision is theirs;
 *            it is not a finding that it is allowed. What is kept: one page and one picture per lookup, an honest User-Agent, a day's cache (a
 *            name already looked up is not asked for again), a pause when Instagram pushes back (429, 401, 403, a redirect to its login page, or
 *            six pages in a row with no profile in them), a cap on how many it is asked per ten minutes, and LOGO_INSTAGRAM_DIRECT=off to stop
 *            it all at once. What is NOT done, ever: logging in, cookies, pretending to be a browser or another company's crawler, proxies, or
 *            trying again to get round a "no". If Instagram says no to this Worker, the page says so and asks for the website or an upload.
 *            NOT KNOWN from here: how Instagram treats a Cloudflare address. It was tried (2026-11-14) only from an ordinary home connection.
 *   site     a website: its home page is read (robots.txt first, the same manners as the contact finder) and the logo is picked from what
 *            the page says it is, best first: the site's own structured data (schema.org logo), a picture named or classed "logo" in the
 *            header, the apple-touch-icon, an SVG icon, a large icon, the social-share picture, the favicon. Each candidate is fetched and
 *            must really be a picture (its first bytes, not its name or the answer's Content-Type), under 4 MB, and, when its size can be
 *            read, at least 48 px a side; the first that is wins.
 *
 * The manners (it is a request the server makes for anyone who types an address, and everything fetched is somebody else's):
 *   - http(s) only, public host names only (no IP address, localhost or internal-looking name), standard ports only, up to 3 redirects,
 *     each stop checked again; the contact finder's own checks (parseSiteUrl for a typed address, isPublicHostname for every host) are used, not copies of them;
 *   - robots.txt is read first for a site, and a site that asks robots to keep out, or whose robots.txt cannot be read, is left alone
 *     (Instagram, above, is the one decided exception);
 *   - a social network, a search engine or eBay as the "site" is refused with the contact finder's own words (closedTo);
 *   - a page is read up to 1.5 MB and a picture up to 4 MB (1 MB for an SVG), 8 s a request and 15 s in all, at most 5 pictures tried;
 *   - an honest User-Agent that says who is asking and why. Nothing here pretends to be a browser or another company's crawler.
 *
 * Pure functions are exported so the rules can be tested without a network; `findLogo` is the one that fetches.
 */
import { FinderError, closedTo, getPage, isPublicHostname, parseSiteUrl, robotsAllows, robotsVerdict } from "./contactFinder.js";

export const LOGO_UA = "KaziLogoFinder/1.0 (+https://kazimanufacturing.com/create; fetches the logo of a brand for the customer who typed it)";

const MAX_IMAGE_BYTES = 4_000_000;
const MAX_SVG_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;
const BUDGET_MS = 15_000;
const MAX_TRIES = 5;
const MIN_SIDE = 48;
const MAX_SCAN = 600_000;
const INSTAGRAM_CDN = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/;
const INSTAGRAM_PAGE_BYTES = 256_000;                  // the share tags sit about 9 KB into a profile page (2026-11-14: three real pages, 8 to 10 KB); its </head> is at about 135 KB
const INSTAGRAM_PAUSE_MS = 15 * 60_000;                // after it pushes back; doubles each time it does again without a success in between, up to 2 hours
const INSTAGRAM_PAUSE_MAX_MS = 2 * 3_600_000;
const INSTAGRAM_HIT_TTL_MS = 24 * 3_600_000;
const INSTAGRAM_MISS_TTL_MS = 30 * 60_000;
const INSTAGRAM_CACHE_MAX = 100;
const INSTAGRAM_CACHE_PICTURE_MAX = 100_000;           // a 150 px profile picture is a few KB; a bigger one is returned but not kept
const INSTAGRAM_ASK_LIMIT = 60;                        // pages asked for per ten minutes by one running copy of the Worker
const INSTAGRAM_ASK_WINDOW_MS = 600_000;
const INSTAGRAM_EMPTY_STREAK = 6;                      // this many pages in a row with no profile in them is treated as being shown a wall

/* ── What was typed ───────────────────────────────────────────── */

/** An Instagram name from what was typed ("@Acme", "acme", "instagram.com/acme/?hl=en"), lower case, or null when it cannot be one. */
export function parseHandle(input) {
  let s = String(input ?? "").trim();
  if (!s || s.length > 200) return null;
  const link = /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^/?#\s]+)/i.exec(s);
  if (link) s = link[1];
  s = s.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(s) || s.startsWith(".") || s.endsWith(".") || s.includes("..")) return null;
  if (["p", "reel", "reels", "explore", "stories", "accounts", "direct", "tv", "about"].includes(s)) return null;      // instagram.com/p/..., not a person
  return s;
}

/** A website address we may fetch from what was typed, or null. */
export function parseSite(input) {
  try { return parseSiteUrl(input); } catch (e) { if (e instanceof FinderError) return null; throw e; }
}

/* ── Is it a picture, and how big ─────────────────────────────── */

const ascii = (b, from, to) => String.fromCharCode(...b.subarray(from, Math.min(to, b.length)));

/** What kind of picture these bytes are, from their first bytes: "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/x-icon", or null. */
export function sniffImage(b) {
  if (!b || b.length < 4) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image/webp";
  if (b.length >= 6 && ascii(b, 0, 3) === "GIF" && (ascii(b, 3, 6) === "87a" || ascii(b, 3, 6) === "89a")) return "image/gif";
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return "image/x-icon";
  const head = new TextDecoder("utf-8").decode(b.subarray(0, 2048)).replace(/^﻿/, "");
  if (/^\s*(?:<\?xml[^>]{0,300}\?>\s*)?(?:<!--[\s\S]{0,500}?-->\s*)*(?:<!DOCTYPE[^>]{0,300}>\s*)?(?:<!--[\s\S]{0,500}?-->\s*)*<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}

/** { w, h } in pixels when the header says so (not for an SVG), else null. */
export function imageSize(b, type) {
  try {
    if (type === "image/png" && b.length >= 24) return { w: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, h: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0 };
    if (type === "image/gif" && b.length >= 10) return { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
    if (type === "image/x-icon" && b.length >= 8) return { w: b[6] || 256, h: b[7] || 256 };
    if (type === "image/webp" && b.length >= 30) {
      const tag = ascii(b, 12, 16);
      if (tag === "VP8 ") return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
      if (tag === "VP8L") { const n = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 }; }
      if (tag === "VP8X") return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    }
    if (type === "image/jpeg") {
      let i = 2;
      for (let guard = 0; i + 9 < b.length && guard < 400; guard += 1) {
        if (b[i] !== 0xff) { i += 1; continue; }
        const m = b[i + 1];
        if (m === 0xff) { i += 1; continue; }
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: (b[i + 7] << 8) | b[i + 8], h: (b[i + 5] << 8) | b[i + 6] };
        i += 2 + ((b[i + 2] << 8) | b[i + 3]);
      }
    }
  } catch { /* a header that ends early is no size */ }
  return null;
}

/* ── Reading a page's tags (bounded: a page is somebody else's text) ─── */

const ENTITIES = { amp: "&", quot: "\"", apos: "'", lt: "<", gt: ">", nbsp: " " };
const decodeEntities = (s) => String(s).replace(/&(#x?[0-9a-f]{1,6}|[a-z]{2,6});/gi, (all, e) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isFinite(n) && n > 31 && n < 0x110000 ? String.fromCodePoint(n) : " "; }
  return ENTITIES[e.toLowerCase()] ?? all;
});

const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]{0,40})\s*=\s*(?:"([^"]{0,1000})"|'([^']{0,1000})'|([^\s"'=<>`]{1,1000}))/g;
function attrsOf(text) {
  const out = {};
  ATTR.lastIndex = 0;
  let m;
  for (let k = 0; k < 40 && (m = ATTR.exec(text)); k += 1) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

/** The tags called `name` in a page as { attrs, pos } (at most 3,000, each read to its ">" within 2,000 characters). */
function tagsOf(src, lower, name) {
  const out = [];
  const open = `<${name}`;
  let from = 0;
  while (out.length < 3000) {
    const i = lower.indexOf(open, from);
    if (i === -1) break;
    from = i + open.length;
    if (!/[\s/]/.test(lower[from] ?? "")) continue;
    const close = src.slice(from, i + 2001).indexOf(">");      // looked for within 2,000 characters only, so a page of unclosed tags is not read quadratically
    if (close === -1) continue;
    const end = from + close;
    out.push({ attrs: attrsOf(src.slice(from, end)), pos: i });
  }
  return out;
}

/** The `logo` of the page's schema.org data (a string, or an object with a url), found without running anything. */
export function ldLogos(src, lower) {
  const out = [];
  let from = 0;
  for (let blocks = 0; blocks < 20; blocks += 1) {
    const i = lower.indexOf("application/ld+json", from);
    if (i === -1) break;
    from = i + 20;
    const start = src.indexOf(">", from);
    if (start === -1) break;
    const end = lower.indexOf("</script", start);
    if (end === -1 || end - start > 100_000) continue;
    let data;
    try { data = JSON.parse(src.slice(start + 1, end)); } catch { continue; }
    let seen = 0;
    const walk = (node, depth) => {
      if (!node || typeof node !== "object" || depth > 6 || seen > 2000) return;
      seen += 1;
      if (Array.isArray(node)) { node.slice(0, 50).forEach((n) => walk(n, depth + 1)); return; }
      for (const key of Object.keys(node).slice(0, 60)) {
        const v = node[key];
        if (key === "logo") {
          for (const x of [].concat(v)) {
            if (typeof x === "string") out.push(x);
            else if (x && typeof x === "object" && typeof (x.url || x.contentUrl) === "string") out.push(x.url || x.contentUrl);
          }
        } else if (v && typeof v === "object") walk(v, depth + 1);
      }
    };
    walk(data, 0);
  }
  return out;
}

const NOT_OURS = /partner|client|sponsor|payment|visa|mastercard|paypal|stripe|klarna|trustpilot|badge|award|app-?store|google-?play|certif|accredit|member/i;
const BANNERISH = /banner|cover|hero|header|share|social|og-|opengraph|twitter-card|placeholder|default/i;

/**
 * The pictures a page offers as its logo, best first: [{ url, kind, score }]. `base` is the page's address (relative links are resolved
 * against it); only http(s) pictures are kept (no data: or javascript: addresses).
 */
export function extractCandidates(html, base) {
  const src = String(html ?? "").slice(0, MAX_SCAN);
  const lower = src.toLowerCase();
  const seen = new Map();
  const add = (href, kind, score) => {
    if (!href || typeof href !== "string" || href.length > 1500) return;
    let u;
    try { u = new URL(href.trim(), base); } catch { return; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return;
    u.hash = "";
    const key = u.toString();
    const prev = seen.get(key);
    if (!prev || prev.score < score) seen.set(key, { url: key, kind, score });
  };

  for (const l of ldLogos(src, lower)) add(l, "schema.org logo", 100);

  const headStart = lower.indexOf("<header");
  const headEnd = headStart === -1 ? -1 : lower.indexOf("</header", headStart);
  for (const { attrs, pos } of tagsOf(src, lower, "img")) {
    const href = attrs.src || attrs["data-src"] || (attrs.srcset ? attrs.srcset.split(/[\s,]+/)[0] : "");
    if (!href || /^data:/i.test(href)) continue;
    const own = `${attrs.alt || ""} ${attrs.class || ""} ${attrs.id || ""} ${attrs.title || ""}`;
    const file = href.split(/[?#]/)[0].split("/").pop() || "";
    const before = src.slice(Math.max(0, pos - 300), pos);
    const named = /logo/i.test(own) || /logo/i.test(file) || /(?:class|id)\s*=\s*["'][^"']{0,80}logo/i.test(before.slice(-200));
    if (!named || NOT_OURS.test(own) || NOT_OURS.test(file)) continue;
    const inHeader = headStart !== -1 && headEnd !== -1 && pos > headStart && pos < headEnd;
    // a logo in the header is the brand's; one further down is often a footer or partner variant, so it ranks below the touch icon and the svg icon
    add(href, inHeader ? "header logo" : "page logo", inHeader ? 95 : pos < lower.length * 0.25 ? 85 : 68);
  }

  for (const { attrs } of tagsOf(src, lower, "link")) {
    const rel = (attrs.rel || "").toLowerCase();
    const sizes = (attrs.sizes || "").split(/\s+/).map((s) => parseInt(s, 10)).filter(Number.isFinite);
    const biggest = sizes.length ? Math.max(...sizes) : 0;
    const href = attrs.href;
    if (/apple-touch-icon/.test(rel)) add(href, "apple-touch-icon", 75 + (biggest >= 180 ? 5 : 0));
    else if (/(^|\s)(shortcut\s+)?icon(\s|$)|mask-icon/.test(rel)) {
      const svg = /\.svg(\?|$)/i.test(href || "") || /svg/.test(attrs.type || "");
      add(href, svg ? "svg icon" : "icon", svg ? 70 : biggest >= 128 ? 60 : biggest >= 64 ? 45 : 35);
    }
  }

  for (const { attrs } of tagsOf(src, lower, "meta")) {
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (key === "og:image" || key === "og:image:url" || key === "og:image:secure_url" || key === "twitter:image" || key === "twitter:image:src") {
      add(attrs.content, "social-share picture", BANNERISH.test(attrs.content || "") ? 30 : 45);
    }
  }

  try {
    const origin = new URL(base).origin;
    add(`${origin}/apple-touch-icon.png`, "apple-touch-icon (guessed)", 20);
    add(`${origin}/favicon.ico`, "favicon (guessed)", 10);
  } catch { /* no usable base */ }

  return [...seen.values()].sort((a, b) => b.score - a.score);
}

/* ── Fetching a picture ───────────────────────────────────────── */

/**
 * The address of a picture to fetch: the same rules as for a website a person types (http(s), a public host name, the standard ports, no
 * password in it: the contact finder's own isPublicHostname), but a longer address is allowed: a picture's link comes from a page, not from a
 * person, and a signed link on a picture network is often 400 to 600 characters (parseSiteUrl stops at 300, which silently dropped them).
 */
export function parseImageUrl(raw) {
  const text = String(raw ?? "").trim();
  if (!text || text.length > 2000) throw new FinderError("That picture address is not usable.");
  let u;
  try { u = new URL(text); } catch { throw new FinderError("That picture address is not usable."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new FinderError("Only web addresses (http or https) can be fetched.");
  if (u.username || u.password) throw new FinderError("An address with a password in it can't be fetched.");
  if (u.port && u.port !== "80" && u.port !== "443") throw new FinderError("Only the standard web ports can be fetched.");
  if (!isPublicHostname(u.hostname)) throw new FinderError("That isn't a public address.");
  u.hash = "";
  return u;
}

/**
 * GET a picture, following up to 3 redirects by hand so every stop is checked (public host name, http(s), standard port).
 * `hostOk(hostname, hop)` may refuse a stop. `headersFor(hostname, hop)` may add headers to ONE stop (a key goes to the one host it belongs to,
 * never along a redirect). Resolves to { status, url, bytes, tooLarge } (`bytes` null unless the answer was a 200 with a body that fits
 * `maxBytes`); never throws.
 */
export async function getImage(rawUrl, fetchImpl, { maxBytes = MAX_IMAGE_BYTES, hostOk = null, headersFor = null, timeoutMs = TIMEOUT_MS } = {}) {
  let url = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let u;
    try { u = parseImageUrl(url); } catch { return { status: null, url, bytes: null }; }
    if (hostOk && !hostOk(u.hostname, hop)) return { status: null, url: u.toString(), bytes: null, refused: true };
    let res;
    try {
      res = await fetchImpl(u.toString(), {
        method: "GET", redirect: "manual", signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": LOGO_UA, Accept: "image/*,*/*;q=0.5", ...(headersFor ? headersFor(u.hostname, hop) : {}) },
      });
    } catch { return { status: null, url: u.toString(), bytes: null }; }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      try { url = new URL(res.headers.get("location"), u).toString(); } catch { return { status: null, url: u.toString(), bytes: null }; }
      try { await res.body?.cancel(); } catch { /* nothing to cancel */ }
      continue;
    }
    if (res.status !== 200 || !res.body) { try { await res.body?.cancel(); } catch { /* done */ } return { status: res.status, url: u.toString(), bytes: null }; }
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) { try { await res.body.cancel(); } catch { /* done */ } return { status: 200, url: u.toString(), bytes: null, tooLarge: true }; }
    try {
      const reader = res.body.getReader();
      const chunks = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) { try { await reader.cancel(); } catch { /* done */ } return { status: 200, url: u.toString(), bytes: null, tooLarge: true }; }
        chunks.push(value);
      }
      const bytes = new Uint8Array(total);
      let at = 0;
      for (const c of chunks) { bytes.set(c, at); at += c.length; }
      return { status: 200, url: u.toString(), bytes };
    } catch { return { status: null, url: u.toString(), bytes: null }; }
  }
  return { status: null, url, bytes: null };
}

/** The first of these that really is a picture of a usable size. `small` is the best one under MIN_SIDE, used only if nothing better turns up. */
async function firstPicture(candidates, fetchImpl, deadline, { hostOk = null, headersFor = null, onMiss = null } = {}) {
  let small = null;
  let tried = 0;
  for (const c of candidates) {
    if (tried >= MAX_TRIES || Date.now() > deadline) break;
    tried += 1;
    const img = await getImage(c.url, fetchImpl, { hostOk, headersFor, timeoutMs: Math.max(1000, Math.min(TIMEOUT_MS, deadline - Date.now())) });
    if (!img.bytes) { if (onMiss) onMiss(c, img); continue; }
    const type = sniffImage(img.bytes);
    if (!type || (type === "image/svg+xml" && img.bytes.length > MAX_SVG_BYTES)) continue;
    const size = imageSize(img.bytes, type);
    const found = { ok: true, bytes: img.bytes, type, size, from: new URL(img.url).hostname, via: c.kind };
    if (size && (size.w < MIN_SIDE || size.h < MIN_SIDE)) { if (!small) small = found; continue; }
    return found;
  }
  return small;
}

/* ── The two ways in ──────────────────────────────────────────── */

async function viaWebsite(start, fetchImpl, deadline) {
  const closed = closedTo(start.hostname);
  if (closed) return { ok: false, closed };
  const asUs = (url, init = {}) => fetchImpl(url, { ...init, headers: { ...(init.headers || {}), "User-Agent": LOGO_UA } });
  const robotsOf = new Map();
  const allow = async (url) => {
    const u = new URL(url);
    if (!robotsOf.has(u.origin)) robotsOf.set(u.origin, await getPage(`${u.origin}/robots.txt`, asUs, { site: start.hostname }));
    const r = robotsOf.get(u.origin);
    const verdict = robotsVerdict(r);
    if (verdict === "deny") return "unreadable";
    if (verdict === "allow") return "ok";
    return robotsAllows(r.text, u.pathname + u.search) ? "ok" : "disallowed";
  };
  const options = { allow, site: start.hostname };
  let home = await getPage(start.toString(), asUs, options);
  if (home.status === null && !home.offSite && !home.refused && start.protocol === "https:") {       // a few small sites answer on plain http only
    const plain = new URL(start.toString());
    plain.protocol = "http:";
    home = await getPage(plain.toString(), asUs, options);
  }
  if (home.refused === "disallowed") return { ok: false, robots: true };
  if (home.offSite) return { ok: false, offSite: home.offSite };
  const candidates = extractCandidates(home.text || "", home.url || start.toString());
  if (!home.text) {                                  // nothing readable: the two usual places are all there is to try
    const origin = start.origin;
    candidates.push({ url: `${origin}/apple-touch-icon.png`, kind: "apple-touch-icon (guessed)", score: 20 }, { url: `${origin}/favicon.ico`, kind: "favicon (guessed)", score: 10 });
  }
  const found = await firstPicture(candidates, asUs, deadline);
  return found ? { ...found, source: "website" } : { ok: false };
}

/* ── Instagram: the public profile page ──────────────────────── */

/** Said when Instagram could not be asked or would not answer (a pause, the kill switch, a block, an outage). */
export const INSTAGRAM_MESSAGE = "We couldn't reach Instagram just now. Type your website instead, or upload your logo (your Instagram profile picture works well).";
/** Said when Instagram answered but there is no profile picture to take (a name that does not exist, a typo, a page without its share tags). */
export const INSTAGRAM_NOT_FOUND = "We couldn't find a profile picture for that Instagram name. Check the spelling, type your website instead, or upload your logo.";

// What this running copy of the Worker remembers about Instagram. It is best-effort (a new copy starts empty); `resetInstagram` is for tests.
const instagram = { pausedUntil: 0, strikes: 0, empties: [], asked: [], cache: new Map() };
export function resetInstagram() {
  instagram.pausedUntil = 0; instagram.strikes = 0; instagram.empties = []; instagram.asked = []; instagram.cache.clear();
}

/** A picture address that is Instagram's own picture network, not its page furniture (rsrc.php, the static host). */
const isInstagramPicture = (u) => u.protocol === "https:" && INSTAGRAM_CDN.test(u.hostname) && !/^static\./.test(u.hostname) && !/rsrc\.php/i.test(u.pathname);

/**
 * What a profile page says about itself: { image, title } when it really is the page of `handle` (its og:url is that profile and its og:image
 * is a picture on Instagram's picture network), else null. A login page, a "not available" shell, another account's page or a page of anything
 * else gives null. Reads only the meta tags, without running or following anything. (An account with no picture of its own gets Instagram's
 * default image here like any other: it is not told apart, and the customer sees it in the preview.)
 */
export function instagramProfile(html, handle) {
  const src = String(html ?? "").slice(0, INSTAGRAM_PAGE_BYTES);
  const lower = src.toLowerCase();
  const tags = {};
  for (const { attrs } of tagsOf(src, lower, "meta")) {
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if ((key === "og:url" || key === "og:image" || key === "og:title") && tags[key] === undefined) tags[key] = attrs.content ?? "";
  }
  let page, pic;
  try { page = new URL(tags["og:url"]); pic = new URL(tags["og:image"]); } catch { return null; }
  if (page.protocol !== "https:" || !/^(www\.)?instagram\.com$/.test(page.hostname)) return null;
  const named = /^\/([a-z0-9._]{1,30})\/?$/i.exec(page.pathname);
  if (!named || named[1].toLowerCase() !== handle) return null;
  if (!isInstagramPicture(pic) || pic.href.length > 2000) return null;
  return { image: pic.href, title: (tags["og:title"] || "").slice(0, 200) || null };
}

/**
 * The start of a page as text: read until it already holds `handle`'s profile (the very test used afterwards), or the </head> has arrived, or
 * `maxBytes`; the rest is dropped unread. A page is somebody else's, so only as much as is needed is taken (the signal given to fetch ends a
 * body that stalls).
 */
async function readHead(res, handle, maxBytes) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let total = 0;
  let nextCheck = 8192;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      text += decoder.decode(value, { stream: true });
      if (total >= maxBytes) break;
      if (total >= nextCheck) {                           // at doubling sizes (8 KB, 16 KB, ...), not on every chunk: a server that dribbles single bytes must not make this quadratic
        nextCheck = total * 2;
        if (instagramProfile(text, handle) || text.toLowerCase().includes("</head>")) break;
      }
    }
  } catch { /* a body that fails half way is read as far as it got */ } finally {
    try { await reader.cancel(); } catch { /* done */ }
  }
  return text.slice(0, maxBytes);
}

/** Remember an answer about a name, newest last; the oldest goes when there are too many. */
function remember(handle, entry) {
  instagram.cache.delete(handle);
  instagram.cache.set(handle, entry);
  while (instagram.cache.size > INSTAGRAM_CACHE_MAX) instagram.cache.delete(instagram.cache.keys().next().value);
}

/** Instagram pushed back: stop asking for a while (15 minutes, then 30, then an hour, at most 2 hours; a success starts it over). */
function pushedBack(t, why) {
  const pause = Math.min(INSTAGRAM_PAUSE_MAX_MS, INSTAGRAM_PAUSE_MS * 2 ** instagram.strikes);
  instagram.strikes = Math.min(instagram.strikes + 1, 8);
  instagram.pausedUntil = t + pause;
  instagram.empties = [];
  console.warn(`[logo] Instagram pushed back (${why}): not asking it again for ${Math.round(pause / 60_000)} minutes`);
  return { ok: false, why: "blocked" };
}

/**
 * The picture of an Instagram profile, read from its public page. Resolves to { ok: true, ..., source: "instagram" } or
 * { ok: false, why: "off" | "paused" | "busy" | "blocked" | "unavailable" | "notfound" } (never throws). See the top of this file for what is and is not done.
 */
async function viaInstagram(handle, env, fetchImpl, deadline, tried, now) {
  if (String(env.LOGO_INSTAGRAM_DIRECT ?? "").trim().toLowerCase() === "off") return { ok: false, why: "off" };
  const t = now();
  const cached = instagram.cache.get(handle);
  if (cached && cached.until > t) {
    tried.push("instagram");
    return cached.hit ? { ...cached.hit, ok: true, source: "instagram" } : { ok: false, why: cached.why };
  }
  if (t < instagram.pausedUntil) return { ok: false, why: "paused" };
  instagram.asked = instagram.asked.filter((x) => x > t - INSTAGRAM_ASK_WINDOW_MS);
  if (instagram.asked.length >= INSTAGRAM_ASK_LIMIT) return { ok: false, why: "busy" };
  instagram.asked.push(t);
  tried.push("instagram");

  let res;
  try {
    res = await fetchImpl(`https://www.instagram.com/${handle}/`, {
      method: "GET", redirect: "manual", signal: AbortSignal.timeout(Math.max(1000, Math.min(TIMEOUT_MS, deadline - Date.now()))),
      headers: { "User-Agent": LOGO_UA, Accept: "text/html" },
    });
  } catch { return { ok: false, why: "unavailable" }; }

  const drop = async () => { try { await res.body?.cancel(); } catch { /* done */ } };
  const toLogin = res.status >= 300 && res.status < 400 && /\/(accounts|challenge|login)(\/|\?|$)/i.test(res.headers.get("location") || "");
  if (res.status === 429 || res.status === 401 || res.status === 403 || toLogin) { await drop(); return pushedBack(t, toLogin ? "sent to its login page" : `HTTP ${res.status}`); }
  if (res.status === 404) { await drop(); remember(handle, { until: t + INSTAGRAM_MISS_TTL_MS, hit: null, why: "notfound" }); return { ok: false, why: "notfound" }; }
  if (res.status !== 200) { await drop(); return { ok: false, why: "unavailable" }; }      // anything else (a 5xx, a redirect somewhere else) is not followed or remembered

  const profile = instagramProfile(await readHead(res, handle, INSTAGRAM_PAGE_BYTES), handle);
  if (!profile) {
    // a name that does not exist looks like this too (a 200 page with no profile in it), so one is only a miss; a run of them with no real
    // profile in between, within ten minutes, looks like a wall and is treated as being pushed back
    instagram.empties = instagram.empties.filter((x) => x > t - INSTAGRAM_ASK_WINDOW_MS);
    instagram.empties.push(t);
    if (instagram.empties.length >= INSTAGRAM_EMPTY_STREAK) return pushedBack(t, `${INSTAGRAM_EMPTY_STREAK} pages in a row with no profile in them`);
    remember(handle, { until: t + INSTAGRAM_MISS_TTL_MS, hit: null, why: "notfound" });
    return { ok: false, why: "notfound" };
  }
  instagram.empties = [];                                  // a real profile page came back: whatever else is going on, it is not a wall

  const found = await firstPicture([{ url: profile.image, kind: "instagram profile picture", score: 100 }], fetchImpl, deadline, {
    hostOk: (host) => INSTAGRAM_CDN.test(host) && !/^static\./.test(host),
  });
  if (!found) return { ok: false, why: "unavailable" };
  instagram.strikes = 0;
  const hit = { bytes: found.bytes, type: found.type, size: found.size, from: found.from, via: found.via };
  if (found.bytes.length <= INSTAGRAM_CACHE_PICTURE_MAX) remember(handle, { until: t + INSTAGRAM_HIT_TTL_MS, hit, why: null });
  return { ...hit, ok: true, source: "instagram" };
}

/**
 * Look for a brand's logo. `input` is { handle, site } (either, or both: the handle is tried first). Resolves to
 *   { ok: true, bytes, type, source: "instagram" | "website", from: <host>, size: { w, h } | null, via }
 *   { ok: false, tried: ["instagram", "website"], closed?: <words>, robots?: true, offSite?: <host> }
 * and never throws for a site that does not answer. `closed` carries the words to show when the way in was refused (a social network typed
 * as a site) or came back empty (an Instagram name: INSTAGRAM_NOT_FOUND when its page had no picture, INSTAGRAM_MESSAGE when Instagram
 * could not be asked or would not answer). `now` is the clock for the Instagram pause and cache (tests move it).
 */
export async function findLogo(input, env = {}, { fetchImpl = fetch, now = Date.now } = {}) {
  const deadline = Date.now() + BUDGET_MS;
  const tried = [];
  let why = {};
  const handle = input.handle ? parseHandle(input.handle) : null;
  if (handle) {
    const r = await viaInstagram(handle, env, fetchImpl, deadline, tried, now);
    if (r.ok) return r;
    why = { closed: r.why === "notfound" ? INSTAGRAM_NOT_FOUND : INSTAGRAM_MESSAGE };
  }
  const site = input.site ? parseSite(input.site) : null;
  if (site && Date.now() < deadline) {
    tried.push("website");
    const r = await viaWebsite(site, fetchImpl, deadline);
    if (r.ok) return r;
    why = { closed: r.closed, robots: r.robots, offSite: r.offSite };
  }
  return { ok: false, tried, ...Object.fromEntries(Object.entries(why).filter(([, v]) => v)) };
}

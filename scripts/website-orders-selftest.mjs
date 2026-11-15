/**
 * Self-test of the website-orders Worker code: `node scripts/website-orders-selftest.mjs`
 *
 * No network, no database, no key, no cost. worker/lib/websiteOrders.js and worker/lib/logoFinder.js are imported as they are and run against
 * a pretend Supabase (PostgREST + Storage) and pretend websites. The database function itself (migration 0071) is rehearsed separately:
 * scripts/rehearse-migration/0071.test.mjs. Never put real customer data in here.
 *
 *   A  the route: cross-origin rules, methods, paths
 *   B  checking an order: every field, every refusal, what is cleaned and what is dropped
 *   C  the record handed to the database
 *   D  POST /api/website-orders end to end: the order of work, every way it can fail, what a resend does, the limits, the key
 *   E  health
 *   F  the logo finder: what is typed, what is a picture, what a page offers, the manners (robots.txt, private addresses, redirects, sizes),
 *      and (F5) the Instagram reading: the public profile page, what is accepted from it, the cache, the pauses, the kill switch
 *   G  GET /api/website-orders/logo end to end
 */
import { handleWebsiteOrders, allowedOrigin, clean, normalizeOrder, sameSecret, sniffFile, toDashboard, resetLookupLimit } from "../worker/lib/websiteOrders.js";
import { INSTAGRAM_MESSAGE, INSTAGRAM_NOT_FOUND, extractCandidates, findLogo, getImage, imageSize, instagramProfile, ldLogos, parseHandle, parseImageUrl, parseSite, resetInstagram, sniffImage } from "../worker/lib/logoFinder.js";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass += 1; console.log("  PASS", name); }
  else { fail += 1; console.log("  FAIL", name, detail ? `-> ${detail}` : ""); }
};
const group = (t) => console.log(`\n${t}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// what the code logs is checked, not printed
const logs = [];
const realError = console.error, realWarn = console.warn;
console.error = (...a) => logs.push(a.join(" "));
console.warn = (...a) => logs.push(a.join(" "));
const takeLogs = () => logs.splice(0).join("\n");

/* ── bytes of pretend files ────────────────────────────────────── */

const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const pad = (arr, n) => { const out = new Uint8Array(Math.max(n, arr.length)); out.set(arr); return out; };
const png = (w = 300, h = 120, n = 200) => pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0], n);
const jpeg = (w = 300, h = 120) => pad([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 17, 8, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1], 80);
const webpX = (w = 300, h = 120) => pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0, (w - 1) & 255, ((w - 1) >> 8) & 255, ((w - 1) >> 16) & 255, (h - 1) & 255, ((h - 1) >> 8) & 255, ((h - 1) >> 16) & 255], 60);
const gif = (w = 300, h = 120) => pad([...new TextEncoder().encode("GIF89a"), w & 255, w >> 8, h & 255, h >> 8], 40);
const ico = (w = 32, h = 32) => pad([0, 0, 1, 0, 1, 0, w & 255, h & 255], 60);
const svgText = (s = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><rect width=\"10\" height=\"10\"/></svg>") => new TextEncoder().encode(s);
const pdf = () => pad([...new TextEncoder().encode("%PDF-1.7\n")], 64);
const dst = (n = 600) => { const b = new Uint8Array(n).fill(0x20); b.set(new TextEncoder().encode("LA:ACME COFFEE")); return b; };
const html = (s) => new TextEncoder().encode(s);
const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const big = (() => { const b = new Uint8Array(1_700_000); b.set(png()); return b; })();

/* ── a pretend Supabase ────────────────────────────────────────── */

const URL_DB = "https://pretend-project.supabase.co";
const KEY = "pretend-service-key-never-in-an-answer";
const baseEnv = { SUPABASE_URL: URL_DB, SUPABASE_SERVICE_KEY: KEY };

/**
 * Installs a fake global fetch for the database and the bucket. `s` is its state: stored orders and files, the calls made (in order), and
 * switches for every way it can fail. Anything that is not the database goes to `s.web(url, init)` (pretend websites) or answers 404.
 */
function pretendSupabase(over = {}) {
  const s = {
    orders: [], files: new Map(), calls: [], seq: 0, limitsOk: true, storageStatus: 200, rpcStatus: null, rpcBody: null, bucketStatus: 200, nullStatus: 400,
    throwOn: null, web: null, ...over,
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || "GET").toUpperCase();
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    s.calls.push({ method, url, headers, body: init.body });
    if (s.throwOn && url.includes(s.throwOn)) throw new TypeError("network down");
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.startsWith(URL_DB)) {
      const path = url.slice(URL_DB.length);
      if (method === "GET" && path.startsWith("/rest/v1/orders?")) {
        const key = new URL(url).searchParams.get("web_ref")?.replace(/^eq\./, "");
        return json(200, s.orders.filter((o) => o.web_ref === key).map((o) => ({ id: o.id, order_no: o.order_no })));
      }
      if (method === "POST" && path === "/rest/v1/rpc/website_order_limits_ok") return json(200, s.limitsOk);
      if (method === "POST" && path === "/rest/v1/rpc/ingest_website_order") {
        const p = JSON.parse(init.body).p;
        if (p === null) return json(s.nullStatus, { code: "PT400", message: "invalid: body" });
        if (s.rpcStatus) return json(s.rpcStatus, s.rpcBody ?? { code: "XX", message: "pretend failure" });
        const dup = s.orders.find((o) => o.web_ref === p.key);
        if (dup) return json(200, { ok: true, duplicate: true, id: dup.id, ref: dup.order_no });
        s.seq += 1;
        const row = { id: `00000000-0000-4000-8000-${String(s.seq).padStart(12, "0")}`, order_no: `WEB-${String(s.seq).padStart(3, "0")}`, web_ref: p.key, args: p };
        s.orders.push(row);
        return json(200, { ok: true, duplicate: false, id: row.id, ref: row.order_no });
      }
      if (method === "POST" && path.startsWith("/storage/v1/object/website-orders/")) {
        if (s.storageStatus !== 200) return new Response("storage says no", { status: s.storageStatus });
        s.files.set(path.slice("/storage/v1/object/website-orders/".length), { type: headers["content-type"], bytes: init.body });
        return json(200, { Key: "ok" });
      }
      if (method === "GET" && path === "/storage/v1/bucket/website-orders") return json(s.bucketStatus, { id: "website-orders" });
      return json(404, { message: "no such thing in the pretend database" });
    }
    if (s.web) return s.web(url, init);
    return new Response("not found", { status: 404 });
  };
  return s;
}

const ORIGIN = "https://kazimanufacturing.com";
const post = (env, body, { origin = ORIGIN, headers = {}, raw = null } = {}) => handleWebsiteOrders(new Request("https://kazimfg.com.np/api/website-orders", {
  method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), "CF-Connecting-IP": "203.0.113.7", ...headers }, body: raw ?? JSON.stringify(body),
}), env);
const get = (env, path, { origin = ORIGIN, headers = {} } = {}) => handleWebsiteOrders(new Request(`https://kazimfg.com.np${path}`, { headers: { ...(origin ? { Origin: origin } : {}), "CF-Connecting-IP": "203.0.113.7", ...headers } }), env);
const J = async (res) => res.json();

const uuid = () => crypto.randomUUID();
const designOrder = (over = {}) => ({
  v: 1, key: uuid(), kind: "design",
  contact: { name: "Ama Rai", email: "ama@acmecoffee.com", phone: "+44 7700 900123", company: "Acme Coffee" },
  items: [{ garment: "hoodie", label: "Hoodie", colour: { hex: "#1b3a2b", label: "Pine" }, qty: 50 }],
  brand: { handle: "AcmeCoffee", website: null, logoFrom: "instagram", rightsConfirmed: true },
  deadline: "2027-01-20", message: "Left chest, please.",
  design: { stitches: 5231, colours: 3, widthMm: 90.04, heightMm: 38, placement: "Left chest" },
  files: [
    { kind: "logo", name: "logo.png", type: "image/png", data: b64(png()) },
    { kind: "design", name: "acme.dst", type: "application/octet-stream", data: b64(dst()) },
    { kind: "preview", name: "preview.webp", type: "image/webp", data: b64(webpX()) },
  ],
  source: { page: "/create/" }, hp: "", ...over,
});
const quoteOrder = (over = {}) => ({
  v: 1, key: uuid(), kind: "quote", contact: { name: "Bo Tamang", email: "bo@brand.com" },
  items: [{ garment: "knitwear", label: "Knitwear", qty: 250 }], service: "Embroidery", message: "Need samples first.", source: { page: "/quote/" }, ...over,
});

/* ════════════════════════════════════════════════════════════════ */
group("A. The route");
{
  ok("the website's own origins are allowed", allowedOrigin("https://kazimanufacturing.com") === "https://kazimanufacturing.com" && allowedOrigin("https://www.kazimanufacturing.com") === "https://www.kazimanufacturing.com");
  ok("preview deployments are allowed", allowedOrigin("https://abc123.kazi-view.pages.dev") && allowedOrigin("https://kazifrontend.pages.dev") && allowedOrigin("https://feature-x.kazifrontend.pages.dev"));
  ok("look-alikes are not", !allowedOrigin("https://kazimanufacturing.com.evil.example") && !allowedOrigin("http://kazimanufacturing.com") && !allowedOrigin("https://evilkazi-view.pages.dev") && !allowedOrigin("https://kazi-view.pages.dev.evil.com") && !allowedOrigin("null") && !allowedOrigin(""));
  ok("localhost only when switched on", !allowedOrigin("http://localhost:3000") && allowedOrigin("http://localhost:3000", { WEBSITE_ALLOW_LOCALHOST: "1" }) && allowedOrigin("http://127.0.0.1:4010", { WEBSITE_ALLOW_LOCALHOST: "1" }) && !allowedOrigin("http://localhost.evil.com", { WEBSITE_ALLOW_LOCALHOST: "1" }));
  ok("WEBSITE_ORIGINS replaces the default list", allowedOrigin("https://shop.example.org", { WEBSITE_ORIGINS: "https://shop.example.org, https://x.org" }) && !allowedOrigin("https://kazimanufacturing.com", { WEBSITE_ORIGINS: "https://shop.example.org" }));

  pretendSupabase();
  const pre = await handleWebsiteOrders(new Request("https://kazimfg.com.np/api/website-orders", { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST" } }), baseEnv);
  ok("the preflight from the website is answered 204 with the origin, methods and headers", pre.status === 204 && pre.headers.get("access-control-allow-origin") === ORIGIN && /POST/.test(pre.headers.get("access-control-allow-methods")) && /content-type/i.test(pre.headers.get("access-control-allow-headers")) && pre.headers.get("vary") === "Origin");
  const bad = await handleWebsiteOrders(new Request("https://kazimfg.com.np/api/website-orders", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), baseEnv);
  ok("a preflight from another origin is refused (403) with no CORS headers", bad.status === 403 && !bad.headers.get("access-control-allow-origin"));
  const evilPost = await post(baseEnv, designOrder(), { origin: "https://evil.example" });
  ok("a POST from another origin is refused before anything is read", evilPost.status === 403 && (await J(evilPost)).error === "origin_not_allowed");
  const noOrigin = await post(baseEnv, quoteOrder(), { origin: null });
  ok("a call with no Origin (a script) is let through and gets no CORS headers", noOrigin.status === 200 && !noOrigin.headers.get("access-control-allow-origin"));
  const ok1 = await post(baseEnv, quoteOrder());
  ok("an answer to the website carries its origin, no-store and nosniff", ok1.headers.get("access-control-allow-origin") === ORIGIN && ok1.headers.get("cache-control") === "no-store" && ok1.headers.get("x-content-type-options") === "nosniff" && /json/.test(ok1.headers.get("content-type")));
  ok("the logo headers are exposed to the page", /X-Logo-Source/.test(ok1.headers.get("access-control-expose-headers")) && /Retry-After/.test(ok1.headers.get("access-control-expose-headers")));
  const wrongMethod = await handleWebsiteOrders(new Request("https://kazimfg.com.np/api/website-orders", { method: "GET" }), baseEnv);
  ok("GET on the orders address is 405 and says what is allowed", wrongMethod.status === 405 && wrongMethod.headers.get("allow") === "POST, OPTIONS");
  const wrongLogo = await handleWebsiteOrders(new Request("https://kazimfg.com.np/api/website-orders/logo", { method: "POST" }), baseEnv);
  ok("POST on the logo address is 405", wrongLogo.status === 405);
  ok("an unknown path under it is 404", (await get(baseEnv, "/api/website-orders/nothing")).status === 404);
  const slash = await get(baseEnv, "/api/website-orders/health/");
  ok("a trailing slash is the same address", slash.status === 200 || slash.status === 503);
}

/* ════════════════════════════════════════════════════════════════ */
group("B. Checking an order");
const bad = (over, field, name) => {
  const r = normalizeOrder(over);
  ok(name, r.ok === false && r.status === 400 && (field === undefined || r.body.field === field), JSON.stringify(r.body ?? r.value));
};
{
  const r = normalizeOrder(designOrder());
  ok("a good design order is accepted", r.ok === true, JSON.stringify(r.body));
  const v = r.value;
  ok("the handle is lower-cased, the colour hex upper-cased, a width is rounded to a tenth", v.brand.handle === "acmecoffee" && v.items[0].colour.hex === "#1B3A2B" && v.design.widthMm === 90);
  ok("quantity is the sum of the lines, the files are decoded with their path under the key", v.quantity === 50 && v.files.length === 3 && v.files.every((f) => f.data instanceof Uint8Array && f.path.startsWith(`${v.key}/`)) && v.files.map((f) => f.path.split("/")[1]).sort().join() === "design.dst,logo.png,preview.webp");
  ok("a good quote order is accepted (no files, no brand)", normalizeOrder(quoteOrder()).ok === true);
  ok("version may be left out", normalizeOrder(designOrder({ v: undefined })).ok === true);
  bad(designOrder({ v: 2 }), "v", "another version is refused");
  bad(null, "", "a body that is not an object is refused"); bad([], "", "an array is refused"); bad("x", "", "a string is refused");
  bad(designOrder({ key: undefined }), "key", "no key"); bad(designOrder({ key: "123" }), "key", "a key that is not a uuid"); bad(designOrder({ key: 5 }), "key", "a numeric key");
  { const k = uuid(); ok("an upper-case uuid is accepted and stored lower-case", normalizeOrder(designOrder({ key: k.toUpperCase() })).value?.key === k); }
  bad(designOrder({ kind: "other" }), "kind", "an unknown kind"); bad(designOrder({ kind: undefined }), "kind", "no kind");
  bad(designOrder({ hp: "i am a bot" }), "hp", "a filled honeypot"); bad(designOrder({ hp: 1 }), "hp", "a non-empty honeypot of another type");
  ok("a null honeypot is fine", normalizeOrder(designOrder({ hp: null })).ok === true);
  bad(designOrder({ contact: { name: "", email: "a@b.com" } }), "contact.name", "no name"); bad(designOrder({ contact: { name: "   ", email: "a@b.com" } }), "contact.name", "a blank name");
  bad(designOrder({ contact: { name: "A", email: "nope" } }), "contact.email", "an e-mail with no @"); bad(designOrder({ contact: { name: "A", email: "a@b" } }), "contact.email", "an e-mail with no dot");
  bad(designOrder({ contact: { name: "A", email: "a b@c.com" } }), "contact.email", "an e-mail with a space"); bad(designOrder({ contact: undefined }), "contact.name", "no contact at all");
  bad(designOrder({ contact: { name: "A", email: `${"x".repeat(70)}@b.com` } }), "contact.email", "a local part over 64 characters");
  bad(designOrder({ items: [] }), "items", "no items"); bad(designOrder({ items: undefined }), "items", "items missing");
  bad(designOrder({ items: Array.from({ length: 11 }, () => ({ garment: "tee", label: "Tee", qty: 1 })) }), "items", "11 items");
  bad(designOrder({ items: [{ garment: "tee", label: "Tee", qty: 1 }, { garment: "hoodie", label: "Hoodie", qty: 1 }] }), "items", "a design order with two items");
  ok("a quote may have several items", normalizeOrder(quoteOrder({ items: [{ garment: "tee", label: "Tee", qty: 100 }, { garment: "hoodie", label: "Hoodie", qty: 50 }] })).value.quantity === 150);
  for (const q of [0, -1, 1.5, "5", 100001, null, NaN]) bad(designOrder({ items: [{ garment: "hoodie", label: "H", qty: q }] }), "items[0].qty", `quantity ${JSON.stringify(q)} is refused`);
  bad(designOrder({ items: [{ garment: "hoodie", label: "H", qty: 10, colour: { hex: "red" } }] }), "items[0].colour", "a colour that is not #rrggbb");
  bad(designOrder({ items: [{ garment: "hoodie", label: "H", qty: 10, colour: "#112233" }] }), "items[0].colour", "a colour that is not an object");
  bad(designOrder({ items: ["x"] }), "items[0]", "an item that is not an object");
  ok("ten lines of 100,000 (exactly a million pieces, the database's own ceiling) are accepted", normalizeOrder(quoteOrder({ items: Array.from({ length: 10 }, () => ({ garment: "t", label: "T", qty: 100000 })) })).value?.quantity === 1_000_000);
  ok("a garment that is not a slug becomes 'other'; a missing label falls back to the garment", normalizeOrder(quoteOrder({ items: [{ garment: "x y!", qty: 5 }] })).value.items[0].garment === "other" && normalizeOrder(quoteOrder({ items: [{ garment: "tee", qty: 5 }] })).value.items[0].label === "tee");
  bad(designOrder({ brand: { handle: "not a handle!", logoFrom: "instagram", rightsConfirmed: true } }), "brand.handle", "a handle that cannot be one");
  ok("handles are read from @ names and links", ["@Acme", "acme", "instagram.com/Acme/", "https://www.instagram.com/acme/?hl=en"].every((h) => normalizeOrder(designOrder({ brand: { handle: h, logoFrom: "instagram", rightsConfirmed: true } })).value?.brand.handle === "acme"));
  for (const w of ["http://127.0.0.1", "https://localhost", "https://10.0.0.1/x", "ftp://acme.com", "https://user:pw@acme.com", "https://acme.com:8080", "javascript:alert(1)", "https://[::1]/", "not a url at all"]) {
    bad(designOrder({ brand: { website: w, logoFrom: "website", rightsConfirmed: true } }), "brand.website", `the website ${w} is refused`);
  }
  ok("a website is stored as a clean address", normalizeOrder(designOrder({ brand: { website: "acme.com/shop#top", logoFrom: "website", rightsConfirmed: true } })).value.brand.website === "https://acme.com/shop");
  bad(designOrder({ brand: { logoFrom: "dropbox", rightsConfirmed: true } }), "brand.logoFrom", "a logo source that is not one of the three");
  bad(designOrder({ brand: { logoFrom: "upload", rightsConfirmed: false } }), "brand.rightsConfirmed", "a logo without the rights confirmation");
  bad(designOrder({ brand: { logoFrom: "upload", rightsConfirmed: "yes" } }), "brand.rightsConfirmed", "a rights confirmation that is the string 'yes'");
  ok("a quote with no logo needs no confirmation", normalizeOrder(quoteOrder()).ok === true);
  for (const d of ["2027-13-01", "2027-02-30", "tomorrow", "2019-01-01", "2099-01-01", 20270101]) bad(designOrder({ deadline: d }), "deadline", `the deadline ${JSON.stringify(d)} is refused`);
  ok("an empty deadline is none", normalizeOrder(designOrder({ deadline: "" })).value.deadline === null);
  ok("unknown top-level fields, an unknown design field and extra contact fields are dropped", (() => {
    const v = normalizeOrder(designOrder({ admin: true, status: "Delivered", price: 1, design: { stitches: 10, evil: "<b>", widthMm: -5 }, contact: { name: "A", email: "a@b.com", role: "admin" } })).value;
    return !("admin" in v) && !("status" in v) && same(v.design, { stitches: 10 }) && !("role" in v.contact);
  })());
  ok("a design block with nothing usable becomes none", normalizeOrder(designOrder({ design: { stitches: "lots", widthMm: Infinity } })).value.design === null);
  ok("source.page must be a path", normalizeOrder(designOrder({ source: { page: "javascript:x" } })).value.page === "" && normalizeOrder(designOrder({ source: { page: "/create/" } })).value.page === "/create/");
  // files
  bad(designOrder({ files: Array.from({ length: 5 }, () => ({ kind: "logo", data: b64(png()) })) }), "files", "5 files");
  bad(designOrder({ files: [{ kind: "logo", data: b64(png()) }, { kind: "logo", data: b64(png()) }] }), "files[1].kind", "two files of one kind");
  bad(designOrder({ files: [{ kind: "wallpaper", data: b64(png()) }] }), "files[0].kind", "a kind that does not exist");
  bad(designOrder({ files: [{ kind: "logo" }] }), "files[0].data", "a file with no content");
  bad(designOrder({ files: [{ kind: "logo", data: "!!!not base64!!!" }] }), "files[0].data", "content that is not base64");
  bad(designOrder({ files: [{ kind: "logo", data: "A" }] }), "files[0].data", "base64 of an impossible length");
  bad(designOrder({ files: [{ kind: "logo", data: b64(svgText()) }] }), "files[0].data", "an SVG logo (it can carry scripts: send a picture)");
  bad(designOrder({ files: [{ kind: "logo", data: b64(pdf()) }] }), "files[0].data", "a PDF as the logo");
  bad(designOrder({ files: [{ kind: "logo", data: b64(html("<html><script>alert(1)</script></html>")) }] }), "files[0].data", "HTML called a logo");
  bad(designOrder({ files: [{ kind: "logo", name: "x.png", type: "image/png", data: b64(new Uint8Array(100).fill(65)) }] }), "files[0].data", "bytes that are no picture, whatever the name and type say");
  bad(designOrder({ files: [{ kind: "design", data: b64(png()) }, { kind: "logo", data: b64(png()) }] }), "files[0].data", "a picture called the embroidery file");
  bad(designOrder({ files: [{ kind: "design", data: b64(new Uint8Array(600).fill(0x41)) }, { kind: "logo", data: b64(png()) }] }), "files[0].data", "a .dst that does not start with its header");
  bad(designOrder({ files: [{ kind: "design", data: b64(dst(100)) }, { kind: "logo", data: b64(png()) }] }), "files[0].data", "a .dst shorter than its header");
  bad(designOrder({ files: [{ kind: "preview", data: b64(pdf()) }, { kind: "logo", data: b64(png()) }] }), "files[0].data", "a PDF as the preview");
  ok("a PDF is fine as artwork on a quote, and the name is cleaned", (() => { const r = normalizeOrder(quoteOrder({ files: [{ kind: "artwork", name: "my‮txt.pdf\n", data: b64(pdf()) }] })); return r.ok && r.value.files[0].name === "mytxt.pdf" && r.value.files[0].path.endsWith("/artwork.pdf"); })());
  ok("what is stored is what the bytes are (type and extension), not what the browser said", (() => { const r = normalizeOrder(designOrder({ files: [{ kind: "logo", name: "evil.html", type: "text/html", data: b64(jpeg()) }] })); return r.ok && r.value.files[0].type === "image/jpeg" && r.value.files[0].path.endsWith("/logo.jpg"); })());
  ok("a data: prefix and line breaks in the base64 are tolerated", normalizeOrder(designOrder({ files: [{ kind: "logo", data: `data:image/png;base64,${b64(png()).replace(/(.{60})/g, "$1\n")}` }] })).ok === true);
  bad(designOrder({ files: [{ kind: "preview", data: b64(png()) }] }), "files", "a design order with no logo");
  const huge = normalizeOrder(designOrder({ files: [{ kind: "logo", data: b64(big) }, { kind: "preview", data: b64(big) }] }));
  ok("more than 3 MB of files is 413, not 400", huge.ok === false && huge.status === 413 && huge.body.error === "too_large");
  const bigDst = dst(2_100_000);
  ok("an embroidery file over 2 MB is 413", normalizeOrder(designOrder({ files: [{ kind: "design", data: b64(bigDst) }, { kind: "logo", data: b64(png()) }] })).status === 413);
  // cleaning
  ok("zero-width and right-to-left override characters are removed, control characters become one space, runs of spaces collapse", clean("A\u0007da​ ‮Love⁦lace\r\n\tJr", 50) === "A da Lovelace Jr", JSON.stringify(clean("A\u0007da​ ‮Love⁦lace\r\n\tJr", 50)));
  ok("a message keeps its line breaks and tabs but loses the rest, and is cut at 4000", (() => { const m = clean(`a\nb\tc\u0007d${"x".repeat(5000)}`, 4000, true); return m.startsWith("a\nb\tcd") && m.length === 4000; })());
  ok("clean() of a non-string is empty", clean(5, 10) === "" && clean(null, 10) === "" && clean({}, 10) === "");
  ok("a long name is cut", normalizeOrder(designOrder({ contact: { name: "N".repeat(500), email: "a@b.com" } })).value.contact.name.length === 120);
  ok("sniffFile knows the pictures, the pdf and a dst, and nothing else", sniffFile(png()).ext === "png" && sniffFile(jpeg()).ext === "jpg" && sniffFile(webpX()).ext === "webp" && sniffFile(gif()).ext === "gif" && sniffFile(pdf()).ext === "pdf" && sniffFile(dst()).ext === "dst" && sniffFile(svgText()) === null && sniffFile(ico()) === null && sniffFile(html("<html>")) === null && sniffFile(new Uint8Array(3)) === null);
  ok("sameSecret compares whole strings", sameSecret("abc", "abc") && !sameSecret("abc", "abd") && !sameSecret("abc", "abcd") && !sameSecret("", "x") && !sameSecret(null, "x") && sameSecret("", ""));
}

/* ════════════════════════════════════════════════════════════════ */
group("C. The record handed to the database");
{
  const v = normalizeOrder(designOrder()).value;
  const { args, web } = toDashboard(v, { now: new Date("2026-11-14T10:22:31Z"), ipHash: "abc123", replay: false });
  ok("customer is the company, style the item, colour its name, quantity the total, the deadline the delivery date",
    args.customer_name === "Acme Coffee" && args.style_name === "Hoodie" && args.colorway === "Pine" && args.quantity === 50 && args.delivery_date === "2027-01-20");
  ok("embroidery is the embellishment of a design order", same(args.embellishments, ["Embroidery"]));
  ok("the notes say what it is, the logo, the design, and to check the logo", /^Create by design\. Hoodie \(Pine\) x 50 pcs\./.test(args.notes) && /Logo: from their instagram \(@acmecoffee\)/.test(args.notes) && /5,231 stitches, 3 colours, 90 x 38 mm, Left chest\. Estimated, not sewn yet\./.test(args.notes) && /Check the logo is theirs/.test(args.notes), args.notes);
  ok("the message and the address hash travel; replay is false", args.message === "Left chest, please." && args.ip_hash === "abc123" && args.replay === false);
  ok("the web record has the contact, brand, items, design, deadline and the time", web.v === 1 && web.kind === "design" && web.receivedAt === "2026-11-14T10:22:31.000Z" && web.contact.email === "ama@acmecoffee.com" && web.brand.handle === "acmecoffee" && web.deadline === "2027-01-20" && web.page === "/create/");
  ok("the files are listed with their paths, sizes and types, and carry no bytes", web.files.length === 3 && web.files.every((f) => typeof f.path === "string" && f.bytes > 0 && !("data" in f)) && !JSON.stringify(web).includes("\"data\""));
  ok("the address hash is not in the web record", !JSON.stringify(web).includes("abc123"));
  const q = toDashboard(normalizeOrder(quoteOrder({ service: "DTF printing", items: [{ garment: "tee", label: "Tee", qty: 100 }, { garment: "hoodie", label: "Hoodie", qty: 50, colour: { hex: "#000000", label: "Black" } }] })).value);
  ok("a quote: styles joined, colour 'Black' for the one that has one, DTF embellishment, 'Quote request.'", q.args.style_name === "Tee, Hoodie" && q.args.colorway === "Black" && same(q.args.embellishments, ["DTF"]) && q.args.notes.startsWith("Quote request.") && !/Check the logo/.test(q.args.notes) && q.args.quantity === 150);
  const multi = toDashboard(normalizeOrder(quoteOrder({ items: [{ garment: "tee", label: "Tee", qty: 1, colour: { hex: "#000000", label: "Black" } }, { garment: "tee", label: "Tee", qty: 1, colour: { hex: "#FFFFFF", label: "White" } }] })).value);
  ok("two different colours say 'Various', and the same label twice is said once", multi.args.colorway === "Various" && multi.args.style_name === "Tee");
  ok("an embroidery quote gets the embellishment; a plain one gets none", same(toDashboard(normalizeOrder(quoteOrder({ service: "Embroidery" })).value).args.embellishments, ["Embroidery"]) && same(toDashboard(normalizeOrder(quoteOrder({ service: "Screen Printing" })).value).args.embellishments, []));
  ok("a company-less order is under the contact's name", toDashboard(normalizeOrder(quoteOrder()).value).args.customer_name === "Bo Tamang");
}

/* ════════════════════════════════════════════════════════════════ */
group("D. POST /api/website-orders");
{
  const s = pretendSupabase();
  const order = designOrder();
  const res = await post(baseEnv, order);
  const body = await J(res);
  ok("a good order is stored: 200 with the number and the id", res.status === 200 && body.ok === true && body.ref === "WEB-001" && /^0{8}/.test(body.id) && body.duplicate === false, JSON.stringify(body));
  const order_of_work = s.calls.map((c) => `${c.method} ${c.url.slice(URL_DB.length).split("?")[0]}`);
  ok("the order of work is: look for the key, ask the limits, store the three files, then the order",
    order_of_work[0] === "GET /rest/v1/orders" && order_of_work[1] === "POST /rest/v1/rpc/website_order_limits_ok" && order_of_work.slice(2, 5).every((c) => c.startsWith("POST /storage/v1/object/website-orders/")) && order_of_work[5] === "POST /rest/v1/rpc/ingest_website_order" && order_of_work.length === 6, order_of_work.join(" | "));
  ok("the three files are in the bucket under the key, with the type their bytes have", [...s.files.keys()].sort().join() === [`${order.key}/design.dst`, `${order.key}/logo.png`, `${order.key}/preview.webp`].sort().join()
    && s.files.get(`${order.key}/logo.png`).type === "image/png" && s.files.get(`${order.key}/design.dst`).type === "application/octet-stream" && s.files.get(`${order.key}/preview.webp`).type === "image/webp");
  ok("a stored file is exactly the bytes sent", Buffer.compare(Buffer.from(s.files.get(`${order.key}/logo.png`).bytes), Buffer.from(png())) === 0);
  const up = s.calls.find((c) => c.url.includes("/storage/"));
  ok("the upload says upsert (a retry overwrites)", up.headers["x-upsert"] === "true");
  ok("every call to the database carries the service key (apikey and bearer), and the key is not in the answer", s.calls.every((c) => c.headers.apikey === KEY && c.headers.authorization === `Bearer ${KEY}`) && !JSON.stringify(body).includes(KEY) && ![...res.headers.values()].some((h) => h.includes(KEY)));
  const args = JSON.parse(s.calls.find((c) => c.url.endsWith("/rpc/ingest_website_order")).body).p;
  ok("the order function gets the cleaned fields, the address hash (not the address) and no file bytes", args.key === order.key && args.customer_name === "Acme Coffee" && /^[0-9a-f]{64}$/.test(args.ip_hash) && !JSON.stringify(args).includes("203.0.113.7") && !JSON.stringify(args).includes(b64(png()).slice(0, 40)) && args.web.files.length === 3);
  const args2 = JSON.parse(s.calls.find((c) => c.url.endsWith("/rpc/website_order_limits_ok")).body);
  ok("the limits are asked with the same hash and the e-mail in lower case", args2.p_ip === args.ip_hash && args2.p_email === "ama@acmecoffee.com");
  ok("the address hash is salted and stable (the same address gives the same hash; WEBSITE_ORDERS_SALT changes it)", await (async () => {
    const a = await post(baseEnv, quoteOrder(), { headers: { "CF-Connecting-IP": "198.51.100.9" } }); await J(a);
    const h1 = JSON.parse(s.calls.filter((c) => c.url.endsWith("/rpc/ingest_website_order")).at(-1).body).p.ip_hash;
    await post(baseEnv, quoteOrder(), { headers: { "CF-Connecting-IP": "198.51.100.9" } });
    const h2 = JSON.parse(s.calls.filter((c) => c.url.endsWith("/rpc/ingest_website_order")).at(-1).body).p.ip_hash;
    await post({ ...baseEnv, WEBSITE_ORDERS_SALT: "pepper" }, quoteOrder(), { headers: { "CF-Connecting-IP": "198.51.100.9" } });
    const h3 = JSON.parse(s.calls.filter((c) => c.url.endsWith("/rpc/ingest_website_order")).at(-1).body).p.ip_hash;
    return h1 === h2 && h1 !== h3 && h1 !== args.ip_hash;
  })());

  // a resend
  const before = s.calls.length, stored = s.orders.length, files = s.files.size;
  const again = await post(baseEnv, order);
  const againBody = await J(again);
  ok("the same key again: 200, duplicate, the same number, and NOTHING more is written (no limits check, no files, no order)", again.status === 200 && againBody.duplicate === true && againBody.ref === "WEB-001" && s.calls.length === before + 1 && s.orders.length === stored && s.files.size === files, JSON.stringify(againBody));
  ok("a resend with different content still just answers with the first order", (await J(await post(baseEnv, { ...order, contact: { name: "Someone Else", email: "else@x.com" } }))).ref === "WEB-001");

  // a quote has no files
  const s2 = pretendSupabase();
  const q = await post(baseEnv, quoteOrder());
  ok("a quote is stored with no storage calls", q.status === 200 && s2.files.size === 0 && !s2.calls.some((c) => c.url.includes("/storage/")));

  // refusals
  const s3 = pretendSupabase();
  const r400 = await post(baseEnv, designOrder({ contact: { name: "A", email: "nope" } }));
  const b400 = await J(r400);
  ok("an invalid order is 400 with the field and a message, and nothing was called", r400.status === 400 && b400.error === "invalid" && b400.field === "contact.email" && typeof b400.message === "string" && s3.calls.length === 0);
  const rj = await post(baseEnv, null, { raw: "{nope" });
  ok("a body that is not JSON is 400", rj.status === 400 && (await J(rj)).error === "invalid" && s3.calls.length === 0);
  const rbig = await post(baseEnv, null, { raw: JSON.stringify({ pad: "x".repeat(4_800_000) }) });
  ok("a body over 4.5 MB is 413 (checked on the text even with no length header)", rbig.status === 413 && s3.calls.length === 0);
  const rlen = await post(baseEnv, designOrder(), { headers: { "content-length": "9999999" } });
  ok("a declared length over the limit is 413 before the body is read", rlen.status === 413 && s3.calls.length === 0);
  let pulled = 0;
  const endless = new ReadableStream({ pull(c) { pulled += 1; c.enqueue(new Uint8Array(100_000).fill(120)); if (pulled > 400) c.close(); } });
  const rstream = await handleWebsiteOrders(new Request("https://kazimfg.com.np/api/website-orders", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: endless, duplex: "half" }), baseEnv);
  ok("a body that never says how long it is is cut off at 4.5 MB: 413, and the rest is never read", rstream.status === 413 && pulled < 100, `pulled ${pulled} chunks`);
  const rtext = await post(baseEnv, null, { raw: JSON.stringify(designOrder()), headers: { "Content-Type": "text/plain" } });
  ok("a post that is not application/json (the kind a web page can send across sites without asking) is 415 and stores nothing", rtext.status === 415 && s3.calls.length === 0);
  const rform = await post(baseEnv, null, { raw: "a=1", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  ok("...a form post too", rform.status === 415);
  const rnone = await handleWebsiteOrders(new Request("https://kazimfg.com.np/api/website-orders", { method: "POST", headers: { Origin: ORIGIN }, body: JSON.stringify(designOrder()) }), baseEnv);
  ok("...and a post with no content type at all (a string body is sent as text/plain)", rnone.status === 415);
  const rhp = await post(baseEnv, designOrder({ hp: "bot" }));
  ok("a filled honeypot is 400 and stores nothing", rhp.status === 400 && s3.calls.length === 0);
  const rhuge = await post(baseEnv, designOrder({ files: [{ kind: "logo", data: b64(big) }, { kind: "preview", data: b64(big) }] }));
  ok("too many file bytes is 413 and stores nothing", rhuge.status === 413 && s3.calls.length === 0);

  // limits
  const s4 = pretendSupabase({ limitsOk: false });
  const r429 = await post(baseEnv, designOrder());
  ok("when the database says the limit is reached: 429 with Retry-After, and no file was stored", r429.status === 429 && (await J(r429)).error === "rate_limited" && r429.headers.get("retry-after") === "600" && s4.files.size === 0 && !s4.calls.some((c) => c.url.endsWith("/rpc/ingest_website_order")));
  const rDup = await post(baseEnv, (() => { s4.orders.push({ id: "00000000-0000-4000-8000-0000000000aa", order_no: "WEB-009", web_ref: "11111111-1111-4111-8111-111111111111" }); return designOrder({ key: "11111111-1111-4111-8111-111111111111" }); })());
  ok("a resend is answered even when the limit is reached (it is looked up before the limits)", rDup.status === 200 && (await J(rDup)).duplicate === true);
  const s5 = pretendSupabase({ limitsOk: true, rpcStatus: 429, rpcBody: { code: "PT429", message: "rate_limited" } });
  const rRace = await post(baseEnv, quoteOrder());
  ok("when the order function itself says 429 (a race the first check could not see), the answer is 429", rRace.status === 429 && (await J(rRace)).error === "rate_limited" && rRace.headers.get("retry-after") === "600");
  // replay
  const s6 = pretendSupabase({ limitsOk: false });
  const rNo = await post({ ...baseEnv, WEBSITE_ORDERS_REPLAY_SECRET: "s3cret" }, quoteOrder(), { headers: { "x-replay-secret": "wrong" } });
  ok("a wrong replay secret gets no bypass", rNo.status === 429);
  const mark = s6.calls.length;
  const rYes = await post({ ...baseEnv, WEBSITE_ORDERS_REPLAY_SECRET: "s3cret" }, quoteOrder(), { headers: { "x-replay-secret": "s3cret" } });
  const afterMark = s6.calls.slice(mark);
  ok("the right replay secret skips the limits check and tells the database to replay", rYes.status === 200 && JSON.parse(afterMark.find((c) => c.url.endsWith("/rpc/ingest_website_order")).body).p.replay === true && !afterMark.some((c) => c.url.endsWith("/website_order_limits_ok")));
  const rNoCfg = await post(baseEnv, quoteOrder(), { headers: { "x-replay-secret": "anything" } });
  ok("with no secret configured, a replay header does nothing", rNoCfg.status === 429);

  // failures of the back end
  const s7 = pretendSupabase({ storageStatus: 500 });
  const rS = await post(baseEnv, designOrder());
  ok("a file that cannot be stored is 503 (try again) and the order is NOT written", rS.status === 503 && (await J(rS)).error === "unavailable" && rS.headers.get("retry-after") === "30" && !s7.calls.some((c) => c.url.endsWith("/rpc/ingest_website_order")) && /storing a file failed/.test(takeLogs()));
  const s8 = pretendSupabase({ rpcStatus: 404, rpcBody: { code: "PGRST202", message: "Could not find the function" } });
  const rM = await post(baseEnv, quoteOrder());
  ok("a missing order function is 503, and the log says to apply migration 0071", rM.status === 503 && /apply migration 0071/.test(takeLogs()));
  pretendSupabase({ rpcStatus: 500, rpcBody: { message: "boom" } });
  ok("a database error is 503", (await post(baseEnv, quoteOrder())).status === 503);
  takeLogs();
  pretendSupabase({ rpcStatus: 401, rpcBody: { message: "Invalid API key" } });
  ok("a key the database does not accept is 503 (and logged)", (await post(baseEnv, quoteOrder())).status === 503 && /401/.test(takeLogs()));
  pretendSupabase({ rpcStatus: 400, rpcBody: { code: "PT400", message: "invalid: quantity" } });
  const rP = await post(baseEnv, quoteOrder());
  ok("an order the database refuses as invalid is 400, not retried, and logged", rP.status === 400 && (await J(rP)).error === "invalid" && /refused an order the Worker accepted/.test(takeLogs()));
  pretendSupabase({ throwOn: "/rpc/ingest_website_order" });
  ok("the database being unreachable is 503", (await post(baseEnv, quoteOrder())).status === 503);
  takeLogs();
  pretendSupabase({ throwOn: "/storage/" });
  ok("the bucket being unreachable is 503", (await post(baseEnv, designOrder())).status === 503);
  takeLogs();
  const s9 = pretendSupabase({ throwOn: "/rest/v1/orders" });
  const rL = await post(baseEnv, quoteOrder());
  ok("if only the 'is it stored already' lookup fails, the order is still tried (and stored)", rL.status === 200 && s9.orders.length === 1);
  takeLogs();
  const s10 = pretendSupabase({ throwOn: "website_order_limits_ok" });
  ok("if only the early limits check fails, the order is still tried (the function asks again)", (await post(baseEnv, quoteOrder())).status === 200 && s10.orders.length === 1);
  takeLogs();
  pretendSupabase();
  ok("with no database key set it says so (503) and logs it", (await post({ SUPABASE_URL: URL_DB }, quoteOrder())).status === 503 && /not set on this Worker/.test(takeLogs()));
  const s11 = pretendSupabase();
  await post({ SUPABASE_URL: URL_DB, SUPABASE_SERVICE_KEY: "sb_secret_abcdef" }, quoteOrder());
  ok("a new-style sb_secret key goes on apikey alone (no bearer), as the other Worker code does", s11.calls.every((c) => c.headers.apikey === "sb_secret_abcdef" && !c.headers.authorization));
  const s12 = pretendSupabase();
  const keyA = uuid();
  const [a1, a2] = await Promise.all([post(baseEnv, quoteOrder({ key: keyA })), post(baseEnv, quoteOrder({ key: keyA }))]);
  ok("two requests with one key sent together both answer 200 (the database's lock makes the second a duplicate; here the pretend database is sequential, so one order exists)", a1.status === 200 && a2.status === 200 && s12.orders.filter((o) => o.web_ref === keyA).length === 1);
}

/* ════════════════════════════════════════════════════════════════ */
group("E. Health");
{
  pretendSupabase();
  const h = await get(baseEnv, "/api/website-orders/health");
  ok("everything fine: 200 and ok, db and storage true", h.status === 200 && same(await J(h), { ok: true, v: 1, db: true, storage: true }));
  pretendSupabase({ nullStatus: 404 });
  const h2 = await get(baseEnv, "/api/website-orders/health");
  const b2 = await J(h2);
  ok("the order function missing: 503, db false (the check calls it with null: a refusal by the function itself is what proves it)", h2.status === 503 && b2.ok === false && b2.db === false && b2.storage === true);
  pretendSupabase({ bucketStatus: 404 });
  const b3 = await J(await get(baseEnv, "/api/website-orders/health"));
  ok("the bucket missing: storage false", b3.ok === false && b3.db === true && b3.storage === false);
  pretendSupabase({ throwOn: "supabase.co" });
  const h4 = await get(baseEnv, "/api/website-orders/health");
  ok("the database unreachable: 503, both false, no crash", h4.status === 503 && same(await J(h4), { ok: false, v: 1, db: false, storage: false }));
  const h5 = await get({}, "/api/website-orders/health");
  ok("no configuration at all: 503, both false", h5.status === 503 && (await J(h5)).db === false);
  const h6 = await get(baseEnv, "/api/website-orders/health", { origin: "https://evil.example" });
  ok("another origin is refused here too", h6.status === 403);
}

/* ════════════════════════════════════════════════════════════════ */
group("F. The logo finder");
{
  ok("handles: @, links, case, query strings", ["@Acme", "acme", "ACME", "instagram.com/acme", "https://www.instagram.com/acme/", "http://instagram.com/acme/?hl=en&x=1", "m.instagram.com/acme#top", "  @acme  "].every((x) => parseHandle(x) === "acme"));
  ok("handles: dots and underscores are fine, others are not", parseHandle("a.b_c9") === "a.b_c9" && ["", " ", "a b", "acme!", "a".repeat(31), ".acme", "acme.", "a..b", "@@acme", "https://example.com/acme", "p", "reel", null, undefined, "javascript:alert(1)", "../etc/passwd", "acme/evil"].every((x) => parseHandle(x) === null));
  ok("instagram.com/p/... is not a person", parseHandle("instagram.com/p/Cabc123/") === null && parseHandle("https://www.instagram.com/explore/") === null);
  ok("sites: addresses we may fetch", parseSite("acme.com") && parseSite("https://acme.com/shop?x=1#y").toString() === "https://acme.com/shop?x=1" && parseSite("http://www.acme.co.uk"));
  ok("sites: addresses we may not", ["http://127.0.0.1", "http://localhost", "https://10.1.2.3", "https://192.168.0.1/x", "http://169.254.169.254/latest/meta-data", "https://[::1]/", "https://0x7f.1", "https://2130706433", "file:///etc/passwd", "ftp://acme.com", "https://acme.com:8443", "https://u:p@acme.com", "https://intranet", "https://printer.local", "https://db.internal", "https://acme.test", "", "x".repeat(400)].every((x) => parseSite(x) === null));

  // pictures
  ok("sniffImage: png, jpeg, webp, gif, ico, svg (plain, with an xml prolog, with a doctype and comments, with a BOM)", sniffImage(png()) === "image/png" && sniffImage(jpeg()) === "image/jpeg" && sniffImage(webpX()) === "image/webp" && sniffImage(gif()) === "image/gif" && sniffImage(ico()) === "image/x-icon" && sniffImage(svgText()) === "image/svg+xml"
    && sniffImage(svgText("<?xml version=\"1.0\"?>\n<!-- made by x -->\n<!DOCTYPE svg PUBLIC \"a\" \"b\">\n<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>")) === "image/svg+xml" && sniffImage(svgText("﻿  <svg viewBox='0 0 1 1'/>")) === "image/svg+xml");
  ok("sniffImage: html, json, text and empty are not pictures; <svgfoo is not an svg", [html("<!doctype html><html><body><svg></svg></body></html>"), html("{\"a\":1}"), html("hello world"), new Uint8Array(0), html("<svgfoo>")].every((b) => sniffImage(b) === null));
  ok("imageSize reads png, gif, webp (VP8X), jpeg (after other segments) and ico; svg has none", same(imageSize(png(300, 120), "image/png"), { w: 300, h: 120 }) && same(imageSize(gif(64, 48), "image/gif"), { w: 64, h: 48 }) && same(imageSize(webpX(640, 480), "image/webp"), { w: 640, h: 480 }) && same(imageSize(jpeg(800, 600), "image/jpeg"), { w: 800, h: 600 }) && same(imageSize(ico(16, 16), "image/x-icon"), { w: 16, h: 16 }) && imageSize(svgText(), "image/svg+xml") === null && imageSize(new Uint8Array(10), "image/png") === null);

  // a page's candidates
  const page = `<!doctype html><html><head>
    <title>Acme</title>
    <link rel="icon" href="/favicon-32.png" sizes="32x32">
    <link rel="icon" type="image/svg+xml" href="/icon.svg">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-180.png">
    <meta property="og:image" content="https://cdn.acme.com/og-banner.jpg">
    <meta name="twitter:image" content="/twitter.png">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Acme","logo":{"@type":"ImageObject","url":"https://cdn.acme.com/brand/logo-full.png"}},{"@type":"WebSite","name":"x"}]}</script>
    </head><body>
    <header class="site"><a class="brand" href="/"><img src="/img/acme-logo.svg" alt="Acme logo" width="120"></a></header>
    <main><img src="/img/product.jpg" alt="a hoodie"><img src="/img/payment-visa-logo.png" alt="Visa"><img src="data:image/gif;base64,R0lGOD" alt="logo">
    <img src="javascript:alert(1)" class="logo"><div class="footer-logo"><img src="/img/footer.png"></div></main></body></html>`;
  const cands = extractCandidates(page, "https://acme.com/");
  const urls = cands.map((c) => c.url);
  ok("the schema.org logo comes first, then the header logo, the apple-touch-icon, the svg icon, the share pictures, the favicons", urls[0] === "https://cdn.acme.com/brand/logo-full.png" && urls[1] === "https://acme.com/img/acme-logo.svg" && urls[2] === "https://acme.com/apple-180.png" && urls.indexOf("https://acme.com/icon.svg") === 3, urls.join("\n"));
  ok("a banner-like share picture ranks below a plain one; the guessed favicon is last", urls.indexOf("https://acme.com/twitter.png") < urls.indexOf("https://cdn.acme.com/og-banner.jpg") && urls.at(-1) === "https://acme.com/favicon.ico");
  ok("relative addresses are resolved against the page", urls.includes("https://acme.com/favicon-32.png") && urls.includes("https://acme.com/img/acme-logo.svg"));
  ok("a product photo, a payment logo, a data: picture and a javascript: address are not candidates", !urls.some((u) => /product|visa|javascript|^data:/.test(u)));
  ok("a logo in a div classed 'logo' counts, and is ranked as a page logo", cands.some((c) => c.url === "https://acme.com/img/footer.png" && c.kind === "page logo"));
  ok("schema.org logos are read as a string too, and from a list", same(ldLogos("<script type=\"application/ld+json\">{\"logo\":\"https://a.com/l.png\"}</script>", "<script type=\"application/ld+json\">{\"logo\":\"https://a.com/l.png\"}</script>"), ["https://a.com/l.png"]) && ldLogos("x", "x").length === 0);
  ok("broken schema.org data is skipped, not fatal", (() => { const t = "<script type=\"application/ld+json\">{ nope </script><link rel=\"icon\" href=\"/a.png\">"; return extractCandidates(t, "https://a.com/").some((c) => c.url === "https://a.com/a.png"); })());
  const t0 = Date.now();
  const hostile = `<img ${"a=\"".repeat(100000)}` + "<link ".repeat(100000) + "<meta ".repeat(100000) + "<script type=\"application/ld+json\">" + "[".repeat(100000);
  extractCandidates(hostile, "https://a.com/");
  extractCandidates("<img src=x ".repeat(50000), "https://a.com/");
  ok("a hostile page (100,000 unclosed tags, deep nesting) is read in well under a second", Date.now() - t0 < 1500, `${Date.now() - t0} ms`);
}

/* ── pretend websites for the finder ───────────────────────────── */

function pretendWeb(map, state = {}) {
  state.hits = [];
  return async (url, init = {}) => {
    state.hits.push(url);
    const hit = map[url] ?? map[url.replace(/\/$/, "")];
    if (!hit) return new Response("not found", { status: 404 });
    if (typeof hit === "function") return hit(url, init);
    const { status = 200, type = "text/html", body = "", location, headers = {} } = hit;
    if (location) return new Response(null, { status: status === 200 ? 302 : status, headers: { location, ...headers } });
    return new Response(body, { status, headers: { "content-type": type, ...headers } });
  };
}
const page1 = (img = "/logo.png") => html(`<html><head><link rel="icon" href="/favicon.ico"></head><body><header><a href="/"><img class="logo" src="${img}" alt="Acme"></a></header></body></html>`);

{
  group("F2. The finder reading a website");
  const st = {};
  let r = await findLogo({ site: "acme-coffee.com" }, {}, { fetchImpl: pretendWeb({
    "https://acme-coffee.com/robots.txt": { type: "text/plain", body: "User-agent: *\nDisallow: /private\n" },
    "https://acme-coffee.com/": { body: page1() },
    "https://acme-coffee.com/logo.png": { type: "image/png", body: png(400, 160) },
  }, st) });
  ok("a site: robots.txt first, then the home page, then the picture; the picture comes back with its type and size", r.ok && r.source === "website" && r.type === "image/png" && same(r.size, { w: 400, h: 160 }) && r.from === "acme-coffee.com" && r.via === "header logo" && st.hits[0] === "https://acme-coffee.com/robots.txt" && st.hits[1] === "https://acme-coffee.com/", st.hits.join(" | "));

  const st2 = {};
  r = await findLogo({ site: "acme-coffee.com" }, {}, { fetchImpl: pretendWeb({ "https://acme-coffee.com/robots.txt": { type: "text/plain", body: "User-agent: *\nDisallow: /\n" }, "https://acme-coffee.com/": { body: page1() } }, st2) });
  ok("a site whose robots.txt keeps robots out is left alone: no page, no picture", r.ok === false && r.robots === true && st2.hits.length === 1);

  const st3 = {};
  r = await findLogo({ site: "acme-coffee.com" }, {}, { fetchImpl: pretendWeb({ "https://acme-coffee.com/robots.txt": { status: 500 }, "https://acme-coffee.com/": { body: page1() } }, st3) });
  ok("a robots.txt that cannot be read (500) also means keep out", r.ok === false && !st3.hits.includes("https://acme-coffee.com/"));

  r = await findLogo({ site: "acme-coffee.com" }, {}, { fetchImpl: pretendWeb({ "https://acme-coffee.com/robots.txt": { status: 404 }, "https://acme-coffee.com/": { body: page1() }, "https://acme-coffee.com/logo.png": { type: "image/png", body: png(400, 160) } }) });
  ok("a missing robots.txt (404) does not stop it", r.ok === true);

  const st4 = {};
  r = await findLogo({ site: "acme-coffee.com" }, {}, { fetchImpl: pretendWeb({ "https://acme-coffee.com/robots.txt": { status: 404 }, "https://acme-coffee.com/": { location: "https://other-company.com/" }, "https://other-company.com/robots.txt": { status: 404 }, "https://other-company.com/": { body: page1() } }, st4) });
  ok("a redirect to another site is refused, and that site is not even asked for its robots.txt", r.ok === false && r.offSite === "other-company.com" && !st4.hits.some((u) => u.includes("other-company.com/robots")), st4.hits.join(" | "));

  r = await findLogo({ site: "acme-coffee.com" }, {}, { fetchImpl: pretendWeb({ "https://acme-coffee.com/robots.txt": { status: 404 }, "https://acme-coffee.com/": { location: "https://www.acme-coffee.com/" }, "https://www.acme-coffee.com/robots.txt": { status: 404 }, "https://www.acme-coffee.com/": { body: page1("/l.png") }, "https://www.acme-coffee.com/l.png": { type: "image/png", body: png(400, 160) } }) });
  ok("a redirect to the same site's www is followed", r.ok === true);

  group("F3. What is accepted as the picture");
  const site = (extra, pageHtml = page1()) => findLogo({ site: "acme-coffee.com" }, {}, { fetchImpl: pretendWeb({ "https://acme-coffee.com/robots.txt": { status: 404 }, "https://acme-coffee.com/": { body: pageHtml }, ...extra }) });
  r = await site({ "https://acme-coffee.com/logo.png": { type: "text/html", body: html("<html>not a picture</html>") }, "https://acme-coffee.com/favicon.ico": { type: "image/x-icon", body: ico(64, 64) } });
  ok("an answer that says it is a picture but is HTML is skipped, the next candidate is used", r.ok && r.type === "image/x-icon" && r.via === "icon", JSON.stringify({ ok: r.ok, type: r.type, via: r.via }));
  r = await site({ "https://acme-coffee.com/logo.png": { type: "image/png", body: png(32, 32) }, "https://acme-coffee.com/favicon.ico": { type: "image/x-icon", body: ico(16, 16) } });
  ok("a picture under 48 px is used only if nothing better turns up", r.ok && same(r.size, { w: 32, h: 32 }));
  r = await site({ "https://acme-coffee.com/logo.png": { type: "image/png", body: png(32, 32) }, "https://acme-coffee.com/favicon.ico": { type: "image/png", body: png(512, 512) } });
  ok("...and a good one further down the list beats it", r.ok && same(r.size, { w: 512, h: 512 }));
  r = await site({ "https://acme-coffee.com/logo.png": { type: "image/svg+xml", body: svgText() } });
  ok("an SVG is accepted (size unknown) and returned as svg", r.ok && r.type === "image/svg+xml" && r.size === null);
  r = await site({ "https://acme-coffee.com/logo.png": { type: "image/png", headers: { "content-length": "9000000" }, body: png() } });
  ok("a picture that declares itself over 4 MB is not read at all", r.ok === false || r.via !== "header logo");
  const huge = new Uint8Array(4_100_000); huge.set(png(400, 160));
  r = await site({ "https://acme-coffee.com/logo.png": { type: "image/png", body: huge } });
  ok("a picture that turns out over 4 MB while reading is dropped", r.ok === false || r.via !== "header logo");
  const bigSvg = svgText(`<svg xmlns="http://www.w3.org/2000/svg">${"<!--x-->".repeat(150000)}</svg>`);
  r = await site({ "https://acme-coffee.com/logo.png": { type: "image/svg+xml", body: bigSvg } });
  ok("an SVG over 1 MB is dropped", r.ok === false || r.type !== "image/svg+xml");
  r = await site({ "https://acme-coffee.com/logo.png": { status: 403 }, "https://acme-coffee.com/favicon.ico": { status: 404 } });
  ok("when every picture refuses, the answer is 'not found', not an error", r.ok === false && same(r.tried, ["website"]));
  r = await site({}, html("<html><body>nothing here</body></html>"));
  ok("a page with no logo at all falls back to the two usual places, and says not found if they are empty", r.ok === false);
  r = await site({ "https://acme-coffee.com/apple-touch-icon.png": { type: "image/png", body: png(180, 180) } }, html("<html><body>nothing</body></html>"));
  ok("...or finds the apple-touch-icon there", r.ok && same(r.size, { w: 180, h: 180 }) && /guessed/.test(r.via));
  const st5 = {};
  r = await findLogo({ site: "acme-coffee.com" }, {}, { fetchImpl: pretendWeb({ "https://acme-coffee.com/robots.txt": { status: 404 }, "https://acme-coffee.com/": { body: html(`<html><body>${Array.from({ length: 12 }, (_, i) => `<img class="logo" src="/l${i}.png">`).join("")}</body></html>`) } }, st5) });
  ok("at most 5 pictures are tried", st5.hits.filter((u) => /\/l\d+\.png$/.test(u)).length <= 5, String(st5.hits.length));
  const st6 = {};
  r = await findLogo({ site: "acme-coffee.com" }, {}, { fetchImpl: pretendWeb({ "https://acme-coffee.com/robots.txt": { status: 404 }, "https://acme-coffee.com/": { body: page1("https://img.acme-cdn.com/logo.png") }, "https://img.acme-cdn.com/logo.png": { type: "image/png", body: png(300, 100) } }, st6) });
  ok("a picture on the site's CDN (another host) is fine, and robots.txt is not asked of it", r.ok && r.from === "img.acme-cdn.com" && !st6.hits.some((u) => u.includes("acme-cdn.com/robots")));

  group("F4. The manners (private addresses, redirects)");
  const st7 = {};
  r = await findLogo({ site: "acme-coffee.com" }, {}, { fetchImpl: pretendWeb({
    "https://acme-coffee.com/robots.txt": { status: 404 },
    "https://acme-coffee.com/": { body: html("<html><body><img class=\"logo\" src=\"http://169.254.169.254/latest/meta-data/\"><img class=\"logo\" src=\"http://127.0.0.1:8080/x.png\"><img class=\"logo\" src=\"https://10.0.0.5/x.png\"><img class=\"logo\" src=\"http://localhost/x.png\"><img class=\"logo\" src=\"https://internal-host/x.png\"><img class=\"logo\" src=\"https://acme-coffee.com:9999/x.png\"><img class=\"logo\" src=\"ftp://acme-coffee.com/x.png\"></body></html>") },
  }, st7) });
  ok("a page that points at private or odd addresses never gets them fetched", !st7.hits.some((u) => /169\.254|127\.0\.0\.1|10\.0\.0\.5|localhost|internal-host|:9999|^ftp:/.test(u)), st7.hits.join(" | "));
  const st8 = {};
  r = await findLogo({ site: "acme-coffee.com" }, {}, { fetchImpl: pretendWeb({
    "https://acme-coffee.com/robots.txt": { status: 404 }, "https://acme-coffee.com/": { body: page1("https://img.acme-cdn.com/go") },
    "https://img.acme-cdn.com/go": { location: "http://169.254.169.254/latest/meta-data/iam/" },
    "https://acme-coffee.com/favicon.ico": { status: 404 },
  }, st8) });
  ok("a picture address that redirects to a private address is not followed", r.ok === false && !st8.hits.some((u) => u.includes("169.254")), st8.hits.join(" | "));
  const st9 = {};
  const loop = {};
  for (let i = 0; i < 8; i += 1) loop[`https://img.acme-cdn.com/r${i}`] = { location: `https://img.acme-cdn.com/r${i + 1}` };
  loop["https://img.acme-cdn.com/r8"] = { type: "image/png", body: png(300, 100) };
  r = await findLogo({ site: "acme-coffee.com" }, {}, { fetchImpl: pretendWeb({ "https://acme-coffee.com/robots.txt": { status: 404 }, "https://acme-coffee.com/": { body: page1("https://img.acme-cdn.com/r0") }, ...loop }, st9) });
  ok("a chain of more than 3 redirects is given up on", r.ok === false && st9.hits.filter((u) => u.includes("img.acme-cdn.com/r")).length <= 4, st9.hits.join(" | "));
  const gi = await getImage("https://img.acme-cdn.com/x", async () => { throw new TypeError("boom"); });
  ok("getImage never throws, whatever the network does", gi.bytes === null && gi.status === null);
  for (const closed of ["https://www.instagram.com/acme/", "https://facebook.com/acme", "https://www.google.com/search?q=acme", "https://www.ebay.co.uk/str/acme"]) {
    const stc = {};
    const rc = await findLogo({ site: closed }, {}, { fetchImpl: pretendWeb({}, stc) });
    ok(`${closed} is refused with the contact finder's words and not fetched`, rc.ok === false && typeof rc.closed === "string" && rc.closed.length > 20 && stc.hits.length === 0);
  }
  const ua = [];
  await findLogo({ site: "acme-coffee.com" }, {}, { fetchImpl: async (u, init) => { ua.push(init.headers["User-Agent"]); return new Response("", { status: 404 }); } });
  ok("every request says who is asking and never pretends to be a browser or another company's crawler", ua.length > 0 && ua.every((x) => /^KaziLogoFinder\/1\.0 \(\+https:\/\/kazimanufacturing\.com/.test(x)) && !ua.some((x) => /Mozilla|facebookexternalhit|Googlebot|Twitterbot/.test(x)));
}

{
  group("F5. The finder reading an Instagram name (the public profile page, once; no key, no API, no go-between)");
  // the picture address is shaped like the real one seen on 2026-11-14: Instagram's picture network, 150 x 150, signed, over 600 characters
  const IG_PIC = `https://scontent.cdninstagram.com/v/t51.82787-19/844826681_18142962694565345_3449461397746161604_n.jpg?stp=dst-jpg_s150x150_tt6&_nc_cat=105&ccb=7-5&_nc_sid=7d3ac5&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ohc=Mq7xKcQe8zUQ7kNvwEaabcd&_nc_oc=Adn1234567890abcdefghijklmnopqrstuvwxyz${"AbCdEfGhIjKlMnOpQrStUvWxYz".repeat(4)}&_nc_zt=24&_nc_ht=scontent.cdninstagram.com&_nc_gid=AaBbCcDdEeFfGgHhIiJjKk&_nc_ss=7a30f&oh=00_AfXyz1234567890${"AbCdEfGhIjKlMnOpQrStUvWxYz".repeat(3)}&oe=6A1B2C3D`;
  const PIC = new URL(IG_PIC).href;
  const PAGE = (handle) => `https://www.instagram.com/${handle}/`;
  const igTags = (handle, { pic = IG_PIC, url = PAGE(handle) } = {}) => `<meta property="og:image" content="${pic.replace(/&/g, "&amp;")}" /><meta property="og:title" content="Acme (@${handle}) • Instagram photos and videos" /><meta property="og:url" content="${url}" />`;
  const igPage = (handle, { tags = true, before = "", ...over } = {}) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">${before}<title>${handle}</title>${tags ? igTags(handle, over) : ""}</head><body>profile</body></html>`;
  const clock = { t: Date.parse("2026-11-14T12:00:00Z") };
  const now = () => clock.t;
  const fresh = () => { resetInstagram(); clock.t = Date.parse("2026-11-14T12:00:00Z"); takeLogs(); };
  const find = (input, map, st = {}, env = {}) => findLogo(input, env, { fetchImpl: pretendWeb(map, st), now });
  const profile = (handle, over) => ({ [PAGE(handle)]: { body: igPage(handle, over) }, [PIC]: { type: "image/jpeg", body: jpeg(150, 150) } });
  const nobody = (handle) => ({ [PAGE(handle)]: { body: igPage(handle, { tags: false }) } });
  const throws = (fn) => { try { fn(); return false; } catch { return true; } };

  // what it asks, and how
  fresh();
  const seen = [];
  const st1 = {};
  let r = await findLogo({ handle: "@Acme" }, {}, { now, fetchImpl: pretendWeb({
    [PAGE("acme")]: (u, init) => { seen.push(init); return new Response(igPage("acme"), { status: 200, headers: { "content-type": "text/html" } }); },
    [PIC]: (u, init) => { seen.push(init); return new Response(jpeg(150, 150), { status: 200, headers: { "content-type": "image/jpeg" } }); },
  }, st1) });
  ok("a name: the profile page, then the picture it names, from Instagram's own picture network, labelled as Instagram's", r.ok && r.source === "instagram" && r.from === "scontent.cdninstagram.com" && r.type === "image/jpeg" && same(r.size, { w: 150, h: 150 }) && r.via === "instagram profile picture" && same(st1.hits, [PAGE("acme"), PIC]), st1.hits.join(" | "));
  ok("the picture's address is a long signed one (over 500 characters) and is followed whole", IG_PIC.length > 500 && st1.hits[1] === PIC);
  ok("nothing else is asked: no robots.txt (the decided exception), no other page, no API, no go-between", st1.hits.every((u) => u === PAGE("acme") || u === PIC) && !st1.hits.some((u) => /robots|graph\.|unavatar|\/api\//.test(u)));
  ok("it says who is asking and nothing more: no cookie, no login, no key, no referer, nothing pretended", seen.length === 2 && seen.every((i) => /^KaziLogoFinder\/1\.0 \(\+https:\/\/kazimanufacturing\.com/.test(i.headers["User-Agent"]) && Object.keys(i.headers).every((k) => ["user-agent", "accept"].includes(k.toLowerCase())) && i.method === "GET" && i.redirect === "manual") && !seen.some((i) => /Mozilla|facebookexternalhit|Googlebot|Instagram/.test(i.headers["User-Agent"])), JSON.stringify(seen.map((i) => i.headers)));

  // the cache
  const st2 = {};
  r = await find({ handle: "ACME" }, {}, st2);
  ok("the same name again (any case) is answered from the day's cache: nobody is asked", r.ok && r.source === "instagram" && same(r.size, { w: 150, h: 150 }) && st2.hits.length === 0);
  clock.t += 23 * 3_600_000;
  const st2b = {};
  r = await find({ handle: "acme" }, {}, st2b);
  ok("...still 23 hours later", r.ok && st2b.hits.length === 0);
  clock.t += 2 * 3_600_000;
  const st3 = {};
  r = await find({ handle: "acme" }, profile("acme"), st3);
  ok("...and asked again after 25 hours", r.ok && st3.hits.length === 2);
  fresh();
  const bigPic = () => { const b = new Uint8Array(150_000); b.set(jpeg(150, 150)); return b; };
  await find({ handle: "bigpic" }, { [PAGE("bigpic")]: { body: igPage("bigpic") }, [PIC]: { type: "image/jpeg", body: bigPic() } });
  const stBig = {};
  r = await find({ handle: "bigpic" }, { [PAGE("bigpic")]: { body: igPage("bigpic") }, [PIC]: { type: "image/jpeg", body: bigPic() } }, stBig);
  ok("a picture over 100 KB is returned but not kept: the next lookup asks again", r.ok && stBig.hits.length === 2);
  fresh();
  for (let i = 0; i < 101; i += 1) { clock.t += 15_000; await find({ handle: `shop${i}` }, profile(`shop${i}`)); }
  const stOld = {}, stNew = {};
  await find({ handle: "shop0" }, profile("shop0"), stOld);
  await find({ handle: "shop100" }, profile("shop100"), stNew);
  ok("the cache holds at most 100 names: the oldest is asked for again, the newest is not", stOld.hits.length === 2 && stNew.hits.length === 0, `${stOld.hits.length} / ${stNew.hits.length}`);

  // a page that is not that profile's: nothing is taken from it
  const shapes = [
    ["another account's page (its og:url names someone else)", igPage("acme", { url: PAGE("someone_else") })],
    ["a page of a path under the name (not the profile itself)", igPage("acme", { url: `${PAGE("acme")}reels/` })],
    ["a login page (its og:url is the login address, its picture the generic logo)", igPage("acme", { url: "https://www.instagram.com/accounts/login/", pic: "https://static.cdninstagram.com/rsrc.php/v3/yI/r/VsNE-OHk_8a.png" })],
    ["a picture on a host that is not Instagram's", igPage("acme", { pic: "https://evil.example.com/pic.jpg" })],
    ["a picture on a look-alike host", igPage("acme", { pic: "https://cdninstagram.com.evil.example.com/pic.jpg" })],
    ["Instagram's page furniture (rsrc.php) on a picture host", igPage("acme", { pic: "https://scontent.cdninstagram.com/rsrc.php/v3/x.png" })],
    ["a picture on Instagram's static host", igPage("acme", { pic: "https://static.cdninstagram.com/v/t51.1-19/a.jpg" })],
    ["a picture over plain http", igPage("acme", { pic: IG_PIC.replace("https:", "http:") })],
    ["a page that names another site as itself", igPage("acme", { url: "https://evil.example.com/acme/" })],
    ["a page that names itself over plain http", igPage("acme", { url: "http://www.instagram.com/acme/" })],
    ["a page with no share tags at all (a name that does not exist looks like this)", igPage("acme", { tags: false })],
  ];
  for (const [what, body] of shapes) {
    fresh();
    const s = {};
    const rr = await find({ handle: "acme" }, { [PAGE("acme")]: { body }, [PIC]: { type: "image/jpeg", body: jpeg(150, 150) }, "https://evil.example.com/pic.jpg": { type: "image/jpeg", body: jpeg(150, 150) } }, s);
    ok(`${what}: no picture is taken, and the answer is "couldn't find a picture"`, rr.ok === false && rr.closed === INSTAGRAM_NOT_FOUND && same(rr.tried, ["instagram"]) && same(s.hits, [PAGE("acme")]), s.hits.join(" | "));
  }

  // the picture itself
  fresh();
  let s = {};
  r = await find({ handle: "acme" }, { [PAGE("acme")]: { body: igPage("acme") }, [PIC]: { location: "http://169.254.169.254/latest/meta-data/" } }, s);
  ok("a redirect from the picture network to an internal address is not followed", r.ok === false && r.closed === INSTAGRAM_MESSAGE && !s.hits.some((u) => u.includes("169.254")), s.hits.join(" | "));
  fresh();
  s = {};
  r = await find({ handle: "acme" }, { [PAGE("acme")]: { body: igPage("acme") }, [PIC]: { location: "https://evil.example.com/pic.jpg" }, "https://evil.example.com/pic.jpg": { type: "image/jpeg", body: jpeg(150, 150) } }, s);
  ok("...nor one to an ordinary public site that is not Instagram's: the picture there is never fetched, however good it looks", r.ok === false && r.closed === INSTAGRAM_MESSAGE && !s.hits.includes("https://evil.example.com/pic.jpg"), s.hits.join(" | "));
  fresh();
  s = {};
  r = await find({ handle: "acme" }, { [PAGE("acme")]: { body: igPage("acme") }, [PIC]: { location: "https://scontent-lhr8-1.cdninstagram.com/v/t51.2885-19/1_n.jpg" }, "https://scontent-lhr8-1.cdninstagram.com/v/t51.2885-19/1_n.jpg": { type: "image/jpeg", body: jpeg(320, 320) } }, s);
  ok("...but one to another host of that picture network is", r.ok && r.from === "scontent-lhr8-1.cdninstagram.com" && same(r.size, { w: 320, h: 320 }));
  fresh();
  r = await find({ handle: "acme" }, { [PAGE("acme")]: { body: igPage("acme") }, [PIC]: { type: "image/jpeg", body: html("<html>please log in</html>") } });
  ok("a 'picture' whose bytes are html is rejected, whatever it is called", r.ok === false && r.closed === INSTAGRAM_MESSAGE);
  fresh();
  r = await find({ handle: "acme" }, { [PAGE("acme")]: { body: igPage("acme") }, [PIC]: { status: 403 } });
  ok("a picture that is refused is a miss, not a pause (the page itself was fine)", r.ok === false && r.closed === INSTAGRAM_MESSAGE && (await find({ handle: "next" }, profile("next"))).ok);

  // Instagram pushing back: stop, wait, never get round it
  for (const status of [429, 401, 403]) {
    fresh();
    const s1 = {};
    r = await find({ handle: "acme" }, { [PAGE("acme")]: { status, body: html("no") } }, s1);
    const warned = takeLogs();
    ok(`HTTP ${status}: nothing is taken, the answer is 'couldn't reach Instagram', and it is logged with the pause`, r.ok === false && r.closed === INSTAGRAM_MESSAGE && same(r.tried, ["instagram"]) && same(s1.hits, [PAGE("acme")]) && new RegExp(`pushed back \\(HTTP ${status}\\)`).test(warned) && /15 minutes/.test(warned), warned);
    clock.t += 60_000;
    const s2 = {};
    r = await find({ handle: "other" }, profile("other"), s2);
    ok("...and for the next 15 minutes nobody is asked for any name", r.ok === false && r.closed === INSTAGRAM_MESSAGE && s2.hits.length === 0 && same(r.tried, []));
    clock.t += 15 * 60_000;
    const s3 = {};
    r = await find({ handle: "other" }, profile("other"), s3);
    ok("...and after that Instagram is asked again", r.ok && s3.hits.length === 2);
  }
  fresh();
  await find({ handle: "a1" }, { [PAGE("a1")]: { status: 429 } });
  clock.t += 16 * 60_000;
  await find({ handle: "a2" }, { [PAGE("a2")]: { status: 429 } });
  clock.t += 29 * 60_000;
  const sD1 = {};
  r = await find({ handle: "a3" }, profile("a3"), sD1);
  ok("pushed back again right after a pause, the next pause is twice as long (30 minutes: still paused after 29)", r.ok === false && sD1.hits.length === 0);
  clock.t += 2 * 60_000;
  const sD2 = {};
  r = await find({ handle: "a3" }, profile("a3"), sD2);
  ok("...and over after 31", r.ok && sD2.hits.length === 2);
  await find({ handle: "a4" }, { [PAGE("a4")]: { status: 429 } });
  clock.t += 16 * 60_000;
  r = await find({ handle: "a5" }, profile("a5"));
  ok("a success starts the pauses over at 15 minutes", r.ok);
  takeLogs();
  for (const loc of ["https://www.instagram.com/accounts/login/?next=%2Facme%2F", "/accounts/login/", "https://www.instagram.com/challenge/?next=/acme/"]) {
    fresh();
    const s4 = {};
    r = await find({ handle: "acme" }, { [PAGE("acme")]: { status: 302, location: loc } }, s4);
    const warned = takeLogs();
    const s5 = {};
    const again = await find({ handle: "other" }, profile("other"), s5);
    ok(`a redirect to its login page (${loc.slice(0, 38)}...) is pushing back: not followed, logged, and a pause`, r.ok === false && r.closed === INSTAGRAM_MESSAGE && same(s4.hits, [PAGE("acme")]) && /sent to its login page/.test(warned) && again.ok === false && s5.hits.length === 0, `${s4.hits.join(" | ")} / ${warned}`);
  }
  fresh();
  s = {};
  r = await find({ handle: "acme" }, { [PAGE("acme")]: { status: 302, location: "https://example.com/" } }, s);
  ok("a redirect anywhere else is not followed and is no reason to pause", r.ok === false && r.closed === INSTAGRAM_MESSAGE && same(s.hits, [PAGE("acme")]) && (await find({ handle: "next" }, profile("next"))).ok);
  fresh();
  s = {};
  r = await find({ handle: "gone" }, { [PAGE("gone")]: { status: 404 } }, s);
  const s404 = {};
  const again404 = await find({ handle: "gone" }, {}, s404);
  ok("404: 'couldn't find a picture', nothing logged, no pause, and the same name is not asked again at once", r.ok === false && r.closed === INSTAGRAM_NOT_FOUND && takeLogs() === "" && again404.closed === INSTAGRAM_NOT_FOUND && s404.hits.length === 0 && (await find({ handle: "next" }, profile("next"))).ok);
  clock.t += 31 * 60_000;
  const s404b = {};
  await find({ handle: "gone" }, { [PAGE("gone")]: { status: 404 } }, s404b);
  ok("...but is after half an hour (a name may be taken later)", s404b.hits.length === 1);
  fresh();
  r = await find({ handle: "acme" }, { [PAGE("acme")]: { status: 500, body: html("oops") } });
  const sRetry = {};
  const retried = await find({ handle: "acme" }, profile("acme"), sRetry);
  ok("a server error is 'couldn't reach Instagram', no pause, and not remembered: the same name works on the next try", r.ok === false && r.closed === INSTAGRAM_MESSAGE && retried.ok && sRetry.hits.length === 2);
  fresh();
  r = await findLogo({ handle: "acme" }, {}, { now, fetchImpl: async () => { throw new TypeError("network down"); } });
  ok("no network at all is the same plain answer, never a crash, and no pause", r.ok === false && r.closed === INSTAGRAM_MESSAGE && same(r.tried, ["instagram"]) && (await find({ handle: "next" }, profile("next"))).ok);

  // a wall that looks like 'no such name'
  fresh();
  const outs = [];
  for (let i = 1; i <= 6; i += 1) { clock.t += 10_000; const si = {}; outs.push([await find({ handle: `nobody${i}` }, nobody(`nobody${i}`), si), si.hits.length]); }
  ok("five names in a row whose pages hold no profile are only misses ('couldn't find a picture')", outs.slice(0, 5).every(([x, n]) => x.closed === INSTAGRAM_NOT_FOUND && n === 1));
  const sixth = takeLogs();
  ok("the sixth looks like being shown a wall: pushed back (logged), the plain 'couldn't reach'", outs[5][0].closed === INSTAGRAM_MESSAGE && /6 pages in a row/.test(sixth), sixth);
  const sAfter = {};
  r = await find({ handle: "fine1" }, profile("fine1"), sAfter);
  ok("...and then nobody is asked for 15 minutes", r.ok === false && sAfter.hits.length === 0);
  fresh();
  for (let i = 1; i <= 4; i += 1) { clock.t += 10_000; await find({ handle: `none${i}` }, nobody(`none${i}`)); }
  clock.t += 10_000;
  await find({ handle: "real1" }, profile("real1"));
  const after = [];
  for (let i = 5; i <= 9; i += 1) { clock.t += 10_000; const si = {}; after.push([await find({ handle: `none${i}` }, nobody(`none${i}`), si), si.hits.length]); }
  ok("a real profile in between starts the count again: nine misses with one real page among them are never a pause", after.every(([x, n]) => x.closed === INSTAGRAM_NOT_FOUND && n === 1) && takeLogs() === "");
  fresh();
  for (let i = 1; i <= 5; i += 1) { clock.t += 5_000; await find({ handle: `slow${i}` }, nobody(`slow${i}`)); }
  clock.t += 11 * 60_000;
  const sSlow = {};
  r = await find({ handle: "slow6" }, nobody("slow6"), sSlow);
  ok("misses more than ten minutes apart do not add up to a pause", r.closed === INSTAGRAM_NOT_FOUND && sSlow.hits.length === 1 && takeLogs() === "");

  // the kill switch and the cap
  for (const off of ["off", " OFF ", "Off"]) {
    fresh();
    const so = {};
    r = await find({ handle: "acme" }, profile("acme"), so, { LOGO_INSTAGRAM_DIRECT: off });
    ok(`LOGO_INSTAGRAM_DIRECT=${JSON.stringify(off)} asks nobody, and the answer is the plain 'couldn't reach'`, r.ok === false && so.hits.length === 0 && same(r.tried, []) && r.closed === INSTAGRAM_MESSAGE);
  }
  fresh();
  await find({ handle: "acme" }, profile("acme"));
  r = await find({ handle: "acme" }, {}, {}, { LOGO_INSTAGRAM_DIRECT: "off" });
  ok("...even for a name that is in the cache", r.ok === false && r.closed === INSTAGRAM_MESSAGE);
  const ons = [];
  for (const on of ["on", "", "no", "0"]) { fresh(); ons.push((await find({ handle: "acme" }, profile("acme"), {}, { LOGO_INSTAGRAM_DIRECT: on })).ok); }
  ok("only 'off' switches it off: on, empty, no and 0 do not", ons.every(Boolean), ons.join());
  fresh();
  const counts = [];
  for (let i = 1; i <= 60; i += 1) { clock.t += 1_000; const sc = {}; await find({ handle: `cap${i}` }, { [PAGE(`cap${i}`)]: { status: 404 } }, sc); counts.push(sc.hits.length); }
  clock.t += 1_000;
  const sCap = {};
  r = await find({ handle: "cap61" }, profile("cap61"), sCap);
  ok("at most 60 pages are asked for in ten minutes: the 61st name is not asked, and gets the plain 'couldn't reach'", counts.every((n) => n === 1) && r.ok === false && sCap.hits.length === 0 && r.closed === INSTAGRAM_MESSAGE && same(r.tried, []));
  clock.t += 11 * 60_000;
  r = await find({ handle: "cap61" }, profile("cap61"));
  ok("...and the window moves on", r.ok);

  // a page is somebody else's: only as much as is needed is read
  fresh();
  const never = { pulls: 0, cancelled: false };
  r = await find({ handle: "acme" }, { [PAGE("acme")]: () => new Response(new ReadableStream({
    pull(c) { never.pulls += 1; c.enqueue(never.pulls === 1 ? html("<html><head><title>x</title>") : html("x".repeat(65_536))); },
    cancel() { never.cancelled = true; },
  }), { status: 200, headers: { "content-type": "text/html" } }) });
  ok("a page that never ends is read to 256 KB at most, then dropped", r.ok === false && never.cancelled && never.pulls <= 8, `pulls ${never.pulls}`);
  fresh();
  const early = { pulls: 0, cancelled: false };
  const firstChunk = html(`<!DOCTYPE html><html><head><meta charset="utf-8"><!--${"x".repeat(9000)}-->${igTags("acme")}`);
  r = await find({ handle: "acme" }, { [PAGE("acme")]: () => new Response(new ReadableStream({
    pull(c) { early.pulls += 1; c.enqueue(early.pulls === 1 ? firstChunk : html("y".repeat(16_384))); },
    cancel() { early.cancelled = true; },
  }), { status: 200, headers: { "content-type": "text/html" } }), [PIC]: { type: "image/jpeg", body: jpeg(150, 150) } });
  ok("a real-shaped page (tags about 9 KB in, then much more) is read only as far as its tags, not downloaded whole", r.ok && early.cancelled && early.pulls <= 4, `pulls ${early.pulls}`);
  fresh();
  const trap = { pulls: 0 };
  const trapFirst = html(`<!DOCTYPE html><html><head><meta charset="utf-8"><script>var s = "og:image og:url > x";</script><!--${"x".repeat(9000)}-->`);
  const trapSecond = html(`${igTags("acme")}</head><body>`);
  r = await find({ handle: "acme" }, { [PAGE("acme")]: () => new Response(new ReadableStream({
    pull(c) { trap.pulls += 1; if (trap.pulls === 1) c.enqueue(trapFirst); else if (trap.pulls === 2) c.enqueue(trapSecond); else c.close(); },
  }), { status: 200, headers: { "content-type": "text/html" } }), [PIC]: { type: "image/jpeg", body: jpeg(150, 150) } });
  ok("a page that mentions og:image and og:url earlier (in a script) is still read on to its real tags", r.ok && r.source === "instagram", `pulls ${trap.pulls}`);
  fresh();
  const bytesIn = html(igPage("acme", { before: `<!--${"x".repeat(20_000)}-->` }));
  let at = 0;
  const t1 = Date.now();
  r = await find({ handle: "acme" }, { [PAGE("acme")]: () => new Response(new ReadableStream({ pull(c) { if (at < bytesIn.length) c.enqueue(bytesIn.subarray(at, at += 1)); else c.close(); } }), { status: 200, headers: { "content-type": "text/html" } }), [PIC]: { type: "image/jpeg", body: jpeg(150, 150) } });
  ok("a page that arrives one byte at a time is read correctly and quickly", r.ok && Date.now() - t1 < 1500, `${Date.now() - t1} ms`);

  // what a page may say: the reading itself
  ok("instagramProfile: the page of the name asked for gives its picture (any case, with or without the closing slash, instagram.com or www)", ["https://www.instagram.com/acme/", "https://www.instagram.com/Acme", "https://instagram.com/ACME/"].every((u) => instagramProfile(igPage("acme", { url: u }), "acme")?.image === PIC));
  ok("...and the title, clipped", instagramProfile(igPage("acme"), "acme")?.title === "Acme (@acme) • Instagram photos and videos" && instagramProfile(igPage("acme").replace("Acme (@acme)", "A".repeat(500)), "acme").title.length === 200);
  ok("instagramProfile: another name, no tags, not a string and an empty page are null", instagramProfile(igPage("acmex"), "acme") === null && instagramProfile(igPage("acme", { tags: false }), "acme") === null && instagramProfile(null, "acme") === null && instagramProfile("", "acme") === null && instagramProfile(undefined, "acme") === null);
  ok("instagramProfile: attributes in either order, single quotes, and entities in the address are read", instagramProfile(`<meta content='${IG_PIC.replace(/&/g, "&amp;")}' property='og:image'><meta content="${PAGE("acme")}" property="og:url">`, "acme")?.image === PIC);
  ok("instagramProfile: the first tag of a kind is the one used, so a later one cannot replace it", instagramProfile(igPage("acme", { before: "" }).replace("</head>", `<meta property="og:image" content="https://evil.example.com/x.jpg"></head>`), "acme")?.image === PIC && instagramProfile(`<meta property="og:image" content="https://evil.example.com/x.jpg">${igTags("acme")}`, "acme") === null);
  ok("instagramProfile: an older-style picture address (no size parameter, /v/t51.2885-19/..._a.jpg, as two real accounts gave on 2026-11-14) is read like any other", instagramProfile(igPage("acme", { pic: "https://scontent-lhr8-1.cdninstagram.com/v/t51.2885-19/11311258_1618073471800920_1188031470_a.jpg?_nc_ht=scontent-lhr8-1.cdninstagram.com&oh=00_x&oe=69999999" }), "acme")?.image.includes("11311258_1618073471800920_1188031470_a.jpg"));
  const t2 = Date.now();
  instagramProfile("<meta ".repeat(100000) + "<meta property=\"og:url\" content=\"x", "acme");
  instagramProfile(`<meta ${"a=\"".repeat(80000)}`, "acme");
  instagramProfile(`<meta property="og:url" content="${"u".repeat(900)}`.repeat(300), "acme");
  ok("a hostile page (100,000 unclosed meta tags, a very long attribute) is read in well under a second", Date.now() - t2 < 1500, `${Date.now() - t2} ms`);
  ok("parseImageUrl: a long signed address is fine (to 2,000 characters); a password in it, other ports, private hosts, other schemes and absurd lengths are not", parseImageUrl(IG_PIC).hostname === "scontent.cdninstagram.com" && parseImageUrl(`https://a.example.com/${"x".repeat(1900)}`) instanceof URL
    && ["https://u:p@a.example.com/x.png", "https://a.example.com:8443/x.png", "http://127.0.0.1/x.png", "https://localhost/x.png", "https://10.0.0.1/x.png", "ftp://a.example.com/x.png", "javascript:alert(1)", "data:image/png;base64,AAAA", `https://a.example.com/${"x".repeat(2100)}`, "", "not a url"].every((u) => throws(() => parseImageUrl(u))));

  // the name together with a site, and things that cannot be asked
  fresh();
  const stA = {};
  r = await find({ handle: "acme", site: "acme-coffee.com" }, { [PAGE("acme")]: { status: 404 }, "https://acme-coffee.com/robots.txt": { status: 404 }, "https://acme-coffee.com/": { body: page1() }, "https://acme-coffee.com/logo.png": { type: "image/png", body: png(400, 160) } }, stA);
  ok("a name with no picture and a site: the name is asked first, then the site is used", r.ok && r.source === "website" && stA.hits[0] === PAGE("acme") && stA.hits.includes("https://acme-coffee.com/"));
  fresh();
  const stB = {};
  r = await find({ handle: "acme", site: "acme-coffee.com" }, { ...profile("acme"), "https://acme-coffee.com/": { body: page1() } }, stB);
  ok("...and when the name works the site is not touched", r.ok && r.source === "instagram" && !stB.hits.some((u) => u.includes("acme-coffee")));
  fresh();
  r = await find({ handle: "acme", site: "blocked-site.com" }, { [PAGE("acme")]: { status: 404 }, "https://blocked-site.com/robots.txt": { type: "text/plain", body: "User-agent: *\nDisallow: /\n" }, "https://blocked-site.com/": { body: page1() } });
  ok("a name that finds nothing and a site that keeps robots out: the site's reason is the one given, and both were tried", r.ok === false && r.robots === true && same(r.tried, ["instagram", "website"]));
  const stNo = {};
  r = await find({ handle: "$$" }, profile("acme"), stNo);
  ok("a name that cannot be one asks nobody", r.ok === false && same(r.tried, []) && stNo.hits.length === 0);
  ok("an Instagram link typed as the site is refused and never fetched", await (async () => {
    const stc = {};
    const rc = await find({ site: "instagram.com/acme" }, profile("acme"), stc);
    return rc.ok === false && typeof rc.closed === "string" && stc.hits.length === 0;
  })());
  ok("an Instagram link typed as the name is read as the name", await (async () => {
    fresh();
    const stl = {};
    const rl = await find({ handle: "https://www.instagram.com/Acme/?hl=en" }, profile("acme"), stl);
    return rl.ok && stl.hits[0] === PAGE("acme");
  })());
}

/* ════════════════════════════════════════════════════════════════ */
group("G. GET /api/website-orders/logo");
{
  const IG_PIC = "https://scontent.cdninstagram.com/v/t51.82787-19/a_n.png?stp=dst-jpg_s150x150_tt6&oh=00_x&oe=69999999";
  const igHtml = (handle) => `<!DOCTYPE html><html><head><meta property="og:image" content="${IG_PIC.replace(/&/g, "&amp;")}" /><meta property="og:url" content="https://www.instagram.com/${handle}/" /></head><body></body></html>`;
  const web = pretendWeb({
    "https://www.instagram.com/acme/": { body: igHtml("acme") },
    [new URL(IG_PIC).href]: { type: "image/png", body: png(150, 150) },
    "https://acme-coffee.com/robots.txt": { status: 404 }, "https://acme-coffee.com/": { body: page1("/l.svg") }, "https://acme-coffee.com/l.svg": { type: "image/svg+xml", body: svgText() },
    "https://blocked-site.com/robots.txt": { type: "text/plain", body: "User-agent: *\nDisallow: /\n" }, "https://blocked-site.com/": { body: page1() },
  });
  pretendSupabase({ web });
  resetLookupLimit();
  resetInstagram();
  const res = await get(baseEnv, "/api/website-orders/logo?handle=%40Acme");
  const bytes = new Uint8Array(await res.arrayBuffer());
  ok("a found logo is the picture itself with its type", res.status === 200 && res.headers.get("content-type") === "image/png" && Buffer.compare(Buffer.from(bytes), Buffer.from(png(150, 150))) === 0);
  ok("and says where it came from and how big", res.headers.get("x-logo-source") === "instagram" && res.headers.get("x-logo-from") === "scontent.cdninstagram.com" && res.headers.get("x-logo-size") === "150x150");
  ok("and cannot be run as a page: nosniff and a sandbox CSP, plus the website's CORS", res.headers.get("x-content-type-options") === "nosniff" && /sandbox/.test(res.headers.get("content-security-policy")) && res.headers.get("access-control-allow-origin") === ORIGIN && /X-Logo-From/.test(res.headers.get("access-control-expose-headers")));
  const svg = await get(baseEnv, "/api/website-orders/logo?site=acme-coffee.com");
  ok("a website's SVG comes back as svg with no size header", svg.status === 200 && svg.headers.get("content-type") === "image/svg+xml" && svg.headers.get("x-logo-source") === "website" && !svg.headers.get("x-logo-size"));
  const nf = await get(baseEnv, "/api/website-orders/logo?handle=nobody");
  const nfb = await J(nf);
  ok("a name with no profile is a 404 with the plain-words reason (check the spelling, the website, or upload) and Instagram named as tried", nf.status === 404 && nfb.ok === false && nfb.error === "not_found" && same(nfb.tried, ["instagram"]) && nfb.message === INSTAGRAM_NOT_FOUND && /spelling/.test(nfb.message) && /upload/i.test(nfb.message));
  const off = await get({ ...baseEnv, LOGO_INSTAGRAM_DIRECT: "off" }, "/api/website-orders/logo?handle=acme");
  const offb = await J(off);
  ok("with the Instagram reading switched off a name is a 404 with the 'couldn't reach' words and nothing tried", off.status === 404 && same(offb.tried, []) && offb.message === INSTAGRAM_MESSAGE && /website/i.test(offb.message) && /upload/i.test(offb.message));
  const closed = await get(baseEnv, "/api/website-orders/logo?site=https%3A%2F%2Fwww.instagram.com%2Facme%2F");
  const cb = await J(closed);
  ok("an Instagram link given as a site is 404 with the reason in plain words", closed.status === 404 && /Instagram/.test(cb.message));
  const robots = await get(baseEnv, "/api/website-orders/logo?site=blocked-site.com");
  const rb404 = await J(robots);
  ok("a site that asks robots to keep out is a 404 that says so and offers the upload", robots.status === 404 && /robots/i.test(rb404.message) && /[Uu]pload/.test(rb404.message), JSON.stringify(rb404));
  for (const [q, name] of [["", "no parameters"], ["?handle=", "an empty handle"], ["?handle=a b", "a handle with a space"], ["?site=http://127.0.0.1", "a private site"], ["?site=localhost", "localhost"], ["?site=https://acme.com:8080", "a port"], ["?handle=../x", "a path as a handle"]]) {
    const rb = await get(baseEnv, `/api/website-orders/logo${q}`);
    ok(`${name} is 400`, rb.status === 400 && (await J(rb)).error === "invalid");
  }
  ok("a refused origin cannot use it", (await get(baseEnv, "/api/website-orders/logo?handle=acme", { origin: "https://evil.example" })).status === 403);
  resetLookupLimit();
  let last = 0, first429 = 0;
  for (let i = 1; i <= 32; i += 1) { const r2 = await get(baseEnv, "/api/website-orders/logo?handle=nobody", { headers: { "CF-Connecting-IP": "198.51.100.77" } }); last = r2.status; if (r2.status === 429 && !first429) first429 = i; }
  ok("one address may look up 30 times in ten minutes; the 31st gets 429 and Retry-After", first429 === 31 && last === 429);
  ok("another address is not affected", (await get(baseEnv, "/api/website-orders/logo?handle=acme", { headers: { "CF-Connecting-IP": "198.51.100.78" } })).status === 200);
  resetLookupLimit();
  resetInstagram();
  pretendSupabase({ web: async () => { throw new TypeError("internet is down"); } });
  const down = await get(baseEnv, "/api/website-orders/logo?handle=acme");
  const downb = await J(down);
  ok("with the whole internet down it is a clean 404 'couldn't reach Instagram', never a crash", down.status === 404 && downb.message === INSTAGRAM_MESSAGE);
  resetInstagram();
}

console.error = realError;
console.warn = realWarn;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

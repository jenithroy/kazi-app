/**
 * Orders from the website (kazimanufacturing.com) arriving in the dashboard. The contract is docs/dashboard-link.md in the website
 * repository and WEBSITE_ORDERS.md here; the database half is migration 0071 (ingest_website_order, website_order_limits_ok).
 *
 *   POST /api/website-orders          an order (JSON: the quote forms and "Create by design"); resends with the same key are harmless
 *   GET  /api/website-orders/logo     ?handle=acme or ?site=acme.com : finds a brand's logo (worker/lib/logoFinder.js)
 *   GET  /api/website-orders/health   the Worker, its key, the database function and the bucket, in one answer
 *
 * Anyone on the internet can call these, so nothing in a request is trusted: every field is checked, cut to length and cleaned, unknown
 * fields are dropped (the stored record is built from the checked fields, never from the body), files are recognised by their first bytes,
 * and the limits are asked of the database BEFORE anything is stored. Browsers may call only from the website's own origins (CORS); a
 * call with no Origin (a script) gets the same checks. The key that writes is the service key, held here and nowhere near the browser.
 *
 * Order of work for a POST, cheapest first, so a flood costs as little as possible and never fills the bucket:
 *   size -> JSON -> checks -> "is this key already stored?" (answered at once, nothing written) -> the limits -> the files -> the order.
 */
import { rpc, select, serviceHeaders } from "./supabaseRest.js";
import { findLogo, parseHandle, parseSite } from "./logoFinder.js";

const V = 1;
const BUCKET = "website-orders";
const MAX_BODY = 4_718_592;                 // 4.5 MB of JSON
const MAX_FILES_BYTES = 3_145_728;          // 3 MB of files once decoded, in all
const MAX_DST_BYTES = 2_000_000;
const DEFAULT_ORIGINS = ["https://kazimanufacturing.com", "https://www.kazimanufacturing.com"];
const PREVIEW_ORIGIN = /^https:\/\/(?:[a-z0-9-]+\.)?(?:kazi-view|kazifrontend)\.pages\.dev$/;
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const FILE_KINDS = ["logo", "design", "preview", "artwork"];
const LOGO_FROM = ["instagram", "website", "upload"];
const KINDS = ["design", "quote"];

/* ── Answers ──────────────────────────────────────────────────── */

/** The origin to answer, or null: the website's own, the preview deployments, and (only when switched on) localhost. */
export function allowedOrigin(origin, env = {}) {
  if (!origin) return null;
  const list = String(env.WEBSITE_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if ((list.length ? list : DEFAULT_ORIGINS).includes(origin)) return origin;
  if (PREVIEW_ORIGIN.test(origin)) return origin;
  if (env.WEBSITE_ALLOW_LOCALHOST === "1" && LOCAL_ORIGIN.test(origin)) return origin;
  return null;
}

function corsHeaders(allowed) {
  return allowed ? {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-replay-secret",
    "Access-Control-Expose-Headers": "X-Logo-Source, X-Logo-From, X-Logo-Size, Retry-After",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  } : { Vary: "Origin" };
}

function reply(allowed, status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...corsHeaders(allowed), ...extra },
  });
}

const invalid = (field, message) => ({ ok: false, status: 400, body: { ok: false, error: "invalid", field, message } });
const tooLarge = (message = "That is too large.") => ({ ok: false, status: 413, body: { ok: false, error: "too_large", message } });

/* ── Cleaning ─────────────────────────────────────────────────── */

const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;       // zero-width characters and the right-to-left overrides that disguise a name: removed
const CONTROL_ONE_LINE = /[\u0000-\u001f\u007f]+/g;                        // control characters, a line break and a tab included: a space
const CONTROL_MANY_LINES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;   // the same, but a line break and a tab stay

export function clean(value, max, multiline = false) {
  if (typeof value !== "string") return "";
  const s = value.normalize("NFC").replace(INVISIBLE, "");
  return (multiline ? s.replace(CONTROL_MANY_LINES, "") : s.replace(CONTROL_ONE_LINE, " ").replace(/ {2,}/g, " ")).trim().slice(0, max);
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/** What a file's first bytes say it is: { type, ext } or null. Pictures only; an SVG is never accepted (it can carry scripts). */
export function sniffFile(b) {
  if (!b || b.length < 8) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: "image/png", ext: "png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  const a = (from, to) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 12 && a(0, 4) === "RIFF" && a(8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
  if (a(0, 3) === "GIF" && (a(3, 6) === "87a" || a(3, 6) === "89a")) return { type: "image/gif", ext: "gif" };
  if (a(0, 5) === "%PDF-") return { type: "application/pdf", ext: "pdf" };
  if (a(0, 3) === "LA:" && b.length >= 512) return { type: "application/octet-stream", ext: "dst" };       // a Tajima .dst starts with its 512-byte header, "LA:" and the name
  return null;
}

const ALLOWED = { logo: ["png", "jpg", "webp", "gif"], preview: ["png", "jpg", "webp"], artwork: ["png", "jpg", "webp", "gif", "pdf"], design: ["dst"] };

function decodeBase64(text) {
  const s = String(text).replace(/^data:[^,]{0,100};base64,/i, "").replace(/\s+/g, "");
  if (!s || s.length > MAX_BODY || !/^[A-Za-z0-9+/]+={0,2}$/.test(s) || s.length % 4 === 1) return null;
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

function validDay(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
  const year = Number(s.slice(0, 4));
  return year >= 2020 && year <= new Date().getUTCFullYear() + 3;
}

/* ── Checking an order ────────────────────────────────────────── */

/**
 * The body of a POST, checked. Resolves to { ok: true, value } with everything cleaned and the files decoded, or
 * { ok: false, status, body } (a ready answer: 400 with the field named, 413 for too much).
 */
export function normalizeOrder(body) {
  if (!isObject(body)) return invalid("", "The order is not a JSON object.");
  if (body.v !== undefined && body.v !== V) return invalid("v", "This version of the order is not supported.");
  if (typeof body.key !== "string" || !UUID.test(body.key)) return invalid("key", "The order has no valid key.");
  const key = body.key.toLowerCase();
  if (!KINDS.includes(body.kind)) return invalid("kind", "The kind of order must be design or quote.");
  const kind = body.kind;
  if (body.hp !== undefined && body.hp !== null && body.hp !== "") return invalid("hp", "Could not send.");

  const c = isObject(body.contact) ? body.contact : {};
  const contact = { name: clean(c.name, 120), email: clean(c.email, 254), phone: clean(c.phone, 40), company: clean(c.company, 160) };
  if (!contact.name) return invalid("contact.name", "Enter your name.");
  if (!EMAIL.test(contact.email)) return invalid("contact.email", "Enter a valid e-mail address.");

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 10) return invalid("items", "An order needs between 1 and 10 items.");
  if (kind === "design" && body.items.length !== 1) return invalid("items", "A design order is for one item.");
  const items = [];
  for (const [i, raw] of body.items.entries()) {
    if (!isObject(raw)) return invalid(`items[${i}]`, "That item is not valid.");
    if (!isInt(raw.qty, 1, 100_000)) return invalid(`items[${i}].qty`, "The quantity must be a whole number from 1 to 100,000.");
    const garment = typeof raw.garment === "string" && /^[a-z0-9-]{1,40}$/i.test(raw.garment) ? raw.garment.toLowerCase() : "other";
    const label = clean(raw.label, 80) || garment;
    let colour = null;
    if (raw.colour !== undefined && raw.colour !== null) {
      if (!isObject(raw.colour) || typeof raw.colour.hex !== "string" || !HEX.test(raw.colour.hex)) return invalid(`items[${i}].colour`, "That colour is not valid.");
      colour = { hex: raw.colour.hex.toUpperCase(), label: clean(raw.colour.label, 40) };
    }
    items.push({ garment, label, colour, qty: raw.qty });
  }
  const quantity = items.reduce((s, it) => s + it.qty, 0);
  if (quantity > 1_000_000) return invalid("items", "That is too many pieces for one order.");

  const b = isObject(body.brand) ? body.brand : {};
  const brand = { handle: null, website: null, logoFrom: null, rightsConfirmed: b.rightsConfirmed === true };
  if (b.handle !== undefined && b.handle !== null && b.handle !== "") {
    brand.handle = parseHandle(b.handle);
    if (!brand.handle) return invalid("brand.handle", "That is not an Instagram name.");
  }
  if (b.website !== undefined && b.website !== null && b.website !== "") {
    const site = parseSite(b.website);
    if (!site || site.toString().length > 200) return invalid("brand.website", "That is not a website address.");
    brand.website = site.toString();
  }
  if (b.logoFrom !== undefined && b.logoFrom !== null && b.logoFrom !== "") {
    if (!LOGO_FROM.includes(b.logoFrom)) return invalid("brand.logoFrom", "Say where the logo came from: instagram, website or upload.");
    brand.logoFrom = b.logoFrom;
    if (!brand.rightsConfirmed) return invalid("brand.rightsConfirmed", "Please confirm the logo is yours, or that you may use it.");
  }

  let deadline = null;
  if (body.deadline !== undefined && body.deadline !== null && body.deadline !== "") {
    if (typeof body.deadline !== "string" || !validDay(body.deadline)) return invalid("deadline", "That date is not valid.");
    deadline = body.deadline;
  }

  let design = null;
  if (isObject(body.design)) {
    const d = body.design;
    const num = (v, max) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 10) / 10 : undefined);
    design = {
      ...(isInt(d.stitches, 0, 5_000_000) ? { stitches: d.stitches } : {}),
      ...(isInt(d.colours, 0, 64) ? { colours: d.colours } : {}),
      ...(num(d.widthMm, 2000) !== undefined ? { widthMm: num(d.widthMm, 2000) } : {}),
      ...(num(d.heightMm, 2000) !== undefined ? { heightMm: num(d.heightMm, 2000) } : {}),
      ...(clean(d.placement, 60) ? { placement: clean(d.placement, 60) } : {}),
    };
    if (!Object.keys(design).length) design = null;
  }

  const files = [];
  let total = 0;
  if (body.files !== undefined && body.files !== null) {
    if (!Array.isArray(body.files) || body.files.length > 4) return invalid("files", "At most 4 files can be sent.");
    for (const [i, raw] of body.files.entries()) {
      if (!isObject(raw) || !FILE_KINDS.includes(raw.kind)) return invalid(`files[${i}].kind`, "That kind of file is not accepted.");
      if (files.some((f) => f.kind === raw.kind)) return invalid(`files[${i}].kind`, "Only one file of each kind can be sent.");
      if (typeof raw.data !== "string") return invalid(`files[${i}].data`, "That file has no content.");
      const bytes = decodeBase64(raw.data);
      if (!bytes) return invalid(`files[${i}].data`, "That file could not be read.");
      total += bytes.length;
      if (total > MAX_FILES_BYTES) return tooLarge("Those files are too large (3 MB in all).");
      const found = sniffFile(bytes);
      if (!found || !ALLOWED[raw.kind].includes(found.ext)) return invalid(`files[${i}].data`, `That is not a file this kind accepts (${ALLOWED[raw.kind].join(", ")}).`);
      if (found.ext === "dst" && bytes.length > MAX_DST_BYTES) return tooLarge("That embroidery file is too large.");
      files.push({ kind: raw.kind, name: clean(raw.name, 80) || `${raw.kind}.${found.ext}`, type: found.type, bytes: bytes.length, path: `${key}/${raw.kind}.${found.ext}`, data: bytes });
    }
  }
  if (kind === "design" && !files.some((f) => f.kind === "logo")) return invalid("files", "A design order needs the logo.");

  return {
    ok: true,
    value: {
      key, kind, contact, items, quantity, brand, deadline, design, files,
      service: clean(body.service, 60) || null,
      message: clean(body.message, 4000, true),
      page: (() => { const p = clean(isObject(body.source) ? body.source.page : "", 100); return p.startsWith("/") ? p : ""; })(),
    },
  };
}

/* ── Turning a checked order into the dashboard's order ───────── */

const pcs = (n) => `${n.toLocaleString("en-GB")} pcs`;

/** The row the database function takes (its columns) and the `web` record the Production page shows. */
export function toDashboard(v, { now = new Date(), ipHash = null, replay = false } = {}) {
  const labels = [...new Set(v.items.map((i) => i.label))];
  const colours = [...new Set(v.items.map((i) => i.colour?.label || "").filter(Boolean))];
  const embroidery = v.kind === "design" || v.files.some((f) => f.kind === "design") || /embroider/i.test(v.service || "");
  const dtf = !embroidery && /\bdtf\b|direct.to.film/i.test(v.service || "");
  const logoLine = v.brand.logoFrom ? `Logo: ${v.brand.logoFrom === "upload" ? "uploaded by the customer" : `from their ${v.brand.logoFrom}`}${v.brand.handle ? ` (@${v.brand.handle})` : ""}.` : "";
  const designLine = v.design ? `Design: ${[
    v.design.stitches !== undefined ? `${v.design.stitches.toLocaleString("en-GB")} stitches` : "",
    v.design.colours !== undefined ? `${v.design.colours} colours` : "",
    v.design.widthMm !== undefined && v.design.heightMm !== undefined ? `${v.design.widthMm} x ${v.design.heightMm} mm` : "",
    v.design.placement || "",
  ].filter(Boolean).join(", ")}. Estimated, not sewn yet.` : "";
  const notes = [
    v.kind === "design" ? "Create by design." : "Quote request.",
    `${v.items.map((i) => `${i.label}${i.colour?.label ? ` (${i.colour.label})` : ""} x ${pcs(i.qty)}`).join("; ")}.`,
    v.service ? `Service: ${v.service}.` : "",
    logoLine,
    designLine,
    v.kind === "design" ? "Check the logo is theirs before anything is made." : "",
  ].filter(Boolean).join(" ");

  const web = {
    v: V,
    kind: v.kind,
    receivedAt: now.toISOString(),
    contact: { name: v.contact.name, email: v.contact.email, phone: v.contact.phone || null, company: v.contact.company || null },
    brand: v.brand,
    items: v.items,
    service: v.service,
    deadline: v.deadline,
    message: v.message || null,
    design: v.design,
    files: v.files.map(({ kind, name, type, bytes, path }) => ({ kind, name, type, bytes, path })),
    page: v.page || null,
  };

  return {
    web,
    args: {
      key: v.key,
      customer_name: v.contact.company || v.contact.name,
      style_name: labels.join(", ").slice(0, 160),
      colorway: colours.length === 1 ? colours[0] : colours.length > 1 ? "Various" : "",
      quantity: v.quantity,
      delivery_date: v.deadline,
      notes,
      message: v.message,
      embellishments: embroidery ? ["Embroidery"] : dtf ? ["DTF"] : [],
      ip_hash: ipHash,
      replay,
      web,
    },
  };
}

/* ── Small tools ──────────────────────────────────────────────── */

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compare two strings without stopping at the first difference. */
export function sameSecret(a, b) {
  const x = String(a ?? ""), y = String(b ?? "");
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

async function ipHashOf(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "";
  return ip ? sha256Hex(`${env.WEBSITE_ORDERS_SALT || "kazi-website-orders"}|${ip}`) : null;
}

async function uploadObject(env, path, bytes, contentType) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: serviceHeaders(env, { "Content-Type": contentType, "x-upsert": "true", "Cache-Control": "max-age=3600" }),
    body: bytes,
  });
  if (res.ok) return true;
  console.error("[website-orders] storing a file failed:", res.status, (await res.text().catch(() => "")).slice(0, 200));
  return false;
}

const unavailable = (allowed) => reply(allowed, 503, { ok: false, error: "unavailable", message: "The order system is not reachable right now. Try again in a moment." }, { "Retry-After": "30" });

/* ── POST /api/website-orders ─────────────────────────────────── */

/** The body as text, read at most `max` bytes: null as soon as it is over (the rest is never read, whatever the sender claims or leaves out). */
async function readText(request, max) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { try { await reader.cancel(); } catch { /* done anyway */ } return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  return new TextDecoder("utf-8").decode(all);
}

async function postOrder(request, env, allowed) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    console.error("[website-orders] SUPABASE_URL or SUPABASE_SERVICE_KEY is not set on this Worker");
    return unavailable(allowed);
  }
  // JSON only: a browser cannot send application/json across sites without asking first (the preflight), which is one more door shut
  if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return reply(allowed, 415, { ok: false, error: "unsupported_media_type", message: "Send the order as application/json." });
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY) return reply(allowed, 413, { ok: false, error: "too_large" });
  let text;
  try { text = await readText(request, MAX_BODY); } catch { return reply(allowed, 400, { ok: false, error: "invalid", message: "The order could not be read." }); }
  if (text === null) return reply(allowed, 413, { ok: false, error: "too_large" });
  let body;
  try { body = JSON.parse(text); } catch { return reply(allowed, 400, { ok: false, error: "invalid", message: "The order is not valid JSON." }); }

  const checked = normalizeOrder(body);
  if (!checked.ok) return reply(allowed, checked.status, checked.body);
  const v = checked.value;

  const replay = Boolean(env.WEBSITE_ORDERS_REPLAY_SECRET) && sameSecret(request.headers.get("x-replay-secret"), env.WEBSITE_ORDERS_REPLAY_SECRET);
  const ipHash = await ipHashOf(request, env);

  // 1. already stored? (a resend): answered at once, nothing is written and no limit applies
  try {
    const rows = await select(env, "orders", { web_ref: `eq.${v.key}`, select: "id,order_no", limit: 1 });
    if (rows?.length) return reply(allowed, 200, { ok: true, ref: rows[0].order_no, id: rows[0].id, duplicate: true });
  } catch (err) {
    console.error("[website-orders] looking for the key failed:", err?.message || err);       // the next steps will say if the database is really down
  }

  // 2. the limits, asked before any file is stored (the order function asks again: this is only to turn a flood away cheaply)
  if (!replay) {
    try {
      const limits = await rpc(env, "website_order_limits_ok", { p_ip: ipHash, p_email: v.contact.email.toLowerCase() });
      if (limits.ok && limits.body === false) return reply(allowed, 429, { ok: false, error: "rate_limited", retryAfter: 600 }, { "Retry-After": "600" });
    } catch (err) {
      console.error("[website-orders] the limits check failed:", err?.message || err);
    }
  }

  // 3. the files (the same paths on a retry, overwritten: a half-finished earlier try leaves nothing behind that matters)
  try {
    const stored = await Promise.all(v.files.map((f) => uploadObject(env, f.path, f.data, f.type)));
    if (stored.includes(false)) return unavailable(allowed);
  } catch (err) {
    console.error("[website-orders] storing the files failed:", err?.message || err);
    return unavailable(allowed);
  }

  // 4. the order, in one transaction in the database
  const { args } = toDashboard(v, { ipHash, replay });
  let r;
  try {
    r = await rpc(env, "ingest_website_order", { p: args });
  } catch (err) {
    console.error("[website-orders] the order could not be sent to the database:", err?.message || err);
    return unavailable(allowed);
  }
  if (r.ok && isObject(r.body) && r.body.ok === true) return reply(allowed, 200, { ok: true, ref: r.body.ref, id: r.body.id, duplicate: r.body.duplicate === true });
  if (r.status === 429) return reply(allowed, 429, { ok: false, error: "rate_limited", retryAfter: 600 }, { "Retry-After": "600" });
  if (r.status === 400 && isObject(r.body) && r.body.code === "PT400") {
    console.error("[website-orders] the database refused an order the Worker accepted:", r.body.message);
    return reply(allowed, 400, { ok: false, error: "invalid", message: "The order could not be accepted." });
  }
  if (r.status === 404) console.error("[website-orders] ingest_website_order does not exist: apply migration 0071 (supabase/migrations/0071_website_orders.sql)");
  else console.error("[website-orders] the database answered", r.status, JSON.stringify(r.body).slice(0, 300));
  return unavailable(allowed);
}

/* ── GET /api/website-orders/logo ─────────────────────────────── */

const lookups = new Map();                         // address hash -> { count, until }: a best-effort limit inside one Worker instance; Cloudflare's own rate limiting is the real one
function lookupAllowed(key, limit = 30, windowMs = 600_000) {
  const now = Date.now();
  if (lookups.size > 5000) for (const [k, e] of lookups) if (e.until < now) lookups.delete(k);
  const e = lookups.get(key);
  if (!e || e.until < now) { lookups.set(key, { count: 1, until: now + windowMs }); return true; }
  e.count += 1;
  return e.count <= limit;
}
export const resetLookupLimit = () => lookups.clear();

async function getLogo(request, env, allowed, url) {
  const key = (await ipHashOf(request, env)) || "anonymous";
  if (!lookupAllowed(key)) return reply(allowed, 429, { ok: false, error: "rate_limited", retryAfter: 600 }, { "Retry-After": "600" });
  const handleRaw = url.searchParams.get("handle");
  const siteRaw = url.searchParams.get("site");
  if (!handleRaw && !siteRaw) return reply(allowed, 400, { ok: false, error: "invalid", message: "Give an Instagram name or a website." });
  const handle = handleRaw ? parseHandle(handleRaw) : null;
  if (handleRaw && !handle) return reply(allowed, 400, { ok: false, error: "invalid", field: "handle", message: "That is not an Instagram name." });
  const site = siteRaw ? parseSite(siteRaw) : null;
  if (siteRaw && !site) return reply(allowed, 400, { ok: false, error: "invalid", field: "site", message: "That is not a website address the finder can read." });

  let found;
  try {
    found = await findLogo({ handle, site: site ? site.toString() : null }, env);
  } catch (err) {
    console.error("[website-orders] the logo finder failed:", err?.message || err);
    return reply(allowed, 502, { ok: false, error: "unavailable", message: "The logo could not be looked up right now." });
  }
  if (!found.ok) {
    return reply(allowed, 404, {
      ok: false, error: "not_found", tried: found.tried,
      message: found.closed || (found.robots ? "That site asks robots to keep out, so its logo can't be fetched. Upload it instead." : found.offSite ? `That address sends visitors to another site (${found.offSite}). Type that site's own address.` : "No logo could be found."),
    });
  }
  return new Response(found.bytes, {
    status: 200,
    headers: {
      "Content-Type": found.type,
      "X-Logo-Source": found.source,
      "X-Logo-From": found.from,
      ...(found.size ? { "X-Logo-Size": `${found.size.w}x${found.size.h}` } : {}),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=600",
      ...corsHeaders(allowed),
    },
  });
}

/* ── GET /api/website-orders/health ───────────────────────────── */

async function getHealth(env, allowed) {
  const out = { ok: false, v: V, db: false, storage: false };
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    try {
      // a null order is refused before it touches anything: that proves the key, the database and the function in one call
      const r = await rpc(env, "ingest_website_order", { p: null });
      out.db = r.status === 400 && isObject(r.body) && r.body.code === "PT400";
    } catch { /* db stays false */ }
    try {
      const res = await fetch(`${env.SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, { headers: serviceHeaders(env) });
      out.storage = res.ok;
    } catch { /* storage stays false */ }
  }
  out.ok = out.db && out.storage;
  return reply(allowed, out.ok ? 200 : 503, out);
}

/* ── The route ────────────────────────────────────────────────── */

/** Answers /api/website-orders and what is under it. Never throws. */
export async function handleWebsiteOrders(request, env = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const origin = request.headers.get("Origin");
  const allowed = allowedOrigin(origin, env);
  if (origin && !allowed) return reply(null, 403, { ok: false, error: "origin_not_allowed" });
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(allowed) });
    if (path === "/api/website-orders") {
      if (request.method === "POST") return await postOrder(request, env, allowed);
      return reply(allowed, 405, { ok: false, error: "method_not_allowed" }, { Allow: "POST, OPTIONS" });
    }
    if (path === "/api/website-orders/logo") {
      if (request.method === "GET") return await getLogo(request, env, allowed, url);
      return reply(allowed, 405, { ok: false, error: "method_not_allowed" }, { Allow: "GET, OPTIONS" });
    }
    if (path === "/api/website-orders/health") {
      if (request.method === "GET") return await getHealth(env, allowed);
      return reply(allowed, 405, { ok: false, error: "method_not_allowed" }, { Allow: "GET, OPTIONS" });
    }
    return reply(allowed, 404, { ok: false, error: "not_found" });
  } catch (err) {
    console.error("[website-orders] unexpected failure:", err?.stack || err?.message || err);
    return reply(allowed, 500, { ok: false, error: "server_error" });
  }
}

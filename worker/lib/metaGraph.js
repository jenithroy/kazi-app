/**
 * Small Graph API client. Auth is a single Business Manager System User
 * token (see migration 0046_meta_ads.sql's header) held as the Worker
 * secret META_ACCESS_TOKEN — sent as a Bearer header on every call, never
 * as an `access_token` query param, so it never ends up in logs or in a
 * `paging.next` URL.
 */

const DEFAULT_API_VERSION = "v23.0";

// Graph error code 17 = "user request limit reached", 32 = "page request
// limit reached" — both are rate limits worth backing off and retrying.
// HTTP 5xx is Meta's own infrastructure having a bad moment. Anything else
// (bad params, permission errors, etc.) is not going to fix itself on
// retry, so it's thrown immediately instead.
const RETRYABLE_GRAPH_CODES = new Set([17, 32]);
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;

// One very large ad account (thousands of ads, a full 37-day daily
// breakdown per entity) must degrade to a partial sync rather than hang the
// Worker. This caps pages per single Graph edge/insights call; metaSync.js
// records a cap-hit in the sync run's `detail` rather than treating it as
// an error.
const MAX_PAGES_PER_ENTITY = 50;

function graphBaseUrl(env) {
  const version = env.META_API_VERSION || DEFAULT_API_VERSION;
  return `https://graph.facebook.com/${version}`;
}

function buildUrl(env, pathOrUrl, params) {
  const isFullUrl = /^https?:\/\//.test(pathOrUrl);
  const url = new URL(isFullUrl ? pathOrUrl : `${graphBaseUrl(env)}${pathOrUrl}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      // Object-valued params (e.g. time_range: {since, until}) are how the
      // Graph API itself expects structured query params: JSON-encoded.
      url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
    }
  }
  return url;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(httpStatus, body) {
  if (httpStatus >= 500) return true;
  const code = body?.error?.code;
  return RETRYABLE_GRAPH_CODES.has(code);
}

/**
 * Shared request path for metaGet/metaPost/metaGetAllPages. `pathOrUrl` may
 * be a relative Graph path ("/act_123/campaigns") or a full URL (a
 * paging.next link) — either works since both end up authenticated the
 * same way, via the header.
 */
async function graphRequest(method, pathOrUrl, { params, body, env } = {}) {
  const url = buildUrl(env, pathOrUrl, params);

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
          ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
        // Graph API's own docs and examples universally use form-encoded
        // POST bodies (or query params) for writes — safest, most
        // consistently-documented shape across API versions.
        body: method === "POST" ? formEncode(body) : undefined,
      });
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
        continue;
      }
      throw err;
    }

    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { error: { message: text || `Non-JSON response (HTTP ${res.status})` } };
    }

    if (res.ok) return json;

    if (isRetryable(res.status, json) && attempt < MAX_ATTEMPTS) {
      lastError = new Error(json?.error?.message || `Graph API error ${res.status}`);
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
      continue;
    }

    const err = new Error(json?.error?.message || `Graph API error ${res.status}`);
    err.status = res.status;
    err.graphCode = json?.error?.code;
    err.graphError = json?.error;
    throw err;
  }

  throw lastError || new Error("Graph API request failed after retries.");
}

function formEncode(body) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body || {})) {
    if (value === undefined || value === null) continue;
    form.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  return form.toString();
}

export async function metaGet(path, params, env) {
  return graphRequest("GET", path, { params, env });
}

export async function metaPost(path, body, env) {
  return graphRequest("POST", path, { body, env });
}

/**
 * Follows paging.next (which already encodes paging.cursors.after) until
 * either it runs out or maxPages is hit. Returns { items, cappedAt } —
 * cappedAt true means the cap was hit and the caller degraded to a partial
 * result on purpose; this never throws for that case.
 */
export async function metaGetAllPages(path, params, env, maxPages = MAX_PAGES_PER_ENTITY) {
  const items = [];
  let next = null;

  for (let page = 0; page < maxPages; page++) {
    const json = next
      ? await graphRequest("GET", next, { env })
      : await graphRequest("GET", path, { params, env });

    if (Array.isArray(json?.data)) items.push(...json.data);

    next = json?.paging?.next || null;
    if (!next) return { items, cappedAt: false };
  }

  return { items, cappedAt: true };
}

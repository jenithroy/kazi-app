/**
 * Thin PostgREST client for privileged (service-role) writes from the root
 * Worker. Same request shape as bank-webhook-worker/src/index.js's direct
 * fetch calls to PostgREST — no SDK, just apikey/Authorization headers
 * carrying SUPABASE_SERVICE_KEY, and Prefer headers for upsert semantics.
 * Used by metaSync.js (all of it) and index.js's /api/meta-ads/action route
 * (only to read meta_ads_settings' budget ceiling).
 */

function serviceHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    ...extra,
  };
}

async function readErrorText(res) {
  return res.text().catch(() => "");
}

/**
 * GET rows from `table`. `query` is a raw PostgREST query object, e.g.
 * { select: "id,name", is_active: "eq.true", order: "created_at.desc" } —
 * values are used exactly as given (already in PostgREST's own
 * "eq.foo" / "gt.bar" grammar), not auto-wrapped.
 */
export async function select(env, table, query = {}) {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, { headers: serviceHeaders(env) });
  if (!res.ok) {
    throw new Error(`Supabase select on ${table} failed: ${res.status} ${await readErrorText(res)}`);
  }
  return res.json();
}

/**
 * Insert new rows and hand back what PostgREST returns (so callers can read
 * a generated column, e.g. a fresh meta_sync_runs.id).
 */
export async function insert(env, table, rows) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: serviceHeaders(env, {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`Supabase insert into ${table} failed: ${res.status} ${await readErrorText(res)}`);
  }
  return res.json();
}

/**
 * Upsert rows keyed on `onConflict` (a comma-separated column list matching
 * the table's primary key — e.g. "entity_level,entity_id,date" for
 * meta_ad_insights, whose primary key has no single `id` column). Mirrors
 * bank-webhook-worker's `Prefer: resolution=merge-duplicates`: on a
 * conflict, only the columns present in each row are overwritten — columns
 * left out are untouched on the existing row.
 */
export async function upsert(env, table, rows, { onConflict } = {}) {
  if (!rows || rows.length === 0) return;
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  if (onConflict) url.searchParams.set("on_conflict", onConflict);
  const res = await fetch(url, {
    method: "POST",
    headers: serviceHeaders(env, {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`Supabase upsert into ${table} failed: ${res.status} ${await readErrorText(res)}`);
  }
}

/**
 * Update rows matching `filter` (plain column:value equality pairs, each
 * turned into PostgREST's `column=eq.value`) with `body`.
 */
export async function patch(env, table, filter, body) {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  for (const [column, value] of Object.entries(filter || {})) {
    url.searchParams.set(column, `eq.${value}`);
  }
  const res = await fetch(url, {
    method: "PATCH",
    headers: serviceHeaders(env, {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Supabase patch on ${table} failed: ${res.status} ${await readErrorText(res)}`);
  }
}

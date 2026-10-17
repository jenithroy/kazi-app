#!/usr/bin/env node
/**
 * Read-only Firestore inspector for the reference app's live database
 * (`kazi-manufacturing`). Recreated from FRONTEND_GAP_PLAN §0 — it produced
 * §6 "Live Firestore schema" and the 2026-08-30 re-inspection row.
 *
 *   node scripts/inspect-firestore.mjs                # list every collection + counts
 *   node scripts/inspect-firestore.mjs <collection>   # dump a sample of one collection
 *   node scripts/inspect-firestore.mjs <collection> 25
 *
 * Auth: mints a short-lived service-account JWT from `key.json` (repo root,
 * git-ignored) → `datastore` scope → access token → Firestore REST API.
 * No dependencies (Node ≥ 18 `fetch` + built-in `crypto`).
 *
 * **READ ONLY.** This script only ever issues GET / listCollectionIds /
 * runQuery calls. It must never write, update, or delete — see §0.
 */

import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEY_PATH = resolve(ROOT, 'key.json');

function loadKey() {
  try {
    return JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  } catch {
    console.error(`Could not read ${KEY_PATH} — the service-account key (git-ignored). See FRONTEND_GAP_PLAN §0.`);
    process.exit(1);
  }
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function mintAccessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claim}`).sign(key.private_key);
  const jwt = `${header}.${claim}.${base64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

/** Flatten a Firestore REST `fields` object into plain JS (one level; nested map/array summarised). */
function decodeValue(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return `{map: ${Object.keys(v.mapValue.fields ?? {}).join(', ') || '∅'}}`;
  if ('arrayValue' in v) return `[array: ${(v.arrayValue.values ?? []).length}]`;
  if ('referenceValue' in v) return `→ ${v.referenceValue.split('/').pop()}`;
  return JSON.stringify(v);
}

function decodeDoc(doc) {
  const out = { _id: doc.name.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields ?? {})) out[k] = decodeValue(v);
  return out;
}

async function main() {
  const key = loadKey();
  const project = key.project_id;
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  const token = await mintAccessToken(key);
  const authHeader = { Authorization: `Bearer ${token}` };

  const [, , collection, sizeArg] = process.argv;

  if (!collection) {
    const res = await fetch(`${base}:listCollectionIds`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageSize: 300 }),
    });
    if (!res.ok) throw new Error(`listCollectionIds: ${res.status} ${await res.text()}`);
    const ids = (await res.json()).collectionIds ?? [];
    console.log(`${project} — ${ids.length} top-level collections:\n`);
    for (const id of ids.sort()) {
      const c = await fetch(`${base}/${id}?pageSize=1`, { headers: authHeader });
      const body = c.ok ? await c.json() : {};
      const sample = body.documents?.[0];
      const fieldList = sample ? Object.keys(sample.fields ?? {}).join(', ') : '(empty)';
      console.log(`  ${id}\n    ${fieldList}\n`);
    }
    console.log('Run `node scripts/inspect-firestore.mjs <collection> [n]` to sample one.');
    return;
  }

  const pageSize = Number(sizeArg) || 5;
  const res = await fetch(`${base}/${collection}?pageSize=${pageSize}`, { headers: authHeader });
  if (!res.ok) throw new Error(`GET ${collection}: ${res.status} ${await res.text()}`);
  const docs = (await res.json()).documents ?? [];
  console.log(`${collection} — ${docs.length} sampled doc(s):\n`);
  for (const doc of docs) console.log(JSON.stringify(decodeDoc(doc), null, 2), '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

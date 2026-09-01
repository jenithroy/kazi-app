#!/usr/bin/env node
/**
 * Stamps `role: "authenticated"` onto the Firebase Auth users that map to a
 * `people` row. Supabase requires that claim on a third-party token — without
 * it a signed-in user is treated as `anon` and every policy denies them.
 *
 * Safe to re-run. Run it again after adding anyone to `people`.
 *
 *   node scripts/sync-auth-claims.cjs            show what would change
 *   node scripts/sync-auth-claims.cjs --apply    write the claims
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const ROOT = path.join(__dirname, '..');
const CFG = fs.readFileSync(path.join(ROOT, 'mentions', 'supabase.txt'), 'utf8');
const URI = (CFG.match(/postgresql:\/\/\S+pooler\.supabase\.com:\d+\/postgres/g) || []).pop();
const pad = (s, n) => String(s ?? '').padEnd(n);

(async () => {
  const apply = process.argv.includes('--apply');
  initializeApp({ credential: cert(require(path.join(ROOT, 'key.json'))) });
  const auth = getAuth();
  const pg = new Client({ connectionString: URI, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const people = (await pg.query(
    `select full_name, email, legacy_firebase_uid uid, position_id from people where status = 'Active'`)).rows;
  const byUid = new Map(people.filter(p => p.uid).map(p => [p.uid, p]));

  const { users } = await auth.listUsers(1000);
  let toSet = 0, ok = 0, orphaned = 0;

  console.log(pad('FIREBASE USER', 34) + pad('PERSON', 20) + 'CLAIM');
  console.log('-'.repeat(72));
  for (const u of users) {
    const p = byUid.get(u.uid);
    const has = u.customClaims?.role === 'authenticated';
    if (!p) {
      orphaned++;
      // Deliberately left without the claim: no `people` row means no access
      // anyway, but withholding it keeps them at `anon` as a second line.
      if (has && apply) { await auth.setCustomUserClaims(u.uid, null); }
      console.log(pad(u.email || u.uid, 34) + pad('— no people row —', 20) + (has ? 'REMOVED' : 'none (correct)'));
      continue;
    }
    if (has) { ok++; console.log(pad(u.email || u.uid, 34) + pad(p.full_name, 20) + 'already set'); continue; }
    toSet++;
    if (apply) await auth.setCustomUserClaims(u.uid, { ...(u.customClaims || {}), role: 'authenticated' });
    console.log(pad(u.email || u.uid, 34) + pad(p.full_name, 20) + (apply ? 'SET ✓' : 'would set'));
  }

  const noAccount = people.filter(p => !p.uid || !users.find(u => u.uid === p.uid));
  console.log('\n' + '-'.repeat(72));
  console.log(`${ok} already correct, ${toSet} ${apply ? 'updated' : 'need updating'}, ${orphaned} Firebase accounts with no people row (left as anon).`);
  if (noAccount.length)
    console.log('\n⚠ in people but no Firebase account, cannot sign in: ' + noAccount.map(p => p.full_name).join(', '));
  if (apply)
    console.log('\nClaims apply on the user\'s next token refresh (within the hour, or immediately if they sign out and back in).');
  await pg.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

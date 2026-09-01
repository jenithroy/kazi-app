#!/usr/bin/env node
/**
 * Gives every active person a Supabase Auth account and links it to their
 * `people` row via auth_uid.
 *
 * This runs ALONGSIDE Firebase, it does not replace it. app_person_id() in the
 * database matches a caller on legacy_firebase_uid OR auth_uid, and
 * app_issuer_ok() trusts tokens from both issuers, so a person can sign in
 * through either and land on the same row with the same permissions. Nobody is
 * locked out at any point.
 *
 * Accounts are created WITHOUT a usable password -- a long random one nobody
 * ever sees. People set their own via the "Forgot password?" link on the login
 * screen, which is the whole point of moving auth here. Until they do, their
 * Firebase password keeps working.
 *
 *   node scripts/provision-auth.cjs            show what would change
 *   node scripts/provision-auth.cjs --apply    create the accounts and link
 *
 * Safe to re-run. Run it again after adding anyone to `people`.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const CFG = fs.readFileSync(path.join(ROOT, 'mentions', 'supabase.txt'), 'utf8');
const URI = (CFG.match(/postgresql:\/\/\S+pooler\.supabase\.com:\d+\/postgres/g) || []).pop();
const URL = (CFG.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0];
const KEY = (CFG.match(/secret key:\s*(\S+)/) || [])[1];
const pad = (s, n) => String(s ?? '').padEnd(n);

if (!URI || !URL || !KEY) throw new Error('mentions/supabase.txt is missing the uri, url or secret key');

const admin = (p, init = {}) =>
  fetch(`${URL}/auth/v1${p}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });

async function listAllUsers() {
  const out = [];
  for (let page = 1; ; page++) {
    const r = await admin(`/admin/users?page=${page}&per_page=200`);
    if (!r.ok) throw new Error(`listUsers ${r.status}: ${await r.text()}`);
    const { users } = await r.json();
    if (!users?.length) break;
    out.push(...users);
    if (users.length < 200) break;
  }
  return out;
}

(async () => {
  const apply = process.argv.includes('--apply');
  const pg = new Client({ connectionString: URI, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000 });
  await pg.connect();

  const people = (await pg.query(
    `select id, full_name, email::text as email, auth_uid, position_id
       from people where status = 'Active' and email is not null order by full_name`)).rows;

  const existing = await listAllUsers();
  const byEmail = new Map(existing.map(u => [String(u.email || '').toLowerCase(), u]));

  console.log(pad('PERSON', 20) + pad('EMAIL', 34) + 'ACTION');
  console.log('-'.repeat(78));

  let created = 0, linked = 0, already = 0;

  for (const p of people) {
    const email = p.email.toLowerCase();
    let user = byEmail.get(email);
    const actions = [];

    if (!user) {
      if (apply) {
        const r = await admin('/admin/users', {
          method: 'POST',
          body: JSON.stringify({
            email,
            // Nobody is told this. It exists only so the account is not
            // passwordless; the real one is set via the reset email.
            password: crypto.randomBytes(24).toString('base64url'),
            email_confirm: true,
            user_metadata: { full_name: p.full_name, person_id: p.id },
          }),
        });
        if (!r.ok) { console.log(pad(p.full_name, 20) + pad(email, 34) + `FAILED ${r.status} ${await r.text()}`); continue; }
        user = await r.json();
      }
      actions.push(apply ? 'account created' : 'would create account');
      created++;
    }

    const uid = user?.id ?? null;
    if (uid && p.auth_uid !== uid) {
      if (apply) await pg.query('update people set auth_uid = $1 where id = $2', [uid, p.id]);
      actions.push(apply ? 'linked' : 'would link');
      linked++;
    } else if (uid && p.auth_uid === uid) {
      actions.push('already linked');
      already++;
    }

    console.log(pad(p.full_name, 20) + pad(email, 34) + actions.join(', '));
  }

  const orphans = existing.filter(u => !people.some(p => p.email.toLowerCase() === String(u.email || '').toLowerCase()));
  console.log('-'.repeat(78));
  console.log(`${created} ${apply ? 'created' : 'to create'}, ${linked} ${apply ? 'linked' : 'to link'}, ${already} already correct.`);
  if (orphans.length)
    console.log(`\n${orphans.length} Supabase account(s) with no active people row (they resolve to nobody and every policy denies them): ` +
      orphans.map(u => u.email).join(', '));
  if (!apply) console.log('\nDry run. Re-run with --apply to make these changes.');
  else console.log('\nPeople set their password with "Forgot password?" on the login screen.\n' +
                   'Their Firebase password keeps working until they do.');

  await pg.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

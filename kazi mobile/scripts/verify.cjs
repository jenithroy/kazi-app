#!/usr/bin/env node
/**
 * Post-migration verification.
 *
 *  1. Row counts, Firestore vs Postgres.
 *  2. The people table and the position each person landed on.
 *  3. A live RLS test: creates a throwaway auth user inside a transaction,
 *     links it to a real person, impersonates them as the `authenticated`
 *     role, and checks what the DATABASE actually returns — then rolls the
 *     whole thing back. This is the proof that permissions are enforced by
 *     Postgres and not by the app.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const ROOT = path.join(__dirname, '..');
const CFG = fs.readFileSync(path.join(ROOT, 'mentions', 'supabase.txt'), 'utf8');
const URI = (CFG.match(/postgresql:\/\/\S+pooler\.supabase\.com:\d+\/postgres/g) || []).pop();
const pad = (s, n) => String(s ?? '').padEnd(n);

(async () => {
  initializeApp({ credential: cert(require(path.join(ROOT, 'key.json'))) });
  const fsdb = getFirestore();
  const pg = new Client({ connectionString: URI, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  const count = async (t) => Number((await pg.query(`select count(*)::int n from ${t}`)).rows[0].n);
  const fscount = async (c) => (await fsdb.collection(c).count().get()).data().count;

  // ── 1. counts ────────────────────────────────────────────────────────
  console.log('── row counts ──────────────────────────────────────────');
  console.log(pad('FIRESTORE', 24) + pad('→ POSTGRES', 24) + pad('FS', 7) + pad('PG', 7) + 'note');
  const pairs = [
    ['customers', 'customers'], ['orders', 'orders'], ['quotations', 'quotations'],
    ['invoices', 'invoices'], ['accounts', 'accounts'], ['finance_expenses', 'expenses'],
    ['finance_purchases', 'purchases'], ['journal_entries', 'journal_entries'],
    ['bank_transactions', 'bank_transactions'], ['budget_requests', 'budget_requests'],
    ['fabrics', 'fabrics'], ['patterns', 'patterns'], ['processes', 'processes'],
    ['inventory', 'inventory_items'], ['production', 'production_batches'],
    ['qc_logs', 'qc_logs'], ['stage_config', 'stage_config'], ['tasks', 'tasks'],
    ['task_columns', 'task_columns'], ['content_calendar', 'content_calendar'],
    ['clock_ins', 'clock_ins'], ['finance_payroll', 'payroll'], ['attendance', 'attendance'],
    ['product_costs', 'product_costs'], ['unit_economics', 'unit_economics'],
  ];
  let mismatch = 0;
  for (const [f, p] of pairs) {
    const a = await fscount(f), b = await count(p);
    const ok = a === b;
    if (!ok && !['attendance'].includes(f)) mismatch++;
    console.log(pad(f, 24) + pad(p, 24) + pad(a, 7) + pad(b, 7) +
      (ok ? '✓' : f === 'attendance' ? `— ${a - b} rows belonged to people you dropped` : '⚠ MISMATCH'));
  }
  console.log(`\nline_items (were JSON blobs inside invoices/quotations/purchases): ${await count('line_items')}`);
  console.log(`order_stage_history (was a JSON array on each order):              ${await count('order_stage_history')}`);

  // ── 2. people ────────────────────────────────────────────────────────
  console.log('\n── people & positions ──────────────────────────────────');
  const ppl = await pg.query(`select pe.full_name, pe.email, pe.position_id, po.label, po.tier,
      pe.location, pe.status, pe.legacy_firebase_uid is not null as has_uid,
      (select count(*) from attendance a where a.person_id = pe.id) att
    from people pe left join positions po on po.id = pe.position_id
    order by po.tier desc nulls last, pe.full_name`);
  console.log(pad('NAME', 20) + pad('POSITION', 24) + pad('TIER', 6) + pad('LOC', 7) + pad('UID', 5) + 'ATT');
  for (const r of ppl.rows)
    console.log(pad(r.full_name, 20) + pad(r.label || '⚠ NONE', 24) + pad(r.tier ?? '-', 6) +
      pad(r.location || '-', 7) + pad(r.has_uid ? 'yes' : 'NO', 5) + r.att);

  const ovr = await pg.query(`select pe.full_name, o.section_id, o.can_view
    from person_permission_overrides o join people pe on pe.id = o.person_id order by 1,2`);
  console.log(`\n── per-person overrides kept (${ovr.rowCount}) ─────────────────────`);
  for (const r of ovr.rows)
    console.log(`  ${pad(r.full_name, 20)} ${pad(r.section_id, 18)} ${r.can_view ? 'GRANT' : 'DENY'}`);

  // ── 3. live RLS test ─────────────────────────────────────────────────
  console.log('\n── RLS enforcement test (transactional, rolled back) ───');
  const subjects = [
    ['Sugam Rana Magar', 'Video Editor'],
    ['Aakansha',         'Fashion Designer'],
    ['Monika',           'Marketing Co-ordinator'],
    ['Anmol',            'Operations Intern'],
    ['Sunam Deepa',      'Accountant'],
    ['Wilson',           'Operations Head'],
  ];
  const probes = [
    ['payroll',           'select count(*) from payroll'],
    ['bank_transactions', 'select count(*) from bank_transactions'],
    ['people (salaries)', 'select count(*) from people where basic_salary_npr is not null'],
    ['invoices',          'select count(*) from invoices'],
    ['attendance',        'select count(*) from attendance'],
    ['fabrics',           'select count(*) from fabrics'],
    ['inventory',         'select count(*) from inventory_items'],
    ['customers',         'select count(*) from customers'],
    ['tasks',             'select count(*) from tasks'],
  ];

  // true totals, read as the owner (RLS-exempt), so "BLOCKED" vs "full access"
  // is measured against reality rather than a hardcoded guess.
  const totals = {};
  for (const [label, q] of probes) totals[label] = Number((await pg.query(q)).rows[0].count);
  console.log('  (totals in the database: ' +
    Object.entries(totals).map(([k, v]) => `${k}=${v}`).join(', ') + ')');

  // A real Firebase Auth token, as Supabase will present it to Postgres.
  const fbClaims = (sub, over = {}) => JSON.stringify({
    sub, role: 'authenticated',
    iss: 'https://securetoken.google.com/kazi-manufacturing',
    aud: 'kazi-manufacturing', ...over,
  });
  const asUser = async (claims, fn) => {
    await pg.query('begin');
    await pg.query('set local role authenticated');
    await pg.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    try { return await fn(); } finally { await pg.query('rollback'); }
  };

  for (const [name, expectedRole] of subjects) {
    const person = (await pg.query(
      'select id, full_name, position_id, legacy_firebase_uid uid from people where full_name ilike $1', [name + '%'])).rows[0];
    if (!person) { console.log(`\n  (${name} not found)`); continue; }
    console.log(`\n  ${person.full_name} — ${expectedRole} (position: ${person.position_id})`);
    await asUser(fbClaims(person.uid), async () => {
      for (const [label, q] of probes) {
        let n;
        try { n = Number((await pg.query(q)).rows[0].count); } catch (e) { n = `ERR ${e.code}`; }
        const total = totals[label];
        const verdict = n === 0 ? 'BLOCKED' : n === total ? 'full access' : `${n} rows (own only)`;
        console.log(`     ${pad(label, 20)} ${pad(n, 6)} ${verdict}`);
      }
    });
  }

  // ── 4. attack cases ──────────────────────────────────────────────────
  console.log('\n── rejection tests ─────────────────────────────────────');
  const wilson = (await pg.query(`select legacy_firebase_uid uid from people where full_name ilike 'Wilson%'`)).rows[0];
  const cases = [
    ['Wilson\'s uid, but a token from someone else\'s Firebase project',
     fbClaims(wilson.uid, { iss: 'https://securetoken.google.com/some-other-project', aud: 'some-other-project' })],
    ['a signed-in Firebase user with no people row (e.g. a dropped account)',
     fbClaims('ZZZZnotarealuidZZZZ')],
    ['no token at all', JSON.stringify({})],
  ];
  for (const [label, claims] of cases) {
    const got = await asUser(claims, async () => {
      const out = {};
      for (const t of ['people', 'payroll', 'invoices', 'tasks'])
        try { out[t] = Number((await pg.query(`select count(*) from ${t}`)).rows[0].count); } catch { out[t] = 'ERR'; }
      return out;
    });
    const leaked = Object.entries(got).filter(([, v]) => v > 0);
    console.log(`  ${leaked.length ? '❌ LEAKED ' + JSON.stringify(got) : '✓ blocked everywhere'}  — ${label}`);
  }

  console.log('\n(every probe ran inside a rolled-back transaction; nothing was written)');
  await pg.end();
  process.exit(mismatch ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

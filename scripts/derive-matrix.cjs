#!/usr/bin/env node
/**
 * Derives the position -> permission matrix from what the people currently
 * holding each position can actually see in the live apps today.
 *
 * It reimplements the web app's own resolution order (kazi-app
 * src/utils/permissions.js): explicit override wins, otherwise the
 * NAV_BY_ROLE default for the person's appRole. That effective set is then
 * rolled up per position.
 *
 *   node scripts/derive-matrix.cjs           print the derived matrix
 *   node scripts/derive-matrix.cjs --apply   write it to Supabase
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const ROOT = path.join(__dirname, '..');
const CFG = fs.readFileSync(path.join(ROOT, 'mentions', 'supabase.txt'), 'utf8');
const URI = (CFG.match(/postgresql:\/\/\S+pooler\.supabase\.com:\d+\/postgres/g) || []).pop();

// ── the reference app's own tables, verbatim ───────────────────────────
const NAV_BY_ROLE = {
  nepal_admin: ['dashboard','tasks','attendance','production','qc','inventory','finance','billing','content','employees','customers','messenger','library','sales','marketing'],
  uk_admin:    ['dashboard','finance','production','billing','content','tasks','directors','customers','admin','messenger','library','sales','employees','marketing'],
  employee:    ['dashboard','tasks','attendance','library'],
  nepal_staff: ['dashboard','tasks','attendance','library','production','qc','inventory','content'],
  super_admin: ['dashboard','tasks','attendance','production','qc','inventory','finance','billing','content','employees','admin','directors','customers','messenger','library','marketing'],
};
const NEPAL_ADMIN_DEFAULT = ['tasks','attendance','production','inventory','library','qc','billing','employees','budget'];
const FIN_TABS = ['expenses','payroll','purchases','vatBills','journal','ledger','pl','balanceSheet','bank','orderPl'];

// web key -> our canonical section id. The web app calls the Budget module
// "content"; our `content` is the content calendar, which is separate.
const SECTION = {
  dashboard:'dashboard', tasks:'tasks', attendance:'attendance', production:'production',
  qc:'quality_control', inventory:'inventory', finance:'finance', billing:'billing',
  content:'budget', budget:'budget', employees:'employees', customers:'customers',
  messenger:'messenger', library:'library', sales:'sales', marketing:'marketing',
  directors:'directors', admin:'admin', order:'orders', orders:'orders',
};
const TAB = { expenses:'expenses', payroll:'payroll', purchases:'purchases', vatBills:'vat_bills',
  journal:'journal', ledger:'ledger', pl:'pl', balanceSheet:'balance_sheet', bank:'bank',
  orderPl:'order_pl', kpi:'kpi' };

// sections every signed-in person gets regardless — these are not gated in
// either app today (a dashboard, your own attendance, raising a bug).
const ALWAYS = ['dashboard','messenger','changelog','bug_report'];

const visible = (u, sec) => {
  const p = u.permissions || {};
  const v = p[sec];
  if (v === false) return false;
  if (v === true || (v && typeof v === 'object')) return true;
  return (NAV_BY_ROLE[u.role] || []).includes(sec);
};
const canEdit = (u, sec) => {
  const p = u.permissions || {};
  const v = p[sec];
  if (v === false) return false;
  if (v === true || (v && typeof v === 'object')) return true;
  if (u.role === 'super_admin') return true;
  if (u.role === 'employee' || u.role === 'nepal_staff') return false;
  if (u.role === 'uk_admin') return ['tasks','library','employees'].includes(sec);
  if (u.role === 'nepal_admin') return NEPAL_ADMIN_DEFAULT.includes(sec);
  return false;
};
const finTab = (u, tab) => {
  const f = (u.permissions || {}).finance;
  if (f && typeof f === 'object') { if (f[tab] === true) return true; if (f[tab] === false) return false; }
  if (f === true) return true;
  if (u.role === 'super_admin' || u.role === 'uk_admin') return true;
  if (u.role === 'nepal_admin') return true;
  return false;
};

(async () => {
  initializeApp({ credential: cert(require(path.join(ROOT, 'key.json'))) });
  const fsdb = getFirestore();
  const pg = new Client({ connectionString: URI, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  // people currently in Supabase, with the position they landed on
  const people = (await pg.query(`select pe.id, pe.full_name, pe.email, pe.position_id, po.label
    from people pe left join positions po on po.id = pe.position_id order by 3`)).rows;
  const users = (await fsdb.collection('users').get()).docs.map(d => d.data());
  const byEmail = new Map();
  for (const u of users) {                      // non-stub record wins, as in the load
    const k = String(u.email || '').toLowerCase().trim();
    if (!k) continue;
    if (!byEmail.has(k) || (!byEmail.get(k).uid && u.uid)) byEmail.set(k, u);
  }

  const allSections = (await pg.query('select id from sections order by sort_order')).rows.map(r => r.id);
  const allTabs = (await pg.query('select id from finance_tabs order by sort_order')).rows.map(r => r.id);

  // ── roll up per position ─────────────────────────────────────────────
  const matrix = {};   // position -> { sec: {view, edit}, tabs: Set, people: [] }
  for (const p of people) {
    if (!p.position_id) continue;
    const u = byEmail.get(String(p.email).toLowerCase().trim());
    const m = (matrix[p.position_id] ||= { label: p.label, sec: {}, tabs: new Set(), people: [] });
    m.people.push(p.full_name);
    if (!u) continue;
    for (const [webKey, ours] of Object.entries(SECTION)) {
      if (!allSections.includes(ours)) continue;
      const v = visible(u, webKey), e = canEdit(u, webKey);
      const cur = (m.sec[ours] ||= { view: false, edit: false });
      cur.view ||= v; cur.edit ||= (v && e);
    }
    for (const t of FIN_TABS) if (finTab(u, t)) m.tabs.add(TAB[t]);
  }
  for (const m of Object.values(matrix))
    for (const s of ALWAYS) (m.sec[s] ||= { view: true, edit: s === 'bug_report' }).view = true;

  // ── report ───────────────────────────────────────────────────────────
  const pad = (s, n) => String(s ?? '').padEnd(n);
  console.log('Derived from the effective access of the people currently in each position.\n');
  for (const [pid, m] of Object.entries(matrix).sort()) {
    const view = Object.entries(m.sec).filter(([, v]) => v.view).map(([k]) => k);
    const edit = Object.entries(m.sec).filter(([, v]) => v.edit).map(([k]) => k);
    console.log(`${m.label}  (${pid})`);
    console.log(`  people : ${m.people.join(', ')}`);
    console.log(`  view   : ${view.sort().join(', ') || '—'}`);
    console.log(`  edit   : ${edit.sort().join(', ') || '—'}`);
    console.log(`  finance: ${[...m.tabs].sort().join(', ') || '—'}`);
    if (m.tabs.has('payroll') && !['accountant','operations-head','managing-director','system-admin','developer','director'].includes(pid))
      console.log(`  ⚠ this position inherits PAYROLL access from its current holder`);
    console.log();
  }

  // positions with nobody in them keep whatever they already have
  const empty = (await pg.query(`select p.id, p.label from positions p
    where not exists (select 1 from people pe where pe.position_id = p.id) order by 1`)).rows;
  console.log(`positions with nobody in them (matrix left as-is): ${empty.map(r => r.id).join(', ')}\n`);

  if (!process.argv.includes('--apply')) { await pg.end(); return; }

  // ── apply ────────────────────────────────────────────────────────────
  await pg.query('begin');
  for (const [pid, m] of Object.entries(matrix)) {
    await pg.query('delete from position_permissions where position_id = $1', [pid]);
    await pg.query('delete from position_finance_tabs where position_id = $1', [pid]);
    for (const [sec, v] of Object.entries(m.sec)) {
      if (!v.view) continue;
      await pg.query(`insert into position_permissions (position_id, section_id, can_view, can_edit)
        values ($1,$2,true,$3)`, [pid, sec, !!v.edit]);
    }
    for (const t of m.tabs)
      await pg.query(`insert into position_finance_tabs (position_id, tab_id, can_view, can_edit)
        values ($1,$2,true,true)`, [pid, t]);
  }
  await pg.query('commit');
  console.log('applied.');
  await pg.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

#!/usr/bin/env node
/**
 * Copies the kazi-manufacturing Firestore into Supabase Postgres.
 *
 * Idempotent-ish: run with --truncate to wipe data tables first (schema and
 * the permission matrix are left alone). Reads Firestore with key.json,
 * writes Postgres over the session pooler, and pushes the base64 images
 * that were inlined in `fabrics` / `patterns` into Supabase Storage.
 *
 *   node scripts/migrate-data.cjs --truncate
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const ROOT = path.join(__dirname, '..');
const CFG = fs.readFileSync(path.join(ROOT, 'mentions', 'supabase.txt'), 'utf8');
const PG_URI = (CFG.match(/postgresql:\/\/\S+pooler\.supabase\.com:\d+\/postgres/g) || []).pop();
const SB_URL = (CFG.match(/https:\/\/\w+\.supabase\.co/) || [])[0];
const SB_KEY = (CFG.match(/sb_secret_\S+/) || [])[0];
const BUCKET = 'product-media';

// ── people we are deliberately NOT bringing across ─────────────────────
// Placeholder/seed accounts that clutter the attendance page, plus one
// leaver. Their attendance and clock-in rows go with them.
const DROP_NAMES = new Set(['utsav pokharel', 'operations intern', 'social media presenter',
  'labour (cutter)', 'labour (stitcher)', 'swostika', 'sudhansu', 'anusha', 'bedhant']);
const DROP_EMAILS = new Set(['kattagang1111@gmail.com', 'crrishav123@gmail.com',
  'anushapantaa@gmail.com', 'bedantrana@gmail.com']);

// ── job title → position id ────────────────────────────────────────────
const POSITION = {
  'system admin': 'system-admin', 'developer': 'developer',
  'director': 'director', 'managing director': 'managing-director',
  'operations head': 'operations-head', 'operations manager': 'operations-manager',
  'management': 'management', 'accountant': 'accountant',
  'marketing co-ordinator': 'marketing-coordinator',
  'marketing co-ordinator / client service': 'marketing-coordinator',
  'marketing coordinator': 'marketing-coordinator',
  'content coordinator': 'content-coordinator', 'content editor': 'content-coordinator',
  'fashion designer': 'fashion-designer', 'jr. fashion designer': 'jr-fashion-designer',
  'video editor': 'video-editor', 'social media presenter': 'social-media-presenter',
  'operations intern': 'operations-intern', 'fashion intern': 'fashion-intern',
  'operations assistant': 'operations-assistant', 'operations': 'operations-assistant',
  'labour': 'labour',
};
const toPosition = (t) => POSITION[String(t || '').trim().toLowerCase()] || null;

// ── value coercion ─────────────────────────────────────────────────────
const S = (v) => { const s = v == null ? null : String(v).trim(); return s === '' ? null : s; };
const N = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const B = (v) => v === true || v === 'true';
const TS = (v) => {
  if (!v) return null;
  if (v._seconds !== undefined) return new Date(v._seconds * 1000).toISOString();
  if (v.toDate) return v.toDate().toISOString();
  const d = new Date(v); return isNaN(d) ? null : d.toISOString();
};
const D = (v) => {                                   // → YYYY-MM-DD or null
  if (!v) return null;
  if (typeof v === 'object') { const t = TS(v); return t ? t.slice(0, 10) : null; }
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/); if (m) return m[1];
  const d = new Date(v); return isNaN(d) ? null : d.toISOString().slice(0, 10);
};
const TIME = (v) => { const m = String(v || '').match(/^(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null; };
const ARR = (v) => Array.isArray(v) ? v.filter(x => typeof x === 'string') : null;

const stats = {};
const note = (k, n = 1) => { stats[k] = (stats[k] || 0) + n; };

// ── storage ────────────────────────────────────────────────────────────
async function ensureBucket() {
  const r = await fetch(`${SB_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (!r.ok && r.status !== 409) {
    const t = await r.text();
    if (!/already exists|Duplicate/i.test(t)) throw new Error(`bucket: ${r.status} ${t}`);
  }
}

/** data:image/...;base64,xxx  →  a real file in Storage; returns its public URL */
async function uploadDataUri(dataUri, objectPath) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUri || '');
  if (!m) return S(dataUri);                        // already a URL, or junk — pass through
  const [, mime, b64] = m;
  const buf = Buffer.from(b64, 'base64');
  const ext = (mime.split('/')[1] || 'bin').replace('jpeg', 'jpg');
  const key = `${objectPath}.${ext}`;
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${key}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, 'content-type': mime, 'x-upsert': 'true' },
    body: buf,
  });
  if (!r.ok) throw new Error(`upload ${key}: ${r.status} ${await r.text()}`);
  note('images uploaded');
  note('image bytes', buf.length);
  return `${SB_URL}/storage/v1/object/public/${BUCKET}/${key}`;
}

// ── main ───────────────────────────────────────────────────────────────
(async () => {
  initializeApp({ credential: cert(require(path.join(ROOT, 'key.json'))) });
  const fsdb = getFirestore();
  const pg = new Client({ connectionString: PG_URI, ssl: { rejectUnauthorized: false }, statement_timeout: 600000 });
  await pg.connect();
  const get = async (c) => (await fsdb.collection(c).get()).docs.map(d => ({ _id: d.id, ...d.data() }));
  const ins = async (sql, vals) => (await pg.query(sql, vals)).rows[0]?.id;

  if (process.argv.includes('--truncate')) {
    await pg.query(`truncate people, attendance, clock_ins, payroll, customers, orders,
      order_stage_history, order_notes, quotations, invoices, line_items, accounts, expenses,
      purchases, journal_entries, bank_transactions, budget_requests, unit_economics,
      product_costs, fabrics, patterns, processes, inventory_items, production_batches,
      qc_logs, stage_config, task_columns, tasks, content_calendar, content_posts, messages,
      counters, person_permission_overrides restart identity cascade`);
    console.log('data tables truncated\n');
  }
  await ensureBucket();

  // ══ people ═══════════════════════════════════════════════════════════
  const users = await get('users');
  const emps = await get('employees');
  const key = (e) => String(e || '').toLowerCase().trim();
  const dropped = [];

  // one bucket per email; the record holding a real Firebase uid wins,
  // because attendance/clock_ins were keyed on that uid.
  const byEmail = new Map();
  for (const u of users) {
    const e = key(u.email); if (!e) continue;
    const prev = byEmail.get(e);
    if (!prev) byEmail.set(e, u);
    else if (!prev.uid && u.uid) { byEmail.set(e, u); note('duplicate users resolved'); }
    else if (prev.uid && u.uid) note('duplicate users resolved');
    else note('duplicate users resolved');
  }
  const empByEmail = new Map(emps.map(e => [key(e.email), e]));
  for (const [e, emp] of empByEmail) if (!byEmail.has(e)) byEmail.set(e, { email: emp.email, name: emp.name });

  const personIdByEmail = new Map();
  const personIdByUid = new Map();
  for (const [email, u] of byEmail) {
    const emp = empByEmail.get(email) || {};
    const name = S(u.name) || S(emp.name) || email;
    if (DROP_NAMES.has(key(name)) || DROP_EMAILS.has(email)) { dropped.push(name); continue; }
    // prefer the specific app-facing job title; employees.role is often just
    // "Operations" / "Management" which maps to nothing useful.
    const position = toPosition(u.jobRole) || toPosition(emp.role) || null;
    if (!position) note(`⚠ unmapped position: ${S(u.jobRole) || S(emp.role) || '(none)'}`);
    const id = await ins(`insert into people (auth_uid, legacy_firebase_uid, email, full_name,
        position_id, location, department, status, phone, address, basic_salary_npr,
        bank_name, bank_branch, bank_account, pan_number, join_date, is_production_worker,
        schedule_start, schedule_end, schedule_working_days, schedule_day_overrides,
        schedule_note, created_at)
      values (null,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
              coalesce($22, now())) returning id`,
      [S(u.uid), email, name, position, S(u.location) || S(emp.location), S(emp.department),
       S(emp.status) || 'Active', S(emp.phone), S(emp.address), N(emp.basicSalaryNPR),
       S(emp.bankName), S(emp.bankBranch), S(emp.bankAccount), S(emp.panNumber), D(emp.joinDate),
       B(emp.isProductionWorker), TIME(emp.scheduleStart), TIME(emp.scheduleEnd),
       ARR(emp.scheduleWorkingDays), emp.scheduleDayOverrides ? JSON.stringify(emp.scheduleDayOverrides) : null,
       S(emp.scheduleNote), TS(u.createdAt || emp.createdAt)]);
    personIdByEmail.set(email, id);
    if (u.uid) personIdByUid.set(u.uid, id);
    note('people');
  }
  // name → id, for the many collections that reference people by display name
  const personByName = new Map();
  for (const [email, id] of personIdByEmail) {
    const u = byEmail.get(email);
    const emp = empByEmail.get(email) || {};
    for (const n of [u.name, emp.name]) if (S(n)) personByName.set(key(n), id);
  }
  const pidFor = (staffId, staffName) =>
    personIdByUid.get(staffId) || personByName.get(key(staffName)) || null;

  // carry the old per-person grants across as explicit overrides, but ONLY
  // where they still differ from the new position default — otherwise the
  // matrix is silently defeated by 21 rows of legacy exceptions.
  const SECTION_ALIAS = { qc: 'quality_control', employees: 'employees', budget: 'budget',
    library: 'library', content: 'content', admin: 'admin', order: 'orders' };
  let kept = 0, discarded = 0;
  for (const [email, u] of byEmail) {
    const pid = personIdByEmail.get(email); if (!pid || !u.permissions) continue;
    for (const [rawSec, val] of Object.entries(u.permissions)) {
      if (typeof val !== 'boolean') continue;
      const sec = SECTION_ALIAS[rawSec] || rawSec;
      const ok = await pg.query('select 1 from sections where id=$1', [sec]);
      if (!ok.rowCount) continue;
      const def = await pg.query(`select pp.can_view from people pe
        join position_permissions pp on pp.position_id = pe.position_id
        where pe.id=$1 and pp.section_id=$2`, [pid, sec]);
      const current = def.rows[0]?.can_view ?? false;
      if (current === val) { discarded++; continue; }          // matrix already agrees
      // Deliberately NOT re-granted: the position matrix is the source of
      // truth now, and carrying these over would recreate the exact drift
      // this migration exists to remove (see 0006). Logged, not applied.
      await pg.query(`insert into permission_drift_log (person_name, section_id, had_access)
        select full_name, $2, $3 from people where id = $1`, [pid, sec, val]);
      kept++;
    }
  }
  note('permission drift logged (not re-granted)', kept);
  note('legacy grants the new matrix already covers', discarded);

  // ══ attendance / clock-ins / payroll ═════════════════════════════════
  for (const a of await get('attendance')) {
    const pid = pidFor(a.staffId, a.staffName);
    if (!pid) { note('attendance skipped (person not migrated)'); continue; }
    await pg.query(`insert into attendance (person_id, date, status, hours, late_minutes,
        late_cut_applied, note, logged_by, legacy_staff_id, legacy_staff_name, legacy_role, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,coalesce($12,now()))
      on conflict (person_id, date) do nothing`,
      [pid, D(a.date), S(a.status) || 'Present', N(a.hours) || 0, N(a.lateMinutes) || 0,
       B(a.lateCutApplied), S(a.note), S(a.loggedBy), S(a.staffId), S(a.staffName), S(a.role), TS(a.createdAt)]);
    note('attendance');
  }
  for (const c of await get('clock_ins')) {
    const pid = pidFor(c.staffId, c.staffName);
    if (!pid) { note('clock_ins skipped (person not migrated)'); continue; }
    await pg.query(`insert into clock_ins (person_id, date, clocked_in_at, clocked_out_at, worked_hours,
        lat, lng, accuracy_m, distance_to_site_m, bypass_used, legacy_staff_id, legacy_staff_name, legacy_role)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [pid, D(c.date), TS(c.clockedInAt), TS(c.clockedOutAt), N(c.workedHours), N(c.lat), N(c.lng),
       N(c.accuracyM), N(c.distanceToSiteM), B(c.bypassUsed), S(c.staffId), S(c.staffName), S(c.role)]);
    note('clock_ins');
  }
  for (const p of await get('finance_payroll')) {
    await pg.query(`insert into payroll (person_id, month, year, basic_npr, salary_npr, bonus_npr,
        overtime_npr, deduction_npr, pf_deduction_npr, late_deduction_npr, late_days, late_cuts_count,
        total_deductions_npr, gross_npr, net_npr, note, logged_by, legacy_staff_id, legacy_staff_name, legacy_role)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [pidFor(p.staffId, p.staffName), S(p.month) || '?', N(p.year) || 0, N(p.basicNPR) || 0, N(p.salaryNPR),
       N(p.bonusNPR) || 0, N(p.overtimeNPR) || 0, N(p.deductionNPR) || 0, N(p.pfDeductionNPR) || 0,
       N(p.lateDeductionNPR) || 0, N(p.lateDays) || 0, N(p.lateCutsCount) || 0,
       N(p.totalDeductionsNPR) || 0, N(p.grossNPR) || 0, N(p.netNPR) || 0, S(p.note), S(p.loggedBy),
       S(p.staffId), S(p.staffName), S(p.role)]);
    note('payroll');
  }

  // ══ customers & orders ═══════════════════════════════════════════════
  const custByName = new Map();
  for (const c of await get('customers')) {
    const id = await ins(`insert into customers (name, contact_person, email, phone, address, city, country, notes, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9,now())) returning id`,
      [S(c.name) || '(unnamed)', S(c.contactPerson), S(c.email), S(c.phone), S(c.address), S(c.city), S(c.country), S(c.notes), TS(c.createdAt)]);
    custByName.set(key(c.name), id); note('customers');
  }
  for (const o of await get('orders')) {
    const oid = await ins(`insert into orders (order_no, customer_id, customer_name, style_name, colorway,
        fabric_type, quantity, price_per_pc_npr, total_value_npr, fabric_cost_per_pc_npr, fabric_grams_used,
        fabric_required_per_pc, material_cost_total_npr, stage, status, order_date, delivery_date,
        assigned_to, invoice_ref, sample_name, notes, created_by, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,coalesce($23,now()))
      returning id`,
      [S(o.orderId), custByName.get(key(o.customerName)) || null, S(o.customerName), S(o.styleName),
       S(o.colorway), S(o.fabricType), N(o.quantity) || 0, N(o.pricePerPcNPR) || 0, N(o.totalValueNPR) || 0,
       N(o.fabricCostPerPcNPR), N(o.fabricGramsUsed), N(o.fabricRequiredPerPc), N(o.materialCostTotalNPR),
       S(o.stage), S(o.status), D(o.date), D(o.deliveryDate), personByName.get(key(o.assignedTo)) || null,
       S(o.invoiceRef) || S(o.invoiceNumber), S(o.sampleName), S(o.notes), S(o.createdBy), TS(o.createdAt)]);
    note('orders');
    (Array.isArray(o.stageHistory) ? o.stageHistory : []).forEach(() => {});
    let seq = 0;
    for (const h of (Array.isArray(o.stageHistory) ? o.stageHistory : [])) {
      await pg.query(`insert into order_stage_history (order_id, stage, changed_at, changed_by, seq)
        values ($1,$2,$3,$4,$5)`, [oid, S(h.stage) || '?', D(h.date), S(h.by), seq++]);
      note('order stage history');
    }
    for (const n of (Array.isArray(o.notesList) ? o.notesList : [])) {
      await pg.query(`insert into order_notes (order_id, text, author) values ($1,$2,$3)`,
        [oid, S(n.text) || '', S(n.by) || S(n.author)]);
      note('order notes');
    }
  }

  // ══ billing ══════════════════════════════════════════════════════════
  const lineOf = (it, i) => [i, S(it.description), S(it.particulars), N(it.qty ?? it.quantity),
    S(it.unit), N(it.rate), N(it.amount ?? it.total)];

  for (const q of await get('quotations')) {
    const id = await ins(`insert into quotations (quotation_no, client_name, client_address, client_phone,
        client_pan, currency, quote_date, valid_until, subtotal_npr, discount_pct, discount_amt_npr,
        taxable_amt_npr, vat_amount_npr, total_npr, status, terms, note, related_invoice,
        created_by, updated_by, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,coalesce($21,now()),coalesce($22,now()))
      returning id`,
      [S(q.quotationNumber), S(q.clientName), S(q.clientAddress), S(q.clientPhone), S(q.clientPAN),
       S(q.currency) || 'NPR', D(q.date), D(q.validUntil), N(q.subtotalNPR) || 0, N(q.discountPct) || 0,
       N(q.discountAmtNPR) || 0, N(q.taxableAmtNPR) || 0, N(q.vatAmountNPR) || 0, N(q.totalNPR) || 0,
       S(q.status), S(q.terms), S(q.note), S(q.relatedInvoice), S(q.createdBy), S(q.updatedBy),
       TS(q.createdAt), TS(q.updatedAt)]);
    note('quotations');
    let i = 0;
    for (const it of (Array.isArray(q.items) ? q.items : [])) {
      await pg.query(`insert into line_items (quotation_id, seq, description, particulars, qty, unit, rate, amount)
        values ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, ...lineOf(it, i++)]);
      note('line items');
    }
  }

  const orderByNo = new Map((await pg.query('select id, order_no from orders')).rows.map(r => [r.order_no, r.id]));
  for (const v of await get('invoices')) {
    const id = await ins(`insert into invoices (invoice_no, linked_order_id, client_name, client_address,
        client_phone, client_pan, currency, invoice_date, due_date, fiscal_year, apply_vat, subtotal_npr,
        discount_pct, discount_amt_npr, taxable_amt_npr, vat_amount_npr, total_npr, amount_paid, status,
        payment_terms, payment_type, bank_name, related_quotation, related_challan, challan_number, note,
        created_by, updated_by, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
              $26,$27,$28,coalesce($29,now()),coalesce($30,now())) returning id`,
      [S(v.invoiceNumber), orderByNo.get(S(v.invoiceRef)) || null, S(v.clientName), S(v.clientAddress),
       S(v.clientPhone), S(v.clientPAN), S(v.currency) || 'NPR', D(v.date), D(v.dueDate), S(v.fiscalYear),
       B(v.applyVAT), N(v.subtotalNPR) || 0, N(v.discountPct) || 0, N(v.discountAmtNPR) || 0,
       N(v.taxableAmtNPR) || 0, N(v.vatAmountNPR) || 0, N(v.totalNPR) || 0, N(v.amountPaid) || 0,
       S(v.status), S(v.paymentTerms), S(v.paymentType), S(v.bankName), S(v.relatedQuotation),
       S(v.relatedChallan), S(v.challanNumber), S(v.note), S(v.createdBy), S(v.updatedBy),
       TS(v.createdAt), TS(v.updatedAt)]);
    note('invoices');
    let i = 0;
    for (const it of (Array.isArray(v.items) ? v.items : [])) {
      await pg.query(`insert into line_items (invoice_id, seq, description, particulars, qty, unit, rate, amount)
        values ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, ...lineOf(it, i++)]);
      note('line items');
    }
  }

  // ══ finance ══════════════════════════════════════════════════════════
  for (const a of await get('accounts')) {
    await pg.query(`insert into accounts (name, type, is_bank, opening_balance_npr, created_at)
      values ($1,$2,$3,$4,coalesce($5,now())) on conflict (name) do nothing`,
      [S(a.name) || '(unnamed)', S(a.type) || 'Other', B(a.isBank), N(a.openingBalanceNPR) || 0, TS(a.createdAt)]);
    note('accounts');
  }
  for (const e of await get('finance_expenses')) {
    await pg.query(`insert into expenses (expense_date, category, amount_npr, note, status, vat_bill, logged_by, created_at)
      values (coalesce($1, current_date),$2,$3,$4,$5,$6,$7,coalesce($8,now()))`,
      [D(e.date), S(e.category), N(e.amountNPR) || 0, S(e.note), S(e.status), B(e.vatBill), S(e.loggedBy), TS(e.createdAt)]);
    note('expenses');
  }
  for (const p of await get('finance_purchases')) {
    const id = await ins(`insert into purchases (expense_ref, purchase_date, expense_item, category,
        amount_npr, subtotal_npr, discount_amt, taxable_amt, vat_amount_npr, vat_bill, payment_type,
        bank_name, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,coalesce($13,now())) returning id`,
      [S(p.expenseId), D(p.date), S(p.expenseItem), S(p.category), N(p.amountNPR) || 0, N(p.subtotalNPR),
       N(p.discountAmt), N(p.taxableAmt), N(p.vatAmountNPR), p.vatBill == null ? null : B(p.vatBill),
       S(p.paymentType), S(p.bankName), TS(p.createdAt)]);
    note('purchases');
    let i = 0;
    for (const it of (Array.isArray(p.items) ? p.items : [])) {
      await pg.query(`insert into line_items (purchase_id, seq, description, particulars, qty, unit, rate, amount)
        values ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, ...lineOf(it, i++)]);
      note('line items');
    }
  }
  for (const j of await get('journal_entries')) {
    await pg.query(`insert into journal_entries (entry_date, debit_account, credit_account, amount_npr,
        description, reference, created_by, created_at)
      values (coalesce($1,current_date),$2,$3,$4,$5,$6,$7,coalesce($8,now()))`,
      [D(j.date), S(j.debitAccount), S(j.creditAccount), N(j.amountNPR) || 0, S(j.description), S(j.reference), S(j.createdBy), TS(j.createdAt)]);
    note('journal entries');
  }
  for (const b of await get('bank_transactions')) {
    await pg.query(`insert into bank_transactions (txn_at, txn_date_text, type, amount, balance, description, remarks, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,coalesce($8,now()))`,
      [TS(b.timestamp), S(b.date), S(b.type), N(b.amount) || 0, N(b.balance), S(b.description), S(b.remarks), TS(b.createdAt)]);
    note('bank transactions');
  }
  for (const b of await get('budget_requests')) {
    await pg.query(`insert into budget_requests (br_ref, title, type, category, urgency, quantity, notes,
        amount, amount_npr, amount_gbp, status, requested_by_id, requested_by, requested_by_role,
        reviewed_by, reviewed_at, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,coalesce($17,now()))`,
      [S(b.brId), S(b.title) || '(untitled)', S(b.type), S(b.category), S(b.urgency), S(b.quantity), S(b.notes),
       N(b.amount), N(b.amountNPR), N(b.amountGBP), S(b.status) || 'Pending',
       personByName.get(key(b.requestedBy)) || null, S(b.requestedBy), S(b.requestedByRole),
       S(b.reviewedBy), TS(b.reviewedAt), TS(b.createdAt)]);
    note('budget requests');
  }
  for (const u of await get('unit_economics')) {
    const { _id, ...rest } = u;
    await pg.query('insert into unit_economics (data) values ($1)', [JSON.stringify(rest)]);
    note('unit economics');
  }
  for (const c of await get('product_costs')) {
    await pg.query(`insert into product_costs (code, name, fabric, labour, rib, trims, others, total, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (code) do nothing`,
      [S(c.code) || c._id, S(c.name) || '(unnamed)', N(c.fabric) || 0, N(c.labour) || 0, N(c.rib) || 0,
       N(c.trims) || 0, N(c.others) || 0, N(c.total), TS(c.updatedAt)]);
    note('product costs');
  }

  // ══ product library (images out of the DB and into Storage) ══════════
  for (const f of await get('fabrics')) {
    const url = await uploadDataUri(f.swatchImageUrl, `fabrics/${f._id}-swatch`);
    await pg.query(`insert into fabrics (name, type, composition, supplier, gsm, weight, price_per_meter,
        price_per_kg, available_colors, status, notes, swatch_image_url, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,coalesce($13,now()),coalesce($14,now()))`,
      [S(f.name) || '(unnamed)', S(f.type), S(f.composition), S(f.supplier), N(f.gsm), S(f.weight),
       N(f.price_per_meter), N(f.pricePerKg), ARR(f.available_colors), S(f.status), S(f.notes), url,
       TS(f.createdAt), TS(f.updatedAt)]);
    note('fabrics');
  }
  for (const p of await get('patterns')) {
    const front = await uploadDataUri(p.frontSketchUrl, `patterns/${p._id}-front`);
    const back = await uploadDataUri(p.backSketchUrl, `patterns/${p._id}-back`);
    const tech = await uploadDataUri(p.tech_pack_url, `patterns/${p._id}-techpack`);
    const extra = [];
    let i = 0;
    for (const img of (Array.isArray(p.tech_pack_images) ? p.tech_pack_images : []))
      extra.push(await uploadDataUri(img, `patterns/${p._id}-tp${i++}`));
    await pg.query(`insert into patterns (style_no, name, product_type, category, season, market,
        designer_name, sizes_available, available_colors, spec_size, spec_date, trims, wash_care,
        remarks, notes, measurements, fabric_rows, front_sketch_url, back_sketch_url, tech_pack_url,
        tech_pack_images, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
              coalesce($22,now()),coalesce($23,now()))`,
      [S(p.styleNo), S(p.name) || '(unnamed)', S(p.product_type), S(p.category), S(p.season), S(p.market),
       S(p.designerName), ARR(p.sizes_available), S(p.available_colors), S(p.specSize), D(p.specDate),
       S(p.trims), S(p.washCare), S(p.remarks), S(p.notes),
       JSON.stringify(p.measurements || []), JSON.stringify(p.fabricRows || []),
       front, back, tech, extra.filter(Boolean), TS(p.createdAt), TS(p.updatedAt)]);
    note('patterns');
  }
  for (const p of await get('processes')) {
    await pg.query(`insert into processes (name, category, description, notes, cost_per_unit,
        lead_time_days, min_quantity, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,coalesce($8,now()),coalesce($9,now()))`,
      [S(p.name) || '(unnamed)', S(p.category), S(p.description), S(p.notes), N(p.cost_per_unit) || 0,
       N(p.lead_time_days) || 0, N(p.min_quantity) || 1, TS(p.createdAt), TS(p.updatedAt)]);
    note('processes');
  }

  // ══ operations ═══════════════════════════════════════════════════════
  for (const i of await get('inventory')) {
    await pg.query(`insert into inventory_items (item_ref, item, category, unit, supplier, location,
        condition, owner, opening_stock, stock_in, stock_used, min_level, unit_cost_npr, size_rows,
        damage_log, last_updated, created_by, updated_by, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,coalesce($19,now()))`,
      [S(i.itemId), S(i.item) || '(unnamed)', S(i.category), S(i.unit), S(i.supplier), S(i.location),
       S(i.condition), S(i.owner), N(i.openingStock) || 0, N(i.stockIn) || 0, N(i.stockUsed) || 0,
       N(i.minLevel) || 0, N(i.unitCostNPR) || 0, JSON.stringify(i.sizeRows || []),
       JSON.stringify(i.damageLog || []), D(i.lastUpdated), S(i.createdBy), S(i.updatedBy), TS(i.createdAt)]);
    note('inventory items');
  }
  for (const p of await get('production')) {
    await pg.query(`insert into production_batches (batch_ref, batch_date, cut, stitched, passed, rejected, note, logged_by, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9,now())) on conflict (batch_ref) do nothing`,
      [S(p.batchId) || p._id, D(p.date), N(p.cut) || 0, N(p.stitched) || 0, N(p.passed) || 0, N(p.rejected) || 0, S(p.note), S(p.loggedBy), TS(p.createdAt)]);
    note('production batches');
  }
  for (const q of await get('qc_logs')) {
    await pg.query(`insert into qc_logs (qc_ref, batch_ref, log_date, inspected, passed, rejected, defect_type, action, checked_by, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10,now()))`,
      [S(q.qcId), S(q.batchId), D(q.date), N(q.inspected) || 0, N(q.passed) || 0, N(q.rejected) || 0, S(q.defectType), S(q.action), S(q.checkedBy), TS(q.createdAt)]);
    note('qc logs');
  }
  for (const s of await get('stage_config')) {
    await pg.query(`insert into stage_config (stage, enabled, sort_order, timeout_hours, worker_names, worker_uids)
      values ($1,$2,$3,$4,$5,$6) on conflict (stage) do nothing`,
      [S(s.stage) || s._id, s.enabled !== false, N(s.order) || 0, N(s.timeoutHours) || 0,
       ARR(s.workerNames) || [], ARR(s.workerUids) || []]);
    note('stage config');
  }

  // ══ tasks, content, messages ═════════════════════════════════════════
  for (const c of await get('task_columns')) {
    await pg.query('insert into task_columns (label, sort_order, tone) values ($1,$2,$3)',
      [S(c.label) || '?', N(c.order) || 0, S(c.tone)]);
    note('task columns');
  }
  for (const t of await get('tasks')) {
    await pg.query(`insert into tasks (title, description, notes, status, priority, category,
        assignee_id, assignee, customer, order_ref, due_date, created_by, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,coalesce($13,now()))`,
      [S(t.title) || '(untitled)', S(t.description), S(t.notes), S(t.status), S(t.priority), S(t.category),
       personByName.get(key(t.assignee)) || null, S(t.assignee), S(t.customer), S(t.orderRef),
       D(t.dueDate), S(t.createdBy), TS(t.createdAt)]);
    note('tasks');
  }
  for (const c of await get('content_calendar')) {
    await pg.query(`insert into content_calendar (title, type, status, scheduled_date, time_slot, notes, media_url, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,coalesce($8,now()))`,
      [S(c.title) || '(untitled)', S(c.type), S(c.status), D(c.scheduledDate), S(c.timeSlot), S(c.notes), S(c.mediaUrl), TS(c.createdAt)]);
    note('content calendar');
  }
  for (const c of await get('content')) {
    await pg.query(`insert into content_posts (topic, content_type, platform, status, post_date, created_by, created_at)
      values ($1,$2,$3,$4,$5,$6,coalesce($7,now()))`,
      [S(c.topic), S(c.contentType), S(c.platform), S(c.status), D(c.date), S(c.createdBy), TS(c.createdAt)]);
    note('content posts');
  }
  for (const m of await get('messages')) {
    await pg.query('insert into messages (sender_id, legacy_sender_id, text, sent_at) values ($1,$2,$3,coalesce($4,now()))',
      [personIdByUid.get(m.senderId) || null, S(m.senderId), S(m.text) || '', TS(m.timestamp)]);
    note('messages');
  }
  for (const c of await get('counters')) {
    await pg.query(`insert into counters (id, next_invoice, next_quotation) values ($1,$2,$3)
      on conflict (id) do nothing`, [c._id, N(c.nextInvoice) || 1, N(c.nextQuotation) || 1]);
    note('counters');
  }

  // ══ report ═══════════════════════════════════════════════════════════
  console.log('\n── migrated ─────────────────────────────');
  for (const [k, v] of Object.entries(stats).filter(([k]) => !k.startsWith('⚠') && k !== 'image bytes'))
    console.log(`  ${k.padEnd(46)} ${v}`);
  if (stats['image bytes']) console.log(`  ${'image payload moved to Storage'.padEnd(46)} ${(stats['image bytes'] / 1048576).toFixed(2)} MB`);
  const warns = Object.keys(stats).filter(k => k.startsWith('⚠'));
  if (warns.length) { console.log('\n── warnings ─────────────────────────────'); warns.forEach(w => console.log(`  ${w} (${stats[w]})`)); }
  console.log(`\n── not migrated (by your instruction) ───\n  ${dropped.join(', ') || '(none)'}`);
  await pg.end();
  process.exit(0);
})().catch(e => { console.error('\nERR', e.message, '\n', e.stack?.split('\n')[1] || ''); process.exit(1); });

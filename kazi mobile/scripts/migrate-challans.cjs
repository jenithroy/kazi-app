#!/usr/bin/env node
/**
 * Challans were the one billing collection `migrate-data.cjs` never carried
 * across — the `challans` table and the `fs_challans` compat view exist, but
 * they were empty, so the mobile app was still showing seeded mock challans.
 *
 * Copies every Firestore `challans` doc (and its `items`) into Postgres.
 * Idempotent: a challan already present under the same `challan_no` is skipped.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const ROOT = path.join(__dirname, '..');
const CFG = fs.readFileSync(path.join(ROOT, 'mentions', 'supabase.txt'), 'utf8');
const URI = (CFG.match(/postgresql:\/\/\S+pooler\.supabase\.com:\d+\/postgres/g) || []).pop();

const S = (v) => (v === undefined || v === null ? null : String(v));
const N = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const TS = (v) => (v && typeof v._seconds === 'number' ? new Date(v._seconds * 1000).toISOString() : null);

(async () => {
  initializeApp({ credential: cert(require(path.join(ROOT, 'key.json'))) });
  const fsdb = getFirestore();
  const pg = new Client({ connectionString: URI, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const snap = await fsdb.collection('challans').get();
  let inserted = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const number = S(d.challanNumber) || `CH-${doc.id.slice(0, 6)}`;
    const exists = await pg.query('select 1 from challans where challan_no = $1', [number]);
    if (exists.rowCount) {
      skipped += 1;
      continue;
    }

    const res = await pg.query(
      `insert into challans (
         challan_no, client_name, client_address, client_phone, client_pan, currency,
         challan_date, fiscal_year, subtotal_npr, discount_pct, discount_amt_npr,
         taxable_amt_npr, vat_amount_npr, total_npr, status, vehicle_no, driver_name,
         route_from, route_to, related_invoice, note, created_by, updated_by,
         created_at, updated_at, discount_mode, discount_flat_amt, region
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
                 coalesce($24::timestamptz, now()), coalesce($25::timestamptz, now()),$26,$27,$28)
       returning id`,
      [
        number, S(d.clientName) ?? '', S(d.clientAddress), S(d.clientPhone), S(d.clientPAN),
        S(d.currency) || 'NPR', S(d.date), S(d.fiscalYear), N(d.subtotalNPR), N(d.discountPct),
        N(d.discountAmtNPR), N(d.taxableAmtNPR), N(d.vatAmountNPR), N(d.totalNPR),
        S(d.status) || 'Draft', S(d.vehicleNo), S(d.driverName), S(d.routeFrom), S(d.routeTo),
        S(d.relatedInvoice), S(d.note), S(d.createdBy), S(d.updatedBy),
        TS(d.createdAt), TS(d.updatedAt), S(d.discountMode) || 'pct', N(d.discountFlatAmt), S(d.region),
      ],
    );
    const id = res.rows[0].id;

    const items = Array.isArray(d.items) ? d.items : [];
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i] || {};
      await pg.query(
        `insert into line_items (challan_id, seq, description, particulars, qty, unit, rate, amount)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, i, S(it.description), S(it.particulars), N(it.qty), S(it.unit) || 'Pcs', N(it.rate), N(it.qty) * N(it.rate)],
      );
    }
    inserted += 1;
    console.log(`  + ${number} · ${S(d.clientName)} · ${items.length} line(s)`);
  }

  const total = await pg.query('select count(*)::int n from challans');
  console.log(`\nchallans: ${inserted} inserted, ${skipped} already present · ${total.rows[0].n} rows in Postgres`);
  await pg.end();
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

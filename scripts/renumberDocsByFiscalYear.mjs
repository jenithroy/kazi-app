#!/usr/bin/env node
/**
 * One-off: renumber invoices, challans and quotations so each Nepali fiscal
 * year runs a clean 1..N sequence (INV-001, INV-002, …) ordered by document
 * date. From migration 0030 on, new documents are numbered this way already;
 * this rewrites the history that was raised under the old all-time counter.
 *
 * The fiscal year of each document is computed from its own Bikram Sambat date
 * (Shrawan 1 → next Asar end), NOT from the Gregorian month, so a document
 * dated early-to-mid July lands in the correct year.
 *
 * Connection: mentions/supabase.txt (gitignored) — the session-pooler URI,
 * same as scripts/migrate.cjs.
 *
 *   node scripts/renumberDocsByFiscalYear.mjs            dry run — prints every change
 *   node scripts/renumberDocsByFiscalYear.mjs --commit   apply, in one transaction
 *
 * NOT rewritten (loose text references — review by hand if you rely on them):
 *   • orders.invoice_ref / production order "Ref:" labels
 *   • invoices.related_challan / related_quotation, challans.related_invoice,
 *     quotations.related_invoice
 *   • stock ledger notes ("Invoice INV-050")
 *   • Finance ledger deep-link search keys
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import * as NDC from "nepali-date-converter";

// The package ships a UMD build with no "exports" map; under raw Node ESM the
// default import lands on the CJS namespace, so the constructor is one hop in.
const NepaliDate = NDC.default?.default || NDC.default || NDC;

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CFG = fs.readFileSync(path.join(ROOT, "mentions", "supabase.txt"), "utf8");
const URI = (CFG.match(/postgresql:\/\/\S+pooler\.supabase\.com:\d+\/postgres/g) || []).pop();
if (!URI) throw new Error("no session-pooler URI in mentions/supabase.txt");

const COMMIT = process.argv.includes("--commit");
const SHRAWAN_IDX = 3; // fiscal year starts Shrawan 1

const DOCS = [
  { kind: "invoice",   table: "invoices",   numCol: "invoice_no",   dateCol: "invoice_date", prefix: "INV" },
  { kind: "challan",    table: "challans",   numCol: "challan_no",   dateCol: "challan_date", prefix: "CH"  },
  { kind: "quotation",  table: "quotations", numCol: "quotation_no", dateCol: "quote_date",   prefix: "QT"  },
];

// AD ISO ("YYYY-MM-DD") -> fiscal-year label ("2082/83"), or null.
function fiscalYearForDate(adIso) {
  if (!adIso) return null;
  const [y, m, d] = String(adIso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  try {
    const nd = new NepaliDate(new Date(y, m - 1, d));
    const startYear = nd.getMonth() >= SHRAWAN_IDX ? nd.getYear() : nd.getYear() - 1;
    return `${startYear}/${String(startYear + 1).slice(-2)}`;
  } catch {
    return null;
  }
}

const isoDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ? String(v).slice(0, 10) : ""));
const pad3 = (n) => String(n).padStart(3, "0");
const col = (s, n) => String(s ?? "").padEnd(n);

async function main() {
  const pg = new Client({ connectionString: URI, ssl: { rejectUnauthorized: false }, statement_timeout: 600000 });
  await pg.connect();

  const changes = [];   // { table, numCol, id, from, to }
  const counters = [];  // { id: 'billing:kind:fy', next_val }
  let skipped = 0;

  for (const doc of DOCS) {
    const { rows } = await pg.query(
      `select id, ${doc.numCol} as num, ${doc.dateCol} as dt, client_name, created_at
         from ${doc.table}`
    );

    // Bucket by computed fiscal year.
    const byFy = new Map();
    for (const r of rows) {
      const fy = fiscalYearForDate(isoDate(r.dt));
      if (!fy) { skipped++; continue; }
      if (!byFy.has(fy)) byFy.set(fy, []);
      byFy.get(fy).push(r);
    }

    for (const [fy, list] of byFy) {
      list.sort((a, b) => {
        const da = isoDate(a.dt), db = isoDate(b.dt);
        if (da !== db) return da < db ? -1 : 1;
        const ca = +new Date(a.created_at || 0), cb = +new Date(b.created_at || 0);
        if (ca !== cb) return ca - cb;
        return String(a.num || "").localeCompare(String(b.num || ""));
      });

      list.forEach((r, i) => {
        const to = `${doc.prefix}-${pad3(i + 1)}`;
        if ((r.num || "") !== to) {
          changes.push({ table: doc.table, numCol: doc.numCol, id: r.id, from: r.num || "(blank)", to, fy, when: isoDate(r.dt), who: r.client_name || "" });
        }
      });
      counters.push({ id: `billing:${doc.kind}:${fy}`, next_val: list.length + 1 });
    }
  }

  // ── Report ────────────────────────────────────────────────────────────
  console.log(`\n${changes.length} number(s) to change` + (skipped ? `, ${skipped} row(s) skipped (no usable date)` : "") + ":\n");
  if (changes.length) {
    console.log(col("FY", 9) + col("FROM", 12) + col("TO", 12) + col("DATE", 12) + "CLIENT");
    console.log("─".repeat(70));
    for (const c of changes) {
      console.log(col(c.fy, 9) + col(c.from, 12) + col(c.to, 12) + col(c.when, 12) + c.who);
    }
  }
  console.log(`\n${counters.length} fiscal-year counter(s) to seed:`);
  for (const c of counters) console.log(`  ${col(c.id, 32)} next_val=${c.next_val}`);

  if (!COMMIT) {
    console.log("\nDRY RUN — nothing written. Re-run with --commit to apply.\n");
    await pg.end();
    return;
  }

  // ── Apply ─────────────────────────────────────────────────────────────
  // Two phases so a target number that currently belongs to another row in the
  // same table can't trip a unique index mid-update.
  await pg.query("begin");
  try {
    for (const c of changes) {
      await pg.query(`update ${c.table} set ${c.numCol} = $1 where id = $2`, [`RENUM:${c.id}`, c.id]);
    }
    for (const c of changes) {
      await pg.query(`update ${c.table} set ${c.numCol} = $1 where id = $2`, [c.to, c.id]);
    }
    for (const c of counters) {
      await pg.query(
        `insert into counters (id, next_val) values ($1, $2)
         on conflict (id) do update set next_val = excluded.next_val`,
        [c.id, c.next_val]
      );
    }
    await pg.query("commit");
    console.log(`\nCommitted: ${changes.length} renumbered, ${counters.length} counters seeded.\n`);
  } catch (err) {
    await pg.query("rollback");
    throw err;
  }
  await pg.end();
}

main().catch((err) => { console.error(err); process.exit(1); });

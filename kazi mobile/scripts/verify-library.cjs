#!/usr/bin/env node
/**
 * End-to-end check of the product-library writes AS A REAL SIGNED-IN USER.
 *
 * The Inventory tabs now edit `fabrics` / `processes` / `patterns` in place, and
 * RLS on all three reads the `library` section — a grant of its own, which two
 * positions hold read-only. A superuser connection exercises none of that, so
 * this impersonates staff by setting `role authenticated` and a
 * `request.jwt.claims` matching what Supabase Auth issues.
 *
 *   node scripts/verify-library.cjs
 *
 * It writes one row into each of the three tables with exactly the columns
 * `src/lib/supabase/write.ts` produces for them, reads them back through the
 * compat views the app actually reads, checks a view-only position is refused,
 * checks the `product-media` policies from 0108, and removes everything it made.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const ISS = 'https://ydaoyjacqcmxpgpwrgwt.supabase.co/auth/v1';

function connectionString() {
  const txt = fs.readFileSync(path.join(ROOT, 'mentions', 'supabase.txt'), 'utf8');
  const uri = (txt.match(/postgresql:\/\/\S+pooler\.supabase\.com:\d+\/postgres/g) || []).pop();
  if (!uri) throw new Error('no session-pooler URI in mentions/supabase.txt');
  return uri;
}

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

/** A statement that is SUPPOSED to be refused, inside a savepoint. */
async function refuses(pg, sql, params) {
  await pg.query('savepoint probe');
  try {
    const res = await pg.query(sql, params);
    await pg.query('release savepoint probe');
    // An UPDATE/INSERT blocked by RLS `using` raises; one blocked by a missing
    // row simply affects nothing. Both count as refused.
    return res.rowCount === 0;
  } catch {
    await pg.query('rollback to savepoint probe');
    return true;
  }
}

async function as(pg, authUid, fn) {
  await pg.query('begin');
  await pg.query('set local role authenticated');
  await pg.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: authUid, role: 'authenticated', iss: ISS }),
  ]);
  try {
    return await fn();
  } finally {
    await pg.query('commit');
    await pg.query('reset role');
  }
}

async function main() {
  const pg = new Client({ connectionString: connectionString(), ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const pick = async (canEdit) => {
    const { rows } = await pg.query(
      `select p.id, p.full_name, p.auth_uid, po.label
         from people p
         join positions po on po.id = p.position_id
         join position_permissions pp on pp.position_id = po.id and pp.section_id = 'library'
        where p.status = 'Active' and p.auth_uid is not null
          and pp.can_view and pp.can_edit = $1
        order by p.full_name limit 1`,
      [canEdit],
    );
    return rows[0];
  };

  const editor = await pick(true);
  const reader = await pick(false);
  if (!editor) throw new Error('no active staff with library edit rights and a Supabase auth uid');
  console.log(`editing as: ${editor.full_name} (${editor.label})`);
  console.log(reader ? `reading as: ${reader.full_name} (${reader.label})\n` : 'no view-only library position has a login — skipping the refusal check\n');

  const made = { fabrics: null, processes: null, patterns: null };

  try {
    await as(pg, editor.auth_uid, async () => {
      // ---- fabrics: the columns `fabricRow` sends ---------------------
      const fabric = await pg.query(
        `insert into fabrics (name, type, composition, supplier, gsm, weight,
                              price_per_meter, price_per_kg, available_colors,
                              status, notes, swatch_image_url, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now()) returning id`,
        ['ZZ verify fabric', 'Fabric', '100% Cotton', 'Verify Mills', 185, 'Mid', 350, null,
         ['White', 'Navy'], 'In Stock', 'written by verify-library.cjs', null],
      );
      made.fabrics = fabric.rows[0].id;
      check('fabric insert accepted', !!made.fabrics);

      const back = await pg.query('select * from fs_fabrics where id = $1', [made.fabrics]);
      const f = back.rows[0];
      check('fabric reads back through fs_fabrics', !!f);
      check('  gsm survives', Number(f.gsm) === 185, `got ${f.gsm}`);
      check('  price_per_meter survives', Number(f.price_per_meter) === 350, `got ${f.price_per_meter}`);
      check('  available_colors survives', Array.isArray(f.available_colors) && f.available_colors.length === 2);
      check('  status survives', f.status === 'In Stock');

      const updated = await pg.query(
        `update fabrics set status = $2, price_per_kg = $3, updated_at = now() where id = $1`,
        [made.fabrics, 'Low Stock', 1200],
      );
      check('fabric update accepted', updated.rowCount === 1);

      // ---- processes: NOT NULL numerics -------------------------------
      const process = await pg.query(
        `insert into processes (name, category, description, notes,
                                cost_per_unit, lead_time_days, min_quantity, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7, now()) returning id`,
        ['ZZ verify process', 'finishing', 'Written by verify-library.cjs', null, 42.5, 3, 0],
      );
      made.processes = process.rows[0].id;
      const p = (await pg.query('select * from fs_processes where id = $1', [made.processes])).rows[0];
      check('process reads back through fs_processes', !!p);
      check('  cost_per_unit survives', Number(p.cost_per_unit) === 42.5, `got ${p.cost_per_unit}`);
      check('  min_quantity accepts 0', Number(p.min_quantity) === 0, `got ${p.min_quantity}`);

      // ---- patterns: jsonb grids, a date, and the arrays ---------------
      const pattern = await pg.query(
        `insert into patterns (style_no, name, product_type, category, season, market,
                               designer_name, sizes_available, spec_size, spec_date,
                               trims, wash_care, remarks, notes, measurements, fabric_rows,
                               front_sketch_url, back_sketch_url, tech_pack_url,
                               tech_pack_images, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, now())
         returning id`,
        ['#KAZI999', 'ZZ verify tech pack', 'Tee', 'Menswear', 'Summer', 'Nepal',
         'verify-library.cjs', ['S', 'M', 'L'], 'Medium', '2026-09-07',
         'Woven label', 'Cold wash', 'none', null,
         JSON.stringify([{ label: 'Full length', inch: '28' }, { label: 'Chest', inch: '20' }]),
         JSON.stringify([{ fabricName: 'ZZ verify fabric', description: '100% Cotton, 185 GSM' }]),
         null, null, null, []],
      );
      made.patterns = pattern.rows[0].id;
      const t = (await pg.query('select * from fs_patterns where id = $1', [made.patterns])).rows[0];
      check('tech pack reads back through fs_patterns', !!t);
      check('  measurements survive as a grid', Array.isArray(t.measurements) && t.measurements.length === 2, JSON.stringify(t.measurements));
      check('  fabricRows survive', Array.isArray(t.fabricRows) && t.fabricRows[0].fabricName === 'ZZ verify fabric');
      check('  sizes_available survives', Array.isArray(t.sizes_available) && t.sizes_available.length === 3);
      check('  specDate is a date, not text', String(t.specDate).startsWith('2026-09-07'), `got ${t.specDate}`);

      // An emptied grid must land as [], never null — the columns are NOT NULL.
      const cleared = await pg.query(
        `update patterns set measurements = $2, fabric_rows = $3, spec_date = null where id = $1`,
        [made.patterns, '[]', '[]'],
      );
      check('emptying the grids is accepted', cleared.rowCount === 1);
      check(
        'a null spec_date is accepted',
        (await pg.query('select spec_date from patterns where id = $1', [made.patterns])).rows[0].spec_date === null,
      );
    });

    // ---- a view-only position may read and may not write ---------------
    if (reader) {
      await as(pg, reader.auth_uid, async () => {
        const seen = await pg.query('select count(*)::int as n from fs_fabrics where id = $1', [made.fabrics]);
        check(`${reader.label} can read the library`, seen.rows[0].n === 1);
        check(
          `${reader.label} cannot edit a fabric`,
          await refuses(pg, 'update fabrics set status = $2 where id = $1', [made.fabrics, 'Out of Stock']),
        );
        check(
          `${reader.label} cannot edit a tech pack`,
          await refuses(pg, 'update patterns set name = $2 where id = $1', [made.patterns, 'nope']),
        );
        check(
          `${reader.label} cannot insert a process`,
          await refuses(pg, `insert into processes (name) values ('ZZ should not exist')`),
        );
      });
    }

    // ---- product-media, from 0108 --------------------------------------
    await as(pg, editor.auth_uid, async () => {
      const { rows } = await pg.query(
        `select count(*)::int as n from pg_policies
          where schemaname = 'storage' and tablename = 'objects' and policyname like 'product_media_%'`,
      );
      check('product-media has its four policies', rows[0].n === 4, `found ${rows[0].n}`);
      const can = await pg.query(`select app_can_edit('library') as ok`);
      check(`${editor.label} passes the bucket's write check`, can.rows[0].ok === true);
    });
    if (reader) {
      await as(pg, reader.auth_uid, async () => {
        const can = await pg.query(`select app_can_edit('library') as ok`);
        check(`${reader.label} fails the bucket's write check`, can.rows[0].ok === false);
      });
    }
  } finally {
    // Cleanup runs as the owner so a failed run never leaves rows behind.
    for (const [table, id] of Object.entries(made)) {
      if (id) await pg.query(`delete from ${table} where id = $1`, [id]);
    }
    await pg.query(`delete from processes where name = 'ZZ should not exist'`);
    await pg.end();
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

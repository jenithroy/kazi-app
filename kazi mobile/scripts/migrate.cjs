#!/usr/bin/env node
/**
 * Applies supabase/migrations/*.sql in filename order, once each.
 *
 * Connection comes from mentions/supabase.txt (gitignored) — the SESSION
 * POOLER uri, never the direct host, which is IPv6-only and unreachable
 * from this machine.
 *
 *   node scripts/migrate.cjs          apply pending
 *   node scripts/migrate.cjs --status show what's applied
 *   node scripts/migrate.cjs --reset  DROP the public schema and reapply
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'supabase', 'migrations');

function connectionString() {
  const txt = fs.readFileSync(path.join(ROOT, 'mentions', 'supabase.txt'), 'utf8');
  const uri = (txt.match(/postgresql:\/\/\S+pooler\.supabase\.com:\d+\/postgres/g) || []).pop();
  if (!uri) throw new Error('no session-pooler URI in mentions/supabase.txt');
  const pass = uri.match(/:\/\/[^:]+:([^@]+)@/)?.[1] || '';
  if (/YOUR|PASSWORD|[[\]<>]/i.test(pass)) throw new Error('password is still a placeholder');
  return uri;
}

async function main() {
  const args = process.argv.slice(2);
  const c = new Client({
    connectionString: connectionString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
    statement_timeout: 600000,
  });
  await c.connect();

  if (args.includes('--reset')) {
    console.log('dropping public schema…');
    await c.query('drop schema public cascade; create schema public;');
    await c.query('grant usage on schema public to anon, authenticated, service_role;');
    await c.query('grant all on schema public to postgres;');
    await c.query(`alter default privileges in schema public
      grant all on tables to postgres, anon, authenticated, service_role;`);
    await c.query(`alter default privileges in schema public
      grant all on sequences to postgres, anon, authenticated, service_role;`);
  }

  await c.query(`create table if not exists schema_migrations (
    filename text primary key, applied_at timestamptz not null default now())`);

  const done = new Set((await c.query('select filename from schema_migrations')).rows.map(r => r.filename));
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();

  if (args.includes('--status')) {
    for (const f of files) console.log(`${done.has(f) ? '✓' : ' '} ${f}`);
    await c.end();
    return;
  }

  let applied = 0;
  for (const f of files) {
    if (done.has(f)) { console.log(`·  ${f} (already applied)`); continue; }
    const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
    process.stdout.write(`→  ${f} … `);
    try {
      await c.query('begin');
      await c.query(sql);
      await c.query('insert into schema_migrations(filename) values ($1)', [f]);
      await c.query('commit');
      console.log('ok');
      applied++;
    } catch (e) {
      await c.query('rollback');
      console.log('FAILED');
      console.error(`\n   ${e.message}`);
      if (e.position) {
        const upto = sql.slice(0, Number(e.position));
        console.error(`   at line ${upto.split('\n').length}: ${sql.split('\n')[upto.split('\n').length - 1]?.trim()}`);
      }
      await c.end();
      process.exit(1);
    }
  }
  console.log(`\n${applied} migration(s) applied.`);

  const t = await c.query(`select table_name from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE' order by 1`);
  console.log(`${t.rows.length} tables: ${t.rows.map(r => r.table_name).join(', ')}`);
  await c.end();
}

main().catch(e => { console.error('ERR', e.message); process.exit(1); });

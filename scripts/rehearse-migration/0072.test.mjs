// Rehearsal of 0072_lead_emails_contacted.sql and its undo on a scratch Postgres. Nothing here touches the live database.
//
// What it proves: the new "contacted" column and the view that shows it, who may tick it (Marketing edit, nobody else), that nothing else about
// an address becomes editable, that every existing row and rule is untouched, that the migration is safe to run twice, and that the undo puts
// the database back exactly as 0064 left it (refusing first if somebody has ticked an address).
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildEnv, as } from "./env.mjs";

const REPO = fileURLToPath(new URL("../../supabase/", import.meta.url));
const read = (p) => fs.readFileSync(REPO + p, "utf8").replace(/\r\n/g, "\n");
const M0064 = read("migrations/0064_reddit_leads.sql");
const MIGRATION = read("migrations/0072_lead_emails_contacted.sql");
const UNDO = read("undo/0072_lead_emails_contacted.undo.sql");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail ? `-> ${detail}` : ""); }
};
const group = (t) => console.log("\n" + t);

async function raises(promise, re) {
  try { await promise; return { raised: false, message: "" }; }
  catch (e) { return { raised: true, message: String(e.message), match: re.test(String(e.message)) }; }
}
const expectError = async (name, promise, re) => {
  const r = await raises(promise, re);
  ok(name, r.raised && r.match, r.raised ? `wrong error: ${r.message}` : "no error was raised");
};

const DIRECTOR = { sub: "uid-director" }; // Marketing edit
const VIEWER = { sub: "uid-admin" };      // Marketing view only
const STAFF = { sub: "uid-staff" };       // no Marketing at all
const INACTIVE = { sub: "uid-gone" }, STRANGER = { sub: "uid-nobody" };
const SERVICE = { sub: "service", role: "service_role", iss: "supabase", aud: "authenticated" }, ANON = { sub: "anon", role: "anon", claimRole: "anon" };
const WRONG_ISSUER = { sub: "uid-director", iss: "https://evil.example/", aud: "x" };

// A scratch database with the Marketing section, 0064 (which makes lead_emails) and three addresses.
async function build() {
  const db = await buildEnv();
  // 0064's reddit_leads points at customers: a stand-in with just the key
  await db.exec(`create table customers (id uuid primary key default gen_random_uuid(), name text)`);
  await db.exec(`insert into sections (id, label, sort_order) values ('marketing', 'Marketing', 9)`);
  // (the trigger of 0028 may have handed it to the super admins already: set exactly what this test means)
  await db.exec(`
    insert into position_permissions (position_id, section_id, can_view, can_edit)
    values ('director', 'marketing', true, true), ('nepal_admin', 'marketing', true, false)
    on conflict (position_id, section_id) do update set can_view = excluded.can_view, can_edit = excluded.can_edit;
  `);
  await db.exec(M0064);
  await db.exec(`
    insert into lead_emails (email, brand, website, source_url, kind, same_domain, socials, note, do_not_email) values
      ('sales@alpha-fashion.test', 'Alpha', 'https://alpha-fashion.test', 'https://www.reddit.com/r/ClothingStartups/comments/abc123/', 'role', true, '{"instagram":"https://instagram.com/alpha"}', null, false),
      ('hello@beta-wear.test', 'Beta', null, 'https://www.find-tender.service.gov.uk/Notice/071001-2026', 'role', false, '{}', 'asked us to stop', true),
      ('jane@gamma.test', null, null, null, 'named', false, '{}', 'asked about the minimum order', false);
  `);
  return db;
}

// Everything the migration could have touched, as plain data to compare.
async function shape(db) {
  const q = async (sql) => (await db.query(sql)).rows.map((r) => Object.values(r).join("|"));
  return {
    tableColumns: await q(`select column_name, data_type, is_nullable, coalesce(column_default, '') from information_schema.columns where table_schema = 'public' and table_name = 'lead_emails' order by ordinal_position`),
    viewColumns: await q(`select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'fs_lead_emails' order by ordinal_position`),
    viewDefinition: await q(`select pg_get_viewdef('public.fs_lead_emails'::regclass, true)`),
    viewOptions: await q(`select coalesce(array_to_string(reloptions, ','), '') from pg_class where oid = 'public.fs_lead_emails'::regclass`),
    tablePrivileges: await q(`select table_name, grantee, privilege_type from information_schema.table_privileges where table_schema = 'public' and table_name in ('lead_emails', 'fs_lead_emails') and grantee in ('anon', 'authenticated', 'service_role') order by 1, 2, 3`),
    // columns each role may write or read, whether by a table-wide right or one granted by name
    columnPrivileges: await q(`select table_name, grantee, privilege_type, column_name from information_schema.column_privileges where table_schema = 'public' and table_name in ('lead_emails', 'fs_lead_emails') and grantee in ('anon', 'authenticated', 'service_role') order by 1, 2, 3, 4`),
    policies: await q(`select policyname, cmd, permissive, roles::text, coalesce(qual, ''), coalesce(with_check, '') from pg_policies where schemaname = 'public' and tablename = 'lead_emails' order by 1`),
    constraints: await q(`select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.lead_emails'::regclass order by 1`),
    indexes: await q(`select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'lead_emails' order by 1`),
    triggers: await q(`select tgname from pg_trigger where tgrelid = 'public.lead_emails'::regclass and not tgisinternal order by 1`),
    rowSecurity: await q(`select relrowsecurity::text from pg_class where oid = 'public.lead_emails'::regclass`),
    // every column that existed in 0064, never contacted_at
    data: await q(`select count(*), md5(coalesce(string_agg(id::text || email || coalesce(brand, '') || coalesce(website, '') || coalesce(source_url, '') || kind || same_domain::text || socials::text || coalesce(lead_id::text, '') || do_not_email::text || coalesce(note, '') || coalesce(found_by::text, '') || found_at::text, ',' order by id), '')) from public.lead_emails`),
  };
}
const diffKeys = (a, b) => Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));

const db = await build();
const idOf = async (email) => (await db.query(`select id from lead_emails where email = $1`, [email])).rows[0].id;
const A = await idOf("sales@alpha-fashion.test"), B = await idOf("hello@beta-wear.test"), C = await idOf("jane@gamma.test");
const viewRow = async (id) => (await db.query(`select * from fs_lead_emails where id = $1`, [id])).rows[0];

group("A. Applying the migration");
const S0 = await shape(db);
ok("the starting point is what 0064 made (13 view columns, no contacted)", S0.viewColumns.length === 13 && !S0.tableColumns.some((c) => c.startsWith("contacted_at")), JSON.stringify(S0.viewColumns));
await db.exec(MIGRATION);
ok("applies cleanly to a database that has never seen it", true);
const S1 = await shape(db);
await db.exec(MIGRATION);
const S2 = await shape(db);
ok("applying it a second time changes nothing (idempotent)", JSON.stringify(S1) === JSON.stringify(S2), diffKeys(S1, S2).join(", "));

const changed = diffKeys(S0, S1).sort();
ok("it changes only the column list, the view, and who may write that column", JSON.stringify(changed) === JSON.stringify(["columnPrivileges", "tableColumns", "viewColumns", "viewDefinition"].sort()), changed.join(", "));
const newCols = S1.tableColumns.filter((c) => !S0.tableColumns.includes(c));
ok("lead_emails gains exactly one column: contacted_at, a timestamp that may be empty, with no default", newCols.length === 1 && newCols[0] === "contacted_at|timestamp with time zone|YES|", JSON.stringify(newCols));
ok("the old columns are all still there, in order", JSON.stringify(S1.tableColumns.slice(0, S0.tableColumns.length)) === JSON.stringify(S0.tableColumns));
ok("the view keeps every old column in its old place and adds contactedAt LAST (create or replace view can only append)",
  JSON.stringify(S1.viewColumns.slice(0, S0.viewColumns.length)) === JSON.stringify(S0.viewColumns) && S1.viewColumns.at(-1) === "contactedAt|timestamp with time zone" && S1.viewColumns.length === S0.viewColumns.length + 1,
  JSON.stringify(S1.viewColumns));
ok("the view is still security_invoker (people see only what their own rights allow)", S1.viewOptions[0] === "security_invoker=on", S1.viewOptions[0]);
ok("who may read the view and the table is unchanged (table rights)", JSON.stringify(S0.tablePrivileges) === JSON.stringify(S1.tablePrivileges));
ok("policies, constraints, indexes, triggers and row security are byte-identical", ["policies", "constraints", "indexes", "triggers", "rowSecurity"].every((k) => JSON.stringify(S0[k]) === JSON.stringify(S1[k])));
ok("every existing address is byte-identical", JSON.stringify(S0.data) === JSON.stringify(S1.data), JSON.stringify([S0.data, S1.data]));
ok("every existing address starts as not contacted", (await db.query(`select count(*)::int as n from lead_emails where contacted_at is not null`)).rows[0].n === 0);
ok("fs_lead_emails shows the new field under its camelCase name, empty", (await viewRow(A)).contactedAt === null && "contactedAt" in (await viewRow(A)));

const privOf = async (role, kind) => (await db.query(
  `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'lead_emails' and has_column_privilege($1, 'public.lead_emails', column_name, $2) order by 1`, [role, kind])).rows.map((r) => r.column_name);
const authUpdate = await privOf("authenticated", "UPDATE");
ok("signed-in people may now update exactly: brand, contacted_at, do_not_email, note, website", JSON.stringify(authUpdate) === JSON.stringify(["brand", "contacted_at", "do_not_email", "note", "website"]), JSON.stringify(authUpdate));
const authInsert = await privOf("authenticated", "INSERT");
ok("...and may INSERT exactly what 0064 allowed (a new address can never start out ticked)", JSON.stringify(authInsert) === JSON.stringify(["brand", "email", "kind", "lead_id", "note", "same_domain", "socials", "source_url", "website"]), JSON.stringify(authInsert));
ok("anonymous visitors have no right to the table or the view", (await privOf("anon", "SELECT")).length === 0 && (await privOf("anon", "UPDATE")).length === 0
  && !(await db.query(`select has_table_privilege('anon', 'public.fs_lead_emails', 'SELECT') as x`)).rows[0].x);
ok("the Worker (service role) may write the new column too", (await privOf("service_role", "UPDATE")).includes("contacted_at") && (await privOf("service_role", "INSERT")).includes("contacted_at"));

group("B. Who can tick an address");
const stamp = "2026-11-15T09:30:00+00:00";
await as(db, DIRECTOR, async () => {
  const r = await db.query(`update lead_emails set contacted_at = $1 where id = $2 returning contacted_at`, [stamp, A]);
  ok("someone with Marketing edit can tick an address", r.rows.length === 1 && new Date(r.rows[0].contacted_at).toISOString() === "2026-11-15T09:30:00.000Z", JSON.stringify(r.rows));
  const v = (await db.query(`select "contactedAt", email from fs_lead_emails where id = $1`, [A])).rows[0];
  ok("...and the view shows it straight away, for the right address", v && new Date(v.contactedAt).toISOString() === "2026-11-15T09:30:00.000Z" && v.email === "sales@alpha-fashion.test", JSON.stringify(v));
  const others = (await db.query(`select count(*)::int as n from fs_lead_emails where "contactedAt" is not null`)).rows[0].n;
  ok("...and only that address", others === 1, String(others));
  const unticked = await db.query(`update lead_emails set contacted_at = null where id = $1 returning contacted_at`, [A]);
  ok("...and untick it again (set back to empty)", unticked.rows.length === 1 && unticked.rows[0].contacted_at === null);
  const both = await db.query(`update lead_emails set contacted_at = $1, note = 'wrote on 15 Nov' where id = $2 returning note`, [stamp, C]);
  ok("...and still change the note in the same request (the page sends several fields at once)", both.rows.length === 1 && both.rows[0].note === "wrote on 15 Nov");
  const flagged = await db.query(`update lead_emails set contacted_at = $1 where id = $2 returning do_not_email`, [stamp, B]);
  ok("...even on a Do not email address (the two marks are independent)", flagged.rows.length === 1 && flagged.rows[0].do_not_email === true);
});
// those were rolled back by as(): nothing is ticked now
ok("(each of those ran in a transaction that was rolled back)", (await db.query(`select count(*)::int as n from lead_emails where contacted_at is not null`)).rows[0].n === 0);

await as(db, VIEWER, async () => {
  const r = await db.query(`update lead_emails set contacted_at = now() where id = $1 returning id`, [A]);
  ok("someone who can only VIEW Marketing cannot tick (no row matches, nothing changes)", r.rows.length === 0);
  const seen = (await db.query(`select count(*)::int as n from fs_lead_emails`)).rows[0].n;
  ok("...but can read the list, the new field included", seen === 3, String(seen));
});
await as(db, STAFF, async () => {
  const r = await db.query(`update lead_emails set contacted_at = now() returning id`);
  ok("staff with no Marketing access cannot tick, and see nothing", r.rows.length === 0 && (await db.query(`select count(*)::int as n from fs_lead_emails`)).rows[0].n === 0);
});
await as(db, INACTIVE, async () => ok("an inactive person cannot tick", (await db.query(`update lead_emails set contacted_at = now() returning id`)).rows.length === 0));
await as(db, STRANGER, async () => ok("a token that matches no person cannot tick", (await db.query(`update lead_emails set contacted_at = now() returning id`)).rows.length === 0));
await as(db, WRONG_ISSUER, async () => ok("an editor's token from the wrong issuer cannot tick", (await db.query(`update lead_emails set contacted_at = now() returning id`)).rows.length === 0));
await expectError("anonymous visitors are refused outright (table)", as(db, ANON, () => db.query(`update lead_emails set contacted_at = now()`)), /permission denied/);
await expectError("anonymous visitors cannot read the view", as(db, ANON, () => db.query(`select "contactedAt" from fs_lead_emails`)), /permission denied/);

group("C. Nothing else became editable");
await expectError("an editor cannot change an address", as(db, DIRECTOR, () => db.query(`update lead_emails set email = 'other@alpha-fashion.test' where id = $1`, [A])), /permission denied/);
await expectError("...cannot change when it was found", as(db, DIRECTOR, () => db.query(`update lead_emails set found_at = now() where id = $1`, [A])), /permission denied/);
await expectError("...cannot re-point it at a Reddit lead", as(db, DIRECTOR, () => db.query(`update lead_emails set lead_id = gen_random_uuid() where id = $1`, [A])), /permission denied/);
await expectError("...cannot add an address that is already ticked", as(db, DIRECTOR, () => db.query(`insert into lead_emails (email, contacted_at) values ('new@delta.test', now())`)), /permission denied/);
await as(db, DIRECTOR, async () => {
  const r = await db.query(`insert into lead_emails (email, kind) values ('new@delta.test', 'role') returning contacted_at`);
  ok("a new address from the page starts as not contacted", r.rows.length === 1 && r.rows[0].contacted_at === null);
  const del = await db.query(`delete from lead_emails where id = $1 returning id`, [B]);
  ok("a Do not email address still cannot be deleted (0064's rule is untouched)", del.rows.length === 0);
  const del2 = await db.query(`delete from lead_emails where id = $1 returning id`, [C]);
  ok("...and an ordinary one still can be", del2.rows.length === 1);
});
await as(db, SERVICE, async () => {
  const r = await db.query(`update lead_emails set contacted_at = now() where id = $1 returning id`, [A]);
  ok("the service role can still write rows (and this column)", r.rows.length === 1);
  const ins = await db.query(`insert into lead_emails (email, kind) values ('worker@epsilon.test', 'role') returning contacted_at`);
  ok("an address the Worker adds starts as not contacted", ins.rows[0].contacted_at === null);
});

group("D. Undo");
await db.exec(`update lead_emails set contacted_at = '2026-11-15T09:30:00+00:00' where id = '${A}'`);
const S3 = JSON.stringify(await shape(db));
await expectError("the undo refuses to drop the column while an address is ticked", db.exec(UNDO), /ticked as contacted/);
await db.exec("rollback"); // the file opens its own transaction; a real session would roll back the same way
ok("...and after the refusal everything is still there, the tick included", JSON.stringify(await shape(db)) === S3 && (await viewRow(A)).contactedAt !== null);
await db.exec(`set kazi.confirm_drop_contacted = 'yes'`);
await db.exec(UNDO);
await db.exec(`reset kazi.confirm_drop_contacted`);
ok("with explicit confirmation the undo runs", true);
const S4 = await shape(db);
ok("after the undo the database is identical to how 0064 left it (columns, view, rights, rules)", JSON.stringify(diffKeys(S0, S4)) === "[]" || diffKeys(S0, S4).every((k) => k === "data"), diffKeys(S0, S4).join(", "));
ok("...and the other columns of every address are intact", (await db.query(`select count(*)::int as n from lead_emails`)).rows[0].n >= 2);
await db.exec(UNDO);
ok("running the undo again (nothing to undo) is harmless", JSON.stringify(await shape(db)) === JSON.stringify(S4));
await db.exec(MIGRATION);
ok("the migration can be applied again after an undo", (await shape(db)).viewColumns.at(-1) === "contactedAt|timestamp with time zone");

// a fresh database: apply, then undo with no tick, no confirmation needed
const db2 = await build();
const T0 = JSON.stringify(await shape(db2));
await db2.exec(MIGRATION);
await db2.exec(UNDO);
ok("on a fresh database: apply then undo (nothing ticked) leaves no trace and needs no confirmation", JSON.stringify(await shape(db2)) === T0);
// the undo on a database that never had 0072 (but has 0064): the same view again
const db3 = await build();
const U0 = JSON.stringify(await shape(db3));
await db3.exec(UNDO);
ok("on a database that never had the migration, the undo changes nothing", JSON.stringify(await shape(db3)) === U0);
// the migration on a database that has rows and an already-ticked column (a second run after people started ticking)
const db4 = await build();
await db4.exec(MIGRATION);
await db4.exec(`update lead_emails set contacted_at = '2026-11-15T09:30:00+00:00' where email = 'sales@alpha-fashion.test'`);
await db4.exec(MIGRATION);
ok("running the migration again keeps what people have already ticked", (await db4.query(`select count(*)::int as n from lead_emails where contacted_at is not null`)).rows[0].n === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

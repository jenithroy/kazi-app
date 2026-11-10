// A scratch database built from the repo's OWN definitions (extracted from its SQL text, not retyped):
// the people / positions / sections / permission tables and the app_* helper functions.
// Connects the way Supabase does: a login role 'authenticator' that switches to anon / authenticated / service_role.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { makeScratch } from "./scratch.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const BASELINE = fs.readFileSync(REPO + "supabase/migrations/0000_baseline.sql", "utf8");
const M0028 = fs.readFileSync(REPO + "supabase/migrations/0028_protect_permission_matrix.sql", "utf8");

function table(name) {
  const m = BASELINE.match(new RegExp(`^create table if not exists ${name} \\(\\n[\\s\\S]*?^\\);`, "m"));
  if (!m) throw new Error("table not found in baseline: " + name);
  return m[0];
}
function fn(name) {
  const m = BASELINE.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$\\s*;`, "i"));
  if (!m) throw new Error("function not found in baseline: " + name);
  return m[0];
}

export async function buildEnv() {
  const db = await makeScratch();
  for (const t of ["people", "positions", "sections", "position_permissions", "person_permission_overrides"]) {
    await db.exec(table(t));
  }
  await db.exec(`
    alter table people add constraint people_pkey primary key (id);
    alter table people add constraint people_legacy_firebase_uid_key unique (legacy_firebase_uid);
    alter table positions add constraint positions_pkey primary key (id);
    alter table sections add constraint sections_pkey primary key (id);
    alter table position_permissions add constraint position_permissions_pkey primary key (position_id, section_id);
    alter table person_permission_overrides add constraint person_permission_overrides_pkey primary key (person_id, section_id);
    alter table position_permissions add constraint position_permissions_section_id_fkey foreign key (section_id) references sections(id) on delete cascade;
    alter table person_permission_overrides add constraint person_permission_overrides_section_id_fkey foreign key (section_id) references sections(id) on delete cascade;
  `);
  for (const f of ["app_jwt_sub", "app_person_id", "app_tier", "app_issuer_ok", "app_can_view", "app_can_edit"]) {
    await db.exec(fn(f));
  }
  // the trigger that gives a new page to the super admins (0028), copied from the migration text
  const grant = M0028.match(/create or replace function public\.grant_new_section_to_super_admins\(\)[\s\S]*?for each row execute function public\.grant_new_section_to_super_admins\(\);/i);
  await db.exec(grant[0]);

  // Supabase-style connection: PostgREST logs in as authenticator, then switches role per request.
  await db.exec(`
    create role authenticator nologin;
    grant anon, authenticated, service_role to authenticator;
    grant select, insert, update, delete on people, positions, sections, position_permissions, person_permission_overrides to authenticated, service_role;
    grant select on people, positions, sections, position_permissions, person_permission_overrides to anon;
    grant execute on all functions in schema public to anon, authenticated, service_role;
  `);

  await db.exec(`
    insert into positions (id, label, tier) values ('director','Director',4), ('nepal_admin','Nepal Admin',2), ('staff','Staff',0);
    insert into sections (id, label, sort_order) values ('dashboard','Dashboard',1), ('tasks','Tasks',2);
    insert into position_permissions (position_id, section_id, can_view, can_edit)
      values ('director','dashboard',true,true), ('nepal_admin','dashboard',true,false), ('staff','dashboard',true,false)
      on conflict (position_id, section_id) do nothing;
    insert into people (id, email, full_name, position_id, status, legacy_firebase_uid) values
      ('00000000-0000-0000-0000-0000000000d1','dina@example.test','Dina Director','director','Active','uid-director'),
      ('00000000-0000-0000-0000-0000000000a1','nabin@example.test','Nabin Admin','nepal_admin','Active','uid-admin'),
      ('00000000-0000-0000-0000-0000000000b1','sita@example.test','Sita Staff','staff','Active','uid-staff'),
      ('00000000-0000-0000-0000-0000000000c1','gone@example.test','Gone Inactive','staff','Inactive','uid-gone');
  `);
  return db;
}

export const FIREBASE = { iss: "https://securetoken.google.com/kazi-manufacturing", aud: "kazi-manufacturing" };

// Run fn() inside one transaction as a given identity, always rolled back.
//   who: { sub, role: 'authenticated' | 'service_role' | 'anon', iss, aud, claimRole }
export async function as(db, who, fn) {
  const role = who.role || "authenticated";
  const claims = { ...(who.iss === undefined ? FIREBASE : { iss: who.iss, aud: who.aud }), sub: who.sub, role: who.claimRole || role };
  // The scratch Postgres does not revert a LOCAL session-authorization switch on rollback, so the
  // login-role switch happens outside the transaction and is restored by hand afterwards.
  await db.exec("set session authorization authenticator");
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    return await fn();
  } finally {
    await db.exec("rollback");
    await db.exec("set session authorization postgres");
  }
}

// Everything the migration could have touched, as one comparable string.
export async function snapshot(db) {
  const q = async (sql) => (await db.query(sql)).rows.map((r) => Object.values(r).join("|"));
  return JSON.stringify({
    tables: await q(`select table_name from information_schema.tables where table_schema='public' order by 1`),
    functions: await q(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1`),
    policies: await q(`select tablename||'.'||policyname||'.'||coalesce(qual,'')||'.'||coalesce(with_check,'') from pg_policies where schemaname='public' order by 1`),
    triggers: await q(`select event_object_table||'.'||trigger_name from information_schema.triggers where trigger_schema='public' order by 1`),
    indexes: await q(`select indexname from pg_indexes where schemaname='public' order by 1`),
    data: await q(`select 'people', count(*), md5(string_agg(id::text||full_name||status, ',' order by id)) from people
                   union all select 'sections', count(*), md5(string_agg(id||label, ',' order by id)) from sections
                   union all select 'pp', count(*), md5(string_agg(position_id||section_id||can_view::text||can_edit::text, ',' order by position_id, section_id)) from position_permissions
                   union all select 'positions', count(*), md5(string_agg(id||tier::text, ',' order by id)) from positions`),
  });
}

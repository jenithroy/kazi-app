// A scratch Postgres (PGlite: Postgres compiled to WebAssembly, in memory) shaped like the Supabase project,
// for rehearsing a migration without touching the live database. Used by env.mjs and the *.test.mjs files.
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

export async function makeScratch() {
  const db = new PGlite({ extensions: { citext, pgcrypto } });
  await db.exec(`
    create extension if not exists citext;
    create extension if not exists pgcrypto;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    -- what Supabase's auth schema offers to policies: the request's JWT claims
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
    create function auth.role() returns text language sql stable as
      $$ select coalesce(auth.jwt() ->> 'role', current_user) $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    -- Supabase's default: every new table and function in public is open to all three API roles until a
    -- migration narrows it. Without this the rehearsal would hide a missing REVOKE.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  return db;
}

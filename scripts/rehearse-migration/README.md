# Rehearse a migration

Runs a database migration (and its undo) on a **scratch Postgres that lives in memory**, so a mistake costs nothing. It never connects to the live database.

```
cd scripts/rehearse-migration
npm install
npm run test:0068        # or: node 0068.test.mjs
```

It prints one PASS or FAIL line per check and exits non-zero if anything fails.

## Why it exists

The live Supabase database cannot be rehearsed on, and `scripts/migrate.cjs` must not be run against it (its tracker is out of date). Before a migration is applied by hand, this proves what it does and what it leaves alone.

## What it builds

`env.mjs` copies the repo's own definitions out of `supabase/migrations/0000_baseline.sql` and `0028_...sql`, not retyped: the `people`, `positions`, `sections` and permission tables, and the `app_person_id`, `app_tier`, `app_can_view`, `app_can_edit` and `app_issuer_ok` helpers. It seeds a director, a mid-tier admin, regular staff and an inactive person, and connects the way Supabase does: a login role (`authenticator`) that switches to `anon`, `authenticated` or `service_role`, with the request's JWT claims set. `as(db, who, fn)` runs `fn` as one of those identities inside a transaction that is always rolled back.

`snapshot(db)` records every table, function, policy, trigger and index plus a checksum of the existing data, so a test can show a migration added only what it meant to and an undo restored the original.

## What it does not cover

- The full baseline does not load into a blank database (it is a documentation dump with ordering quirks), so only the tables a migration depends on are built. Add the ones yours needs to `env.mjs`.
- Supabase extras are not modelled: storage buckets, realtime publications, default privileges on new tables, Auth's own tables.
- It is PGlite, Postgres compiled to WebAssembly. It does not revert a `SET LOCAL SESSION AUTHORIZATION` on rollback, so `as()` switches the login role outside the transaction and restores it by hand.
- Passing here is not a promise about production. Apply a migration by hand, one file at a time, and smoke-test it in a transaction that is rolled back (see the project notes on live database access).

## Adding a test for the next migration

Copy `0068.test.mjs`, point it at the new migration and undo files, and keep the same shape: apply, apply again, compare snapshots, exercise every safeguard as every kind of identity, then run the undo and compare the snapshot with the original.

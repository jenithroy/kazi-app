-- ============================================================================
-- 0045_account_opening_balance_date.sql
--
-- Accounts had a running opening_balance_npr but nothing saying as of when it
-- was struck. The Ledger tab's "Balance brought forward" / "Opening Balance"
-- row already edits the amount in place (via commitLedgerDraft's "opening"
-- branch) -- the accountant asked for the date to be editable there too, the
-- same way it already is for a bank transaction or journal entry row.
--
-- Nullable: existing accounts have no such date recorded and none is implied
-- by adding the column -- it stays blank until someone sets it.
--
-- The new column has to be the LAST one selected: `create or replace view`
-- matches existing output columns by position, not name, so inserting it
-- before `region` reads as renaming `region`/`createdAt` and Postgres refuses
-- (42P16). Appending after every existing column is the only order that
-- leaves them all alone.
-- ============================================================================

alter table accounts add column if not exists opening_balance_date date;

create or replace view fs_accounts as
 SELECT id::text AS id,
    name,
    type,
    is_bank AS "isBank",
    opening_balance_npr AS "openingBalanceNPR",
    created_at AS "createdAt",
    region,
    opening_balance_date AS "openingBalanceDate"
   FROM accounts;

-- ============================================================================
-- 0048_journal_advance_party_name.sql
--
-- Finance.jsx has validated for a while that posting a journal entry against
-- "Advance Received" or "Advance Payable" (Debit or Credit account) requires a
-- customer/supplier name -- isAdvanceEntry()'s comment says those two accounts
-- are "sub-ledgered by customer/supplier, not just a lump balance". But the
-- column that validation was meant to fill, journal_entries.party_name, was
-- never actually created, and no input field existed to type one into either
-- (both fixed alongside this migration). The result: nobody has ever been able
-- to save an Advance Received/Payable entry -- the alert
-- ("Enter the customer/supplier this advance belongs to.") fired every time
-- with no way to satisfy it. Confirmed live: zero journal_entries rows use
-- either account today.
--
-- New column is appended after every pre-existing one in the view (not
-- inserted between them) -- CREATE OR REPLACE VIEW only allows that; see
-- 0046's postmortem for why.
-- ============================================================================

alter table journal_entries add column if not exists party_name text;

create or replace view fs_journal_entries as
  select id::text as id,
    to_char(entry_date::timestamp with time zone, 'YYYY-MM-DD') as date,
    debit_account as "debitAccount",
    credit_account as "creditAccount",
    amount_npr as "amountNPR",
    description,
    reference,
    created_by as "createdBy",
    created_at as "createdAt",
    region,
    party_name as "partyName"
  from journal_entries;
alter view fs_journal_entries set (security_invoker = on);

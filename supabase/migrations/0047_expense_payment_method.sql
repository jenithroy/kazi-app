-- ============================================================================
-- 0047_expense_payment_method.sql
--
-- Expenses had no payment_type/bank_name at all, unlike purchases and
-- invoices -- so a paid expense could never post to the Cash/Bank Ledger or
-- Day Book: those only ever read purchases, paid/partial invoices, bank
-- transactions and journal entries (Finance.jsx's cashBankLedger/dayBook).
-- Reported as "All sections (Expenses, Purchase, Sales) should update on cash
-- and bank ledger".
--
-- Mirrors purchases.payment_type/bank_name exactly: nullable, no default, so
-- existing rows (all currently NULL) fall back to Cash the same way an old
-- purchase with no payment_type already does.
-- ============================================================================

alter table expenses add column if not exists payment_type text;
alter table expenses add column if not exists bank_name text;

-- New columns are appended after every pre-existing one, never inserted
-- between them: CREATE OR REPLACE VIEW requires each existing output column
-- to keep its name and ordinal position (Postgres error 42P16 otherwise).
create or replace view fs_finance_expenses as
  select id::text as id,
    to_char(expense_date::timestamp with time zone, 'YYYY-MM-DD') as date,
    category,
    amount_npr as "amountNPR",
    note,
    status,
    vat_bill as "vatBill",
    logged_by as "loggedBy",
    created_at as "createdAt",
    region,
    payment_type as "paymentType",
    bank_name as "bankName"
  from expenses;
alter view fs_finance_expenses set (security_invoker = on);

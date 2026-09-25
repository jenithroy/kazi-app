-- ============================================================================
-- 0044_day_book_finance_tab.sql
--
-- New Finance tab: Day Book. A Nepali day book (रोजमेल / Rojmel) is the
-- chronological book of original entry - every transaction logged in the
-- order it happened, before being posted into per-account ledgers. The app
-- already derives that same transaction feed for the Ledger tab's Cash/Bank
-- blocks (finance_purchases, paid invoices, bank_transactions, journal
-- entries); Day Book just merges it into one date-ordered list across every
-- account instead of bucketing it per account.
--
-- finance_tabs / position_finance_tabs / app_can_view_finance_tab /
-- my_finance_tabs already exist (0000_baseline.sql) and need no changes -
-- this only adds the one new tab row.
--
-- Permission: copied verbatim from whatever the Journal tab currently
-- grants (identical to Ledger's grants as of 2026-09-23: developer,
-- director, system-admin, operations-head, accountant,
-- marketing-coordinator, operations-intern - everyone except
-- content-coordinator and fashion-designer), so Day Book opens for exactly
-- the same people who can already see Journal and Ledger, with no Admin
-- Panel step needed after this runs.
-- ============================================================================

insert into finance_tabs (id, label, sort_order)
values ('day_book', 'Day Book', 11)
on conflict (id) do update
  set label = excluded.label, sort_order = excluded.sort_order;

insert into position_finance_tabs (position_id, tab_id, can_view, can_edit)
select position_id, 'day_book', can_view, can_edit
from position_finance_tabs
where tab_id = 'journal'
on conflict (position_id, tab_id) do update
  set can_view = excluded.can_view, can_edit = excluded.can_edit;

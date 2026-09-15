-- ============================================================================
-- 0035_doc_numbers_unique_per_fiscal_year.sql
--
-- A challan number is unique within its fiscal year, not for all time.
--
-- challans.challan_no has carried a plain UNIQUE since 0011, from when numbering
-- was one unbroken run (CH-001, CH-002, … forever). 0030 changed that: the
-- sequence restarts at 1 every Shrawan 1, so CH-01 is meant to exist once per
-- year. Those two rules cannot both hold, and the UNIQUE wins — the first
-- challan raised in a new fiscal year gets CH-01 from next_doc_number and the
-- insert fails on a duplicate key.
--
-- Nobody has hit it yet only because it takes a year boundary to reach: every
-- challan so far is in one year, where the two rules agree. The first one
-- raised after Shrawan 1 would fail, having already burned a number from the
-- counter, leaving a gap in the books to explain.
--
-- So the uniqueness moves to where it belongs: (fiscal year, number). Two
-- challans still cannot share a number within a year, which is the rule that
-- matters for IRD; a new year is free to start at CH-01 again.
--
-- fiscal_year is coalesced to '' in the index because a NULL would make every
-- such row distinct from every other, quietly allowing duplicates among the
-- rows least likely to be noticed. Anything not filed under a year is treated
-- as one group that still cannot repeat a number.
--
-- invoices and quotations have no equivalent constraint to move — invoice_no
-- and quotation_no were never declared unique. That is a separate gap, and
-- deliberately not widened here: adding uniqueness to those columns is a
-- change that can fail on data already on file, and it belongs in its own
-- migration run against a database someone is watching.
-- ============================================================================

alter table challans drop constraint if exists challans_challan_no_key;

create unique index if not exists challans_no_per_fiscal_year
  on challans (coalesce(fiscal_year, ''), challan_no);

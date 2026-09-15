-- ============================================================================
-- renumberDocsByFiscalYear.sql
--
-- The same job as renumberDocsByFiscalYear.mjs, written so it can be run from
-- the Supabase SQL editor when Node and the pooler URI are not to hand.
--
-- Rewrites invoices, challans and quotations so each Nepali fiscal year runs a
-- clean 1..N ordered by document date: INV-01, INV-02, ... INV-99, INV-100.
-- Invoices and challans also get their stored fiscal_year set to the year the
-- number was drawn from, so the two always agree.
--
-- Run it AFTER migrations 0034 and 0035. 0035 in particular: without it the
-- challan pass fails, because CH-01 exists once per fiscal year and the old
-- constraint allowed it only once in the whole table.
--
-- PART 1 is read-only and shows every change it would make. Run that first and
-- read it. PART 2 does the work, in one transaction.
--
-- The fiscal-year boundaries below are not computed in SQL — they come from the
-- same Bikram Sambat conversion table the app uses (src/utils/fiscalYear.js),
-- so Shrawan 1 lands on the exact Gregorian day each year rather than a guess.
--
-- NOT rewritten — review by hand if you rely on them:
--   * orders.invoice_ref / production order "Ref:" labels
--   * invoices.related_challan / related_quotation, challans.related_invoice,
--     quotations.related_invoice
--   * stock ledger notes ("Invoice INV-050")
--   * Finance ledger deep-link search keys
-- ============================================================================


-- ─── The plan, shared by both parts ─────────────────────────────────────────
-- A document with no usable date belongs to no fiscal year and is left exactly
-- as it is; PART 1 counts those separately so they are not a silent omission.

create or replace view _renumber_plan as
with fy(label, start_ad, end_ad) as (values
    ('2070/71', date '2013-07-16', date '2014-07-16'),
    ('2071/72', date '2014-07-17', date '2015-07-16'),
    ('2072/73', date '2015-07-17', date '2016-07-15'),
    ('2073/74', date '2016-07-16', date '2017-07-15'),
    ('2074/75', date '2017-07-16', date '2018-07-16'),
    ('2075/76', date '2018-07-17', date '2019-07-16'),
    ('2076/77', date '2019-07-17', date '2020-07-15'),
    ('2077/78', date '2020-07-16', date '2021-07-15'),
    ('2078/79', date '2021-07-16', date '2022-07-16'),
    ('2079/80', date '2022-07-17', date '2023-07-16'),
    ('2080/81', date '2023-07-17', date '2024-07-15'),
    ('2081/82', date '2024-07-16', date '2025-07-16'),
    ('2082/83', date '2025-07-17', date '2026-07-16'),
    ('2083/84', date '2026-07-17', date '2027-07-16'),
    ('2084/85', date '2027-07-17', date '2028-07-15'),
    ('2085/86', date '2028-07-16', date '2029-07-16'),
    ('2086/87', date '2029-07-17', date '2030-07-16'),
    ('2087/88', date '2030-07-17', date '2031-07-16'),
    ('2088/89', date '2031-07-17', date '2032-07-15'),
    ('2089/90', date '2032-07-16', date '2033-07-15')
),
doc(kind, prefix, id, old_no, dt, created) as (
  select 'invoice',   'INV', i.id::text, i.invoice_no,   i.invoice_date,  i.created_at from invoices   i
  union all
  select 'challan',   'CH',  c.id::text, c.challan_no,   c.challan_date,  c.created_at from challans   c
  union all
  select 'quotation', 'QT',  q.id::text, q.quotation_no, q.quote_date,    q.created_at from quotations q
),
seq as (
  select d.kind, d.prefix, d.id, d.old_no, d.dt, f.label as fy,
         row_number() over (
           partition by d.kind, f.label
           order by d.dt, d.created nulls last, d.old_no
         ) as rn
    from doc d
    join fy f on d.dt between f.start_ad and f.end_ad
)
select kind, prefix, id, old_no, dt, fy, rn,
       prefix || '-' || case when rn < 10 then '0' || rn::text else rn::text end as new_no
  from seq;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 — preview. Read-only: run this first and check it.
-- ════════════════════════════════════════════════════════════════════════════

-- Every number that would change.
select kind, fy, old_no as from_no, new_no as to_no, dt as document_date
  from _renumber_plan
 where old_no is distinct from new_no
 order by kind, fy, rn;

-- A one-line summary, plus anything being left alone for want of a date.
select
  (select count(*) from _renumber_plan where old_no is distinct from new_no) as numbers_changing,
  (select count(*) from _renumber_plan)                                      as documents_in_a_fiscal_year,
  (select count(*) from invoices   where invoice_date is null)
  + (select count(*) from challans   where challan_date is null)
  + (select count(*) from quotations where quote_date   is null)             as skipped_no_date;

-- The counters each fiscal year would be left on.
select 'billing:' || kind || ':' || fy as counter_id, max(rn) + 1 as next_val
  from _renumber_plan group by kind, fy order by 1;


-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 — apply. Everything below runs as one transaction: it all lands or
-- none of it does.
--
-- Each table is written twice. The first pass parks every affected row on a
-- value nothing else can hold, because a number this run is about to assign
-- may still belong to a different row at that moment — challans.challan_no is
-- UNIQUE, so a single-pass update would collide partway through and abort.
-- ════════════════════════════════════════════════════════════════════════════

begin;

create temp table _plan on commit drop as select * from _renumber_plan;

update invoices   set invoice_no   = 'RENUM:' || id::text where id::text in (select id from _plan where kind = 'invoice');
update challans   set challan_no   = 'RENUM:' || id::text where id::text in (select id from _plan where kind = 'challan');
update quotations set quotation_no = 'RENUM:' || id::text where id::text in (select id from _plan where kind = 'quotation');

-- The fiscal year stored on the record is set from the same plan that decided
-- the number, so the two can never disagree. It is also what the uniqueness
-- added in 0035 groups by, and what Billing prints beside the number.
update invoices t set fiscal_year = p.fy from _plan p where p.id = t.id::text and p.kind = 'invoice';
update challans t set fiscal_year = p.fy from _plan p where p.id = t.id::text and p.kind = 'challan';

update invoices   t set invoice_no   = p.new_no from _plan p where p.id = t.id::text and p.kind = 'invoice';
update challans   t set challan_no   = p.new_no from _plan p where p.id = t.id::text and p.kind = 'challan';
update quotations t set quotation_no = p.new_no from _plan p where p.id = t.id::text and p.kind = 'quotation';

-- Point each year's counter at the number after the last one written, so the
-- next document raised continues the run instead of colliding with it.
insert into counters (id, next_val)
select 'billing:' || kind || ':' || fy, max(rn) + 1
  from _plan group by kind, fy
on conflict (id) do update set next_val = excluded.next_val;

commit;

-- Housekeeping: the view was only scaffolding for this run.
drop view if exists _renumber_plan;

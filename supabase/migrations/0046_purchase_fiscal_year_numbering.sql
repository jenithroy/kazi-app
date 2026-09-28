-- ============================================================================
-- 0046_purchase_fiscal_year_numbering.sql
--
-- Restart purchase (expense) numbering at 1 every Nepali fiscal year, the same
-- way 0030 already does for invoices/challans/quotations. Requested by name:
-- "update invoice number from 1 of fiscal year 2083/84" -- and, per follow-up,
-- applied retroactively to every fiscal year on file, not just going forward.
--
-- Purchases used to run one continuous all-time series (EXP001..EXP249, see
-- 0042) by deliberate original design -- nextExpenseId() read every purchase
-- ever raised. This migration retires that: next_purchase_number() hands out
-- an atomic per-fiscal-year counter instead (mirroring next_doc_number), and
-- every purchase already on file is rebucketed into its own fiscal year's
-- clean 1..N run, ordered by purchase date.
--
-- The catch a plain per-year restart runs into: vat_bills.expense_id and
-- stock_movements.source_id link back to a purchase by the literal
-- "EXP001"-style string (see 0042's own comment on this), and once numbers
-- restart every year that string stops being unique -- FY2082/83's EXP001 and
-- FY2083/84's EXP001 both exist from here on, and looking either table up by
-- that string alone could return -- or delete -- the wrong purchase's record.
-- So before anything is renumbered, both tables get a real purchase_id (uuid)
-- column, backfilled from today's still-unique strings while they still ARE
-- unique. The renumber's own cascade, and deletePurchaseWithLinks going
-- forward, use that column instead. expense_id/source_id are kept in sync too
-- (existing note/search-key text reads them), but are no longer load-bearing.
--
-- Fiscal-year boundaries are not computed here -- Bikram Sambat conversion has
-- no reasonable pure-SQL implementation. They're the same literal
-- Shrawan-1-to-Shrawan-1 table scripts/renumberDocsByFiscalYear.sql already
-- carries, produced once from the app's own conversion tables
-- (src/utils/fiscalYear.js) and good for decades either side of today.
--
-- Safe to paste more than once: every step is idempotent (add-column-if-not-
-- exists, backfills guarded by "is distinct from"/"is null", create-or-replace).
-- ============================================================================

-- ── 1. purchases.fiscal_year, backfilled from purchase_date ────────────────
alter table purchases add column if not exists fiscal_year text;

update purchases p set fiscal_year = f.label
  from (values
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
  ) as f(label, start_ad, end_ad)
 where p.purchase_date between f.start_ad and f.end_ad
   and p.fiscal_year is distinct from f.label;

-- ── 2. purchase_id on the tables that used to link by string only ──────────
alter table vat_bills add column if not exists purchase_id uuid references purchases(id) on delete set null;
alter table stock_movements add column if not exists purchase_id uuid references purchases(id) on delete set null;

update vat_bills v set purchase_id = p.id
  from purchases p
 where v.purchase_id is null and v.expense_id = p.expense_ref;

update stock_movements m set purchase_id = p.id
  from purchases p
 where m.purchase_id is null and m.source = 'purchase' and m.source_id = p.expense_ref;

-- ── 3. Renumber every purchase into its own fiscal year's 1..N run ─────────
-- A purchase with no fiscal_year (no usable purchase_date) is left exactly as
-- it is, same as an undated invoice/challan/quotation in the doc renumberer.
update purchases p set expense_ref = plan.new_no
  from (
    select id, expense_ref as old_no,
           'EXP' || lpad(
             (row_number() over (
                partition by fiscal_year
                order by purchase_date, created_at, id::text
              ))::text, 3, '0'
           ) as new_no
      from purchases
     where fiscal_year is not null
  ) plan
 where plan.id = p.id and plan.old_no is distinct from plan.new_no;

-- Cascade by the now-reliable purchase_id -- a string match here would already
-- be ambiguous, since two fiscal years can produce the same EXP-number.
update vat_bills v set expense_id = p.expense_ref
  from purchases p where v.purchase_id = p.id and v.expense_id is distinct from p.expense_ref;

update stock_movements m set source_id = p.expense_ref
  from purchases p where m.purchase_id = p.id and m.source_id is distinct from p.expense_ref;

-- ── 4. Seed each fiscal year's counter to continue right after the renumber ─
insert into counters (id, next_val)
select 'purchase:' || fiscal_year, count(*) + 1
  from purchases
 where fiscal_year is not null
 group by fiscal_year
on conflict (id) do update set next_val = excluded.next_val;

-- ── 5. Atomic per-fiscal-year counter, mirroring next_doc_number (0030) ────
create or replace function public.next_purchase_number(fiscal_year text)
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  key text;
  n   integer;
begin
  if fiscal_year is null or fiscal_year !~ '^\d{4}/\d{2}$' then
    raise exception 'Invalid fiscal year: %', fiscal_year;
  end if;

  -- Purchases have their own permission scope (see 0042), distinct from
  -- billing's -- someone who can raise a purchase but not touch invoices
  -- must still be able to draw a number.
  if not app_can_edit('purchases') then
    raise exception 'Not allowed to allocate a purchase number'
      using errcode = 'insufficient_privilege';
  end if;

  key := 'purchase:' || fiscal_year;

  insert into counters (id, next_val) values (key, 2)
  on conflict (id) do update set next_val = counters.next_val + 1
  returning next_val - 1 into n;

  return 'EXP' || lpad(n::text, 3, '0');
end $$;

revoke all on function public.next_purchase_number(text) from public, anon;
grant execute on function public.next_purchase_number(text) to authenticated, service_role;

-- ── 6. resequence_purchase_expense_ids() now restarts each fiscal year ─────
-- "Renumber by date" (Purchases.jsx) keeps working exactly as before -- it
-- just no longer crosses fiscal years while doing it.
create or replace function public.resequence_purchase_expense_ids()
returns integer
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  ids  uuid[];
  olds text[];
  news text[];
  i    integer;
begin
  if not app_can_edit('purchases') then
    raise exception 'Not allowed to renumber purchases'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('resequence_purchase_expense_ids'));

  select array_agg(id order by rn), array_agg(old_no order by rn), array_agg(new_no order by rn)
    into ids, olds, news
    from (
      select id, old_no, rn, 'EXP' || lpad(rn::text, 3, '0') as new_no
        from (
          select id, expense_ref as old_no,
                 row_number() over (
                   partition by fiscal_year
                   order by purchase_date nulls last, created_at nulls last, id::text
                 ) as rn
            from purchases
           where fiscal_year is not null
        ) ranked
    ) plan
   where old_no is distinct from new_no;

  if ids is null then
    return 0;
  end if;

  for i in 1 .. array_length(ids, 1) loop
    update purchases set expense_ref = news[i] where id = ids[i];
    update stock_movements set source_id = news[i] where purchase_id = ids[i];
    update vat_bills set expense_id = news[i] where purchase_id = ids[i];
  end loop;

  return array_length(ids, 1);
end $$;

revoke all on function public.resequence_purchase_expense_ids() from public, anon;
grant execute on function public.resequence_purchase_expense_ids() to authenticated, service_role;

-- ── 7. Expose the new columns to the app ────────────────────────────────────
-- New columns are appended after every pre-existing one, never inserted
-- between them: CREATE OR REPLACE VIEW requires each existing output column
-- to keep its name and ordinal position, and only allows adding columns at
-- the end of the list (Postgres error 42P16 otherwise).
create or replace view fs_finance_purchases as
  select id::text as id,
    expense_ref as "expenseId",
    to_char(purchase_date::timestamp with time zone, 'YYYY-MM-DD') as date,
    expense_item as "expenseItem",
    category,
    amount_npr as "amountNPR",
    subtotal_npr as "subtotalNPR",
    discount_amt as "discountAmt",
    taxable_amt as "taxableAmt",
    vat_amount_npr as "vatAmountNPR",
    vat_bill as "vatBill",
    payment_type as "paymentType",
    bank_name as "bankName",
    created_at as "createdAt",
    coalesce(( select jsonb_agg(jsonb_build_object('particulars', l.particulars, 'quantity', l.qty, 'unit', l.unit, 'rate', l.rate, 'amount', l.amount, 'stockItemId', l.stock_item_id) order by l.seq)
        from line_items l where l.purchase_id = p.id), '[]'::jsonb) as items,
    region,
    fiscal_year as "fiscalYear"
  from purchases p;
alter view fs_finance_purchases set (security_invoker = on);

create or replace view fs_vat_bills as
  select id::text as id,
    expense_id as "expenseId",
    expense_item as "expenseItem",
    file_name as "fileName",
    file_url as "fileUrl",
    storage_path as "storagePath",
    file_type as "fileType",
    source,
    uploaded_by as "uploadedBy",
    uploaded_at as "uploadedAt",
    region,
    purchase_id::text as "purchaseId"
  from vat_bills v;
alter view fs_vat_bills set (security_invoker = on);

create or replace view fs_stock_movements as
  select id::text as id,
    item_id::text as "itemId",
    to_char(moved_on::timestamp with time zone, 'YYYY-MM-DD') as date,
    qty,
    direction,
    source,
    source_id as "sourceId",
    amount_npr as "amountNPR",
    note,
    created_by as "createdBy",
    created_at as "createdAt",
    region,
    purchase_id::text as "purchaseId"
  from stock_movements m;
alter view fs_stock_movements set (security_invoker = on);

-- ============================================================================
-- 0037_invoice_quotation_no_per_fiscal_year.sql
--
-- invoices.invoice_no and quotations.quotation_no carry a plain UNIQUE, dating
-- from when numbering was one unbroken run for all time. 0030 changed that:
-- the sequence restarts at 1 every Shrawan 1, so INV-001 is meant to exist
-- once per fiscal year, not once ever. 0035 already moved challans over to
-- (fiscal_year, challan_no) for exactly this reason, but its own comment
-- claimed "invoices and quotations have no equivalent constraint to move" —
-- wrong: the baseline (0000) declares both invoices_invoice_no_key and
-- quotations_quotation_no_key as plain UNIQUE. This is the gap 0035 meant to
-- close and missed.
--
-- It surfaced running scripts/renumberDocsByFiscalYear.sql: renumbering two
-- fiscal years to their own clean 1..N run means both years get an INV-013,
-- and the plain UNIQUE rejects the second one with "duplicate key value
-- violates unique constraint invoices_invoice_no_key" — the exact error hit.
-- Left alone it is not only a renumbering problem: the first invoice raised
-- in a fiscal year whose number a past year also used (which is every year,
-- since almost every year has an INV-001) would fail the same way from the
-- app itself.
--
-- quotations never got a fiscal_year column at all (0030's counter seed
-- comment says so explicitly), so there has been nothing to scope its
-- uniqueness by. Added here, backed by the same "coalesce to ''" index 0035
-- used for challans — existing quotations keep a NULL fiscal_year (grouped
-- together, still unique among themselves, matching how the plain UNIQUE
-- already treated them) and new ones get it filled in from here on, the same
-- way invoices and challans already do (see Billing.jsx's create path, which
-- already sends fiscalYear for every document type — quotations were the only
-- one with no column to receive it).
-- ============================================================================

alter table quotations add column if not exists fiscal_year text;

-- fs_quotations is what the app reads through, and what scripts/gen-schema-map.cjs
-- parses to know that "fiscalYear" on a quotation writes to fiscal_year. Without
-- this the column exists but the app can neither read nor write it.
create or replace view fs_quotations as
  select id::text as id,
    quotation_no        as "quotationNumber",
    client_name         as "clientName",
    client_address      as "clientAddress",
    client_phone        as "clientPhone",
    client_pan          as "clientPAN",
    currency,
    to_char(quote_date::timestamptz,  'YYYY-MM-DD') as date,
    to_char(valid_until::timestamptz, 'YYYY-MM-DD') as "validUntil",
    subtotal_npr        as "subtotalNPR",
    discount_pct        as "discountPct",
    discount_amt_npr    as "discountAmtNPR",
    taxable_amt_npr     as "taxableAmtNPR",
    vat_amount_npr      as "vatAmountNPR",
    total_npr           as "totalNPR",
    status,
    terms,
    note,
    related_invoice     as "relatedInvoice",
    created_by          as "createdBy",
    updated_by          as "updatedBy",
    created_at          as "createdAt",
    updated_at          as "updatedAt",
    coalesce((select jsonb_agg(jsonb_build_object(
        'description', l.description, 'qty', l.qty, 'unit', l.unit,
        'rate', l.rate, 'amount', l.amount,
        'stockItemId', l.stock_item_id) order by l.seq)
      from line_items l where l.quotation_id = q.id), '[]'::jsonb) as items,
    discount_mode       as "discountMode",
    discount_flat_amt   as "discountFlatAmt",
    region,
    fiscal_year          as "fiscalYear"
  from quotations q;

alter view fs_quotations set (security_invoker = on);

alter table invoices   drop constraint if exists invoices_invoice_no_key;
alter table quotations drop constraint if exists quotations_quotation_no_key;

create unique index if not exists invoices_no_per_fiscal_year
  on invoices (coalesce(fiscal_year, ''), invoice_no);

create unique index if not exists quotations_no_per_fiscal_year
  on quotations (coalesce(fiscal_year, ''), quotation_no);

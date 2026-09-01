-- ============================================================================
-- 0023_expose_discount_and_stock_link.sql
--
-- Surfaces the columns 0022 added through the read models the app uses:
--
--   discountMode / discountFlatAmt  on invoices, quotations and challans
--   stockItemId                     on every line item
--
-- CREATE OR REPLACE is fine here: it allows appending columns and allows an
-- existing column's expression to change as long as its name and type do not,
-- which is what happens to `items` (still jsonb, one more key inside). The two
-- new columns therefore land at the END of each view. Order does not matter —
-- the app reads by key.
--
-- Every one of these re-applies security_invoker afterwards. CREATE OR REPLACE
-- silently drops reloptions, which is how ten views ended up reading past row
-- level security before 0018 caught it.
-- ============================================================================

create or replace view fs_invoices as
  select id::text as id,
    invoice_no          as "invoiceNumber",
    client_name         as "clientName",
    client_address      as "clientAddress",
    client_phone        as "clientPhone",
    client_pan          as "clientPAN",
    currency,
    to_char(invoice_date::timestamptz, 'YYYY-MM-DD') as date,
    to_char(due_date::timestamptz,     'YYYY-MM-DD') as "dueDate",
    fiscal_year         as "fiscalYear",
    apply_vat           as "applyVAT",
    subtotal_npr        as "subtotalNPR",
    discount_pct        as "discountPct",
    discount_amt_npr    as "discountAmtNPR",
    taxable_amt_npr     as "taxableAmtNPR",
    vat_amount_npr      as "vatAmountNPR",
    total_npr           as "totalNPR",
    amount_paid         as "amountPaid",
    status,
    payment_terms       as "paymentTerms",
    payment_type        as "paymentType",
    bank_name           as "bankName",
    related_quotation   as "relatedQuotation",
    related_challan     as "relatedChallan",
    challan_number      as "challanNumber",
    note,
    created_by          as "createdBy",
    updated_by          as "updatedBy",
    created_at          as "createdAt",
    updated_at          as "updatedAt",
    coalesce((select jsonb_agg(jsonb_build_object(
        'description', l.description, 'qty', l.qty, 'unit', l.unit,
        'rate', l.rate, 'amount', l.amount,
        'stockItemId', l.stock_item_id) order by l.seq)
      from line_items l where l.invoice_id = i.id), '[]'::jsonb) as items,
    discount_mode       as "discountMode",
    discount_flat_amt   as "discountFlatAmt"
  from invoices i;
alter view fs_invoices set (security_invoker = on);

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
    discount_flat_amt   as "discountFlatAmt"
  from quotations q;
alter view fs_quotations set (security_invoker = on);

create or replace view fs_challans as
  select c.id::text as id,
    c.challan_no        as "challanNumber",
    c.client_name       as "clientName",
    c.client_address    as "clientAddress",
    c.client_phone      as "clientPhone",
    c.client_pan        as "clientPAN",
    c.currency,
    to_char(c.challan_date::timestamptz, 'YYYY-MM-DD') as date,
    c.fiscal_year       as "fiscalYear",
    c.subtotal_npr      as "subtotalNPR",
    c.discount_pct      as "discountPct",
    c.discount_amt_npr  as "discountAmtNPR",
    c.taxable_amt_npr   as "taxableAmtNPR",
    c.vat_amount_npr    as "vatAmountNPR",
    c.total_npr         as "totalNPR",
    c.status,
    c.vehicle_no        as "vehicleNo",
    c.driver_name       as "driverName",
    c.route_from        as "routeFrom",
    c.route_to          as "routeTo",
    c.related_invoice   as "relatedInvoice",
    c.note,
    c.created_by        as "createdBy",
    c.updated_by        as "updatedBy",
    c.created_at        as "createdAt",
    c.updated_at        as "updatedAt",
    coalesce((select jsonb_agg(jsonb_build_object(
        'description', l.description, 'particulars', l.particulars,
        'qty', l.qty, 'unit', l.unit, 'rate', l.rate, 'amount', l.amount,
        'stockItemId', l.stock_item_id) order by l.seq)
      from line_items l where l.challan_id = c.id), '[]'::jsonb) as items,
    c.discount_mode     as "discountMode",
    c.discount_flat_amt as "discountFlatAmt"
  from challans c;
alter view fs_challans set (security_invoker = on);

create or replace view fs_finance_purchases as
  select id::text as id,
    expense_ref         as "expenseId",
    to_char(purchase_date::timestamptz, 'YYYY-MM-DD') as date,
    expense_item        as "expenseItem",
    category,
    amount_npr          as "amountNPR",
    subtotal_npr        as "subtotalNPR",
    discount_amt        as "discountAmt",
    taxable_amt         as "taxableAmt",
    vat_amount_npr      as "vatAmountNPR",
    vat_bill            as "vatBill",
    payment_type        as "paymentType",
    bank_name           as "bankName",
    created_at          as "createdAt",
    coalesce((select jsonb_agg(jsonb_build_object(
        'particulars', l.particulars, 'quantity', l.qty, 'unit', l.unit,
        'rate', l.rate, 'amount', l.amount,
        'stockItemId', l.stock_item_id) order by l.seq)
      from line_items l where l.purchase_id = p.id), '[]'::jsonb) as items
  from purchases p;
alter view fs_finance_purchases set (security_invoker = on);

-- Guard: nothing above may have left a view running as its owner.
do $$
declare leaking text;
begin
  select string_agg(c.relname, ', ') into leaking
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and c.relname <> 'fs_employees'   -- deliberately definer, see 0021
     and coalesce((select option_value from pg_options_to_table(c.reloptions)
                   where option_name = 'security_invoker'), 'off') not in ('on', 'true');
  if leaking is not null then
    raise exception 'These views bypass row level security: %', leaking;
  end if;
end $$;

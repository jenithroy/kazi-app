-- ============================================================================
-- 0024_order_sample_and_invoice_link.sql
--
--   orders.sample_id
--     The order form picks a sample from the library and writes both sampleId
--     and sampleName. Only the name had a column, so the link was reduced to a
--     free-text label — rename the sample and the order points at nothing.
--
--   fs_invoices."linkedOrderId"
--     invoices.linked_order_id already exists and buildInvoiceDoc() sets it when
--     raising an invoice off an order, but the view never exposed it, so the
--     write was dropped and order-to-invoice was one-way.
-- ============================================================================

alter table orders
  add column if not exists sample_id uuid references samples(id) on delete set null;

create index if not exists orders_sample_idx on orders(sample_id);

-- Appended, because CREATE OR REPLACE VIEW may only add columns at the end.
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
    discount_flat_amt   as "discountFlatAmt",
    linked_order_id     as "linkedOrderId"
  from invoices i;
alter view fs_invoices set (security_invoker = on);

-- fs_orders gains sampleId, also appended.
create or replace view fs_orders as
  select o.id::text as id,
    o.order_no                as "orderId",
    o.customer_name           as "customerName",
    o.style_name              as "styleName",
    o.colorway,
    o.fabric_type             as "fabricType",
    o.quantity,
    o.price_per_pc_npr        as "pricePerPcNPR",
    o.total_value_npr         as "totalValueNPR",
    o.fabric_cost_per_pc_npr  as "fabricCostPerPcNPR",
    o.fabric_grams_used       as "fabricGramsUsed",
    o.fabric_required_per_pc  as "fabricRequiredPerPc",
    o.material_cost_total_npr as "materialCostTotalNPR",
    o.stage,
    o.status,
    to_char(o.order_date::timestamptz,    'YYYY-MM-DD') as date,
    to_char(o.delivery_date::timestamptz, 'YYYY-MM-DD') as "deliveryDate",
    coalesce(pe.full_name, '') as "assignedTo",
    o.invoice_ref             as "invoiceRef",
    o.sample_name             as "sampleName",
    o.notes,
    o.created_by              as "createdBy",
    o.created_at              as "createdAt",
    coalesce((select jsonb_agg(jsonb_build_object(
        'stage', h.stage,
        'date',  to_char(h.changed_at::timestamptz, 'YYYY-MM-DD'),
        'by',    h.changed_by) order by h.seq)
      from order_stage_history h where h.order_id = o.id), '[]'::jsonb) as "stageHistory",
    coalesce((select jsonb_agg(jsonb_build_object(
        'id',   n.id::text,
        'text', n.text,
        'by',   n.author) order by n.created_at)
      from order_notes n where n.order_id = o.id), '[]'::jsonb) as "notesList",
    o.customer_id,
    o.assigned_to,
    o.embellishments,
    o.sample_id::text         as "sampleId"
  from orders o
  left join people pe on pe.id = o.assigned_to;
alter view fs_orders set (security_invoker = on);

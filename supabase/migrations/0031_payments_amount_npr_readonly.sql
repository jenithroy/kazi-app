-- ============================================================================
-- 0031_payments_amount_npr_readonly.sql
--
-- fs_payments.amountNPR is a converted figure, never a column to write back.
-- As written in 0030 it was `case when i.currency = 'GBP' then p.amount * 200
-- else p.amount end`, and the schema-map generator treats any expression that
-- touches exactly one base-table column as writable -- so it mapped amountNPR
-- straight onto payments.amount.
--
-- Nothing writes it today, but the mapping is a trap: writing amountNPR on a
-- GBP invoice would store a rupee figure in a column the trigger sums against
-- a pound total, and the invoice's balance would quietly go wrong.
--
-- Moving the conversion into a correlated subquery makes it structurally
-- unwritable -- the generator refuses anything containing SELECT -- rather
-- than relying on a comment nobody reads. The lookup is on invoices' primary
-- key, so it costs effectively nothing.
-- ============================================================================

create or replace view fs_payments as
  select p.id::text          as id,
    p.invoice_id::text       as "invoiceId",
    p.customer_id::text      as "customerId",
    to_char(p.paid_on::timestamptz, 'YYYY-MM-DD') as "paidOn",
    p.amount                 as "amount",
    p.method,
    p.bank_name              as "bankName",
    p.reference,
    p.note,
    p.is_opening             as "isOpening",
    p.recorded_by            as "recordedBy",
    p.created_at             as "createdAt",
    p.region,
    i.invoice_no             as "invoiceNumber",
    i.currency               as "invoiceCurrency",
    (select case when i2.currency = 'GBP' then p.amount * 200 else p.amount end
       from invoices i2 where i2.id = p.invoice_id) as "amountNPR",
    i.total_npr              as "invoiceTotalNPR",
    coalesce(c.name, i.client_name) as "customerName"
  from payments p
  join invoices i  on i.id = p.invoice_id
  left join customers c on c.id = p.customer_id;
alter view fs_payments set (security_invoker = on);

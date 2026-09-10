-- ============================================================================
-- 0030_payments_and_customer_links.sql
--
-- Two problems, one migration, because the second cannot be answered without
-- the first.
--
-- 1. Paying an invoice overwrote invoices.amount_paid in place. The running
--    total survived; every individual payment did not. Nobody could say when
--    money arrived, how many instalments it came in, or how long a customer
--    takes to pay -- and no amount of front-end work recovers a date that was
--    never written down. `payments` makes each payment a row, and amount_paid
--    becomes a cached sum maintained by trigger so every existing reader
--    (Finance P&L, the dashboards, the billing summary) keeps working
--    untouched.
--
-- 2. Orders and invoices identified their customer by typed-in text. Customer
--    rows were only ever created by hand on the Customers page, which nobody
--    did, so that page sat near-empty while the orders table filled up with
--    names. This backfills customers from the names people actually typed,
--    links orders and invoices to them by id, and leaves the app writing that
--    id from now on.
--
-- Name matching here is deliberately conservative: trimmed and case-folded,
-- nothing cleverer. "Next plc" and "next  PLC" merge; "Next" and "Next plc"
-- stay apart, because only a human knows whether those are one buyer, and
-- silently merging two real customers is far worse than listing one twice.
-- ============================================================================


-- --- 1. Customers backfilled from the names typed onto orders --------------

insert into customers (name, region, notes)
select distinct on (lower(btrim(o.customer_name)))
       btrim(o.customer_name),
       o.region,
       'Created automatically from existing orders.'
  from orders o
 where btrim(coalesce(o.customer_name, '')) <> ''
   and not exists (
         select 1 from customers c
          where lower(btrim(c.name)) = lower(btrim(o.customer_name)))
 order by lower(btrim(o.customer_name)), o.created_at;

update orders o
   set customer_id = c.id
  from customers c
 where o.customer_id is null
   and btrim(coalesce(o.customer_name, '')) <> ''
   and lower(btrim(c.name)) = lower(btrim(o.customer_name));

-- Invoices raised without an order carry a client name and nothing else. Most
-- of the billed money sits on those, so seeding customers only from orders
-- left two thirds of revenue attached to nobody.

insert into customers (name, region, notes)
select distinct on (lower(btrim(i.client_name)))
       btrim(i.client_name),
       i.region,
       'Created automatically from existing invoices.'
  from invoices i
 where btrim(coalesce(i.client_name, '')) <> ''
   and not exists (
         select 1 from customers c
          where lower(btrim(c.name)) = lower(btrim(i.client_name)))
 order by lower(btrim(i.client_name)), i.created_at;


-- --- 2. Invoices point at a customer, not just a name ----------------------
--
-- Preference order: the customer on the order this invoice was raised from,
-- then a name match. An invoice raised from an order is authoritative even if
-- someone later edited the client name on the invoice itself.

alter table invoices add column if not exists customer_id uuid;

alter table invoices drop constraint if exists invoices_customer_id_fkey;
alter table invoices add constraint invoices_customer_id_fkey
  foreign key (customer_id) references customers(id) on delete set null;

update invoices i
   set customer_id = o.customer_id
  from orders o
 where i.customer_id is null
   and i.linked_order_id = o.id
   and o.customer_id is not null;

update invoices i
   set customer_id = c.id
  from customers c
 where i.customer_id is null
   and btrim(coalesce(i.client_name, '')) <> ''
   and lower(btrim(c.name)) = lower(btrim(i.client_name));

create index if not exists invoices_customer_id_idx on invoices(customer_id);


-- --- 3. Payments ----------------------------------------------------------

create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id)  on delete cascade,
  customer_id   uuid          references customers(id) on delete set null,
  paid_on       date   not null default current_date,
  -- Held in the INVOICE's own currency, not always rupees. invoices.total_npr
  -- and amount_paid are already stored that way for GBP invoices (the _npr
  -- suffix predates GBP support and is a misnomer there), and every page that
  -- reads them converts on the way out. A payments table in rupees would make
  -- the trigger below write an NPR total onto a GBP invoice, so it follows the
  -- invoice instead. Convert for reporting the same way the rest of the app
  -- does: multiply by the GBP rate when invoices.currency = 'GBP'.
  amount        numeric(14,2) not null check (amount > 0),
  method        text,
  bank_name     text,
  reference     text,
  note          text,
  -- True only for the rows synthesised below from a pre-existing amount_paid.
  -- Their date is a guess, and the UI has to be able to say so rather than
  -- present invented precision as fact.
  is_opening    boolean not null default false,
  recorded_by   text,
  region        text,
  created_at    timestamptz not null default now()
);

create index if not exists payments_invoice_idx  on payments(invoice_id);
create index if not exists payments_customer_idx on payments(customer_id, paid_on desc);
create index if not exists payments_paid_on_idx  on payments(paid_on desc);

alter table payments drop constraint if exists payments_region_check;
alter table payments add constraint payments_region_check
  check (region is null or region in ('uk', 'nepal'));


-- --- 4. Everything already paid becomes one opening row --------------------
--
-- Dated to the invoice date because that is the only date on record. Flagged
-- so nothing downstream mistakes it for a real payment date.

insert into payments (invoice_id, customer_id, paid_on, amount,
                      note, is_opening, region)
select i.id,
       i.customer_id,
       coalesce(i.invoice_date, i.created_at::date),
       i.amount_paid,
       'Opening balance carried over when payment history began. The actual payment date was not recorded.',
       true,
       i.region
  from invoices i
 where coalesce(i.amount_paid, 0) > 0
   and not exists (select 1 from payments p where p.invoice_id = i.id);


-- --- 5. amount_paid becomes a cached sum -----------------------------------
--
-- Kept as a real column rather than dropped, because a dozen places read it
-- and a stored total is cheaper than a subquery on every dashboard load. The
-- trigger is what makes it trustworthy: it is now impossible for a payment to
-- exist without the invoice total reflecting it.
--
-- Status is deliberately NOT touched here. Draft/Sent/Partial/Paid/Cancelled
-- is an app-level workflow, and a cancelled invoice that happens to be fully
-- paid must not silently reopen as Paid.

create or replace function sync_invoice_amount_paid() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  target uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update invoices
     set amount_paid = coalesce(
           (select sum(p.amount) from payments p where p.invoice_id = target), 0),
         updated_at  = now()
   where id = target;
  return null;
end $fn$;

drop trigger if exists payments_sync_invoice on payments;
create trigger payments_sync_invoice
  after insert or update or delete on payments
  for each row execute function sync_invoice_amount_paid();


-- --- 6. Access ------------------------------------------------------------
--
-- A payment is a billing record and is gated exactly like the invoice it
-- belongs to.

alter table payments enable row level security;

drop policy if exists "require_known_issuer" on payments;
create policy "require_known_issuer" on payments
  as restrictive for all
  to authenticated
  using (app_issuer_ok());

drop policy if exists "sect_read" on payments;
create policy "sect_read" on payments
  as permissive for select
  to authenticated
  using (app_can_view('billing'::text));

drop policy if exists "sect_write" on payments;
create policy "sect_write" on payments
  as permissive for all
  to authenticated
  using (app_can_edit('billing'::text))
  with check (app_can_edit('billing'::text));


-- --- 7. Read models -------------------------------------------------------

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
    -- Pre-converted so callers cannot forget; GBP_RATE lives in the app, so
    -- this uses the same 200 the rest of the schema assumes.
    (case when i.currency = 'GBP' then p.amount * 200 else p.amount end) as "amountNPR",
    i.total_npr              as "invoiceTotalNPR",
    coalesce(c.name, i.client_name) as "customerName"
  from payments p
  join invoices i  on i.id = p.invoice_id
  left join customers c on c.id = p.customer_id;
alter view fs_payments set (security_invoker = on);

comment on view fs_payments is
  'Read model for payments. security_invoker, so billing RLS applies. '
  'Re-apply that setting after any CREATE OR REPLACE -- it silently drops '
  'reloptions. See migration 0018.';

-- fs_invoices gains customerId. Every other column is carried over from 0029
-- unchanged; CREATE OR REPLACE cannot add a column without restating them all.
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
    linked_order_id     as "linkedOrderId",
    region,
    -- Appended last on purpose: CREATE OR REPLACE VIEW can add columns only at
    -- the end, and renaming an existing position is rejected outright.
    customer_id         as "customerId"
  from invoices i;
alter view fs_invoices set (security_invoker = on);

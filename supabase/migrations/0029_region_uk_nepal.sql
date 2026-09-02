-- ============================================================================
-- 0029_region_uk_nepal.sql
--
-- Splits the operational data in two: the UK arm and the Nepal factory.
--
-- Every page outside Marketing, Messenger, Admin Panel, Employees & HR and
-- Content now shows one region at a time, chosen by a switch in the page
-- header. This migration gives the data the column that switch filters on.
--
-- Two shapes of region:
--
--   Tagged   — a real `region` column on the record itself. An order, a stock
--              item, a task, an invoice, an expense: things that belong to one
--              side of the business because somebody said so.
--
--   Derived  — read off the person the row is about (people.location, which
--              already holds 'uk' / 'nepal'). Attendance, clock-ins and payroll
--              follow their employee; there is nothing to tag by hand, and a
--              record can never disagree with the staff member it belongs to.
--              These are read-only through the view, on purpose.
--
-- NULL means "not yet assigned to a region". The app shows those rows under
-- both switches rather than hiding them, so nothing that exists today
-- disappears the moment this lands — an untagged backlog stays visible while
-- it is worked through. Tag a row and it moves to that side only.
--
-- CREATE OR REPLACE VIEW may only append columns, which is why `region` lands
-- at the end of each select list. Order does not matter — the app reads by key.
-- Every replaced view re-asserts security_invoker afterwards, because CREATE OR
-- REPLACE silently drops reloptions (see 0018). fs_employees is the one
-- deliberate exception (see 0021 and 0026) and keeps its definer behaviour.
-- ============================================================================


-- ─── 1. The column ─────────────────────────────────────────────────────────
--
-- Nullable, constrained to the two regions, and indexed because every list on
-- every one of these pages is about to filter on it.

-- `patterns` is in this list for uniformity, but the app does not use its
-- region: a tech pack already carries `market` ('UK' / 'Nepal'), set on the
-- spec sheet, and the Tech Packs tab filters on that instead. Two fields
-- answering one question is two things to keep in step, so the column stays
-- unwritten. See src/utils/region.js -> filterByRegionField.
do $$
declare t text;
begin
  foreach t in array array[
    'orders', 'order_costs', 'order_assignments',
    'tasks',
    'inventory_items', 'fabrics', 'patterns', 'processes', 'samples',
    'production_batches', 'qc_logs',
    'invoices', 'quotations', 'challans',
    'purchases', 'expenses', 'vat_bills', 'budget_requests',
    'journal_entries', 'bank_transactions', 'accounts',
    'stock_movements', 'customers',
    'unit_economics', 'product_costs'
  ] loop
    execute format('alter table %I add column if not exists region text', t);
    execute format('alter table %I drop constraint if exists %I', t, t || '_region_check');
    execute format(
      'alter table %I add constraint %I check (region is null or region in (''uk'', ''nepal''))',
      t, t || '_region_check');
    execute format('create index if not exists %I on %I (region)', t || '_region_idx', t);
  end loop;
end $$;


-- ─── 2. Backfill what can be inferred ──────────────────────────────────────
--
-- An order's costs and its worker assignments belong wherever the order does.
-- Only rows still NULL are touched, so re-running this never overwrites a
-- deliberate choice.

update order_costs c
   set region = o.region
  from orders o
 where o.id = c.order_id
   and c.region is null
   and o.region is not null;

update order_assignments a
   set region = o.region
  from orders o
 where o.id = a.order_id
   and a.region is null
   and o.region is not null;


-- ─── 3. Views: tagged region ───────────────────────────────────────────────

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
    o.sample_id::text         as "sampleId",
    o.region
  from orders o
  left join people pe on pe.id = o.assigned_to;
alter view fs_orders set (security_invoker = on);

comment on view fs_orders is
  'Firestore-shaped read model for orders. Runs as the caller (security_invoker), '
  'so row level security on `orders` applies. Re-apply that setting after any '
  'CREATE OR REPLACE — it silently drops reloptions. See migration 0018.';

create or replace view fs_order_costs as
  select c.id::text as id,
    c.order_ref      as "orderId",   -- the app's key, e.g. ORD-051
    c.order_ref      as "orderRef",
    c.order_id::text as "linkedOrderId",
    c.material_npr   as material,
    c.labour_npr     as labour,
    c.overhead_npr   as overhead,
    c.shipping_npr   as shipping,
    c.total_npr      as "totalNPR",
    c.note,
    c.created_by     as "createdBy",
    c.created_at     as "createdAt",
    c.updated_at     as "updatedAt",
    c.region
  from order_costs c;
alter view fs_order_costs set (security_invoker = on);

create or replace view fs_order_assignments as
  select a.id::text as id,
    a.order_id::text                      as "orderId",
    a.order_ref                           as "orderRef",
    coalesce(pe.full_name, a.assigned_to) as "assignedTo",
    coalesce(pe.full_name, a.assigned_to) as "workerName",
    a.person_id::text                     as "personId",
    a.person_id::text                     as "workerId",
    a.worker_telegram_id                  as "workerTelegramId",
    a.customer_name                       as "customerName",
    a.quantity,
    a.stage,
    a.status,
    a.assigned_at                         as "assignedAt",
    a.accepted_at                         as "acceptedAt",
    a.completed_at                        as "completedAt",
    a.timeout_at                          as "timeoutAt",
    a.timeout_hours                       as "timeoutHours",
    a.notified_manager                    as "notifiedManager",
    a.assigned_by                         as "assignedBy",
    a.note,
    a.region
  from order_assignments a
  left join people pe on pe.id = a.person_id;
alter view fs_order_assignments set (security_invoker = on);

create or replace view fs_tasks as
  select t.id::text as id,
    t.title,
    t.description,
    t.notes,
    t.status,
    t.priority,
    t.category,
    coalesce(pe.full_name, t.assignee, '') as assignee,
    t.customer,
    t.order_ref as "orderRef",
    coalesce(to_char(t.due_date::timestamptz, 'YYYY-MM-DD'), '') as "dueDate",
    t.created_by as "createdBy",
    t.created_at as "createdAt",
    t.assignee_id,
    t.region
  from tasks t
  left join people pe on pe.id = t.assignee_id;
alter view fs_tasks set (security_invoker = on);

create or replace view fs_inventory as
  select id::text as id,
    item_ref        as "itemId",
    item,
    category,
    unit,
    supplier,
    location,
    condition,
    owner,
    opening_stock   as "openingStock",
    stock_in        as "stockIn",
    stock_used      as "stockUsed",
    min_level       as "minLevel",
    unit_cost_npr   as "unitCostNPR",
    size_rows       as "sizeRows",
    damage_log      as "damageLog",
    to_char(last_updated::timestamptz, 'YYYY-MM-DD') as "lastUpdated",
    created_by      as "createdBy",
    updated_by      as "updatedBy",
    created_at      as "createdAt",
    region
  from inventory_items;
alter view fs_inventory set (security_invoker = on);

create or replace view fs_fabrics as
  select id::text as id,
    name,
    type,
    composition,
    supplier,
    gsm,
    weight,
    price_per_meter,
    price_per_kg    as "pricePerKg",
    available_colors,
    status,
    notes,
    swatch_image_url as "swatchImageUrl",
    created_at      as "createdAt",
    updated_at      as "updatedAt",
    region
  from fabrics;
alter view fs_fabrics set (security_invoker = on);

create or replace view fs_patterns as
  select id::text as id,
    style_no        as "styleNo",
    name,
    product_type,
    category,
    season,
    market,
    designer_name   as "designerName",
    sizes_available,
    available_colors,
    spec_size       as "specSize",
    to_char(spec_date::timestamptz, 'YYYY-MM-DD') as "specDate",
    trims,
    wash_care       as "washCare",
    remarks,
    notes,
    measurements,
    fabric_rows     as "fabricRows",
    front_sketch_url as "frontSketchUrl",
    back_sketch_url as "backSketchUrl",
    tech_pack_url,
    tech_pack_images,
    created_at      as "createdAt",
    updated_at      as "updatedAt",
    region
  from patterns;
alter view fs_patterns set (security_invoker = on);

create or replace view fs_processes as
  select id::text as id,
    name,
    category,
    description,
    notes,
    cost_per_unit,
    lead_time_days,
    min_quantity,
    created_at      as "createdAt",
    updated_at      as "updatedAt",
    region
  from processes;
alter view fs_processes set (security_invoker = on);

create or replace view fs_samples as
  select s.id::text as id,
    s.name, s.product_type, s.stage, s.status,
    s.fabric_used, s.size, s.color, s.cost, s.photo_url, s.notes,
    s.created_at as "createdAt",
    s.updated_at as "updatedAt",
    s.region
  from samples s;
alter view fs_samples set (security_invoker = on);

create or replace view fs_production as
  select id::text as id,
    batch_ref       as "batchId",
    to_char(batch_date::timestamptz, 'YYYY-MM-DD') as date,
    cut,
    stitched,
    passed,
    rejected,
    note,
    logged_by       as "loggedBy",
    created_at      as "createdAt",
    region
  from production_batches;
alter view fs_production set (security_invoker = on);

create or replace view fs_qc_logs as
  select id::text as id,
    qc_ref          as "qcId",
    batch_ref       as "batchId",
    to_char(log_date::timestamptz, 'YYYY-MM-DD') as date,
    inspected,
    passed,
    rejected,
    defect_type     as "defectType",
    action,
    checked_by      as "checkedBy",
    created_at      as "createdAt",
    region
  from qc_logs;
alter view fs_qc_logs set (security_invoker = on);

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
    region
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
    discount_flat_amt   as "discountFlatAmt",
    region
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
    c.discount_flat_amt as "discountFlatAmt",
    c.region
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
      from line_items l where l.purchase_id = p.id), '[]'::jsonb) as items,
    region
  from purchases p;
alter view fs_finance_purchases set (security_invoker = on);

create or replace view fs_finance_expenses as
  select id::text as id,
    to_char(expense_date::timestamptz, 'YYYY-MM-DD') as date,
    category,
    amount_npr      as "amountNPR",
    note,
    status,
    vat_bill        as "vatBill",
    logged_by       as "loggedBy",
    created_at      as "createdAt",
    region
  from expenses;
alter view fs_finance_expenses set (security_invoker = on);

create or replace view fs_vat_bills as
  select v.id::text as id,
    v.expense_id   as "expenseId",
    v.expense_item as "expenseItem",
    v.file_name    as "fileName",
    v.file_url     as "fileUrl",
    v.storage_path as "storagePath",
    v.file_type    as "fileType",
    v.source,
    v.uploaded_by  as "uploadedBy",
    v.uploaded_at  as "uploadedAt",
    v.region
  from vat_bills v;
alter view fs_vat_bills set (security_invoker = on);

create or replace view fs_budget_requests as
  select id::text as id,
    br_ref          as "brId",
    title,
    type,
    category,
    urgency,
    quantity,
    notes,
    amount,
    amount_npr      as "amountNPR",
    amount_gbp      as "amountGBP",
    status,
    requested_by    as "requestedBy",
    requested_by_role as "requestedByRole",
    reviewed_by     as "reviewedBy",
    reviewed_at     as "reviewedAt",
    created_at      as "createdAt",
    requested_by_id,
    region
  from budget_requests b;
alter view fs_budget_requests set (security_invoker = on);

create or replace view fs_journal_entries as
  select id::text as id,
    to_char(entry_date::timestamptz, 'YYYY-MM-DD') as date,
    debit_account   as "debitAccount",
    credit_account  as "creditAccount",
    amount_npr      as "amountNPR",
    description,
    reference,
    created_by      as "createdBy",
    created_at      as "createdAt",
    region
  from journal_entries;
alter view fs_journal_entries set (security_invoker = on);

create or replace view fs_bank_transactions as
  select id::text as id,
    coalesce(txn_date_text, to_char(txn_at, 'YYYY-MM-DD HH24:MI')) as date,
    txn_at          as "timestamp",
    type,
    amount,
    balance,
    description,
    remarks,
    created_at      as "createdAt",
    region
  from bank_transactions;
alter view fs_bank_transactions set (security_invoker = on);

create or replace view fs_accounts as
  select id::text as id,
    name,
    type,
    is_bank         as "isBank",
    opening_balance_npr as "openingBalanceNPR",
    created_at      as "createdAt",
    region
  from accounts;
alter view fs_accounts set (security_invoker = on);

create or replace view fs_stock_movements as
  select m.id::text as id,
    m.item_id::text                                as "itemId",
    to_char(m.moved_on::timestamptz, 'YYYY-MM-DD') as date,
    m.qty,
    m.direction,
    m.source,
    m.source_id                                    as "sourceId",
    m.amount_npr                                   as "amountNPR",
    m.note,
    m.created_by                                   as "createdBy",
    m.created_at                                   as "createdAt",
    m.region
  from stock_movements m;
alter view fs_stock_movements set (security_invoker = on);

create or replace view fs_customers as
  select id::text as id,
    name,
    contact_person  as "contactPerson",
    email::text     as email,
    phone,
    address,
    city,
    country,
    notes,
    created_at      as "createdAt",
    region
  from customers;
alter view fs_customers set (security_invoker = on);

create or replace view fs_unit_economics as
  select id::text as id,
    data,
    created_at      as "createdAt",
    region
  from unit_economics;
alter view fs_unit_economics set (security_invoker = on);

create or replace view fs_product_costs as
  select code as id,
    code,
    name,
    fabric,
    labour,
    rib,
    trims,
    others,
    total,
    updated_at      as "updatedAt",
    region
  from product_costs;
alter view fs_product_costs set (security_invoker = on);


-- ─── 4. Views: region derived from the person ──────────────────────────────
--
-- Read-only on purpose. An attendance row is about an employee, and that
-- employee is either UK or Nepal; letting the record say otherwise would just
-- be a way for the two to disagree. Move the person in Employees & HR and
-- their history moves with them.

create or replace view fs_attendance as
  select a.id::text as id,
    to_char(a.date::timestamptz, 'YYYY-MM-DD') as date,
    a.status,
    a.hours,
    a.late_minutes      as "lateMinutes",
    a.late_cut_applied  as "lateCutApplied",
    a.note,
    a.logged_by         as "loggedBy",
    coalesce(a.legacy_staff_id, pe.legacy_firebase_uid, a.person_id::text) as "staffId",
    coalesce(a.legacy_staff_name, pe.full_name) as "staffName",
    coalesce(a.legacy_role, po.label, '') as role,
    a.person_id,
    a.created_at        as "createdAt",
    pe.location         as region
  from attendance a
  left join people pe on pe.id = a.person_id
  left join positions po on po.id = pe.position_id;
alter view fs_attendance set (security_invoker = on);

create or replace view fs_clock_ins as
  select c.id::text as id,
    to_char(c.date::timestamptz, 'YYYY-MM-DD') as date,
    c.clocked_in_at     as "clockedInAt",
    c.clocked_out_at    as "clockedOutAt",
    c.worked_hours      as "workedHours",
    c.lat,
    c.lng,
    c.accuracy_m        as "accuracyM",
    c.distance_to_site_m as "distanceToSiteM",
    c.bypass_used       as "bypassUsed",
    coalesce(c.legacy_staff_id, pe.legacy_firebase_uid, c.person_id::text) as "staffId",
    coalesce(c.legacy_staff_name, pe.full_name) as "staffName",
    coalesce(c.legacy_role, '') as role,
    c.person_id,
    pe.location         as region
  from clock_ins c
  left join people pe on pe.id = c.person_id;
alter view fs_clock_ins set (security_invoker = on);

create or replace view fs_finance_payroll as
  select p.id::text as id,
    p.month,
    p.year,
    p.basic_npr         as "basicNPR",
    p.salary_npr        as "salaryNPR",
    p.bonus_npr         as "bonusNPR",
    p.overtime_npr      as "overtimeNPR",
    p.deduction_npr     as "deductionNPR",
    p.pf_deduction_npr  as "pfDeductionNPR",
    p.late_deduction_npr as "lateDeductionNPR",
    p.late_days         as "lateDays",
    p.late_cuts_count   as "lateCutsCount",
    p.total_deductions_npr as "totalDeductionsNPR",
    p.gross_npr         as "grossNPR",
    p.net_npr           as "netNPR",
    p.note,
    p.logged_by         as "loggedBy",
    coalesce(p.legacy_staff_id, pe.legacy_firebase_uid) as "staffId",
    coalesce(p.legacy_staff_name, pe.full_name) as "staffName",
    coalesce(p.legacy_role, '') as role,
    p.person_id,
    pe.location         as region
  from payroll p
  left join people pe on pe.id = p.person_id;
alter view fs_finance_payroll set (security_invoker = on);


create or replace view fs_users as
  select pe.legacy_firebase_uid as id,
    pe.legacy_firebase_uid    as uid,
    pe.full_name              as name,
    pe.email::text            as email,
    coalesce(po.label, '')    as "jobRole",
    pe.location,
    pe.status,
    po.tier,
    pe.id::text               as "personId",
    pe.location               as region
  from people pe
  left join positions po on po.id = pe.position_id;
alter view fs_users set (security_invoker = on);


-- fs_employees already carries `location`; `region` is the same value under the
-- name every other collection uses, so one filter helper works everywhere.
--
-- Deliberately NOT security_invoker — see 0021 and 0026. The column masking
-- below is the access control, and it only works because this view reads all
-- of `people`.
create or replace view fs_employees as
  select pe.id::text as id,
    pe.full_name              as name,
    pe.email::text            as email,
    coalesce(po.label, '')    as role,
    pe.position_id            as "positionId",
    pe.status,
    pe.location,
    pe.department,
    pe.is_production_worker   as "isProductionWorker",
    to_char(pe.schedule_start::interval, 'HH24:MI') as "scheduleStart",
    to_char(pe.schedule_end::interval,   'HH24:MI') as "scheduleEnd",
    pe.schedule_working_days  as "scheduleWorkingDays",
    pe.schedule_day_overrides as "scheduleDayOverrides",
    pe.schedule_note          as "scheduleNote",
    pe.legacy_firebase_uid    as uid,
    pe.created_at             as "createdAt",
    pe.updated_at             as "updatedAt",
    case when vis.sensitive then pe.phone            else null end as phone,
    case when vis.sensitive then pe.address          else null end as address,
    case when vis.sensitive then pe.basic_salary_npr else null end as "basicSalaryNPR",
    case when vis.sensitive then pe.bank_name        else null end as "bankName",
    case when vis.sensitive then pe.bank_branch      else null end as "bankBranch",
    case when vis.sensitive then pe.bank_account     else null end as "bankAccount",
    case when vis.sensitive then pe.pan_number       else null end as "panNumber",
    case when vis.sensitive then pe.join_date        else null end as "joinDate",
    case when vis.sensitive then pe.telegram_id      else null end as "telegramId",
    pe.location               as region
  from people pe
  left join positions po on po.id = pe.position_id
  cross join lateral (
    select pe.id = app_person_id() or (app_can_view('employees') and app_tier() >= 2) as sensitive
  ) vis;

comment on view fs_employees is
  'Company directory. Deliberately SECURITY DEFINER (no security_invoker): it '
  'must read all of people so it can return the roster to everyone while '
  'masking phone/address/salary/bank/PAN/join_date/telegram_id to your own row '
  'or employees access at tier >= 2. Do not enable security_invoker — the '
  'column masking is the access control, not row level security.';


-- ─── 5. Guard ──────────────────────────────────────────────────────────────
--
-- CREATE OR REPLACE drops reloptions. Every view above re-asserts
-- security_invoker, and this is the check that says so.

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

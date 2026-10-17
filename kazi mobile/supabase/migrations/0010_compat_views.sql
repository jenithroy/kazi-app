-- =====================================================================
-- 0010 — Firestore-compatibility views.
--
-- Both apps address data as Firestore collections of camelCase documents.
-- Rather than rewrite ~19 readers and ~63 writers against the new relational
-- schema, expose views shaped like the old documents and swap the transport
-- underneath. The mobile app's per-module mappers keep working untouched,
-- and the web app can later point at the same views.
--
-- `security_invoker = on` is what makes this safe: the view runs as the
-- CALLER, so every RLS policy on the underlying table still applies. Without
-- it these views would be a hole straight through the permission system.
--
-- Naming: `fs_<collection>`. The transport layer maps collection -> view.
-- Writes go through INSTEAD OF triggers further down.
-- =====================================================================

-- ---------- people (served as both `employees` and `users`) -----------
create or replace view fs_employees with (security_invoker = on) as
  select pe.id::text            as id,
         pe.full_name           as name,
         pe.email::text         as email,
         coalesce(po.label,'')  as role,
         pe.position_id         as "positionId",
         pe.status              as status,
         pe.location            as location,
         pe.department          as department,
         pe.phone               as phone,
         pe.address             as address,
         pe.basic_salary_npr    as "basicSalaryNPR",
         pe.bank_name           as "bankName",
         pe.bank_branch         as "bankBranch",
         pe.bank_account        as "bankAccount",
         pe.pan_number          as "panNumber",
         pe.join_date           as "joinDate",
         pe.is_production_worker as "isProductionWorker",
         to_char(pe.schedule_start,'HH24:MI') as "scheduleStart",
         to_char(pe.schedule_end,'HH24:MI')   as "scheduleEnd",
         pe.schedule_working_days as "scheduleWorkingDays",
         pe.schedule_day_overrides as "scheduleDayOverrides",
         pe.schedule_note       as "scheduleNote",
         pe.legacy_firebase_uid as uid,
         pe.created_at          as "createdAt",
         pe.updated_at          as "updatedAt"
  from people pe left join positions po on po.id = pe.position_id;

create or replace view fs_users with (security_invoker = on) as
  select pe.legacy_firebase_uid as id,
         pe.legacy_firebase_uid as uid,
         pe.full_name           as name,
         pe.email::text         as email,
         coalesce(po.label,'')  as "jobRole",
         pe.location            as location,
         pe.status              as status,
         po.tier                as tier,
         pe.id::text            as "personId"
  from people pe left join positions po on po.id = pe.position_id;

-- ---------- attendance & time ----------------------------------------
create or replace view fs_attendance with (security_invoker = on) as
  select a.id::text     as id,
         to_char(a.date,'YYYY-MM-DD') as date,
         a.status, a.hours,
         a.late_minutes as "lateMinutes",
         a.late_cut_applied as "lateCutApplied",
         a.note, a.logged_by as "loggedBy",
         coalesce(a.legacy_staff_id, pe.legacy_firebase_uid, a.person_id::text) as "staffId",
         coalesce(a.legacy_staff_name, pe.full_name) as "staffName",
         coalesce(a.legacy_role, po.label, '') as role,
         a.person_id, a.created_at as "createdAt"
  from attendance a
  left join people pe on pe.id = a.person_id
  left join positions po on po.id = pe.position_id;

create or replace view fs_clock_ins with (security_invoker = on) as
  select c.id::text as id,
         to_char(c.date,'YYYY-MM-DD') as date,
         c.clocked_in_at as "clockedInAt", c.clocked_out_at as "clockedOutAt",
         c.worked_hours as "workedHours",
         c.lat, c.lng, c.accuracy_m as "accuracyM",
         c.distance_to_site_m as "distanceToSiteM",
         c.bypass_used as "bypassUsed",
         coalesce(c.legacy_staff_id, pe.legacy_firebase_uid, c.person_id::text) as "staffId",
         coalesce(c.legacy_staff_name, pe.full_name) as "staffName",
         coalesce(c.legacy_role, '') as role,
         c.person_id
  from clock_ins c left join people pe on pe.id = c.person_id;

create or replace view fs_finance_payroll with (security_invoker = on) as
  select p.id::text as id, p.month, p.year,
         p.basic_npr as "basicNPR", p.salary_npr as "salaryNPR",
         p.bonus_npr as "bonusNPR", p.overtime_npr as "overtimeNPR",
         p.deduction_npr as "deductionNPR", p.pf_deduction_npr as "pfDeductionNPR",
         p.late_deduction_npr as "lateDeductionNPR", p.late_days as "lateDays",
         p.late_cuts_count as "lateCutsCount",
         p.total_deductions_npr as "totalDeductionsNPR",
         p.gross_npr as "grossNPR", p.net_npr as "netNPR",
         p.note, p.logged_by as "loggedBy",
         coalesce(p.legacy_staff_id, pe.legacy_firebase_uid) as "staffId",
         coalesce(p.legacy_staff_name, pe.full_name) as "staffName",
         coalesce(p.legacy_role,'') as role, p.person_id
  from payroll p left join people pe on pe.id = p.person_id;

-- ---------- customers & orders ---------------------------------------
create or replace view fs_customers with (security_invoker = on) as
  select id::text as id, name, contact_person as "contactPerson", email::text as email,
         phone, address, city, country, notes, created_at as "createdAt"
  from customers;

create or replace view fs_orders with (security_invoker = on) as
  select o.id::text as id, o.order_no as "orderId",
         o.customer_name as "customerName", o.style_name as "styleName",
         o.colorway, o.fabric_type as "fabricType", o.quantity,
         o.price_per_pc_npr as "pricePerPcNPR", o.total_value_npr as "totalValueNPR",
         o.fabric_cost_per_pc_npr as "fabricCostPerPcNPR",
         o.fabric_grams_used as "fabricGramsUsed",
         o.fabric_required_per_pc as "fabricRequiredPerPc",
         o.material_cost_total_npr as "materialCostTotalNPR",
         o.stage, o.status,
         to_char(o.order_date,'YYYY-MM-DD') as date,
         to_char(o.delivery_date,'YYYY-MM-DD') as "deliveryDate",
         coalesce(pe.full_name,'') as "assignedTo",
         o.invoice_ref as "invoiceRef", o.sample_name as "sampleName",
         o.notes, o.created_by as "createdBy", o.created_at as "createdAt",
         coalesce((select jsonb_agg(jsonb_build_object(
             'stage', h.stage, 'date', to_char(h.changed_at,'YYYY-MM-DD'), 'by', h.changed_by)
             order by h.seq) from order_stage_history h where h.order_id = o.id), '[]'::jsonb) as "stageHistory",
         coalesce((select jsonb_agg(jsonb_build_object(
             'id', n.id::text, 'text', n.text, 'by', n.author)
             order by n.created_at) from order_notes n where n.order_id = o.id), '[]'::jsonb) as "notesList",
         o.customer_id, o.assigned_to
  from orders o left join people pe on pe.id = o.assigned_to;

-- ---------- billing ---------------------------------------------------
-- `items` is rebuilt from line_items into the JSON array both apps expect.
create or replace view fs_invoices with (security_invoker = on) as
  select i.id::text as id, i.invoice_no as "invoiceNumber",
         i.client_name as "clientName", i.client_address as "clientAddress",
         i.client_phone as "clientPhone", i.client_pan as "clientPAN",
         i.currency, to_char(i.invoice_date,'YYYY-MM-DD') as date,
         to_char(i.due_date,'YYYY-MM-DD') as "dueDate",
         i.fiscal_year as "fiscalYear", i.apply_vat as "applyVAT",
         i.subtotal_npr as "subtotalNPR", i.discount_pct as "discountPct",
         i.discount_amt_npr as "discountAmtNPR", i.taxable_amt_npr as "taxableAmtNPR",
         i.vat_amount_npr as "vatAmountNPR", i.total_npr as "totalNPR",
         i.amount_paid as "amountPaid", i.status,
         i.payment_terms as "paymentTerms", i.payment_type as "paymentType",
         i.bank_name as "bankName", i.related_quotation as "relatedQuotation",
         i.related_challan as "relatedChallan", i.challan_number as "challanNumber",
         i.note, i.created_by as "createdBy", i.updated_by as "updatedBy",
         i.created_at as "createdAt", i.updated_at as "updatedAt",
         coalesce((select jsonb_agg(jsonb_build_object(
             'description', l.description, 'qty', l.qty, 'unit', l.unit,
             'rate', l.rate, 'amount', l.amount) order by l.seq)
           from line_items l where l.invoice_id = i.id), '[]'::jsonb) as items
  from invoices i;

create or replace view fs_quotations with (security_invoker = on) as
  select q.id::text as id, q.quotation_no as "quotationNumber",
         q.client_name as "clientName", q.client_address as "clientAddress",
         q.client_phone as "clientPhone", q.client_pan as "clientPAN",
         q.currency, to_char(q.quote_date,'YYYY-MM-DD') as date,
         to_char(q.valid_until,'YYYY-MM-DD') as "validUntil",
         q.subtotal_npr as "subtotalNPR", q.discount_pct as "discountPct",
         q.discount_amt_npr as "discountAmtNPR", q.taxable_amt_npr as "taxableAmtNPR",
         q.vat_amount_npr as "vatAmountNPR", q.total_npr as "totalNPR",
         q.status, q.terms, q.note, q.related_invoice as "relatedInvoice",
         q.created_by as "createdBy", q.updated_by as "updatedBy",
         q.created_at as "createdAt", q.updated_at as "updatedAt",
         coalesce((select jsonb_agg(jsonb_build_object(
             'description', l.description, 'qty', l.qty, 'unit', l.unit,
             'rate', l.rate, 'amount', l.amount) order by l.seq)
           from line_items l where l.quotation_id = q.id), '[]'::jsonb) as items
  from quotations q;

create or replace view fs_counters with (security_invoker = on) as
  select id, next_invoice as "nextInvoice", next_quotation as "nextQuotation" from counters;

-- ---------- finance ---------------------------------------------------
create or replace view fs_accounts with (security_invoker = on) as
  select id::text as id, name, type, is_bank as "isBank",
         opening_balance_npr as "openingBalanceNPR", created_at as "createdAt"
  from accounts;

create or replace view fs_finance_expenses with (security_invoker = on) as
  select id::text as id, to_char(expense_date,'YYYY-MM-DD') as date,
         category, amount_npr as "amountNPR", note, status,
         vat_bill as "vatBill", logged_by as "loggedBy", created_at as "createdAt"
  from expenses;

create or replace view fs_finance_purchases with (security_invoker = on) as
  select p.id::text as id, p.expense_ref as "expenseId",
         to_char(p.purchase_date,'YYYY-MM-DD') as date,
         p.expense_item as "expenseItem", p.category,
         p.amount_npr as "amountNPR", p.subtotal_npr as "subtotalNPR",
         p.discount_amt as "discountAmt", p.taxable_amt as "taxableAmt",
         p.vat_amount_npr as "vatAmountNPR", p.vat_bill as "vatBill",
         p.payment_type as "paymentType", p.bank_name as "bankName",
         p.created_at as "createdAt",
         coalesce((select jsonb_agg(jsonb_build_object(
             'particulars', l.particulars, 'quantity', l.qty, 'unit', l.unit,
             'rate', l.rate, 'amount', l.amount) order by l.seq)
           from line_items l where l.purchase_id = p.id), '[]'::jsonb) as items
  from purchases p;

create or replace view fs_journal_entries with (security_invoker = on) as
  select id::text as id, to_char(entry_date,'YYYY-MM-DD') as date,
         debit_account as "debitAccount", credit_account as "creditAccount",
         amount_npr as "amountNPR", description, reference,
         created_by as "createdBy", created_at as "createdAt"
  from journal_entries;

create or replace view fs_bank_transactions with (security_invoker = on) as
  select id::text as id, coalesce(txn_date_text, to_char(txn_at,'YYYY-MM-DD HH24:MI')) as date,
         txn_at as timestamp, type, amount, balance, description, remarks,
         created_at as "createdAt"
  from bank_transactions;

create or replace view fs_budget_requests with (security_invoker = on) as
  select b.id::text as id, b.br_ref as "brId", b.title, b.type, b.category,
         b.urgency, b.quantity, b.notes, b.amount,
         b.amount_npr as "amountNPR", b.amount_gbp as "amountGBP", b.status,
         b.requested_by as "requestedBy", b.requested_by_role as "requestedByRole",
         b.reviewed_by as "reviewedBy", b.reviewed_at as "reviewedAt",
         b.created_at as "createdAt", b.requested_by_id
  from budget_requests b;

create or replace view fs_product_costs with (security_invoker = on) as
  select code as id, code, name, fabric, labour, rib, trims, others, total,
         updated_at as "updatedAt" from product_costs;

create or replace view fs_unit_economics with (security_invoker = on) as
  select id::text as id, data, created_at as "createdAt" from unit_economics;

-- ---------- product library & operations ------------------------------
create or replace view fs_fabrics with (security_invoker = on) as
  select id::text as id, name, type, composition, supplier, gsm, weight,
         price_per_meter, price_per_kg as "pricePerKg",
         available_colors, status, notes,
         swatch_image_url as "swatchImageUrl",
         created_at as "createdAt", updated_at as "updatedAt"
  from fabrics;

create or replace view fs_patterns with (security_invoker = on) as
  select id::text as id, style_no as "styleNo", name, product_type, category,
         season, market, designer_name as "designerName",
         sizes_available, available_colors, spec_size as "specSize",
         to_char(spec_date,'YYYY-MM-DD') as "specDate",
         trims, wash_care as "washCare", remarks, notes,
         measurements, fabric_rows as "fabricRows",
         front_sketch_url as "frontSketchUrl", back_sketch_url as "backSketchUrl",
         tech_pack_url, tech_pack_images,
         created_at as "createdAt", updated_at as "updatedAt"
  from patterns;

create or replace view fs_processes with (security_invoker = on) as
  select id::text as id, name, category, description, notes,
         cost_per_unit, lead_time_days, min_quantity,
         created_at as "createdAt", updated_at as "updatedAt"
  from processes;

create or replace view fs_inventory with (security_invoker = on) as
  select id::text as id, item_ref as "itemId", item, category, unit, supplier,
         location, condition, owner,
         opening_stock as "openingStock", stock_in as "stockIn",
         stock_used as "stockUsed", min_level as "minLevel",
         unit_cost_npr as "unitCostNPR",
         size_rows as "sizeRows", damage_log as "damageLog",
         to_char(last_updated,'YYYY-MM-DD') as "lastUpdated",
         created_by as "createdBy", updated_by as "updatedBy",
         created_at as "createdAt"
  from inventory_items;

create or replace view fs_production with (security_invoker = on) as
  select id::text as id, batch_ref as "batchId",
         to_char(batch_date,'YYYY-MM-DD') as date,
         cut, stitched, passed, rejected, note, logged_by as "loggedBy",
         created_at as "createdAt"
  from production_batches;

create or replace view fs_qc_logs with (security_invoker = on) as
  select id::text as id, qc_ref as "qcId", batch_ref as "batchId",
         to_char(log_date,'YYYY-MM-DD') as date,
         inspected, passed, rejected, defect_type as "defectType",
         action, checked_by as "checkedBy", created_at as "createdAt"
  from qc_logs;

create or replace view fs_stage_config with (security_invoker = on) as
  select stage as id, stage, enabled, sort_order as "order",
         timeout_hours as "timeoutHours",
         worker_names as "workerNames", worker_uids as "workerUids"
  from stage_config;

-- ---------- tasks, content, messaging ---------------------------------
create or replace view fs_tasks with (security_invoker = on) as
  select t.id::text as id, t.title, t.description, t.notes, t.status,
         t.priority, t.category,
         coalesce(pe.full_name, t.assignee, '') as assignee,
         t.customer, t.order_ref as "orderRef",
         coalesce(to_char(t.due_date,'YYYY-MM-DD'),'') as "dueDate",
         t.created_by as "createdBy", t.created_at as "createdAt",
         t.assignee_id
  from tasks t left join people pe on pe.id = t.assignee_id;

create or replace view fs_task_columns with (security_invoker = on) as
  select id::text as id, label, sort_order as "order", tone from task_columns;

create or replace view fs_content_calendar with (security_invoker = on) as
  select id::text as id, title, type, status,
         to_char(scheduled_date,'YYYY-MM-DD') as "scheduledDate",
         time_slot as "timeSlot", notes, media_url as "mediaUrl",
         created_at as "createdAt"
  from content_calendar;

create or replace view fs_content with (security_invoker = on) as
  select id::text as id, topic, content_type as "contentType", platform,
         status, to_char(post_date,'YYYY-MM-DD') as date,
         created_by as "createdBy", created_at as "createdAt"
  from content_posts;

create or replace view fs_messages with (security_invoker = on) as
  select m.id::text as id, coalesce(pe.legacy_firebase_uid, m.legacy_sender_id) as "senderId",
         m.text, m.sent_at as timestamp, m.sender_id
  from messages m left join people pe on pe.id = m.sender_id;

-- ---------- grants -----------------------------------------------------
do $$
declare v text;
begin
  for v in select table_name from information_schema.views
           where table_schema = 'public' and table_name like 'fs\_%'
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', v);
  end loop;
end $$;

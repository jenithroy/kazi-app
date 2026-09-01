-- ============================================================================
-- 0000_baseline.sql  —  reconstructed from the live database
--
-- The original 0001..0009 migration files were never committed; this file is a
-- faithful dump of the schema they produced, taken from the live database on
-- 2026-09-01. It is recorded in schema_migrations as already
-- applied, so migrate.cjs will never re-run it against the existing project.
-- Use it to rebuild the schema from scratch (`migrate.cjs --reset`) and as the
-- reference for what the database actually contains. New work goes in 0010+.
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists citext;


-- ─── tables ────────────────────────────────────────────────────────────────

create table if not exists accounts (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "type" text not null,
  "is_bank" boolean default false not null,
  "opening_balance_npr" numeric(14,2) default 0 not null,
  "created_at" timestamptz default now() not null
);

create table if not exists attendance (
  "id" uuid default gen_random_uuid() not null,
  "person_id" uuid,
  "date" date not null,
  "status" text not null,
  "hours" numeric(5,2) default 0 not null,
  "late_minutes" integer default 0 not null,
  "late_cut_applied" boolean default false not null,
  "note" text,
  "logged_by" text,
  "legacy_staff_id" text,
  "legacy_staff_name" text,
  "legacy_role" text,
  "created_at" timestamptz default now() not null
);

create table if not exists bank_transactions (
  "id" uuid default gen_random_uuid() not null,
  "txn_at" timestamptz,
  "txn_date_text" text,
  "type" text,
  "amount" numeric(14,2) default 0 not null,
  "balance" numeric(14,2),
  "description" text,
  "remarks" text,
  "created_at" timestamptz default now() not null
);

create table if not exists budget_requests (
  "id" uuid default gen_random_uuid() not null,
  "br_ref" text,
  "title" text not null,
  "type" text,
  "category" text,
  "urgency" text,
  "quantity" text,
  "notes" text,
  "amount" numeric(14,2),
  "amount_npr" numeric(14,2),
  "amount_gbp" numeric(14,2),
  "status" text default 'Pending'::text not null,
  "requested_by_id" uuid,
  "requested_by" text,
  "requested_by_role" text,
  "reviewed_by" text,
  "reviewed_at" timestamptz,
  "created_at" timestamptz default now() not null
);

create table if not exists clock_ins (
  "id" uuid default gen_random_uuid() not null,
  "person_id" uuid,
  "date" date not null,
  "clocked_in_at" timestamptz not null,
  "clocked_out_at" timestamptz,
  "worked_hours" numeric(5,2),
  "lat" double precision,
  "lng" double precision,
  "accuracy_m" double precision,
  "distance_to_site_m" double precision,
  "bypass_used" boolean default false not null,
  "legacy_staff_id" text,
  "legacy_staff_name" text,
  "legacy_role" text,
  "created_at" timestamptz default now() not null
);

create table if not exists content_calendar (
  "id" uuid default gen_random_uuid() not null,
  "title" text not null,
  "type" text,
  "status" text,
  "scheduled_date" date,
  "time_slot" text,
  "notes" text,
  "media_url" text,
  "created_at" timestamptz default now() not null
);

create table if not exists content_posts (
  "id" uuid default gen_random_uuid() not null,
  "topic" text,
  "content_type" text,
  "platform" text,
  "status" text,
  "post_date" date,
  "created_by" text,
  "created_at" timestamptz default now() not null
);

create table if not exists counters (
  "id" text not null,
  "next_invoice" integer default 1 not null,
  "next_quotation" integer default 1 not null
);

create table if not exists customers (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "contact_person" text,
  "email" citext,
  "phone" text,
  "address" text,
  "city" text,
  "country" text,
  "notes" text,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null
);

create table if not exists expenses (
  "id" uuid default gen_random_uuid() not null,
  "expense_date" date not null,
  "category" text,
  "amount_npr" numeric(14,2) default 0 not null,
  "note" text,
  "status" text,
  "vat_bill" boolean default false not null,
  "logged_by" text,
  "created_at" timestamptz default now() not null
);

create table if not exists fabrics (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "type" text,
  "composition" text,
  "supplier" text,
  "gsm" numeric(8,2),
  "weight" text,
  "price_per_meter" numeric(12,2),
  "price_per_kg" numeric(12,2),
  "available_colors" text[],
  "status" text,
  "notes" text,
  "swatch_image_url" text,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null
);

create table if not exists finance_tabs (
  "id" text not null,
  "label" text not null,
  "sort_order" integer default 0 not null
);

create table if not exists inventory_items (
  "id" uuid default gen_random_uuid() not null,
  "item_ref" text,
  "item" text not null,
  "category" text,
  "unit" text,
  "supplier" text,
  "location" text,
  "condition" text,
  "owner" text,
  "opening_stock" numeric(12,2) default 0 not null,
  "stock_in" numeric(12,2) default 0 not null,
  "stock_used" numeric(12,2) default 0 not null,
  "min_level" numeric(12,2) default 0 not null,
  "unit_cost_npr" numeric(12,2) default 0 not null,
  "size_rows" jsonb default '[]'::jsonb not null,
  "damage_log" jsonb default '[]'::jsonb not null,
  "last_updated" date,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamptz default now() not null
);

create table if not exists invoices (
  "id" uuid default gen_random_uuid() not null,
  "invoice_no" text,
  "linked_order_id" uuid,
  "client_name" text,
  "client_address" text,
  "client_phone" text,
  "client_pan" text,
  "currency" text default 'NPR'::text not null,
  "invoice_date" date,
  "due_date" date,
  "fiscal_year" text,
  "apply_vat" boolean default false not null,
  "subtotal_npr" numeric(14,2) default 0 not null,
  "discount_pct" numeric(6,2) default 0 not null,
  "discount_amt_npr" numeric(14,2) default 0 not null,
  "taxable_amt_npr" numeric(14,2) default 0 not null,
  "vat_amount_npr" numeric(14,2) default 0 not null,
  "total_npr" numeric(14,2) default 0 not null,
  "amount_paid" numeric(14,2) default 0 not null,
  "status" text,
  "payment_terms" text,
  "payment_type" text,
  "bank_name" text,
  "related_quotation" text,
  "related_challan" text,
  "challan_number" text,
  "note" text,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null
);

create table if not exists journal_entries (
  "id" uuid default gen_random_uuid() not null,
  "entry_date" date not null,
  "debit_account" text,
  "credit_account" text,
  "amount_npr" numeric(14,2) default 0 not null,
  "description" text,
  "reference" text,
  "created_by" text,
  "created_at" timestamptz default now() not null
);

create table if not exists line_items (
  "id" uuid default gen_random_uuid() not null,
  "invoice_id" uuid,
  "quotation_id" uuid,
  "purchase_id" uuid,
  "seq" integer default 0 not null,
  "description" text,
  "particulars" text,
  "qty" numeric(12,3),
  "unit" text,
  "rate" numeric(14,2),
  "amount" numeric(14,2)
);

create table if not exists messages (
  "id" uuid default gen_random_uuid() not null,
  "sender_id" uuid,
  "legacy_sender_id" text,
  "text" text not null,
  "sent_at" timestamptz default now() not null
);

create table if not exists order_notes (
  "id" uuid default gen_random_uuid() not null,
  "order_id" uuid not null,
  "text" text not null,
  "author" text,
  "created_at" timestamptz default now() not null
);

create table if not exists order_stage_history (
  "id" uuid default gen_random_uuid() not null,
  "order_id" uuid not null,
  "stage" text not null,
  "changed_at" date,
  "changed_by" text,
  "seq" integer default 0 not null
);

create table if not exists orders (
  "id" uuid default gen_random_uuid() not null,
  "order_no" text,
  "customer_id" uuid,
  "customer_name" text,
  "style_name" text,
  "colorway" text,
  "fabric_type" text,
  "quantity" numeric(12,2) default 0 not null,
  "price_per_pc_npr" numeric(12,2) default 0 not null,
  "total_value_npr" numeric(14,2) default 0 not null,
  "fabric_cost_per_pc_npr" numeric(12,2),
  "fabric_grams_used" numeric(12,2),
  "fabric_required_per_pc" numeric(12,2),
  "material_cost_total_npr" numeric(14,2),
  "stage" text,
  "status" text,
  "order_date" date,
  "delivery_date" date,
  "assigned_to" uuid,
  "invoice_ref" text,
  "sample_name" text,
  "notes" text,
  "created_by" text,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null
);

create table if not exists patterns (
  "id" uuid default gen_random_uuid() not null,
  "style_no" text,
  "name" text not null,
  "product_type" text,
  "category" text,
  "season" text,
  "market" text,
  "designer_name" text,
  "sizes_available" text[],
  "available_colors" text,
  "spec_size" text,
  "spec_date" date,
  "trims" text,
  "wash_care" text,
  "remarks" text,
  "notes" text,
  "measurements" jsonb default '[]'::jsonb not null,
  "fabric_rows" jsonb default '[]'::jsonb not null,
  "front_sketch_url" text,
  "back_sketch_url" text,
  "tech_pack_url" text,
  "tech_pack_images" text[],
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null
);

create table if not exists payroll (
  "id" uuid default gen_random_uuid() not null,
  "person_id" uuid,
  "month" text not null,
  "year" integer not null,
  "basic_npr" numeric(12,2) default 0 not null,
  "salary_npr" numeric(12,2),
  "bonus_npr" numeric(12,2) default 0 not null,
  "overtime_npr" numeric(12,2) default 0 not null,
  "deduction_npr" numeric(12,2) default 0 not null,
  "pf_deduction_npr" numeric(12,2) default 0 not null,
  "late_deduction_npr" numeric(12,2) default 0 not null,
  "late_days" integer default 0 not null,
  "late_cuts_count" integer default 0 not null,
  "total_deductions_npr" numeric(12,2) default 0 not null,
  "gross_npr" numeric(12,2) default 0 not null,
  "net_npr" numeric(12,2) default 0 not null,
  "note" text,
  "logged_by" text,
  "legacy_staff_id" text,
  "legacy_staff_name" text,
  "legacy_role" text,
  "created_at" timestamptz default now() not null
);

create table if not exists people (
  "id" uuid default gen_random_uuid() not null,
  "auth_uid" uuid,
  "legacy_firebase_uid" text,
  "email" citext not null,
  "full_name" text not null,
  "position_id" text,
  "location" text,
  "department" text,
  "status" text default 'Active'::text not null,
  "phone" text,
  "address" text,
  "basic_salary_npr" numeric(12,2),
  "bank_name" text,
  "bank_branch" text,
  "bank_account" text,
  "pan_number" text,
  "join_date" date,
  "is_production_worker" boolean default false not null,
  "reports_to" uuid,
  "schedule_start" time,
  "schedule_end" time,
  "schedule_working_days" text[],
  "schedule_day_overrides" jsonb,
  "schedule_note" text,
  "notes" text,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null
);

create table if not exists permission_drift_log (
  "id" integer default nextval('permission_drift_log_id_seq'::regclass) not null,
  "person_name" text not null,
  "section_id" text not null,
  "had_access" boolean not null,
  "logged_at" timestamptz default now() not null,
  "note" text default 'Legacy Firestore users.permissions grant, superseded by the position matrix'::text
);

create table if not exists person_permission_overrides (
  "person_id" uuid not null,
  "section_id" text not null,
  "can_view" boolean,
  "can_edit" boolean,
  "reason" text,
  "granted_at" timestamptz default now() not null
);

create table if not exists position_finance_tabs (
  "position_id" text not null,
  "tab_id" text not null,
  "can_view" boolean default false not null,
  "can_edit" boolean default false not null
);

create table if not exists position_permissions (
  "position_id" text not null,
  "section_id" text not null,
  "can_view" boolean default false not null,
  "can_edit" boolean default false not null
);

create table if not exists positions (
  "id" text not null,
  "label" text not null,
  "tier" integer default 0 not null,
  "description" text
);

create table if not exists processes (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "category" text,
  "description" text,
  "notes" text,
  "cost_per_unit" numeric(12,2) default 0 not null,
  "lead_time_days" integer default 0 not null,
  "min_quantity" integer default 1 not null,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null
);

create table if not exists product_costs (
  "code" text not null,
  "name" text not null,
  "fabric" numeric(12,2) default 0 not null,
  "labour" numeric(12,2) default 0 not null,
  "rib" numeric(12,2) default 0 not null,
  "trims" numeric(12,2) default 0 not null,
  "others" numeric(12,2) default 0 not null,
  "total" numeric(12,2),
  "updated_at" timestamptz
);

create table if not exists production_batches (
  "id" uuid default gen_random_uuid() not null,
  "batch_ref" text,
  "batch_date" date,
  "cut" integer default 0 not null,
  "stitched" integer default 0 not null,
  "passed" integer default 0 not null,
  "rejected" integer default 0 not null,
  "note" text,
  "logged_by" text,
  "created_at" timestamptz default now() not null
);

create table if not exists purchases (
  "id" uuid default gen_random_uuid() not null,
  "expense_ref" text,
  "purchase_date" date,
  "expense_item" text,
  "category" text,
  "amount_npr" numeric(14,2) default 0 not null,
  "subtotal_npr" numeric(14,2),
  "discount_amt" numeric(14,2),
  "taxable_amt" numeric(14,2),
  "vat_amount_npr" numeric(14,2),
  "vat_bill" boolean,
  "payment_type" text,
  "bank_name" text,
  "created_at" timestamptz default now() not null
);

create table if not exists qc_logs (
  "id" uuid default gen_random_uuid() not null,
  "qc_ref" text,
  "batch_ref" text,
  "log_date" date,
  "inspected" integer default 0 not null,
  "passed" integer default 0 not null,
  "rejected" integer default 0 not null,
  "defect_type" text,
  "action" text,
  "checked_by" text,
  "created_at" timestamptz default now() not null
);

create table if not exists quotations (
  "id" uuid default gen_random_uuid() not null,
  "quotation_no" text,
  "client_name" text,
  "client_address" text,
  "client_phone" text,
  "client_pan" text,
  "currency" text default 'NPR'::text not null,
  "quote_date" date,
  "valid_until" date,
  "subtotal_npr" numeric(14,2) default 0 not null,
  "discount_pct" numeric(6,2) default 0 not null,
  "discount_amt_npr" numeric(14,2) default 0 not null,
  "taxable_amt_npr" numeric(14,2) default 0 not null,
  "vat_amount_npr" numeric(14,2) default 0 not null,
  "total_npr" numeric(14,2) default 0 not null,
  "status" text,
  "terms" text,
  "note" text,
  "related_invoice" text,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null
);

create table if not exists schema_migrations (
  "filename" text not null,
  "applied_at" timestamptz default now() not null
);

create table if not exists sections (
  "id" text not null,
  "label" text not null,
  "aliases" text[] default '{}'::text[] not null,
  "is_personal" boolean default false not null,
  "sort_order" integer default 0 not null
);

create table if not exists stage_config (
  "stage" text not null,
  "enabled" boolean default true not null,
  "sort_order" integer default 0 not null,
  "timeout_hours" integer default 0 not null,
  "worker_names" text[] default '{}'::text[] not null,
  "worker_uids" text[] default '{}'::text[] not null
);

create table if not exists task_columns (
  "id" uuid default gen_random_uuid() not null,
  "label" text not null,
  "sort_order" integer default 0 not null,
  "tone" text
);

create table if not exists tasks (
  "id" uuid default gen_random_uuid() not null,
  "title" text not null,
  "description" text,
  "notes" text,
  "status" text,
  "priority" text,
  "category" text,
  "assignee_id" uuid,
  "assignee" text,
  "customer" text,
  "order_ref" text,
  "due_date" date,
  "created_by" text,
  "created_at" timestamptz default now() not null,
  "updated_at" timestamptz default now() not null
);

create table if not exists unit_economics (
  "id" uuid default gen_random_uuid() not null,
  "data" jsonb default '{}'::jsonb not null,
  "created_at" timestamptz default now() not null
);


-- ─── constraints ───────────────────────────────────────────────────────────
alter table accounts add constraint accounts_pkey PRIMARY KEY (id);
alter table attendance add constraint attendance_pkey PRIMARY KEY (id);
alter table bank_transactions add constraint bank_transactions_pkey PRIMARY KEY (id);
alter table budget_requests add constraint budget_requests_pkey PRIMARY KEY (id);
alter table clock_ins add constraint clock_ins_pkey PRIMARY KEY (id);
alter table content_calendar add constraint content_calendar_pkey PRIMARY KEY (id);
alter table content_posts add constraint content_posts_pkey PRIMARY KEY (id);
alter table counters add constraint counters_pkey PRIMARY KEY (id);
alter table customers add constraint customers_pkey PRIMARY KEY (id);
alter table expenses add constraint expenses_pkey PRIMARY KEY (id);
alter table fabrics add constraint fabrics_pkey PRIMARY KEY (id);
alter table finance_tabs add constraint finance_tabs_pkey PRIMARY KEY (id);
alter table inventory_items add constraint inventory_items_pkey PRIMARY KEY (id);
alter table invoices add constraint invoices_pkey PRIMARY KEY (id);
alter table journal_entries add constraint journal_entries_pkey PRIMARY KEY (id);
alter table line_items add constraint line_items_pkey PRIMARY KEY (id);
alter table messages add constraint messages_pkey PRIMARY KEY (id);
alter table order_notes add constraint order_notes_pkey PRIMARY KEY (id);
alter table order_stage_history add constraint order_stage_history_pkey PRIMARY KEY (id);
alter table orders add constraint orders_pkey PRIMARY KEY (id);
alter table patterns add constraint patterns_pkey PRIMARY KEY (id);
alter table payroll add constraint payroll_pkey PRIMARY KEY (id);
alter table people add constraint people_pkey PRIMARY KEY (id);
alter table permission_drift_log add constraint permission_drift_log_pkey PRIMARY KEY (id);
alter table person_permission_overrides add constraint person_permission_overrides_pkey PRIMARY KEY (person_id, section_id);
alter table position_finance_tabs add constraint position_finance_tabs_pkey PRIMARY KEY (position_id, tab_id);
alter table position_permissions add constraint position_permissions_pkey PRIMARY KEY (position_id, section_id);
alter table positions add constraint positions_pkey PRIMARY KEY (id);
alter table processes add constraint processes_pkey PRIMARY KEY (id);
alter table product_costs add constraint product_costs_pkey PRIMARY KEY (code);
alter table production_batches add constraint production_batches_pkey PRIMARY KEY (id);
alter table purchases add constraint purchases_pkey PRIMARY KEY (id);
alter table qc_logs add constraint qc_logs_pkey PRIMARY KEY (id);
alter table quotations add constraint quotations_pkey PRIMARY KEY (id);
alter table schema_migrations add constraint schema_migrations_pkey PRIMARY KEY (filename);
alter table sections add constraint sections_pkey PRIMARY KEY (id);
alter table stage_config add constraint stage_config_pkey PRIMARY KEY (stage);
alter table task_columns add constraint task_columns_pkey PRIMARY KEY (id);
alter table tasks add constraint tasks_pkey PRIMARY KEY (id);
alter table unit_economics add constraint unit_economics_pkey PRIMARY KEY (id);
alter table accounts add constraint accounts_name_key UNIQUE (name);
alter table attendance add constraint attendance_person_id_date_key UNIQUE (person_id, date);
alter table attendance add constraint attendance_person_id_fkey FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE;
alter table attendance add constraint attendance_status_check CHECK ((status = ANY (ARRAY['Present'::text, 'Late'::text, 'Absent'::text, 'Half-day'::text, 'Leave'::text])));
alter table bank_transactions add constraint bank_transactions_type_check CHECK ((type = ANY (ARRAY['Debit'::text, 'Credit'::text])));
alter table budget_requests add constraint budget_requests_requested_by_id_fkey FOREIGN KEY (requested_by_id) REFERENCES people(id) ON DELETE SET NULL;
alter table clock_ins add constraint clock_ins_person_id_fkey FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE;
alter table invoices add constraint invoices_invoice_no_key UNIQUE (invoice_no);
alter table invoices add constraint invoices_linked_order_id_fkey FOREIGN KEY (linked_order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table line_items add constraint line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
alter table line_items add constraint line_items_purchase_fk FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE;
alter table line_items add constraint line_items_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE;
alter table line_items add constraint one_parent CHECK ((num_nonnulls(invoice_id, quotation_id, purchase_id) = 1));
alter table messages add constraint messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES people(id) ON DELETE SET NULL;
alter table order_notes add constraint order_notes_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table order_stage_history add constraint order_stage_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table orders add constraint orders_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES people(id) ON DELETE SET NULL;
alter table orders add constraint orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
alter table orders add constraint orders_order_no_key UNIQUE (order_no);
alter table payroll add constraint payroll_person_id_fkey FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL;
alter table people add constraint people_auth_uid_key UNIQUE (auth_uid);
alter table people add constraint people_email_key UNIQUE (email);
alter table people add constraint people_legacy_firebase_uid_key UNIQUE (legacy_firebase_uid);
alter table people add constraint people_location_check CHECK ((location = ANY (ARRAY['nepal'::text, 'uk'::text])));
alter table people add constraint people_position_id_fkey FOREIGN KEY (position_id) REFERENCES positions(id);
alter table people add constraint people_reports_to_fkey FOREIGN KEY (reports_to) REFERENCES people(id) ON DELETE SET NULL;
alter table people add constraint people_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'Inactive'::text])));
alter table person_permission_overrides add constraint person_permission_overrides_person_id_fkey FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE;
alter table person_permission_overrides add constraint person_permission_overrides_section_id_fkey FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE;
alter table position_finance_tabs add constraint position_finance_tabs_position_id_fkey FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE;
alter table position_finance_tabs add constraint position_finance_tabs_tab_id_fkey FOREIGN KEY (tab_id) REFERENCES finance_tabs(id) ON DELETE CASCADE;
alter table position_permissions add constraint edit_implies_view CHECK (((NOT can_edit) OR can_view));
alter table position_permissions add constraint position_permissions_position_id_fkey FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE;
alter table position_permissions add constraint position_permissions_section_id_fkey FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE;
alter table positions add constraint positions_tier_check CHECK (((tier >= 0) AND (tier <= 4)));
alter table production_batches add constraint production_batches_batch_ref_key UNIQUE (batch_ref);
alter table quotations add constraint quotations_quotation_no_key UNIQUE (quotation_no);
alter table tasks add constraint tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES people(id) ON DELETE SET NULL;


-- ─── indexes ───────────────────────────────────────────────────────────────
CREATE INDEX attendance_date_idx ON public.attendance USING btree (date);
CREATE INDEX attendance_person_id_date_idx ON public.attendance USING btree (person_id, date DESC);
CREATE INDEX bank_transactions_txn_at_idx ON public.bank_transactions USING btree (txn_at DESC);
CREATE INDEX clock_ins_person_id_date_idx ON public.clock_ins USING btree (person_id, date DESC);
CREATE INDEX expenses_expense_date_idx ON public.expenses USING btree (expense_date DESC);
CREATE INDEX invoices_invoice_date_idx ON public.invoices USING btree (invoice_date DESC);
CREATE INDEX invoices_status_idx ON public.invoices USING btree (status);
CREATE INDEX line_items_invoice_id_idx ON public.line_items USING btree (invoice_id);
CREATE INDEX line_items_purchase_id_idx ON public.line_items USING btree (purchase_id);
CREATE INDEX line_items_quotation_id_idx ON public.line_items USING btree (quotation_id);
CREATE INDEX messages_sent_at_idx ON public.messages USING btree (sent_at DESC);
CREATE INDEX order_stage_history_order_id_seq_idx ON public.order_stage_history USING btree (order_id, seq);
CREATE INDEX orders_customer_id_idx ON public.orders USING btree (customer_id);
CREATE INDEX orders_order_date_idx ON public.orders USING btree (order_date DESC);
CREATE INDEX orders_stage_idx ON public.orders USING btree (stage);
CREATE INDEX payroll_person_id_year_month_idx ON public.payroll USING btree (person_id, year DESC, month);
CREATE INDEX people_legacy_firebase_uid_idx ON public.people USING btree (legacy_firebase_uid);
CREATE INDEX people_position_id_idx ON public.people USING btree (position_id);
CREATE INDEX people_status_idx ON public.people USING btree (status);
CREATE INDEX purchases_purchase_date_idx ON public.purchases USING btree (purchase_date DESC);
CREATE INDEX tasks_assignee_id_idx ON public.tasks USING btree (assignee_id);
CREATE INDEX tasks_status_idx ON public.tasks USING btree (status);


-- ─── functions ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_can_edit(section text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select o.can_edit from person_permission_overrides o
      where o.person_id = app_person_id() and o.section_id = section and o.can_edit is not null),
    (select pp.can_edit from people pe
       join position_permissions pp on pp.position_id = pe.position_id
      where pe.id = app_person_id() and pp.section_id = section),
    false);
$function$
;

CREATE OR REPLACE FUNCTION public.app_can_view(section text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select o.can_view from person_permission_overrides o
      where o.person_id = app_person_id() and o.section_id = section and o.can_view is not null),
    (select pp.can_view from people pe
       join position_permissions pp on pp.position_id = pe.position_id
      where pe.id = app_person_id() and pp.section_id = section),
    false);
$function$
;

CREATE OR REPLACE FUNCTION public.app_can_view_finance_tab(tab text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select ft.can_view from people pe
     join position_finance_tabs ft on ft.position_id = pe.position_id
    where pe.id = app_person_id() and ft.tab_id = tab), false);
$function$
;

CREATE OR REPLACE FUNCTION public.app_issuer_ok()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    -- our Firebase project, and only ours
    ( auth.jwt() ->> 'iss' = 'https://securetoken.google.com/kazi-manufacturing'
      and auth.jwt() ->> 'aud' = 'kazi-manufacturing' )
    -- or a token this Supabase project issued itself
    or auth.jwt() ->> 'iss' like 'https://%.supabase.co/auth/v1',
  false);
$function$
;

CREATE OR REPLACE FUNCTION public.app_jwt_sub()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(auth.jwt() ->> 'sub', '');
$function$
;

CREATE OR REPLACE FUNCTION public.app_person_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from people
   where status = 'Active'
     and ( legacy_firebase_uid = app_jwt_sub()
        or (app_jwt_sub() ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            and auth_uid::text = app_jwt_sub()) )
   limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.app_tier()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(po.tier, -1)
  from people pe left join positions po on po.id = pe.position_id
  where pe.id = app_person_id();
$function$
;

CREATE OR REPLACE FUNCTION public.citext(character)
 RETURNS citext
 LANGUAGE internal
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$rtrim1$function$
;

CREATE OR REPLACE FUNCTION public.citext(boolean)
 RETURNS citext
 LANGUAGE internal
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$booltext$function$
;

CREATE OR REPLACE FUNCTION public.citext(inet)
 RETURNS citext
 LANGUAGE internal
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$network_show$function$
;

CREATE OR REPLACE FUNCTION public.citext_cmp(citext, citext)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/citext', $function$citext_cmp$function$
;

CREATE OR REPLACE FUNCTION public.citext_eq(citext, citext)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/citext', $function$citext_eq$function$
;

CREATE OR REPLACE FUNCTION public.citext_ge(citext, citext)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/citext', $function$citext_ge$function$
;

CREATE OR REPLACE FUNCTION public.citext_gt(citext, citext)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/citext', $function$citext_gt$function$
;

CREATE OR REPLACE FUNCTION public.citext_hash(citext)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/citext', $function$citext_hash$function$
;

CREATE OR REPLACE FUNCTION public.citext_hash_extended(citext, bigint)
 RETURNS bigint
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/citext', $function$citext_hash_extended$function$
;

CREATE OR REPLACE FUNCTION public.citext_larger(citext, citext)
 RETURNS citext
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/citext', $function$citext_larger$function$
;

CREATE OR REPLACE FUNCTION public.citext_le(citext, citext)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/citext', $function$citext_le$function$
;

CREATE OR REPLACE FUNCTION public.citext_lt(citext, citext)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/citext', $function$citext_lt$function$
;

CREATE OR REPLACE FUNCTION public.citext_ne(citext, citext)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/citext', $function$citext_ne$function$
;

CREATE OR REPLACE FUNCTION public.citext_pattern_cmp(citext, citext)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/citext', $function$citext_pattern_cmp$function$
;

CREATE OR REPLACE FUNCTION public.citext_pattern_ge(citext, citext)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/citext', $function$citext_pattern_ge$function$
;

CREATE OR REPLACE FUNCTION public.citext_pattern_gt(citext, citext)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/citext', $function$citext_pattern_gt$function$
;

CREATE OR REPLACE FUNCTION public.citext_pattern_le(citext, citext)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/citext', $function$citext_pattern_le$function$
;

CREATE OR REPLACE FUNCTION public.citext_pattern_lt(citext, citext)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/citext', $function$citext_pattern_lt$function$
;

CREATE OR REPLACE FUNCTION public.citext_smaller(citext, citext)
 RETURNS citext
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/citext', $function$citext_smaller$function$
;

CREATE OR REPLACE FUNCTION public.citextin(cstring)
 RETURNS citext
 LANGUAGE internal
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$textin$function$
;

CREATE OR REPLACE FUNCTION public.citextout(citext)
 RETURNS cstring
 LANGUAGE internal
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$textout$function$
;

CREATE OR REPLACE FUNCTION public.citextrecv(internal)
 RETURNS citext
 LANGUAGE internal
 STABLE PARALLEL SAFE STRICT
AS $function$textrecv$function$
;

CREATE OR REPLACE FUNCTION public.citextsend(citext)
 RETURNS bytea
 LANGUAGE internal
 STABLE PARALLEL SAFE STRICT
AS $function$textsend$function$
;

CREATE OR REPLACE FUNCTION public.me()
 RETURNS TABLE(person_id uuid, full_name text, email text, position_id text, position_label text, tier integer, location text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select pe.id, pe.full_name, pe.email::text, pe.position_id, po.label, po.tier, pe.location
  from people pe left join positions po on po.id = pe.position_id
  where pe.id = app_person_id();
$function$
;

CREATE OR REPLACE FUNCTION public.regexp_match(citext, citext)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT pg_catalog.regexp_match( $1::pg_catalog.text, $2::pg_catalog.text, 'i' );
$function$
;

CREATE OR REPLACE FUNCTION public.regexp_match(citext, citext, text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT pg_catalog.regexp_match( $1::pg_catalog.text, $2::pg_catalog.text, CASE WHEN pg_catalog.strpos($3, 'c') = 0 THEN  $3 || 'i' ELSE $3 END );
$function$
;

CREATE OR REPLACE FUNCTION public.regexp_matches(citext, citext)
 RETURNS SETOF text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT ROWS 1
AS $function$
    SELECT pg_catalog.regexp_matches( $1::pg_catalog.text, $2::pg_catalog.text, 'i' );
$function$
;

CREATE OR REPLACE FUNCTION public.regexp_matches(citext, citext, text)
 RETURNS SETOF text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT ROWS 10
AS $function$
    SELECT pg_catalog.regexp_matches( $1::pg_catalog.text, $2::pg_catalog.text, CASE WHEN pg_catalog.strpos($3, 'c') = 0 THEN  $3 || 'i' ELSE $3 END );
$function$
;

CREATE OR REPLACE FUNCTION public.regexp_replace(citext, citext, text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT pg_catalog.regexp_replace( $1::pg_catalog.text, $2::pg_catalog.text, $3, 'i');
$function$
;

CREATE OR REPLACE FUNCTION public.regexp_replace(citext, citext, text, text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT pg_catalog.regexp_replace( $1::pg_catalog.text, $2::pg_catalog.text, $3, CASE WHEN pg_catalog.strpos($4, 'c') = 0 THEN  $4 || 'i' ELSE $4 END);
$function$
;

CREATE OR REPLACE FUNCTION public.regexp_split_to_array(citext, citext)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT pg_catalog.regexp_split_to_array( $1::pg_catalog.text, $2::pg_catalog.text, 'i' );
$function$
;

CREATE OR REPLACE FUNCTION public.regexp_split_to_array(citext, citext, text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT pg_catalog.regexp_split_to_array( $1::pg_catalog.text, $2::pg_catalog.text, CASE WHEN pg_catalog.strpos($3, 'c') = 0 THEN  $3 || 'i' ELSE $3 END );
$function$
;

CREATE OR REPLACE FUNCTION public.regexp_split_to_table(citext, citext)
 RETURNS SETOF text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT pg_catalog.regexp_split_to_table( $1::pg_catalog.text, $2::pg_catalog.text, 'i' );
$function$
;

CREATE OR REPLACE FUNCTION public.regexp_split_to_table(citext, citext, text)
 RETURNS SETOF text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT pg_catalog.regexp_split_to_table( $1::pg_catalog.text, $2::pg_catalog.text, CASE WHEN pg_catalog.strpos($3, 'c') = 0 THEN  $3 || 'i' ELSE $3 END );
$function$
;

CREATE OR REPLACE FUNCTION public.replace(citext, citext, citext)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT pg_catalog.regexp_replace( $1::pg_catalog.text, pg_catalog.regexp_replace($2::pg_catalog.text, '([^a-zA-Z_0-9])', E'\\\\\\1', 'g'), $3::pg_catalog.text, 'gi' );
$function$
;

CREATE OR REPLACE FUNCTION public.split_part(citext, citext, integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT (pg_catalog.regexp_split_to_array( $1::pg_catalog.text, pg_catalog.regexp_replace($2::pg_catalog.text, '([^a-zA-Z_0-9])', E'\\\\\\1', 'g'), 'i'))[$3];
$function$
;

CREATE OR REPLACE FUNCTION public.strpos(citext, citext)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT pg_catalog.strpos( pg_catalog.lower( $1::pg_catalog.text ), pg_catalog.lower( $2::pg_catalog.text ) );
$function$
;

CREATE OR REPLACE FUNCTION public.texticlike(citext, citext)
 RETURNS boolean
 LANGUAGE internal
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$texticlike$function$
;

CREATE OR REPLACE FUNCTION public.texticlike(citext, text)
 RETURNS boolean
 LANGUAGE internal
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$texticlike$function$
;

CREATE OR REPLACE FUNCTION public.texticnlike(citext, citext)
 RETURNS boolean
 LANGUAGE internal
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$texticnlike$function$
;

CREATE OR REPLACE FUNCTION public.texticnlike(citext, text)
 RETURNS boolean
 LANGUAGE internal
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$texticnlike$function$
;

CREATE OR REPLACE FUNCTION public.texticregexeq(citext, citext)
 RETURNS boolean
 LANGUAGE internal
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$texticregexeq$function$
;

CREATE OR REPLACE FUNCTION public.texticregexeq(citext, text)
 RETURNS boolean
 LANGUAGE internal
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$texticregexeq$function$
;

CREATE OR REPLACE FUNCTION public.texticregexne(citext, citext)
 RETURNS boolean
 LANGUAGE internal
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$texticregexne$function$
;

CREATE OR REPLACE FUNCTION public.texticregexne(citext, text)
 RETURNS boolean
 LANGUAGE internal
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$texticregexne$function$
;

CREATE OR REPLACE FUNCTION public.translate(citext, citext, text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT pg_catalog.translate( pg_catalog.translate( $1::pg_catalog.text, pg_catalog.lower($2::pg_catalog.text), $3), pg_catalog.upper($2::pg_catalog.text), $3);
$function$
;


-- ─── views (Firestore-shaped compatibility layer) ──────────────────────────

create or replace view fs_accounts as
SELECT id::text AS id,
    name,
    type,
    is_bank AS "isBank",
    opening_balance_npr AS "openingBalanceNPR",
    created_at AS "createdAt"
   FROM accounts;

create or replace view fs_attendance as
SELECT a.id::text AS id,
    to_char(a.date::timestamp with time zone, 'YYYY-MM-DD'::text) AS date,
    a.status,
    a.hours,
    a.late_minutes AS "lateMinutes",
    a.late_cut_applied AS "lateCutApplied",
    a.note,
    a.logged_by AS "loggedBy",
    COALESCE(a.legacy_staff_id, pe.legacy_firebase_uid, a.person_id::text) AS "staffId",
    COALESCE(a.legacy_staff_name, pe.full_name) AS "staffName",
    COALESCE(a.legacy_role, po.label, ''::text) AS role,
    a.person_id,
    a.created_at AS "createdAt"
   FROM attendance a
     LEFT JOIN people pe ON pe.id = a.person_id
     LEFT JOIN positions po ON po.id = pe.position_id;

create or replace view fs_bank_transactions as
SELECT id::text AS id,
    COALESCE(txn_date_text, to_char(txn_at, 'YYYY-MM-DD HH24:MI'::text)) AS date,
    txn_at AS "timestamp",
    type,
    amount,
    balance,
    description,
    remarks,
    created_at AS "createdAt"
   FROM bank_transactions;

create or replace view fs_budget_requests as
SELECT id::text AS id,
    br_ref AS "brId",
    title,
    type,
    category,
    urgency,
    quantity,
    notes,
    amount,
    amount_npr AS "amountNPR",
    amount_gbp AS "amountGBP",
    status,
    requested_by AS "requestedBy",
    requested_by_role AS "requestedByRole",
    reviewed_by AS "reviewedBy",
    reviewed_at AS "reviewedAt",
    created_at AS "createdAt",
    requested_by_id
   FROM budget_requests b;

create or replace view fs_clock_ins as
SELECT c.id::text AS id,
    to_char(c.date::timestamp with time zone, 'YYYY-MM-DD'::text) AS date,
    c.clocked_in_at AS "clockedInAt",
    c.clocked_out_at AS "clockedOutAt",
    c.worked_hours AS "workedHours",
    c.lat,
    c.lng,
    c.accuracy_m AS "accuracyM",
    c.distance_to_site_m AS "distanceToSiteM",
    c.bypass_used AS "bypassUsed",
    COALESCE(c.legacy_staff_id, pe.legacy_firebase_uid, c.person_id::text) AS "staffId",
    COALESCE(c.legacy_staff_name, pe.full_name) AS "staffName",
    COALESCE(c.legacy_role, ''::text) AS role,
    c.person_id
   FROM clock_ins c
     LEFT JOIN people pe ON pe.id = c.person_id;

create or replace view fs_content as
SELECT id::text AS id,
    topic,
    content_type AS "contentType",
    platform,
    status,
    to_char(post_date::timestamp with time zone, 'YYYY-MM-DD'::text) AS date,
    created_by AS "createdBy",
    created_at AS "createdAt"
   FROM content_posts;

create or replace view fs_content_calendar as
SELECT id::text AS id,
    title,
    type,
    status,
    to_char(scheduled_date::timestamp with time zone, 'YYYY-MM-DD'::text) AS "scheduledDate",
    time_slot AS "timeSlot",
    notes,
    media_url AS "mediaUrl",
    created_at AS "createdAt"
   FROM content_calendar;

create or replace view fs_counters as
SELECT id,
    next_invoice AS "nextInvoice",
    next_quotation AS "nextQuotation"
   FROM counters;

create or replace view fs_customers as
SELECT id::text AS id,
    name,
    contact_person AS "contactPerson",
    email::text AS email,
    phone,
    address,
    city,
    country,
    notes,
    created_at AS "createdAt"
   FROM customers;

create or replace view fs_employees as
SELECT pe.id::text AS id,
    pe.full_name AS name,
    pe.email::text AS email,
    COALESCE(po.label, ''::text) AS role,
    pe.position_id AS "positionId",
    pe.status,
    pe.location,
    pe.department,
    pe.phone,
    pe.address,
    pe.basic_salary_npr AS "basicSalaryNPR",
    pe.bank_name AS "bankName",
    pe.bank_branch AS "bankBranch",
    pe.bank_account AS "bankAccount",
    pe.pan_number AS "panNumber",
    pe.join_date AS "joinDate",
    pe.is_production_worker AS "isProductionWorker",
    to_char(pe.schedule_start::interval, 'HH24:MI'::text) AS "scheduleStart",
    to_char(pe.schedule_end::interval, 'HH24:MI'::text) AS "scheduleEnd",
    pe.schedule_working_days AS "scheduleWorkingDays",
    pe.schedule_day_overrides AS "scheduleDayOverrides",
    pe.schedule_note AS "scheduleNote",
    pe.legacy_firebase_uid AS uid,
    pe.created_at AS "createdAt",
    pe.updated_at AS "updatedAt"
   FROM people pe
     LEFT JOIN positions po ON po.id = pe.position_id;

create or replace view fs_fabrics as
SELECT id::text AS id,
    name,
    type,
    composition,
    supplier,
    gsm,
    weight,
    price_per_meter,
    price_per_kg AS "pricePerKg",
    available_colors,
    status,
    notes,
    swatch_image_url AS "swatchImageUrl",
    created_at AS "createdAt",
    updated_at AS "updatedAt"
   FROM fabrics;

create or replace view fs_finance_expenses as
SELECT id::text AS id,
    to_char(expense_date::timestamp with time zone, 'YYYY-MM-DD'::text) AS date,
    category,
    amount_npr AS "amountNPR",
    note,
    status,
    vat_bill AS "vatBill",
    logged_by AS "loggedBy",
    created_at AS "createdAt"
   FROM expenses;

create or replace view fs_finance_payroll as
SELECT p.id::text AS id,
    p.month,
    p.year,
    p.basic_npr AS "basicNPR",
    p.salary_npr AS "salaryNPR",
    p.bonus_npr AS "bonusNPR",
    p.overtime_npr AS "overtimeNPR",
    p.deduction_npr AS "deductionNPR",
    p.pf_deduction_npr AS "pfDeductionNPR",
    p.late_deduction_npr AS "lateDeductionNPR",
    p.late_days AS "lateDays",
    p.late_cuts_count AS "lateCutsCount",
    p.total_deductions_npr AS "totalDeductionsNPR",
    p.gross_npr AS "grossNPR",
    p.net_npr AS "netNPR",
    p.note,
    p.logged_by AS "loggedBy",
    COALESCE(p.legacy_staff_id, pe.legacy_firebase_uid) AS "staffId",
    COALESCE(p.legacy_staff_name, pe.full_name) AS "staffName",
    COALESCE(p.legacy_role, ''::text) AS role,
    p.person_id
   FROM payroll p
     LEFT JOIN people pe ON pe.id = p.person_id;

create or replace view fs_finance_purchases as
SELECT id::text AS id,
    expense_ref AS "expenseId",
    to_char(purchase_date::timestamp with time zone, 'YYYY-MM-DD'::text) AS date,
    expense_item AS "expenseItem",
    category,
    amount_npr AS "amountNPR",
    subtotal_npr AS "subtotalNPR",
    discount_amt AS "discountAmt",
    taxable_amt AS "taxableAmt",
    vat_amount_npr AS "vatAmountNPR",
    vat_bill AS "vatBill",
    payment_type AS "paymentType",
    bank_name AS "bankName",
    created_at AS "createdAt",
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('particulars', l.particulars, 'quantity', l.qty, 'unit', l.unit, 'rate', l.rate, 'amount', l.amount) ORDER BY l.seq) AS jsonb_agg
           FROM line_items l
          WHERE l.purchase_id = p.id), '[]'::jsonb) AS items
   FROM purchases p;

create or replace view fs_inventory as
SELECT id::text AS id,
    item_ref AS "itemId",
    item,
    category,
    unit,
    supplier,
    location,
    condition,
    owner,
    opening_stock AS "openingStock",
    stock_in AS "stockIn",
    stock_used AS "stockUsed",
    min_level AS "minLevel",
    unit_cost_npr AS "unitCostNPR",
    size_rows AS "sizeRows",
    damage_log AS "damageLog",
    to_char(last_updated::timestamp with time zone, 'YYYY-MM-DD'::text) AS "lastUpdated",
    created_by AS "createdBy",
    updated_by AS "updatedBy",
    created_at AS "createdAt"
   FROM inventory_items;

create or replace view fs_invoices as
SELECT id::text AS id,
    invoice_no AS "invoiceNumber",
    client_name AS "clientName",
    client_address AS "clientAddress",
    client_phone AS "clientPhone",
    client_pan AS "clientPAN",
    currency,
    to_char(invoice_date::timestamp with time zone, 'YYYY-MM-DD'::text) AS date,
    to_char(due_date::timestamp with time zone, 'YYYY-MM-DD'::text) AS "dueDate",
    fiscal_year AS "fiscalYear",
    apply_vat AS "applyVAT",
    subtotal_npr AS "subtotalNPR",
    discount_pct AS "discountPct",
    discount_amt_npr AS "discountAmtNPR",
    taxable_amt_npr AS "taxableAmtNPR",
    vat_amount_npr AS "vatAmountNPR",
    total_npr AS "totalNPR",
    amount_paid AS "amountPaid",
    status,
    payment_terms AS "paymentTerms",
    payment_type AS "paymentType",
    bank_name AS "bankName",
    related_quotation AS "relatedQuotation",
    related_challan AS "relatedChallan",
    challan_number AS "challanNumber",
    note,
    created_by AS "createdBy",
    updated_by AS "updatedBy",
    created_at AS "createdAt",
    updated_at AS "updatedAt",
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('description', l.description, 'qty', l.qty, 'unit', l.unit, 'rate', l.rate, 'amount', l.amount) ORDER BY l.seq) AS jsonb_agg
           FROM line_items l
          WHERE l.invoice_id = i.id), '[]'::jsonb) AS items
   FROM invoices i;

create or replace view fs_journal_entries as
SELECT id::text AS id,
    to_char(entry_date::timestamp with time zone, 'YYYY-MM-DD'::text) AS date,
    debit_account AS "debitAccount",
    credit_account AS "creditAccount",
    amount_npr AS "amountNPR",
    description,
    reference,
    created_by AS "createdBy",
    created_at AS "createdAt"
   FROM journal_entries;

create or replace view fs_messages as
SELECT m.id::text AS id,
    COALESCE(pe.legacy_firebase_uid, m.legacy_sender_id) AS "senderId",
    m.text,
    m.sent_at AS "timestamp",
    m.sender_id
   FROM messages m
     LEFT JOIN people pe ON pe.id = m.sender_id;

create or replace view fs_orders as
SELECT o.id::text AS id,
    o.order_no AS "orderId",
    o.customer_name AS "customerName",
    o.style_name AS "styleName",
    o.colorway,
    o.fabric_type AS "fabricType",
    o.quantity,
    o.price_per_pc_npr AS "pricePerPcNPR",
    o.total_value_npr AS "totalValueNPR",
    o.fabric_cost_per_pc_npr AS "fabricCostPerPcNPR",
    o.fabric_grams_used AS "fabricGramsUsed",
    o.fabric_required_per_pc AS "fabricRequiredPerPc",
    o.material_cost_total_npr AS "materialCostTotalNPR",
    o.stage,
    o.status,
    to_char(o.order_date::timestamp with time zone, 'YYYY-MM-DD'::text) AS date,
    to_char(o.delivery_date::timestamp with time zone, 'YYYY-MM-DD'::text) AS "deliveryDate",
    COALESCE(pe.full_name, ''::text) AS "assignedTo",
    o.invoice_ref AS "invoiceRef",
    o.sample_name AS "sampleName",
    o.notes,
    o.created_by AS "createdBy",
    o.created_at AS "createdAt",
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('stage', h.stage, 'date', to_char(h.changed_at::timestamp with time zone, 'YYYY-MM-DD'::text), 'by', h.changed_by) ORDER BY h.seq) AS jsonb_agg
           FROM order_stage_history h
          WHERE h.order_id = o.id), '[]'::jsonb) AS "stageHistory",
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', n.id::text, 'text', n.text, 'by', n.author) ORDER BY n.created_at) AS jsonb_agg
           FROM order_notes n
          WHERE n.order_id = o.id), '[]'::jsonb) AS "notesList",
    o.customer_id,
    o.assigned_to
   FROM orders o
     LEFT JOIN people pe ON pe.id = o.assigned_to;

create or replace view fs_patterns as
SELECT id::text AS id,
    style_no AS "styleNo",
    name,
    product_type,
    category,
    season,
    market,
    designer_name AS "designerName",
    sizes_available,
    available_colors,
    spec_size AS "specSize",
    to_char(spec_date::timestamp with time zone, 'YYYY-MM-DD'::text) AS "specDate",
    trims,
    wash_care AS "washCare",
    remarks,
    notes,
    measurements,
    fabric_rows AS "fabricRows",
    front_sketch_url AS "frontSketchUrl",
    back_sketch_url AS "backSketchUrl",
    tech_pack_url,
    tech_pack_images,
    created_at AS "createdAt",
    updated_at AS "updatedAt"
   FROM patterns;

create or replace view fs_processes as
SELECT id::text AS id,
    name,
    category,
    description,
    notes,
    cost_per_unit,
    lead_time_days,
    min_quantity,
    created_at AS "createdAt",
    updated_at AS "updatedAt"
   FROM processes;

create or replace view fs_product_costs as
SELECT code AS id,
    code,
    name,
    fabric,
    labour,
    rib,
    trims,
    others,
    total,
    updated_at AS "updatedAt"
   FROM product_costs;

create or replace view fs_production as
SELECT id::text AS id,
    batch_ref AS "batchId",
    to_char(batch_date::timestamp with time zone, 'YYYY-MM-DD'::text) AS date,
    cut,
    stitched,
    passed,
    rejected,
    note,
    logged_by AS "loggedBy",
    created_at AS "createdAt"
   FROM production_batches;

create or replace view fs_qc_logs as
SELECT id::text AS id,
    qc_ref AS "qcId",
    batch_ref AS "batchId",
    to_char(log_date::timestamp with time zone, 'YYYY-MM-DD'::text) AS date,
    inspected,
    passed,
    rejected,
    defect_type AS "defectType",
    action,
    checked_by AS "checkedBy",
    created_at AS "createdAt"
   FROM qc_logs;

create or replace view fs_quotations as
SELECT id::text AS id,
    quotation_no AS "quotationNumber",
    client_name AS "clientName",
    client_address AS "clientAddress",
    client_phone AS "clientPhone",
    client_pan AS "clientPAN",
    currency,
    to_char(quote_date::timestamp with time zone, 'YYYY-MM-DD'::text) AS date,
    to_char(valid_until::timestamp with time zone, 'YYYY-MM-DD'::text) AS "validUntil",
    subtotal_npr AS "subtotalNPR",
    discount_pct AS "discountPct",
    discount_amt_npr AS "discountAmtNPR",
    taxable_amt_npr AS "taxableAmtNPR",
    vat_amount_npr AS "vatAmountNPR",
    total_npr AS "totalNPR",
    status,
    terms,
    note,
    related_invoice AS "relatedInvoice",
    created_by AS "createdBy",
    updated_by AS "updatedBy",
    created_at AS "createdAt",
    updated_at AS "updatedAt",
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('description', l.description, 'qty', l.qty, 'unit', l.unit, 'rate', l.rate, 'amount', l.amount) ORDER BY l.seq) AS jsonb_agg
           FROM line_items l
          WHERE l.quotation_id = q.id), '[]'::jsonb) AS items
   FROM quotations q;

create or replace view fs_stage_config as
SELECT stage AS id,
    stage,
    enabled,
    sort_order AS "order",
    timeout_hours AS "timeoutHours",
    worker_names AS "workerNames",
    worker_uids AS "workerUids"
   FROM stage_config;

create or replace view fs_task_columns as
SELECT id::text AS id,
    label,
    sort_order AS "order",
    tone
   FROM task_columns;

create or replace view fs_tasks as
SELECT t.id::text AS id,
    t.title,
    t.description,
    t.notes,
    t.status,
    t.priority,
    t.category,
    COALESCE(pe.full_name, t.assignee, ''::text) AS assignee,
    t.customer,
    t.order_ref AS "orderRef",
    COALESCE(to_char(t.due_date::timestamp with time zone, 'YYYY-MM-DD'::text), ''::text) AS "dueDate",
    t.created_by AS "createdBy",
    t.created_at AS "createdAt",
    t.assignee_id
   FROM tasks t
     LEFT JOIN people pe ON pe.id = t.assignee_id;

create or replace view fs_unit_economics as
SELECT id::text AS id,
    data,
    created_at AS "createdAt"
   FROM unit_economics;

create or replace view fs_users as
SELECT pe.legacy_firebase_uid AS id,
    pe.legacy_firebase_uid AS uid,
    pe.full_name AS name,
    pe.email::text AS email,
    COALESCE(po.label, ''::text) AS "jobRole",
    pe.location,
    pe.status,
    po.tier,
    pe.id::text AS "personId"
   FROM people pe
     LEFT JOIN positions po ON po.id = pe.position_id;

create or replace view my_finance_tabs as
SELECT id AS tab_id,
    label,
    app_can_view_finance_tab(id) AS can_view
   FROM finance_tabs t;

create or replace view my_permissions as
SELECT id AS section_id,
    label,
    aliases,
    app_can_view(id) AS can_view,
    app_can_edit(id) AS can_edit
   FROM sections s;

create or replace view people_directory as
SELECT id,
    full_name,
    email,
    position_id,
    location,
    department,
    status
   FROM people;


-- ─── row level security ────────────────────────────────────────────────────
alter table accounts enable row level security;
alter table attendance enable row level security;
alter table bank_transactions enable row level security;
alter table budget_requests enable row level security;
alter table clock_ins enable row level security;
alter table content_calendar enable row level security;
alter table content_posts enable row level security;
alter table counters enable row level security;
alter table customers enable row level security;
alter table expenses enable row level security;
alter table fabrics enable row level security;
alter table finance_tabs enable row level security;
alter table inventory_items enable row level security;
alter table invoices enable row level security;
alter table journal_entries enable row level security;
alter table line_items enable row level security;
alter table messages enable row level security;
alter table order_notes enable row level security;
alter table order_stage_history enable row level security;
alter table orders enable row level security;
alter table patterns enable row level security;
alter table payroll enable row level security;
alter table people enable row level security;
alter table person_permission_overrides enable row level security;
alter table position_finance_tabs enable row level security;
alter table position_permissions enable row level security;
alter table positions enable row level security;
alter table processes enable row level security;
alter table product_costs enable row level security;
alter table production_batches enable row level security;
alter table purchases enable row level security;
alter table qc_logs enable row level security;
alter table quotations enable row level security;
alter table schema_migrations enable row level security;
alter table sections enable row level security;
alter table stage_config enable row level security;
alter table task_columns enable row level security;
alter table tasks enable row level security;
alter table unit_economics enable row level security;

create policy "require_known_issuer" on accounts
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on accounts
  as permissive for select
  to authenticated
  using (app_can_view('accounting'::text));
create policy "sect_write" on accounts
  as permissive for all
  to authenticated
  using (app_can_edit('accounting'::text))
  with check (app_can_edit('accounting'::text));
create policy "attendance_grant" on attendance
  as permissive for select
  to authenticated
  using ((app_can_view('attendance'::text) AND (app_tier() >= 2)));
create policy "attendance_manage" on attendance
  as permissive for all
  to authenticated
  using ((app_can_edit('attendance'::text) AND (app_tier() >= 2)))
  with check ((app_can_edit('attendance'::text) AND (app_tier() >= 2)));
create policy "attendance_self" on attendance
  as permissive for select
  to authenticated
  using ((person_id = app_person_id()));
create policy "attendance_self_update" on attendance
  as permissive for update
  to authenticated
  using ((person_id = app_person_id()))
  with check ((person_id = app_person_id()));
create policy "attendance_self_write" on attendance
  as permissive for insert
  to authenticated
  with check ((person_id = app_person_id()));
create policy "require_known_issuer" on attendance
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "bank_read" on bank_transactions
  as permissive for select
  to authenticated
  using ((app_can_view('finance'::text) AND app_can_view_finance_tab('bank'::text)));
create policy "bank_write" on bank_transactions
  as permissive for all
  to authenticated
  using ((app_can_edit('finance'::text) AND app_can_view_finance_tab('bank'::text)))
  with check ((app_can_edit('finance'::text) AND app_can_view_finance_tab('bank'::text)));
create policy "require_known_issuer" on bank_transactions
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "budget_manage" on budget_requests
  as permissive for all
  to authenticated
  using (app_can_edit('budget'::text))
  with check (app_can_edit('budget'::text));
create policy "budget_own" on budget_requests
  as permissive for select
  to authenticated
  using ((requested_by_id = app_person_id()));
create policy "budget_own_create" on budget_requests
  as permissive for insert
  to authenticated
  with check ((requested_by_id = app_person_id()));
create policy "budget_read" on budget_requests
  as permissive for select
  to authenticated
  using (app_can_view('budget'::text));
create policy "require_known_issuer" on budget_requests
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "clockins_grant" on clock_ins
  as permissive for select
  to authenticated
  using ((app_can_view('attendance'::text) AND (app_tier() >= 2)));
create policy "clockins_manage" on clock_ins
  as permissive for all
  to authenticated
  using ((app_can_edit('attendance'::text) AND (app_tier() >= 2)))
  with check ((app_can_edit('attendance'::text) AND (app_tier() >= 2)));
create policy "clockins_self" on clock_ins
  as permissive for select
  to authenticated
  using ((person_id = app_person_id()));
create policy "clockins_self_update" on clock_ins
  as permissive for update
  to authenticated
  using ((person_id = app_person_id()))
  with check ((person_id = app_person_id()));
create policy "clockins_self_write" on clock_ins
  as permissive for insert
  to authenticated
  with check ((person_id = app_person_id()));
create policy "require_known_issuer" on clock_ins
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "require_known_issuer" on content_calendar
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on content_calendar
  as permissive for select
  to authenticated
  using (app_can_view('content'::text));
create policy "sect_write" on content_calendar
  as permissive for all
  to authenticated
  using (app_can_edit('content'::text))
  with check (app_can_edit('content'::text));
create policy "require_known_issuer" on content_posts
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on content_posts
  as permissive for select
  to authenticated
  using (app_can_view('content'::text));
create policy "sect_write" on content_posts
  as permissive for all
  to authenticated
  using (app_can_edit('content'::text))
  with check (app_can_edit('content'::text));
create policy "require_known_issuer" on counters
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on counters
  as permissive for select
  to authenticated
  using (app_can_view('billing'::text));
create policy "sect_write" on counters
  as permissive for all
  to authenticated
  using (app_can_edit('billing'::text))
  with check (app_can_edit('billing'::text));
create policy "require_known_issuer" on customers
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on customers
  as permissive for select
  to authenticated
  using (app_can_view('customers'::text));
create policy "sect_write" on customers
  as permissive for all
  to authenticated
  using (app_can_edit('customers'::text))
  with check (app_can_edit('customers'::text));
create policy "require_known_issuer" on expenses
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on expenses
  as permissive for select
  to authenticated
  using (app_can_view('finance'::text));
create policy "sect_write" on expenses
  as permissive for all
  to authenticated
  using (app_can_edit('finance'::text))
  with check (app_can_edit('finance'::text));
create policy "require_known_issuer" on fabrics
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on fabrics
  as permissive for select
  to authenticated
  using (app_can_view('library'::text));
create policy "sect_write" on fabrics
  as permissive for all
  to authenticated
  using (app_can_edit('library'::text))
  with check (app_can_edit('library'::text));
create policy "admin_write" on finance_tabs
  as permissive for all
  to authenticated
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));
create policy "read_all" on finance_tabs
  as permissive for select
  to authenticated
  using ((auth.uid() IS NOT NULL));
create policy "require_known_issuer" on finance_tabs
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "require_known_issuer" on inventory_items
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on inventory_items
  as permissive for select
  to authenticated
  using (app_can_view('inventory'::text));
create policy "sect_write" on inventory_items
  as permissive for all
  to authenticated
  using (app_can_edit('inventory'::text))
  with check (app_can_edit('inventory'::text));
create policy "require_known_issuer" on invoices
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on invoices
  as permissive for select
  to authenticated
  using (app_can_view('billing'::text));
create policy "sect_write" on invoices
  as permissive for all
  to authenticated
  using (app_can_edit('billing'::text))
  with check (app_can_edit('billing'::text));
create policy "require_known_issuer" on journal_entries
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on journal_entries
  as permissive for select
  to authenticated
  using (app_can_view('accounting'::text));
create policy "sect_write" on journal_entries
  as permissive for all
  to authenticated
  using (app_can_edit('accounting'::text))
  with check (app_can_edit('accounting'::text));
create policy "require_known_issuer" on line_items
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on line_items
  as permissive for select
  to authenticated
  using (app_can_view('billing'::text));
create policy "sect_write" on line_items
  as permissive for all
  to authenticated
  using (app_can_edit('billing'::text))
  with check (app_can_edit('billing'::text));
create policy "require_known_issuer" on messages
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on messages
  as permissive for select
  to authenticated
  using (app_can_view('messenger'::text));
create policy "sect_write" on messages
  as permissive for all
  to authenticated
  using (app_can_edit('messenger'::text))
  with check (app_can_edit('messenger'::text));
create policy "require_known_issuer" on order_notes
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on order_notes
  as permissive for select
  to authenticated
  using (app_can_view('orders'::text));
create policy "sect_write" on order_notes
  as permissive for all
  to authenticated
  using (app_can_edit('orders'::text))
  with check (app_can_edit('orders'::text));
create policy "require_known_issuer" on order_stage_history
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on order_stage_history
  as permissive for select
  to authenticated
  using (app_can_view('orders'::text));
create policy "sect_write" on order_stage_history
  as permissive for all
  to authenticated
  using (app_can_edit('orders'::text))
  with check (app_can_edit('orders'::text));
create policy "require_known_issuer" on orders
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on orders
  as permissive for select
  to authenticated
  using (app_can_view('orders'::text));
create policy "sect_write" on orders
  as permissive for all
  to authenticated
  using (app_can_edit('orders'::text))
  with check (app_can_edit('orders'::text));
create policy "require_known_issuer" on patterns
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on patterns
  as permissive for select
  to authenticated
  using (app_can_view('library'::text));
create policy "sect_write" on patterns
  as permissive for all
  to authenticated
  using (app_can_edit('library'::text))
  with check (app_can_edit('library'::text));
create policy "payroll_grant" on payroll
  as permissive for select
  to authenticated
  using ((app_can_view('payroll'::text) AND app_can_view_finance_tab('payroll'::text)));
create policy "payroll_manage" on payroll
  as permissive for all
  to authenticated
  using (app_can_edit('payroll'::text))
  with check (app_can_edit('payroll'::text));
create policy "payroll_self" on payroll
  as permissive for select
  to authenticated
  using ((person_id = app_person_id()));
create policy "require_known_issuer" on payroll
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "people_hr_read" on people
  as permissive for select
  to authenticated
  using ((app_can_view('employees'::text) AND (app_tier() >= 2)));
create policy "people_hr_write" on people
  as permissive for all
  to authenticated
  using (app_can_edit('employees'::text))
  with check (app_can_edit('employees'::text));
create policy "people_self_read" on people
  as permissive for select
  to authenticated
  using ((id = app_person_id()));
create policy "people_self_update" on people
  as permissive for update
  to authenticated
  using ((id = app_person_id()))
  with check ((id = app_person_id()));
create policy "require_known_issuer" on people
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "require_known_issuer" on permission_drift_log
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "overrides_admin" on person_permission_overrides
  as permissive for all
  to authenticated
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));
create policy "overrides_read_self" on person_permission_overrides
  as permissive for select
  to authenticated
  using (((person_id = app_person_id()) OR app_can_view('admin'::text)));
create policy "require_known_issuer" on person_permission_overrides
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "admin_write" on position_finance_tabs
  as permissive for all
  to authenticated
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));
create policy "read_all" on position_finance_tabs
  as permissive for select
  to authenticated
  using ((auth.uid() IS NOT NULL));
create policy "require_known_issuer" on position_finance_tabs
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "admin_write" on position_permissions
  as permissive for all
  to authenticated
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));
create policy "read_all" on position_permissions
  as permissive for select
  to authenticated
  using ((auth.uid() IS NOT NULL));
create policy "require_known_issuer" on position_permissions
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "admin_write" on positions
  as permissive for all
  to authenticated
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));
create policy "read_all" on positions
  as permissive for select
  to authenticated
  using ((auth.uid() IS NOT NULL));
create policy "require_known_issuer" on positions
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "require_known_issuer" on processes
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on processes
  as permissive for select
  to authenticated
  using (app_can_view('library'::text));
create policy "sect_write" on processes
  as permissive for all
  to authenticated
  using (app_can_edit('library'::text))
  with check (app_can_edit('library'::text));
create policy "require_known_issuer" on product_costs
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on product_costs
  as permissive for select
  to authenticated
  using (app_can_view('finance'::text));
create policy "sect_write" on product_costs
  as permissive for all
  to authenticated
  using (app_can_edit('finance'::text))
  with check (app_can_edit('finance'::text));
create policy "require_known_issuer" on production_batches
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on production_batches
  as permissive for select
  to authenticated
  using (app_can_view('production'::text));
create policy "sect_write" on production_batches
  as permissive for all
  to authenticated
  using (app_can_edit('production'::text))
  with check (app_can_edit('production'::text));
create policy "require_known_issuer" on purchases
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on purchases
  as permissive for select
  to authenticated
  using (app_can_view('purchases'::text));
create policy "sect_write" on purchases
  as permissive for all
  to authenticated
  using (app_can_edit('purchases'::text))
  with check (app_can_edit('purchases'::text));
create policy "require_known_issuer" on qc_logs
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on qc_logs
  as permissive for select
  to authenticated
  using (app_can_view('quality_control'::text));
create policy "sect_write" on qc_logs
  as permissive for all
  to authenticated
  using (app_can_edit('quality_control'::text))
  with check (app_can_edit('quality_control'::text));
create policy "require_known_issuer" on quotations
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on quotations
  as permissive for select
  to authenticated
  using (app_can_view('billing'::text));
create policy "sect_write" on quotations
  as permissive for all
  to authenticated
  using (app_can_edit('billing'::text))
  with check (app_can_edit('billing'::text));
create policy "require_known_issuer" on schema_migrations
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "admin_write" on sections
  as permissive for all
  to authenticated
  using (app_can_edit('admin'::text))
  with check (app_can_edit('admin'::text));
create policy "read_all" on sections
  as permissive for select
  to authenticated
  using ((auth.uid() IS NOT NULL));
create policy "require_known_issuer" on sections
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "require_known_issuer" on stage_config
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on stage_config
  as permissive for select
  to authenticated
  using (app_can_view('production'::text));
create policy "sect_write" on stage_config
  as permissive for all
  to authenticated
  using (app_can_edit('production'::text))
  with check (app_can_edit('production'::text));
create policy "require_known_issuer" on task_columns
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on task_columns
  as permissive for select
  to authenticated
  using (app_can_view('tasks'::text));
create policy "sect_write" on task_columns
  as permissive for all
  to authenticated
  using (app_can_edit('tasks'::text))
  with check (app_can_edit('tasks'::text));
create policy "require_known_issuer" on tasks
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on tasks
  as permissive for select
  to authenticated
  using (app_can_view('tasks'::text));
create policy "sect_write" on tasks
  as permissive for all
  to authenticated
  using (app_can_edit('tasks'::text))
  with check (app_can_edit('tasks'::text));
create policy "require_known_issuer" on unit_economics
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on unit_economics
  as permissive for select
  to authenticated
  using (app_can_view('finance'::text));
create policy "sect_write" on unit_economics
  as permissive for all
  to authenticated
  using (app_can_edit('finance'::text))
  with check (app_can_edit('finance'::text));


-- ─── grants ────────────────────────────────────────────────────────────────
grant delete, insert, references, select, trigger, truncate, update on accounts to anon;
grant delete, insert, references, select, trigger, truncate, update on accounts to authenticated;
grant delete, insert, references, select, trigger, truncate, update on accounts to service_role;
grant delete, insert, references, select, trigger, truncate, update on attendance to anon;
grant delete, insert, references, select, trigger, truncate, update on attendance to authenticated;
grant delete, insert, references, select, trigger, truncate, update on attendance to service_role;
grant delete, insert, references, select, trigger, truncate, update on bank_transactions to anon;
grant delete, insert, references, select, trigger, truncate, update on bank_transactions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on bank_transactions to service_role;
grant delete, insert, references, select, trigger, truncate, update on budget_requests to anon;
grant delete, insert, references, select, trigger, truncate, update on budget_requests to authenticated;
grant delete, insert, references, select, trigger, truncate, update on budget_requests to service_role;
grant delete, insert, references, select, trigger, truncate, update on clock_ins to anon;
grant delete, insert, references, select, trigger, truncate, update on clock_ins to authenticated;
grant delete, insert, references, select, trigger, truncate, update on clock_ins to service_role;
grant delete, insert, references, select, trigger, truncate, update on content_calendar to anon;
grant delete, insert, references, select, trigger, truncate, update on content_calendar to authenticated;
grant delete, insert, references, select, trigger, truncate, update on content_calendar to service_role;
grant delete, insert, references, select, trigger, truncate, update on content_posts to anon;
grant delete, insert, references, select, trigger, truncate, update on content_posts to authenticated;
grant delete, insert, references, select, trigger, truncate, update on content_posts to service_role;
grant delete, insert, references, select, trigger, truncate, update on counters to anon;
grant delete, insert, references, select, trigger, truncate, update on counters to authenticated;
grant delete, insert, references, select, trigger, truncate, update on counters to service_role;
grant delete, insert, references, select, trigger, truncate, update on customers to anon;
grant delete, insert, references, select, trigger, truncate, update on customers to authenticated;
grant delete, insert, references, select, trigger, truncate, update on customers to service_role;
grant delete, insert, references, select, trigger, truncate, update on expenses to anon;
grant delete, insert, references, select, trigger, truncate, update on expenses to authenticated;
grant delete, insert, references, select, trigger, truncate, update on expenses to service_role;
grant delete, insert, references, select, trigger, truncate, update on fabrics to anon;
grant delete, insert, references, select, trigger, truncate, update on fabrics to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fabrics to service_role;
grant delete, insert, references, select, trigger, truncate, update on finance_tabs to anon;
grant delete, insert, references, select, trigger, truncate, update on finance_tabs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on finance_tabs to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_accounts to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_accounts to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_accounts to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_attendance to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_attendance to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_attendance to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_bank_transactions to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_bank_transactions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_bank_transactions to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_budget_requests to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_budget_requests to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_budget_requests to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_clock_ins to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_clock_ins to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_clock_ins to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_content to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_content to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_content to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_content_calendar to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_content_calendar to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_content_calendar to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_counters to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_counters to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_counters to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_customers to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_customers to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_customers to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_employees to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_employees to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_employees to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_fabrics to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_fabrics to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_fabrics to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_finance_expenses to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_finance_expenses to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_finance_expenses to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_finance_payroll to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_finance_payroll to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_finance_payroll to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_finance_purchases to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_finance_purchases to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_finance_purchases to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_inventory to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_inventory to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_inventory to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_invoices to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_invoices to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_invoices to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_journal_entries to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_journal_entries to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_journal_entries to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_messages to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_messages to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_messages to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_orders to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_orders to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_orders to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_patterns to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_patterns to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_patterns to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_processes to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_processes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_processes to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_product_costs to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_product_costs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_product_costs to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_production to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_production to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_production to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_qc_logs to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_qc_logs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_qc_logs to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_quotations to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_quotations to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_quotations to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_stage_config to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_stage_config to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_stage_config to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_task_columns to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_task_columns to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_task_columns to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_tasks to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_tasks to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_tasks to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_unit_economics to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_unit_economics to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_unit_economics to service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_users to anon;
grant delete, insert, references, select, trigger, truncate, update on fs_users to authenticated;
grant delete, insert, references, select, trigger, truncate, update on fs_users to service_role;
grant delete, insert, references, select, trigger, truncate, update on inventory_items to anon;
grant delete, insert, references, select, trigger, truncate, update on inventory_items to authenticated;
grant delete, insert, references, select, trigger, truncate, update on inventory_items to service_role;
grant delete, insert, references, select, trigger, truncate, update on invoices to anon;
grant delete, insert, references, select, trigger, truncate, update on invoices to authenticated;
grant delete, insert, references, select, trigger, truncate, update on invoices to service_role;
grant delete, insert, references, select, trigger, truncate, update on journal_entries to anon;
grant delete, insert, references, select, trigger, truncate, update on journal_entries to authenticated;
grant delete, insert, references, select, trigger, truncate, update on journal_entries to service_role;
grant delete, insert, references, select, trigger, truncate, update on line_items to anon;
grant delete, insert, references, select, trigger, truncate, update on line_items to authenticated;
grant delete, insert, references, select, trigger, truncate, update on line_items to service_role;
grant delete, insert, references, select, trigger, truncate, update on messages to anon;
grant delete, insert, references, select, trigger, truncate, update on messages to authenticated;
grant delete, insert, references, select, trigger, truncate, update on messages to service_role;
grant delete, insert, references, select, trigger, truncate, update on my_finance_tabs to anon;
grant delete, insert, references, select, trigger, truncate, update on my_finance_tabs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on my_finance_tabs to service_role;
grant delete, insert, references, select, trigger, truncate, update on my_permissions to anon;
grant delete, insert, references, select, trigger, truncate, update on my_permissions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on my_permissions to service_role;
grant delete, insert, references, select, trigger, truncate, update on order_notes to anon;
grant delete, insert, references, select, trigger, truncate, update on order_notes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on order_notes to service_role;
grant delete, insert, references, select, trigger, truncate, update on order_stage_history to anon;
grant delete, insert, references, select, trigger, truncate, update on order_stage_history to authenticated;
grant delete, insert, references, select, trigger, truncate, update on order_stage_history to service_role;
grant delete, insert, references, select, trigger, truncate, update on orders to anon;
grant delete, insert, references, select, trigger, truncate, update on orders to authenticated;
grant delete, insert, references, select, trigger, truncate, update on orders to service_role;
grant delete, insert, references, select, trigger, truncate, update on patterns to anon;
grant delete, insert, references, select, trigger, truncate, update on patterns to authenticated;
grant delete, insert, references, select, trigger, truncate, update on patterns to service_role;
grant delete, insert, references, select, trigger, truncate, update on payroll to anon;
grant delete, insert, references, select, trigger, truncate, update on payroll to authenticated;
grant delete, insert, references, select, trigger, truncate, update on payroll to service_role;
grant delete, insert, references, select, trigger, truncate, update on people to anon;
grant delete, insert, references, select, trigger, truncate, update on people to authenticated;
grant delete, insert, references, select, trigger, truncate, update on people to service_role;
grant delete, insert, references, select, trigger, truncate, update on people_directory to anon;
grant delete, insert, references, select, trigger, truncate, update on people_directory to authenticated;
grant delete, insert, references, select, trigger, truncate, update on people_directory to service_role;
grant delete, insert, references, select, trigger, truncate, update on permission_drift_log to anon;
grant delete, insert, references, select, trigger, truncate, update on permission_drift_log to authenticated;
grant delete, insert, references, select, trigger, truncate, update on permission_drift_log to service_role;
grant delete, insert, references, select, trigger, truncate, update on person_permission_overrides to anon;
grant delete, insert, references, select, trigger, truncate, update on person_permission_overrides to authenticated;
grant delete, insert, references, select, trigger, truncate, update on person_permission_overrides to service_role;
grant delete, insert, references, select, trigger, truncate, update on position_finance_tabs to anon;
grant delete, insert, references, select, trigger, truncate, update on position_finance_tabs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on position_finance_tabs to service_role;
grant delete, insert, references, select, trigger, truncate, update on position_permissions to anon;
grant delete, insert, references, select, trigger, truncate, update on position_permissions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on position_permissions to service_role;
grant delete, insert, references, select, trigger, truncate, update on positions to anon;
grant delete, insert, references, select, trigger, truncate, update on positions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on positions to service_role;
grant delete, insert, references, select, trigger, truncate, update on processes to anon;
grant delete, insert, references, select, trigger, truncate, update on processes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on processes to service_role;
grant delete, insert, references, select, trigger, truncate, update on product_costs to anon;
grant delete, insert, references, select, trigger, truncate, update on product_costs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on product_costs to service_role;
grant delete, insert, references, select, trigger, truncate, update on production_batches to anon;
grant delete, insert, references, select, trigger, truncate, update on production_batches to authenticated;
grant delete, insert, references, select, trigger, truncate, update on production_batches to service_role;
grant delete, insert, references, select, trigger, truncate, update on purchases to anon;
grant delete, insert, references, select, trigger, truncate, update on purchases to authenticated;
grant delete, insert, references, select, trigger, truncate, update on purchases to service_role;
grant delete, insert, references, select, trigger, truncate, update on qc_logs to anon;
grant delete, insert, references, select, trigger, truncate, update on qc_logs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on qc_logs to service_role;
grant delete, insert, references, select, trigger, truncate, update on quotations to anon;
grant delete, insert, references, select, trigger, truncate, update on quotations to authenticated;
grant delete, insert, references, select, trigger, truncate, update on quotations to service_role;
grant delete, insert, references, select, trigger, truncate, update on schema_migrations to anon;
grant delete, insert, references, select, trigger, truncate, update on schema_migrations to authenticated;
grant delete, insert, references, select, trigger, truncate, update on schema_migrations to service_role;
grant delete, insert, references, select, trigger, truncate, update on sections to anon;
grant delete, insert, references, select, trigger, truncate, update on sections to authenticated;
grant delete, insert, references, select, trigger, truncate, update on sections to service_role;
grant delete, insert, references, select, trigger, truncate, update on stage_config to anon;
grant delete, insert, references, select, trigger, truncate, update on stage_config to authenticated;
grant delete, insert, references, select, trigger, truncate, update on stage_config to service_role;
grant delete, insert, references, select, trigger, truncate, update on task_columns to anon;
grant delete, insert, references, select, trigger, truncate, update on task_columns to authenticated;
grant delete, insert, references, select, trigger, truncate, update on task_columns to service_role;
grant delete, insert, references, select, trigger, truncate, update on tasks to anon;
grant delete, insert, references, select, trigger, truncate, update on tasks to authenticated;
grant delete, insert, references, select, trigger, truncate, update on tasks to service_role;
grant delete, insert, references, select, trigger, truncate, update on unit_economics to anon;
grant delete, insert, references, select, trigger, truncate, update on unit_economics to authenticated;
grant delete, insert, references, select, trigger, truncate, update on unit_economics to service_role;

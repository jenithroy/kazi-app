-- =====================================================================
-- 0002 — business tables
-- Line items that lived as JSON arrays inside Firestore docs become real
-- child tables. Base64 images become Storage URLs (see 0004).
-- =====================================================================

-- ---------- customers, orders ----------------------------------------
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text, email citext, phone text,
  address text, city text, country text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_no       text unique,
  customer_id    uuid references customers(id) on delete set null,
  customer_name  text,
  style_name     text,
  colorway       text,
  fabric_type    text,
  quantity       numeric(12,2) not null default 0,
  price_per_pc_npr numeric(12,2) not null default 0,
  total_value_npr  numeric(14,2) not null default 0,
  fabric_cost_per_pc_npr numeric(12,2),
  fabric_grams_used numeric(12,2),
  fabric_required_per_pc numeric(12,2),
  material_cost_total_npr numeric(14,2),
  stage          text,
  status         text,
  order_date     date,
  delivery_date  date,
  assigned_to    uuid references people(id) on delete set null,
  invoice_ref    text,
  sample_name    text,
  notes          text,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on orders (customer_id);
create index on orders (stage);
create index on orders (order_date desc);

create table order_stage_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  stage text not null, changed_at date, changed_by text,
  seq int not null default 0
);
create index on order_stage_history (order_id, seq);

create table order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  text text not null, author text, created_at timestamptz not null default now()
);

-- ---------- billing: quotations and invoices --------------------------
create table quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_no text unique,
  client_name text, client_address text, client_phone text, client_pan text,
  currency text not null default 'NPR',
  quote_date date, valid_until date,
  subtotal_npr numeric(14,2) not null default 0,
  discount_pct numeric(6,2) not null default 0,
  discount_amt_npr numeric(14,2) not null default 0,
  taxable_amt_npr numeric(14,2) not null default 0,
  vat_amount_npr numeric(14,2) not null default 0,
  total_npr numeric(14,2) not null default 0,
  status text, terms text, note text, related_invoice text,
  created_by text, updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique,
  linked_order_id uuid references orders(id) on delete set null,
  client_name text, client_address text, client_phone text, client_pan text,
  currency text not null default 'NPR',
  invoice_date date, due_date date, fiscal_year text,
  apply_vat boolean not null default false,
  subtotal_npr numeric(14,2) not null default 0,
  discount_pct numeric(6,2) not null default 0,
  discount_amt_npr numeric(14,2) not null default 0,
  taxable_amt_npr numeric(14,2) not null default 0,
  vat_amount_npr numeric(14,2) not null default 0,
  total_npr numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  status text, payment_terms text, payment_type text, bank_name text,
  related_quotation text, related_challan text, challan_number text, note text,
  created_by text, updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on invoices (invoice_date desc);
create index on invoices (status);

-- one line-item table, discriminated by parent: these were JSON blobs before
create table line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id   uuid references invoices(id)   on delete cascade,
  quotation_id uuid references quotations(id) on delete cascade,
  purchase_id  uuid,
  seq int not null default 0,
  description text,
  particulars text,
  qty numeric(12,3),
  unit text,
  rate numeric(14,2),
  amount numeric(14,2),
  constraint one_parent check (num_nonnulls(invoice_id, quotation_id, purchase_id) = 1)
);
create index on line_items (invoice_id);
create index on line_items (quotation_id);
create index on line_items (purchase_id);

-- ---------- finance ---------------------------------------------------
create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null,
  is_bank boolean not null default false,
  opening_balance_npr numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text, amount_npr numeric(14,2) not null default 0,
  note text, status text, vat_bill boolean not null default false,
  logged_by text,
  created_at timestamptz not null default now()
);
create index on expenses (expense_date desc);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  expense_ref text,
  purchase_date date,
  expense_item text, category text,
  amount_npr numeric(14,2) not null default 0,
  subtotal_npr numeric(14,2), discount_amt numeric(14,2),
  taxable_amt numeric(14,2), vat_amount_npr numeric(14,2),
  vat_bill boolean, payment_type text, bank_name text,
  created_at timestamptz not null default now()
);
create index on purchases (purchase_date desc);
alter table line_items add constraint line_items_purchase_fk
  foreign key (purchase_id) references purchases(id) on delete cascade;

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  debit_account text, credit_account text,
  amount_npr numeric(14,2) not null default 0,
  description text, reference text, created_by text,
  created_at timestamptz not null default now()
);

create table bank_transactions (
  id uuid primary key default gen_random_uuid(),
  txn_at timestamptz, txn_date_text text,
  type text check (type in ('Debit','Credit')),
  amount numeric(14,2) not null default 0,
  balance numeric(14,2),
  description text, remarks text,
  created_at timestamptz not null default now()
);
create index on bank_transactions (txn_at desc);

create table budget_requests (
  id uuid primary key default gen_random_uuid(),
  br_ref text,
  title text not null, type text, category text, urgency text,
  quantity text, notes text,
  amount numeric(14,2), amount_npr numeric(14,2), amount_gbp numeric(14,2),
  status text not null default 'Pending',
  requested_by_id uuid references people(id) on delete set null,
  requested_by text, requested_by_role text,
  reviewed_by text, reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table unit_economics (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table product_costs (
  code text primary key,
  name text not null,
  fabric numeric(12,2) not null default 0,
  labour numeric(12,2) not null default 0,
  rib    numeric(12,2) not null default 0,
  trims  numeric(12,2) not null default 0,
  others numeric(12,2) not null default 0,
  total  numeric(12,2),
  updated_at timestamptz
);

-- ---------- product library, production, QC --------------------------
create table fabrics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text, composition text, supplier text,
  gsm numeric(8,2), weight text,
  price_per_meter numeric(12,2), price_per_kg numeric(12,2),
  available_colors text[],
  status text, notes text,
  swatch_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table patterns (
  id uuid primary key default gen_random_uuid(),
  style_no text, name text not null, product_type text, category text,
  season text, market text, designer_name text,
  sizes_available text[], available_colors text,
  spec_size text, spec_date date,
  trims text, wash_care text, remarks text, notes text,
  measurements jsonb not null default '[]'::jsonb,
  fabric_rows  jsonb not null default '[]'::jsonb,
  front_sketch_url text,
  back_sketch_url  text,
  tech_pack_url    text,
  tech_pack_images text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table processes (
  id uuid primary key default gen_random_uuid(),
  name text not null, category text, description text, notes text,
  cost_per_unit numeric(12,2) not null default 0,
  lead_time_days int not null default 0,
  min_quantity int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  item_ref text, item text not null, category text,
  unit text, supplier text, location text, condition text, owner text,
  opening_stock numeric(12,2) not null default 0,
  stock_in      numeric(12,2) not null default 0,
  stock_used    numeric(12,2) not null default 0,
  min_level     numeric(12,2) not null default 0,
  unit_cost_npr numeric(12,2) not null default 0,
  size_rows  jsonb not null default '[]'::jsonb,
  damage_log jsonb not null default '[]'::jsonb,
  last_updated date, created_by text, updated_by text,
  created_at timestamptz not null default now()
);

create table production_batches (
  id uuid primary key default gen_random_uuid(),
  batch_ref text unique, batch_date date,
  cut int not null default 0, stitched int not null default 0,
  passed int not null default 0, rejected int not null default 0,
  note text, logged_by text,
  created_at timestamptz not null default now()
);

create table qc_logs (
  id uuid primary key default gen_random_uuid(),
  qc_ref text, batch_ref text, log_date date,
  inspected int not null default 0, passed int not null default 0, rejected int not null default 0,
  defect_type text, action text, checked_by text,
  created_at timestamptz not null default now()
);

create table stage_config (
  stage text primary key,
  enabled boolean not null default true,
  sort_order int not null default 0,
  timeout_hours int not null default 0,
  worker_names text[] not null default '{}',
  worker_uids  text[] not null default '{}'
);

-- ---------- tasks, marketing, messaging ------------------------------
create table task_columns (
  id uuid primary key default gen_random_uuid(),
  label text not null, sort_order int not null default 0, tone text
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text, notes text,
  status text, priority text, category text,
  assignee_id uuid references people(id) on delete set null,
  assignee text, customer text, order_ref text,
  due_date date,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on tasks (assignee_id);
create index on tasks (status);

create table content_calendar (
  id uuid primary key default gen_random_uuid(),
  title text not null, type text, status text,
  scheduled_date date, time_slot text, notes text, media_url text,
  created_at timestamptz not null default now()
);

create table content_posts (
  id uuid primary key default gen_random_uuid(),
  topic text, content_type text, platform text, status text,
  post_date date, created_by text,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references people(id) on delete set null,
  legacy_sender_id text,
  text text not null,
  sent_at timestamptz not null default now()
);
create index on messages (sent_at desc);

create table counters (
  id text primary key,
  next_invoice int not null default 1,
  next_quotation int not null default 1
);

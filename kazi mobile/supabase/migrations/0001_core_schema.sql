-- =====================================================================
-- 0001 — core schema
-- Firestore → Postgres. One `people` table replaces the old split between
-- `users` (21 docs, auth + app role) and `employees` (10 docs, HR detail),
-- which disagreed with each other and had no reliable join key.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------- reference: sections & finance tabs -----------------------
-- Every gated area of BOTH apps. Named canonically; `aliases` carries the
-- key each app currently uses so neither client needs renaming on day one.
create table sections (
  id          text primary key,
  label       text not null,
  aliases     text[] not null default '{}',
  is_personal boolean not null default false,  -- holds per-person data (own-row scoping)
  sort_order  int  not null default 0
);
comment on column sections.is_personal is
  'True where rows belong to one person (attendance, payroll). Drives own-row RLS.';

create table finance_tabs (
  id text primary key, label text not null, sort_order int not null default 0
);

-- ---------- reference: positions -------------------------------------
-- The job title IS the permission unit. "Accountant", "Video Editor".
-- `tier` is only for cross-cutting privilege (approvals, seeing others' data)
-- and deliberately does NOT decide which pages you see.
create table positions (
  id          text primary key,
  label       text not null,
  tier        int  not null default 0 check (tier between 0 and 4),
  description text
);
comment on column positions.tier is
  '0 staff, 1 senior staff, 2 manager, 3 director, 4 system. Approvals + cross-person reads only.';

create table position_permissions (
  position_id text not null references positions(id) on delete cascade,
  section_id  text not null references sections(id)  on delete cascade,
  can_view    boolean not null default false,
  can_edit    boolean not null default false,
  primary key (position_id, section_id),
  constraint edit_implies_view check (not can_edit or can_view)
);

create table position_finance_tabs (
  position_id text not null references positions(id) on delete cascade,
  tab_id      text not null references finance_tabs(id) on delete cascade,
  can_view    boolean not null default false,
  can_edit    boolean not null default false,
  primary key (position_id, tab_id)
);

-- ---------- people ----------------------------------------------------
create table people (
  id                   uuid primary key default gen_random_uuid(),
  auth_uid             uuid unique references auth.users(id) on delete set null,
  legacy_firebase_uid  text unique,
  email                citext not null unique,
  full_name            text not null,
  position_id          text references positions(id),
  location             text check (location in ('nepal','uk')),
  department           text,
  status               text not null default 'Active' check (status in ('Active','Inactive')),
  phone                text,
  address              text,
  basic_salary_npr     numeric(12,2),
  bank_name            text,
  bank_branch          text,
  bank_account         text,
  pan_number           text,
  join_date            date,
  is_production_worker boolean not null default false,
  reports_to           uuid references people(id) on delete set null,
  schedule_start       time,
  schedule_end         time,
  schedule_working_days text[],
  schedule_day_overrides jsonb,
  schedule_note        text,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on column people.legacy_firebase_uid is
  'Old Firebase Auth uid. Attendance/clock_ins/payroll were keyed on this; kept so historic rows resolve.';

create index on people (position_id);
create index on people (legacy_firebase_uid);
create index on people (status);

-- Per-person exceptions to the position default. Should stay near-empty —
-- if a position needs different access, change the position matrix instead.
create table person_permission_overrides (
  person_id  uuid not null references people(id) on delete cascade,
  section_id text not null references sections(id) on delete cascade,
  can_view   boolean,
  can_edit   boolean,
  reason     text,
  granted_at timestamptz not null default now(),
  primary key (person_id, section_id)
);

-- ---------- attendance & time ----------------------------------------
create table attendance (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid references people(id) on delete cascade,
  date         date not null,
  status       text not null check (status in ('Present','Late','Absent','Half Day','Leave')),
  hours        numeric(5,2) not null default 0,
  late_minutes int not null default 0,
  late_cut_applied boolean not null default false,
  note         text,
  logged_by    text,
  legacy_staff_id   text,
  legacy_staff_name text,
  legacy_role       text,
  created_at   timestamptz not null default now(),
  unique (person_id, date)
);
create index on attendance (date);
create index on attendance (person_id, date desc);

create table clock_ins (
  id                uuid primary key default gen_random_uuid(),
  person_id         uuid references people(id) on delete cascade,
  date              date not null,
  clocked_in_at     timestamptz not null,
  clocked_out_at    timestamptz,
  worked_hours      numeric(5,2),
  lat               double precision,
  lng               double precision,
  accuracy_m        double precision,
  distance_to_site_m double precision,
  bypass_used       boolean not null default false,
  legacy_staff_id   text,
  legacy_staff_name text,
  legacy_role       text,
  created_at        timestamptz not null default now()
);
create index on clock_ins (person_id, date desc);

create table payroll (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid references people(id) on delete set null,
  month         text not null,
  year          int  not null,
  basic_npr     numeric(12,2) not null default 0,
  salary_npr    numeric(12,2),
  bonus_npr     numeric(12,2) not null default 0,
  overtime_npr  numeric(12,2) not null default 0,
  deduction_npr numeric(12,2) not null default 0,
  pf_deduction_npr numeric(12,2) not null default 0,
  late_deduction_npr numeric(12,2) not null default 0,
  late_days     int not null default 0,
  late_cuts_count int not null default 0,
  total_deductions_npr numeric(12,2) not null default 0,
  gross_npr     numeric(12,2) not null default 0,
  net_npr       numeric(12,2) not null default 0,
  note          text,
  logged_by     text,
  legacy_staff_id   text,
  legacy_staff_name text,
  legacy_role       text,
  created_at    timestamptz not null default now()
);
create index on payroll (person_id, year desc, month);

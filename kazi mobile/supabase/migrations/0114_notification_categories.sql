-- =====================================================================
-- 0114 — admin-toggleable notification categories
--
-- Mirrors position_finance_tabs' shape (a catalog table + a per-position
-- grant table), not a `sections` row — same reasoning 0105 gives for
-- chat_group_permissions: this is a mobile-owned notion, not something the
-- web ERP's own permission matrix should sprout a line for.
--
-- Only the BROADCAST half of a rule is ever gated by this — "you're the
-- assignee/creator/participant/mentioned" notifications stay unconditional,
-- everywhere. The mapping from event → category lives in code
-- (src/data/notifications/categories.ts), not here; this table only ever
-- answers "does this position want this category," nothing about routing
-- itself.
--
-- Default is opt-OUT, not opt-in: no row for a (position, category) pair
-- means enabled. Seeding this feature disabled-by-default would silently
-- turn off every notification that already works today for every position —
-- an admin dials specific ones down from here, not back up from nothing.
-- =====================================================================

create table if not exists notification_categories (
  id          text primary key,
  label       text not null,
  hint        text not null default '',
  sort_order  int not null default 0
);

create table if not exists position_notification_categories (
  position_id  text not null references positions(id) on delete cascade,
  category_id  text not null references notification_categories(id) on delete cascade,
  enabled      boolean not null default true,
  primary key (position_id, category_id)
);

alter table notification_categories enable row level security;
alter table position_notification_categories enable row level security;

drop policy if exists notification_categories_read on notification_categories;
create policy notification_categories_read on notification_categories for select to authenticated
  using (true);
drop policy if exists require_known_issuer on notification_categories;
create policy require_known_issuer on notification_categories
  as restrictive to authenticated using (app_issuer_ok());
grant select on notification_categories to authenticated;

-- Readable by anyone signed in (notify() has to check this for whoever the
-- event's recipient turns out to be, not just the caller), writable only
-- from the Admin Panel — same split as chat_group_permissions.
drop policy if exists position_notification_categories_read on position_notification_categories;
create policy position_notification_categories_read on position_notification_categories for select to authenticated
  using (true);
drop policy if exists position_notification_categories_write on position_notification_categories;
create policy position_notification_categories_write on position_notification_categories for all to authenticated
  using (app_can_edit('admin')) with check (app_can_edit('admin'));
drop policy if exists require_known_issuer on position_notification_categories;
create policy require_known_issuer on position_notification_categories
  as restrictive to authenticated using (app_issuer_ok());
grant select, insert, update, delete on position_notification_categories to authenticated;

insert into notification_categories (id, label, hint, sort_order) values
  ('new_order',           'New order',                  'A new order is created.',                                  10),
  ('production_stage',    'Production stage moved',     'An order moves to a new production stage.',                20),
  ('order_dispatched',    'Order dispatched',           'An order is marked dispatched.',                           30),
  ('order_cancelled',     'Order cancelled',            'An order is cancelled.',                                   40),
  ('invoices',            'Invoices',                   'An invoice is created, sent, paid or cancelled.',          50),
  ('expenses_purchases',  'Expenses & purchases',       'An expense, purchase or bank transaction is logged.',      60),
  ('large_spend',         'Large spend',                'A finance entry above the large-amount threshold.',        70),
  ('budget_requests',     'Budget requests',            'A budget request is submitted for approval.',              80),
  ('marketing',           'Marketing calendar',         'A marketing entry is added, edited or removed.',           90),
  ('employees',           'New/deactivated employee',   'An employee is added or deactivated.',                    100),
  ('payroll',             'Payroll finalised',          'A payroll run is finalised.',                             110),
  ('inventory',           'Inventory & library',        'Stock is adjusted or a library item changes.',            120),
  ('leads',               'Lead messages',              'A lead sends a new message.',                             130)
on conflict (id) do update set label = excluded.label, hint = excluded.hint, sort_order = excluded.sort_order;

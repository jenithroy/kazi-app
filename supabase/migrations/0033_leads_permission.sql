-- ============================================================================
-- 0033_leads_permission.sql
--
-- Leads splits off from the `messenger` section as its own grantable
-- permission, the same way Finance already splits into tabs (Expenses,
-- Payroll, P&L, ...) - mirrors that exact shape (finance_tabs /
-- position_finance_tabs / app_can_view_finance_tab / my_finance_tabs, all in
-- 0000_baseline.sql) with one row instead of eleven.
--
-- One deliberate difference from Finance's tabs: those only really gate
-- *view* in practice (financeTabCanEdit = section edit + tab view; the tab's
-- own can_edit column is carried but unused). Leads needs a real view/edit
-- split - reading a customer's DMs and sending a message as the business to
-- a real customer are not the same level of trust - so both flags are
-- actually enforced here, in the database function and in the bot's own API
-- (meta-dm-bot/app/dashboard.py), not just carried in an unused column.
--
-- Consequence worth being loud about: position_messenger_tabs starts empty
-- except for tier-4 super admins (backfilled below, same as 0019 did for
-- finance tabs). Every other role loses Leads access the moment this runs,
-- until granted back in Admin Panel. Team chat is untouched - still gated
-- purely by the existing `messenger` section permission.
-- ============================================================================

create table if not exists messenger_tabs (
  id         text primary key,
  label      text not null,
  sort_order integer not null default 0
);

create table if not exists position_messenger_tabs (
  position_id text not null references positions(id) on delete cascade,
  tab_id      text not null references messenger_tabs(id) on delete cascade,
  can_view    boolean not null default false,
  can_edit    boolean not null default false,
  primary key (position_id, tab_id)
);

insert into messenger_tabs (id, label, sort_order)
values ('leads', 'Leads', 0)
on conflict (id) do update
  set label = excluded.label, sort_order = excluded.sort_order;


-- ─── functions + view ───────────────────────────────────────────────────

create or replace function public.app_can_view_messenger_tab(tab text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((select mt.can_view from people pe
     join position_messenger_tabs mt on mt.position_id = pe.position_id
    where pe.id = app_person_id() and mt.tab_id = tab), false);
$function$;

create or replace function public.app_can_edit_messenger_tab(tab text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((select mt.can_edit from people pe
     join position_messenger_tabs mt on mt.position_id = pe.position_id
    where pe.id = app_person_id() and mt.tab_id = tab), false);
$function$;

create or replace view my_messenger_tabs as
select id as tab_id,
       label,
       app_can_view_messenger_tab(id) as can_view,
       app_can_edit_messenger_tab(id) as can_edit
  from messenger_tabs;


-- ─── row level security ─────────────────────────────────────────────────

alter table messenger_tabs enable row level security;
alter table position_messenger_tabs enable row level security;

create policy "admin_write" on messenger_tabs
  as permissive for all
  to authenticated
  using (app_can_edit('admin'))
  with check (app_can_edit('admin'));
create policy "read_all" on messenger_tabs
  as permissive for select
  to authenticated
  using (auth.uid() is not null);
create policy "require_known_issuer" on messenger_tabs
  as restrictive for all
  to authenticated
  using (app_issuer_ok());

create policy "admin_write" on position_messenger_tabs
  as permissive for all
  to authenticated
  using (app_can_edit('admin'))
  with check (app_can_edit('admin'));
create policy "read_all" on position_messenger_tabs
  as permissive for select
  to authenticated
  using (auth.uid() is not null);
create policy "require_known_issuer" on position_messenger_tabs
  as restrictive for all
  to authenticated
  using (app_issuer_ok());

grant delete, insert, references, select, trigger, truncate, update on messenger_tabs to anon;
grant delete, insert, references, select, trigger, truncate, update on messenger_tabs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on messenger_tabs to service_role;

grant delete, insert, references, select, trigger, truncate, update on position_messenger_tabs to anon;
grant delete, insert, references, select, trigger, truncate, update on position_messenger_tabs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on position_messenger_tabs to service_role;

grant delete, insert, references, select, trigger, truncate, update on my_messenger_tabs to anon;
grant delete, insert, references, select, trigger, truncate, update on my_messenger_tabs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on my_messenger_tabs to service_role;


-- ─── keep the super-admin backfill trigger complete ────────────────────
-- Same function 0028 created (fires after insert/update of tier on
-- positions) - re-defined here to also fill in messenger_tabs, so a new or
-- promoted tier-4 role keeps getting genuinely everything, not everything
-- except Leads.

create or replace function public.grant_all_sections_to_new_super_admin()
returns trigger
language plpgsql
as $$
begin
  if new.tier >= 4 then
    insert into position_permissions (position_id, section_id, can_view, can_edit)
    select new.id, s.id, true, true from sections s
    on conflict (position_id, section_id) do update set can_view = true, can_edit = true;

    insert into position_finance_tabs (position_id, tab_id, can_view, can_edit)
    select new.id, t.id, true, true from finance_tabs t
    on conflict (position_id, tab_id) do update set can_view = true, can_edit = true;

    insert into position_messenger_tabs (position_id, tab_id, can_view, can_edit)
    select new.id, t.id, true, true from messenger_tabs t
    on conflict (position_id, tab_id) do update set can_view = true, can_edit = true;
  end if;
  return new;
end $$;

-- Trigger itself is unchanged (still fires on the same event) - just making
-- sure it's attached, in case this migration ever runs somewhere it wasn't.
drop trigger if exists grant_all_sections_to_new_super_admin on positions;
create trigger grant_all_sections_to_new_super_admin
  after insert or update of tier on positions
  for each row execute function public.grant_all_sections_to_new_super_admin();


-- ─── one-time backfill for today's existing super admins ──────────────
-- The trigger above only fires on a future insert/update of tier - it can't
-- retroactively catch positions that were already tier 4 before this
-- migration ran, the same reason 0019 had to backfill finance tabs by hand.

insert into position_messenger_tabs (position_id, tab_id, can_view, can_edit)
select id, 'leads', true, true from positions where tier >= 4
on conflict (position_id, tab_id) do update
  set can_view = true, can_edit = true;

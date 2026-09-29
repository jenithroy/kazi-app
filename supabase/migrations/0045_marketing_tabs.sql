-- ============================================================================
-- 0045_marketing_tabs.sql
--
-- Meta Ads lives inside the existing /marketing route (the Marketing
-- Calendar keeps working exactly as today, gated only by the base
-- `marketing` section — untouched by this migration). Meta Ads is gated as a
-- second, independent grant on top of that, the same way Leads split off
-- from Messenger in 0033: marketing_tabs / position_marketing_tabs /
-- app_can_view_marketing_tab / app_can_edit_marketing_tab / my_marketing_tabs,
-- seeded with exactly one row ('meta_ads').
--
-- Both view and edit are real here (Leads' shape, not Finance's — Finance
-- tabs only really gate *view* in practice, can_edit carried but unused).
-- Seeing ad spend and pausing a live campaign / changing a budget are
-- different levels of trust: "View (see numbers)" -> can_view, "Edit
-- (change ads)" -> can_edit, exactly as asked for.
--
-- Reaching /marketing at all still requires the base `marketing` section's
-- own can_view (RequireSection, unchanged) — this tab is an additional gate
-- on top, not a replacement for it.
--
-- Consequence worth being loud about, same as 0033: position_marketing_tabs
-- starts empty except for tier-4 super admins (backfilled below). Every
-- other role has no Meta Ads access until granted in Admin Panel.
-- ============================================================================

create table if not exists marketing_tabs (
  id         text primary key,
  label      text not null,
  sort_order integer not null default 0
);

create table if not exists position_marketing_tabs (
  position_id text not null references positions(id) on delete cascade,
  tab_id      text not null references marketing_tabs(id) on delete cascade,
  can_view    boolean not null default false,
  can_edit    boolean not null default false,
  primary key (position_id, tab_id)
);

insert into marketing_tabs (id, label, sort_order)
values ('meta_ads', 'Meta Ads', 0)
on conflict (id) do update
  set label = excluded.label, sort_order = excluded.sort_order;


-- ─── functions + view ───────────────────────────────────────────────────

create or replace function public.app_can_view_marketing_tab(tab text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((select mt.can_view from people pe
     join position_marketing_tabs mt on mt.position_id = pe.position_id
    where pe.id = app_person_id() and mt.tab_id = tab), false);
$function$;

create or replace function public.app_can_edit_marketing_tab(tab text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((select mt.can_edit from people pe
     join position_marketing_tabs mt on mt.position_id = pe.position_id
    where pe.id = app_person_id() and mt.tab_id = tab), false);
$function$;

create or replace view my_marketing_tabs as
select id as tab_id,
       label,
       app_can_view_marketing_tab(id) as can_view,
       app_can_edit_marketing_tab(id) as can_edit
  from marketing_tabs;


-- ─── row level security ─────────────────────────────────────────────────

alter table marketing_tabs enable row level security;
alter table position_marketing_tabs enable row level security;

create policy "admin_write" on marketing_tabs
  as permissive for all
  to authenticated
  using (app_can_edit('admin'))
  with check (app_can_edit('admin'));
create policy "read_all" on marketing_tabs
  as permissive for select
  to authenticated
  using (auth.uid() is not null);
create policy "require_known_issuer" on marketing_tabs
  as restrictive for all
  to authenticated
  using (app_issuer_ok());

create policy "admin_write" on position_marketing_tabs
  as permissive for all
  to authenticated
  using (app_can_edit('admin'))
  with check (app_can_edit('admin'));
create policy "read_all" on position_marketing_tabs
  as permissive for select
  to authenticated
  using (auth.uid() is not null);
create policy "require_known_issuer" on position_marketing_tabs
  as restrictive for all
  to authenticated
  using (app_issuer_ok());

grant delete, insert, references, select, trigger, truncate, update on marketing_tabs to anon;
grant delete, insert, references, select, trigger, truncate, update on marketing_tabs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on marketing_tabs to service_role;

grant delete, insert, references, select, trigger, truncate, update on position_marketing_tabs to anon;
grant delete, insert, references, select, trigger, truncate, update on position_marketing_tabs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on position_marketing_tabs to service_role;

grant delete, insert, references, select, trigger, truncate, update on my_marketing_tabs to anon;
grant delete, insert, references, select, trigger, truncate, update on my_marketing_tabs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on my_marketing_tabs to service_role;


-- ─── keep the super-admin backfill trigger complete ────────────────────
-- Redefined again (0028 -> 0033 -> here) to also fill in marketing_tabs.

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

    insert into position_marketing_tabs (position_id, tab_id, can_view, can_edit)
    select new.id, t.id, true, true from marketing_tabs t
    on conflict (position_id, tab_id) do update set can_view = true, can_edit = true;
  end if;
  return new;
end $$;

drop trigger if exists grant_all_sections_to_new_super_admin on positions;
create trigger grant_all_sections_to_new_super_admin
  after insert or update of tier on positions
  for each row execute function public.grant_all_sections_to_new_super_admin();


-- ─── one-time backfill for today's existing super admins ──────────────

insert into position_marketing_tabs (position_id, tab_id, can_view, can_edit)
select id, 'meta_ads', true, true from positions where tier >= 4
on conflict (position_id, tab_id) do update
  set can_view = true, can_edit = true;

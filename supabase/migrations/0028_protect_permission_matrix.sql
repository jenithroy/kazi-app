-- ============================================================================
-- 0028_protect_permission_matrix.sql
--
-- The Admin Panel is about to let anyone with `admin` edit rewrite the whole
-- permission matrix. That is the point — but two edits are unrecoverable from
-- inside the app, so the database refuses them rather than trusting the UI to
-- hide the buttons. Anyone with admin rights can call the API directly.
--
--   1. Removing admin from every position. There would then be nobody who
--      could put it back, and no screen that could fix it — only a psql
--      session against production.
--
--   2. Reducing a tier-4 position. Those are the super admins (Director,
--      System Admin, Developer). They are the people who unpick a mistake in
--      any of the others, so they are not themselves editable.
--
-- Both raise a clear error the panel can show, rather than failing silently.
-- ============================================================================

create or replace function public.guard_permission_matrix()
returns trigger
language plpgsql
as $$
declare
  target_tier integer;
  admins_left integer;
  row_position text;
begin
  row_position := coalesce(new.position_id, old.position_id);

  select tier into target_tier from positions where id = row_position;

  -- Tier 4 keeps full access, always.
  if target_tier >= 4 and tg_op <> 'INSERT' then
    if tg_op = 'DELETE' or new.can_view is not true or new.can_edit is not true then
      raise exception
        'Super admin roles keep full access and cannot be reduced. Change the person''s role in Employees & HR instead.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Somebody must still be able to reach the Admin Panel.
  if row_position is not null then
    select count(*) into admins_left
      from position_permissions pp
     where pp.section_id = 'admin'
       and pp.can_edit
       and not (pp.position_id = row_position and tg_op <> 'INSERT');

    if tg_op <> 'DELETE' and new.section_id = 'admin' and new.can_edit then
      admins_left := admins_left + 1;
    end if;

    if admins_left = 0 then
      raise exception
        'At least one role must keep edit access to the Admin Panel, or nobody could grant it back.'
        using errcode = 'check_violation';
    end if;
  end if;

  return case tg_op when 'DELETE' then old else new end;
end $$;

drop trigger if exists guard_permission_matrix on position_permissions;
create trigger guard_permission_matrix
  before update or delete on position_permissions
  for each row execute function public.guard_permission_matrix();


-- A page added later must not silently leave the super admins without it.
create or replace function public.grant_new_section_to_super_admins()
returns trigger
language plpgsql
as $$
begin
  insert into position_permissions (position_id, section_id, can_view, can_edit)
  select p.id, new.id, true, true from positions p where p.tier >= 4
  on conflict (position_id, section_id) do nothing;
  return new;
end $$;

drop trigger if exists grant_new_section_to_super_admins on sections;
create trigger grant_new_section_to_super_admins
  after insert on sections
  for each row execute function public.grant_new_section_to_super_admins();

-- Same for a newly created tier-4 role.
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
  end if;
  return new;
end $$;

drop trigger if exists grant_all_sections_to_new_super_admin on positions;
create trigger grant_all_sections_to_new_super_admin
  after insert or update of tier on positions
  for each row execute function public.grant_all_sections_to_new_super_admin();

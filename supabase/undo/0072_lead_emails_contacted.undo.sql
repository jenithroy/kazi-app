-- ============================================================================
-- 0072_lead_emails_contacted.undo.sql
--
-- Takes back 0072_lead_emails_contacted.sql: fs_lead_emails goes back to exactly what 0064 made (every address, without "contactedAt"),
-- and the column contacted_at is dropped (its right for signed-in people goes with it).
--
-- DESTRUCTIVE once anybody has ticked an address: the ticks (which addresses the team has already written to) go with the column. The first
-- block refuses to run while any exist. To go ahead anyway, export them first (select email, contacted_at from lead_emails where contacted_at
-- is not null). The refusal leaves your session in an aborted transaction, so then, in the same session:
--
--     rollback;
--     set kazi.confirm_drop_contacted = 'yes';
--
-- and run this file again; the ticks are then dropped and everything above is undone.
--
-- If anything else was built on fs_lead_emails since 0072, DROP VIEW refuses (it has no CASCADE) and nothing is changed.
-- Safe to run when the migration was never applied (the view is then dropped and made again as it was).
-- ============================================================================

begin;

do $guard$
declare
  has_ticks boolean := false;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lead_emails' and column_name = 'contacted_at'
  ) then
    execute 'select exists (select 1 from public.lead_emails where contacted_at is not null)' into has_ticks;
    if has_ticks
       and coalesce(current_setting('kazi.confirm_drop_contacted', true), '') <> 'yes' then
      raise exception
        'Some addresses in lead_emails are ticked as contacted. Export them first, then run  set kazi.confirm_drop_contacted = ''yes'';  and this file again.'
        using errcode = 'check_violation';
    end if;
  end if;
end $guard$;

-- the view has to go first: it reads the column
drop view if exists public.fs_lead_emails;

alter table public.lead_emails drop column if exists contacted_at;

-- the view exactly as 0064 made it
create view public.fs_lead_emails as
select
  id,
  email,
  brand,
  website,
  source_url   as "sourceUrl",
  kind,
  same_domain  as "sameDomain",
  socials,
  lead_id      as "leadId",
  do_not_email as "doNotEmail",
  note,
  found_by     as "foundBy",
  found_at     as "foundAt"
from public.lead_emails;

alter view public.fs_lead_emails set (security_invoker = on);

revoke all on public.fs_lead_emails from anon, authenticated;
grant select on public.fs_lead_emails to authenticated, service_role;

commit;

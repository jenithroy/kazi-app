-- ============================================================================
-- 0072_lead_emails_contacted.sql
--
-- Contact Finder (/marketing/contact-finder): a "Contacted" tick on every address in the list, shared by the whole team, so nobody writes to the
-- same address twice.
--
-- One new column on lead_emails: contacted_at, the moment somebody ticked "we have written to this address" (empty = not yet). Anybody with
-- Marketing edit may set or clear it (the same people who could already change an address's note); nothing else about an address becomes
-- editable, and nobody else can touch it. fs_lead_emails shows it as "contactedAt", added at the END of the view
-- (create or replace view can only append columns, so nothing that reads the view changes).
--
-- It replaces nothing: do_not_email stays exactly as it was. "Do not email" means never write to this address; "contacted" means we already did.
-- No row is touched: every existing address starts as "not contacted yet".
--
-- Safe to run twice.
-- ============================================================================

alter table public.lead_emails add column if not exists contacted_at timestamptz;

-- The page may set it. (The table-level rights stay as 0064 left them: read and delete, and update only on the columns granted by name.
-- The service role has every right on the table, this new column included.)
grant update (contacted_at) on public.lead_emails to authenticated;

create or replace view public.fs_lead_emails as
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
  found_at     as "foundAt",
  contacted_at as "contactedAt"
from public.lead_emails;

-- (a replaced view forgets its options and keeps its rights: set the first, state the second again)
alter view public.fs_lead_emails set (security_invoker = on);

revoke all on public.fs_lead_emails from anon, authenticated;
grant select on public.fs_lead_emails to authenticated, service_role;

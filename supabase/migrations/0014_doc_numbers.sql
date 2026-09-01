-- ============================================================================
-- 0014_doc_numbers.sql
--
-- Sequential document numbers for invoices, challans and quotations.
--
-- These were allocated by a Firestore transaction: read the counter, add one,
-- write it back. Ported literally that becomes read-then-write from the client,
-- which is a race -- two people raising an invoice at the same moment both read
-- the same number and one document silently overwrites the other's. Nepal IRD
-- numbering must not have holes or duplicates, so this is worth getting right.
--
-- Doing it in one statement inside the database removes the gap entirely: the
-- UPDATE ... RETURNING takes a row lock, so a concurrent caller waits and gets
-- the next value rather than the same one.
-- ============================================================================

create or replace function public.next_doc_number(kind text)
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  col     text;
  prefix  text;
  n       integer;
begin
  -- Explicit allow-list. `kind` reaches a format() below, so it must never be
  -- anything but one of these three.
  case kind
    when 'invoice'   then col := 'next_invoice';   prefix := 'INV';
    when 'challan'   then col := 'next_challan';   prefix := 'CH';
    when 'quotation' then col := 'next_quotation'; prefix := 'QT';
    else raise exception 'Unknown document type: %', kind;
  end case;

  -- Only someone who may create the document may burn a number, otherwise
  -- anyone signed in could advance the sequence and leave gaps in the books.
  if not app_can_edit('billing') then
    raise exception 'Not allowed to allocate a % number', kind
      using errcode = 'insufficient_privilege';
  end if;

  -- The counters table holds exactly one row, keyed 'billing'.
  insert into counters (id) values ('billing') on conflict (id) do nothing;

  execute format(
    'update counters set %I = %I + 1 where id = ''billing'' returning %I - 1', col, col, col)
    into n;

  return prefix || '-' || lpad(n::text, 3, '0');
end $$;

revoke all on function public.next_doc_number(text) from public, anon;
grant execute on function public.next_doc_number(text) to authenticated, service_role;

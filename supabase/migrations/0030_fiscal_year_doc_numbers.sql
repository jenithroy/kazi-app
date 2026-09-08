-- ============================================================================
-- 0030_fiscal_year_doc_numbers.sql
--
-- Restart document numbering at 1 every Nepali fiscal year.
--
-- 0014 allocated one unbroken sequence per document type for all time
-- (INV-001, INV-002, … forever). Nepal IRD numbering actually runs per fiscal
-- year: the first invoice raised on or after Shrawan 1 is INV-001 again, and the
-- fiscal year printed beside it (2082/83) is what keeps last year's INV-001 and
-- this year's INV-001 apart.
--
-- The fiscal year is decided by the caller (Billing.jsx), from the Bikram Sambat
-- date of the document — never from the Gregorian month, because Shrawan 1 lands
-- somewhere in mid-July and drifts year to year.
--
-- Concurrency is handled exactly as before: one INSERT … ON CONFLICT DO UPDATE
-- takes a row lock, so two people raising an invoice in the same fiscal year at
-- the same moment serialise and receive consecutive numbers instead of the same
-- one. Each (type, fiscal year) pair gets its own counter row, so a new fiscal
-- year simply starts from a row that doesn't exist yet.
-- ============================================================================

-- A generic counter column so per-fiscal-year rows can live in the same table
-- (and inherit its RLS + grants) as the original 'billing' row.
alter table counters add column if not exists next_val integer not null default 1;

-- The all-time sequence is replaced by the fiscal-year-scoped one below.
drop function if exists public.next_doc_number(text);

create or replace function public.next_doc_number(kind text, fiscal_year text)
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  prefix text;
  key    text;
  n      integer;
begin
  -- Explicit allow-list — `kind` becomes part of a counter key below.
  case kind
    when 'invoice'   then prefix := 'INV';
    when 'challan'   then prefix := 'CH';
    when 'quotation' then prefix := 'QT';
    else raise exception 'Unknown document type: %', kind;
  end case;

  -- Fiscal year must look like "2082/83"; it becomes part of the counter key
  -- and, downstream, the number printed on an IRD document.
  if fiscal_year is null or fiscal_year !~ '^\d{4}/\d{2}$' then
    raise exception 'Invalid fiscal year: %', fiscal_year;
  end if;

  -- Only someone who may create the document may burn a number, otherwise
  -- anyone signed in could advance the sequence and leave gaps in the books.
  if not app_can_edit('billing') then
    raise exception 'Not allowed to allocate a % number', kind
      using errcode = 'insufficient_privilege';
  end if;

  key := 'billing:' || kind || ':' || fiscal_year;

  -- First document of a (type, fiscal year): the row is created holding 2 (the
  -- next number to hand out) and this call takes 1. Every later call bumps the
  -- stored value and takes the one before it. The row lock on the ON CONFLICT
  -- path makes a concurrent caller wait and take the next number in turn.
  insert into counters (id, next_val) values (key, 2)
  on conflict (id) do update set next_val = counters.next_val + 1
  returning next_val - 1 into n;

  return prefix || '-' || lpad(n::text, 3, '0');
end $$;

revoke all on function public.next_doc_number(text, text) from public, anon;
grant execute on function public.next_doc_number(text, text) to authenticated, service_role;

-- ── Seed the per-fiscal-year counters from documents already on file ─────────
--
-- Without this, the first invoice raised after this migration would be INV-001
-- again and collide with the INV-001 already filed earlier in the same year
-- under the old all-time sequence. Seeding to (highest number used that year + 1)
-- makes numbering carry on where it left off. scripts/renumberDocsByFiscalYear.js
-- can then rewrite each year to a clean 1..N run by Bikram Sambat date and reset
-- these counters exactly — run it once if you want the current year renumbered.
--
-- Grouped by the fiscal year stored on the record. Quotations carry no fiscal
-- year column, so their counters start from 1 (the script seeds them properly).
insert into counters (id, next_val)
select 'billing:invoice:' || trim(fiscal_year),
       max((regexp_replace(invoice_no, '\D', '', 'g'))::int) + 1
  from invoices
 where trim(coalesce(fiscal_year, '')) ~ '^\d{4}/\d{2}$'
   and invoice_no ~ '\d'
 group by trim(fiscal_year)
on conflict (id) do nothing;

insert into counters (id, next_val)
select 'billing:challan:' || trim(fiscal_year),
       max((regexp_replace(challan_no, '\D', '', 'g'))::int) + 1
  from challans
 where trim(coalesce(fiscal_year, '')) ~ '^\d{4}/\d{2}$'
   and challan_no ~ '\d'
 group by trim(fiscal_year)
on conflict (id) do nothing;

-- ============================================================================
-- 0038_quotation_numbers_continuous.sql
--
-- Quotation numbers go back to one unbroken run (QT-001, QT-002, … forever),
-- not restarting at 1 each Nepali fiscal year. Invoices and challans are
-- untouched — they still restart every Shrawan 1, exactly as 0030/0034 left
-- them. Quotations only.
--
-- next_doc_number keyed its counter as 'billing:<kind>:<fiscal_year>' for all
-- three document types (0030). For quotations the key becomes plain
-- 'billing:quotation' instead, so there is one counter for all time again —
-- the same shape kind='invoice'/'challan' already skip past untouched.
--
-- The new counter is seeded to one past the highest number any quotation
-- already carries, across every fiscal year, so the next one raised cannot
-- collide with a QT-### already on file (including the duplicates that exist
-- BETWEEN years from the fiscal-year-scoped era — e.g. a QT-001 in 2082/83
-- and another QT-001 in 2083/84 are both left exactly as they are; this only
-- decides where the *next* number starts).
--
-- Quotations keep their fiscal_year column (0037) and it is still stored on
-- every new quotation — it is no longer read by the counter, but Billing
-- still prints it and the app still sorts by it.
--
-- Self-contained, like every numbering migration since 0034: repeats the
-- counters.next_val column-add and the old-function drop so this file alone
-- is enough regardless of what has already run.
-- ============================================================================

alter table counters add column if not exists next_val integer not null default 1;

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

  -- Only someone who may create the document may burn a number, otherwise
  -- anyone signed in could advance the sequence and leave gaps in the books.
  if not app_can_edit('billing') then
    raise exception 'Not allowed to allocate a % number', kind
      using errcode = 'insufficient_privilege';
  end if;

  if kind = 'quotation' then
    -- One counter for all time — quotations do not restart each fiscal year.
    key := 'billing:quotation';
  else
    -- Fiscal year must look like "2082/83"; it becomes part of the counter
    -- key and, downstream, the number printed on an IRD document.
    if fiscal_year is null or fiscal_year !~ '^\d{4}/\d{2}$' then
      raise exception 'Invalid fiscal year: %', fiscal_year;
    end if;
    key := 'billing:' || kind || ':' || fiscal_year;
  end if;

  -- First document under a key: the row is created holding 2 (the next number
  -- to hand out) and this call takes 1. Every later call bumps the stored
  -- value and takes the one before it. The row lock on the ON CONFLICT path
  -- makes a concurrent caller wait and take the next number in turn.
  insert into counters (id, next_val) values (key, 2)
  on conflict (id) do update set next_val = counters.next_val + 1
  returning next_val - 1 into n;

  -- Three digits while the sequence is short, then it simply grows: INV-001,
  -- INV-052, INV-099, INV-100, INV-999, INV-1000.
  return prefix || '-' ||
    case
      when n < 10  then '00' || n::text
      when n < 100 then '0'  || n::text
      else n::text
    end;
end $$;

revoke all on function public.next_doc_number(text, text) from public, anon;
grant execute on function public.next_doc_number(text, text) to authenticated, service_role;

-- Seed the new all-time quotation counter above every number already on file,
-- across every fiscal year, so the next quotation raised cannot collide with
-- one already saved. Left alone (on conflict do nothing) if this is re-run.
insert into counters (id, next_val)
select 'billing:quotation', max((regexp_replace(quotation_no, '\D', '', 'g'))::int) + 1
  from quotations
 where quotation_no ~ '\d'
on conflict (id) do nothing;

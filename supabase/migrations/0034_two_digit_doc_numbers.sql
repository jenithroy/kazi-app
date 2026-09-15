-- ============================================================================
-- 0034_two_digit_doc_numbers.sql
--
-- The first document of a Nepali fiscal year reads INV-01, not INV-001.
--
-- 0030 made numbering restart at 1 each Shrawan 1 and padded the sequence to
-- three digits. Two is what is wanted on the printed document: a year rarely
-- runs past a couple of hundred documents, and INV-01 is how the books are
-- written by hand.
--
-- Only the padding changes. The counter, the row lock that keeps two
-- simultaneous callers from taking the same number, the fiscal-year key and
-- the permission check are all exactly as 0030 left them — this is a
-- create-or-replace of the same function, not a new mechanism.
--
-- Past 99 the number simply grows — INV-99 is followed by INV-100 — rather
-- than being padded to a fixed width. See the note in the body about why lpad
-- is not used for this.
--
-- Numbers already on file still read INV-001. To rewrite them to match, run
-- scripts/renumberDocsByFiscalYear.mjs AFTER applying this (it pads to two as
-- well, and reseeds each year's counter to match what it wrote):
--
--     node scripts/renumberDocsByFiscalYear.mjs            dry run
--     node scripts/renumberDocsByFiscalYear.mjs --commit   apply
-- ============================================================================

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

  -- Two digits while the sequence is short, then it simply grows: INV-01,
  -- INV-09, INV-10, INV-99, INV-100.
  --
  -- Deliberately not lpad(n::text, 2, '0'). Postgres lpad TRUNCATES when the
  -- value is already longer than the width, so the hundredth document of a
  -- year would come out as INV-10 — a number the tenth document already has.
  -- Two invoices sharing a number is precisely what this whole counter exists
  -- to prevent, and it would not show up until a year got busy.
  return prefix || '-' || case when n < 10 then '0' || n::text else n::text end;
end $$;

revoke all on function public.next_doc_number(text, text) from public, anon;
grant execute on function public.next_doc_number(text, text) to authenticated, service_role;

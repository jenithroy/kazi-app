-- ============================================================================
-- 0036_three_digit_doc_numbers.sql
--
-- The first document of a Nepali fiscal year reads INV-001, not INV-01.
--
-- 0034 shortened the padding to two digits (INV-01 onwards). That is not what
-- is wanted on the printed document after all — three digits (INV-001) is the
-- house convention, and the 52nd invoice of a year should read INV-052, not
-- INV-52. Only the padding changes; the counter, the row lock, the fiscal-year
-- key and the permission check are exactly as 0034 left them.
--
-- Self-contained on purpose, the same way 44cfd56 made 0034 safe to apply on
-- its own: a database that only ever got 0034 (not 0030) is missing
-- counters.next_val, and pasting a function body that writes to a column that
-- isn't there breaks every invoice, challan and quotation at once — "Failed to
-- save document" with no more specific clue. Repeating the column-add and the
-- old-function drop here costs nothing where 0030/0034 already ran (both are
-- if-exists guarded) and means this file alone, pasted into the Supabase SQL
-- editor, is enough.
--
-- Past 999 the number simply grows — INV-999 is followed by INV-1000 —
-- rather than being padded to a fixed width, for the same reason 0034 avoided
-- lpad: Postgres lpad TRUNCATES a value already longer than the width, so the
-- thousandth document of a year would come out as INV-000, colliding with a
-- number nothing has used yet but a bug worth avoiding on principle.
--
-- Numbers already on file (including anything already saved as INV-52-style)
-- are NOT rewritten by this file — it only changes what new numbers look
-- like. Run scripts/renumberDocsByFiscalYear.sql (or the .mjs script)
-- AFTER this to rewrite existing documents to the three-digit form and
-- reseed each year's counter to match.
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

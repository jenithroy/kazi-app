-- ============================================================================
-- 0040_resequence_doc_numbers_by_date.sql
--
-- Let document numbers follow document dates.
--
-- next_doc_number (0030/0036/0038) hands out the next number at the moment a
-- document is created, so a backdated invoice — or one whose date is edited
-- later — ends up with a number that says nothing about where it falls in the
-- year: INV-007 dated Shrawan 3 sitting after INV-008 dated Shrawan 9.
--
-- resequence_doc_numbers puts a series back in date order: the earliest
-- document is 001, the next 002, and so on, exactly as
-- scripts/renumberDocsByFiscalYear.sql does for the whole book at once — but
-- callable from the app, for one series at a time, whenever a date changes.
--
-- A series is:
--   invoice, challan  one Nepali fiscal year (the fiscal_year stored on the row)
--   quotation         everything, for all time (0038 — they never restart)
--
-- Order is the document date, then when the row was created, then its id, so
-- the result is deterministic and two documents on the same day keep the order
-- they were raised in. Documents with no date go after every dated one rather
-- than being skipped, so they can never collide with a number being handed out.
-- Cancelled documents stay in the series: an IRD number is never reused.
--
-- Idempotent — a series already in date order is left exactly as it is, and
-- the return value is how many documents actually changed number.
--
-- Not rewritten (same limitation as the renumber script): text references to a
-- number held elsewhere — invoices.related_challan / related_quotation,
-- challans.related_invoice, quotations.related_invoice, orders.invoice_ref and
-- stock-ledger notes. Numbers repeat across fiscal years, so a bare "INV-005"
-- cannot be mapped to one document safely.
--
-- Concurrency: an advisory lock serialises resequencing per document type, and
-- the counter row that next_doc_number reads is reset under its own row lock,
-- so a document raised while this runs takes the next free number.
--
-- Two passes per run. invoice_no / challan_no / quotation_no are unique per
-- fiscal year (0035, 0037), and a number this run is about to assign may still
-- belong to a different row mid-way, so every affected row is first parked on a
-- value nothing else can hold, then given its final number. The plan is read
-- once into arrays so both passes act on the same snapshot.
-- ============================================================================

create or replace function public.resequence_doc_numbers(p_kind text, p_fiscal_year text default null)
returns integer
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  ids     text[];
  nos     text[];
  total   integer;
  changed integer := 0;
begin
  if p_kind not in ('invoice', 'challan', 'quotation') then
    raise exception 'Unknown document type: %', p_kind;
  end if;

  if not app_can_edit('billing') then
    raise exception 'Not allowed to renumber % documents', p_kind
      using errcode = 'insufficient_privilege';
  end if;

  -- Invoices and challans are one series per fiscal year, so a year is required.
  -- Quotations are a single series and ignore it.
  if p_kind <> 'quotation' and (p_fiscal_year is null or p_fiscal_year !~ '^\d{4}/\d{2}$') then
    raise exception 'Invalid fiscal year: %', p_fiscal_year;
  end if;

  perform pg_advisory_xact_lock(hashtext('resequence_doc_numbers:' || p_kind));

  if p_kind = 'invoice' then
    select array_agg(id::text order by rn), array_agg(new_no order by rn)
      into ids, nos
      from (
        select id, invoice_no as old_no, rn,
               'INV-' || case when rn < 10 then '00' || rn::text
                              when rn < 100 then '0' || rn::text
                              else rn::text end as new_no
          from (select id, invoice_no,
                       row_number() over (order by invoice_date nulls last, created_at nulls last, id::text) as rn
                  from invoices
                 where trim(coalesce(fiscal_year, '')) = p_fiscal_year) s
      ) p
     where old_no is distinct from new_no;
    select count(*) into total from invoices where trim(coalesce(fiscal_year, '')) = p_fiscal_year;

    if ids is not null then
      update invoices set invoice_no = 'RENUM:' || id::text where id::text = any(ids);
      update invoices t set invoice_no = u.no
        from unnest(ids, nos) as u(id, no) where t.id::text = u.id;
      changed := array_length(ids, 1);
    end if;

    if total > 0 then
      insert into counters (id, next_val) values ('billing:invoice:' || p_fiscal_year, total + 1)
      on conflict (id) do update set next_val = excluded.next_val;
    end if;

  elsif p_kind = 'challan' then
    select array_agg(id::text order by rn), array_agg(new_no order by rn)
      into ids, nos
      from (
        select id, challan_no as old_no, rn,
               'CH-' || case when rn < 10 then '00' || rn::text
                             when rn < 100 then '0' || rn::text
                             else rn::text end as new_no
          from (select id, challan_no,
                       row_number() over (order by challan_date nulls last, created_at nulls last, id::text) as rn
                  from challans
                 where trim(coalesce(fiscal_year, '')) = p_fiscal_year) s
      ) p
     where old_no is distinct from new_no;
    select count(*) into total from challans where trim(coalesce(fiscal_year, '')) = p_fiscal_year;

    if ids is not null then
      update challans set challan_no = 'RENUM:' || id::text where id::text = any(ids);
      update challans t set challan_no = u.no
        from unnest(ids, nos) as u(id, no) where t.id::text = u.id;
      changed := array_length(ids, 1);
    end if;

    if total > 0 then
      insert into counters (id, next_val) values ('billing:challan:' || p_fiscal_year, total + 1)
      on conflict (id) do update set next_val = excluded.next_val;
    end if;

  else
    select array_agg(id::text order by rn), array_agg(new_no order by rn)
      into ids, nos
      from (
        select id, quotation_no as old_no, rn,
               'QT-' || case when rn < 10 then '00' || rn::text
                             when rn < 100 then '0' || rn::text
                             else rn::text end as new_no
          from (select id, quotation_no,
                       row_number() over (order by quote_date nulls last, created_at nulls last, id::text) as rn
                  from quotations) s
      ) p
     where old_no is distinct from new_no;
    select count(*) into total from quotations;

    if ids is not null then
      update quotations set quotation_no = 'RENUM:' || id::text where id::text = any(ids);
      update quotations t set quotation_no = u.no
        from unnest(ids, nos) as u(id, no) where t.id::text = u.id;
      changed := array_length(ids, 1);
    end if;

    if total > 0 then
      insert into counters (id, next_val) values ('billing:quotation', total + 1)
      on conflict (id) do update set next_val = excluded.next_val;
    end if;
  end if;

  return changed;
end $$;

revoke all on function public.resequence_doc_numbers(text, text) from public, anon;
grant execute on function public.resequence_doc_numbers(text, text) to authenticated, service_role;

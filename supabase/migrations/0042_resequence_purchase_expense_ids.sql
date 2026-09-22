-- ============================================================================
-- 0042_resequence_purchase_expense_ids.sql
--
-- Let purchase expense IDs follow purchase dates, the same way 0040 already
-- does for invoices, challans and quotations.
--
-- nextExpenseId() (Finance.jsx) hands out max(existing)+1 at save time, so a
-- backdated purchase — or one entered out of chronological order — ends up
-- with a number that says nothing about where it falls among the others:
-- EXP081 dated after EXP087.
--
-- resequence_purchase_expense_ids puts the whole series back in date order:
-- the earliest purchase becomes EXP001, the next EXP002, and so on. Purchases
-- are one continuous series, like quotations — nextExpenseId() reads every
-- purchase ever raised, never restarting by fiscal year, so this function
-- takes no arguments.
--
-- Order is purchase date, then when the row was created, then its id, so the
-- result is deterministic and two purchases on the same day keep the order
-- they were raised in. Purchases with no date go after every dated one rather
-- than being skipped.
--
-- A purchase's expense_ref is also how older linked records are found —
-- stock_movements.source_id and vat_bills.expense_id carry the literal string
-- for rows raised before those tables could link by the purchase's own uuid
-- (see deletePurchaseWithLinks in src/utils/financeRows.js). Both are updated
-- in lockstep so a renumber never strands a linked record. line_items links by
-- purchase_id (uuid) already and needs no change.
--
-- Idempotent — a series already in date order is left exactly as it is, and
-- the return value is how many purchases actually changed number.
-- ============================================================================

create or replace function public.resequence_purchase_expense_ids()
returns integer
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  ids     uuid[];
  olds    text[];
  news    text[];
  changed integer := 0;
  i       integer;
begin
  if not app_can_edit('purchases') then
    raise exception 'Not allowed to renumber purchases'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('resequence_purchase_expense_ids'));

  select array_agg(id order by rn), array_agg(old_no order by rn), array_agg(new_no order by rn)
    into ids, olds, news
    from (
      select id, old_no, rn, 'EXP' || lpad(rn::text, 3, '0') as new_no
        from (
          select id, expense_ref as old_no,
                 row_number() over (
                   order by purchase_date nulls last, created_at nulls last, id::text
                 ) as rn
            from purchases
        ) ranked
    ) plan
   where old_no is distinct from new_no;

  if ids is null then
    return 0;
  end if;

  -- expense_ref carries no unique constraint, so rows can be written straight
  -- to their final numbers — nothing to park first. stock_movements and
  -- vat_bills are matched against `olds`, captured once above, so the order
  -- between these updates and the purchases update below cannot matter.
  for i in 1 .. array_length(ids, 1) loop
    update purchases set expense_ref = news[i] where id = ids[i];
    if olds[i] is not null then
      update stock_movements set source_id = news[i]
       where source = 'purchase' and source_id = olds[i];
      update vat_bills set expense_id = news[i]
       where expense_id = olds[i];
    end if;
  end loop;

  changed := array_length(ids, 1);
  return changed;
end $$;

revoke all on function public.resequence_purchase_expense_ids() from public, anon;
grant execute on function public.resequence_purchase_expense_ids() to authenticated, service_role;

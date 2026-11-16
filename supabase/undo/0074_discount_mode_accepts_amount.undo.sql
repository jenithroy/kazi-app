-- ============================================================================
-- 0074_discount_mode_accepts_amount.undo.sql
--
-- Takes back 0074_discount_mode_accepts_amount.sql: the three checks accept only 'pct' and 'flat' again, which is what 0022 made them.
--
-- It refuses (and changes nothing) while any invoice, quotation or challan is stored with discount_mode = 'amount', because those rows would
-- break the restored rule. Those documents have a flat-amount discount: do not edit them to fit; leave 0074 in place instead.
-- Safe to run when the migration was never applied.
-- ============================================================================

begin;

do $guard$
declare
  n integer;
begin
  select (select count(*) from public.invoices   where discount_mode = 'amount')
       + (select count(*) from public.quotations where discount_mode = 'amount')
       + (select count(*) from public.challans   where discount_mode = 'amount') into n;
  if n > 0 then
    raise exception '% document(s) are saved with a flat-amount discount (discount_mode = ''amount''). Leave 0074 in place.', n
      using errcode = 'check_violation';
  end if;
end $guard$;

alter table public.invoices   drop constraint if exists invoices_discount_mode_check;
alter table public.invoices   add  constraint invoices_discount_mode_check   check (discount_mode in ('pct', 'flat'));

alter table public.quotations drop constraint if exists quotations_discount_mode_check;
alter table public.quotations add  constraint quotations_discount_mode_check check (discount_mode in ('pct', 'flat'));

alter table public.challans   drop constraint if exists challans_discount_mode_check;
alter table public.challans   add  constraint challans_discount_mode_check   check (discount_mode in ('pct', 'flat'));

commit;

-- ============================================================================
-- 0022_billing_discount_and_stock_link.sql
--
-- Three fields Billing writes that had nowhere to land. Unknown keys are
-- dropped on write rather than raising, which keeps a stale field from failing
-- a whole save — but it also means a genuinely missing column loses data
-- silently. These are all genuinely missing.
--
--   discount_mode / discount_flat_amt
--     A discount is either a percentage or a flat amount; calcTotals() branches
--     on discountMode and reads discountFlatAmt. Only discount_pct and the
--     computed discount_amt_npr existed, so a flat discount would have saved
--     its resulting amount but forgotten how it was arrived at — reopening the
--     document would show it as a 0% discount and recompute the total wrongly.
--
--   line_items.stock_item_id
--     postSaleStockOut() deducts stock only for invoice lines explicitly linked
--     to an inventory item, because invoice descriptions are free client-facing
--     text and cannot be name-matched the way purchases are. Without the column
--     that link is dropped on save and no sale ever deducts stock.
-- ============================================================================

alter table invoices
  add column if not exists discount_mode text not null default 'pct',
  add column if not exists discount_flat_amt numeric(14,2) not null default 0;

alter table quotations
  add column if not exists discount_mode text not null default 'pct',
  add column if not exists discount_flat_amt numeric(14,2) not null default 0;

alter table challans
  add column if not exists discount_mode text not null default 'pct',
  add column if not exists discount_flat_amt numeric(14,2) not null default 0;

do $$
declare t text;
begin
  foreach t in array array['invoices', 'quotations', 'challans'] loop
    execute format('alter table %I drop constraint if exists %I', t, t || '_discount_mode_check');
    execute format(
      'alter table %I add constraint %I check (discount_mode in (''pct'', ''flat''))',
      t, t || '_discount_mode_check');
  end loop;
end $$;

alter table line_items
  add column if not exists stock_item_id uuid references inventory_items(id) on delete set null;

create index if not exists line_items_stock_item_idx on line_items(stock_item_id);

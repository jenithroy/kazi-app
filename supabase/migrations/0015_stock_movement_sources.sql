-- ============================================================================
-- 0015_stock_movement_sources.sql
--
-- stock_movements.source was created in 0011 allowing manual/purchase/opening,
-- taken from the comment in src/utils/stockLedger.js. That comment is out of
-- date: postSaleStockOut() writes source 'sale' when an invoice line is linked
-- to an inventory item, so every stock-out raised from a sale would have been
-- rejected by the check constraint.
-- ============================================================================

alter table stock_movements drop constraint if exists stock_movements_source_check;

alter table stock_movements add constraint stock_movements_source_check
  check (source in ('manual', 'purchase', 'opening', 'sale'));

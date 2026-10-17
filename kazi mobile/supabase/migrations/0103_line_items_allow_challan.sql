-- `line_items.challan_id` was added with a FK to `challans`, but the
-- `one_parent` check still only counted invoice/quotation/purchase, so a
-- challan line could never be inserted (num_nonnulls = 0 → violation).
-- Widen the check to include challans; still exactly one parent per line.
alter table line_items drop constraint if exists one_parent;
alter table line_items
  add constraint one_parent
  check (num_nonnulls(invoice_id, quotation_id, purchase_id, challan_id) = 1);

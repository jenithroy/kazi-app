// Helpers for the "Materials used" confirm dialog, which takes what a production
// order used out of stock. Pure functions only: the dialog and the ledger both
// lean on these, so the maths lives in one place.

export const LINE_KINDS = [
  { value: "fabric",    label: "Fabric / rib" },
  { value: "trim",      label: "Thread & trims" },
  { value: "packaging", label: "Packaging" },
];

// Where each kind of material normally lives in Inventory, used to sort the item
// picker. Never used to hide an item: a miscategorised item must still be pickable.
const KIND_CATEGORIES = {
  fabric:    ["Fabric", "Raw Materials"],
  trim:      ["Thread & Accessories", "Raw Materials", "Consumables"],
  packaging: ["Packaging", "Consumables"],
};

// stock_movements.qty is numeric(14,3).
export const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

// The key production deductions are filed under: the human order number
// (ORD-051), falling back to the row id for an order that never got one.
export const orderRefOf = (order) => order?.orderId || order?.id || "";

// Resolves every row of the confirm dialog: which item it draws from and the
// amount that will be posted. A row that cannot be posted yet is flagged
// (`needsItem`: an amount but no item; `needsAmount`: an item but no amount)
// rather than skipped, so a deduction is never quietly smaller than what was used.
// A row with neither is one the person has not filled in, and is left out.
// `balanceOf(item)` supplies stock on hand.
export function resolveRows(rows, { itemById, balanceOf }) {
  const perRow = rows.map(row => {
    const item = itemById.get(row.itemId) || null;
    const typed = Number(row.amount);
    const qty = Number.isFinite(typed) && typed > 0 ? typed : 0;
    return { row, item, qty, needsItem: qty > 0 && !item, needsAmount: !!item && qty <= 0 };
  });

  // Two rows can draw from the same item (main fabric and rib off one roll), so
  // the below-zero check has to look at the sum, not each row alone.
  const totals = new Map();
  const balances = new Map();
  for (const r of perRow) {
    if (!r.item) continue;
    if (r.qty > 0) totals.set(r.item.id, (totals.get(r.item.id) || 0) + r.qty);
    if (!balances.has(r.item.id)) balances.set(r.item.id, balanceOf(r.item));
  }
  return { perRow, totals, balances };
}

// Items a deduction can draw from: everything that is not a finished product or
// equipment/office stock, with the categories that usually hold this kind of
// material first.
export function materialItems(items, kind) {
  const preferred = KIND_CATEGORIES[kind] || [];
  return items
    .filter(i => i.category !== "Finished Goods" && i.category !== "Equipment" && i.category !== "Office Supplies")
    .sort((a, b) => {
      const pa = preferred.includes(a.category) ? 0 : 1;
      const pb = preferred.includes(b.category) ? 0 : 1;
      return pa - pb || String(a.item || "").localeCompare(String(b.item || ""));
    });
}

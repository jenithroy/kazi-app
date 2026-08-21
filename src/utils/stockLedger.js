// Transaction-level stock ledger — dated in/out movements per inventory item,
// replacing the old silent stepper (openingStock/stockIn/stockUsed with no dates
// or history). Balance is always derived by replaying movements, never stored.
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export const STOCK_MOVEMENTS_COLLECTION = "stock_movements";

// { inTotal, outTotal } for one item across a set of movements
export function movementTotals(movements, itemId) {
  let inTotal = 0, outTotal = 0;
  for (const m of movements) {
    if (m.itemId !== itemId) continue;
    if (m.direction === "in") inTotal += Number(m.qty || 0);
    else if (m.direction === "out") outTotal += Number(m.qty || 0);
  }
  return { inTotal, outTotal };
}

// Opening + In - Out, replayed from the item's dated movement history.
export function stockClosing(item, movements) {
  const { inTotal, outTotal } = movementTotals(movements, item.id);
  return Number(item?.openingStock || 0) + inTotal - outTotal;
}

export function itemMovements(movements, itemId) {
  return movements
    .filter(m => m.itemId === itemId)
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
}

export async function logStockMovement({ itemId, date, qty, direction, source, sourceId, note, createdBy }) {
  return addDoc(collection(db, STOCK_MOVEMENTS_COLLECTION), {
    itemId,
    date: date || new Date().toISOString().slice(0, 10),
    qty: Number(qty) || 0,
    direction, // "in" | "out"
    source: source || "manual", // "manual" | "purchase" | "opening"
    sourceId: sourceId || null,
    note: note || "",
    createdBy: createdBy || "Unknown",
    createdAt: serverTimestamp(),
  });
}

// Auto-posts "in" movements for purchase line items whose particulars match an
// inventory item name (case-insensitive, exact). Silently skips items with no
// match — most purchases (rent, professional fees, etc.) aren't stock at all,
// so this only fires for the subset that happen to name a real inventory item.
export async function postPurchaseStockIn({ purchase, items, inventoryItems, createdBy }) {
  if (!Array.isArray(inventoryItems) || inventoryItems.length === 0) return [];
  const byName = new Map(inventoryItems.map(inv => [String(inv.item || "").trim().toLowerCase(), inv]));
  const posted = [];
  for (const it of items || []) {
    const qty = Number(it.quantity);
    if (!qty || qty <= 0) continue;
    const match = byName.get(String(it.particulars || "").trim().toLowerCase());
    if (!match) continue;
    await logStockMovement({
      itemId: match.id,
      date: purchase.date,
      qty,
      direction: "in",
      source: "purchase",
      sourceId: purchase.expenseId || null,
      note: `Purchase ${purchase.expenseId || ""}`.trim(),
      createdBy,
    });
    posted.push(match.item);
  }
  return posted;
}

// Auto-posts "out" movements for sales invoice line items explicitly linked to
// an inventory item via stockItemId (invoice descriptions are free-form,
// client-facing text, so unlike purchases this can't rely on name matching).
export async function postSaleStockOut({ invoice, items, createdBy }) {
  const posted = [];
  for (const it of items || []) {
    const qty = Number(it.qty);
    if (!qty || qty <= 0 || !it.stockItemId) continue;
    await logStockMovement({
      itemId: it.stockItemId,
      date: invoice.date,
      qty,
      direction: "out",
      source: "sale",
      sourceId: invoice.invoiceNumber || null,
      note: `Invoice ${invoice.invoiceNumber || ""}`.trim(),
      createdBy,
    });
    posted.push(it.stockItemId);
  }
  return posted;
}

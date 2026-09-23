// Transaction-level stock ledger — dated in/out movements per inventory item,
// replacing the old silent stepper (openingStock/stockIn/stockUsed with no dates
// or history). Balance is always derived by replaying movements, never stored.
import { insertRow, supabase } from "../lib/db";
import { logWrite } from "../lib/activity";
import { todayDate } from "./date";

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
    // createdAt is an ISO timestamp string now, not a Firestore Timestamp, so
    // it compares lexicographically — same ordering, no .seconds to read.
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") ||
                    String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
}

export async function logStockMovement({ itemId, date, qty, direction, source, sourceId, note, createdBy, amountNPR }) {
  return insertRow(STOCK_MOVEMENTS_COLLECTION, {
    itemId,
    date: date || new Date().toISOString().slice(0, 10),
    qty: Number(qty) || 0,
    direction, // "in" | "out"
    source: source || "manual", // "manual" | "purchase" | "opening" | "sale" | "production"
    sourceId: sourceId || null,
    note: note || "",
    // The actual purchase/sale value for this movement's qty — lets the Stock
    // Ledger report show real Purchase/Sales Amount instead of qty × a
    // manually-typed unit cost. Movements logged before this field existed
    // are simply 0 and the report falls back to unitCostNPR for those.
    amountNPR: Number(amountNPR) || 0,
    createdBy: createdBy || "Unknown",
    // created_at defaults to now() in the database — no need to send one.
  });
}

// Posts "in" movements for purchase lines that name a stock item.
//
// A line says which item it feeds in one of two ways. The explicit stockItemId,
// picked from the dropdown on the purchase form, always wins. Failing that the
// particulars text is matched against item names (case-insensitive, exact),
// which is how this worked before the picker existed and is kept so purchases
// saved back then keep behaving the way they did.
//
// That name match is why the feature had barely run: of 447 historical purchase
// lines, six matched. "Polyster Knitted Fabrics", "polister knitted fabric" and
// "Polister  Fabric Without Brushes" are one fabric typed three ways, and every
// one of them added nothing and said nothing. Lines that genuinely are not
// stock — rent, professional fees, a laptop — are still skipped in silence,
// which is correct, and is why this cannot simply warn on every miss.
export async function postPurchaseStockIn({ purchase, items, inventoryItems, createdBy }) {
  if (!Array.isArray(inventoryItems) || inventoryItems.length === 0) return [];
  const byId   = new Map(inventoryItems.map(inv => [inv.id, inv]));
  const byName = new Map(inventoryItems.map(inv => [String(inv.item || "").trim().toLowerCase(), inv]));
  const posted = [];
  for (const it of items || []) {
    const qty = Number(it.quantity);
    if (!qty || qty <= 0) continue;
    const match = it.stockItemId
      ? byId.get(it.stockItemId)
      : byName.get(String(it.particulars || "").trim().toLowerCase());
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
      amountNPR: Number(it.amount) || 0,
    });
    posted.push(match.item);
  }
  return posted;
}

// Re-posts a purchase's stock movements after it has been edited.
//
// Saving an edit replaces the purchase's line items wholesale, so movements
// posted from the old lines no longer describe anything that exists — and until
// now nothing touched them, which meant linking an item to an existing purchase
// changed precisely nothing. Clearing and re-posting keeps the ledger a
// function of the purchase as it currently stands, the same way
// undoProductionStockOut lets an order's deduction be corrected. A purchase
// with no expenseId has nothing to file movements under, so it is left alone.
export async function syncPurchaseStockIn({ purchase, items, inventoryItems, createdBy }) {
  const ref = purchase?.expenseId;
  if (!ref) return [];
  const { error } = await supabase
    .from("stock_movements")
    .delete()
    .eq("source", "purchase")
    .eq("source_id", ref);
  if (error) throw error;
  logWrite(STOCK_MOVEMENTS_COLLECTION, "delete", ref);
  return postPurchaseStockIn({ purchase, items, inventoryItems, createdBy });
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
      amountNPR: qty * (Number(it.rate) || 0),
    });
    posted.push(it.stockItemId);
  }
  return posted;
}

// Posts the materials a production order used, filed under the order reference
// (ORD-051) the way purchases and sales are filed under their document number.
// Unlike those two, the caller has already resolved which inventory item each
// line hits and its quantity in that item's own unit (the person confirming can
// swap a colour or correct an amount first), so nothing is name-matched here.
// The rows go in as ONE insert so a failure part-way cannot leave an order half
// deducted — a retry would otherwise deduct the rows that did land a second time.
export async function postProductionStockOut({ orderRef, pieces, lines, date, createdBy }) {
  const rows = (lines || [])
    .filter(l => l.itemId && Number(l.qty) > 0)
    .map(l => ({
      item_id: l.itemId,
      // Local date, not UTC: before 05:45 in Kathmandu the UTC date is still yesterday.
      moved_on: date || todayDate(),
      qty: Number(l.qty),
      direction: "out",
      source: "production",
      source_id: orderRef || null,
      note: [orderRef, `${pieces} pcs`, l.label].filter(Boolean).join(" · "),
      amount_npr: Number(l.qty) * (Number(l.unitCostNPR) || 0),
      created_by: createdBy || "Unknown",
    }));
  if (!rows.length) return [];

  const { data, error } = await supabase.from("stock_movements").insert(rows).select("id");
  if (error) throw error;
  (data || []).forEach(r => logWrite(STOCK_MOVEMENTS_COLLECTION, "create", r.id));
  return data || [];
}

// Takes back every production deduction for an order, for when the wrong item or
// amount was confirmed. Deleting (not offsetting) keeps the ledger free of
// pairs that cancel each other out; the balance is replayed from what remains.
export async function undoProductionStockOut(orderRef) {
  if (!orderRef) return 0;
  const { error, count } = await supabase
    .from("stock_movements")
    .delete({ count: "exact" })
    .eq("source", "production")
    .eq("source_id", orderRef);
  if (error) throw error;
  logWrite(STOCK_MOVEMENTS_COLLECTION, "delete", orderRef);
  return count || 0;
}

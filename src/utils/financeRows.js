/**
 * Removing a transaction, wherever it is removed from.
 *
 * A purchase is not one row: raising it also files VAT bills, stock movements
 * and journal entries against it. Deleting the purchase alone would leave those
 * behind, still counted in stock and in the ledger, pointing at a record that no
 * longer exists. The cascade below is the one Purchases.jsx has always run; it
 * lives here so the fiscal-year page deletes a purchase the same way rather than
 * growing a second, slightly different copy of it.
 */
import { deleteRow, fetchAll, updateRow, supabase } from "../lib/db";
import { tsMillis } from "./date";

/** Delete a purchase along with everything raised from it. */
export async function deletePurchaseWithLinks(id, expenseId) {
  await deleteRow("finance_purchases", id);

  // Linked records are found by either key: older rows reference the readable
  // expense id, newer ones the row's uuid.
  const matchIds = Array.from(new Set([expenseId, id].filter(Boolean)));

  for (const expId of matchIds) {
    try {
      const vatRows = await fetchAll("vat_bills", { filters: [{ field: "expenseId", value: expId }] });
      for (const vData of vatRows) {
        if (vData.storagePath) {
          try {
            const { ref: storageRef, deleteObject } = await import("firebase/storage");
            const { storage } = await import("../firebase");
            await deleteObject(storageRef(storage, vData.storagePath));
          } catch (_) {}
        }
        await deleteRow("vat_bills", vData.id);
      }
    } catch (e) {
      console.error("Failed to delete linked vat_bills:", e);
    }

    try {
      const stockRows = await fetchAll("stock_movements", { filters: [
        { field: "source", value: "purchase" },
        { field: "sourceId", value: expId },
      ] });
      for (const sRow of stockRows) await deleteRow("stock_movements", sRow.id);
    } catch (e) {
      console.error("Failed to delete linked stock_movements:", e);
    }

    try {
      // Journal entries link back through `reference`, not an expenseId field —
      // that key never existed as a column.
      const jRows = await fetchAll("journal_entries", { filters: [{ field: "reference", value: expId }] });
      for (const jRow of jRows) await deleteRow("journal_entries", jRow.id);
    } catch (e) {
      console.error("Failed to delete linked journal_entries:", e);
    }
  }
}

/**
 * Put purchase expense IDs back in date order (migration 0042) — the earliest
 * purchase becomes EXP001, the next EXP002, and so on. One continuous series,
 * like quotations: nextExpenseId() reads every purchase ever raised, so there
 * is no fiscal year to pass. Resolves to how many purchases changed number.
 */
export async function resequencePurchaseExpenseIds() {
  const { data, error } = await supabase.rpc("resequence_purchase_expense_ids");
  if (error) throw error;
  return data || 0;
}

/**
 * What resequencing would do, without doing it — the client-side twin of
 * resequence_purchase_expense_ids, for the "out of order" notice.
 *
 * `purchases` is every purchase in any region or year — numbers are one series
 * across both. Mirrors the function's own ordering: purchase date, then
 * creation time, then id, undated last. Returns only the purchases whose
 * number would change, as { id, from, to }, in their new order.
 */
export function planPurchaseRenumber(purchases) {
  const sorted = [...purchases].sort((a, b) =>
    (a.date ? 0 : 1) - (b.date ? 0 : 1) ||
    String(a.date || "").localeCompare(String(b.date || "")) ||
    tsMillis(a.createdAt) - tsMillis(b.createdAt) ||
    String(a.id).localeCompare(String(b.id))
  );
  const changes = [];
  sorted.forEach((p, i) => {
    const to = `EXP${String(i + 1).padStart(3, "0")}`;
    if (p.expenseId !== to) changes.push({ id: p.id, from: p.expenseId || null, to });
  });
  return changes;
}

/**
 * What "remove this row" means for each kind of transaction.
 *
 * Invoices are cancelled, never deleted: their numbers run as an unbroken
 * per-fiscal-year sequence for IRD, and deleting one would leave a hole in it
 * that cannot be explained or refilled. Everything else is a plain delete,
 * matching what its own page does.
 */
export async function deleteTransaction(type, src) {
  switch (type) {
    case "Purchase":
      return deletePurchaseWithLinks(src.id, src.expenseId);
    case "Sales":
      await updateRow("invoices", src.id, { status: "Cancelled" });
      return;
    case "Expense":
      return deleteRow("finance_expenses", src.id);
    case "Payroll":
      return deleteRow("finance_payroll", src.id);
    case "Journal":
      return deleteRow("journal_entries", src.id);
    case "Bank":
      return deleteRow("bank_transactions", src.id);
    default:
      throw new Error(`Don't know how to remove a ${type} row`);
  }
}

/** What the confirm dialog should say, and what the button should be called. */
export function removalPrompt(type, src) {
  switch (type) {
    case "Purchase":
      return {
        verb: "Delete",
        message: `Delete purchase ${src.expenseItem || src.expenseId || src.id}? This will also delete any linked VAT bills, stock entries, and journal records.`,
      };
    case "Sales":
      return {
        verb: "Cancel",
        message: `Cancel invoice ${src.invoiceNumber || src.id}? It stays on file as cancelled — invoice numbers run in an unbroken sequence for IRD, so it cannot be deleted.`,
      };
    case "Payroll":
      return { verb: "Delete", message: `Delete the payroll record for ${src.staffName || "this staff member"}?` };
    case "Journal":
      return { verb: "Delete", message: "Delete this journal entry?" };
    case "Bank":
      return { verb: "Delete", message: "Delete this bank transaction?" };
    default:
      return { verb: "Delete", message: "Delete this expense?" };
  }
}

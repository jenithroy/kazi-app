/**
 * Everything Finance writes, as plain functions that say what happened instead of showing a pop-up.
 *
 * Each one is the old page's handler moved here with the same payloads and the same order of steps. They all return
 * `{ ok: true, … }` or `{ ok: false, message }`, so a card can stay open and say why, and never throw at the page.
 *
 * Row-level security drops a refused update or delete without an error, so a write that matters is checked by reading the
 * row back (`kept`, `gone`); a refusal then says "Not saved" instead of looking like it worked.
 */
import { deleteRow, fetchOne, insertRow, updateRow, upsertRow } from "./db";
import { deletePublicFile, uploadPublicFile } from "./storage";
import { postPurchaseStockIn } from "../utils/stockLedger";
import { currentFiscalYear, fiscalYearForDate } from "../utils/fiscalYear";
import { deletePurchaseWithLinks, nextPurchaseNumber } from "../utils/financeRows";
import { purchaseGrandTotal, purchaseItemsPayload, purchaseSubtotal, purchaseVatAmount } from "../components/PurchaseRowGroup";

const NOT_ALLOWED = "Not saved. You may not have permission to change this.";

/* ── Did the database really do it? ───────────────────────────────── */

const blank = (v) => v == null || v === "";
const numeric = (v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)));

/** Is what came back the same as what was sent? Numbers by value, text trimmed, empty things equal. */
export function sameValue(sent, got) {
  if (blank(sent) && blank(got)) return true;
  if (typeof sent === "boolean" || typeof got === "boolean") return Boolean(sent) === Boolean(got) && sent != null && got != null;
  if (numeric(sent) && numeric(got)) return Math.abs(Number(sent) - Number(got)) < 0.005;
  // a bare date sent to a timestamp column comes back as that day's timestamp
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(sent)) && String(got).startsWith(String(sent))) return true;
  return String(sent ?? "").trim() === String(got ?? "").trim();
}

/** Every plain value in `patch` that the saved row carries must match (lists and derived fields are skipped). */
export function kept(saved, patch) {
  if (!saved) return false;
  return Object.entries(patch).every(([k, v]) => {
    if (Array.isArray(v) || (v && typeof v === "object")) return true;
    if (!(k in saved)) return true;
    return sameValue(v, saved[k]);
  });
}

export async function updateChecked(collection, id, patch) {
  const saved = await updateRow(collection, id, patch);
  if (!kept(saved, patch)) throw new Error(NOT_ALLOWED);
  return saved;
}

export async function removeChecked(collection, id) {
  await deleteRow(collection, id);
  if (await fetchOne(collection, id)) throw new Error("Not deleted. You may not have permission to delete this.");
}

export const fail = (err, fallback) => ({ ok: false, message: err?.message && /^Not (saved|deleted)/.test(err.message) ? err.message : fallback });

/* ── Expenses ─────────────────────────────────────────────────────── */

export const emptyExpense = (date, region = "") => ({
  category: "Utilities", amountNPR: "", date, note: "", vatBill: false, region, paymentType: "CASH", bankName: "Nabil Bank",
});

export async function addExpense({ form, file, profile, region }) {
  try {
    // `paid` is the card's choice, not a column: the table keeps it as `status`
    const { paid, ...columns } = form;
    const row = await insertRow("finance_expenses", {
      ...columns, amountNPR: Number(form.amountNPR || 0),
      status: paid ? "Paid" : null,
      region: form.region || region,
      loggedBy: profile?.name || "Unknown",
    });
    if (form.vatBill && file) {
      // The expense itself is already saved at this point: a failed upload must not look like the whole save failed.
      try {
        const { url, path } = await uploadPublicFile("finance-attachments", `vat-bills/expense-${row.id}`, file);
        await insertRow("vat_bills", {
          expenseId: row.id, expenseItem: form.note || form.category,
          fileName: file.name, fileUrl: url, storagePath: path,
          fileType: file.type, uploadedBy: profile?.name || "Unknown",
          source: "expense",
          region: form.region || region,
        });
      } catch (err) {
        console.error("Failed to upload VAT bill:", err);
        return { ok: true, row, warning: "Expense saved, but the VAT bill file did not upload. Attach it again from the VAT bills tab." };
      }
    }
    return { ok: true, row };
  } catch (err) {
    console.error("Failed to add expense:", err);
    return { ok: false, message: "Not saved. Check your connection and try again." };
  }
}

/** The fields the card edits. Sent whole, so a field changed back to what it was is still right. */
export async function updateExpense(id, form) {
  try {
    const patch = {
      category: form.category, amountNPR: Number(form.amountNPR || 0), date: form.date, note: form.note || null,
      vatBill: Boolean(form.vatBill), paymentType: form.paymentType || null,
      bankName: form.paymentType === "Bank" ? (form.bankName || "Nabil Bank") : (form.bankName || null),
      region: form.region || null, status: form.paid ? "Paid" : null,
    };
    await updateChecked("finance_expenses", id, patch);
    return { ok: true };
  } catch (err) {
    console.error("Failed to update expense:", err);
    return fail(err, "Not saved. Check your connection and try again.");
  }
}

export async function setExpensePaid(id, paid) {
  try {
    await updateChecked("finance_expenses", id, { status: paid ? "Paid" : null });
    return { ok: true };
  } catch (err) {
    console.error("Failed to change an expense's status:", err);
    return fail(err, "Not changed. Check your connection and try again.");
  }
}

export async function removeExpense(id) {
  try { await removeChecked("finance_expenses", id); return { ok: true }; }
  catch (err) { console.error(err); return fail(err, "Could not delete. Try again."); }
}

/* ── Purchases ────────────────────────────────────────────────────── */

/** The numbers a purchase form is worth, from its line items. */
export function purchaseTotals(form) {
  return {
    subtotal: purchaseSubtotal(form.items),
    vat: purchaseVatAmount(form.items, form.vatBill, form.discountAmt, form.taxableAmt),
    total: purchaseGrandTotal(form.items, form.vatBill, form.discountAmt, form.taxableAmt),
  };
}

export async function addPurchase({ form, region, inventoryItems, profile }) {
  if (!form.expenseItem.trim()) return { ok: false, message: "Required: who did you buy from?", field: "party" };
  try {
    // Numbers restart every fiscal year (migration 0046) and are decided from the purchase's own date, like an invoice's,
    // so a backdated purchase draws from the year it belongs to.
    const fiscalYear = fiscalYearForDate(form.date) || currentFiscalYear();
    const newId = await nextPurchaseNumber(fiscalYear);
    const { subtotal, vat, total } = purchaseTotals(form);
    const payload = {
      expenseId: newId,
      expenseItem: form.expenseItem,
      category: form.category,
      paymentType: form.paymentType || "CASH",
      bankName: form.bankName || "Nabil Bank",
      vatBill: form.vatBill,
      discountAmt: Number(form.discountAmt || 0),
      taxableAmt: Number(form.taxableAmt || 0),
      subtotalNPR: subtotal,
      vatAmountNPR: vat,
      amountNPR: total,
      date: form.date,
      fiscalYear,
      region: form.region || region,
      items: purchaseItemsPayload(form.items),
    };
    const inserted = await insertRow("finance_purchases", payload);
    // Auto-post stock-in for any line whose particulars name an existing inventory item; silently skips everything else
    // (rent, fees). Needs the row's own id, since stock movements link a purchase by uuid.
    postPurchaseStockIn({
      purchase: { ...payload, id: inserted.id },
      items: payload.items,
      inventoryItems,
      createdBy: profile?.name || "Unknown",
    }).catch((err) => console.error("Stock auto-post failed:", err));
    return { ok: true, row: inserted, expenseId: newId };
  } catch (err) {
    console.error("Failed to add purchase:", err);
    return {
      ok: false,
      message: err?.code === "permission-denied" ? "You don't have permission to add purchases."
        : err?.code === "PGRST202" || err?.message?.includes("schema cache") ? "Not saved. Database migration 0046 may not be applied yet."
        : "Not saved. Check your connection and try again.",
    };
  }
}

export async function updatePurchase(id, draft) {
  try {
    const { subtotal, vat, total } = purchaseTotals(draft);
    const patch = {
      expenseItem: draft.expenseItem,
      category: draft.category,
      paymentType: draft.paymentType || "CASH",
      bankName: draft.bankName || "Nabil Bank",
      vatBill: draft.vatBill,
      discountAmt: Number(draft.discountAmt || 0),
      taxableAmt: Number(draft.taxableAmt || 0),
      subtotalNPR: subtotal,
      vatAmountNPR: vat,
      amountNPR: total,
      date: draft.date,
      region: draft.region || null,
      items: purchaseItemsPayload(draft.items),
    };
    await updateChecked("finance_purchases", id, patch);
    return { ok: true };
  } catch (err) {
    console.error("Failed to update purchase:", err);
    return fail(err, "Not saved. Check your connection and try again.");
  }
}

export async function removePurchase(row) {
  try {
    // Deleting the purchase alone would strand its VAT bills, stock movements and journal entries; the cascade lives in
    // utils/financeRows so the fiscal-year page removes a purchase exactly the same way.
    await deletePurchaseWithLinks(row.id, row.expenseId);
    if (await fetchOne("finance_purchases", row.id)) throw new Error("Not deleted. You may not have permission to delete this.");
    return { ok: true };
  } catch (err) {
    console.error("Failed to delete purchase:", err);
    return fail(err, `Could not delete: ${err?.message || "unknown error"}`);
  }
}

/* ── VAT bills ────────────────────────────────────────────────────── */

export async function uploadVatBill({ purchase, file, profile, region }) {
  if (!purchase || !file) return { ok: false, message: "Choose the purchase and the file first." };
  try {
    const { url, path } = await uploadPublicFile("finance-attachments", `vat-bills/${purchase.id}`, file);
    await insertRow("vat_bills", {
      expenseId: purchase.expenseId || "", purchaseId: purchase.id, expenseItem: purchase.expenseItem || "",
      fileName: file.name, fileUrl: url, storagePath: path, fileType: file.type,
      uploadedBy: profile?.name || "Unknown",
      region: purchase.region || region,
    });
    return { ok: true };
  } catch (err) {
    console.error("Upload failed:", err);
    return { ok: false, message: `Upload failed: ${err?.message || "try again"}` };
  }
}

export async function removeVatBill(bill) {
  try {
    await deletePublicFile("finance-attachments", bill.storagePath);
    await removeChecked("vat_bills", bill.id);
    return { ok: true };
  } catch (err) {
    console.error(err);
    return fail(err, "Could not delete the bill. Try again.");
  }
}

/* ── Journal ──────────────────────────────────────────────────────── */

export const emptyJournal = (date) => ({
  date, description: "", debitAccount: "Cash", creditAccount: "Sales Revenue", amountNPR: "", reference: "", partyName: "", region: "",
});

export async function addJournalEntry({ form, profile, region, advance }) {
  try {
    await insertRow("journal_entries", {
      ...form, amountNPR: Number(form.amountNPR),
      region: form.region || region,
      partyName: advance ? form.partyName.trim() : "",
      createdBy: profile?.name || "Unknown",
    });
    return { ok: true };
  } catch (err) {
    console.error("Failed to post journal entry:", err);
    return { ok: false, message: "Not posted. Please try again." };
  }
}

export async function updateJournalEntry(id, draft, advance) {
  try {
    await updateChecked("journal_entries", id, {
      date: draft.date,
      description: draft.description,
      debitAccount: draft.debitAccount,
      creditAccount: draft.creditAccount,
      amountNPR: Number(draft.amountNPR) || 0,
      reference: draft.reference,
      partyName: advance ? draft.partyName.trim() : "",
      region: draft.region || null,                      // the card offers it on an existing entry, so it must be kept
    });
    return { ok: true };
  } catch (err) {
    console.error("Failed to update journal entry:", err);
    return fail(err, "Not saved. Please try again.");
  }
}

export async function removeJournalEntry(id) {
  try { await removeChecked("journal_entries", id); return { ok: true }; }
  catch (err) { console.error(err); return fail(err, "Could not delete. Try again."); }
}

/* ── Bank transactions ────────────────────────────────────────────── */

// The table keeps a date in `txn_at` (the page's key for it is `timestamp`), the figure in `amount`, the words in `description` /
// `remarks`, and the type as exactly "Debit" or "Credit". The old "Log transaction" form sent `date`, `amountNPR` and a lower-case
// type: none of those are columns, so nothing it saved had a date or an amount, and the type was refused outright.
export const emptyBankTxn = (date) => ({ date, description: "", amount: "", type: "Debit", reference: "" });

export async function addBankTxn({ form, region }) {
  try {
    await insertRow("bank_transactions", {
      timestamp: form.date,
      type: form.type === "Credit" ? "Credit" : "Debit",
      amount: Number(form.amount),
      description: form.description,
      remarks: form.reference || null,
      region: region || null,
    });
    return { ok: true };
  } catch (err) {
    console.error("Failed to log the bank transaction:", err);
    return { ok: false, message: "Not saved. Please try again." };
  }
}

export async function updateBankTxn(id, form, { dateEditable }) {
  try {
    const patch = {
      type: form.type === "Credit" ? "Credit" : "Debit",
      amount: Number(form.amount || 0),
      description: form.description,
      remarks: form.reference || null,
    };
    if (dateEditable) patch.timestamp = form.date;
    await updateChecked("bank_transactions", id, patch);
    return { ok: true };
  } catch (err) {
    console.error("Failed to update the bank transaction:", err);
    return fail(err, "Not saved. Please try again.");
  }
}

export async function removeBankTxn(id) {
  try { await removeChecked("bank_transactions", id); return { ok: true }; }
  catch (err) { console.error(err); return fail(err, "Could not delete. Try again."); }
}

/* ── Opening balance (the ledger) ─────────────────────────────────── */

/**
 * With a year picked, `amount` is the brought-forward total on screen (opening + every earlier year's movement), not the
 * openingBalanceNPR column. Back that movement out so the stored figure keeps meaning "before anything was recorded": saving
 * the combined number as it is would count those earlier years twice the next time this loads.
 */
export async function saveOpeningBalance({ accountId, amount, earlierMovementNPR = 0, date }) {
  try {
    await updateChecked("accounts", accountId, { openingBalanceNPR: Number(amount || 0) - (earlierMovementNPR || 0), openingBalanceDate: date || null });
    return { ok: true };
  } catch (err) {
    console.error("Failed to save the opening balance:", err);
    return fail(err, "Not saved. Please try again.");
  }
}

/* ── Order costs ──────────────────────────────────────────────────── */

export async function saveOrderCosts({ order, form }) {
  try {
    const costKey = order?.orderId || order?.id;
    await upsertRow("order_costs", {
      orderId: costKey,
      // Costs belong wherever the order does, not wherever the switch is.
      region: order?.region || null,
      material: Number(form.material || 0),
      labour: Number(form.labour || 0),
      overhead: Number(form.overhead || 0),
      shipping: Number(form.shipping || 0),
      updatedAt: new Date().toISOString(),
    }, ["order_ref"]);
    return { ok: true };
  } catch (err) {
    console.error("Failed to save order costs:", err);
    return { ok: false, message: "Not saved. Please try again." };
  }
}

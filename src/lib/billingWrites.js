/**
 * Everything Billing writes, as plain functions that say what happened instead of showing a pop-up. Each is the old Billing page's handler
 * moved here with the same payloads and the same order of steps (a document is a legal record: nothing about what is written, how it is
 * numbered or when stock is deducted has changed). Each returns `{ ok: true, … }` or `{ ok: false, message }`, so a card can stay open
 * and say why, and never throws at the page.
 */
import { fetchAll, fetchOne, insertRow, updateRow, deleteRow } from "./db";
import { DOC_TYPES, calcTotals, fmtNPR, getNextNumber, resequenceDocNumbers } from "../utils/billing.jsx";
import { currentFiscalYear, fiscalYearForDate } from "../utils/fiscalYear";
import { currencyDigits, fromNPR, toNPR } from "../utils/currency";
import { todayDate } from "../utils/date";
import { postSaleStockOut } from "../utils/stockLedger";
import { customerIdForClient } from "../utils/billingClients";
import { updateChecked } from "./financeWrites";

const RESEQUENCE_FAILED = "The document was saved, but the numbers could not be put back in date order. Ask an admin to apply database migration 0040, then use \"Renumber by date\" on this page.";

/** Put each series back in date order. Never throws: the document itself is already saved by now. */
async function resequenceSeries(tab, fys) {
  try {
    for (const fy of fys) await resequenceDocNumbers(tab, fy);
    return true;
  } catch (err) {
    console.error("Failed to renumber by date:", err);
    return false;
  }
}

/**
 * Create or update a document. `plan` is `planSave(…)` (lib/billing.js): what saving would renumber, already agreed to by the person.
 * Resolves `{ ok: true, number, warning }`; `warning` is set when the document saved but the renumbering did not.
 */
export async function saveDoc({ tab, form, editingId, plan, profile, region }) {
  const meta = DOC_TYPES[tab];
  try {
    const applyVAT = tab === "invoice" && form.applyVAT;
    const { subtotal, discountAmt, taxableAmt, vatAmt, total } = calcTotals(form.items, applyVAT, form.discountPct, form.discountMode, form.discountFlatAmt || 0);

    // Link an invoice to its customer, adding the client to Customers if they are new (utils/billingClients.js). Done first and on its own: it
    // only produces a customerId to store beside the invoice, it never blocks the save, and it runs before a number is drawn so it cannot leave
    // a gap in the numbering. Nothing written on the invoice, the client name included, is touched. Cancelled invoices are left alone so they
    // do not add stray customers.
    const customerId = tab === "invoice" && !form.customerId && form.status !== "Cancelled"
      ? await customerIdForClient({
          clientName: form.clientName, clientPhone: form.clientPhone,
          clientAddress: form.clientAddress, region: form.region || region,
        })
      : (form.customerId || null);
    const customerLink = tab === "invoice" ? { customerId } : {};

    let warning = "";
    let number = form[meta.numberField] || "";

    if (editingId) {
      /* ── UPDATE existing document ── */
      const updates = {
        ...form,
        // The year follows the date, and the number follows the year: a date moved into another fiscal year takes the document into that year's
        // series. It is parked on a placeholder number first — the old one may already be taken there — and given its real one by the renumber below.
        fiscalYear:     plan.run ? plan.newFY : form.fiscalYear,
        ...(plan.fyChanged ? { [meta.numberField]: `RENUM:${editingId}` } : {}),
        currency:       form.currency || "NPR",
        subtotalNPR:    subtotal,
        discountMode:    form.discountMode || "pct",
        discountPct:    Number(form.discountPct) || 0,
        discountFlatAmt: Number(form.discountFlatAmt) || 0,
        discountAmtNPR: discountAmt,
        taxableAmtNPR:  taxableAmt,
        vatAmountNPR:   applyVAT ? vatAmt : 0,
        totalNPR:       total,
        updatedBy:      profile?.name || "Unknown",
        updatedAt:      new Date().toISOString(),
        ...customerLink,
      };
      // Manually flipping an invoice to Paid must settle its credit — otherwise the badge says Paid while Credit Due/Record Payment still show an
      // outstanding balance from before the status was changed. Writing amountPaid straight in would not survive: it is derived from the payments
      // table by trigger, so the next real payment would recompute it and the settlement would silently vanish. Book the balance as a payment
      // instead, which is also the honest record of what happened.
      const settleNPR = tab === "invoice" && form.status === "Paid" ? Math.max(0, total - Number(form.amountPaid || 0)) : 0;
      // Remove read-only fields that shouldn't be overwritten
      delete updates.createdAt;
      delete updates.createdBy;
      delete updates.id;
      delete updates.amountPaid;   // trigger-owned on invoices
      if (tab !== "invoice") delete updates.customerId;     // only invoices have the column (the client picker fills it on every form)
      await updateRow(meta.coll, editingId, updates);
      if (settleNPR > 0.005) {
        await insertRow("payments", {
          invoiceId:  editingId,
          customerId: customerId || null,
          paidOn:     todayDate(),
          amount:     settleNPR,
          method:     form.paymentType || null,
          note:       "Settled by marking the invoice Paid.",
          recordedBy: profile?.name || "Unknown",
          region:     form.region || region,
        });
      }
      if (plan.affected.length || plan.self || plan.fyChanged) {
        if (!(await resequenceSeries(tab, plan.seriesToFix))) warning = RESEQUENCE_FAILED;
        else {
          try { number = (await fetchOne(meta.coll, editingId))?.[meta.numberField] || number; } catch { /* keep the number it had */ }
        }
      }
    } else {
      /* ── CREATE new document ── */
      // The fiscal year comes from the document's own (Bikram Sambat) date, so a backdated invoice is numbered into the year it belongs to and
      // the FY stored on the record can never disagree with its number.
      const fiscalYear = fiscalYearForDate(form.date) || form.fiscalYear || currentFiscalYear();
      const docNumber = await getNextNumber(tab, fiscalYear);
      const record = {
        ...form,
        fiscalYear,
        currency:       form.currency || "NPR",
        [meta.numberField]: docNumber,
        subtotalNPR:    subtotal,
        discountMode:    form.discountMode || "pct",
        discountPct:    Number(form.discountPct) || 0,
        discountFlatAmt: Number(form.discountFlatAmt) || 0,
        discountAmtNPR: discountAmt,
        taxableAmtNPR:  taxableAmt,
        vatAmountNPR:   applyVAT ? vatAmt : 0,
        totalNPR:       total,
        amountPaid:     0,
        region:         form.region || region,
        createdBy:      profile?.name || "Unknown",
        ...customerLink,
      };
      // Strip fields irrelevant to this doc type
      if (tab !== "invoice")   { delete record.applyVAT; delete record.dueDate; delete record.paymentTerms; delete record.amountPaid; delete record.relatedChallan; delete record.relatedQuotation; delete record.paymentType; delete record.bankName; delete record.customerId; }
      if (tab !== "challan")   { delete record.vehicleNo; delete record.driverName; delete record.routeFrom; delete record.routeTo; }
      if (tab !== "quotation") { delete record.validUntil; delete record.terms; }
      const saved = await insertRow(meta.coll, record);
      number = docNumber;
      // The number just drawn is the next one in the series, which is only right if this is the latest document by date. A backdated one — or a
      // series with gaps — is put back in date order, and stock is posted under the number the document ends up with.
      if (plan.affected.length || (plan.self && plan.self.to !== docNumber)) {
        if (await resequenceSeries(tab, plan.seriesToFix)) {
          try { record[meta.numberField] = (await fetchOne(meta.coll, saved.id))?.[meta.numberField] || docNumber; } catch { /* keep the drawn number */ }
          number = record[meta.numberField];
        } else warning = RESEQUENCE_FAILED;
      }
      // Deduct stock for any line item explicitly linked to an inventory item — only on invoice creation, never on edits/status changes, so stock
      // is deducted exactly once per sale.
      if (tab === "invoice") {
        postSaleStockOut({
          invoice: record,
          items: record.items,
          createdBy: profile?.name || "Unknown",
        }).catch((err) => console.error("Stock auto-post failed:", err));
      }
    }
    return { ok: true, number, warning };
  } catch (err) {
    console.error("Failed to save document:", err);
    const msg = err?.message || (typeof err === "string" ? err : "");
    return { ok: false, message: msg ? `Failed to save document: ${msg}` : "Failed to save document. Please try again." };
  }
}

/** A challan is delivered, a quotation accepted: the status alone changes. Checked by reading the row back. */
export async function setDocStatus({ tab, id, status }) {
  try {
    await updateChecked(DOC_TYPES[tab].coll, id, { status });
    return { ok: true };
  } catch (err) {
    console.error("Failed to change a document's status:", err);
    return { ok: false, message: /^Not saved/.test(err?.message || "") ? err.message : "Not changed. Check your connection and try again." };
  }
}

/** Cancel a document: the record is kept, its status says Cancelled. */
export const cancelDoc = ({ tab, id }) => setDocStatus({ tab, id, status: "Cancelled" });

/* ── Payments ─────────────────────────────────────────────────────────
   Each payment is its own row in `payments`, carrying the date it actually arrived. The invoice's amountPaid is recomputed from those rows by a
   database trigger, so it stays the cheap running total every dashboard already reads. Status stays app-side, because the database must not
   decide that a cancelled invoice is Paid. */

/**
 * Record a payment against an invoice. `info` is `payInfo(row)` (lib/billing.js); amounts are in rupees as typed.
 * Never more than what is outstanding.
 */
export async function recordPayment({ info, amount, date, method, reference, profile }) {
  const newAmt = Number(amount);
  if (Number.isNaN(newAmt) || newAmt <= 0) return { ok: false, message: "Enter a valid payment amount." };
  // payment ceiling — cannot exceed outstanding balance
  const outstanding = info.totalNPR - info.currentPaid;
  if (newAmt > outstanding + 0.005) {
    return { ok: false, message: `Payment of ${fmtNPR(newAmt)} exceeds the outstanding balance of ${fmtNPR(outstanding)}. Please enter a smaller amount.` };
  }
  try {
    const totalPaid = Math.min(info.currentPaid + newAmt, info.totalNPR);
    const creditLeft = info.totalNPR - totalPaid;
    const newStatus = creditLeft <= 0.005 ? "Paid" : "Partial";

    // The card works in rupees; the row is stored in the invoice's own currency so the trigger's sum stays comparable with total_npr. A payment
    // that clears the balance books the exact balance left, so rounding to the currency's digits can never strand a sliver of credit.
    const payCur = info.currency || "NPR";
    let rowAmount = newAmt;
    if (payCur !== "NPR") {
      const docLeft = info.docTotal - info.docPaid;
      if (newAmt >= outstanding - 0.005 && docLeft > 0) {
        rowAmount = docLeft;
      } else {
        const pow = 10 ** currencyDigits(payCur);
        rowAmount = Math.round(fromNPR(newAmt, payCur) * pow) / pow;
      }
    }
    await insertRow("payments", {
      invoiceId:  info.id,
      customerId: info.customerId || null,
      paidOn:     date || todayDate(),
      amount:     rowAmount,
      method:     method || null,
      bankName:   method === "Bank" ? (info.bankName || null) : null,
      reference:  (reference || "").trim() || null,
      recordedBy: profile?.name || "Unknown",
      region:     info.region || null,
    });
    // The trigger has already written amountPaid; only the workflow status is ours to set.
    await updateRow("invoices", info.id, { status: newStatus });
    return { ok: true, status: newStatus };
  } catch (err) {
    console.error("Failed to record payment:", err);
    return { ok: false, message: "Could not save the payment. Please try again." };
  }
}

/** Payments already recorded against an invoice, newest first. */
export async function loadPayments(invoiceId) {
  try {
    return await fetchAll("payments", { filters: [{ field: "invoiceId", value: invoiceId }], orderBy: "paidOn", orderDir: "desc" });
  } catch (err) {
    console.error("Failed to load payment history:", err);
    return [];
  }
}

/**
 * Undo a recorded payment. The trigger that keeps invoices.amount_paid in sync (migration 0030) fires on delete too, so removing the row is
 * enough on the database side. Status does not follow: it is app-owned so a cancelled invoice can't be re-opened by the database deciding
 * it's Paid, which means unwinding it here is ours to do, by the same rule recordPayment uses in reverse.
 */
export async function deletePayment({ info, payment }) {
  try {
    // Never payment.amountNPR: the view only knows GBP. amount is in the invoice's currency.
    const amt = toNPR(payment.amount, payment.invoiceCurrency || info.currency);
    await deleteRow("payments", payment.id);
    if (await fetchOne("payments", payment.id)) return { ok: false, message: "Not deleted. You may not have permission to delete this." };
    const remaining = Math.max(0, info.currentPaid - amt);
    const status = remaining <= 0.005 ? "Sent" : remaining >= info.totalNPR - 0.005 ? "Paid" : "Partial";
    await updateRow("invoices", info.id, { status });
    return { ok: true, remaining, status, removed: Number(payment.amount || 0) };
  } catch (err) {
    console.error("Failed to delete payment:", err);
    return { ok: false, message: "Could not delete the payment. Please try again." };
  }
}

/* ── Quotation → invoice ──────────────────────────────────────────── */

/**
 * Raise a VAT invoice from a quotation: the invoice keeps the quotation's currency (no amount is converted), is dated today (so its fiscal
 * year and number series follow today's Nepali date, not the quotation's), is a Draft with Net 30, and the quotation points at it.
 */
export async function convertToInvoice({ qt, profile }) {
  try {
    // The list on screen can be minutes old, and a second person (or a second tab) may have made the invoice since. Look again before a number is drawn:
    // a second invoice would use up an invoice number and leave the quotation pointing at only one of them.
    const fresh = await fetchOne("quotations", qt.id);
    if (!fresh) return { ok: false, message: "This quotation could not be found. Reload the page and try again." };
    if (fresh.relatedInvoice) return { ok: false, message: `This quotation already has an invoice (${fresh.relatedInvoice}). Reload the page to see it.` };
    const qtCurrency = qt.currency || "NPR";
    const items = qt.items || [];
    const { subtotal, discountAmt, taxableAmt, vatAmt, total } = calcTotals(items, true, qt.discountPct || 0, qt.discountMode, qt.discountFlatAmt || 0);
    const invDate = new Date().toISOString().slice(0, 10);
    const invFiscalYear = fiscalYearForDate(invDate) || currentFiscalYear();
    // Same link as a hand-made invoice gets, worked out before the number is drawn.
    const customerId = await customerIdForClient({
      clientName: qt.clientName, clientPhone: qt.clientPhone,
      clientAddress: qt.clientAddress, region: qt.region,
    });
    const invNumber = await getNextNumber("invoice", invFiscalYear);
    const d = new Date(); d.setDate(d.getDate() + 30);

    await insertRow("invoices", {
      invoiceNumber:    invNumber,
      customerId,
      date:             invDate,
      dueDate:          d.toISOString().slice(0, 10),
      fiscalYear:       invFiscalYear,
      paymentTerms:     "Net 30",
      clientName:       qt.clientName || "",
      clientPAN:        qt.clientPAN || "",
      clientAddress:    qt.clientAddress || "",
      clientPhone:      qt.clientPhone || "",
      status:           "Draft",
      applyVAT:         true,
      paymentType:      "CASH",
      items:            items,
      note:             qt.note || "",
      discountMode:     qt.discountMode || "pct",
      discountPct:      qt.discountPct || 0,
      discountFlatAmt:  qt.discountFlatAmt || 0,
      discountAmtNPR:   discountAmt,
      taxableAmtNPR:    taxableAmt,
      relatedQuotation: qt.quotationNumber || "",
      relatedChallan:   "",
      region:           qt.region || null,
      subtotalNPR:      subtotal,
      vatAmountNPR:     vatAmt,
      totalNPR:         total,
      amountPaid:       0,
      currency:         qtCurrency,
      createdBy:        profile?.name || "Unknown",
    });

    // No-op unless the quotation's items already carry a stockItemId — quotations don't expose the Stock Item picker, so this only fires if one
    // is added later.
    postSaleStockOut({
      invoice: { date: invDate, invoiceNumber: invNumber },
      items,
      createdBy: profile?.name || "Unknown",
    }).catch((err) => console.error("Stock auto-post failed:", err));

    await updateRow("quotations", qt.id, {
      relatedInvoice: invNumber,
      status: qt.status === "Sent" ? "Accepted" : qt.status,
    });
    return { ok: true, number: invNumber };
  } catch (err) {
    console.error(err);
    return { ok: false, message: "Conversion failed." };
  }
}

/** Put every series that is out of date order back in order (the "Renumber by date" button). `groups` is `outOfOrderSeries(…)`. */
export async function renumberSeries({ tab, groups }) {
  try {
    for (const g of groups) await resequenceDocNumbers(tab, g.key);
    return { ok: true };
  } catch (err) {
    console.error("Failed to renumber by date:", err);
    return { ok: false, message: "Could not renumber. Database migration 0040 may not be applied yet." };
  }
}

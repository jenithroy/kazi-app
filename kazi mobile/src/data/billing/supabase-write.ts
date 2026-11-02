/**
 * Live `invoices` / `quotations` / `challans` writers — the reference ERP's own
 * collections.
 *
 * The mobile `Invoice` carries a lot of derived/mobile-only state; only the
 * fields that exist on the live doc are written. A payment is its own row in
 * `payments`, which a trigger sums into the invoice's `amountPaid` (migration
 * 0030); that column is never written from here.
 */

import { doc, getDoc , getDb } from '@/lib/supabase/collections';

import { GBP_RATE } from '@/lib/currency';
import { isoDay } from '@/lib/date-display';
import { num, str } from '@/lib/data/normalise';
import { createDocument, patchDocument } from '@/lib/supabase/write';
import { getActor } from '@/data/notifications/actor';

import { resequenceDocNumbers } from './doc-numbers';
import type {
  Challan,
  ChallanStatus,
  Currency,
  DiscountMode,
  DocLine,
  DocType,
  Invoice,
  Payment,
  PaymentMethod,
  Quotation,
  QuotationStatus,
} from './types';
import { calcTotals, creditOf } from './utils';

const INVOICES = 'invoices';
const QUOTATIONS = 'quotations';
const CHALLANS = 'challans';

/**
 * A backdated document draws the *next* number, which is only right when it is
 * also the latest by date — so the series is put back in date order afterwards.
 * A failure here must not fail the create: the document is already filed, and
 * rolling the UI back would claim nothing was written.
 */
async function resequenceAfterCreate(kind: DocType, fiscalYear: string | undefined): Promise<void> {
  try {
    await resequenceDocNumbers(kind, fiscalYear ?? '');
  } catch (err) {
    console.error(`[billing] ${kind} saved, but the series could not be put back in date order`, err);
  }
}

function invoiceLines(inv: Partial<Invoice>) {
  return (inv.lines ?? []).map((l) => ({
    description: l.desc,
    challan: l.challan ?? '',
    qty: l.qty,
    rate: l.rate,
    unit: l.unit ?? '',
  }));
}

/**
 * The five stored figures the web ERP reads straight off the row (its
 * receivables never recompute them). Derived with the same `calcTotals` the
 * sheets display, so a saved total can't disagree with what the app showed.
 */
function emitTotals(
  out: Record<string, unknown>,
  lines: DocLine[],
  applyVAT: boolean,
  discountMode: DiscountMode,
  discountPct: number,
  discountFlatAmt: number,
): void {
  const t = calcTotals(lines, applyVAT, discountMode, discountPct, discountFlatAmt);
  out.subtotalNPR = t.subtotal;
  out.discountAmtNPR = t.discountAmt;
  out.taxableAmtNPR = t.taxableAmt;
  out.vatAmountNPR = t.vatAmt;
  out.totalNPR = t.total;
}

function invoiceToLive(inv: Partial<Invoice>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (inv.ref !== undefined) out.invoiceNumber = inv.ref;
  // The UNIQUE index is on (COALESCE(fiscal_year,''), invoice_no), so a row with
  // no year lands in a uniqueness group of its own and starts a phantom series.
  if (inv.fiscalYear !== undefined) out.fiscalYear = inv.fiscalYear;
  if (inv.issuedISO ?? inv.issued) out.date = inv.issuedISO ?? inv.issued;
  if (inv.dueISO ?? inv.due) out.dueDate = inv.dueISO ?? inv.due;
  if (inv.clientName !== undefined) out.clientName = inv.clientName;
  if (inv.clientPAN !== undefined) out.clientPAN = inv.clientPAN;
  if (inv.clientPhone !== undefined) out.clientPhone = inv.clientPhone;
  if (inv.clientAddress !== undefined) out.clientAddress = inv.clientAddress;
  if (inv.applyVAT !== undefined) out.applyVAT = inv.applyVAT;
  if (inv.cur !== undefined) out.currency = inv.cur;
  if (inv.paymentTerms ?? inv.terms) out.paymentTerms = inv.paymentTerms ?? inv.terms;
  if (inv.discountPct !== undefined) out.discountPct = inv.discountPct;
  if (inv.discountMode !== undefined) out.discountMode = inv.discountMode;
  if (inv.discountFlatAmt !== undefined) out.discountFlatAmt = inv.discountFlatAmt;
  // Recompute the stored totals whenever the write carries every input they
  // depend on — otherwise the row keeps figures that no longer match its lines.
  if (inv.lines && inv.discountMode !== undefined && inv.applyVAT !== undefined) {
    emitTotals(
      out,
      inv.lines.map((l) => ({ desc: l.desc, qty: l.qty, unit: l.unit ?? '', rate: l.rate })),
      inv.applyVAT,
      inv.discountMode,
      inv.discountPct ?? 0,
      inv.discountFlatAmt ?? 0,
    );
  }
  if (inv.paymentType !== undefined) out.paymentType = inv.paymentType;
  if (inv.bankName !== undefined) out.bankName = inv.bankName;
  if (inv.note !== undefined) out.note = inv.note;
  if (inv.explicitStatus !== undefined) out.status = inv.explicitStatus;
  else if (inv.cancelled) out.status = 'Cancelled';
  if (inv.relatedChallan !== undefined) out.relatedChallan = inv.relatedChallan;
  if (inv.relatedQuotation !== undefined) out.relatedQuotation = inv.relatedQuotation;
  if (inv.lines !== undefined) out.items = invoiceLines(inv);
  return out;
}

export async function addInvoice(invoice: Invoice): Promise<void> {
  await createDocument(INVOICES, {
    ...invoiceToLive(invoice),
    createdBy: getActor()?.name ?? 'kazi-mobile',
  });
  await resequenceAfterCreate('invoice', invoice.fiscalYear);
}

export async function updateInvoice(id: string, updates: Partial<Invoice>): Promise<void> {
  const fields = invoiceToLive(updates);
  if (Object.keys(fields).length > 0) await patchDocument(INVOICES, id, fields);
}

/** The methods the website's payment form offers; the phone's "credit" is a credit note, which that list files under Other. */
const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'Cash', bank: 'Bank', credit: 'Other' };

/**
 * Recording a payment, as the website does (`billingWrites.recordPayment`). The payment is its own row, held in the invoice's own
 * currency and dated the day it arrived; the trigger sums the rows into `amount_paid`, so that column is not written here, and a
 * figure written to it by hand would be undone by the next payment anyone records. Status stays the app's to set: Paid once nothing
 * is left, Partial before.
 */
export async function addPayment(invoiceId: string, payment: Payment): Promise<void> {
  const snap = await getDoc(doc(getDb(), INVOICES, invoiceId));
  if (!snap.exists()) throw new Error(`addPayment ${invoiceId}: invoice not found`);
  const inv = snap.data();

  const currency = str(inv.currency).trim().toUpperCase() || 'NPR';
  // The phone only knows the pound's rate; guessing another currency's would book the wrong amount against the invoice.
  if (currency !== 'NPR' && currency !== 'GBP') throw new Error(`This invoice is in ${currency}: record its payments on the website.`);
  const own = { cur: currency as Currency, rate: currency === 'NPR' ? 1 : GBP_RATE };

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const left = round2(num(inv.totalNPR) - num(inv.amountPaid));
  if (left <= 0.005) throw new Error('This invoice has nothing left to pay.');
  let amount = round2(creditOf(own, payment));
  // Never more than is owed; a payment that clears the balance books exactly what is left, so rounding can't strand a sliver of credit.
  if (amount >= left - 0.005) amount = left;
  if (!(amount > 0)) throw new Error('Enter an amount to record.');

  await createDocument('payments', {
    invoiceId,
    customerId: str(inv.customerId).trim() || null,
    paidOn: /^\d{4}-\d{2}-\d{2}$/.test(payment.date) ? payment.date : isoDay(new Date()),
    amount,
    method: METHOD_LABEL[payment.method],
    bankName: payment.method === 'bank' ? payment.acct || str(inv.bankName).trim() || null : null,
    reference: payment.ref.trim() || null,
    recordedBy: getActor()?.name ?? 'kazi-mobile',
    region: str(inv.region).trim() || null,
  });

  // The money is recorded. A status that can't be set must not report the payment as failed, or it gets entered twice; the phone works
  // the status out from the payments anyway, and the website's next save of the invoice puts it right.
  try {
    await patchDocument(INVOICES, invoiceId, { status: left - amount <= 0.005 ? 'Paid' : 'Partial' });
  } catch (err) {
    console.error('billing/addPayment: the payment is recorded, but the invoice status could not be updated', err);
  }
}

/** Snapshot restore (undo) — not reversed in Postgres this pass. */
export async function restoreInvoices(_previous: Invoice[]): Promise<void> {
  /* intentionally no live write */
}

// ---- Quotations ----

function quotationToLive(q: Partial<Quotation>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (q.number !== undefined) out.quotationNumber = q.number;
  if (q.fiscalYear !== undefined) out.fiscalYear = q.fiscalYear;
  if (q.date !== undefined) out.date = q.date;
  if (q.clientName !== undefined) out.clientName = q.clientName;
  if (q.clientPAN !== undefined) out.clientPAN = q.clientPAN;
  if (q.clientPhone !== undefined) out.clientPhone = q.clientPhone;
  if (q.clientAddress !== undefined) out.clientAddress = q.clientAddress;
  if (q.discountPct !== undefined) out.discountPct = q.discountPct;
  if (q.note !== undefined) out.note = q.note;
  if (q.status !== undefined) out.status = q.status;
  if (q.currency !== undefined) out.currency = q.currency;
  if (q.validUntil !== undefined) out.validUntil = q.validUntil;
  if (q.terms !== undefined) out.terms = q.terms;
  if (q.relatedInvoice !== undefined) out.relatedInvoice = q.relatedInvoice;
  if (q.lines !== undefined) {
    out.items = q.lines.map((l) => ({ description: l.desc, qty: l.qty, unit: l.unit, rate: l.rate }));
  }
  // A quotation never carries VAT (the live rows are all zero-rated).
  if (q.lines && q.discountMode !== undefined) {
    emitTotals(out, q.lines, false, q.discountMode, q.discountPct ?? 0, q.discountFlatAmt ?? 0);
  }
  return out;
}

export async function addQuotation(quotation: Quotation): Promise<void> {
  await createDocument(QUOTATIONS, {
    ...quotationToLive(quotation),
    createdBy: quotation.createdBy || getActor()?.name || 'kazi-mobile',
  });
  await resequenceAfterCreate('quotation', quotation.fiscalYear);
}

export async function updateQuotation(id: string, updates: Partial<Quotation>): Promise<void> {
  const fields = quotationToLive(updates);
  if (Object.keys(fields).length > 0) await patchDocument(QUOTATIONS, id, fields);
}

// ---- Challans ----

function challanToLive(c: Partial<Challan>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (c.number !== undefined) out.challanNumber = c.number;
  if (c.date !== undefined) out.date = c.date;
  if (c.clientName !== undefined) out.clientName = c.clientName;
  if (c.clientPAN !== undefined) out.clientPAN = c.clientPAN;
  if (c.clientPhone !== undefined) out.clientPhone = c.clientPhone;
  if (c.clientAddress !== undefined) out.clientAddress = c.clientAddress;
  if (c.discountMode !== undefined) out.discountMode = c.discountMode;
  if (c.discountPct !== undefined) out.discountPct = c.discountPct;
  if (c.discountFlatAmt !== undefined) out.discountFlatAmt = c.discountFlatAmt;
  if (c.note !== undefined) out.note = c.note;
  if (c.status !== undefined) out.status = c.status;
  if (c.fiscalYear !== undefined) out.fiscalYear = c.fiscalYear;
  if (c.vehicleNo !== undefined) out.vehicleNo = c.vehicleNo;
  if (c.driverName !== undefined) out.driverName = c.driverName;
  if (c.routeFrom !== undefined) out.routeFrom = c.routeFrom;
  if (c.routeTo !== undefined) out.routeTo = c.routeTo;
  if (c.relatedInvoice !== undefined) out.relatedInvoice = c.relatedInvoice;
  if (c.lines !== undefined) {
    out.items = c.lines.map((l) => ({ description: l.desc, qty: l.qty, unit: l.unit, rate: l.rate }));
  }
  // VAT never applies to a delivery note.
  if (c.lines && c.discountMode !== undefined) {
    emitTotals(out, c.lines, false, c.discountMode, c.discountPct ?? 0, c.discountFlatAmt ?? 0);
  }
  return out;
}

export async function addChallan(challan: Challan): Promise<void> {
  await createDocument(CHALLANS, {
    ...challanToLive(challan),
    createdBy: challan.createdBy || getActor()?.name || 'kazi-mobile',
  });
  await resequenceAfterCreate('challan', challan.fiscalYear);
}

export async function updateChallan(id: string, updates: Partial<Challan>): Promise<void> {
  const fields = challanToLive(updates);
  if (Object.keys(fields).length > 0) await patchDocument(CHALLANS, id, fields);
}

export async function updateChallanStatus(id: string, status: ChallanStatus): Promise<void> {
  await patchDocument(CHALLANS, id, { status });
}

/** Snapshot restore (undo) — not reversed server-side, same as invoices. */
export async function restoreChallans(_previous: Challan[]): Promise<void> {
  /* intentionally no live write */
}

export async function updateQuotationStatus(id: string, status: QuotationStatus): Promise<void> {
  await patchDocument(QUOTATIONS, id, { status });
}

/** Snapshot restore (undo) — not reversed in Postgres this pass. */
export async function restoreQuotations(_previous: Quotation[]): Promise<void> {
  /* intentionally no live write */
}

/**
 * Live `invoices` + `quotations` readers (Track B, read-only). Writes stay on
 * `mock-api.ts`; `fetchChallans` / `fetchOpenChallans` stay mock entirely (no
 * live `challans` collection — FRONTEND_GAP_PLAN §6).
 *
 * Live shapes (sampled 2026-08-30):
 *   invoices    { invoiceNumber, date, dueDate, fiscalYear, clientName, clientPAN,
 *                 clientPhone, clientAddress, status (Draft/Sent/Paid/Partial/Cancelled),
 *                 applyVAT, currency (NPR/GBP), paymentTerms, items (JSON string OR array,
 *                 rate/qty may be strings), discountPct, discountAmtNPR, subtotalNPR,
 *                 taxableAmtNPR, vatAmountNPR, totalNPR, amountPaid, relatedChallan,
 *                 relatedQuotation, note, createdBy/At, updatedBy/At }
 *   quotations  like invoices + { quotationNumber, validUntil, terms, relatedInvoice, currency }
 *
 * Gaps handled locally (see plan §Batch 2):
 *   - `client: ClientId` union → fixed 'northfield'; every screen reads `clientName` first
 *   - `payments[]` → synthesised from the `amountPaid` scalar (one row)
 *   - no per-invoice FX rate  → `GBP_RATE`
 */

import { GBP_RATE } from '@/lib/currency';
import { arr, bool, num, str, tsToISO } from '@/lib/data/normalise';
import { readCollection, type DocData } from '@/lib/supabase/read';

import type {
  Challan,
  ChallanStatus,
  ClientId,
  Currency,
  DocCurrency,
  DocLine,
  Invoice,
  InvoiceLine,
  OpenChallan,
  Payment,
  PaymentMethod,
  Quotation,
  QuotationStatus,
} from './types';

const DEFAULT_CLIENT: ClientId = 'northfield';

function mapCurrency(raw: unknown): Currency {
  const s = str(raw).trim().toUpperCase();
  return s === 'GBP' ? 'GBP' : s === 'EUR' ? 'EUR' : 'NPR';
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO).getTime();
  const b = new Date(toISO).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** One `items[]` element → an invoice line (keys and number types vary live). */
/**
 * `discountMode` / `discountPct` can disagree with the row's own stored total:
 * INV-007 is mode "pct" with pct 0 yet carries a real 3,000 in `discountAmtNPR`,
 * and only that 3,000 reproduces its stored total. So the flat amount wins
 * whenever the percentage is empty, otherwise editing the row discards it.
 */
function discountFrom(d: DocData): { discountMode: 'amount' | 'pct'; discountPct: number; discountFlatAmt: number } {
  const discountFlatAmt = num(d.discountFlatAmt) || num(d.discountAmtNPR);
  const discountPct = num(d.discountPct);
  const explicitAmount = str(d.discountMode).toLowerCase() === 'amount';
  return {
    discountMode: explicitAmount || (discountPct <= 0 && discountFlatAmt > 0) ? 'amount' : 'pct',
    discountPct,
    discountFlatAmt,
  };
}

function toInvoiceLine(raw: unknown): InvoiceLine {
  const e = (raw ?? {}) as DocData;
  return {
    desc: str(e.description ?? e.desc ?? e.item ?? e.name ?? e.particulars).trim(),
    challan: str(e.challan).trim(),
    qty: num(e.qty ?? e.quantity, 1),
    rate: num(e.rate ?? e.price ?? e.unitPrice),
    unit: str(e.unit).trim() || undefined,
  };
}

function toDocLine(raw: unknown): DocLine {
  const e = (raw ?? {}) as DocData;
  return {
    desc: str(e.description ?? e.desc ?? e.item ?? e.name ?? e.particulars).trim(),
    qty: num(e.qty ?? e.quantity, 1),
    unit: str(e.unit).trim() || 'pc',
    rate: num(e.rate ?? e.price ?? e.unitPrice),
  };
}

function mapInvoiceDoc(id: string, d: DocData): Invoice | null {
  const clientName = str(d.clientName).trim();
  const number = str(d.invoiceNumber).trim();
  if (!clientName && !number) return null;

  const cur = mapCurrency(d.currency);
  const rate = cur === 'NPR' ? 1 : GBP_RATE;
  const issuedISO = str(d.date).trim() || tsToISO(d.createdAt).slice(0, 10);
  const dueISO = str(d.dueDate).trim() || issuedISO;
  const applyVAT = bool(d.applyVAT);
  const status = str(d.status).trim();
  const amountPaid = num(d.amountPaid);

  const lines = arr<unknown>(d.items).map(toInvoiceLine).filter((l) => l.desc || l.qty || l.rate);

  const payments: Payment[] = amountPaid > 0
    ? [{
        cur,
        amt: cur === 'NPR' ? amountPaid : Math.round((amountPaid / rate) * 100) / 100,
        rate,
        method: (str(d.paymentType).toLowerCase() as PaymentMethod) || 'bank',
        acct: null,
        ref: '',
        date: tsToISO(d.updatedAt).slice(0, 10) || issuedISO,
      }]
    : [];

  return {
    id,
    ref: number || `INV-${id.slice(0, 4).toUpperCase()}`,
    client: DEFAULT_CLIENT,
    cur,
    rate,
    export: !applyVAT,
    so: '',
    issued: issuedISO,
    due: dueISO,
    dueDays: daysBetween(issuedISO, dueISO),
    terms: str(d.paymentTerms).trim(),
    cancelled: /cancel/i.test(status),
    challans: [],
    lines,
    payments,
    clientName: clientName || undefined,
    clientPAN: str(d.clientPAN).trim() || undefined,
    clientPhone: str(d.clientPhone).trim() || undefined,
    clientAddress: str(d.clientAddress).trim() || undefined,
    applyVAT,
    ...discountFrom(d),
    issuedISO,
    dueISO,
    paymentTerms: str(d.paymentTerms).trim() || undefined,
    explicitStatus: status === 'Draft' ? 'Draft' : status === 'Sent' ? 'Sent' : undefined,
    relatedChallan: str(d.relatedChallan).trim() || undefined,
    relatedQuotation: str(d.relatedQuotation).trim() || undefined,
    // The web app writes these inconsistently (`CASH` and `Bank` both occur).
    paymentType: mapPaymentType(d.paymentType),
    bankName: str(d.bankName).trim() || undefined,
    note: str(d.note).trim() || undefined,
  };
}

function mapPaymentType(raw: unknown): Invoice['paymentType'] {
  const s = str(raw).trim().toLowerCase();
  if (s === 'cash') return 'Cash';
  if (s === 'bank') return 'Bank';
  if (s === 'credit') return 'Credit';
  return undefined;
}

function mapQuotationStatus(raw: unknown): QuotationStatus {
  const s = str(raw).trim().toLowerCase();
  if (s === 'sent') return 'Sent';
  if (s === 'accepted') return 'Accepted';
  if (s === 'rejected') return 'Rejected';
  if (s === 'cancelled' || s === 'canceled') return 'Cancelled';
  return 'Draft';
}

function mapQuotationDoc(id: string, d: DocData): Quotation | null {
  const clientName = str(d.clientName).trim();
  const number = str(d.quotationNumber).trim();
  if (!clientName && !number) return null;
  const date = str(d.date).trim() || tsToISO(d.createdAt).slice(0, 10);
  return {
    id,
    number: number || `QT-${id.slice(0, 4).toUpperCase()}`,
    date,
    clientName: clientName || '—',
    clientPAN: str(d.clientPAN).trim(),
    clientPhone: str(d.clientPhone).trim(),
    clientAddress: str(d.clientAddress).trim(),
    lines: arr<unknown>(d.items).map(toDocLine).filter((l) => l.desc || l.qty || l.rate),
    ...discountFrom(d),
    note: str(d.note).trim(),
    createdBy: str(d.createdBy).trim(),
    status: mapQuotationStatus(d.status),
    currency: (str(d.currency).trim().toUpperCase() === 'GBP' ? 'GBP' : 'NPR') as DocCurrency,
    validUntil: str(d.validUntil).trim() || date,
    terms: str(d.terms).trim(),
    relatedInvoice: str(d.relatedInvoice).trim(),
  };
}

function mapChallanStatus(raw: unknown): ChallanStatus {
  const s = str(raw).trim().toLowerCase();
  if (s === 'dispatched') return 'Dispatched';
  if (s === 'delivered') return 'Delivered';
  if (s === 'cancelled' || s === 'canceled') return 'Cancelled';
  return 'Draft';
}

function mapChallanDoc(id: string, d: DocData): Challan | null {
  const clientName = str(d.clientName).trim();
  const number = str(d.challanNumber).trim();
  if (!clientName && !number) return null;
  const date = str(d.date).trim() || tsToISO(d.createdAt).slice(0, 10);
  return {
    id,
    number: number || `CH-${id.slice(0, 4).toUpperCase()}`,
    date,
    clientName: clientName || '—',
    clientPAN: str(d.clientPAN).trim(),
    clientPhone: str(d.clientPhone).trim(),
    clientAddress: str(d.clientAddress).trim(),
    lines: arr<unknown>(d.items).map(toDocLine).filter((l) => l.desc || l.qty || l.rate),
    ...discountFrom(d),
    note: str(d.note).trim(),
    createdBy: str(d.createdBy).trim(),
    status: mapChallanStatus(d.status),
    fiscalYear: str(d.fiscalYear).trim(),
    vehicleNo: str(d.vehicleNo).trim(),
    driverName: str(d.driverName).trim(),
    routeFrom: str(d.routeFrom).trim(),
    routeTo: str(d.routeTo).trim(),
    relatedInvoice: str(d.relatedInvoice).trim(),
  };
}

export async function fetchInvoices(): Promise<Invoice[]> {
  return readCollection('invoices', mapInvoiceDoc);
}

export async function fetchQuotations(): Promise<Quotation[]> {
  return readCollection('quotations', mapQuotationDoc);
}

export async function fetchChallans(): Promise<Challan[]> {
  return readCollection('challans', mapChallanDoc);
}

/**
 * The "delivered, not yet invoiced" banner on the billing list. The reference
 * ERP has no separate collection for these — they are simply the challans that
 * were delivered and never billed onto an invoice.
 */
export async function fetchOpenChallans(): Promise<OpenChallan[]> {
  const challans = await fetchChallans();
  return challans
    .filter((c) => c.status === 'Delivered' && !c.relatedInvoice)
    .map((c) => {
      const pcs = c.lines.reduce((n, l) => n + l.qty, 0);
      return {
        id: c.id,
        no: c.number,
        client: DEFAULT_CLIENT,
        clientName: c.clientName,
        pcs,
        date: c.date,
        so: '',
        cur: 'NPR' as Currency,
        rate: 1,
        desc: c.lines[0]?.desc ?? 'Delivered goods',
      };
    });
}

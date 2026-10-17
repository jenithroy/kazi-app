/**
 * Mobile model → the live document shape the sheet template reads.
 * Kept apart from `doc-template.ts` so that file stays a faithful port of the
 * website's own renderer.
 */
import { fiscalYearForAD } from '@/lib/nepaliDate';
import { CLIENTS } from '@/data/billing/mock';
import type { Challan, Invoice, Quotation } from '@/data/billing/types';
import {
  appliesVAT,
  calcTotals,
  clientNameOf,
  discountAmt,
  paid,
  subtotal,
  taxable,
  total,
  vat,
} from '@/data/billing/utils';

import type { DocData, DocType } from './doc-template';

export function docNumberOf(data: DocData): string {
  return data.invoiceNumber || data.challanNumber || data.quotationNumber || 'document';
}

export function invoiceDocData(v: Invoice): DocData {
  return {
    invoiceNumber: v.ref,
    date: v.issuedISO ?? v.issued,
    dueDate: v.dueISO ?? v.due,
    fiscalYear: v.issuedISO ? fiscalYearForAD(v.issuedISO).label : undefined,
    clientName: clientNameOf(v),
    clientAddress: v.clientAddress ?? CLIENTS[v.client]?.city,
    clientPAN: v.clientPAN,
    clientPhone: v.clientPhone,
    currency: v.cur,
    items: v.lines.map((l) => ({ description: l.desc, qty: l.qty, unit: l.unit ?? 'Pcs', rate: l.rate })),
    subtotalNPR: subtotal(v),
    discountPct: v.discountPct ?? 0,
    discountAmtNPR: discountAmt(v),
    discountMode: v.discountMode ?? 'pct',
    taxableAmtNPR: taxable(v),
    vatAmountNPR: vat(v),
    totalNPR: total(v),
    amountPaid: paid(v),
    applyVAT: appliesVAT(v),
    paymentTerms: v.paymentTerms ?? v.terms,
    relatedChallan: v.relatedChallan ?? v.challans[0]?.no,
    relatedQuotation: v.relatedQuotation,
    note: v.note,
  };
}

export function quotationDocData(q: Quotation): DocData {
  const t = calcTotals(q.lines, false, q.discountMode, q.discountPct, q.discountFlatAmt);
  return {
    quotationNumber: q.number,
    date: q.date,
    validUntil: q.validUntil,
    clientName: q.clientName,
    clientAddress: q.clientAddress,
    clientPAN: q.clientPAN,
    clientPhone: q.clientPhone,
    currency: q.currency,
    items: q.lines.map((l) => ({ description: l.desc, qty: l.qty, unit: l.unit, rate: l.rate })),
    subtotalNPR: t.subtotal,
    discountPct: q.discountPct,
    discountAmtNPR: t.discountAmt,
    discountMode: q.discountMode,
    taxableAmtNPR: t.taxableAmt,
    vatAmountNPR: t.vatAmt,
    totalNPR: t.total,
    applyVAT: false,
    relatedInvoice: q.relatedInvoice,
    terms: q.terms,
    note: q.note,
  };
}

export function challanDocData(c: Challan): DocData {
  const t = calcTotals(c.lines, false, c.discountMode, c.discountPct, c.discountFlatAmt);
  return {
    challanNumber: c.number,
    date: c.date,
    fiscalYear: c.fiscalYear,
    clientName: c.clientName,
    clientAddress: c.clientAddress,
    clientPAN: c.clientPAN,
    clientPhone: c.clientPhone,
    currency: 'NPR',
    items: c.lines.map((l) => ({ description: l.desc, qty: l.qty, unit: l.unit, rate: l.rate })),
    subtotalNPR: t.subtotal,
    discountPct: c.discountPct,
    discountAmtNPR: t.discountAmt,
    discountMode: c.discountMode,
    taxableAmtNPR: t.taxableAmt,
    vatAmountNPR: t.vatAmt,
    totalNPR: t.total,
    applyVAT: false,
    relatedInvoice: c.relatedInvoice,
    vehicleNo: c.vehicleNo,
    driverName: c.driverName,
    routeFrom: c.routeFrom,
    routeTo: c.routeTo,
    note: c.note,
  };
}

export function docDataFor(doc: Invoice | Quotation | Challan, type: DocType): DocData {
  if (type === 'invoice') return invoiceDocData(doc as Invoice);
  if (type === 'quotation') return quotationDocData(doc as Quotation);
  return challanDocData(doc as Challan);
}

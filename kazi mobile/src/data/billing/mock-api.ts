import { simulateLatency } from '../mock/delay';
import { seedChallans, seedInvoices, seedOpenChallans, seedQuotations } from './mock';
import type { Challan, ChallanStatus, Invoice, OpenChallan, Payment, Quotation, QuotationStatus } from './types';

let invoicesDb: Invoice[] = [...seedInvoices];
let challansDb: OpenChallan[] = [...seedOpenChallans];
let docChallansDb: Challan[] = seedChallans.map((c) => ({ ...c }));
let quotationsDb: Quotation[] = seedQuotations.map((q) => ({ ...q }));

export async function fetchInvoices(): Promise<Invoice[]> {
  await simulateLatency();
  return [...invoicesDb];
}

export async function addInvoice(invoice: Invoice): Promise<void> {
  await simulateLatency(300);
  invoicesDb = [invoice, ...invoicesDb];
}

export async function updateInvoice(id: string, updates: Partial<Invoice>): Promise<void> {
  await simulateLatency(280);
  invoicesDb = invoicesDb.map((v) => (v.id === id ? { ...v, ...updates } : v));
}

export async function addPayment(invoiceId: string, payment: Payment): Promise<void> {
  await simulateLatency(300);
  invoicesDb = invoicesDb.map((v) => (v.id === invoiceId ? { ...v, payments: [...v.payments, payment] } : v));
}

export async function restoreInvoices(previous: Invoice[]): Promise<void> {
  await simulateLatency(150);
  invoicesDb = [...previous];
}

export async function fetchOpenChallans(): Promise<OpenChallan[]> {
  await simulateLatency(250);
  return [...challansDb];
}

export async function removeOpenChallan(id: string): Promise<void> {
  await simulateLatency(200);
  challansDb = challansDb.filter((c) => c.id !== id);
}

// ---- Challans (first-class doc type, item 13) ----

export async function fetchChallans(): Promise<Challan[]> {
  await simulateLatency();
  return [...docChallansDb];
}

export async function addChallan(challan: Challan): Promise<void> {
  await simulateLatency(300);
  docChallansDb = [challan, ...docChallansDb];
}

export async function updateChallanStatus(id: string, status: ChallanStatus): Promise<void> {
  await simulateLatency(200);
  docChallansDb = docChallansDb.map((c) => (c.id === id ? { ...c, status } : c));
}

export async function updateChallan(id: string, updates: Partial<Challan>): Promise<void> {
  await simulateLatency(200);
  docChallansDb = docChallansDb.map((c) => (c.id === id ? { ...c, ...updates } : c));
}

export async function restoreChallans(previous: Challan[]): Promise<void> {
  await simulateLatency(150);
  docChallansDb = [...previous];
}

// ---- Quotations (item 13) ----

export async function fetchQuotations(): Promise<Quotation[]> {
  await simulateLatency();
  return [...quotationsDb];
}

export async function addQuotation(quotation: Quotation): Promise<void> {
  await simulateLatency(300);
  quotationsDb = [quotation, ...quotationsDb];
}

export async function updateQuotationStatus(id: string, status: QuotationStatus): Promise<void> {
  await simulateLatency(200);
  quotationsDb = quotationsDb.map((q) => (q.id === id ? { ...q, status } : q));
}

export async function updateQuotation(id: string, updates: Partial<Quotation>): Promise<void> {
  await simulateLatency(220);
  quotationsDb = quotationsDb.map((q) => (q.id === id ? { ...q, ...updates } : q));
}

export async function restoreQuotations(previous: Quotation[]): Promise<void> {
  await simulateLatency(150);
  quotationsDb = [...previous];
}

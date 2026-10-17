export type Currency = 'GBP' | 'EUR' | 'NPR';
export type PaymentMethod = 'cash' | 'bank' | 'credit';
export type InvoiceStatus = 'accepted' | 'collected' | 'cancelled';
/** The full IRD status model (item 14). `Draft`/`Sent` are user-set; the rest are derived. */
export type InvoiceStatusFull = 'Draft' | 'Sent' | 'Partial' | 'Paid' | 'Overdue' | 'Cancelled';
export type BillingFilter = 'all' | InvoiceStatusFull;
export type BillingView = 'list' | 'detail' | 'breakdown';
export type SheetType = 'challans' | 'pay' | null;
export type ClientId = 'northfield' | 'halden' | 'thamel' | 'baselayer' | 'karve' | 'ridgeline';

/** The three billing document types (reference `DOC_TYPES`). */
export type DocType = 'invoice' | 'challan' | 'quotation';

export interface InvoiceLine {
  desc: string;
  challan: string;
  qty: number;
  rate: number;
  /** Optional unit label for form-created lines (reference `items[].unit`). */
  unit?: string;
}

export interface InvoiceChallan {
  no: string;
  meta: string;
}

export interface Payment {
  cur: Currency;
  amt: number;
  rate: number;
  method: PaymentMethod;
  acct: string | null;
  ref: string;
  date: string;
}

export interface Invoice {
  id: string;
  ref: string;
  client: ClientId;
  cur: Currency;
  rate: number;
  /** `true` = zero-rated export (no VAT). Seed invoices use this; form-created ones set `applyVAT` instead. */
  export: boolean;
  so: string;
  issued: string;
  due: string;
  dueDays: number;
  terms: string;
  cancelled: boolean;
  cancelNote?: string;
  challans: InvoiceChallan[];
  lines: InvoiceLine[];
  payments: Payment[];

  // ---- Form-created invoice fields (item 14) — all optional so seeds stay valid ----
  /** Free-text client block; falls back to `CLIENTS[client]` when absent. */
  clientName?: string;
  clientPAN?: string;
  clientPhone?: string;
  clientAddress?: string;
  /** Explicit VAT toggle. When absent, VAT applies unless `export` is true. */
  applyVAT?: boolean;
  discountMode?: DiscountMode;
  discountPct?: number;
  discountFlatAmt?: number;
  /** AD ISO issue / due dates (the string `issued`/`due` are display-only derivations). */
  issuedISO?: string;
  dueISO?: string;
  /** The fiscal year its number was drawn under, e.g. `2083/84`. Set on create. */
  fiscalYear?: string;
  paymentTerms?: string;
  paymentType?: 'Cash' | 'Bank' | 'Credit';
  bankName?: string;
  /** User-set part of the status model — `Draft` or `Sent`; everything else is derived. */
  explicitStatus?: Extract<InvoiceStatusFull, 'Draft' | 'Sent'>;
  relatedChallan?: string;
  relatedQuotation?: string;
  /** Free-text note on the live doc — shown on the invoice and the PDF. */
  note?: string;
}

export interface OpenChallan {
  id: string;
  no: string;
  client: ClientId;
  /** Live challans carry a free-text name; seeds only have the `client` key. */
  clientName?: string;
  pcs: number;
  date: string;
  so: string;
  cur: Currency;
  rate: number;
  desc: string;
}

export interface Client {
  name: string;
  city: string;
  initials: string;
  avatarBg: string;
  avatarFg: string;
}

export interface Account {
  id: string;
  code: string;
  label: string;
}

// ---- Challans + Quotations (item 13) ----

export type ChallanStatus = 'Draft' | 'Dispatched' | 'Delivered' | 'Cancelled';
export type QuotationStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected' | 'Cancelled';
export type DiscountMode = 'pct' | 'amount';
export type DocCurrency = 'NPR' | 'GBP';

/** A line on a challan or quotation (reference `emptyItem` — `description / qty / unit / rate`). */
export interface DocLine {
  desc: string;
  qty: number;
  unit: string;
  rate: number;
}

interface DocBase {
  id: string;
  /** Sequential per-type number, e.g. `CH-014` / `QT-009`. Gap-free (item 16 makes it per-fiscal-year). */
  number: string;
  /** AD ISO issue date. */
  date: string;
  clientName: string;
  clientPAN: string;
  clientPhone: string;
  clientAddress: string;
  lines: DocLine[];
  discountMode: DiscountMode;
  discountPct: number;
  discountFlatAmt: number;
  note: string;
  createdBy: string;
}

/** Reference `challans` collection — a delivery/transport note. VAT never applies. */
export interface Challan extends DocBase {
  status: ChallanStatus;
  fiscalYear: string;
  vehicleNo: string;
  driverName: string;
  routeFrom: string;
  routeTo: string;
  /** Set when a challan is billed onto an invoice (wired in item 15). */
  relatedInvoice: string;
}

/** Reference `quotations` collection. Carries its own `currency` (NPR | GBP). */
export interface Quotation extends DocBase {
  status: QuotationStatus;
  /**
   * Stored on the row like every other document's, though the quotation counter
   * is a single all-time series that ignores it (migration 0038).
   */
  fiscalYear?: string;
  currency: DocCurrency;
  /** AD ISO. */
  validUntil: string;
  terms: string;
  /** Set once converted to an invoice (item 15). */
  relatedInvoice: string;
}

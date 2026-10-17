export type InvoiceStatus = 'open' | 'paid' | 'overdue';
export type OrderStageId = 'sourcing' | 'cutting' | 'finishing' | 'packing';

export interface CustomerOrder {
  product: string;
  meta: string;
  stage: OrderStageId;
}

export interface CustomerInvoice {
  ref: string;
  amount: number;
  /** Still unpaid on this invoice — `amount` minus anything already received. Absent on mock seeds. */
  outstanding?: number;
  due: string;
  status: InvoiceStatus;
}

/**
 * One row of the reference ERP's `customers` table. The editable half is
 * exactly the web app's form (`src/pages/Customers.jsx`) minus `region`, which
 * mobile does not ask for; `since`, `orders` and `invoices` are derived —
 * `since` from `created_at`, the two arrays from the Sales/Billing joins.
 */
export interface Customer {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  address: string;
  notes: string;
  since: string;
  orders: CustomerOrder[];
  invoices: CustomerInvoice[];
}

export type CustomerDraft = Pick<Customer, 'name' | 'contact' | 'email' | 'phone' | 'city' | 'country' | 'address' | 'notes'>;

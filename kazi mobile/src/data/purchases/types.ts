/**
 * Shared `finance_purchases` model — used by both the standalone Purchases
 * screen and the Finance › Purchases tab. Field names mirror the live
 * collection (`expenseId`, `paymentType`, `subtotalNPR`, `vatAmountNPR`,
 * `amountNPR`, `items[]` with `particulars/quantity/unit/rate/amount`).
 */

/** `CASH` in the live docs, "Credit" for a purchase billed to an account. */
export type PaymentType = 'Cash' | 'Bank' | 'Credit';
export type PurchaseStatus = 'paid' | 'partial' | 'unpaid';
export type PurchaseFilter = 'all' | 'unpaid' | 'cash' | 'bank';
export type PurchaseView = 'list' | 'detail';

/**
 * Tri-state, exactly as the reference's VAT Bill select: `true` charges 13%,
 * `false` is a non-VAT bill, `null` is "N/A" — the supplier issued no bill at
 * all. The live column is a nullable boolean and really does hold all three.
 */
export type VatBillState = boolean | null;

/**
 * The reference's own category list (`PurchaseRowGroup.jsx`). Kept verbatim —
 * these are the strings already in the `purchases.category` column, so any
 * shorter list would rewrite live rows to "Other" on the next save.
 */
export const PURCHASE_CATEGORIES = [
  'Office Supplies',
  'Equipment / IT',
  'Equipment',
  'Consumables',
  'Raw Materials',
  'Furniture & Fixtures',
  'Setup / Security',
  'Setup / IT',
  'Setup / Maintenance',
  'Machinery / Assets',
  'Miscellaneous / Events',
  'Miscellaneous',
  'Rent / Lease',
  'Professional Fees',
  'Utilities',
  'Other',
] as const;
export type PurchaseCategory = (typeof PURCHASE_CATEGORIES)[number];

/** Offered units; anything else is typed free-hand behind the "other" chip. */
export const PURCHASE_UNITS = [
  'pcs',
  'kg',
  'm',
  'box',
  'roll',
  'ltr',
  'set',
  'pkt',
  'ft',
  'sqft',
  'hrs',
  'days',
  'lump sum',
] as const;
export type PurchaseUnit = (typeof PURCHASE_UNITS)[number];

/** Banks offered by name; anything else is typed free-hand behind "Other". */
export const PURCHASE_BANKS = ['Nabil Bank', 'Sanima Bank', 'NIC Asia', 'Global IME', 'Standard Chartered'] as const;

/**
 * UK / Nepal arms of the business. A row with no region set belongs to
 * neither and stays visible on both sides — the reference's rule for the
 * records that predate the split.
 */
export const PURCHASE_REGIONS = [
  { id: 'nepal', label: 'Nepal' },
  { id: 'uk', label: 'UK' },
] as const;
export type PurchaseRegion = 'nepal' | 'uk' | '';

export interface PurchaseLine {
  particulars: string;
  quantity: number;
  unit: string;
  rate: number;
  /**
   * `quantity * rate` by default, but independently editable — a lump-sum
   * particular (rent, a professional fee) carries an amount with no
   * meaningful quantity or rate behind it.
   */
  amount: number;
}

export interface PurchaseEntry {
  id: string;
  /** `EXP0NN` — gap-free sequence shared with Finance's Purchases tab. */
  expenseId: string;
  /** Supplier / party name. */
  party: string;
  /** Free text: the live column holds strings outside `PURCHASE_CATEGORIES`. */
  category: string;
  /** `null` is a real live state — dozens of rows carry no payment type. Never coerce it. */
  paymentType: PaymentType | null;
  /** Set when `paymentType === 'Bank'`. */
  bankName?: string;
  /** AD ISO date. */
  date: string;
  vatBill: VatBillState;
  discountAmt: number;
  /**
   * The VAT base. `0` means "no override" and VAT is cut from
   * `subtotal - discount`; a positive value is the taxable portion of a bill
   * that mixes taxable and non-taxable lines.
   */
  taxableAmt: number;
  /** Σ of line amounts. */
  subtotalNPR: number;
  /** 13% of the taxable base when `vatBill === true`, else 0. */
  vatAmountNPR: number;
  /** Grand total = `subtotal - discount + vat`. */
  amountNPR: number;
  items: PurchaseLine[];
  status: PurchaseStatus;
  loggedBy: string;
  region?: PurchaseRegion;
  grn?: string;
}

export interface PurchaseDraftLine {
  /** Render key only — never persisted. Stable across inserts and removals so
   *  a row's `TextInput`s keep their identity when a line above them goes. */
  key: string;
  particulars: string;
  quantity: string;
  unit: string;
  rate: string;
  /** Blank until qty × rate fills it in, or the user types over it. */
  amount: string;
}

export interface PurchaseDraft {
  /** Non-null when editing an existing entry. */
  id: string | null;
  party: string;
  category: string;
  paymentType: PaymentType | null;
  bankName: string;
  date: string;
  vatBill: VatBillState;
  discountAmt: string;
  /** Optional VAT-base override; blank means "use subtotal − discount". */
  taxableAmt: string;
  region: PurchaseRegion;
  status: PurchaseStatus;
  lines: PurchaseDraftLine[];
}

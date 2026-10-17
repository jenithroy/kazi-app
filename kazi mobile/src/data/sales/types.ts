/**
 * The order pipeline, modelled on the reference web app's `Production.jsx`
 * (`src/constants/enums.js` → `ORDER_STAGES`). That page — not the unreachable
 * `OrderManagement.jsx`, which its own header comment calls dead — owns the
 * real named-stage model, so these ten ids are the website's ten stages and the
 * labels below are the verbatim `stage_config` strings the DB stores.
 */
export type StageId =
  | 'received'
  | 'sourcing'
  | 'cutting'
  | 'stitching'
  | 'finishing'
  | 'embellishment'
  | 'quality-check'
  | 'packing'
  | 'shipped'
  | 'delivered';

export type SalesFilter = 'all' | 'late' | StageId;
export type SalesView = 'list' | 'detail';

/** Reference `ORDER_STATUSES`. */
export type OrderStatus = 'active' | 'on-hold' | 'completed' | 'cancelled';

/**
 * Derived, never stored — the reference app computes it from how close the
 * delivery date is (`orderPriority()`), and the `orders` table has no priority
 * column at all. See `priorityOf` in `utils.ts`.
 */
export type OrderPriority = 'urgent' | 'high' | 'normal';

/**
 * An order at the Embellishment stage carries any combination of these rather
 * than moving through them as separate stages (reference `EMBELLISHMENT_TYPES`).
 */
export type Embellishment = 'Buttoning' | 'DTF' | 'Embroidery';

export const EMBELLISHMENT_TYPES: Embellishment[] = ['Buttoning', 'DTF', 'Embroidery'];

/**
 * Stage rail on the Production screen. There is no 'cancelled' entry: closed
 * orders collapse into their own sections under the list instead of taking a
 * chip, the same way Billing handles cancelled invoices.
 */
export type OrdersFilter = 'all' | StageId;

export interface Stage {
  id: StageId;
  /** Verbatim `stage_config` name — what the website reads and writes. */
  label: string;
  /** Compact label for chips and the stepper. */
  short: string;
  dot: string;
  bg: string;
  fg: string;
  bar: string;
}

/** One entry per stage the order has entered — appended on every move (`orders.stageHistory` live). */
export interface StageHistoryEntry {
  stage: StageId;
  at: string;
  /** Who moved it, when the live history records it. */
  by?: string;
  /** A `↩ Reverted to X` entry, which the reference writes on a backwards move. */
  reverted?: boolean;
}

export interface OrderNote {
  id: string;
  body: string;
  at: string;
  who: string;
}

export interface Order {
  id: string;
  ref: string;
  customer: string;
  product: string;
  qty: number;
  stage: StageId;
  status: OrderStatus;
  /** AD ISO date (`orders.date`). */
  orderDate: string;
  /** AD ISO date, or '' — most live rows have none, which is why it drives so little. */
  deliveryDate: string;
  /** "08 Sep" style label off `deliveryDate`, or '' when undated. */
  ship: string;
  /** Days until `deliveryDate`; meaningless unless `ship` is set. */
  shipDays: number;
  /** `quantity × pricePerPc`, or the stored `totalValueNPR` when it disagrees. */
  value: number;
  pricePerPc: number;
  fabricType: string;
  colorway: string;
  /** Grams of fabric per piece. */
  fabricGramsUsed: number;
  fabricCostPerPc: number;
  /** `orders.invoiceRef` — the invoice or challan this order was billed on. */
  invoiceRef: string;
  sampleName: string;
  embellishments: Embellishment[];
  assignedTo: string;
  stageHistory: StageHistoryEntry[];
  notes: OrderNote[];
}

/** The create/edit form's editable slice — numeric fields kept as free text. */
export interface OrderDraft {
  id: string | null;
  ref: string;
  orderDate: string;
  deliveryDate: string;
  customer: string;
  product: string;
  fabricType: string;
  colorway: string;
  sampleName: string;
  qty: string;
  pricePerPc: string;
  fabricGramsUsed: string;
  fabricCostPerPc: string;
  invoiceRef: string;
  assignedTo: string;
  stage: StageId;
  status: OrderStatus;
}

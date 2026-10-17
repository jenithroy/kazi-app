export type StockLevel = 'low' | 'near' | 'ok';

export interface StockItem {
  id: string;
  name: string;
  sku: string;
  supplier: string;
  category: string;
  /**
   * Closing balance — `opening + stockIn - stockUsed`, the same arithmetic the
   * reference page runs in `getClosing`. Never read `opening` as the balance.
   */
  qty: number;
  opening: number;
  stockIn: number;
  stockUsed: number;
  threshold: number;
  unit: string;
  swatch: string;
  swatchFg: string;
  swatchLabel: string;
  lead: string;
  location: string;
  /** Pre-formatted for display; `unitCostNPR` is the number to compute with. */
  cost: string;
  unitCostNPR: number;
  owner: string;
  condition: string;
  /** AD ISO date, or '' when the row has never been touched. */
  lastUpdated: string;
  batches: string;
  /**
   * The material this item is costed against, from `unit_economics.fabricName`
   * for this row's id — the only link the reference app writes between a stock
   * item and the fabric library, and it is by name (`findFabricInLibrary`).
   * '' on every live row today: see the `ItemCost` note on the orphaned
   * `unit_economics` ids.
   */
  fabricName: string;
}

/**
 * A fabric or trim in the materials library — the biggest table on the page
 * (56 live rows) and the only one with photos worth showing.
 *
 * Most fields are sparse: the rows added over the last month are little more
 * than a name and a status, while the older ones carry composition and GSM.
 * Every consumer has to tolerate blanks rather than assume a full record.
 */
export interface Fabric {
  id: string;
  name: string;
  /** 'Fabric' | 'Trim' upstream, but free text and unset on most rows. */
  type: string;
  composition: string;
  supplier: string;
  gsm: number;
  weight: string;
  pricePerMeter: number;
  pricePerKg: number;
  colors: string[];
  /** 'In Stock' | 'Low Stock' | 'Out of Stock', or '' when unset. */
  status: string;
  notes: string;
  /** Public Supabase Storage URL, or '' — 22 of 56 rows have one. */
  swatchUrl: string;
}

/**
 * A costed production step. Nine live rows, each with a long hand-written spec
 * — this is a costing manual, not a workflow tracker, so the description is
 * the point of the record and must be readable in full.
 */
export interface Process {
  id: string;
  name: string;
  category: string;
  description: string;
  notes: string;
  costPerUnit: number;
  leadTimeDays: number;
  minQuantity: number;
}

/** One measurement point on the spec sheet — `{ label: 'Full length', inch: '28' }`. */
export interface TechPackMeasurement {
  label: string;
  inch: string;
}

/** One row of a tech pack's fabric list. */
export interface TechPackFabric {
  fabricName: string;
  description: string;
}

/**
 * A tech pack. The most actively written table on the page, and it holds two
 * generations of record:
 *   - the older batch has no `styleNo`, a real `sizes` array and a
 *     `techPackUrl` document, but no sketches;
 *   - the newer batch has `styleNo` / `designer` / `season` / `market`, a
 *     free-text `specSize` instead of `sizes`, and front/back sketches.
 * Both render, so nothing here is assumed present.
 *
 * The `measurements` grid is empty on all 19 live rows, but the spec-sheet
 * editor writes it, so it is read back rather than dropped.
 */
export interface TechPack {
  id: string;
  styleNo: string;
  name: string;
  productType: string;
  category: string;
  season: string;
  market: string;
  designer: string;
  /** Older records only. */
  sizes: string[];
  /** Newer records only — free text like 'XS,S,M'. */
  specSize: string;
  specDate: string;
  trims: string;
  washCare: string;
  remarks: string;
  notes: string;
  fabrics: TechPackFabric[];
  measurements: TechPackMeasurement[];
  /** Public Storage URLs, or '' / []. */
  frontSketchUrl: string;
  backSketchUrl: string;
  techPackUrl: string;
  images: string[];
}

/**
 * A per-garment cost breakdown, keyed by product code (`kazi1001`).
 *
 * The reference page reads these from `unit_economics` keyed by the inventory
 * row's id, but the Firestore→Postgres migration minted fresh uuids and every
 * one of those 7 rows is now orphaned — they join to neither `inventory_items`
 * nor `patterns`, so the web tab renders blank costs. `product_costs` holds the
 * same numbers keyed by code, and `StockItem.sku` is `#kazi1001`, so mobile
 * links them on the code instead and shows real figures.
 */
export interface ItemCost {
  /** Business key, e.g. `kazi1001` — matches `StockItem.sku` less the `#`. */
  code: string;
  name: string;
  fabric: number;
  labour: number;
  rib: number;
  trims: number;
  others: number;
  /** Upstream's own total, which is null on rows nobody re-saved. Prefer `costTotal()`. */
  total: number | null;
}

/** Real per-item stock ledger (item 19). `in`/`out` add a signed delta; `adjust` sets an absolute count. */
export type StockMoveKind = 'in' | 'out' | 'adjust';

export interface StockMovement {
  id: string;
  itemId: string;
  kind: StockMoveKind;
  /** Signed change applied to `qty`. */
  delta: number;
  /** `qty` after this movement. */
  balance: number;
  reason: string;
  ref: string;
  /** AD ISO date. */
  date: string;
}

export interface StockMovementDraft {
  kind: StockMoveKind;
  qty: string;
  reason: string;
  ref: string;
}

/**
 * Editable free-text detail fields on a stock item (item 19). No lead time:
 * `inventory_items` has no such column, so the field only ever looked saved.
 */
export interface StockDetailsDraft {
  threshold: string;
  location: string;
  cost: string;
  supplier: string;
}

export interface NewStockDraft {
  name: string;
  qty: string;
  threshold: string;
  unit: string;
}

// ---------------------------------------------------------------- library drafts
//
// What the library editors hold while they are open. Numbers are strings here
// on purpose: a half-typed "1" or a cleared field has to survive a keystroke,
// and the reference's own forms keep every numeric input as text until save.

export interface FabricDraft {
  name: string;
  /** 'Fabric' | 'Trim' | '' — the two values the live rows use. */
  type: string;
  composition: string;
  supplier: string;
  gsm: string;
  weight: string;
  pricePerMeter: string;
  pricePerKg: string;
  /** Comma-separated, exactly as the reference's "Available Colors" input. */
  colors: string;
  status: string;
  notes: string;
  /** Public `product-media` URL, or '' — replaced by picking a new photo. */
  swatchUrl: string;
}

export interface ProcessDraft {
  name: string;
  category: string;
  description: string;
  notes: string;
  costPerUnit: string;
  leadTimeDays: string;
  minQuantity: string;
}

export interface TechPackDraft {
  styleNo: string;
  /** "Description of Garment" upstream, and the one required field. */
  name: string;
  productType: string;
  category: string;
  season: string;
  market: string;
  designer: string;
  specSize: string;
  specDate: string;
  sizes: string[];
  measurements: TechPackMeasurement[];
  fabrics: TechPackFabric[];
  washCare: string;
  trims: string;
  remarks: string;
  notes: string;
  frontSketchUrl: string;
  backSketchUrl: string;
  techPackUrl: string;
  images: string[];
}

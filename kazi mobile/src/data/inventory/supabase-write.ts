/**
 * Live inventory writers — match the reference web app's model:
 *   - `inventory` doc holds a FIXED `openingStock` (opening balance); it is never
 *     touched by a movement.
 *   - running quantity = `openingStock + Σ(stock_movements)` — so every stock
 *     movement is a new `stock_movements` doc (`{ itemId, date, qty, direction,
 *     source, note, amountNPR, createdBy, createdAt }`), exactly like
 *     `utils/stockLedger.logStockMovement` in the website.
 *
 * The library tables (`fabrics`/`processes`/`patterns`) are written from here
 * too, by the in-place editors on the Inventory tabs. They are the reference
 * ERP's own rows and RLS gates them on the `library` section, not `inventory`.
 * `product_costs` stays read-only — it is a costing sheet, edited on the web.
 *
 * The mobile reader derives `qty` as `openingStock + stockIn - stockUsed` plus
 * the net of that item's `stock_movements`, so a movement posted here moves the
 * number on the next refetch.
 */

import { collection, doc, getDoc, getDocs, query, where , getDb } from '@/lib/supabase/collections';

import { num } from '@/lib/data/normalise';
import { createDocument, patchDocument, removeDocument } from '@/lib/supabase/write';
import { getActor } from '@/data/notifications/actor';

import { colorList } from './library';
import type { FabricDraft, ProcessDraft, StockItem, StockMoveKind, StockMovement, TechPackDraft } from './types';

const INVENTORY = 'inventory';
const MOVEMENTS = 'stock_movements';
const FABRICS = 'fabrics';
const PROCESSES = 'processes';
const PATTERNS = 'patterns';

/** A cleared cost field is "unset", not zero. */
function costNumber(cost: string | undefined): number | null | undefined {
  if (cost === undefined) return undefined;
  if (!cost.trim()) return null;
  const n = parseFloat(cost.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Editable `inventory` fields (excludes `openingStock` — that only lands at create). */
function detailFields(s: Partial<StockItem>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (s.name !== undefined) out.item = s.name;
  if (s.sku !== undefined) out.itemId = s.sku;
  if (s.supplier !== undefined) out.supplier = s.supplier;
  if (s.unit !== undefined) out.unit = s.unit;
  if (s.location !== undefined) out.location = s.location;
  if (s.threshold !== undefined) out.minLevel = s.threshold;
  if (s.category !== undefined) out.category = s.category;
  if (s.owner !== undefined) out.owner = s.owner;
  if (s.condition !== undefined) out.condition = s.condition;
  const cost = costNumber(s.cost);
  if (cost !== undefined) out.unitCostNPR = cost;
  return out;
}

export async function addStockItem(item: StockItem): Promise<void> {
  const fields = detailFields(item);
  // A field the add sheet does not ask for stays unset. Inventing "Unassigned"
  // or a category puts a value into the web ERP that nobody chose.
  for (const key of Object.keys(fields)) if (fields[key] === '') fields[key] = null;
  await createDocument(INVENTORY, {
    ...fields,
    openingStock: item.qty, // opening balance at creation only
    createdBy: getActor()?.name ?? 'kazi-mobile',
  });
}

export async function updateStockItem(id: string, updates: Partial<StockItem>): Promise<void> {
  const fields = detailFields(updates);
  if (Object.keys(fields).length > 0) await patchDocument(INVENTORY, id, fields);
}

/** Sum an item's existing movements so an absolute "adjust" can be posted as a delta. */
async function runningQty(itemDocId: string): Promise<number> {
  let opening = 0;
  let net = 0;
  try {
    const invDoc = await getDoc(doc(getDb(), INVENTORY, itemDocId));
    const row = invDoc.data() as Record<string, unknown> | undefined;
    // The same closing balance the reader shows, or the delta lands on a number
    // nobody is looking at.
    opening = num(row?.openingStock) + num(row?.stockIn) - num(row?.stockUsed);
  } catch {
    opening = 0;
  }
  const movSnap = await getDocs(query(collection(getDb(), MOVEMENTS), where('itemId', '==', itemDocId)));
  movSnap.docs.forEach((d) => {
    const m = d.data() as Record<string, unknown>;
    net += (String(m.direction) === 'in' ? 1 : -1) * num(m.qty);
  });
  return opening + net;
}

async function logMovement(itemId: string, qty: number, direction: 'in' | 'out', note: string, source = 'manual') {
  return createDocument(MOVEMENTS, {
    itemId,
    date: new Date().toISOString().slice(0, 10),
    qty: Math.abs(qty),
    direction,
    source,
    sourceId: null,
    note,
    amountNPR: 0,
    createdBy: getActor()?.name ?? 'kazi-mobile',
  });
}

/**
 * `stock_movements` rows posted by hand from this app, so Undo can take them back
 * out. A movement is an insert, so its real inverse is removing the row — posting
 * a compensating one would leave the web ERP's ledger showing a correction nobody
 * made. Purchases' auto stock-in is deliberately not tracked: nothing on the
 * Inventory screen offers to undo it.
 */
const posted = new Set<string>();

export async function postStockMovement(input: {
  itemId: string;
  kind: StockMoveKind;
  qty: number;
  reason: string;
  ref: string;
}): Promise<void> {
  if (input.kind === 'in') {
    posted.add(await logMovement(input.itemId, input.qty, 'in', input.reason || 'Stock in'));
  } else if (input.kind === 'out') {
    posted.add(await logMovement(input.itemId, input.qty, 'out', input.reason || 'Stock out'));
  } else {
    // absolute count → post the compensating movement to reach it
    const current = await runningQty(input.itemId);
    const delta = input.qty - current;
    if (delta !== 0) {
      posted.add(await logMovement(input.itemId, delta, delta > 0 ? 'in' : 'out', input.reason || 'Count adjustment'));
    }
  }
}

/**
 * Undo back to `previousMovements` — every row this app posted since that
 * snapshot is deleted, so the on-hand figure really goes back and not just on
 * screen. Rows the snapshot already contained are left alone.
 */
export async function restoreInventory(previousMovements: StockMovement[] = []): Promise<void> {
  const keep = new Set(previousMovements.map((m) => m.id));
  for (const id of [...posted]) {
    if (keep.has(id)) continue;
    await removeDocument(MOVEMENTS, id);
    posted.delete(id);
  }
}

export async function adjustStockByName(name: string, delta: number): Promise<void> {
  const snap = await getDocs(query(collection(getDb(), INVENTORY), where('item', '==', name.trim())));
  const target = snap.docs[0];
  if (!target) return;
  await logMovement(
    target.id,
    delta,
    delta >= 0 ? 'in' : 'out',
    delta >= 0 ? 'Auto stock-in · purchase' : 'Auto stock-out',
    'purchase',
  );
}

// ------------------------------------------------------------------ library
//
// Three tables, one shape of writer each: a draft plus an id saves in place, a
// draft with no id inserts. Column names come out of `@/lib/supabase/write`'s
// camelCase → snake_case mapping, which the `fabrics` / `processes` / `patterns`
// specs there already carry.
//
// `region` is deliberately never written. It is the web app's UK/Nepal split,
// null on all 56 fabrics and all 9 processes, and mobile has no region switch —
// writing it would be inventing a value, not saving one.

/** '' → null, so a cleared number lands as "unset" rather than 0. */
function numberOrNull(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** For the NOT NULL numeric columns on `processes`, which have no "unset". */
function numberOrZero(text: string): number {
  return numberOrNull(text) ?? 0;
}

/** '' → null for text columns, so a blank field doesn't store an empty string. */
function textOrNull(text: string): string | null {
  return text.trim() || null;
}

const stamp = () => new Date().toISOString();

function fabricRow(draft: FabricDraft): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    type: textOrNull(draft.type),
    composition: textOrNull(draft.composition),
    supplier: textOrNull(draft.supplier),
    gsm: numberOrNull(draft.gsm),
    weight: textOrNull(draft.weight),
    pricePerMeter: numberOrNull(draft.pricePerMeter),
    pricePerKg: numberOrNull(draft.pricePerKg),
    availableColors: colorList(draft.colors),
    status: textOrNull(draft.status),
    notes: textOrNull(draft.notes),
    swatchImageUrl: textOrNull(draft.swatchUrl),
    updatedAt: stamp(),
  };
}

/** Returns the row id — the one a create needs so the list can select it. */
export async function saveFabric(id: string | null, draft: FabricDraft): Promise<string> {
  if (id) {
    await patchDocument(FABRICS, id, fabricRow(draft));
    return id;
  }
  return createDocument(FABRICS, fabricRow(draft));
}

export async function deleteFabric(id: string): Promise<void> {
  await removeDocument(FABRICS, id);
}

function processRow(draft: ProcessDraft): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    category: textOrNull(draft.category),
    description: textOrNull(draft.description),
    notes: textOrNull(draft.notes),
    // These three are NOT NULL with defaults, so a blank field is 0, not null.
    costPerUnit: numberOrZero(draft.costPerUnit),
    leadTimeDays: numberOrZero(draft.leadTimeDays),
    minQuantity: numberOrZero(draft.minQuantity),
    updatedAt: stamp(),
  };
}

export async function saveProcess(id: string | null, draft: ProcessDraft): Promise<string> {
  if (id) {
    await patchDocument(PROCESSES, id, processRow(draft));
    return id;
  }
  return createDocument(PROCESSES, processRow(draft));
}

export async function deleteProcess(id: string): Promise<void> {
  await removeDocument(PROCESSES, id);
}

function techPackRow(draft: TechPackDraft): Record<string, unknown> {
  return {
    styleNo: textOrNull(draft.styleNo),
    name: draft.name.trim(),
    productType: textOrNull(draft.productType),
    category: textOrNull(draft.category),
    season: textOrNull(draft.season),
    market: textOrNull(draft.market),
    designerName: textOrNull(draft.designer),
    sizesAvailable: draft.sizes,
    specSize: textOrNull(draft.specSize),
    // A `date` column: an empty string is a type error, not an empty date.
    specDate: textOrNull(draft.specDate),
    trims: textOrNull(draft.trims),
    washCare: textOrNull(draft.washCare),
    remarks: textOrNull(draft.remarks),
    notes: textOrNull(draft.notes),
    // Both jsonb, and both NOT NULL — an emptied grid is [], never null.
    measurements: draft.measurements.filter((m) => m.label.trim()),
    fabricRows: draft.fabrics.filter((f) => f.fabricName.trim() || f.description.trim()),
    frontSketchUrl: textOrNull(draft.frontSketchUrl),
    backSketchUrl: textOrNull(draft.backSketchUrl),
    techPackUrl: textOrNull(draft.techPackUrl),
    techPackImages: draft.images,
    updatedAt: stamp(),
  };
}

export async function saveTechPack(id: string | null, draft: TechPackDraft): Promise<string> {
  if (id) {
    await patchDocument(PATTERNS, id, techPackRow(draft));
    return id;
  }
  return createDocument(PATTERNS, techPackRow(draft));
}

export async function deleteTechPack(id: string): Promise<void> {
  await removeDocument(PATTERNS, id);
}

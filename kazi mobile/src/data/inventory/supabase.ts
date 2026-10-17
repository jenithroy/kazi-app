/**
 * Live inventory readers. The reference page is one screen over eight tables;
 * mobile reads five of them.
 *
 * Live shapes (compat views, sampled 2026-09-07):
 *   inventory      { itemId ("#kazi1009"), item, category, unit, supplier, location,
 *                    openingStock, stockIn, stockUsed, minLevel, unitCostNPR, owner,
 *                    condition, sizeRows, damageLog, lastUpdated, createdBy, createdAt }
 *   fabrics        { name, type, composition, supplier, gsm, weight, price_per_meter,
 *                    pricePerKg, available_colors[], status, notes, swatchImageUrl }
 *   processes      { name, category, description, notes, cost_per_unit,
 *                    lead_time_days, min_quantity }
 *   patterns       { styleNo, name, product_type, category, season, market, designerName,
 *                    sizes_available[], specSize, specDate, trims, washCare, remarks,
 *                    notes, measurements, fabricRows, frontSketchUrl, backSketchUrl,
 *                    tech_pack_url, tech_pack_images[] }
 *   product_costs  { code, name, fabric, labour, rib, trims, others, total }
 *
 * Image fields are public Supabase Storage URLs now, not the base64 blobs the
 * pre-migration data held, so they are read and rendered directly.
 *
 * `stock_movements` is the per-item ledger both apps append to. The row's own
 * `openingStock`/`stockIn`/`stockUsed` are never touched by a movement, so
 * on-hand is that closing balance PLUS the net of the item's movements — read
 * one without the other and a posted adjustment never moves the number.
 *
 * `unit_economics` is read for one field only: `fabricName`, the reference's
 * sole stock-item → fabric-library link (matched by name, `findFabricInLibrary`).
 * Its cost figures are not read — every live row is orphaned by the migration,
 * so the same numbers come from `product_costs` keyed by code. See `ItemCost`.
 *
 * Not read, on purpose:
 *   - `samples` — 0 live rows; the tab is not built (see the module README note).
 */

import { num, str } from '@/lib/data/normalise';
import { readCollection, type DocData } from '@/lib/supabase/read';

import type {
  Fabric,
  ItemCost,
  Process,
  StockItem,
  StockMovement,
  TechPack,
  TechPackFabric,
  TechPackMeasurement,
} from './types';

/** Postgres numerics arrive as strings through PostgREST; `num` handles both. */
function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x).trim()).filter(Boolean);
}

function isoDate(v: unknown): string {
  const s = str(v).trim();
  return s ? s.slice(0, 10) : '';
}

function mapStockDoc(id: string, d: DocData): StockItem | null {
  const name = str(d.item).trim();
  if (!name) return null;
  const category = str(d.category).trim();
  const cost = num(d.unitCostNPR);
  const opening = num(d.openingStock);
  const stockIn = num(d.stockIn);
  const stockUsed = num(d.stockUsed);
  return {
    id,
    name,
    sku: str(d.itemId).trim(),
    supplier: str(d.supplier).trim(),
    category,
    // The reference computes the balance as opening + in − out on every row it
    // renders. Reading `openingStock` alone was mobile's old bug: invisible
    // while every live row has in = out = 0, and silently wrong the moment one
    // does not.
    qty: opening + stockIn - stockUsed,
    opening,
    stockIn,
    stockUsed,
    threshold: num(d.minLevel),
    unit: str(d.unit).trim() || 'pcs',
    swatch: '#EDEFEC',
    swatchFg: '#3B4F47',
    swatchLabel: (category || name).slice(0, 3).toUpperCase(),
    lead: '',
    location: str(d.location).trim(),
    // Raw digits, not a formatted amount: this is what the edit sheet puts in
    // its input and parses back, and display goes through `money()` instead.
    cost: cost ? String(cost) : '',
    unitCostNPR: cost,
    owner: str(d.owner).trim(),
    condition: str(d.condition).trim(),
    lastUpdated: isoDate(d.lastUpdated),
    batches: '',
    fabricName: '',
  };
}

/**
 * `unit_economics` keeps its whole record in a `data` jsonb blob, keyed by the
 * inventory (or pattern) row's id. Only the material name is wanted here.
 */
async function fetchFabricNames(): Promise<Map<string, string>> {
  const rows = await readCollection('unit_economics', (id, d) => {
    const data = d.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const fabricName = str((data as DocData).fabricName).trim();
    return fabricName ? ([id, fabricName] as const) : null;
  });
  return new Map(rows);
}

export async function fetchStock(): Promise<StockItem[]> {
  const [items, movements, fabricNames] = await Promise.all([
    readCollection('inventory', mapStockDoc),
    fetchMovementRows(),
    fetchFabricNames(),
  ]);
  const net = new Map<string, number>();
  for (const m of movements) net.set(m.itemId, (net.get(m.itemId) ?? 0) + m.delta);
  return items.map((s) => {
    const delta = net.get(s.id) ?? 0;
    const fabricName = fabricNames.get(s.id) ?? '';
    if (!delta && !fabricName) return s;
    return { ...s, qty: s.qty + delta, fabricName };
  });
}

function mapFabricDoc(id: string, d: DocData): Fabric | null {
  const name = str(d.name).trim();
  if (!name) return null;
  return {
    id,
    name,
    type: str(d.type).trim(),
    composition: str(d.composition).trim(),
    supplier: str(d.supplier).trim(),
    gsm: num(d.gsm),
    weight: str(d.weight).trim(),
    pricePerMeter: num(d.price_per_meter),
    pricePerKg: num(d.pricePerKg),
    colors: strList(d.available_colors),
    status: str(d.status).trim(),
    notes: str(d.notes).trim(),
    swatchUrl: str(d.swatchImageUrl).trim(),
  };
}

export async function fetchFabrics(): Promise<Fabric[]> {
  const rows = await readCollection('fabrics', mapFabricDoc);
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

function mapProcessDoc(id: string, d: DocData): Process | null {
  const name = str(d.name).trim();
  if (!name) return null;
  return {
    id,
    name,
    category: str(d.category).trim(),
    description: str(d.description).trim(),
    notes: str(d.notes).trim(),
    costPerUnit: num(d.cost_per_unit),
    leadTimeDays: num(d.lead_time_days),
    minQuantity: num(d.min_quantity),
  };
}

export async function fetchProcesses(): Promise<Process[]> {
  const rows = await readCollection('processes', mapProcessDoc);
  // Dearest step first: the list doubles as a price list, and what a job costs
  // is the reason anyone opens it.
  return rows.sort((a, b) => b.costPerUnit - a.costPerUnit);
}

function mapFabricRows(v: unknown): TechPackFabric[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((r) => {
      const row = (r ?? {}) as DocData;
      return { fabricName: str(row.fabricName).trim(), description: str(row.description).trim() };
    })
    .filter((r) => r.fabricName || r.description);
}

function mapMeasurements(v: unknown): TechPackMeasurement[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((r) => {
      const row = (r ?? {}) as DocData;
      return { label: str(row.label).trim(), inch: str(row.inch).trim() };
    })
    .filter((m) => m.label || m.inch);
}

function mapPatternDoc(id: string, d: DocData): TechPack | null {
  const name = str(d.name).trim();
  if (!name) return null;
  return {
    id,
    styleNo: str(d.styleNo).trim(),
    name,
    productType: str(d.product_type).trim(),
    category: str(d.category).trim(),
    season: str(d.season).trim(),
    market: str(d.market).trim(),
    designer: str(d.designerName).trim(),
    sizes: strList(d.sizes_available),
    specSize: str(d.specSize).trim(),
    specDate: isoDate(d.specDate),
    trims: str(d.trims).trim(),
    washCare: str(d.washCare).trim(),
    remarks: str(d.remarks).trim(),
    notes: str(d.notes).trim(),
    fabrics: mapFabricRows(d.fabricRows),
    measurements: mapMeasurements(d.measurements),
    frontSketchUrl: str(d.frontSketchUrl).trim(),
    backSketchUrl: str(d.backSketchUrl).trim(),
    techPackUrl: str(d.tech_pack_url).trim(),
    images: strList(d.tech_pack_images),
  };
}

export async function fetchTechPacks(): Promise<TechPack[]> {
  const rows = await readCollection('patterns', mapPatternDoc);
  // Newest first — a tech pack is a working document, and the one being cut
  // this week is the one someone is looking for.
  return rows.sort((a, b) => (b.specDate || '').localeCompare(a.specDate || ''));
}

function mapCostDoc(id: string, d: DocData): ItemCost | null {
  // `product_costs` is keyed by `code`, not a generated id, so the view's `id`
  // and `code` are the same value — take the explicit column and fall back.
  const code = (str(d.code).trim() || id).trim();
  if (!code) return null;
  const total = d.total === null || d.total === undefined ? null : num(d.total);
  return {
    code,
    name: str(d.name).trim(),
    fabric: num(d.fabric),
    labour: num(d.labour),
    rib: num(d.rib),
    trims: num(d.trims),
    others: num(d.others),
    total,
  };
}

export async function fetchItemCosts(): Promise<ItemCost[]> {
  const rows = await readCollection('product_costs', mapCostDoc);
  return rows.sort((a, b) => a.code.localeCompare(b.code));
}

/** `direction` + `qty` → the signed delta the app works in. `balance` is filled later. */
function mapMovementDoc(id: string, d: DocData): StockMovement | null {
  const itemId = str(d.itemId).trim();
  if (!itemId) return null;
  const out = str(d.direction).trim().toLowerCase() === 'out';
  const qty = Math.abs(num(d.qty));
  return {
    id,
    itemId,
    kind: out ? 'out' : 'in',
    delta: out ? -qty : qty,
    balance: 0,
    reason: str(d.note).trim(),
    ref: str(d.sourceId).trim(),
    date: isoDate(d.date),
  };
}

/** Oldest first, so a running balance can be accumulated over them. */
async function fetchMovementRows(): Promise<StockMovement[]> {
  const rows = await readCollection('stock_movements', mapMovementDoc);
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchMovements(): Promise<StockMovement[]> {
  const [movements, items] = await Promise.all([
    fetchMovementRows(),
    readCollection('inventory', mapStockDoc),
  ]);
  // `balance` is the on-hand AFTER a movement, so it accumulates from the row's
  // own closing balance — which is what `mapStockDoc` returns before movements.
  const running = new Map(items.map((s) => [s.id, s.qty]));
  return movements.map((m) => {
    const balance = (running.get(m.itemId) ?? 0) + m.delta;
    running.set(m.itemId, balance);
    return { ...m, balance };
  });
}

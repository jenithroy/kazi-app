import { simulateLatency } from '../mock/delay';
import { fabricFromDraft, processFromDraft, techPackFromDraft } from './library';
import { seedFabrics, seedItemCosts, seedMovements, seedProcesses, seedStock, seedTechPacks } from './mock';
import type {
  Fabric,
  FabricDraft,
  ItemCost,
  Process,
  ProcessDraft,
  StockItem,
  StockMoveKind,
  StockMovement,
  TechPack,
  TechPackDraft,
} from './types';

let stockDb: StockItem[] = [...seedStock];
let movementsDb: StockMovement[] = seedMovements.map((m) => ({ ...m }));
// The library is editable now, so these are stores rather than the constants
// they used to be returned as directly.
let fabricsDb: Fabric[] = seedFabrics.map((f) => ({ ...f }));
let processesDb: Process[] = seedProcesses.map((p) => ({ ...p }));
let techPacksDb: TechPack[] = seedTechPacks.map((t) => ({ ...t }));

/**
 * Set an item's closing balance. `qty` is derived from opening + in − used, so
 * writing it alone would leave the three columns contradicting the total the
 * Stock tab shows beside them — book the change as movement instead.
 */
function applyBalance(item: StockItem, balance: number): StockItem {
  const delta = balance - item.qty;
  return {
    ...item,
    qty: balance,
    stockIn: delta > 0 ? item.stockIn + delta : item.stockIn,
    stockUsed: delta < 0 ? item.stockUsed - delta : item.stockUsed,
    lastUpdated: new Date().toISOString().slice(0, 10),
  };
}

export async function fetchStock(): Promise<StockItem[]> {
  await simulateLatency();
  return [...stockDb];
}

export async function fetchFabrics(): Promise<Fabric[]> {
  await simulateLatency(300);
  return [...fabricsDb];
}

export async function fetchProcesses(): Promise<Process[]> {
  await simulateLatency(280);
  return [...processesDb];
}

export async function fetchTechPacks(): Promise<TechPack[]> {
  await simulateLatency(300);
  return [...techPacksDb];
}

export async function fetchItemCosts(): Promise<ItemCost[]> {
  await simulateLatency(260);
  return seedItemCosts;
}

export async function fetchMovements(): Promise<StockMovement[]> {
  await simulateLatency(250);
  return [...movementsDb];
}

export async function addStockItem(item: StockItem): Promise<void> {
  await simulateLatency(300);
  stockDb = [item, ...stockDb];
}

export async function updateStockItem(id: string, updates: Partial<StockItem>): Promise<void> {
  await simulateLatency(220);
  stockDb = stockDb.map((s) => (s.id === id ? { ...s, ...updates } : s));
}

/**
 * Post a stock movement (item 19). `in` / `out` apply a signed `qty`; `adjust`
 * sets the on-hand count to `qty` absolute. Updates the item's `qty` and
 * appends a ledger row with the running balance. Returns the new movement.
 */
export async function postStockMovement(input: {
  itemId: string;
  kind: StockMoveKind;
  qty: number;
  reason: string;
  ref: string;
}): Promise<StockMovement | null> {
  await simulateLatency(240);
  const item = stockDb.find((s) => s.id === input.itemId);
  if (!item) return null;
  const delta = input.kind === 'in' ? input.qty : input.kind === 'out' ? -input.qty : input.qty - item.qty;
  const balance = Math.max(0, item.qty + delta);
  stockDb = stockDb.map((s) => (s.id === item.id ? applyBalance(s, balance) : s));
  const movement: StockMovement = {
    id: `m${Date.now()}`,
    itemId: item.id,
    kind: input.kind,
    delta,
    balance,
    reason: input.reason || (input.kind === 'in' ? 'Stock in' : input.kind === 'out' ? 'Stock out' : 'Count adjustment'),
    ref: input.ref,
    date: new Date().toISOString().slice(0, 10),
  };
  movementsDb = [movement, ...movementsDb];
  return movement;
}

export async function restoreInventory(prevStock: StockItem[], prevMovements: StockMovement[]): Promise<void> {
  await simulateLatency(150);
  stockDb = [...prevStock];
  movementsDb = [...prevMovements];
}

/**
 * Bump an item's quantity by `delta` (negative to issue). Matched
 * case-insensitively by name — used by Purchases auto stock-in.
 * Returns the matched item's name, or null if nothing matched.
 */
export async function adjustStockByName(name: string, delta: number): Promise<string | null> {
  await simulateLatency(150);
  const key = name.trim().toLowerCase();
  const match = stockDb.find((s) => s.name.toLowerCase() === key);
  if (!match) return null;
  const balance = Math.max(0, match.qty + delta);
  stockDb = stockDb.map((s) => (s.id === match.id ? applyBalance(s, balance) : s));
  movementsDb = [
    {
      id: `m${Date.now()}`,
      itemId: match.id,
      kind: delta >= 0 ? 'in' : 'out',
      delta,
      balance,
      reason: delta >= 0 ? 'Auto stock-in · purchase' : 'Auto stock-out',
      ref: 'Purchases',
      date: new Date().toISOString().slice(0, 10),
    },
    ...movementsDb,
  ];
  return match.name;
}

// ------------------------------------------------------------------ library
//
// One save per table, insert-or-update on whether an id came in, mirroring the
// live writers. Each returns the row id so a create can be selected afterwards.

const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}`;

export async function saveFabric(id: string | null, draft: FabricDraft): Promise<string> {
  await simulateLatency(260);
  const rowId = id ?? newId('f');
  const row = fabricFromDraft(rowId, draft);
  fabricsDb = id ? fabricsDb.map((f) => (f.id === id ? row : f)) : [row, ...fabricsDb];
  return rowId;
}

export async function deleteFabric(id: string): Promise<void> {
  await simulateLatency(200);
  fabricsDb = fabricsDb.filter((f) => f.id !== id);
}

export async function saveProcess(id: string | null, draft: ProcessDraft): Promise<string> {
  await simulateLatency(260);
  const rowId = id ?? newId('p');
  const row = processFromDraft(rowId, draft);
  processesDb = id ? processesDb.map((p) => (p.id === id ? row : p)) : [row, ...processesDb];
  return rowId;
}

export async function deleteProcess(id: string): Promise<void> {
  await simulateLatency(200);
  processesDb = processesDb.filter((p) => p.id !== id);
}

export async function saveTechPack(id: string | null, draft: TechPackDraft): Promise<string> {
  await simulateLatency(260);
  const rowId = id ?? newId('t');
  const row = techPackFromDraft(rowId, draft);
  techPacksDb = id ? techPacksDb.map((t) => (t.id === id ? row : t)) : [row, ...techPacksDb];
  return rowId;
}

export async function deleteTechPack(id: string): Promise<void> {
  await simulateLatency(200);
  techPacksDb = techPacksDb.filter((t) => t.id !== id);
}

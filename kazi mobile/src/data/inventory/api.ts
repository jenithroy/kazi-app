/**
 * Data-source selector for the inventory module.
 *   reads  → Supabase when configured (a failed read throws; no mock fallback)
 *   writes → Supabase when configured, mirrored into the mock (see `liveWrite`)
 *
 * Writes hit the reference ERP's own `inventory` collection. A stock movement is
 * a new `stock_movements` row — `openingStock` is never patched — and the reader
 * sums those rows into on-hand. Undo deletes the rows the last post created.
 *
 * Fabrics, processes and tech packs are read AND written — the Inventory tabs
 * edit them in place. Item costs stay read-only: that tab is a costing sheet
 * kept on the web.
 */

import { isSupabaseConfigured } from '@/lib/supabase';
import { liveRead } from '@/lib/supabase/read';
import { liveWrite } from '@/lib/supabase/write';

import * as live from './supabase';
import * as writeLive from './supabase-write';
import * as mock from './mock-api';
import type { FabricDraft, ProcessDraft, StockItem, StockMoveKind, StockMovement, TechPackDraft } from './types';

export const fetchStock = isSupabaseConfigured
  ? liveRead('inventory/stock', live.fetchStock)
  : mock.fetchStock;

export const fetchFabrics = isSupabaseConfigured
  ? liveRead('inventory/fabrics', live.fetchFabrics)
  : mock.fetchFabrics;

export const fetchProcesses = isSupabaseConfigured
  ? liveRead('inventory/processes', live.fetchProcesses)
  : mock.fetchProcesses;

export const fetchTechPacks = isSupabaseConfigured
  ? liveRead('inventory/techPacks', live.fetchTechPacks)
  : mock.fetchTechPacks;

export const fetchItemCosts = isSupabaseConfigured
  ? liveRead('inventory/itemCosts', live.fetchItemCosts)
  : mock.fetchItemCosts;

export const fetchMovements = isSupabaseConfigured
  ? liveRead('inventory/movements', live.fetchMovements)
  : mock.fetchMovements;

export const addStockItem = liveWrite('inventory/addStockItem', writeLive.addStockItem, mock.addStockItem);
export const updateStockItem = liveWrite('inventory/updateStockItem', writeLive.updateStockItem, mock.updateStockItem);

export const postStockMovement = liveWrite(
  'inventory/postStockMovement',
  (input: { itemId: string; kind: StockMoveKind; qty: number; reason: string; ref: string }) =>
    writeLive.postStockMovement(input),
  mock.postStockMovement,
);

export const restoreInventory = liveWrite(
  'inventory/restoreInventory',
  (_prevStock: StockItem[], prevMovements: StockMovement[]) => writeLive.restoreInventory(prevMovements),
  mock.restoreInventory,
);

export const adjustStockByName = liveWrite(
  'inventory/adjustStockByName',
  (name: string, delta: number) => writeLive.adjustStockByName(name, delta),
  mock.adjustStockByName,
);

export const saveFabric = liveWrite(
  'inventory/saveFabric',
  (id: string | null, draft: FabricDraft) => writeLive.saveFabric(id, draft),
  mock.saveFabric,
);
export const deleteFabric = liveWrite('inventory/deleteFabric', writeLive.deleteFabric, mock.deleteFabric);

export const saveProcess = liveWrite(
  'inventory/saveProcess',
  (id: string | null, draft: ProcessDraft) => writeLive.saveProcess(id, draft),
  mock.saveProcess,
);
export const deleteProcess = liveWrite('inventory/deleteProcess', writeLive.deleteProcess, mock.deleteProcess);

export const saveTechPack = liveWrite(
  'inventory/saveTechPack',
  (id: string | null, draft: TechPackDraft) => writeLive.saveTechPack(id, draft),
  mock.saveTechPack,
);
export const deleteTechPack = liveWrite('inventory/deleteTechPack', writeLive.deleteTechPack, mock.deleteTechPack);

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notify } from '@/data/notifications/notify';

import { inventoryKeys } from './keys';
import * as api from './api';
import { fabricFromDraft, processFromDraft, techPackFromDraft } from './library';
import type {
  Fabric,
  FabricDraft,
  Process,
  ProcessDraft,
  StockItem,
  StockMoveKind,
  StockMovement,
  TechPack,
  TechPackDraft,
} from './types';

function lowStockNotify(item: StockItem | undefined, projectedQty: number) {
  if (!item || projectedQty > item.threshold) return;
  notify({
    eventType: 'inventory.low_stock',
    section: 'inventory',
    targetRef: item.sku,
    payload: { label: item.name, count: projectedQty },
  });
}

export function useStock() {
  return useQuery({ queryKey: inventoryKeys.stock(), queryFn: api.fetchStock });
}

export function useFabrics() {
  return useQuery({ queryKey: inventoryKeys.fabrics(), queryFn: api.fetchFabrics });
}

export function useProcesses() {
  return useQuery({ queryKey: inventoryKeys.processes(), queryFn: api.fetchProcesses });
}

export function useTechPacks() {
  return useQuery({ queryKey: inventoryKeys.techPacks(), queryFn: api.fetchTechPacks });
}

export function useItemCosts() {
  return useQuery({ queryKey: inventoryKeys.itemCosts(), queryFn: api.fetchItemCosts });
}

export function useStockMovements() {
  return useQuery({ queryKey: inventoryKeys.movements(), queryFn: api.fetchMovements });
}

/** Roll the cached list back to the snapshot taken before an optimistic write. */
function rollback<T>(queryClient: ReturnType<typeof useQueryClient>, key: readonly unknown[], previous: T[] | undefined) {
  queryClient.setQueryData<T[]>(key, previous);
}

export function useAddStockItem() {
  const queryClient = useQueryClient();
  const key = inventoryKeys.stock();
  return useMutation<void, Error, StockItem, { previous?: StockItem[] }>({
    mutationFn: (item: StockItem) => api.addStockItem(item),
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<StockItem[]>(key);
      queryClient.setQueryData<StockItem[]>(key, (old) => [item, ...(old ?? [])]);
      return { previous };
    },
    onError: (_err, _item, context) => rollback<StockItem>(queryClient, key, context?.previous),
    onSuccess: (_data, item) => {
      notify({ eventType: 'inventory.item_added', section: 'inventory', targetRef: item.sku, payload: { label: item.name } });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Editable detail fields — threshold / location / cost / supplier (item 19). */
export function useUpdateStockItem() {
  const queryClient = useQueryClient();
  const key = inventoryKeys.stock();
  return useMutation<void, Error, { id: string; updates: Partial<StockItem> }, { previous?: StockItem[] }>({
    mutationFn: ({ id, updates }) => api.updateStockItem(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<StockItem[]>(key);
      queryClient.setQueryData<StockItem[]>(key, (old) =>
        (old ?? []).map((s) => (s.id === id ? { ...s, ...updates } : s)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => rollback<StockItem>(queryClient, key, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Post a stock-in / stock-out / adjustment; updates `qty` + appends a ledger row (item 19). */
export function usePostStockMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemId: string; kind: StockMoveKind; qty: number; reason: string; ref: string }) =>
      api.postStockMovement(input),
    onSuccess: (_data, { itemId, kind, qty }) => {
      const item = queryClient.getQueryData<StockItem[]>(inventoryKeys.stock())?.find((s) => s.id === itemId);
      notify({
        eventType: 'inventory.adjusted',
        section: 'inventory',
        targetRef: item?.sku,
        payload: { label: item?.name, count: qty },
      });
      const delta = kind === 'out' ? -qty : kind === 'in' ? qty : 0;
      if (item && delta !== 0) lowStockNotify(item, Math.max(0, item.qty + delta));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.stock() });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.movements() });
    },
  });
}

export function useRestoreInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stock, movements }: { stock: StockItem[]; movements: StockMovement[] }) =>
      api.restoreInventory(stock, movements),
    onMutate: async ({ stock, movements }) => {
      await queryClient.cancelQueries({ queryKey: inventoryKeys.stock() });
      queryClient.setQueryData<StockItem[]>(inventoryKeys.stock(), stock);
      queryClient.setQueryData<StockMovement[]>(inventoryKeys.movements(), movements);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.stock() });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.movements() });
    },
  });
}

/** Auto stock-in / stock-out by item name. Used by Purchases when a line matches an inventory item. */
export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, delta }: { name: string; delta: number }) => api.adjustStockByName(name, delta),
    onMutate: async ({ name, delta }) => {
      await queryClient.cancelQueries({ queryKey: inventoryKeys.stock() });
      const key = name.trim().toLowerCase();
      queryClient.setQueryData<StockItem[]>(inventoryKeys.stock(), (old) =>
        (old ?? []).map((s) => (s.name.toLowerCase() === key ? { ...s, qty: Math.max(0, s.qty + delta) } : s)),
      );
    },
    onSuccess: (_data, { name, delta }) => {
      const key = name.trim().toLowerCase();
      const item = queryClient.getQueryData<StockItem[]>(inventoryKeys.stock())?.find((s) => s.name.toLowerCase() === key);
      if (item) lowStockNotify(item, item.qty); // cache already reflects the new qty here
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.stock() });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.movements() });
    },
  });
}

// ------------------------------------------------------------------ library
//
// Fabrics, processes and tech packs all save the same way: the draft is written
// into the cached list straight away so the editor can close onto a list that
// already shows the change, and `onSettled` refetches so a server-side
// difference — a trimmed value, a generated id, a refused write — wins.
//
// A refused write matters here: RLS gates these three tables on the `library`
// section, which is a grant of its own. The mutation rejects, the editor keeps
// the draft on screen and says so, and the refetch puts the real row back.

export function useSaveFabric() {
  const queryClient = useQueryClient();
  const key = inventoryKeys.fabrics();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: FabricDraft }) => api.saveFabric(id, draft),
    onMutate: async ({ id, draft }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Fabric[]>(key);
      // A create has no id yet; a placeholder keeps the row keyed until refetch.
      const row = fabricFromDraft(id ?? `pending-${Date.now()}`, draft);
      queryClient.setQueryData<Fabric[]>(key, (old) =>
        id ? (old ?? []).map((f) => (f.id === id ? row : f)) : [row, ...(old ?? [])],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => rollback<Fabric>(queryClient, key, context?.previous),
    onSuccess: (_data, { draft }) => {
      notify({ eventType: 'inventory.library_changed', section: 'inventory', payload: { label: draft.name.trim() } });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteFabric() {
  const queryClient = useQueryClient();
  const key = inventoryKeys.fabrics();
  return useMutation({
    mutationFn: (id: string) => api.deleteFabric(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Fabric[]>(key);
      queryClient.setQueryData<Fabric[]>(key, (old) => (old ?? []).filter((f) => f.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => rollback<Fabric>(queryClient, key, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useSaveProcess() {
  const queryClient = useQueryClient();
  const key = inventoryKeys.processes();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: ProcessDraft }) => api.saveProcess(id, draft),
    onMutate: async ({ id, draft }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Process[]>(key);
      const row = processFromDraft(id ?? `pending-${Date.now()}`, draft);
      queryClient.setQueryData<Process[]>(key, (old) =>
        id ? (old ?? []).map((p) => (p.id === id ? row : p)) : [row, ...(old ?? [])],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => rollback<Process>(queryClient, key, context?.previous),
    onSuccess: (_data, { draft }) => {
      notify({ eventType: 'inventory.library_changed', section: 'inventory', payload: { label: draft.name.trim() } });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteProcess() {
  const queryClient = useQueryClient();
  const key = inventoryKeys.processes();
  return useMutation({
    mutationFn: (id: string) => api.deleteProcess(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Process[]>(key);
      queryClient.setQueryData<Process[]>(key, (old) => (old ?? []).filter((p) => p.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => rollback<Process>(queryClient, key, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useSaveTechPack() {
  const queryClient = useQueryClient();
  const key = inventoryKeys.techPacks();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: TechPackDraft }) => api.saveTechPack(id, draft),
    onMutate: async ({ id, draft }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TechPack[]>(key);
      const row = techPackFromDraft(id ?? `pending-${Date.now()}`, draft);
      queryClient.setQueryData<TechPack[]>(key, (old) =>
        id ? (old ?? []).map((t) => (t.id === id ? row : t)) : [row, ...(old ?? [])],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => rollback<TechPack>(queryClient, key, context?.previous),
    onSuccess: (_data, { draft }) => {
      notify({
        eventType: 'inventory.library_changed',
        section: 'inventory',
        targetRef: draft.styleNo.trim() || undefined,
        payload: { label: draft.name.trim() },
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteTechPack() {
  const queryClient = useQueryClient();
  const key = inventoryKeys.techPacks();
  return useMutation({
    mutationFn: (id: string) => api.deleteTechPack(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TechPack[]>(key);
      queryClient.setQueryData<TechPack[]>(key, (old) => (old ?? []).filter((t) => t.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => rollback<TechPack>(queryClient, key, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

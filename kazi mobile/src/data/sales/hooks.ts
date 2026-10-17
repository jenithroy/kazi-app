import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notify } from '@/data/notifications/notify';

import { salesKeys } from './keys';
import * as api from './api';
import type { Embellishment, Order, OrderNote, OrderStatus, StageId } from './types';

const ORDERS_SECTION = 'order-management' as const;

export function useOrders() {
  return useQuery({ queryKey: salesKeys.list(), queryFn: api.fetchOrders });
}

interface UpdateContext {
  previous?: Order[];
}

function patchList(queryClient: ReturnType<typeof useQueryClient>, fn: (orders: Order[]) => Order[]) {
  queryClient.setQueryData<Order[]>(salesKeys.list(), (old) => fn(old ?? []));
}

export function useAddOrder() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, Order, UpdateContext>({
    mutationFn: (order: Order) => api.addOrder(order),
    onMutate: async (order) => {
      await queryClient.cancelQueries({ queryKey: salesKeys.list() });
      const previous = queryClient.getQueryData<Order[]>(salesKeys.list());
      patchList(queryClient, (orders) => [order, ...orders]);
      return { previous };
    },
    onError: (_err, _order, context) => {
      if (context?.previous) queryClient.setQueryData(salesKeys.list(), context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: salesKeys.list() }),
    onSuccess: (_data, order) => {
      notify({
        eventType: 'order.created',
        section: ORDERS_SECTION,
        targetRef: order.ref,
        payload: { assignee: order.assignedTo, label: order.product },
      });
    },
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; updates: Partial<Order> }, UpdateContext>({
    mutationFn: ({ id, updates }) => api.updateOrder(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: salesKeys.list() });
      const previous = queryClient.getQueryData<Order[]>(salesKeys.list());
      patchList(queryClient, (orders) => orders.map((o) => (o.id === id ? { ...o, ...updates } : o)));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(salesKeys.list(), context.previous);
    },
    onSuccess: (_data, { id, updates }, context) => {
      const prev = context?.previous?.find((o) => o.id === id);
      const ref = prev?.ref;
      if (updates.assignedTo && updates.assignedTo !== prev?.assignedTo) {
        notify({ eventType: 'order.assigned', section: ORDERS_SECTION, targetRef: ref, payload: { assignee: updates.assignedTo } });
      }
      if (updates.status === 'cancelled' && prev?.status !== 'cancelled') {
        notify({ eventType: 'order.cancelled', section: ORDERS_SECTION, targetRef: ref, payload: { assignee: prev?.assignedTo } });
      }
    },
  });
}

export function useSetOrderStage() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; stage: StageId; reverted?: boolean }, UpdateContext>({
    mutationFn: ({ id, stage, reverted }) => api.setOrderStage(id, stage, reverted),
    onMutate: async ({ id, stage, reverted }) => {
      await queryClient.cancelQueries({ queryKey: salesKeys.list() });
      const previous = queryClient.getQueryData<Order[]>(salesKeys.list());
      patchList(queryClient, (orders) =>
        orders.map((o) =>
          o.id === id && o.stage !== stage
            ? {
                ...o,
                stage,
                // Landing on Delivered completes the order; stepping back always
                // reopens it (reference `advanceStage` / `reverseStage`).
                status: reverted ? 'active' : stage === 'delivered' ? 'completed' : 'active',
                stageHistory: [...o.stageHistory, { stage, at: new Date().toISOString(), reverted }],
              }
            : o,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(salesKeys.list(), context.previous);
    },
    onSuccess: (_data, { id, stage }, context) => {
      const prev = context?.previous?.find((o) => o.id === id);
      if (!prev || prev.stage === stage) return;
      notify({
        eventType: 'order.stage_changed',
        section: ORDERS_SECTION,
        targetRef: prev.ref,
        payload: { assignee: prev.assignedTo, status: stage },
      });
      if (stage === 'delivered') {
        notify({
          eventType: 'order.dispatched',
          section: ORDERS_SECTION,
          targetRef: prev.ref,
          payload: { assignee: prev.assignedTo },
        });
      }
    },
  });
}

export function useSetOrderEmbellishments() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; embellishments: Embellishment[] }, UpdateContext>({
    mutationFn: ({ id, embellishments }) => api.setOrderEmbellishments(id, embellishments),
    onMutate: async ({ id, embellishments }) => {
      await queryClient.cancelQueries({ queryKey: salesKeys.list() });
      const previous = queryClient.getQueryData<Order[]>(salesKeys.list());
      patchList(queryClient, (orders) => orders.map((o) => (o.id === id ? { ...o, embellishments } : o)));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(salesKeys.list(), context.previous);
    },
  });
}

export function useAddOrderNote() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; note: OrderNote }, UpdateContext>({
    mutationFn: ({ id, note }) => api.addOrderNote(id, note),
    onMutate: async ({ id, note }) => {
      await queryClient.cancelQueries({ queryKey: salesKeys.list() });
      const previous = queryClient.getQueryData<Order[]>(salesKeys.list());
      patchList(queryClient, (orders) => orders.map((o) => (o.id === id ? { ...o, notes: [...o.notes, note] } : o)));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(salesKeys.list(), context.previous);
    },
  });
}

export function useSetOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; status: OrderStatus }, UpdateContext>({
    mutationFn: ({ id, status }) => api.setOrderStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: salesKeys.list() });
      const previous = queryClient.getQueryData<Order[]>(salesKeys.list());
      patchList(queryClient, (orders) => orders.map((o) => (o.id === id ? { ...o, status } : o)));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(salesKeys.list(), context.previous);
    },
    onSuccess: (_data, { id, status }, context) => {
      if (status !== 'cancelled') return;
      const prev = context?.previous?.find((o) => o.id === id);
      if (prev?.status === 'cancelled') return;
      notify({
        eventType: 'order.cancelled',
        section: ORDERS_SECTION,
        targetRef: prev?.ref,
        payload: { assignee: prev?.assignedTo },
      });
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string, UpdateContext>({
    mutationFn: (id) => api.deleteOrder(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: salesKeys.list() });
      const previous = queryClient.getQueryData<Order[]>(salesKeys.list());
      patchList(queryClient, (orders) => orders.filter((o) => o.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(salesKeys.list(), context.previous);
    },
  });
}

/** Undo restores the pre-mutation snapshot the screen captured. */
export function useRestoreOrders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previous: Order[]) => api.restoreOrders(previous),
    onMutate: async (previous) => {
      await queryClient.cancelQueries({ queryKey: salesKeys.list() });
      queryClient.setQueryData<Order[]>(salesKeys.list(), previous);
    },
  });
}

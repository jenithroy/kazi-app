import { simulateLatency } from '../mock/delay';
import { seedOrders } from './mock';
import type { Embellishment, Order, OrderNote, OrderStatus, StageId } from './types';

let db: Order[] = [...seedOrders];

export async function fetchOrders(): Promise<Order[]> {
  await simulateLatency();
  return [...db];
}

export async function addOrder(order: Order): Promise<void> {
  await simulateLatency(300);
  db = [order, ...db];
}

export async function updateOrder(id: string, updates: Partial<Order>): Promise<void> {
  await simulateLatency(250);
  db = db.map((o) => (o.id === id ? { ...o, ...updates } : o));
}

/**
 * Move an order to `stage`, appending a `stageHistory` entry. Mirrors the
 * reference `advanceStage`/`reverseStage`: landing on Delivered completes the
 * order, and any backwards move reactivates it.
 */
export async function setOrderStage(id: string, stage: StageId, reverted = false): Promise<void> {
  await simulateLatency(200);
  db = db.map((o) =>
    o.id === id && o.stage !== stage
      ? {
          ...o,
          stage,
          status: reverted ? 'active' : stage === 'delivered' ? 'completed' : 'active',
          stageHistory: [...o.stageHistory, { stage, at: new Date().toISOString(), reverted }],
        }
      : o,
  );
}

export async function setOrderEmbellishments(id: string, embellishments: Embellishment[]): Promise<void> {
  await simulateLatency(150);
  db = db.map((o) => (o.id === id ? { ...o, embellishments } : o));
}

export async function addOrderNote(id: string, note: OrderNote): Promise<void> {
  await simulateLatency(200);
  db = db.map((o) => (o.id === id ? { ...o, notes: [...o.notes, note] } : o));
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<void> {
  await simulateLatency(200);
  db = db.map((o) => (o.id === id ? { ...o, status } : o));
}

export async function deleteOrder(id: string): Promise<void> {
  await simulateLatency(200);
  db = db.filter((o) => o.id !== id);
}

export async function restoreOrders(previous: Order[]): Promise<void> {
  await simulateLatency(150);
  db = [...previous];
}

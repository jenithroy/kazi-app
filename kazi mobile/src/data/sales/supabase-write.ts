/**
 * Live `orders` writers — the reference ERP's own collection, shared by Sales
 * (read-only) and the Production pipeline screen.
 *
 * Every stage and status goes back as the verbatim string the website matches
 * on, so a move made on the phone reads correctly in the browser and vice
 * versa. The stage mutations mirror `Production.jsx`: advancing onto Delivered
 * also completes the order, and a backwards move reactivates it and records a
 * "↩ Reverted to X" history entry, exactly as the web app writes it.
 */

import { arrayUnion } from '@/lib/supabase/collections';

import { createDocument, patchDocument, removeDocument } from '@/lib/supabase/write';
import { getActor } from '@/data/notifications/actor';

import { stageById } from './mock';
import type { Embellishment, Order, OrderNote, OrderStatus, StageId } from './types';

const COLLECTION = 'orders';

const STATUS_TO_LIVE: Record<OrderStatus, string> = {
  active: 'Active',
  'on-hold': 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const today = () => new Date().toISOString().slice(0, 10);
const actor = () => getActor()?.name ?? 'kazi-mobile';

function toLive(o: Partial<Order>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (o.ref !== undefined) out.orderId = o.ref;
  if (o.customer !== undefined) out.customerName = o.customer;
  if (o.product !== undefined) out.styleName = o.product;
  if (o.qty !== undefined) out.quantity = o.qty;
  if (o.value !== undefined) out.totalValueNPR = o.value;
  if (o.pricePerPc !== undefined) out.pricePerPcNPR = o.pricePerPc;
  if (o.stage !== undefined) out.stage = stageById(o.stage).label;
  if (o.status !== undefined) out.status = STATUS_TO_LIVE[o.status];
  if (o.orderDate !== undefined) out.date = o.orderDate;
  if (o.deliveryDate !== undefined) out.deliveryDate = o.deliveryDate;
  if (o.fabricType !== undefined) out.fabricType = o.fabricType;
  if (o.colorway !== undefined) out.colorway = o.colorway;
  if (o.fabricGramsUsed !== undefined) out.fabricGramsUsed = o.fabricGramsUsed;
  if (o.fabricCostPerPc !== undefined) out.fabricCostPerPcNPR = o.fabricCostPerPc;
  if (o.sampleName !== undefined) out.sampleName = o.sampleName;
  if (o.embellishments !== undefined) out.embellishments = o.embellishments;
  if (o.assignedTo !== undefined) out.assignedTo = o.assignedTo;
  if (o.invoiceRef !== undefined) out.invoiceRef = o.invoiceRef;
  return out;
}

export async function addOrder(order: Order): Promise<void> {
  await createDocument(COLLECTION, {
    ...toLive(order),
    notes: '',
    notesList: order.notes ?? [],
    stageHistory: order.stageHistory ?? [],
    createdBy: actor(),
  });
}

export async function updateOrder(id: string, updates: Partial<Order>): Promise<void> {
  const fields = toLive(updates);
  if (Object.keys(fields).length > 0) await patchDocument(COLLECTION, id, fields);
}

/**
 * A stage move. `reverted` marks a backwards step, which the reference records
 * with an arrow-prefixed history entry and always leaves the order Active.
 */
export async function setOrderStage(id: string, stage: StageId, reverted = false): Promise<void> {
  const label = stageById(stage).label;
  await patchDocument(COLLECTION, id, {
    stage: label,
    status: reverted ? 'Active' : stage === 'delivered' ? 'Completed' : 'Active',
    stageHistory: arrayUnion({
      stage: reverted ? `↩ Reverted to ${label}` : label,
      at: new Date().toISOString(),
      date: today(),
      by: actor(),
    }),
  });
}

export async function setOrderEmbellishments(id: string, embellishments: Embellishment[]): Promise<void> {
  await patchDocument(COLLECTION, id, { embellishments });
}

export async function addOrderNote(id: string, note: OrderNote): Promise<void> {
  // Live docs carry the note list on `notesList` (array); `notes` is a scalar string.
  await patchDocument(COLLECTION, id, {
    notesList: arrayUnion({ id: note.id, body: note.body, at: note.at, who: note.who }),
  });
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<void> {
  await patchDocument(COLLECTION, id, { status: STATUS_TO_LIVE[status] });
}

export async function deleteOrder(id: string): Promise<void> {
  await removeDocument(COLLECTION, id);
}

/** Snapshot restore (undo) — not reversed in Postgres this pass. */
export async function restoreOrders(_previous: Order[]): Promise<void> {
  /* intentionally no live write */
}

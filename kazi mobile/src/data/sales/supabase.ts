/**
 * Live `orders` reader. The `orders` collection is the single source of truth
 * for Sales (overview) and the Production pipeline screen.
 *
 * Live shape (field list sampled 2026-09-05 off the `fs_orders` compat view):
 *   { orderId, customerName, styleName, fabricType, colorway, quantity,
 *     stage (one of the ten `stage_config` names), status, date, deliveryDate,
 *     assignedTo, pricePerPcNPR, totalValueNPR, fabricGramsUsed,
 *     fabricCostPerPcNPR, embellishments, sampleId/Name, invoiceRef, notes,
 *     notesList, stageHistory, createdBy, createdAt }
 *
 * There is no `priority` column — it is derived from `deliveryDate`, exactly as
 * the reference app does it (`utils.ts` → `priorityOf`).
 *
 * Gaps handled locally:
 *   - `notes`/`stageHistory` come back as JSON string OR array → `parseMaybeJson`
 *   - `ship`/`shipDays` derived from `deliveryDate`, which most rows leave null
 */

import { num, parseMaybeJson, str, tsToISO } from '@/lib/data/normalise';
import { readCollection, type DocData } from '@/lib/supabase/read';

import { STAGES, STAGE_IDS, shipDays, shipLabel, stageIndex } from './mock';
import { EMBELLISHMENT_TYPES } from './types';
import type { Embellishment, Order, OrderNote, OrderStatus, StageHistoryEntry, StageId } from './types';

/** Verbatim `stage_config` name → stage id; keyword-matched only as a fallback. */
const BY_LABEL = new Map<string, StageId>(STAGES.map((s) => [s.label.toLowerCase(), s.id]));

function mapStage(raw: unknown): StageId {
  const s = str(raw).trim().toLowerCase();
  const exact = BY_LABEL.get(s);
  if (exact) return exact;
  // Older rows and the web app's own legacy kanban use shorter names.
  if (/(deliver)/.test(s)) return 'delivered';
  if (/(ship|dispatch)/.test(s)) return 'shipped';
  if (/(pack)/.test(s)) return 'packing';
  if (/(qc|quality|inspect)/.test(s)) return 'quality-check';
  if (/(embellish|embroider|print|dtf|button)/.test(s)) return 'embellishment';
  if (/(finish|press)/.test(s)) return 'finishing';
  if (/(stitch|sew)/.test(s)) return 'stitching';
  if (/(cut)/.test(s)) return 'cutting';
  if (/(fabric|sourc|material)/.test(s)) return 'sourcing';
  return 'received';
}

/** Reference `ORDER_STATUSES`; anything unrecognised is treated as Active. */
function mapStatus(raw: unknown): OrderStatus {
  const s = str(raw).trim().toLowerCase();
  if (/cancel/.test(s)) return 'cancelled';
  if (/hold/.test(s)) return 'on-hold';
  if (/(complete|done|closed)/.test(s)) return 'completed';
  return 'active';
}

function mapEmbellishments(raw: unknown): Embellishment[] {
  const parsed = parseMaybeJson<unknown>(raw, null);
  const list = Array.isArray(parsed) ? parsed : Array.isArray(raw) ? raw : [];
  return list
    .map((e) => str(e).trim().toLowerCase())
    .map((e) => EMBELLISHMENT_TYPES.find((t) => t.toLowerCase() === e))
    .filter((e): e is Embellishment => !!e);
}

/** Back-fill a full history up to `stage` when the live one is missing/unparseable. */
function historyTo(stage: StageId, endISO: string): StageHistoryEntry[] {
  const end = stageIndex(stage);
  const endMs = new Date(endISO || Date.now()).getTime() || Date.now();
  return STAGE_IDS.slice(0, end + 1).map((s, i) => ({
    stage: s,
    at: new Date(endMs - (end - i) * 86_400_000).toISOString(),
  }));
}

function mapHistory(raw: unknown, stage: StageId, fallbackISO: string): StageHistoryEntry[] {
  const parsed = parseMaybeJson<unknown[]>(raw, []);
  if (Array.isArray(parsed) && parsed.length) {
    const rows = parsed
      .map((e) => {
        const entry = (e ?? {}) as DocData;
        const label = str(entry.stage ?? entry.to ?? entry.name);
        return {
          // The reference writes a backwards move as "↩ Reverted to <stage>".
          reverted: /reverted/i.test(label),
          stage: mapStage(label.replace(/^.*reverted to\s*/i, '')),
          at: tsToISO(entry.at ?? entry.date ?? entry.timestamp) || fallbackISO,
          by: str(entry.by ?? entry.who) || undefined,
        };
      })
      .filter((r) => r.at);
    if (rows.length) return rows;
  }
  return historyTo(stage, fallbackISO);
}

function mapNotes(raw: unknown, fallbackISO: string, who: string): OrderNote[] {
  const parsed = parseMaybeJson<unknown>(raw, null);
  if (Array.isArray(parsed)) {
    return parsed.map((e, i) => {
      const entry = (e ?? {}) as DocData;
      return {
        id: str(entry.id) || `n${i + 1}`,
        body: str(entry.body ?? entry.text ?? entry.note).trim(),
        at: tsToISO(entry.at ?? entry.date) || fallbackISO,
        who: str(entry.who ?? entry.by ?? entry.author) || who,
      };
    }).filter((n) => n.body);
  }
  const body = str(parsed ?? raw).trim();
  return body ? [{ id: 'n1', body, at: fallbackISO, who }] : [];
}

/**
 * Both note sources are real and both have to show: the pre-migration free-text
 * `notes` column, and the `order_notes` rows the app appends. Choosing one hid
 * the other — and the legacy string won, so every note added on the phone
 * vanished on the next refetch. The string is dropped only when a row already
 * repeats it verbatim (the migration copied one across).
 */
function mergeNotes(legacy: unknown, list: unknown, fallbackISO: string, who: string): OrderNote[] {
  const rows = mapNotes(list, fallbackISO, who);
  const carried = mapNotes(legacy, fallbackISO, who).filter((n) => !rows.some((r) => r.body === n.body));
  return [...carried, ...rows];
}

function mapOrderDoc(id: string, d: DocData): Order | null {
  const customer = str(d.customerName).trim();
  const ref = str(d.orderId).trim() || `ORD-${id.slice(0, 5).toUpperCase()}`;
  if (!customer && !str(d.styleName).trim()) return null;

  const stage = mapStage(d.stage);
  const qty = num(d.quantity);
  const pricePerPc = num(d.pricePerPcNPR);
  const value = num(d.totalValueNPR) || qty * pricePerPc;
  const deliveryISO = tsToISO(d.deliveryDate).slice(0, 10);
  const orderISO = tsToISO(d.date).slice(0, 10);
  const createdISO = tsToISO(d.createdAt) || tsToISO(d.date) || new Date().toISOString();
  const who = str(d.createdBy) || str(d.assignedTo) || 'Team';

  return {
    id,
    ref,
    customer: customer || '—',
    product: str(d.styleName).trim() || str(d.sampleName).trim() || '—',
    qty,
    stage,
    status: mapStatus(d.status),
    orderDate: orderISO,
    deliveryDate: deliveryISO,
    ship: shipLabel(deliveryISO),
    shipDays: shipDays(deliveryISO),
    value,
    pricePerPc: pricePerPc || (qty > 0 ? Math.round(value / qty) : 0),
    fabricType: str(d.fabricType).trim(),
    colorway: str(d.colorway).trim(),
    fabricGramsUsed: num(d.fabricGramsUsed),
    fabricCostPerPc: num(d.fabricCostPerPcNPR),
    invoiceRef: str(d.invoiceRef).trim(),
    sampleName: str(d.sampleName).trim(),
    embellishments: mapEmbellishments(d.embellishments),
    assignedTo: str(d.assignedTo).trim(),
    stageHistory: mapHistory(d.stageHistory, stage, createdISO),
    // live docs carry notes on the free-text `notes` column AND on `notesList`
    notes: mergeNotes(d.notes, d.notesList, createdISO, who),
  };
}

export async function fetchOrders(): Promise<Order[]> {
  return readCollection('orders', mapOrderDoc);
}

import type { AvatarTint } from '@/components/ui/avatar';
import type { Order, Stage, StageHistoryEntry, StageId } from './types';

/**
 * The ten stages, in order, with the exact `stage_config` names the website
 * stores in `orders.stage`. Colours run neutral → amber (cutting/sewing) →
 * mint (finishing/QC) → dark (out the door), so a glance at the rail reads as
 * progress.
 */
export const STAGES: Stage[] = [
  { id: 'received', label: 'Order Received', short: 'Received', dot: '#8C9A92', bg: '#F1EEE5', fg: '#3B4F47', bar: '#C7CEC9' },
  { id: 'sourcing', label: 'Fabric Sourcing', short: 'Sourcing', dot: '#8C9A92', bg: '#F1EEE5', fg: '#3B4F47', bar: '#B7BFB9' },
  { id: 'cutting', label: 'Cutting', short: 'Cutting', dot: '#B98514', bg: '#F7EEDA', fg: '#7A5709', bar: '#E4C778' },
  { id: 'stitching', label: 'Stitching', short: 'Stitching', dot: '#B98514', bg: '#F7EEDA', fg: '#7A5709', bar: '#DBB55C' },
  { id: 'finishing', label: 'Finishing & Pressing', short: 'Finishing', dot: '#147A57', bg: '#E9EFEC', fg: '#0E5E43', bar: '#9AD5BC' },
  { id: 'embellishment', label: 'Embellishment', short: 'Embellish', dot: '#147A57', bg: '#E9EFEC', fg: '#0E5E43', bar: '#7FC9A9' },
  { id: 'quality-check', label: 'Quality Check', short: 'QC', dot: '#22A97A', bg: '#E2F6EC', fg: '#0E5E43', bar: '#6FD3A6' },
  { id: 'packing', label: 'Packing', short: 'Packing', dot: '#22A97A', bg: '#E2F6EC', fg: '#0E5E43', bar: '#5FD2A0' },
  { id: 'shipped', label: 'Shipped', short: 'Shipped', dot: '#1B3A30', bg: '#DDE5E0', fg: '#0F241D', bar: '#2E5648' },
  { id: 'delivered', label: 'Delivered', short: 'Delivered', dot: '#0D1F19', bg: '#DDE5E0', fg: '#0F241D', bar: '#0D1F19' },
];

export const STAGE_IDS: StageId[] = STAGES.map((s) => s.id);
export const stageIndex = (id: StageId) => STAGE_IDS.indexOf(id);
export const stageById = (id: StageId): Stage => STAGES[stageIndex(id)] ?? STAGES[0];

/** Fabric names the reference form offers before the live library loads. */
export const FABRIC_TYPES: string[] = [
  'Terry Cotton', 'Chinese Terry Fabric', 'Rib Fabric', 'Fleece', 'Jersey',
  'Denim', 'Linen', 'Polyester Blend', 'Other',
];

/** Row avatars cycle through these tints by row position, matching the design's positional (not per-customer) AVATARS cycling. */
export const AVATAR_TINTS: AvatarTint[] = ['mint', 'clay', 'amber', 'dark', 'draft'];

/** Every-stage-up-to-`stage` history, back-dated one day per step from `endISO`. */
function historyTo(stage: StageId, endISO: string): StageHistoryEntry[] {
  const end = stageIndex(stage);
  const endMs = new Date(endISO).getTime();
  return STAGE_IDS.slice(0, end + 1).map((s, i) => ({
    stage: s,
    at: new Date(endMs - (end - i) * 86_400_000).toISOString(),
  }));
}

interface SeedInput {
  id: string;
  ref: string;
  customer: string;
  product: string;
  fabricType: string;
  colorway: string;
  qty: number;
  pricePerPc: number;
  stage: StageId;
  status?: Order['status'];
  deliveryDate: string;
  invoiceRef: string;
  assignedTo: string;
  /** ISO date the order reached its current stage — seeds the stage history. */
  reachedAt: string;
}

const SEED_INPUT: SeedInput[] = [
  { id: 'o1', ref: 'ORD-2291', customer: 'Northfield Apparel', product: 'Oversized hoodie · AW26', fabricType: 'Fleece', colorway: 'Black', qty: 2400, pricePerPc: 1800, stage: 'cutting', deliveryDate: '2026-09-08', invoiceRef: 'INV-8841', assignedTo: 'Pramila Tamang', reachedAt: '2026-08-22' },
  { id: 'o2', ref: 'ORD-2290', customer: 'Halden & Co.', product: 'Organic cotton tee', fabricType: 'Jersey', colorway: 'Ecru', qty: 5000, pricePerPc: 630, stage: 'packing', deliveryDate: '2026-09-07', invoiceRef: 'INV-2207', assignedTo: 'Sita Rai', reachedAt: '2026-08-23' },
  { id: 'o3', ref: 'ORD-2289', customer: 'Base Layer Studio', product: 'Merino base layer', fabricType: 'Rib Fabric', colorway: 'Charcoal', qty: 900, pricePerPc: 3200, stage: 'finishing', deliveryDate: '2026-09-19', invoiceRef: 'INV-114', assignedTo: 'Dan Miller', reachedAt: '2026-08-24' },
  { id: 'o4', ref: 'ORD-2288', customer: 'Karve Outdoor', product: 'Fleece jogger', fabricType: 'Fleece', colorway: 'Olive', qty: 1800, pricePerPc: 1200, stage: 'sourcing', deliveryDate: '', invoiceRef: '', assignedTo: 'Manisha KC', reachedAt: '2026-08-20' },
  { id: 'o5', ref: 'ORD-2287', customer: 'Thamel Threads', product: 'Cotton overshirt', fabricType: 'Terry Cotton', colorway: 'Indigo', qty: 1200, pricePerPc: 800, stage: 'embellishment', deliveryDate: '2026-09-06', invoiceRef: 'CH-0091', assignedTo: 'Sita Rai', reachedAt: '2026-08-23' },
  { id: 'o6', ref: 'ORD-2286', customer: 'Ridgeline Supply', product: 'Terry crew sweat', fabricType: 'Chinese Terry Fabric', colorway: 'Slate', qty: 3200, pricePerPc: 1300, stage: 'stitching', status: 'on-hold', deliveryDate: '', invoiceRef: '', assignedTo: 'Pramila Tamang', reachedAt: '2026-08-19' },
  { id: 'o7', ref: 'ORD-2285', customer: 'Halden & Co.', product: 'Cropped tee · SS27 sample', fabricType: 'Jersey', colorway: 'White', qty: 600, pricePerPc: 700, stage: 'quality-check', deliveryDate: '2026-09-12', invoiceRef: 'INV-2199', assignedTo: 'Dan Miller', reachedAt: '2026-09-01' },
  { id: 'o8', ref: 'ORD-2281', customer: 'Northfield Apparel', product: 'Zip-through hoodie', fabricType: 'Fleece', colorway: 'Navy', qty: 1500, pricePerPc: 1800, stage: 'delivered', status: 'completed', deliveryDate: '2026-08-14', invoiceRef: 'INV-8802', assignedTo: 'Manisha KC', reachedAt: '2026-08-14' },
];

/** "2026-09-08" → "08 Sep"; empty/invalid → "". */
export function shipLabel(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-GB', { month: 'short' })}`;
}

export function shipDays(iso: string): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - start.getTime()) / 86_400_000);
}

export const seedOrders: Order[] = SEED_INPUT.map(({ reachedAt, status, ...o }) => ({
  ...o,
  status: status ?? 'active',
  orderDate: reachedAt,
  ship: shipLabel(o.deliveryDate),
  shipDays: shipDays(o.deliveryDate),
  value: o.qty * o.pricePerPc,
  fabricGramsUsed: 0,
  fabricCostPerPc: 0,
  sampleName: '',
  embellishments: o.stage === 'embellishment' ? ['Embroidery'] : [],
  stageHistory: historyTo(o.stage, reachedAt),
  notes:
    o.id === 'o2'
      ? [{ id: 'n1', body: 'Buyer confirmed carton ratio — 12 per master.', at: '2026-08-23T09:20:00.000Z', who: 'Sita Rai' }]
      : [],
}));

/**
 * Next ref from the current max. Live `order_no` is zero-padded to three digits
 * (`ORD-057`); an unpadded `ORD-58` would also sort above it in the web ERP's
 * list, which orders the column as text.
 */
export function nextOrderRef(orders: Order[]): string {
  const max = orders.reduce((m, o) => {
    const n = parseInt(o.ref.replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `ORD-${String(max + 1).padStart(3, '0')}`;
}

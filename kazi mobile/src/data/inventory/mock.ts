import type { Fabric, ItemCost, Process, StockItem, StockMovement, TechPack } from './types';

const daysAgoISO = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/** Mock rows carry the same `opening + in - used` arithmetic the live reader does. */
function stock(
  partial: Omit<StockItem, 'qty' | 'stockIn' | 'stockUsed' | 'unitCostNPR' | 'owner' | 'condition' | 'lastUpdated' | 'fabricName'> & {
    stockIn?: number;
    stockUsed?: number;
    unitCostNPR?: number;
    owner?: string;
    condition?: string;
    lastUpdated?: string;
    fabricName?: string;
  },
): StockItem {
  const stockIn = partial.stockIn ?? 0;
  const stockUsed = partial.stockUsed ?? 0;
  return {
    ...partial,
    stockIn,
    stockUsed,
    qty: partial.opening + stockIn - stockUsed,
    unitCostNPR: partial.unitCostNPR ?? 0,
    owner: partial.owner ?? '',
    condition: partial.condition ?? '',
    lastUpdated: partial.lastUpdated ?? daysAgoISO(9),
    fabricName: partial.fabricName ?? '',
  };
}

export const seedStock: StockItem[] = [
  stock({ id: 's1', name: 'Anti-Grunge Cotton', sku: '#kazi1001', supplier: 'Sunrise Mills', category: 'Raw Materials', opening: 700, stockUsed: 280, threshold: 900, unit: 'm', swatch: '#DCD6C8', swatchFg: '#3B4F47', swatchLabel: '180 GSM', lead: '12 days', location: 'Rack B2', cost: 'रु 310', unitCostNPR: 310, batches: '3 batches waiting', condition: 'Rolled', lastUpdated: daysAgoISO(1), fabricName: 'Anti-Grunge Cotton' }),
  stock({ id: 's2', name: 'AP Cotton', sku: '#kazi1002', supplier: 'Sunrise Mills', category: 'Raw Materials', opening: 500, stockIn: 600, stockUsed: 60, threshold: 1200, unit: 'm', swatch: '#E7E9E2', swatchFg: '#3B4F47', swatchLabel: '160 GSM', lead: '12 days', location: 'Rack B4', cost: 'रु 268', unitCostNPR: 268, batches: '1 batch waiting', condition: 'Rolled', lastUpdated: daysAgoISO(3) }),
  stock({ id: 's3', name: 'Terry Fleece · Ink', sku: '#kazi1003', supplier: 'Bagmati Knits', category: 'Raw Materials', opening: 2680, threshold: 1500, unit: 'm', swatch: '#2C3B34', swatchFg: '#BFE9D5', swatchLabel: '320 GSM', lead: '18 days', location: 'Rack C1', cost: 'रु 540', unitCostNPR: 540, batches: '—' }),
  stock({ id: 's4', name: 'Merino Jersey 19.5µ', sku: '#kazi1004', supplier: 'Highland Yarn (UK)', category: 'Raw Materials', opening: 322, stockUsed: 12, threshold: 400, unit: 'm', swatch: '#C8B9A4', swatchFg: '#3B4F47', swatchLabel: '19.5µ', lead: '26 days', location: 'Rack A3', cost: 'रु 1,880', unitCostNPR: 1880, batches: '1 batch waiting', owner: 'Highland (consignment)', lastUpdated: daysAgoISO(2) }),
  stock({ id: 's5', name: 'Ribbed Collar Tape', sku: '#kazi1005', supplier: 'Kathmandu Trims', category: 'Trims', opening: 8400, threshold: 3000, unit: 'm', swatch: '#B7CBBE', swatchFg: '#0F241D', swatchLabel: '2 cm', lead: '6 days', location: 'Bin 14', cost: 'रु 22', unitCostNPR: 22, batches: '—', condition: 'Packed' }),
  stock({ id: 's6', name: 'Recycled Poly Zips', sku: '#kazi1006', supplier: 'Kathmandu Trims', category: 'Trims', opening: 1250, threshold: 2000, unit: 'pcs', swatch: '#8C9A92', swatchFg: '#F7F4EC', swatchLabel: '45 cm', lead: '9 days', location: 'Bin 07', cost: 'रु 46', unitCostNPR: 46, batches: '2 batches waiting', condition: 'Packed' }),
  stock({ id: 's7', name: 'Woven Care Labels', sku: '#kazi1007', supplier: 'Print House KTM', category: 'Trims', opening: 26400, threshold: 10000, unit: 'pcs', swatch: '#F1EEE5', swatchFg: '#3B4F47', swatchLabel: 'SATIN', lead: '5 days', location: 'Bin 02', cost: 'रु 3', unitCostNPR: 3, batches: '—' }),
];

/**
 * Deliberately uneven, because the live table is: half the rows are a name and
 * a status and nothing else, so the UI has to look right with the fields blank.
 */
export const seedFabrics: Fabric[] = [
  { id: 'f1', name: 'Anti-Grunge Cotton', type: 'Fabric', composition: '100% combed cotton', supplier: 'Sunrise Mills', gsm: 180, weight: 'Mid', pricePerMeter: 310, pricePerKg: 0, colors: ['Ecru', 'Ink'], status: 'In Stock', notes: 'Holds a crease well after wash.', swatchUrl: '' },
  { id: 'f2', name: 'AP Cotton', type: 'Fabric', composition: '100% cotton', supplier: 'Sunrise Mills', gsm: 160, weight: 'Light', pricePerMeter: 268, pricePerKg: 0, colors: ['White'], status: 'In Stock', notes: '', swatchUrl: '' },
  { id: 'f3', name: 'Terry Fleece', type: 'Fabric', composition: '80% cotton / 20% poly', supplier: '', gsm: 320, weight: 'Heavy', pricePerMeter: 0, pricePerKg: 0, colors: [], status: 'In Stock', notes: '', swatchUrl: '' },
  { id: 'f4', name: 'Cotton Interlock', type: 'Fabric', composition: '100% cotton', supplier: '', gsm: 0, weight: '', pricePerMeter: 0, pricePerKg: 0, colors: ['white'], status: '', notes: '', swatchUrl: '' },
  { id: 'f5', name: 'Cotton Scuba Brown', type: 'Fabric', composition: '', supplier: '', gsm: 0, weight: '', pricePerMeter: 0, pricePerKg: 0, colors: [], status: 'In Stock', notes: '', swatchUrl: '' },
  { id: 'f6', name: 'jacquard fabric', type: '', composition: '', supplier: '', gsm: 0, weight: '', pricePerMeter: 0, pricePerKg: 0, colors: [], status: 'In Stock', notes: '', swatchUrl: '' },
  { id: 'f7', name: 'satin', type: '', composition: '', supplier: '', gsm: 0, weight: '', pricePerMeter: 0, pricePerKg: 0, colors: [], status: 'In Stock', notes: '', swatchUrl: '' },
  { id: 'f8', name: 'Ribbed Collar Tape', type: 'Trim', composition: '', supplier: 'Kathmandu Trims', gsm: 0, weight: '', pricePerMeter: 22, pricePerKg: 0, colors: ['Ink', 'Ecru'], status: 'Low Stock', notes: '2 cm width.', swatchUrl: '' },
  { id: 'f9', name: 'Recycled Poly Zips', type: 'Trim', composition: 'rPET', supplier: 'Kathmandu Trims', gsm: 0, weight: '', pricePerMeter: 0, pricePerKg: 0, colors: [], status: 'Out of Stock', notes: '', swatchUrl: '' },
];

export const seedProcesses: Process[] = [
  { id: 'p1', name: 'Paper Pattern Cutting & Design', category: 'construction', costPerUnit: 3500, leadTimeDays: 1, minQuantity: 1, notes: '', description: 'Fixed routing of 1.5–3 labour hours per master pattern for drafting, digitising and paper cutting. Covers sketching, measurement specs, CAD, sample pattern cutting and size grading. BOM allocates pattern card by marker area with a 5% scrap factor for trims, test plots and revisions.' },
  { id: 'p2', name: 'Embroidery', category: 'construction', costPerUnit: 400, leadTimeDays: 3, minQuantity: 1, notes: '', description: 'Done before panels are joined. The design is digitised and loaded to the machine, the panel is hooped with stabiliser, and the machine stitches to the programmed pattern. Excess stabiliser and loose threads are removed and the panel is inspected before assembly.' },
  { id: 'p3', name: 'Stitching', category: 'construction', costPerUnit: 150, leadTimeDays: 1, minQuantity: 1, notes: '', description: 'Fixed routing of 1.00 standard labour hour per garment for standard assembly, single-operator setup — panel joining, hemming and rib attachment. BOM allocates 2.5–3.0 m of thread per metre of seam with a 1% scrap factor for breakages and tension testing.' },
  { id: 'p4', name: 'DTF Printing', category: 'printing', costPerUnit: 140, leadTimeDays: 1, minQuantity: 1, notes: '', description: 'Direct-to-film printing at 720–1440+ DPI with a white underbase, durable to 50+ industrial washes. Throughput 4–5 linear metres per hour (about 5 minutes per 12×20 inch design). Consumable cost roughly $1.50–2.00 covering film, ink and powder. Maximum design width 12 inches.' },
  { id: 'p5', name: 'Garment Washing (Out Sourced)', category: 'finishing', costPerUnit: 100, leadTimeDays: 2, minQuantity: 1, notes: '', description: 'Outsourced to a third-party laundry at NPR 100 per kilogram. Tracks subcontract cost rather than internal labour: batch weighing, transport both ways, the wash itself and bulk drying. BOM carries a 0.5% loss factor for shrinkage and handling.' },
  { id: 'p6', name: 'Buttoning and Buttonhole', category: 'finishing', costPerUnit: 30, leadTimeDays: 1, minQuantity: 1, notes: '', description: 'Positions are measured and marked to spec and interfacing applied where the fabric needs reinforcing. A buttonhole machine stitches and the centre is cut open, then a button sewer attaches the buttons. Alignment, strength and finish are inspected before pressing.' },
  { id: 'p7', name: 'Finishing and Packaging', category: 'finishing', costPerUnit: 20, leadTimeDays: 1, minQuantity: 1, notes: '', description: 'Throughput 15 garments per hour — 1.5 minutes trimming thread, 1.5 minutes steam ironing, 1 minute packing. BOM allocates 1 polybag and 0.05 m of tape per unit. 100% visual inspection here flags soiling, skipped stitches and press defects before dispatch.' },
  { id: 'p8', name: 'Fabric Cutting', category: 'construction', costPerUnit: 15, leadTimeDays: 1, minQuantity: 1, notes: '', description: 'Manual cutting at 2 hours per 100-garment layout — ply laying, pattern pinning and rotary knife cutting. Dual UoM: fabric is received in kilograms and issued in metres by GSM. Without nesting software the BOM carries a 15–20% scrap factor, about 5 kg waste per 100-shirt run.' },
  { id: 'p9', name: 'DTF Heat Press', category: 'embellishment', costPerUnit: 5, leadTimeDays: 1, minQuantity: 1, notes: '', description: '40–50 garments per hour on a 15×15 inch flatbed. 15 seconds at 160 °C to fuse, a 30-second cool for cold-peel film, then a 5-second seal. Allocates 1.5 minutes of handling labour per garment. 4% scrap factor for scorching and alignment defects; Teflon sheets tracked as a shop-floor consumable.' },
];

export const seedTechPacks: TechPack[] = [
  { id: 't1', styleNo: '#KAZI007', name: 'straight pant', productType: 'pant', category: 'Menswear', season: 'Spring-Summer', market: 'Nepal', designer: 'Aakanshya Poudel', sizes: [], specSize: 'XS,S,M', specDate: daysAgoISO(1), trims: '', washCare: '', remarks: '', notes: '', fabrics: [{ fabricName: 'Lycra', description: '' }], measurements: [], frontSketchUrl: '', backSketchUrl: '', techPackUrl: '', images: [] },
  { id: 't2', styleNo: '#KAZI006', name: 'lace top', productType: 'top', category: 'Womenswear', season: 'Spring-Summer', market: 'Nepal', designer: 'Aakanshya Poudel', sizes: [], specSize: 'XS,S,M', specDate: daysAgoISO(1), trims: '', washCare: '', remarks: '', notes: '', fabrics: [{ fabricName: 'Lycra', description: '' }], measurements: [], frontSketchUrl: '', backSketchUrl: '', techPackUrl: '', images: [] },
  { id: 't3', styleNo: '#KAZI005', name: 'Baby Tee', productType: 'Tee', category: 'Womenswear', season: '', market: 'UK', designer: 'Aakanshya Poudel', sizes: [], specSize: 'XS', specDate: daysAgoISO(4), trims: 'Woven label, satin neck tape', washCare: 'Cold wash, do not tumble dry', remarks: '', notes: '', fabrics: [{ fabricName: 'Combed Cotton', description: '160 GSM' }], measurements: [], frontSketchUrl: '', backSketchUrl: '', techPackUrl: '', images: [] },
  { id: 't4', styleNo: '#KAZI002', name: 'Men Sweatpants', productType: 'Bottom', category: 'Menswear', season: 'Autumn-Winter', market: 'Nepal', designer: 'Aakanshya Poudel', sizes: [], specSize: 'M,L,XL', specDate: daysAgoISO(15), trims: 'Drawcord, metal eyelets', washCare: '', remarks: '', notes: '', fabrics: [{ fabricName: 'Terry Fleece', description: '320 GSM' }], measurements: [], frontSketchUrl: '', backSketchUrl: '', techPackUrl: '', images: [] },
  { id: 't5', styleNo: '', name: 'Drop shoulder', productType: 'Tee', category: '', season: '', market: '', designer: '', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'], specSize: '', specDate: '', trims: '', washCare: '', remarks: '', notes: 'Older record — spec lives in the attached document.', fabrics: [], measurements: [], frontSketchUrl: '', backSketchUrl: '', techPackUrl: 'https://example.invalid/tech-pack.pdf', images: [] },
  { id: 't6', styleNo: '', name: 'Junkiri kurthi', productType: 'Kurthi', category: '', season: '', market: '', designer: '', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], specSize: '', specDate: '', trims: '', washCare: '', remarks: '', notes: '', fabrics: [], measurements: [], frontSketchUrl: '', backSketchUrl: '', techPackUrl: 'https://example.invalid/tech-pack.pdf', images: [] },
];

export const seedItemCosts: ItemCost[] = [
  { code: 'kazi1001', name: 'Chinese Terry Tshirt (White)', fabric: 402, labour: 75, rib: 22, trims: 16, others: 20, total: 535 },
  { code: 'kazi1002', name: 'Chinese Terry Tshirt (Black)', fabric: 307, labour: 75, rib: 22, trims: 16, others: 20, total: 440 },
  { code: 'kazi1003', name: 'Cotton Terry', fabric: 360, labour: 75, rib: 22, trims: 16, others: 20, total: 493 },
  { code: 'kazi1004', name: 'Lining Cotton Terry', fabric: 0, labour: 75, rib: 22, trims: 20, others: 20, total: null },
  { code: 'kazi1005', name: 'Combed Cotton', fabric: 290, labour: 75, rib: 22, trims: 20, others: 20, total: 427 },
  { code: 'kazi1006', name: 'Ligra', fabric: 160, labour: 75, rib: 22, trims: 20, others: 20, total: null },
];

/** Per-item stock ledger (item 19), newest first. Balance is the running qty after each move. */
export const seedMovements: StockMovement[] = [
  { id: 'm1', itemId: 's1', kind: 'out', delta: -280, balance: 420, reason: 'Issued to cutting', ref: 'BATCH-119 · Bimal S.', date: daysAgoISO(1) },
  { id: 'm2', itemId: 's1', kind: 'out', delta: -340, balance: 700, reason: 'Issued to cutting', ref: 'BATCH-118 · Bimal S.', date: daysAgoISO(4) },
  { id: 'm3', itemId: 's1', kind: 'out', delta: -45, balance: 1040, reason: 'Wastage written off', ref: 'QC fail · shade variance', date: daysAgoISO(6) },
  { id: 'm4', itemId: 's2', kind: 'in', delta: 600, balance: 1040, reason: 'GRN received', ref: 'PO-2418 · Sunrise Mills', date: daysAgoISO(3) },
  { id: 'm5', itemId: 's2', kind: 'out', delta: -60, balance: 440, reason: 'Issued to sampling', ref: 'SAMP-77 · Sabina R.', date: daysAgoISO(8) },
  { id: 'm6', itemId: 's4', kind: 'adjust', delta: -12, balance: 310, reason: 'Cycle count correction', ref: 'STK-COUNT Aug', date: daysAgoISO(2) },
];

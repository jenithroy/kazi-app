/**
 * The product library's editable shape — the option lists the reference page
 * offers, and the record ⇄ draft conversions the editors run either side of a
 * save.
 *
 * Every list here is copied from `Inventory.jsx` rather than derived from the
 * live rows, so mobile offers the same choices the web app does. Two of them
 * were checked against Postgres and match exactly (`processes.category` uses
 * all four non-"other" values; `patterns.category` uses two of the three), and
 * none of them is a closed set in the schema — the columns are plain text, so a
 * value typed on the web that is not on a list still round-trips untouched.
 */

import type {
  Fabric,
  FabricDraft,
  Process,
  ProcessDraft,
  TechPack,
  TechPackDraft,
} from './types';

/** `LibraryModal` fabrics tab + `FabricDrawer`. */
export const FABRIC_STATUSES = ['In Stock', 'Low Stock', 'Out of Stock'] as const;
export const FABRIC_TYPES = ['Fabric', 'Trim'] as const;

/** Reference `PROCESS_CATEGORIES`. */
export const PROCESS_CATEGORIES = ['printing', 'embellishment', 'construction', 'finishing', 'other'] as const;

/** Reference `COMMON_SIZES` / `GARMENT_CATEGORIES` / `SEASONS`, and the market switch. */
export const COMMON_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const;
export const GARMENT_CATEGORIES = ['Menswear', 'Womenswear', 'Kidswear'] as const;
export const SEASONS = ['Spring-Summer', 'Autumn-Winter', 'Winter', 'Summer'] as const;
export const MARKETS = ['UK', 'Nepal'] as const;

/** At most three fabric/lining rows on a spec sheet, same as upstream. */
export const MAX_TECH_PACK_FABRICS = 3;

const numText = (n: number): string => (n ? String(n) : '');

// ------------------------------------------------------------------ fabrics

export function fabricDraft(fabric: Fabric | null): FabricDraft {
  if (!fabric) {
    return {
      name: '', type: '', composition: '', supplier: '', gsm: '', weight: '',
      pricePerMeter: '', pricePerKg: '', colors: '', status: 'In Stock', notes: '', swatchUrl: '',
    };
  }
  return {
    name: fabric.name,
    type: fabric.type,
    composition: fabric.composition,
    supplier: fabric.supplier,
    gsm: numText(fabric.gsm),
    weight: fabric.weight,
    pricePerMeter: numText(fabric.pricePerMeter),
    pricePerKg: numText(fabric.pricePerKg),
    colors: fabric.colors.join(', '),
    status: fabric.status,
    notes: fabric.notes,
    swatchUrl: fabric.swatchUrl,
  };
}

/** Split the comma-separated colour input the way `available_colors` is stored. */
export function colorList(colors: string): string[] {
  return colors
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

/** A draft applied over the record it came from — what the list shows after a save. */
export function fabricFromDraft(id: string, draft: FabricDraft): Fabric {
  return {
    id,
    name: draft.name.trim(),
    type: draft.type.trim(),
    composition: draft.composition.trim(),
    supplier: draft.supplier.trim(),
    gsm: Number(draft.gsm) || 0,
    weight: draft.weight.trim(),
    pricePerMeter: Number(draft.pricePerMeter) || 0,
    pricePerKg: Number(draft.pricePerKg) || 0,
    colors: colorList(draft.colors),
    status: draft.status.trim(),
    notes: draft.notes.trim(),
    swatchUrl: draft.swatchUrl.trim(),
  };
}

// ---------------------------------------------------------------- processes

export function processDraft(process: Process | null): ProcessDraft {
  if (!process) {
    return { name: '', category: '', description: '', notes: '', costPerUnit: '', leadTimeDays: '', minQuantity: '' };
  }
  return {
    name: process.name,
    category: process.category,
    description: process.description,
    notes: process.notes,
    costPerUnit: numText(process.costPerUnit),
    leadTimeDays: numText(process.leadTimeDays),
    minQuantity: numText(process.minQuantity),
  };
}

export function processFromDraft(id: string, draft: ProcessDraft): Process {
  return {
    id,
    name: draft.name.trim(),
    category: draft.category.trim(),
    description: draft.description.trim(),
    notes: draft.notes.trim(),
    costPerUnit: Number(draft.costPerUnit) || 0,
    leadTimeDays: Number(draft.leadTimeDays) || 0,
    minQuantity: Number(draft.minQuantity) || 0,
  };
}

// --------------------------------------------------------------- tech packs

/**
 * `#KAZI007` after `#KAZI006`, the reference's `nextStyleCode`. Reads every
 * existing code rather than counting rows, so a deleted pack can't hand its
 * number to the next one.
 */
export function nextStyleNo(packs: TechPack[]): string {
  const numbers = packs
    .map((p) => parseInt(p.styleNo.replace(/\D/g, ''), 10))
    .filter((n) => Number.isFinite(n));
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `#KAZI${String(next).padStart(3, '0')}`;
}

export function techPackDraft(pack: TechPack | null, all: TechPack[] = []): TechPackDraft {
  if (!pack) {
    return {
      styleNo: nextStyleNo(all),
      name: '', productType: '', category: 'Menswear', season: '', market: '', designer: '',
      specSize: '', specDate: new Date().toISOString().slice(0, 10),
      sizes: [], measurements: [], fabrics: [{ fabricName: '', description: '' }],
      washCare: '', trims: '', remarks: '', notes: '',
      frontSketchUrl: '', backSketchUrl: '', techPackUrl: '', images: [],
    };
  }
  return {
    styleNo: pack.styleNo,
    name: pack.name,
    productType: pack.productType,
    category: pack.category,
    season: pack.season,
    market: pack.market,
    designer: pack.designer,
    specSize: pack.specSize,
    specDate: pack.specDate,
    sizes: [...pack.sizes],
    measurements: pack.measurements.map((m) => ({ ...m })),
    // Always at least one row to type into, like upstream's `fabricRows`.
    fabrics: pack.fabrics.length ? pack.fabrics.map((f) => ({ ...f })) : [{ fabricName: '', description: '' }],
    washCare: pack.washCare,
    trims: pack.trims,
    remarks: pack.remarks,
    notes: pack.notes,
    frontSketchUrl: pack.frontSketchUrl,
    backSketchUrl: pack.backSketchUrl,
    techPackUrl: pack.techPackUrl,
    images: [...pack.images],
  };
}

export function techPackFromDraft(id: string, draft: TechPackDraft): TechPack {
  return {
    id,
    styleNo: draft.styleNo.trim(),
    name: draft.name.trim(),
    productType: draft.productType.trim(),
    category: draft.category.trim(),
    season: draft.season.trim(),
    market: draft.market.trim(),
    designer: draft.designer.trim(),
    sizes: [...draft.sizes],
    specSize: draft.specSize.trim(),
    specDate: draft.specDate.trim(),
    trims: draft.trims.trim(),
    washCare: draft.washCare.trim(),
    remarks: draft.remarks.trim(),
    notes: draft.notes.trim(),
    // Empty rows are what an untouched "+ Add" leaves behind; they are dropped
    // on the way out rather than saved as blanks.
    fabrics: draft.fabrics.filter((f) => f.fabricName.trim() || f.description.trim()),
    measurements: draft.measurements.filter((m) => m.label.trim()),
    frontSketchUrl: draft.frontSketchUrl.trim(),
    backSketchUrl: draft.backSketchUrl.trim(),
    techPackUrl: draft.techPackUrl.trim(),
    images: [...draft.images],
  };
}

/**
 * Autofill for a spec sheet's fabric row: typing a name that exists in the
 * library fills the description from its composition and GSM, exactly as
 * `updateFabricRow` does upstream.
 */
export function fabricDescriptionFor(fabrics: Fabric[], name: string): string {
  const key = name.trim().toLowerCase();
  if (!key) return '';
  const match = fabrics.find((f) => f.name.toLowerCase() === key);
  if (!match) return '';
  return [match.composition, match.gsm ? `${match.gsm} GSM` : ''].filter(Boolean).join(', ');
}

/** The library swatch for a spec sheet's fabric row, when the name matches one. */
export function fabricSwatchFor(fabrics: Fabric[], name: string): string {
  const key = name.trim().toLowerCase();
  if (!key) return '';
  return fabrics.find((f) => f.name.toLowerCase() === key)?.swatchUrl ?? '';
}

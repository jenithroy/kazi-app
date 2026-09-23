// The maths behind a tech pack's material callouts: how much of each material
// an order needs, per size, with fabric wastage applied.
//
// Pure functions only. The tech pack editor, the "needs vs in stock" panel on
// the order form and the eventual deduction all lean on these, so the numbers
// live in one place and can be checked without a database.

export const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

// Where the material usage actually steps up. Staff: "Small देखि XL सम्म चाहिँ
// खासै त्यस्तो धेरै हुँदैन, तर Double XL, Triple XL... भयो भने चाहिँ अलि pricing
// नै change गर्नुपर्ने हुन्छ" -- S to XL is the industry-standard block and is
// costed as one, XXL upwards is not. The editor offers those two buckets, while
// the stored shape stays per size so an exception can always be typed in.
export const STANDARD_SIZES = ["XS", "S", "M", "L", "XL"];
export const LARGE_SIZES = ["XXL", "XXXL"];

export const CALLOUT_KINDS = [
  { value: "fabric",    label: "Fabric / rib" },
  { value: "trim",      label: "Thread & trims" },
  { value: "packaging", label: "Packaging" },
];

export const CALLOUT_UNITS = ["g", "kg", "m", "pcs"];

// The flat rate the factory adds to every order. Fabric only.
export const DEFAULT_WASTAGE_PCT = 10;

let seq = 0;
const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `c${Date.now()}-${++seq}`);

export function emptyCallout(side, x, y) {
  return {
    id: newId(),
    side,
    x, y,
    label: "",
    kind: "fabric",
    itemId: null,
    fabricId: null,
    qtyBySize: {},
    unit: "g",
    // Buttons are the reason this exists: they belong on the tech pack because
    // the factory needs to see them, but Kazi never buys them -- the vendor who
    // attaches them supplies them -- so they must never touch stock.
    fromStock: true,
    colorHex: "",
    note: "",
  };
}

/** Dots numbered 1..n down each side, so the picture and the list agree. */
export function numberedCallouts(callouts, side) {
  return (callouts || [])
    .filter(c => c.side === side)
    .map((c, i) => ({ ...c, n: i + 1 }));
}

/** The sizes a tech pack offers, in a sensible order, with a usable fallback. */
export function sizesFor(sizesAvailable) {
  const chosen = (sizesAvailable || []).filter(Boolean);
  const list = chosen.length ? chosen : SIZE_ORDER;
  return [...new Set(list)].sort(
    (a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b)
  );
}

/**
 * What ONE piece of this size uses.
 *
 * An empty box means "not used in this size" (a zip length that only applies
 * above XL, say), which is why a missing entry is 0 rather than inherited from
 * a neighbouring size -- inheriting would quietly invent consumption.
 */
export function qtyForSize(callout, size) {
  const v = Number(callout?.qtyBySize?.[size]);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** True once a callout could actually post a deduction. */
export function calloutIsUsable(callout) {
  if (!callout?.fromStock) return false;
  if (!callout.itemId && !callout.fabricId) return false;
  return Object.keys(callout.qtyBySize || {}).some(s => qtyForSize(callout, s) > 0);
}

/**
 * Total material for a whole order.
 *
 * `sizeBreakdown` is { S: 20, M: 40, ... } -- how many garments of each size.
 * Wastage is added to fabric only, and after the per-size sum rather than per
 * piece, so rounding cannot drift with order size.
 */
export function calloutTotal(callout, sizeBreakdown, wastagePct = DEFAULT_WASTAGE_PCT) {
  let total = 0;
  for (const [size, pieces] of Object.entries(sizeBreakdown || {})) {
    const n = Number(pieces);
    if (!Number.isFinite(n) || n <= 0) continue;
    total += qtyForSize(callout, size) * n;
  }
  if (callout?.kind === "fabric") {
    const pct = Number(wastagePct);
    total *= 1 + (Number.isFinite(pct) ? pct : DEFAULT_WASTAGE_PCT) / 100;
  }
  // stock_movements.qty is numeric(14,3).
  return Math.round(total * 1000) / 1000;
}

/**
 * Every material an order needs, one row per callout that can be deducted.
 * Callouts the vendor supplies, or that nobody has finished filling in, are
 * returned separately rather than dropped -- a material missing from a
 * deduction is worse than one that is flagged.
 */
export function orderMaterials(callouts, sizeBreakdown, wastagePct) {
  const lines = [];
  const skipped = [];
  for (const c of callouts || []) {
    const qty = calloutTotal(c, sizeBreakdown, wastagePct);
    if (!c.fromStock) { skipped.push({ callout: c, reason: "vendor supplies this" }); continue; }
    if (!c.itemId && !c.fabricId) { skipped.push({ callout: c, reason: "no material chosen" }); continue; }
    if (qty <= 0) { skipped.push({ callout: c, reason: "no quantity for these sizes" }); continue; }
    lines.push({
      calloutId: c.id,
      label: c.label || "Untitled",
      kind: c.kind,
      itemId: c.itemId || null,
      fabricId: c.fabricId || null,
      unit: c.unit,
      qty,
    });
  }
  return { lines, skipped };
}

/**
 * Which size column the printed spec sheet is showing.
 *
 * spec_size is free text typed by hand -- "Medium", "Extra Large (XL)", "M" --
 * so it is matched loosely against the sizes the tech pack offers. Returns null
 * when nothing matches, which leaves the typed `inch` alone.
 */
export function resolveSpecSizeKey(specSize, sizes) {
  const raw = String(specSize || "").trim();
  if (!raw) return null;
  const list = sizes?.length ? sizes : SIZE_ORDER;

  // "Extra Large (XL)" -- the parenthesised code is the most reliable part.
  const bracket = raw.match(/\(([^)]+)\)/)?.[1]?.trim().toUpperCase();
  if (bracket && list.includes(bracket)) return bracket;

  const upper = raw.toUpperCase();
  if (list.includes(upper)) return upper;

  const WORDS = {
    "EXTRA SMALL": "XS", "X SMALL": "XS", "XSMALL": "XS",
    SMALL: "S", MEDIUM: "M", LARGE: "L",
    "EXTRA LARGE": "XL", "X LARGE": "XL", "XLARGE": "XL",
    "DOUBLE EXTRA LARGE": "XXL", "2XL": "XXL", "XX LARGE": "XXL",
    "TRIPLE EXTRA LARGE": "XXXL", "3XL": "XXXL",
  };
  // Longest first, so "EXTRA LARGE" is not swallowed by "LARGE".
  for (const word of Object.keys(WORDS).sort((a, b) => b.length - a.length)) {
    if (upper.includes(word) && list.includes(WORDS[word])) return WORDS[word];
  }
  return null;
}

/**
 * Keeps each measurement's `inch` in step with its per-size numbers.
 *
 * The PRINTED spec sheet reads `inch`, and its output is a compliance artefact
 * that must not change, so per-size measurements cannot simply replace it. This
 * fills it from the size the sheet says it is quoting, and leaves a hand-typed
 * value alone when there is no per-size number to take its place.
 */
export function syncMeasurementInch(measurements, specSize, sizes) {
  const key = resolveSpecSizeKey(specSize, sizes);
  return (measurements || []).map(m => {
    if (!key) return m;
    const v = m.bySize?.[key];
    if (v === undefined || v === null || String(v).trim() === "") return m;
    return { ...m, inch: String(v) };
  });
}

/**
 * The free-text Fabrics/Linings rows the printed sheet shows, worked out from
 * the fabric callouts. Offered as a button rather than applied automatically:
 * the sheet's wording is the tech pack's own and overwriting it silently would
 * change a document somebody signed off.
 */
export function calloutsToFabricRows(callouts, fabrics, inventoryItems) {
  const seen = new Set();
  const rows = [];
  for (const c of callouts || []) {
    if (c.kind !== "fabric") continue;
    const fabric = c.fabricId ? (fabrics || []).find(f => f.id === c.fabricId) : null;
    const item = c.itemId ? (inventoryItems || []).find(i => i.id === c.itemId) : null;
    const name = fabric?.name || item?.item || c.label;
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const bits = [fabric?.composition, fabric?.gsm ? `${fabric.gsm} GSM` : ""].filter(Boolean);
    rows.push({ fabricName: name, description: bits.join(", ") });
    if (rows.length >= 3) break; // the sheet holds three
  }
  return rows;
}

/** Same idea for the Trims and Accessories box. */
export function calloutsToTrimsText(callouts, inventoryItems) {
  const parts = [];
  const seen = new Set();
  for (const c of callouts || []) {
    if (c.kind === "fabric") continue;
    const item = c.itemId ? (inventoryItems || []).find(i => i.id === c.itemId) : null;
    const name = item?.item || c.label;
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    parts.push(c.fromStock ? name : `${name} (supplied by vendor)`);
  }
  return parts.join(", ");
}

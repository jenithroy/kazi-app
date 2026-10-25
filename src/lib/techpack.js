/**
 * Tech packs: the plain logic. Nothing here draws anything or talks to the database, so every rule can be
 * reasoned about (and tested) on its own. The editor (components/techpack/), the printed sheet, the order form's
 * picker and the customer's card all read a tech pack through `readPack` and write one through `packPayload`,
 * so what a tech pack IS lives in this one file.
 *
 * A tech pack is a row of the `patterns` table (read through `fs_patterns`). Two generations of row exist:
 *
 *   format 1   the 32 packs made before 2026-10-24: a style number, a few text boxes (fabric rows, trims, remarks), one
 *              measurement per line in ONE size, a front and a back sketch, and often photographs of the paper tech pack
 *              (`tech_pack_images`). They keep working and keep printing; nothing here rewrites them.
 *   format 2   the sheet the factory actually uses (the Cavalls Studio technical sheets): who it is for, a header, the
 *              views, close-up details, materials with swatches, measurements drawn on the picture and set out per size,
 *              finishing, notes, and (when the garment has them) prints, labels and construction pictures.
 *
 * Words used throughout:
 *   view      one picture of the garment in the row of views at the top of the sheet (front photo, flat front, flat back, side)
 *   point     one measurement: a letter (A, B, C...), a name ("Chest width"), a number per size, and, when it was drawn, the
 *             two taps on a view that show where it is taken. The numbers are typed from the real garment; a photograph has
 *             no scale, so nothing is ever worked out from where the taps are.
 *   ref size  the size the measurement list on the sheet is read for ("MEASUREMENTS (cm) - SIZE M (REFERENCE)")
 *   dot       a tap position: fractions of the picture's own width and height (0 to 1), never pixels, so it lands in the same
 *             place on a laptop, a phone and a printout
 *
 * Measurements stay in the `measurements` column in the shape the first generation used, with more keys on each object, so a
 * reader that only knows `label` and `inch` still works: `inch` always holds the number for the ref size.
 */

/* ── Fixed lists ───────────────────────────────────────────────── */

export const CATEGORIES = ["Menswear", "Womenswear", "Kidswear", "Unisex"];
export const MARKETS = ["UK", "Nepal"];
export const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"];
export const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL"];
export const UNITS = [{ id: "cm", label: "cm" }, { id: "inch", label: "inch" }];

/** The views row at the top of the sheet. The caption printed under a view starts as its kind's label and can be changed. */
export const VIEW_KINDS = [
  { id: "reference", label: "Front view (reference photo)" },
  { id: "front", label: "Front view" },
  { id: "back", label: "Back view" },
  { id: "side", label: "Side view" },
  { id: "other", label: "Other view" },
];
export const MAX_VIEWS = 4;

export const MATERIAL_KINDS = [
  { id: "fabric", label: "Main fabric" },
  { id: "lining", label: "Lining" },
  { id: "rib", label: "Rib" },
  { id: "trim", label: "Trim" },
  { id: "button", label: "Button" },
  { id: "thread", label: "Thread" },
  { id: "label", label: "Label" },
  { id: "packaging", label: "Packaging" },
  { id: "other", label: "Other" },
];

/** Suggestions for the header's extra lines (Fit: Fitted, Length: Extra cropped). Any label can be typed. */
export const HEADER_LINE_HINTS = ["Fit", "Length", "Neckline", "Sleeve", "Closure", "Wash"];

/** Measurement names to start from. Only the names: where and how big is typed for each garment. */
export const MEASURE_TEMPLATES = [
  { id: "tshirt", label: "T-shirt", names: ["Total length", "Chest width", "Hem width", "Shoulder width", "Sleeve length", "Neck width", "Armhole"] },
  { id: "hoodie", label: "Hoodie / sweatshirt", names: ["Total length", "Chest width", "Hem width", "Shoulder width", "Sleeve length", "Cuff width", "Hood height"] },
  { id: "jacket", label: "Jacket", names: ["Total length", "Chest width", "Hem width", "Sleeve length", "Shoulder width", "Armhole"] },
  { id: "trousers", label: "Trousers", names: ["Total length", "Waist (relaxed)", "Hip", "Thigh", "Knee", "Leg opening", "Front rise", "Back rise"] },
  { id: "shorts", label: "Shorts", names: ["Total length", "Waist (relaxed)", "Hip", "Thigh", "Leg opening", "Front rise"] },
  { id: "dress", label: "Dress", names: ["Total length", "Chest width", "Waist", "Hip", "Shoulder width", "Sleeve length"] },
];

/** SS and AW codes for this year and next, then the plain words, for the Collection box to suggest. */
export function seasonHints(today = "") {
  const y = Number(String(today).slice(2, 4)) || new Date().getFullYear() % 100;
  const two = (n) => String(n).padStart(2, "0");
  return [`SS${two(y)}`, `AW${two(y)}`, `SS${two(y + 1)}`, `AW${two(y + 1)}`, "Spring-Summer", "Autumn-Winter"];
}

/* ── Small helpers ─────────────────────────────────────────────── */

let seq = 0;
/** An id for a picture, material or point. Made in the browser, kept inside the row's JSON. */
export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `t${Date.now().toString(36)}${(seq += 1).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const str = (v) => (v === null || v === undefined ? "" : String(v));
const list = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clamp01 = (n) => Math.min(1, Math.max(0, Number(n)));

/** "A", "B" ... "Z", "AA" ... for the nth (from 0) measurement. */
export function letterFor(n) {
  let i = Math.max(0, Math.floor(n));
  let out = "";
  do {
    out = String.fromCharCode(65 + (i % 26)) + out;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return out;
}

/** The sizes in the order a size chart reads them: XS before S before M ... Sizes nobody listed go last, alphabetically. */
export function sortSizes(sizes) {
  const seen = new Set();
  const clean = list(sizes).map((s) => str(s).trim()).filter((s) => s && !seen.has(s.toUpperCase()) && seen.add(s.toUpperCase()));
  const rank = (s) => { const i = SIZE_ORDER.indexOf(s.toUpperCase()); return i < 0 ? SIZE_ORDER.length : i; };
  return clean.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * Which standard size a typed size means: "Medium" and " m " are M, "Extra Large (XL)" is XL, "Double XL" is XXL.
 * Null when it is not one of them (the old spec-size box took anything).
 */
export function sizeKeyFrom(text) {
  let t = str(text).trim();
  if (!t) return null;
  const paren = /\(([^)]+)\)/.exec(t);
  if (paren) t = paren[1];
  t = t.toUpperCase().replace(/\s+/g, " ");
  if (SIZE_ORDER.includes(t)) return t;
  const words = {
    "SMALL": "S", "MEDIUM": "M", "LARGE": "L", "EXTRA SMALL": "XS", "XSMALL": "XS", "X-SMALL": "XS",
    "EXTRA LARGE": "XL", "XLARGE": "XL", "X-LARGE": "XL", "DOUBLE XL": "XXL", "2XL": "XXL", "XXXL": "3XL", "TRIPLE XL": "3XL", "XXXXL": "4XL",
  };
  return words[t] || null;
}

/** The size the list on the sheet is read for: M when the pack has it, else the middle one. */
export function defaultRefSize(sizes) {
  const s = list(sizes);
  if (!s.length) return "M";
  return s.includes("M") ? "M" : s[Math.floor((s.length - 1) / 2)];
}

/** A typed list, one item to a line, as lines: bullets and dashes in front are dropped, empty lines too. */
export function bullets(text) {
  return str(text).split(/\r?\n/).map((l) => l.replace(/^\s*[-*•‣◦]+\s*/, "").trim()).filter(Boolean);
}

/** Text with "\n" and "\r" collapsed to plain spaces, for one-line places (a card, a banner). */
export const oneLine = (v) => str(v).replace(/\s+/g, " ").trim();

/* ── Reading a row ─────────────────────────────────────────────── */

function readLine(l) {
  if (!isObj(l)) return null;
  const nums = ["x1", "y1", "x2", "y2"].map((k) => Number(l[k]));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return { x1: clamp01(nums[0]), y1: clamp01(nums[1]), x2: clamp01(nums[2]), y2: clamp01(nums[3]) };
}

function readPicture(p, i, prefix) {
  if (!isObj(p)) return null;
  return { id: str(p.id) || `${prefix}${i}`, url: str(p.url), caption: str(p.caption) };
}

function readViews(row, legacy) {
  const out = list(row.views).filter(isObj).map((v, i) => ({
    id: str(v.id) || `view${i}`,
    kind: VIEW_KINDS.some((k) => k.id === v.kind) ? v.kind : "other",
    label: str(v.label),
    url: str(v.url),
  }));
  if (out.length || !legacy) return out;
  // a first-generation pack has a front and a back sketch and no views
  const sketches = [];
  if (row.frontSketchUrl) sketches.push({ id: "legacy-front", kind: "front", label: "Front view", url: str(row.frontSketchUrl) });
  if (row.backSketchUrl) sketches.push({ id: "legacy-back", kind: "back", label: "Back view", url: str(row.backSketchUrl) });
  return sketches;
}

function readMaterials(row, legacy) {
  const out = list(row.materials).filter(isObj).map((m, i) => ({
    id: str(m.id) || `mat${i}`,
    kind: MATERIAL_KINDS.some((k) => k.id === m.kind) ? m.kind : "other",
    name: str(m.name),
    spec: str(m.spec),
    colour: str(m.colour),
    swatchUrl: str(m.swatchUrl),
    fabricId: m.fabricId ? str(m.fabricId) : null,       // reserved: the Materials & fabrics row this is, for the stock work to come
    itemId: m.itemId ? str(m.itemId) : null,             // reserved: the stock item it draws from
  }));
  if (out.length || !legacy) return out;
  // a first-generation pack: its fabric rows, then its trims, as plain lines
  const old = list(row.fabricRows).filter(isObj)
    .filter((r) => r.fabricName || r.description)
    .map((r, i) => ({ id: `legacy-fab${i}`, kind: i === 0 ? "fabric" : "lining", name: str(r.fabricName), spec: str(r.description), colour: "", swatchUrl: "", fabricId: null, itemId: null }));
  if (str(row.trims).trim()) old.push({ id: "legacy-trims", kind: "trim", name: "Trims and accessories", spec: str(row.trims), colour: "", swatchUrl: "", fabricId: null, itemId: null });
  return old;
}

function readPrints(row) {
  return list(row.prints).filter(isObj).map((p, i) => ({
    id: str(p.id) || `print${i}`,
    placement: str(p.placement), url: str(p.url), colour: str(p.colour), technique: str(p.technique), width: str(p.width),
  }));
}

/** The measurement lines, whichever generation wrote them. `ref` is the column a first-generation number is placed under. */
function readPoints(row, ref) {
  return list(row.measurements).filter(isObj).map((m, i) => {
    const values = {};
    if (isObj(m.bySize)) {
      for (const [k, v] of Object.entries(m.bySize)) if (str(v).trim() !== "") values[k] = str(v).trim();
    } else if (str(m.inch).trim() !== "") {
      values[ref] = str(m.inch).trim();
    }
    return {
      id: str(m.id) || `pt${i}`,
      letter: str(m.letter) || letterFor(i),
      label: str(m.label),
      values,
      view: m.view ? str(m.view) : null,
      line: readLine(m.line),
    };
  });
}

/** Whether an address is a picture (the same test lib/inventoryImages.js has, kept here so this file stays free of the storage client). */
const isImageUrl = (url) => {
  const u = str(url);
  return Boolean(u) && (u.startsWith("data:image/") || /\.(jpe?g|png|webp|gif)($|\?)/i.test(u) || u.includes("techpacks"));
};

/** The photographs of a paper tech pack. Older rows kept one picture in `tech_pack_url`: it comes first, so nothing disappears. */
function pagesOf(r) {
  const imgs = list(r.tech_pack_images).filter(Boolean).map(str);
  const single = str(r.tech_pack_url);
  return single && isImageUrl(single) && !imgs.includes(single) ? [single, ...imgs] : imgs;
}

/**
 * A row of `fs_patterns` as the rest of the app works with it: every list a list, every text a string, the two
 * generations folded into one shape. `legacy` is true for a first-generation pack.
 */
export function readPack(row) {
  const r = row || {};
  const sizes = sortSizes(r.sizes_available);
  const refSize = sizeKeyFrom(r.specSize) || defaultRefSize(sizes);
  const legacy = Number(r.sheetFormat || 1) < 2;
  const colours = Array.isArray(r.available_colors)
    ? r.available_colors.map((c) => (typeof c === "string" ? c : c?.name)).filter(Boolean).join(", ")
    : str(r.available_colors);
  return {
    id: r.id ? str(r.id) : "",
    legacy,
    customerId: r.customerId ? str(r.customerId) : "",
    brand: str(r.brand),
    name: str(r.name),
    styleNo: str(r.styleNo),
    season: str(r.season),
    specDate: str(r.specDate).slice(0, 10),
    category: str(r.category),
    productType: str(r.product_type),
    market: str(r.market),
    designerName: str(r.designerName),
    description: str(r.description),
    colour: colours,
    sizes,
    refSize,
    measureUnit: r.measureUnit === "inch" ? "inch" : "cm",
    headerLines: list(r.headerLines).filter(isObj).map((l) => ({ label: str(l.label), value: str(l.value) })),
    views: readViews(r, legacy),
    details: list(r.details).map((p, i) => readPicture(p, i, "det")).filter(Boolean),
    materials: readMaterials(r, legacy),
    prints: readPrints(r),
    construction: list(r.construction).map((p, i) => readPicture(p, i, "con")).filter(Boolean),
    labelling: list(r.labelling).map((p, i) => readPicture(p, i, "lab")).filter(Boolean),
    finishing: str(r.finishing),
    notes: str(r.notes),
    washCare: str(r.washCare),
    remarks: str(r.remarks),
    points: readPoints(r, refSize),
    brandLogoUrl: str(r.brandLogoUrl),
    pages: pagesOf(r),                                              // photographs of a paper tech pack (first generation)
    externalUrl: r.tech_pack_url && !isImageUrl(r.tech_pack_url) ? str(r.tech_pack_url) : "",   // a link to a file kept somewhere else
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
}

/** A pack with nothing in it yet, for the editor's "New tech pack". `customer` and `today` pre-fill what they know. */
export function blankPack({ customer = null, today = "", styleNo = "", market = "", sizes = DEFAULT_SIZES } = {}) {
  return {
    id: "", legacy: false,
    customerId: customer?.id ? str(customer.id) : "",
    brand: str(customer?.name),
    name: "", styleNo, season: "", specDate: str(today).slice(0, 10), category: "Menswear", productType: "", market,
    designerName: "", description: "", colour: "",
    sizes: sortSizes(sizes), refSize: defaultRefSize(sortSizes(sizes)), measureUnit: "cm",
    headerLines: [{ label: "Fit", value: "" }, { label: "Length", value: "" }],
    views: [], details: [], materials: [], prints: [], construction: [], labelling: [],
    finishing: "", notes: "", washCare: "", remarks: "", points: [], brandLogoUrl: "", pages: [], externalUrl: "",
  };
}

/* ── Writing a pack ────────────────────────────────────────────── */

const cleanPictures = (items) => list(items).filter((p) => p && p.url).map((p) => ({ id: p.id, url: p.url, caption: str(p.caption).trim() }));

/**
 * The keys to hand to `insertRow` / `updateRow("patterns", ...)` for a pack whose pictures are already saved (every picture has
 * a `url`; a picture that is still only a file on this computer is the writer's to upload first, see lib/techpackWrites.js).
 *
 * The old columns that the printed first-generation sheet and the PDF read are kept in step: the front and back sketch are the
 * first front and back view, and `inch` on each measurement is its number for the ref size.
 */
const payloadViews = (views) => list(views).filter((v) => v && v.url).map((v) => ({ id: v.id, kind: v.kind, label: str(v.label).trim(), url: v.url }));

export function packPayload(pack) {
  const views = payloadViews(pack.views);
  const front = views.find((v) => v.kind === "front") || views.find((v) => v.kind === "reference");
  const back = views.find((v) => v.kind === "back");
  const points = list(pack.points).filter((p) => p && (str(p.label).trim() || Object.keys(p.values || {}).length)).map((p, i) => ({
    id: p.id,
    letter: p.letter || letterFor(i),
    label: str(p.label).trim(),
    bySize: Object.fromEntries(Object.entries(p.values || {}).map(([k, v]) => [k, str(v).trim()]).filter(([, v]) => v !== "")),
    inch: str((p.values || {})[pack.refSize]).trim(),
    view: p.view || null,
    line: readLine(p.line),
  }));
  return {
    styleNo: str(pack.styleNo).trim(),
    name: str(pack.name).trim(),
    product_type: str(pack.productType).trim(),
    category: str(pack.category),
    season: str(pack.season).trim(),
    market: str(pack.market),
    designerName: str(pack.designerName).trim(),
    sizes_available: sortSizes(pack.sizes),
    available_colors: str(pack.colour).trim(),
    specSize: pack.refSize,
    specDate: pack.specDate || null,
    washCare: str(pack.washCare),
    notes: str(pack.notes),
    finishing: str(pack.finishing),
    description: str(pack.description).trim(),
    customerId: pack.customerId || null,
    brand: str(pack.brand).trim(),
    headerLines: list(pack.headerLines).map((l) => ({ label: str(l.label).trim(), value: str(l.value).trim() })).filter((l) => l.label && l.value),
    views,
    details: cleanPictures(pack.details),
    materials: list(pack.materials).filter((m) => m && (str(m.name).trim() || str(m.spec).trim())).map((m) => ({
      id: m.id, kind: m.kind, name: str(m.name).trim(), spec: str(m.spec).trim(), colour: str(m.colour).trim(),
      swatchUrl: str(m.swatchUrl), fabricId: m.fabricId || null, itemId: m.itemId || null,
    })),
    prints: list(pack.prints).filter((p) => p && (p.url || str(p.placement).trim() || str(p.technique).trim())).map((p) => ({
      id: p.id, placement: str(p.placement).trim(), url: str(p.url), colour: str(p.colour).trim(), technique: str(p.technique).trim(), width: str(p.width).trim(),
    })),
    construction: cleanPictures(pack.construction),
    labelling: cleanPictures(pack.labelling),
    measurements: points,
    measureUnit: pack.measureUnit === "inch" ? "inch" : "cm",
    brandLogoUrl: str(pack.brandLogoUrl),
    frontSketchUrl: front?.url || "",
    backSketchUrl: back?.url || "",
    // What the editor now holds replaces the old text boxes it folded in (fabric rows, trims), so they do not come back to life after a
    // person empties the list on purpose.
    fabricRows: [],
    trims: "",
    // A first-generation pack that is opened and saved moves onto the sheet only once it has everything; until then it stays "old format",
    // which is always usable on an order (a pack that is saved to fix a typo must not drop out of the order form).
    sheetFormat: pack.legacy && !completeness({ ...pack, legacy: false, views: payloadViews(views), points: pack.points }).ok ? 1 : 2,
  };
}

/* ── Measurements ──────────────────────────────────────────────── */

/** What a point says for a size ("" when nothing is typed). */
export const valueFor = (point, size) => str(point?.values?.[size]);

/** The list on the sheet for the ref size, as "A. Total length: 34". Points with no number for it still list their name. */
export function referenceLines(pack) {
  return list(pack.points).filter((p) => str(p.label).trim()).map((p) => ({
    letter: p.letter, label: p.label.trim(), value: valueFor(p, pack.refSize),
  }));
}

/** The columns of the size chart: the pack's sizes, plus any size a number was typed for that is no longer in the list. */
export function chartSizes(pack) {
  const extra = new Set();
  for (const p of list(pack.points)) for (const k of Object.keys(p.values || {})) if (!pack.sizes.includes(k)) extra.add(k);
  return pack.sizes.length || extra.size ? [...pack.sizes, ...sortSizes([...extra])] : [];
}

/** The points that were drawn on a view: what the sheet paints over that picture. */
export const drawnOn = (pack, viewId) => list(pack.points).filter((p) => p.line && p.view === viewId);

/* ── Who it is for ─────────────────────────────────────────────── */

/** The name printed on the sheet: the brand if one was typed, else the customer's name. */
export const brandName = (pack, customer) => str(pack.brand).trim() || str(customer?.name).trim();

/** The picture a card shows: the first reference or front view, else any view, else the first scanned page. */
export function coverUrl(pack) {
  const v = list(pack.views).filter((x) => x.url);
  const pick = v.find((x) => x.kind === "reference") || v.find((x) => x.kind === "front") || v[0];
  return pick?.url || pack.pages[0] || "";
}

/** "Cavalls Studio" or "Military cropped jacket" or the style number: what to call a pack when naming it in a list. */
export const packTitle = (pack) => str(pack.name).trim() || str(pack.styleNo).trim() || "Untitled tech pack";

/* ── Is it finished? ───────────────────────────────────────────── */

/**
 * What a new-format pack still needs before an order can be made from it: who it is for, what it is called and its
 * reference, the collection, category, sizes and colour, at least one picture, one material and one measurement that has a
 * number for the ref size. `section` is the editor section to take the person to.
 *
 * A first-generation pack (made before this existed) is never asked for more: it stays usable as it is.
 */
export function completeness(pack) {
  const need = [];
  const add = (section, text) => need.push({ section, text });
  if (pack.legacy) return { ok: true, missing: need, done: 0, total: 0, legacy: true };
  if (!pack.customerId) add("sheet", "who it is for");
  if (!str(pack.name).trim()) add("sheet", "a name");
  if (!str(pack.styleNo).trim()) add("sheet", "a reference");
  if (!str(pack.season).trim()) add("sheet", "the collection");
  if (!str(pack.category).trim()) add("sheet", "a category");
  if (!pack.sizes.length) add("sheet", "its sizes");
  if (!str(pack.colour).trim()) add("sheet", "the colour");
  if (!list(pack.views).some((v) => v.url || v.file)) add("pictures", "a picture of the garment");
  if (!list(pack.materials).some((m) => str(m.name).trim())) add("materials", "a material");
  if (!list(pack.points).some((p) => str(p.label).trim() && valueFor(p, pack.refSize))) add("measurements", `a measurement for size ${pack.refSize}`);
  const total = 10;
  return { ok: need.length === 0, missing: need, done: total - need.length, total, legacy: false };
}

/** Whether an order can be made from it: a finished new-format pack, or any first-generation one. */
export const usableOnOrder = (pack) => completeness(pack).ok;

/** "needs a picture and a material": the missing list as words. */
export function missingWords(c) {
  const t = c.missing.map((m) => m.text);
  if (t.length <= 1) return t[0] || "";
  return `${t.slice(0, -1).join(", ")} and ${t[t.length - 1]}`;
}

/* ── Searching ─────────────────────────────────────────────────── */

/** What a search box matches a pack on: name, reference, brand, collection, colour, category, material names. */
export function searchText(pack, customer) {
  return [
    pack.name, pack.styleNo, pack.brand, customer?.name, pack.season, pack.colour, pack.category, pack.productType,
    ...pack.materials.map((m) => m.name),
  ].map(str).join(" ").toLowerCase();
}

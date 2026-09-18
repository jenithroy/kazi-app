// Turns a recipe into the stock deductions for one production order. Pure
// functions only: the confirm dialog and the ledger both lean on these, so the
// maths lives in one place.

export const LINE_KINDS = [
  { value: "fabric",    label: "Fabric / rib" },
  { value: "trim",      label: "Thread & trims" },
  { value: "packaging", label: "Packaging" },
];

export const LINE_UNITS = ["g", "kg", "m", "pcs"];

export const DEFAULT_WASTAGE_PCT = 10;

// Where each kind of material normally lives in Inventory, used to pre-select an
// item and to sort the picker. Never used to hide an item: a miscategorised
// item must still be pickable.
const KIND_CATEGORIES = {
  fabric:    ["Fabric", "Raw Materials"],
  trim:      ["Thread & Accessories", "Raw Materials", "Consumables"],
  packaging: ["Packaging", "Consumables"],
};

// Inventory units are free text, so "Kg", "kgs" and "KG." all have to mean kg.
const UNIT_ALIASES = new Map([
  ["g", "g"], ["gm", "g"], ["gms", "g"], ["gram", "g"], ["grams", "g"],
  ["kg", "kg"], ["kgs", "kg"], ["kilo", "kg"], ["kilogram", "kg"], ["kilograms", "kg"],
  ["m", "m"], ["mtr", "m"], ["mtrs", "m"], ["meter", "m"], ["meters", "m"], ["metre", "m"], ["metres", "m"],
  ["pcs", "pcs"], ["pc", "pcs"], ["piece", "pcs"], ["pieces", "pcs"], ["unit", "pcs"], ["units", "pcs"], ["nos", "pcs"],
]);

const GRAMS_PER = new Map([["g", 1], ["kg", 1000]]);

export function normalizeUnit(unit) {
  const u = String(unit || "").trim().toLowerCase().replace(/\.$/, "");
  return UNIT_ALIASES.get(u) || u;
}

// Weight converts between g and kg; every other pair is only valid when the
// units already match. Length to weight (metres of fabric vs grams) needs the
// fabric's width and GSM, which we do not have, so it returns null and the
// caller asks the person to type the amount in the item's own unit.
export function convertQty(qty, fromUnit, toUnit) {
  const n = Number(qty);
  if (!Number.isFinite(n)) return null;
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return n;
  if (GRAMS_PER.has(from) && GRAMS_PER.has(to)) return (n * GRAMS_PER.get(from)) / GRAMS_PER.get(to);
  return null;
}

// stock_movements.qty is numeric(14,3).
export const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

// The key production deductions are filed under: the human order number
// (ORD-051), falling back to the row id for an order that never got one.
export const orderRefOf = (order) => order?.orderId || order?.id || "";

const norm = (s) => String(s || "").trim().toLowerCase();

// Amount of one recipe line for a batch, in the line's own unit. Sizes S to XL
// use `qty`; XXL and above use `qtyLarge` (falling back to `qty` when the recipe
// has no separate figure). Wastage only applies to fabric.
export function plannedLineQty(line, { stdPieces = 0, largePieces = 0, wastagePct = 0 }) {
  const std = Number(line?.qty) || 0;
  const hasLarge = line?.qtyLarge !== null && line?.qtyLarge !== undefined && line?.qtyLarge !== "";
  const large = hasLarge ? Number(line.qtyLarge) || 0 : std;
  const base = std * (Number(stdPieces) || 0) + large * (Number(largePieces) || 0);
  const waste = line?.kind === "fabric" ? 1 + (Number(wastagePct) || 0) / 100 : 1;
  return base * waste;
}

// Resolves every row of the confirm dialog: which item it draws from and the
// amount that will be posted. A row that cannot be posted yet is flagged
// (`needsItem`: an amount but no item; `needsAmount`: the recipe unit cannot be
// converted into the item's unit) rather than skipped, so a deduction is never
// quietly smaller than what was used. `balanceOf(item)` supplies stock on hand.
export function resolveRows(rows, { itemById, stdPieces, largePieces, wastagePct, balanceOf }) {
  const perRow = rows.map(row => {
    const item = itemById.get(row.itemId) || null;
    const typed = row.qtyOverride !== "";
    const typedNum = Number(row.qtyOverride);
    const plannedRaw = row.line ? plannedLineQty(row.line, { stdPieces, largePieces, wastagePct }) : null;
    let qty = 0, needsAmount = false, needsItem = false;
    if (typed) {
      qty = Number.isFinite(typedNum) && typedNum > 0 ? typedNum : 0;
      needsItem = qty > 0 && !item;
    } else if (row.line) {
      if (!item) {
        needsItem = plannedRaw > 0;
      } else {
        const converted = convertQty(plannedRaw, row.unit, item.unit);
        if (converted === null) needsAmount = plannedRaw > 0;
        else qty = round3(converted);
      }
    }
    return { row, item, plannedRaw, qty, needsAmount, needsItem };
  });

  // Two rows can draw from the same item (main fabric and rib off one roll), so
  // the below-zero check has to look at the sum, not each row alone.
  const totals = new Map();
  const balances = new Map();
  for (const r of perRow) {
    if (!r.item) continue;
    if (r.qty > 0) totals.set(r.item.id, (totals.get(r.item.id) || 0) + r.qty);
    if (!balances.has(r.item.id)) balances.set(r.item.id, balanceOf(r.item));
  }
  return { perRow, totals, balances };
}

// The recipe for an order: exact style-name match, else the recipe whose name
// appears inside the style (style names on orders often carry extra words). When
// several do, the longest name wins if it is strictly the most specific — "Zip
// Hoodie" over "Hoodie" for "Kids Zip Hoodie XL". Anything still ambiguous
// returns null so the person picks.
export function matchRecipe(recipes, styleName) {
  const style = norm(styleName);
  if (!style) return null;
  const exact = recipes.find(r => norm(r.name) === style);
  if (exact) return exact;

  const inStyle = recipes
    .filter(r => { const name = norm(r.name); return name && style.includes(name); })
    .sort((a, b) => norm(b.name).length - norm(a.name).length);
  if (inStyle.length === 1) return inStyle[0];
  if (inStyle.length > 1) return norm(inStyle[0].name).length > norm(inStyle[1].name).length ? inStyle[0] : null;

  const styleInName = recipes.filter(r => norm(r.name).includes(style));
  return styleInName.length === 1 ? styleInName[0] : null;
}

// Which inventory item a recipe line should start on. A default saved on the
// recipe line wins. Fabric stock is tracked per colour, so it is only guessed
// when exactly one fabric item names both the order's fabric type and colour;
// anything ambiguous stays empty for the person to choose, because a wrong
// pre-selection quietly deducts from the wrong roll.
export function suggestItem(line, order, items) {
  if (line?.itemId && items.some(i => i.id === line.itemId)) return line.itemId;
  if (line?.kind !== "fabric") return "";
  const type = norm(order?.fabricType);
  const colour = norm(order?.colorway);
  if (!type || !colour) return "";
  const hits = items.filter(i => {
    const name = norm(i.item);
    return KIND_CATEGORIES.fabric.includes(i.category) && name.includes(type) && name.includes(colour);
  });
  return hits.length === 1 ? hits[0].id : "";
}

// Items a recipe or deduction can draw from: everything that is not a finished
// product or equipment/office stock, with the categories that usually hold this
// kind of material first.
export function materialItems(items, kind) {
  const preferred = KIND_CATEGORIES[kind] || [];
  return items
    .filter(i => i.category !== "Finished Goods" && i.category !== "Equipment" && i.category !== "Office Supplies")
    .sort((a, b) => {
      const pa = preferred.includes(a.category) ? 0 : 1;
      const pb = preferred.includes(b.category) ? 0 : 1;
      return pa - pb || String(a.item || "").localeCompare(String(b.item || ""));
    });
}

export function emptyRecipeLine() {
  return { kind: "fabric", label: "", itemId: null, qty: "", qtyLarge: "", unit: "g" };
}

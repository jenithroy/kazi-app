/**
 * Inventory & Library: the sums and small facts the page and its cards share.
 *
 * Nothing here touches the database or the screen. Every formula is the one the old page used (moved,
 * not changed), so a stock balance, a cost per piece and a ledger line come out the same as they always did.
 */
import { itemMovements, movementTotals } from "../utils/stockLedger";

export const STOCK_CATEGORIES = [
  "Raw Materials", "Fabric", "Thread & Accessories", "Packaging",
  "Equipment", "Consumables", "Finished Goods", "Office Supplies", "Other",
];
export const PROCESS_CATEGORIES = ["printing", "embellishment", "construction", "finishing", "other"];
export const COMMON_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
export const SAMPLE_STAGES = ["Proto", "Fit", "Size-Set", "PP", "Shipment"];
export const SAMPLE_STATUSES = ["Pending", "Approved", "Rejected", "In Revision"];
export const FABRIC_STATUSES = ["In Stock", "Low Stock", "Out of Stock"];

/** The next item code: #kazi1001, #kazi1002 … (or IT001 when none has the #kazi form). Company-wide, not per region. */
export function nextItemId(rows) {
  const kaziRows = rows.filter((r) => r.itemId && r.itemId.toLowerCase().includes("kazi"));
  if (kaziRows.length > 0) {
    const nums = kaziRows.map((r) => parseInt(r.itemId.replace(/\D/g, ""), 10)).filter((n) => !isNaN(n));
    const nextNum = nums.length ? Math.max(...nums) + 1 : 1001;
    return `#kazi${nextNum}`;
  }
  const nums = rows.map((r) => parseInt((r.itemId || "ITEM000").replace(/\D/g, ""), 10)).filter((n) => !isNaN(n));
  return `IT${String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, "0")}`;
}

/* ── Stock ──────────────────────────────────────────────────────── */

/** Opening + In − Out, replayed from the item's dated movements. */
export function stockOf(row, movements) {
  const { inTotal, outTotal } = movementTotals(movements, row.id);
  const opening = Number(row?.openingStock || 0);
  return { opening, inTotal, outTotal, closing: opening + inTotal - outTotal };
}

/** Every item's in and out totals in one pass over the movements (a table asks about every row, so asking one by one is slow). */
export function movementIndex(movements) {
  const idx = new Map();
  for (const m of movements) {
    const e = idx.get(m.itemId) || { inTotal: 0, outTotal: 0 };
    if (m.direction === "in") e.inTotal += Number(m.qty || 0);
    else if (m.direction === "out") e.outTotal += Number(m.qty || 0);
    idx.set(m.itemId, e);
  }
  return idx;
}

/** One row of the stock table: the item's numbers, how it stands against its reorder level, and what it is worth. */
export function stockRow(row, idx) {
  const t = idx.get(row.id) || { inTotal: 0, outTotal: 0 };
  const opening = Number(row.openingStock || 0);
  const closing = opening + t.inTotal - t.outTotal;
  return { id: row.id, row, opening, inTotal: t.inTotal, outTotal: t.outTotal, closing, value: closing * Number(row.unitCostNPR || 0), ...stockState(closing, row.minLevel) };
}

/**
 * Where an item stands against its reorder level. `low` is the old "LOW / REORDER" test (balance at or under
 * the level, so an item with a level of 0 and nothing left is low too); `state` names how bad it is.
 */
export function stockState(closing, minLevel) {
  const min = Number(minLevel || 0);
  const low = closing <= min;
  const state = closing < 0 ? "negative" : closing === 0 ? "out" : low ? "low" : "ok";
  return { low, state };
}

export const STOCK_STATE_LABEL = { negative: "Below zero", out: "Out", low: "Low", ok: "" };

/** The per-size reconciliation rows an item carries (the "Kati Pugena" notebook pages), or a blank run. */
export function sizeRowsOf(row) {
  return Array.isArray(row?.sizeRows) && row.sizeRows.length
    ? row.sizeRows
    : COMMON_SIZES.map((s) => ({ size: s, required: 0, counted: 0 }));
}

/* ── Cost per piece ─────────────────────────────────────────────── */

export function findFabricByName(fabrics, name) {
  const n = (name || "").trim().toLowerCase();
  if (!n) return null;
  return fabrics.find((f) => (f.name || "").trim().toLowerCase() === n) || null;
}

/** Fabric is bought by weight (₨ per 1000 g): what the grams a piece uses cost, or null when the material has no price. */
export function computeFabricCost(fabrics, fabricName, gramsUsed) {
  const match = findFabricByName(fabrics, fabricName);
  const grams = Number(gramsUsed);
  if (match && match.pricePerKg && grams > 0) {
    return Math.round((Number(match.pricePerKg) / 1000) * grams * 100) / 100;
  }
  return null;
}

const COST_PARTS = [["fabric", "Fabric"], ["rib", "Rib"], ["trims", "Trims"], ["directLabour", "Labour"], ["others", "Others"]];

/**
 * What a piece costs and what it earns. `c` holds numbers (fabric, rib, trims, directLabour, others, targetPrice).
 * `driver` is the biggest part of the cost; `target50` is the price that gives a 50% margin (twice the cost).
 */
export function costOf(c) {
  const parts = COST_PARTS.map(([key, name]) => ({ key, name, val: Number(c[key] || 0) }));
  const cogs = parts.reduce((s, p) => s + p.val, 0);
  const targetPrice = Number(c.targetPrice || 0);
  const gp = targetPrice - cogs;
  const marginPct = targetPrice > 0 ? (gp / targetPrice) * 100 : 0;
  const top = parts.slice().sort((a, b) => b.val - a.val)[0];
  const driver = cogs > 0 && top.val > 0 ? { name: top.name, pct: (top.val / cogs) * 100 } : null;
  // the same colour rule the sheet always had: under zero is bad, under 30% is a warning, else good
  const tone = targetPrice > 0 ? (marginPct < 0 ? "bad" : marginPct < 30 ? "warn" : "good") : null;
  return { parts, cogs, targetPrice, gp, marginPct, driver, tone, target50: cogs * 2 };
}

/** The cost sheet row of an item as plain numbers (the saved record, nothing drafted). */
export function savedCost(econ) {
  const e = econ || {};
  return {
    fabric: Number(e.fabric || 0), rib: Number(e.rib || 0), trims: Number(e.trims || 0),
    directLabour: Number(e.directLabour || 0), others: Number(e.others || 0), targetPrice: Number(e.targetPrice || 0),
  };
}

/* ── The product-wise stock ledger ──────────────────────────────── */

/**
 * Opening + In − Out = Closing for each item over a period, valued at its unit cost. A period's opening is the replay
 * of every movement dated before it, so no separate "opening stock rollover" is needed.
 */
export function stockLedgerReportRows(rows, movements, fromDate, toDate) {
  return rows.map((row) => {
    const all = itemMovements(movements, row.id);
    let openingQty = Number(row.openingStock || 0);
    let inQty = 0, outQty = 0, inAmount = 0, outAmount = 0;
    const unitCost = Number(row.unitCostNPR || 0);
    for (const m of all) {
      const qty = Number(m.qty || 0);
      if (m.date < fromDate) {
        openingQty += m.direction === "in" ? qty : -qty;
      } else if (m.date <= toDate) {
        // Real purchase/sale value when the movement carries one; movements
        // logged before amountNPR existed fall back to qty × unit cost.
        const amount = m.amountNPR != null ? Number(m.amountNPR) : qty * unitCost;
        if (m.direction === "in") { inQty += qty; inAmount += amount; }
        else { outQty += qty; outAmount += amount; }
      }
    }
    const closingQty = openingQty + inQty - outQty;
    return {
      id: row.id, item: row.item, category: row.category || "Other", unit: row.unit || "",
      openingQty, inQty, outQty, closingQty,
      inAmount, outAmount, closingAmount: closingQty * unitCost,
    };
  });
}

const ZERO = { openingQty: 0, inQty: 0, inAmount: 0, outQty: 0, outAmount: 0, closingQty: 0, closingAmount: 0 };
export function addLedger(a, b) {
  return {
    openingQty: a.openingQty + b.openingQty, inQty: a.inQty + b.inQty, inAmount: a.inAmount + b.inAmount,
    outQty: a.outQty + b.outQty, outAmount: a.outAmount + b.outAmount,
    closingQty: a.closingQty + b.closingQty, closingAmount: a.closingAmount + b.closingAmount,
  };
}

/** The report's rows grouped by category, each group with its subtotal, in the order the categories are listed. */
export function groupLedger(reportRows) {
  const byCategory = new Map();
  for (const r of reportRows) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category).push(r);
  }
  const order = [...STOCK_CATEGORIES, ...[...byCategory.keys()].filter((c) => !STOCK_CATEGORIES.includes(c))];
  const groups = order.filter((c) => byCategory.has(c)).map((category) => {
    const items = byCategory.get(category);
    return { category, items, sub: items.reduce(addLedger, ZERO) };
  });
  return { groups, grand: reportRows.reduce(addLedger, ZERO) };
}

// stock_movements.qty holds three decimals, so a quantity shown in a table or a card keeps up to three
export const fmtQty = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 3 });
// the ledger report has always shown two, on screen and on paper
export const fmtLedgerQty = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * A price on a library row (₨/kg, ₨/unit, a sample's cost). In rupees it reads "₨ 450" exactly as it always has. In any
 * other currency it keeps the pence: the headline `fmt` rounds to whole units, which would turn a ₨15 process into "£0/unit".
 * `cur` is what useCurrency() returns.
 */
export function priceText({ currency, fmt, money }, npr) {
  return currency !== "NPR" ? money(npr) : fmt(npr);
}

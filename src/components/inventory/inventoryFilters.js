/**
 * What the Filters panel offers on each tab of the Inventory & library page (components/filters: the button, the panel and the engine).
 * Each tab lists different rows, so each has its own set (and the page keeps each tab's choices while you move between them); the side
 * of the business is the same everywhere and is the panel's own. Every filter reads a field the rows already hold.
 *
 *   Stock          stock level (the old "All / Low" and three finer cuts), category, supplier, where it is kept, unit, what it is worth,
 *                  no cost price, nothing moved in 90 days
 *   Items cost     the same stock level, margin, whether a cost has been entered, category, cost a piece, what it sells for
 *   Stock ledger   the report's period (the From / To and "This month / Last month" that used to sit over the table), whether the item moved,
 *                  its closing balance, category, unit, what the closing stock is worth
 *   Fabrics        weight (the old "All / Heavy / Light"), status, composition, supplier, GSM, price a kg, no price set
 *   Processes      category, cost a unit, minimum order, lead time
 *   Tech packs     whether the sheet is complete, customer, collection, category, product type, designer, size, has pictures, has measurements, has orders
 *   Samples        stage, status, product type, fabric used, colour, size, cost, has a photo
 *
 * A name people type (a supplier, a fabric) is grouped without caring about capitals (lib/foldNames.js), and a list that no row
 * has anything for (nobody has put a supplier on anything) is not drawn.
 */
import foldNames from "../../lib/foldNames";
import { FABRIC_STATUSES, SAMPLE_STAGES, SAMPLE_STATUSES, costOf, savedCost } from "../../lib/inventory";
import { addDays } from "../../lib/calendar";

const text = (v) => String(v ?? "").trim();
const some = (rows, get) => rows.some((r) => text(get(r)) !== "");
const cap = (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);

/** A list of what the rows hold in a free-text field; nothing at all when no row holds any. */
function names(rows, get, { id, label, any, none }) {
  if (!some(rows, get)) return null;
  const f = foldNames(rows, get);
  return { id, label, kind: "select", of: (r) => f.keyOf(get(r)), nameOf: f.nameOf, any, none };
}

/** A list of the values a field holds, as they are written (a category picked from a list). */
function values(rows, get, { id, label, any, none, nameOf }) {
  if (!some(rows, get)) return null;
  return { id, label, kind: "select", of: (r) => text(get(r)), any, none, ...(nameOf ? { nameOf } : {}) };
}

/** A list of the values an array field holds (a tech pack carries several sizes): the row is under each of them. */
function listed(rows, get, { id, label, any, none }) {
  if (!rows.some((r) => [].concat(get(r) ?? []).some((v) => text(v)))) return null;
  return { id, label, kind: "select", of: (r) => [].concat(get(r) ?? []).map(text).filter(Boolean), any, none };
}

/** All / Low / Out / Below zero / Enough. "Low" is the old filter, and the header's "N low": at or under the reorder level, which includes the other two. */
const stockLevel = {
  id: "level", label: "Stock level", kind: "chips",
  options: [
    { value: "all", label: "All" },
    { value: "low", label: "Low", tone: "warn" },
    { value: "out", label: "Out" },
    { value: "negative", label: "Below zero", tone: "bad" },
    { value: "ok", label: "Enough" },
  ],
  test: (s, v) => (v === "low" ? s.low : s.state === v),
};

/* ── Stock ──────────────────────────────────────────────────────── */

/** `stock` are stockRow()s; `lastMoved` maps an item's id to the day of its latest movement. */
export function stockFilters({ stock, today, lastMoved }) {
  const cutoff = addDays(today, -90);
  return [
    stockLevel,
    values(stock, (s) => s.row.category, { id: "category", label: "Category", any: "Any category", none: "No category" }),
    names(stock, (s) => s.row.supplier, { id: "supplier", label: "Supplier", any: "Any supplier", none: "No supplier" }),
    names(stock, (s) => s.row.location, { id: "where", label: "Kept at", any: "Anywhere", none: "No place given" }),
    names(stock, (s) => s.row.unit, { id: "unit", label: "Unit", any: "Any unit", none: "No unit" }),
    names(stock, (s) => s.row.owner, { id: "owner", label: "Whose goods", any: "Anyone's", none: "Our own" }),
    { id: "worth", label: "Worth", kind: "range", get: (s) => (s.row.unitCostNPR ? s.value : null), unit: "NPR", pill: "Worth" },
    { id: "nocost", label: "No cost price", kind: "toggle", text: "No cost price set", pill: "No cost price", test: (s) => !Number(s.row.unitCostNPR) },
    {
      id: "idle", label: "Nothing moved in 90 days", kind: "toggle", text: "Nothing moved in 90 days", pill: "Idle for 90 days",
      test: (s) => s.closing > 0 && !((lastMoved.get(s.id) || "") >= cutoff),
    },
  ].filter(Boolean);
}

/* ── Items cost ─────────────────────────────────────────────────── */

/** `costById` maps an item's id to costOf(its saved cost sheet): what a piece costs, what it sells for, and the margin's tone. */
export function costFilters({ stock, costById }) {
  const cost = (s) => costById.get(s.id) || costOf(savedCost(null));
  return [
    stockLevel,
    {
      // the tones are the table's own: under zero is bad, under 30% a warning, the rest good; no selling price, no tone
      id: "margin", label: "Margin", kind: "chips",
      options: [
        { value: "any", label: "Any" },
        { value: "good", label: "30% or more" },
        { value: "warn", label: "Under 30%", tone: "warn" },
        { value: "bad", label: "Losing money", tone: "bad" },
        { value: "none", label: "No selling price" },
      ],
      test: (s, v) => (v === "none" ? !cost(s).tone : cost(s).tone === v),
    },
    {
      id: "costed", label: "Cost entered", kind: "chips",
      options: [{ value: "any", label: "Any" }, { value: "yes", label: "Has a cost" }, { value: "no", label: "No cost yet" }],
      test: (s, v) => (cost(s).cogs > 0) === (v === "yes"),
    },
    values(stock, (s) => s.row.category, { id: "category", label: "Category", any: "Any category", none: "No category" }),
    { id: "cogs", label: "Cost a piece", kind: "range", get: (s) => (cost(s).cogs > 0 ? cost(s).cogs : null), unit: "NPR", pill: "Cost a piece" },
    { id: "price", label: "Sells for", kind: "range", get: (s) => (cost(s).targetPrice > 0 ? cost(s).targetPrice : null), unit: "NPR", pill: "Sells for" },
  ].filter(Boolean);
}

/* ── Stock ledger ───────────────────────────────────────────────── */

/**
 * `report` are the ledger's lines (lib/inventory.js stockLedgerReportRows) for the period on screen. The period itself is the page's
 * (the report's opening balance is worked out from it), so it is drawn here but kept by the page: `from`, `to`, `onFrom`, `onTo`.
 */
export function ledgerFilters({ report, today, from, to, onFrom, onTo }) {
  const monthStart = today.slice(0, 8) + "01";
  const lastEnd = addDays(monthStart, -1);
  const lastStart = lastEnd.slice(0, 8) + "01";
  const preset = from === monthStart && to === today ? "month" : from === lastStart && to === lastEnd ? "last" : "";
  return [
    {
      id: "period", label: "Period", kind: "chips",
      controlled: { value: preset, set: (v) => { onFrom(v === "month" ? monthStart : lastStart); onTo(v === "month" ? today : lastEnd); } },
      options: [{ value: "month", label: "This month" }, { value: "last", label: "Last month" }],
    },
    {
      // the report is always between two days, so clearing a box puts back what the page starts with: the 1st of the month (of the other day), and today
      id: "between", label: "Between", kind: "dates", get: () => "",
      controlled: {
        value: { from, to },
        set: (v) => { onFrom(v.from || `${(v.to || today).slice(0, 8)}01`); onTo(v.to || (v.from > today ? v.from : today)); },
      },
    },
    {
      id: "moved", label: "In this period", kind: "chips",
      options: [
        { value: "all", label: "All items" },
        { value: "moved", label: "Moved" },
        { value: "in", label: "Stock came in" },
        { value: "out", label: "Stock went out" },
        { value: "still", label: "Did not move" },
      ],
      test: (r, v) => (v === "in" ? r.inQty > 0 : v === "out" ? r.outQty > 0 : (r.inQty > 0 || r.outQty > 0) === (v === "moved")),
    },
    {
      id: "balance", label: "Closing balance", kind: "chips",
      options: [
        { value: "any", label: "Any" },
        { value: "above", label: "Above zero" },
        { value: "zero", label: "Nothing left" },
        { value: "below", label: "Below zero", tone: "bad" },
      ],
      test: (r, v) => (v === "above" ? r.closingQty > 0 : v === "zero" ? r.closingQty === 0 : r.closingQty < 0),
    },
    values(report, (r) => r.category, { id: "category", label: "Category", any: "Any category", none: "No category" }),
    names(report, (r) => r.unit, { id: "unit", label: "Unit", any: "Any unit", none: "No unit" }),
    { id: "worth", label: "Closing worth", kind: "range", get: (r) => r.closingAmount, unit: "NPR", pill: "Closing worth" },
  ].filter(Boolean);
}

/* ── The library ────────────────────────────────────────────────── */

export function fabricFilters({ fabrics }) {
  return [
    {
      // the old chips, with the same two cuts: heavy is over 300 GSM, light under 200; a fabric with no GSM is in neither
      id: "weight", label: "Weight", kind: "chips",
      options: [
        { value: "all", label: "All" },
        { value: "heavy", label: "Heavy, over 300 GSM" },
        { value: "light", label: "Light, under 200 GSM" },
      ],
      test: (r, v) => r.gsm !== null && (v === "heavy" ? r.gsm > 300 : r.gsm < 200),
    },
    {
      id: "status", label: "Status", kind: "chips",
      options: [{ value: "any", label: "Any" }, ...FABRIC_STATUSES.map((s) => ({ value: s, label: s, tone: s === "In Stock" ? undefined : s === "Low Stock" ? "warn" : "bad" }))],
      test: (r, v) => (r.status || "In Stock") === v,
    },
    names(fabrics, (f) => f.composition, { id: "composition", label: "Composition", any: "Any composition", none: "No composition" }),
    names(fabrics, (f) => f.supplier, { id: "supplier", label: "Supplier", any: "Any supplier", none: "No supplier" }),
    { id: "gsm", label: "GSM", kind: "range", get: (r) => r.gsm, unit: "GSM" },
    { id: "price", label: "Price a kg", kind: "range", get: (r) => r.pricePerKg, unit: "NPR", pill: "Price a kg" },
    { id: "noprice", label: "No price set", kind: "toggle", text: "No price set", pill: "No price", test: (r) => r.pricePerKg == null },
  ].filter(Boolean);
}

export function processFilters({ processes }) {
  return [
    values(processes, (r) => r.category, { id: "category", label: "Category", any: "Any category", none: "No category", nameOf: cap }),
    { id: "cost", label: "Cost a unit", kind: "range", get: (r) => r.cost_per_unit, unit: "NPR", pill: "Cost a unit" },
    { id: "min", label: "Minimum order", kind: "range", get: (r) => r.min_quantity, unit: "pcs" },
    { id: "lead", label: "Lead time", kind: "range", get: (r) => r.lead_time_days, unit: "days" },
  ].filter(Boolean);
}

/**
 * The tech packs' filters. A row here is the page's wrapper of a pack (`{ pack, state, customerName, orders }`, see Inventory.jsx), not
 * the table row: `pack` is what lib/techpack.js `readPack` makes of it, and `state` is "complete", "needs" (a new-format pack that
 * still lacks something) or "old" (made before the technical sheet).
 */
export function patternFilters({ packs }) {
  return [
    {
      id: "state", label: "Sheet", kind: "chips",
      options: [
        { value: "any", label: "Any" },
        { value: "complete", label: "Complete" },
        { value: "needs", label: "Needs info", tone: "warn" },
        { value: "old", label: "Old format" },
      ],
      test: (w, v) => w.state === v,
    },
    names(packs, (w) => w.customerName, { id: "customer", label: "Customer", any: "Any customer", none: "No customer" }),
    names(packs, (w) => w.pack.season, { id: "season", label: "Collection", any: "Any collection", none: "No collection" }),
    names(packs, (w) => w.pack.category, { id: "category", label: "Category", any: "Any category", none: "No category" }),
    names(packs, (w) => w.pack.productType, { id: "type", label: "Product type", any: "Any product", none: "No product type" }),
    names(packs, (w) => w.pack.designerName, { id: "designer", label: "Designer", any: "Anyone", none: "No designer" }),
    listed(packs, (w) => w.pack.sizes, { id: "size", label: "Size", any: "Any size", none: "No sizes" }),
    { id: "pictures", label: "Has pictures", kind: "toggle", text: "Has pictures", pill: "Has pictures", test: (w) => w.pack.views.some((v) => v.url) || w.pack.pages.length > 0 },
    { id: "measured", label: "Has measurements", kind: "toggle", text: "Has measurements", pill: "Has measurements", test: (w) => w.pack.points.length > 0 },
    { id: "ordered", label: "Has orders", kind: "toggle", text: "Has orders", pill: "Has orders", test: (w) => w.orders > 0 },
  ].filter(Boolean);
}

export function sampleFilters({ samples }) {
  return [
    {
      id: "stage", label: "Stage", kind: "chips",
      options: [{ value: "any", label: "Any" }, ...SAMPLE_STAGES.map((s) => ({ value: s, label: s }))],
      test: (r, v) => (r.stage || "Proto") === v,
    },
    {
      id: "status", label: "Status", kind: "chips",
      options: [{ value: "any", label: "Any" }, ...SAMPLE_STATUSES.map((s) => ({ value: s, label: s, tone: s === "Rejected" ? "bad" : s === "In Revision" ? "warn" : undefined }))],
      test: (r, v) => (r.status || "Pending") === v,
    },
    names(samples, (r) => r.product_type, { id: "type", label: "Product type", any: "Any product", none: "No product type" }),
    names(samples, (r) => r.fabric_used, { id: "fabric", label: "Fabric used", any: "Any fabric", none: "No fabric given" }),
    names(samples, (r) => r.color, { id: "colour", label: "Colour", any: "Any colour", none: "No colour" }),
    names(samples, (r) => r.size, { id: "size", label: "Size", any: "Any size", none: "No size" }),
    { id: "cost", label: "Cost", kind: "range", get: (r) => r.cost, unit: "NPR", pill: "Cost" },
    { id: "photo", label: "Has a photo", kind: "toggle", text: "Has a photo", pill: "Has a photo", test: (r) => Boolean(text(r.photo_url)) },
  ].filter(Boolean);
}

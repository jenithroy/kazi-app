/**
 * The Inventory page's tables. Each is a DataTable with the few columns that are worth a glance and nothing else:
 * the rest of an item is in its card, one press away. A table says which columns go first when it is narrow
 * (`drop`, the bigger the sooner), so none of them ever scrolls sideways.
 *
 * Rows come in already searched and filtered; `empty` is what to say when there are none.
 */
import { useMemo } from "react";
import DataTable, { TwoLine } from "../table/DataTable";
import { useCurrency } from "../../context/CurrencyContext";
import { costOf, fmtQty, priceText, savedCost, STOCK_STATE_LABEL } from "../../lib/inventory";
import { normaliseRegion, regionLabel } from "../../utils/region";

const STATE_TAG = { negative: "bad", out: "bad", low: "warn" };
const initialsOf = (name) => (name ? name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() : "?");

export function RegionTag({ value }) {
  const id = normaliseRegion(value);
  if (!id) return <span className="dt-dim" title="No region set: it shows under both UK and Nepal">—</span>;
  return <span className={`kb-tag ${id === "uk" ? "kb-tag--info" : "kb-tag--good"}`}>{regionLabel(id)}</span>;
}

function Thumb({ url, name }) {
  return <span className="dt-thumb" aria-hidden="true">{url ? <img src={url} alt="" loading="lazy" /> : initialsOf(name)}</span>;
}

const Sr = ({ children }) => <span className="dt-sr">{children}</span>;
const Blank = () => <span className="dt-dim">—</span>;

/* ── Stock ──────────────────────────────────────────────────────── */

/** `rows` are stockRow()s (lib/inventory.js): the item with its numbers worked out. */
export function StockTable({ rows, loading, canEdit, onOpen, activeId, empty }) {
  const { money } = useCurrency();
  const columns = useMemo(() => [
    {
      id: "item", label: "Item", grow: true, min: 170, max: 400, sort: (r) => (r.row.item || "").toLowerCase(),
      render: (r) => (
        <TwoLine
          main={r.row.item}
          sub={<>{r.row.itemId ? <span className="dt-id">{r.row.itemId}</span> : null}{r.row.category ? `${r.row.itemId ? " · " : ""}${r.row.category}` : ""}</>}
        />
      ),
    },
    { id: "open", label: "Opening", width: 84, align: "end", drop: 6, first: "desc", sort: (r) => r.opening, render: (r) => <span className="dt-num dt-dim">{fmtQty(r.opening)}</span> },
    { id: "in", label: "In", width: 84, align: "end", drop: 5, first: "desc", sort: (r) => r.inTotal, render: (r) => <span className={`dt-num ${r.inTotal ? "dt-good" : "dt-dim"}`}>{fmtQty(r.inTotal)}</span> },
    { id: "out", label: "Out", width: 84, align: "end", drop: 4, first: "desc", sort: (r) => r.outTotal, render: (r) => <span className={`dt-num ${r.outTotal ? "dt-bad" : "dt-dim"}`}>{fmtQty(r.outTotal)}</span> },
    {
      id: "bal", label: "Balance", width: 150, align: "end", first: "asc", sort: (r) => r.closing,
      render: (r) => (
        <span className="dt-bal">
          {STOCK_STATE_LABEL[r.state] ? <span className={`kb-tag kb-tag--${STATE_TAG[r.state]}`}>{STOCK_STATE_LABEL[r.state]}</span> : null}
          <span className={`dt-num dt-strong${r.closing < 0 ? " dt-bad" : ""}`}>{fmtQty(r.closing)}<span className="dt-unit">{r.row.unit}</span></span>
        </span>
      ),
    },
    { id: "value", label: "Worth", width: 112, align: "end", drop: 3, first: "desc", sort: (r) => r.value, render: (r) => (r.row.unitCostNPR ? <span className="dt-num">{money(r.value)}</span> : <Blank />) },
    {
      id: "log", label: <Sr>Log stock</Sr>, width: 64, align: "end", drop: 2,
      render: (r) => (canEdit ? <button type="button" className="dt-mini dt-act" aria-label={`Log stock for ${r.row.item}`} onClick={() => onOpen(r.row, "moves")}>Log</button> : null),
    },
  ], [money, canEdit, onOpen]);

  return (
    <DataTable
      label="Stock"
      rows={rows}
      rowKey={(r) => r.id}
      columns={columns}
      defaultSort={{ id: "item", dir: "asc" }}
      onOpen={(r) => onOpen(r.row, "details")}
      rowLabel={(r) => `Open ${r.row.item}`}
      activeKey={activeId}
      loading={loading}
      empty={empty}
    />
  );
}

/* ── Costs ──────────────────────────────────────────────────────── */

/** `rows` are stockRow()s; `economics` maps an item's id to its saved cost sheet. */
export function CostTable({ rows, economics, loading, onOpen, activeId, empty }) {
  const { money, moneyAlt } = useCurrency();
  const data = useMemo(() => rows.map((r) => ({ ...r, cost: costOf(savedCost(economics[r.id])) })), [rows, economics]);
  const columns = useMemo(() => [
    {
      id: "item", label: "Item", grow: true, min: 170, max: 400, sort: (r) => (r.row.item || "").toLowerCase(),
      render: (r) => (
        <TwoLine
          main={r.row.item}
          sub={<>{r.row.itemId ? <span className="dt-id">{r.row.itemId}</span> : null}{r.row.category ? `${r.row.itemId ? " · " : ""}${r.row.category}` : ""}</>}
        />
      ),
    },
    {
      id: "cost", label: "Cost a piece", width: 132, align: "end", sort: (r) => r.cost.cogs,
      render: (r, { compact }) => (r.cost.cogs > 0 ? (
        <span className="dt-stack">
          <span className="dt-num dt-strong">{money(r.cost.cogs)}</span>
          {compact && r.cost.tone ? <small className={`dt-${r.cost.tone}`}>{r.cost.marginPct.toFixed(0)}% margin</small> : <small>{moneyAlt(r.cost.cogs)}</small>}
        </span>
      ) : <span className="dt-dim">{r.cost.targetPrice > 0 ? "No cost yet" : "Not costed"}</span>),
    },
    { id: "price", label: "Sells for", width: 112, align: "end", drop: 4, first: "desc", sort: (r) => r.cost.targetPrice, render: (r) => (r.cost.targetPrice > 0 ? <span className="dt-num">{money(r.cost.targetPrice)}</span> : null) },
    {
      id: "margin", label: "Margin", width: 110, align: "end", drop: 3, sort: (r) => (r.cost.targetPrice > 0 ? r.cost.marginPct : null),
      render: (r) => (r.cost.tone ? (
        <span className="dt-stack">
          <span className={`kb-tag kb-tag--${r.cost.tone}`}>{r.cost.marginPct.toFixed(1)}%</span>
          <small>{money(r.cost.gp)} profit</small>
        </span>
      ) : null),
    },
    { id: "driver", label: "Biggest cost", width: 128, drop: 5, render: (r) => (r.cost.driver ? <span className="dt-clip">{r.cost.driver.name} <span className="dt-dim">{r.cost.driver.pct.toFixed(0)}%</span></span> : null) },
    {
      id: "stock", label: "Stock at cost", width: 124, align: "end", drop: 6, sort: (r) => r.closing * r.cost.cogs,
      render: (r) => (r.cost.cogs > 0
        ? <span className="dt-stack"><span className="dt-num">{money(r.closing * r.cost.cogs)}</span><small>{fmtQty(r.closing)} {r.row.unit}</small></span>
        : <span className="dt-stack"><small>{fmtQty(r.closing)} {r.row.unit}</small></span>),
    },
  ], [money, moneyAlt]);

  return (
    <DataTable
      label="Item costs"
      rows={data}
      rowKey={(r) => r.id}
      columns={columns}
      defaultSort={{ id: "item", dir: "asc" }}
      onOpen={(r) => onOpen(r.row, "cost")}
      rowLabel={(r) => `Open the cost of ${r.row.item}`}
      activeKey={activeId}
      loading={loading}
      empty={empty}
    />
  );
}

/* ── Fabrics, processes, samples ────────────────────────────────── */

const FABRIC_TONE = { "In Stock": "good", "Low Stock": "warn", "Out of Stock": "bad" };

export function FabricTable({ rows, loading, onOpen, activeId, empty }) {
  const cur = useCurrency();
  const columns = useMemo(() => [
    {
      id: "name", label: "Fabric", grow: true, min: 170, max: 400, sort: (r) => (r.name || "").toLowerCase(),
      render: (r) => <TwoLine lead={<Thumb url={r.swatchImageUrl} name={r.name} />} main={r.name} sub={r.composition || "No composition"} />,
    },
    { id: "gsm", label: "GSM", width: 72, align: "end", drop: 4, first: "desc", sort: (r) => (r.gsm == null ? null : Number(r.gsm)), render: (r) => (r.gsm != null ? <span className="dt-num">{r.gsm}</span> : <Blank />) },
    { id: "price", label: "Price / kg", width: 112, align: "end", drop: 2, first: "desc", sort: (r) => (r.pricePerKg == null ? null : Number(r.pricePerKg)), render: (r) => (r.pricePerKg != null ? <span className="dt-num">{priceText(cur, r.pricePerKg)}</span> : <Blank />) },
    { id: "status", label: "Status", width: 112, render: (r) => <span className={`kb-tag kb-tag--${FABRIC_TONE[r.status] || "good"}`}>{r.status || "In Stock"}</span> },
    { id: "weight", label: "Roll", width: 100, drop: 5, render: (r) => (r.weight ? <span className="dt-clip dt-dim">{r.weight}</span> : <Blank />) },
    { id: "region", label: "Region", width: 76, drop: 6, render: (r) => <RegionTag value={r.region} /> },
  ], [cur]);

  return (
    <DataTable
      label="Fabrics"
      rows={rows}
      rowKey={(r) => r.id}
      columns={columns}
      defaultSort={{ id: "name", dir: "asc" }}
      onOpen={onOpen}
      rowLabel={(r) => `Open ${r.name}`}
      activeKey={activeId}
      loading={loading}
      empty={empty}
    />
  );
}

export function ProcessTable({ rows, loading, onOpen, activeId, empty }) {
  const cur = useCurrency();
  const columns = useMemo(() => [
    {
      id: "name", label: "Process", grow: true, min: 170, max: 400, sort: (r) => (r.name || "").toLowerCase(),
      render: (r) => <TwoLine main={r.name} sub={r.description || undefined} />,
    },
    { id: "category", label: "Category", width: 124, drop: 3, sort: (r) => r.category || "", render: (r) => (r.category ? <span className="kb-tag" style={{ textTransform: "capitalize" }}>{r.category}</span> : <Blank />) },
    { id: "cost", label: "Cost a unit", width: 112, align: "end", drop: 2, first: "desc", sort: (r) => (r.cost_per_unit == null ? null : Number(r.cost_per_unit)), render: (r) => (r.cost_per_unit != null ? <span className="dt-num">{priceText(cur, r.cost_per_unit)}</span> : <Blank />) },
    { id: "min", label: "Minimum", width: 96, align: "end", drop: 5, first: "desc", sort: (r) => (r.min_quantity == null ? null : Number(r.min_quantity)), render: (r) => (r.min_quantity != null ? <span className="dt-num">{fmtQty(r.min_quantity)}<span className="dt-unit">pcs</span></span> : <Blank />) },
    { id: "lead", label: "Lead time", width: 92, align: "end", drop: 4, first: "desc", sort: (r) => (r.lead_time_days == null ? null : Number(r.lead_time_days)), render: (r) => (r.lead_time_days != null ? <span className="dt-num">{r.lead_time_days}<span className="dt-unit">days</span></span> : <Blank />) },
    { id: "region", label: "Region", width: 76, drop: 6, render: (r) => <RegionTag value={r.region} /> },
  ], [cur]);

  return (
    <DataTable
      label="Processes"
      rows={rows}
      rowKey={(r) => r.id}
      columns={columns}
      defaultSort={{ id: "name", dir: "asc" }}
      onOpen={onOpen}
      rowLabel={(r) => `Open ${r.name}`}
      activeKey={activeId}
      loading={loading}
      empty={empty}
    />
  );
}

const SAMPLE_TONE = { Approved: "good", Rejected: "bad", "In Revision": "warn" };

export function SampleTable({ rows, loading, onOpen, activeId, empty }) {
  const cur = useCurrency();
  const columns = useMemo(() => [
    {
      id: "name", label: "Sample", grow: true, min: 170, max: 400, sort: (r) => (r.name || "").toLowerCase(),
      render: (r) => <TwoLine lead={<Thumb url={r.photo_url} name={r.name} />} main={r.name} sub={r.product_type || undefined} />,
    },
    { id: "stage", label: "Stage", width: 92, sort: (r) => r.stage || "", render: (r) => <span className="kb-tag">{r.stage || "Proto"}</span> },
    { id: "status", label: "Status", width: 112, sort: (r) => r.status || "", render: (r) => <span className={`kb-tag${SAMPLE_TONE[r.status] ? ` kb-tag--${SAMPLE_TONE[r.status]}` : ""}`}>{r.status || "Pending"}</span> },
    {
      id: "what", label: "Made of", width: 168, drop: 4,
      render: (r) => (r.fabric_used || r.size || r.color
        ? <TwoLine main={r.fabric_used || "—"} sub={[r.size, r.color].filter(Boolean).join(" · ") || undefined} />
        : <Blank />),
    },
    { id: "cost", label: "Cost", width: 96, align: "end", drop: 3, first: "desc", sort: (r) => (r.cost == null ? null : Number(r.cost)), render: (r) => (r.cost != null && r.cost !== "" ? <span className="dt-num">{priceText(cur, r.cost)}</span> : <Blank />) },
    { id: "region", label: "Region", width: 76, drop: 6, render: (r) => <RegionTag value={r.region} /> },
  ], [cur]);

  return (
    <DataTable
      label="Samples"
      rows={rows}
      rowKey={(r) => r.id}
      columns={columns}
      defaultSort={{ id: "name", dir: "asc" }}
      onOpen={onOpen}
      rowLabel={(r) => `Open ${r.name}`}
      activeKey={activeId}
      loading={loading}
      empty={empty}
    />
  );
}

import { useEffect, useMemo, useState } from "react";
import { fetchAll } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import StockItemSelect from "./StockItemSelect";
import {
  STOCK_MOVEMENTS_COLLECTION, stockClosing, postProductionStockOut, undoProductionStockOut,
} from "../utils/stockLedger";
import { LINE_KINDS, orderRefOf, resolveRows, round3 } from "../utils/productionConsumption";

const kindLabel = (kind) => LINE_KINDS.find(k => k.value === kind)?.label || "Other";
const fmtQty = (n) => Number(round3(n)).toLocaleString("en-US", { maximumFractionDigits: 3 });

const cardStyle = {
  border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px",
  background: "var(--card)", display: "flex", flexDirection: "column", gap: 10,
};
const warnBox = {
  border: "1px solid rgba(230,81,0,0.35)", background: "rgba(230,81,0,0.06)",
  borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "var(--ink-2)",
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
};
const hint = { fontSize: 12, color: "var(--ink-4)", margin: 0 };

let rowSeq = 0;
const newRow = () => ({ key: `row:${++rowSeq}`, kind: "trim", label: "", itemId: "", amount: "" });

function friendlyError(err) {
  const msg = err?.message || String(err);
  if (/stock_movements_source_check/.test(msg)) {
    return "The database is missing the 0039 update, so production deductions can't be saved yet.";
  }
  if (/row-level security|permission denied/i.test(msg)) {
    return "You don't have permission to change stock. Ask someone with Inventory access.";
  }
  return `Could not save: ${msg}`;
}

/**
 * Confirms which materials an order used and takes them out of stock.
 *
 * The person confirming adds each material by hand: what it is, the stock item it
 * came from (a colour or fabric substitution is simply a different item) and the
 * amount. Nothing is posted until they confirm, and a below-zero result or a
 * second deduction for the same order asks first.
 *
 *   advancing  true when opened by moving the order out of Quality Check — the
 *              buttons then also continue to the next stage.
 *   onDone     ({ deducted }) after a deduction was posted, or after the person
 *              chose to continue without one.
 */
export default function MaterialsUsedModal({ order, advancing, onClose, onDone }) {
  const { profile } = useAuth();
  const orderRef = orderRefOf(order);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);

  const [piecesText, setPiecesText] = useState(String(order.quantity || ""));
  const [rows, setRows] = useState([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // "Type the amount" is only nagged about once they have tried to confirm; until
  // then a row that has an item and no amount yet is just a row being filled in.
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [itemRows, moveRows] = await Promise.all([
          fetchAll("inventory"), fetchAll(STOCK_MOVEMENTS_COLLECTION),
        ]);
        if (cancelled) return;
        setItems(itemRows);
        setMovements(moveRows);
      } catch {
        if (!cancelled) setLoadError("Could not load stock items.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [order.id]);

  const itemById = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const prior = useMemo(
    () => movements.filter(m => m.source === "production" && m.sourceId === orderRef),
    [movements, orderRef]
  );

  const calc = useMemo(
    () => resolveRows(rows, { itemById, balanceOf: item => stockClosing(item, movements) }),
    [rows, itemById, movements]
  );

  function setRow(key, patch) {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleUndo() {
    if (!window.confirm(
      `Put back the materials deducted for ${orderRef}? This removes ${prior.length} stock-out line${prior.length === 1 ? "" : "s"} from the ledger.`
    )) return;
    setSaving(true);
    setError("");
    try {
      await undoProductionStockOut(orderRef);
      setMovements(await fetchAll(STOCK_MOVEMENTS_COLLECTION));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm() {
    setError("");
    setAttempted(true);
    const pieces = Number(piecesText) || 0;
    if (pieces <= 0) { setError("Enter how many pieces came out."); return; }

    const needItem = calc.perRow.filter(r => r.needsItem);
    if (needItem.length) {
      setError(`Choose the stock item for: ${needItem.map(r => r.row.label || kindLabel(r.row.kind)).join(", ")} — or remove the row.`);
      return;
    }
    const needAmount = calc.perRow.filter(r => r.needsAmount);
    if (needAmount.length) {
      setError(`Type the amount to deduct for: ${needAmount.map(r => r.row.label || r.item.item).join(", ")} — or remove the row.`);
      return;
    }

    const lines = calc.perRow
      .filter(r => r.item && r.qty > 0)
      .map(r => ({
        itemId: r.item.id,
        qty: round3(r.qty),
        label: r.row.label || r.item.item,
        unitCostNPR: r.item.unitCostNPR,
      }));
    if (!lines.length) { setError("There is nothing to deduct. Add a material, choose its stock item and type the amount."); return; }

    const negative = [...calc.totals.entries()]
      .map(([id, total]) => ({ item: itemById.get(id), after: (calc.balances.get(id) || 0) - total }))
      .filter(x => x.after < 0);
    if (negative.length && !window.confirm(
      `These would go below zero: ${negative.map(x => `${x.item.item} (${fmtQty(x.after)} ${x.item.unit || ""})`).join(", ")}. Deduct anyway?`
    )) return;

    if (prior.length && !window.confirm(
      `Stock was already deducted for ${orderRef}. Deduct these materials again on top of that?`
    )) return;

    setSaving(true);
    try {
      await postProductionStockOut({ orderRef, pieces, lines, createdBy: profile?.name });
      onDone({ deducted: true });
    } catch (err) {
      setError(friendlyError(err));
      setSaving(false);
    }
  }

  const pieces = Number(piecesText) || 0;
  const subtitle = [
    orderRef, order.customerName, order.styleName,
    [order.fabricType, order.colorway && `(${order.colorway})`].filter(Boolean).join(" "),
  ].filter(Boolean).join(" · ");

  return (
    <div className="kbrf-overlay" onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="kbrf-modal" style={{ maxWidth: 780 }} role="dialog" aria-modal="true" aria-label={`Materials used for ${orderRef}`}>
        <div className="kbrf-modal-hd">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Materials used</div>
            <div style={{ fontSize: 12, color: "var(--ink-4)", fontWeight: 400, marginTop: 2 }}>{subtitle}</div>
          </div>
          <button className="kbrf-modal-close" onClick={onClose} disabled={saving} aria-label="Close">✕</button>
        </div>

        {loading && <p style={hint}>Loading stock…</p>}
        {!loading && loadError && <div style={warnBox}>{loadError}</div>}

        {!loading && !loadError && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {prior.length > 0 && (
              <div style={warnBox}>
                <span>
                  Materials for this order were already deducted{prior[0]?.date ? ` on ${prior[0].date}` : ""}
                  {" "}({prior.length} line{prior.length === 1 ? "" : "s"}).
                </span>
                <button className="ghost-button" style={{ fontSize: 12, padding: "4px 10px" }} onClick={handleUndo} disabled={saving}>
                  Undo that deduction
                </button>
              </div>
            )}

            <label className="kfin-label" style={{ maxWidth: 260 }}>
              Pieces that passed QC
              <input className="kfin-input" type="number" min="0" step="1" value={piecesText}
                onChange={e => setPiecesText(e.target.value)} />
            </label>
            <p style={hint}>
              {pieces.toLocaleString()} pcs of {Number(order.quantity || 0).toLocaleString()} ordered. Count only pieces that passed QC —
              rejected pieces reuse their material, so they aren't deducted.
            </p>

            {rows.length === 0 && (
              <p style={hint}>Add each material this order used, choose the stock item it came from, and type the amount to deduct.</p>
            )}

            {calc.perRow.map(({ row, item, needsAmount, needsItem }) => {
              const total = item ? calc.totals.get(item.id) || 0 : 0;
              const balance = item ? calc.balances.get(item.id) || 0 : null;
              const after = item ? balance - total : null;
              const unit = item?.unit || "";
              return (
                <div key={row.key} style={cardStyle}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                      <select className="kfin-select" style={{ width: "auto" }} value={row.kind}
                        onChange={e => setRow(row.key, { kind: e.target.value })} aria-label="Kind of material">
                        {LINE_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                      </select>
                      <input className="kfin-input" placeholder="What is it? e.g. Red thread" value={row.label}
                        onChange={e => setRow(row.key, { label: e.target.value })} />
                    </div>
                    <button className="kbrf-modal-close" title="Remove this row" aria-label="Remove this row"
                      onClick={() => setRows(prev => prev.filter(r => r.key !== row.key))} disabled={saving}>✕</button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                    <label className="kfin-label">
                      Stock item
                      <StockItemSelect items={items} kind={row.kind} value={row.itemId}
                        onChange={id => setRow(row.key, { itemId: id })} />
                    </label>
                    <label className="kfin-label">
                      Deduct{unit ? ` (${unit})` : ""}
                      <input className="kfin-input" type="number" min="0" step="any" value={row.amount} placeholder="0"
                        onChange={e => setRow(row.key, { amount: e.target.value })} />
                    </label>
                  </div>

                  <div style={{ fontSize: 12, color: "var(--ink-3)", display: "flex", flexDirection: "column", gap: 2 }}>
                    {needsItem && <span style={{ color: "var(--terra)" }}>Choose which stock item this comes from.</span>}
                    {needsAmount && attempted && <span style={{ color: "var(--terra)" }}>Type how much to deduct.</span>}
                    {item && (
                      <span style={{ color: after < 0 ? "var(--terra)" : undefined }}>
                        In stock: {fmtQty(balance)} {item.unit} → {fmtQty(after)} {item.unit} after this
                        {after < 0 ? " (below zero)" : ""}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            <div>
              <button className="ghost-button" style={{ fontSize: 13 }} onClick={() => setRows(prev => [...prev, newRow()])} disabled={saving}>
                + Add material
              </button>
            </div>

            {error && <div role="alert" style={{ ...warnBox, color: "var(--terra)" }}>{error}</div>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 4 }}>
              {advancing ? (
                <button className="ghost-button" onClick={() => onDone({ deducted: false })} disabled={saving}>
                  Advance without deducting
                </button>
              ) : (
                <button className="ghost-button" onClick={onClose} disabled={saving}>Close</button>
              )}
              <button className="primary-button" onClick={handleConfirm} disabled={saving}>
                {saving ? "Saving…" : advancing ? "Deduct stock & advance" : "Deduct stock"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

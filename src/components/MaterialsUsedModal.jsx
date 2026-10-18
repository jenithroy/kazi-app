import { useEffect, useId, useMemo, useState } from "react";
import { fetchAll } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import Modal from "./Modal";
import Select from "./Select";
import { Icons } from "./ui";
import {
  STOCK_MOVEMENTS_COLLECTION, stockClosing, postProductionStockOut, undoProductionStockOut,
} from "../utils/stockLedger";
import { LINE_KINDS, materialItems, orderRefOf, resolveRows, round3 } from "../utils/productionConsumption";
import "./production/production-dialogs.css";

const kindLabel = (kind) => LINE_KINDS.find((k) => k.value === kind)?.label || "Other";
const fmtQty = (n) => Number(round3(n)).toLocaleString("en-US", { maximumFractionDigits: 3 });

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

/** The stock items a row can draw from, as options: the item, its unit, and the category it is filed under. */
function itemOptions(items, kind, current) {
  const list = materialItems([...items], kind);
  // The item already chosen stays selectable even if it is filed under a category this picker normally hides.
  if (current && !list.some((i) => i.id === current)) {
    const item = items.find((i) => i.id === current);
    if (item) list.unshift(item);
  }
  return [
    { value: "", label: "Choose an item" },
    ...list.map((i) => ({ value: i.id, label: `${i.item}${i.unit ? ` (${i.unit})` : ""}`, hint: i.category || "Other" })),
  ];
}

/**
 * Confirms which materials an order used and takes them out of stock.
 *
 * The person confirming adds each material by hand: what it is, the stock item it
 * came from (a colour or fabric substitution is simply a different item) and the
 * amount. Nothing is posted until they confirm, and a below-zero result or a
 * second deduction for the same order asks first (in the dialog, not in a pop-up).
 *
 *   advancing  true when opened by moving the order out of Quality Check — the
 *              buttons then also continue to the next stage.
 *   onDone     ({ deducted }) after a deduction was posted, or after the person
 *              chose to continue without one.
 */
export default function MaterialsUsedModal({ order, advancing, onClose, onDone }) {
  const { profile } = useAuth();
  const uid = useId();
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
  const [ask, setAsk] = useState(null);       // a question waiting for Yes / No: { text, yes, resolve }

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

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const prior = useMemo(
    () => movements.filter((m) => m.source === "production" && m.sourceId === orderRef),
    [movements, orderRef],
  );

  const calc = useMemo(
    () => resolveRows(rows, { itemById, balanceOf: (item) => stockClosing(item, movements) }),
    [rows, itemById, movements],
  );

  const kindOptions = useMemo(() => LINE_KINDS.map((k) => ({ value: k.value, label: k.label })), []);

  function setRow(key, patch) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  /** Asks a yes / no question in the dialog and waits for the answer. */
  function confirmHere(text, yes) {
    return new Promise((resolve) => setAsk({ text, yes, resolve }));
  }
  function answer(value) {
    ask?.resolve(value);
    setAsk(null);
  }

  async function handleUndo() {
    const ok = await confirmHere(
      `Put back the materials deducted for ${orderRef}? This removes ${prior.length} stock-out line${prior.length === 1 ? "" : "s"} from the ledger.`,
      "Put them back",
    );
    if (!ok) return;
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

    const needItem = calc.perRow.filter((r) => r.needsItem);
    if (needItem.length) {
      setError(`Choose the stock item for: ${needItem.map((r) => r.row.label || kindLabel(r.row.kind)).join(", ")} — or remove the row.`);
      return;
    }
    const needAmount = calc.perRow.filter((r) => r.needsAmount);
    if (needAmount.length) {
      setError(`Type the amount to deduct for: ${needAmount.map((r) => r.row.label || r.item.item).join(", ")} — or remove the row.`);
      return;
    }

    const lines = calc.perRow
      .filter((r) => r.item && r.qty > 0)
      .map((r) => ({
        itemId: r.item.id,
        qty: round3(r.qty),
        label: r.row.label || r.item.item,
        unitCostNPR: r.item.unitCostNPR,
      }));
    if (!lines.length) { setError("There is nothing to deduct. Add a material, choose its stock item and type the amount."); return; }

    const negative = [...calc.totals.entries()]
      .map(([id, total]) => ({ item: itemById.get(id), after: (calc.balances.get(id) || 0) - total }))
      .filter((x) => x.after < 0);
    if (negative.length && !(await confirmHere(
      `These would go below zero: ${negative.map((x) => `${x.item.item} (${fmtQty(x.after)} ${x.item.unit || ""})`).join(", ")}. Deduct anyway?`,
      "Deduct anyway",
    ))) return;

    if (prior.length && !(await confirmHere(
      `Stock was already deducted for ${orderRef}. Deduct these materials again on top of that?`,
      "Deduct again",
    ))) return;

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
  const locked = saving || Boolean(ask);       // what was asked about is what gets posted: nothing may change meanwhile
  const subtitle = [
    orderRef, order.customerName, order.styleName,
    [order.fabricType, order.colorway && `(${order.colorway})`].filter(Boolean).join(" "),
  ].filter(Boolean).join(" · ");

  const footer = (
    <>
      {advancing ? (
        <button type="button" className="ghost-button" onClick={() => onDone({ deducted: false })} disabled={saving || loading}>
          Advance without deducting
        </button>
      ) : (
        <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>Close</button>
      )}
      <button type="button" className="primary-button" onClick={handleConfirm} disabled={saving || loading || Boolean(loadError) || Boolean(ask)}>
        {saving ? "Saving…" : advancing ? "Deduct stock and advance" : "Deduct stock"}
      </button>
    </>
  );

  return (
    <Modal
      size="lg"
      className="pr-dlg"
      glass
      title="Materials used"
      subtitle={subtitle}
      onClose={saving ? undefined : onClose}
      footer={footer}
    >
      {loading && <p className="pr-hint">Loading stock…</p>}
      {!loading && loadError && <p className="pr-mat-strip is-bad" role="alert">{loadError}</p>}

      {!loading && !loadError && (
        <div className="kof pr-mat">
          {prior.length > 0 && (
            <div className="pr-mat-strip is-warn">
              <span>
                Materials for this order were already deducted{prior[0]?.date ? ` on ${prior[0].date}` : ""}
                {" "}({prior.length} line{prior.length === 1 ? "" : "s"}).
              </span>
              <button type="button" className="ghost-button" onClick={handleUndo} disabled={locked}>Undo that deduction</button>
            </div>
          )}

          <div className="kof-f kof-c4">
            <label className="kof-l" htmlFor={`${uid}-pieces`}>Pieces that passed QC</label>
            <input id={`${uid}-pieces`} type="number" min="0" step="1" value={piecesText} onChange={(e) => setPiecesText(e.target.value)} disabled={locked} />
          </div>
          <p className="pr-hint">
            {pieces.toLocaleString()} pcs of {Number(order.quantity || 0).toLocaleString()} ordered. Count only pieces that passed QC —
            rejected pieces reuse their material, so they aren't deducted.
          </p>

          {rows.length === 0 && (
            <p className="pr-hint">Add each material this order used, choose the stock item it came from, and type the amount to deduct.</p>
          )}

          {calc.perRow.map(({ row, item, needsAmount, needsItem }, n) => {
            const total = item ? calc.totals.get(item.id) || 0 : 0;
            const balance = item ? calc.balances.get(item.id) || 0 : null;
            const after = item ? balance - total : null;
            const unit = item?.unit || "";
            return (
              <div key={row.key} className="pr-mat-row">
                <div className="pr-mat-top">
                  <div className="pr-mat-kind">
                    <Select label={`Kind of material, row ${n + 1}`} value={row.kind} onChange={(v) => setRow(row.key, { kind: v })} options={kindOptions} disabled={locked} />
                  </div>
                  <input
                    type="text" placeholder="What is it? e.g. Red thread" aria-label={`What material, row ${n + 1}`}
                    value={row.label} onChange={(e) => setRow(row.key, { label: e.target.value })} disabled={locked}
                  />
                  <button
                    type="button" className="pr-mat-x" title="Remove this row" aria-label={`Remove row ${n + 1}`}
                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))} disabled={locked}
                  >
                    <Icons.X size={16} sw={2} aria-hidden="true" />
                  </button>
                </div>

                <div className="pr-mat-grid">
                  <div className="kof-f">
                    <span className="kof-l">Stock item</span>
                    <Select
                      label={`Stock item, row ${n + 1}`} value={row.itemId} onChange={(id) => setRow(row.key, { itemId: id })}
                      options={itemOptions(items, row.kind, row.itemId)} placeholder="Choose an item" searchPlaceholder="Find an item" disabled={locked}
                    />
                  </div>
                  <div className="kof-f">
                    <label className="kof-l" htmlFor={`${uid}-amt-${row.key}`}>Deduct{unit ? ` (${unit})` : ""}</label>
                    <input
                      id={`${uid}-amt-${row.key}`} type="number" min="0" step="any" placeholder="0"
                      value={row.amount} onChange={(e) => setRow(row.key, { amount: e.target.value })} disabled={locked}
                    />
                  </div>
                </div>

                <div className="pr-mat-lines">
                  {needsItem && <span className="is-bad">Choose which stock item this comes from.</span>}
                  {needsAmount && attempted && <span className="is-bad">Type how much to deduct.</span>}
                  {item && (
                    <span className={after < 0 ? "is-bad" : undefined}>
                      In stock: {fmtQty(balance)} {item.unit} → {fmtQty(after)} {item.unit} after this
                      {after < 0 ? " (below zero)" : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          <div>
            <button type="button" className="ghost-button" onClick={() => setRows((prev) => [...prev, newRow()])} disabled={locked}>
              <Icons.Plus size={14} sw={2} aria-hidden="true" /> Add material
            </button>
          </div>

          {ask && (
            <div className="pr-mat-strip is-warn" role="alertdialog" aria-label="Please confirm">
              <span>{ask.text}</span>
              <span className="pr-mat-ask">
                <button type="button" className="ghost-button" onClick={() => answer(false)} autoFocus>Cancel</button>
                <button type="button" className="primary-button" onClick={() => answer(true)}>{ask.yes}</button>
              </span>
            </div>
          )}

          {error && <p className="pr-mat-strip is-bad" role="alert">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

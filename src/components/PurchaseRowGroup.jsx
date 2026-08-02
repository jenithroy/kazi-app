import DualDateInput from "./DualDateInput";

const PURCHASE_CATEGORIES = [
  "Office Supplies", "Equipment / IT", "Equipment", "Consumables",
  "Raw Materials", "Furniture & Fixtures", "Setup / Security", "Setup / IT",
  "Setup / Maintenance", "Machinery / Assets", "Miscellaneous / Events",
  "Miscellaneous", "Rent / Lease", "Professional Fees", "Utilities", "Other"
];

const emptyLineItem = { particulars: "", quantity: "", rate: "", amount: "" };

export const emptyPurchaseForm = {
  date: new Date().toISOString().slice(0, 10),
  expenseItem: "", category: "Office Supplies", vatBill: false,
  items: [{ ...emptyLineItem }]
};

export function addLineItem(items) {
  return [...items, { ...emptyLineItem }];
}
export function removeLineItem(items, idx) {
  return items.length > 1 ? items.filter((_, i) => i !== idx) : items;
}
function updateLineItem(items, idx, patch) {
  return items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
}
// Qty/Rate edits auto-suggest Amount (qty × rate); Amount itself stays independently
// editable so lump-sum particulars (rent, fees) don't need a fake qty/rate.
export function applyItemChange(items, idx, patch) {
  let next = updateLineItem(items, idx, patch);
  if ("quantity" in patch || "rate" in patch) {
    const it = next[idx];
    const q = Number(it.quantity), r = Number(it.rate);
    if (it.quantity !== "" && it.rate !== "" && !isNaN(q) && !isNaN(r)) {
      next = updateLineItem(next, idx, { amount: String(q * r) });
    }
  }
  return next;
}
export function itemsTotal(items) {
  return items.reduce((s, it) => s + (it.amount === "" || it.amount == null ? 0 : Number(it.amount) || 0), 0);
}
function itemsForEdit(row) {
  if (Array.isArray(row.items) && row.items.length) {
    return row.items.map(it => ({
      particulars: it.particulars || "",
      quantity: it.quantity == null ? "" : String(it.quantity),
      rate: it.rate == null ? "" : String(it.rate),
      amount: it.amount == null ? "" : String(it.amount)
    }));
  }
  if (row.particulars || row.quantity != null || row.rate != null) {
    return [{
      particulars: row.particulars || "",
      quantity: row.quantity == null ? "" : String(row.quantity),
      rate: row.rate == null ? "" : String(row.rate),
      amount: row.amountNPR == null ? "" : String(row.amountNPR)
    }];
  }
  return [{ ...emptyLineItem }];
}
export function initialGroupData(row) {
  return { date: row.date, expenseItem: row.expenseItem, category: row.category, vatBill: row.vatBill, items: itemsForEdit(row) };
}
// Serializes line items for Firestore: drops blank particulars, coerces numeric fields.
export function purchaseItemsPayload(items) {
  return items
    .filter(it => (it.particulars || "").trim() !== "")
    .map(it => ({
      particulars: it.particulars,
      quantity: it.quantity === "" || it.quantity == null ? null : Number(it.quantity),
      rate: it.rate === "" || it.rate == null ? null : Number(it.rate),
      amount: it.amount === "" || it.amount == null ? 0 : Number(it.amount) || 0
    }));
}
// Enter moves focus to the next field instead of doing nothing; only fires the finish
// action once the last field in the container is reached.
function focusNextOnEnter(e, onFinish) {
  if (e.key !== "Enter" || e.target.tagName === "BUTTON") return;
  e.preventDefault();
  const fields = Array.from(e.currentTarget.querySelectorAll("input, select")).filter(el => !el.disabled);
  const next = fields[fields.indexOf(e.target) + 1];
  if (next) next.focus(); else onFinish?.();
}
// Pressing Enter on the last particulars row's Rate field appends a fresh row
// and jumps focus into its Particulars input, instead of bubbling further up.
function addItemOnEnter(e, onAddItem) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  e.stopPropagation();
  const container = e.currentTarget.closest("tbody");
  onAddItem();
  requestAnimationFrame(() => {
    const inputs = container?.querySelectorAll('[data-role="particulars"]');
    inputs?.[inputs.length - 1]?.focus();
  });
}

// One purchase (Date/Party/Category/VAT shared via rowSpan) rendered as one <tr> per particular.
// Used for both the new-purchase draft row (Finance page) and every existing purchase (Purchases page) — the table itself is the editor.
export function PurchaseRowGroup({ expenseId, data, highlight, onFieldChange, onItemChange, onAddItem, onRemoveItem, onBlurAway, onFinishEnter, actionCell, partyError }) {
  const items = data.items;
  return (
    <tbody
      onBlur={e => { if (onBlurAway && !e.currentTarget.contains(e.relatedTarget)) onBlurAway(); }}
      onKeyDown={e => focusNextOnEnter(e, onFinishEnter)}
    >
      {items.map((item, idx) => (
        <tr key={idx} style={{ background: highlight ? "var(--mint-soft)" : undefined }}>
          {idx === 0 && (
            <>
              <td rowSpan={items.length} style={{ color: "var(--mint-deep)", fontWeight: 700, fontSize: 12, fontFamily: "var(--mono)", verticalAlign: "top", paddingTop: 10 }}>{expenseId}</td>
              <td rowSpan={items.length} style={{ verticalAlign: "top", paddingTop: 6, minWidth: 195 }}>
                <DualDateInput value={data.date} onChange={date => onFieldChange({ date })} className="kfin-input" />
              </td>
              <td rowSpan={items.length} style={{ verticalAlign: "top", paddingTop: 6 }}>
                <input className="kfin-input"
                  style={{ padding: "5px 6px", fontSize: 13, minWidth: 100, ...(partyError ? { border: "1.5px solid var(--terra)", background: "var(--terra-soft, #fdf2ef)" } : {}) }}
                  value={data.expenseItem}
                  placeholder="Party name" onChange={e => onFieldChange({ expenseItem: e.target.value })} />
                {partyError && (
                  <div style={{ color: "var(--terra)", fontSize: 11, fontWeight: 600, marginTop: 4, maxWidth: 140 }}>{partyError}</div>
                )}
              </td>
              <td rowSpan={items.length} style={{ verticalAlign: "top", paddingTop: 6 }}>
                <select className="kfin-select" style={{ padding: "5px 6px", fontSize: 13 }} value={data.category}
                  onChange={e => onFieldChange({ category: e.target.value })}>
                  {PURCHASE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </td>
              <td rowSpan={items.length} style={{ verticalAlign: "top", paddingTop: 6 }}>
                <select className="kfin-select" style={{ padding: "5px 6px", fontSize: 13 }}
                  value={data.vatBill === null ? "na" : data.vatBill ? "yes" : "no"}
                  onChange={e => { const v = e.target.value; onFieldChange({ vatBill: v === "yes" ? true : v === "no" ? false : null }); }}>
                  <option value="yes">Yes</option><option value="no">No</option><option value="na">N/A</option>
                </select>
              </td>
            </>
          )}
          <td>
            <input className="kfin-input" style={{ padding: "5px 6px", fontSize: 13, minWidth: 110 }} value={item.particulars} placeholder="Particulars"
              data-role="particulars"
              onChange={e => onItemChange(idx, { particulars: e.target.value })} />
          </td>
          <td>
            <input type="number" min="0" step="any" className="kfin-input" style={{ padding: "5px 6px", fontSize: 13, width: 52 }} value={item.quantity} placeholder="Qty"
              onChange={e => onItemChange(idx, { quantity: e.target.value })} />
          </td>
          <td>
            <input type="number" min="0" step="any" className="kfin-input" style={{ padding: "5px 6px", fontSize: 13, width: 68 }} value={item.rate} placeholder="Rate"
              onChange={e => onItemChange(idx, { rate: e.target.value })}
              onKeyDown={idx === items.length - 1 ? (e => addItemOnEnter(e, onAddItem)) : undefined} />
          </td>
          <td>
            <input type="number" min="0" step="any" className="kfin-input" style={{ padding: "5px 6px", fontSize: 13, width: 78, fontWeight: 600 }} value={item.amount} placeholder="0"
              onChange={e => onItemChange(idx, { amount: e.target.value })} />
          </td>
          <td>
            <div style={{ display: "flex", gap: 4 }}>
              {items.length > 1 && (
                <button type="button" className="ghost-button" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => onRemoveItem(idx)} title="Remove particular">×</button>
              )}
              {idx === items.length - 1 && (
                <button type="button" className="ghost-button" style={{ padding: "3px 8px", fontSize: 12 }} onClick={onAddItem} title="Add particular">+</button>
              )}
            </div>
          </td>
          {idx === 0 && (
            <td rowSpan={items.length} style={{ verticalAlign: "top", paddingTop: 6 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--mint-deep)", fontFamily: "var(--mono)", fontVariantNumeric: "tabular-nums" }}>
                  NPR {itemsTotal(items).toLocaleString()}
                </span>
                {actionCell}
              </div>
            </td>
          )}
        </tr>
      ))}
    </tbody>
  );
}

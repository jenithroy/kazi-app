/**
 * The lines of a document: what is being sold, how many, at what rate. Each line is two rows in the card: the description (a few lines of
 * text: Enter moves on, Shift + Enter is a new line), then the numbers (quantity, unit, rate with its currency converter, the amount it
 * comes to, and for an invoice the stock item it takes goods out of).
 *
 * The lines are the old form's, with the same keys (`description`, `qty`, `unit`, `rate`, `stockItemId`) and the same hooks:
 * `data-role="item-description"` on each description, Enter on the last line's rate starts another line.
 */
import { useId } from "react";
import { NumberInput } from "../EditCard";
import Select from "../Select";
import Suggest from "../Suggest";
import { Icons } from "../ui";
import { emptyItem } from "../../utils/billing.jsx";

const UNITS = ["Pcs", "Set", "Pair", "Dozen", "Kg", "Mtr", "Yard", "Roll", "Box", "Ltr", "Hrs", "Days", "Lump sum"].map((label) => ({ label }));

const amountOf = (it) => (Number(it.qty || 0) * Number(it.rate || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 });

/** `onConvert(i)` asks the card to open the converter for line i: its dialog is drawn beside the card, not inside it (a dialog inside the card's form would send its submit and its keys up through the card). */
export default function ItemsEditor({ tab, items, currency = "NPR", disabled, inventoryItems = [], onChange, onConvert }) {
  const uid = useId();
  const invoice = tab === "invoice";
  const stockOptions = [{ value: "", label: "— none —" }, ...inventoryItems.map((inv) => ({ value: inv.id, label: `${inv.item} (${inv.unit})` }))];

  const setItem = (i, patch) => onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const addItem = () => onChange([...items, { ...emptyItem }]);
  // the × is gone with its line, so the cursor goes to the line that took its place (it would otherwise fall to the page behind the card)
  const removeItem = (i) => {
    onChange(items.filter((_, k) => k !== i));
    requestAnimationFrame(() => {
      const all = document.querySelectorAll(`[data-lines="${uid}"] [data-role="item-description"]`);
      all[Math.min(i, all.length - 1)]?.focus();
    });
  };
  const focusLastDescription = () => requestAnimationFrame(() => {
    const all = document.querySelectorAll(`[data-lines="${uid}"] [data-role="item-description"]`);
    all[all.length - 1]?.focus();
  });

  // Enter on the last line's rate starts the next line (not Shift + Enter): the key is taken here so the card's own Enter-to-the-next-field does not also run
  const rateKey = (e, i) => {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || i !== items.length - 1) return;
    e.preventDefault();
    e.stopPropagation();
    addItem();
    focusLastDescription();
  };

  return (
    <div className="ec-f bl-lines ec-wide" role="group" aria-label="Line items" data-lines={uid}>
      <div className="bl-lines-h">
        <span className="ec-lbl">Line items</span>
        <span className="bl-lines-n">{items.length} {items.length === 1 ? "line" : "lines"}</span>
      </div>
      <div className="bl-lines-body">
        {items.map((it, i) => (
          <div className="bl-item" key={i}>
            <textarea
              data-role="item-description" data-enter="next" rows={2} value={it.description} disabled={disabled}
              aria-label={`Line ${i + 1}, description`} placeholder="Item or service (Enter to move on · Shift+Enter for a new line)"
              onChange={(e) => setItem(i, { description: e.target.value })}
            />
            <div className={`bl-nums${invoice ? " bl-nums--inv" : ""}`}>
              <NumberInput aria-label={`Line ${i + 1}, quantity`} value={it.qty} placeholder="Qty" disabled={disabled} onChange={(e) => setItem(i, { qty: e.target.value })} />
              <Suggest label={`Line ${i + 1}, unit`} value={it.unit} options={UNITS} placeholder="Pcs" disabled={disabled} passEnter onChange={(v) => setItem(i, { unit: v })} />
              <div className="bl-rate">
                <NumberInput aria-label={`Line ${i + 1}, rate (${currency})`} value={it.rate} placeholder="Rate" disabled={disabled} onChange={(e) => setItem(i, { rate: e.target.value })} onKeyDown={(e) => rateKey(e, i)} />
                <button type="button" className="bl-fxbtn" title="Convert from another currency" aria-label={`Line ${i + 1}, convert a rate from another currency`} disabled={disabled} onClick={() => onConvert(i)}>⇄</button>
              </div>
              <output className="bl-amount" aria-label={`Line ${i + 1}, amount in ${currency}`}>{amountOf(it)}</output>
              {invoice && (
                <Select
                  label={`Line ${i + 1}, stock item`} value={it.stockItemId || ""} options={stockOptions} placeholder="Stock item (optional)"
                  searchPlaceholder="Search stock" disabled={disabled} onChange={(v) => setItem(i, { stockItemId: v })}
                />
              )}
              <button type="button" className="fn-lx" aria-label={`Remove line ${i + 1}`} disabled={disabled || items.length <= 1} onClick={() => removeItem(i)}>
                <Icons.X size={14} sw={2} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {!disabled && (
        <button type="button" className="fn-addline" onClick={() => { addItem(); focusLastDescription(); }}>
          <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> Add a line
        </button>
      )}
    </div>
  );
}

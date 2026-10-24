/**
 * A purchase, new or opened: the card in the middle of the screen (components/EditCard.jsx), wide enough for the items.
 *
 * It is the old entry row turned into a form that is typed straight through. It opens on the supplier (the date is already
 * today's, or the day of the bill just entered); Enter moves to the next field; Enter on the last item's amount adds another
 * item; Ctrl + Enter saves and starts the next purchase with the date still set. Suppliers and stock items are suggested as you
 * type and anything else can still be typed. The totals are on the right as they are worked out, and the VAT bill can be attached
 * here instead of finding the purchase again in the VAT bills tab.
 *
 * Every number is the old form's (components/PurchaseRowGroup.jsx: qty x rate fills the amount, VAT is 13% of what is left after the
 * discount unless a taxable amount is typed). Saving is the old Add / Save (lib/financeWrites.js).
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import EditCard, { Field, KV, NumberInput, Seg } from "../../EditCard";
import Select from "../../Select";
import Suggest from "../../Suggest";
import DateField from "../DateField";
import FileDrop from "../FileDrop";
import { Icons } from "../../ui";
import { useFin } from "../FinanceContext";
import { useMoney } from "../parts";
import useCardForm from "./useCardForm";
import { addLineItem, applyItemChange, emptyPurchaseForm, initialGroupData, PURCHASE_CATEGORIES, PURCHASE_UNITS, removeLineItem } from "../../PurchaseRowGroup";
import { addPurchase, purchaseTotals, removePurchase, updatePurchase, uploadVatBill } from "../../../lib/financeWrites";
import { BANK_NAMES } from "../../../utils/billing.jsx";
import { currentFiscalYear, fiscalYearForDate } from "../../../utils/fiscalYear";
import { kathmanduDate } from "../../../utils/date";
import { REGIONS } from "../../../utils/region";
import { enterAdvance, focusFirst, thenAdvance } from "../flow";
import ShareButton from "../../share/ShareButton";

const PAYMENT = [["CASH", "Cash"], ["Bank", "Bank"], ["Credit", "Credit"]];
const VAT = [["yes", "Yes, 13%"], ["no", "No"], ["na", "N/A"]];
const UNITS = PURCHASE_UNITS.filter((u) => u !== "other").map((u) => ({ label: u }));

// the day of the last bill entered, for the next one: bills usually come in batches. Forgotten after half an hour.
let lastEntry = { date: "", at: 0 };
const startDate = () => (lastEntry.date && Date.now() - lastEntry.at < 30 * 60 * 1000 ? lastEntry.date : kathmanduDate());

const vatValue = (v) => (v === null ? "na" : v ? "yes" : "no");
const blankLine = (it) => !(it.particulars || "").trim() && it.quantity === "" && it.rate === "" && it.amount === "";

function newForm(region) {
  return { ...emptyPurchaseForm, date: startDate(), region, items: addLineItem([]) };
}

export default function PurchaseCard({ purchase, bills = [], parties = [], seed, onAdded, onClose }) {
  const { profile, region, canEditTab, reload, notify, show, inventoryItems } = useFin();
  const money = useMoney();
  const uid = useId();
  const mode = useRef("close");
  const root = useRef(null);
  const creating = !purchase;
  const editable = canEditTab("purchases");

  const { form, set, setForm, reset, dirty } = useCardForm(() => (creating ? newForm(region) : initialGroupData(purchase)));
  const [file, setFile] = useState(null);
  const [partyError, setPartyError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => { focusFirst(root.current?.closest("form"), `#${CSS.escape(`${uid}-party`)}`); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  // `seed`: what the row at the top of the list had typed (Full form). It comes in as typing, not as the card's starting point, so Cancel asks first.
  useEffect(() => { if (seed && creating) setForm((f) => ({ ...f, ...seed })); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const totals = purchaseTotals(form);
  const fy = fiscalYearForDate(form.date) || currentFiscalYear();
  const isOtherBank = form.bankName === "other" || (form.bankName && !BANK_NAMES.includes(form.bankName));
  const stockNames = useMemo(() => [...new Set(inventoryItems.map((i) => i.item).filter(Boolean))].map((label) => ({ label })), [inventoryItems]);
  const categories = PURCHASE_CATEGORIES.includes(form.category) || !form.category ? PURCHASE_CATEGORIES : [form.category, ...PURCHASE_CATEGORIES];
  const partyOptions = useMemo(() => parties.map((p) => ({ label: p.name, hint: `${p.count} ${p.count === 1 ? "bill" : "bills"}` })), [parties]);

  const setItem = (idx, patch) => setForm((f) => ({ ...f, items: applyItemChange(f.items, idx, patch) }));
  const addItem = () => setForm((f) => ({ ...f, items: addLineItem(f.items) }));
  const removeItem = (idx) => setForm((f) => ({ ...f, items: removeLineItem(f.items, idx) }));

  function problem() {
    if (!form.expenseItem.trim()) { setPartyError("Required: who did you buy from?"); focusFirst(root.current?.closest("form"), `#${CSS.escape(`${uid}-party`)}`); return "Required: who did you buy from?"; }
    if (!form.date) return "Pick the date.";
    const unnamed = form.items.find((it) => !(it.particulars || "").trim() && (Number(it.amount) || 0) !== 0);
    if (unnamed) return `Say what the ${money(Number(unnamed.amount) || 0)} line is for.`;
    if (form.items.every((it) => !(it.particulars || "").trim()) && totals.total === 0) return "Add what was bought, with its amount.";
    if (form.paymentType === "Bank" && (!form.bankName || form.bankName === "other")) return "Type the bank's name.";
    return "";
  }

  async function attach(row, bill) {
    if (!bill.file || bill.vatBill !== true) return;
    const up = await uploadVatBill({ purchase: row, file: bill.file, profile, region });
    if (!up.ok) notify(`${row.expenseId || "The purchase"} was saved, but the VAT bill did not upload. Attach it again from the VAT bills tab.`, "warn");
  }

  async function save() {
    const again = mode.current === "again";
    mode.current = "close";
    const why = problem();
    if (why) return { ok: false, message: why };

    if (creating) {
      const res = await addPurchase({ form, region, inventoryItems, profile });
      if (!res.ok) { if (res.field === "party") setPartyError(res.message); return res; }
      lastEntry = { date: form.date, at: Date.now() };
      onAdded?.();                                       // (the row at the top that this form came from has nothing left to keep)
      const bill = { file, vatBill: form.vatBill };
      if (!again) { await attach(res.row, bill); await reload(); return { ok: true }; }
      // the next bill starts at once, so what is typed from here on is its own; the bill's file and the list catch up behind it
      setSaved(`${res.expenseId} · ${money(totals.total)}`);
      reset({ ...newForm(region), date: form.date });
      setFile(null);
      setPartyError("");
      focusFirst(root.current?.closest("form"), `#${CSS.escape(`${uid}-party`)}`);
      attach(res.row, bill).finally(() => reload()).catch(console.error);
      return { ok: true, keepOpen: true };
    }

    const res = await updatePurchase(purchase.id, form);
    if (!res.ok) return res;
    await attach(purchase, { file, vatBill: form.vatBill });
    await reload();
    return { ok: true };
  }

  const submitNow = (mark) => (e) => { mode.current = mark; e.target.closest("form")?.requestSubmit(); };

  const focusLastItem = () => requestAnimationFrame(() => {
    const rows = root.current?.closest("form")?.querySelectorAll('[data-role="particulars"]');
    rows?.[rows.length - 1]?.focus();
  });

  function onKeyDown(e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitNow(creating ? "again" : "close")(e); return; }
    if (e.key === "Enter" && !e.defaultPrevented) {
      const t = e.target;
      // Enter on the last item's amount starts the next item, the way the old entry row did (not when that item is still empty)
      if (t.matches?.("[data-last-amount]") && !blankLine(form.items[form.items.length - 1])) {
        e.preventDefault();
        addItem();
        focusLastItem();
        return;
      }
      // Enter in an empty last item is the end of the items: take it away and go on to the discount
      if (t.matches?.('[data-role="particulars"]') && form.items.length > 1) {
        const idx = Number(t.dataset.idx);
        if (idx === form.items.length - 1 && blankLine(form.items[idx])) {
          e.preventDefault();
          const formEl = t.closest("form");              // the empty item is about to be removed, and takes its own place in the page with it
          removeItem(idx);
          requestAnimationFrame(() => formEl?.querySelector(`#${CSS.escape(`${uid}-disc`)}`)?.focus());
          return;
        }
      }
    }
    enterAdvance(e, () => submitNow(creating ? "again" : "close")(e));
  }
  const flow = { onKeyDown };

  const main = (
    <div className="fn-flow" ref={root} {...flow}>
      <DateField id={`${uid}-date`} role="purchase-date" label="Date" value={form.date} onChange={thenAdvance((v) => set({ date: v }))} disabled={!editable} required className="fn-s2" />

      <Field label="Bought from" htmlFor={`${uid}-party`} className="fn-s4">
        <Suggest
          id={`${uid}-party`} label="Bought from" value={form.expenseItem} options={partyOptions} placeholder="Supplier or shop"
          disabled={!editable} passEnter onChange={(v) => { setPartyError(""); set({ expenseItem: v }); }}
        />
        {partyError && <small className="fn-err" role="alert">{partyError}</small>}
      </Field>

      <Field label="Category" htmlFor={`${uid}-cat`} className="fn-s2">
        <Select id={`${uid}-cat`} label="Category" value={form.category} onChange={thenAdvance((v) => set({ category: v }))} options={categories.map((c) => ({ value: c, label: c }))} disabled={!editable} />
      </Field>
      <Field label="Paid by" labelId={`${uid}-pay`} className="fn-s2">
        <Seg label="Paid by" value={form.paymentType || "CASH"} onChange={(v) => set({ paymentType: v })} options={PAYMENT} disabled={!editable} />
      </Field>
      <Field label="VAT bill" labelId={`${uid}-vat`} className="fn-s2">
        <Seg label="VAT bill" value={vatValue(form.vatBill)} onChange={(v) => set({ vatBill: v === "yes" ? true : v === "no" ? false : null })} options={VAT} disabled={!editable} />
      </Field>

      {form.paymentType === "Bank" && (
        <Field label="Bank" htmlFor={`${uid}-bank`} className="fn-s2">
          <Select
            id={`${uid}-bank`} label="Bank" value={isOtherBank ? "other" : (form.bankName || "Nabil Bank")} onChange={thenAdvance((v) => set({ bankName: v }))}
            disabled={!editable} searchable={false}
            options={[...BANK_NAMES.map((b) => ({ value: b, label: b })), { value: "other", label: "Another bank" }]}
          />
        </Field>
      )}
      {form.paymentType === "Bank" && isOtherBank && (
        <Field label="Bank's name" htmlFor={`${uid}-bankx`} className="fn-s2">
          <input id={`${uid}-bankx`} type="text" value={form.bankName === "other" ? "" : form.bankName} placeholder="Type the bank's name" disabled={!editable} onChange={(e) => set({ bankName: e.target.value === "" ? "other" : e.target.value })} />
        </Field>
      )}
      <div className="ec-f fn-lines ec-wide" role="group" aria-label="What was bought">
        <div className="fn-lrow fn-lrow--h" aria-hidden="true">
          <span>Particulars</span><span>Qty</span><span>Unit</span><span>Rate</span><span>Amount</span><span />
        </div>
        <div className="fn-lines-body">
          {form.items.map((it, i) => (
            <div className="fn-lrow" key={i}>
              <Suggest
                label={`Item ${i + 1}, particulars`} value={it.particulars} options={stockNames} placeholder="What was bought" disabled={!editable} passEnter
                onChange={(v) => setItem(i, { particulars: v })} className="fn-lp" id={i === 0 ? `${uid}-first-item` : undefined}
                inputProps={{ "data-role": "particulars", "data-idx": i }}
              />
              <NumberInput aria-label={`Item ${i + 1}, quantity`} value={it.quantity} placeholder="Qty" disabled={!editable} onChange={(e) => setItem(i, { quantity: e.target.value })} />
              <Suggest label={`Item ${i + 1}, unit`} value={it.unit} options={UNITS} placeholder="Unit" disabled={!editable} passEnter onChange={(v) => setItem(i, { unit: v })} />
              <NumberInput aria-label={`Item ${i + 1}, rate`} value={it.rate} placeholder="Rate" disabled={!editable} onChange={(e) => setItem(i, { rate: e.target.value })} />
              <NumberInput
                aria-label={`Item ${i + 1}, amount`} value={it.amount} placeholder="0" disabled={!editable} className="fn-amt"
                data-last-amount={i === form.items.length - 1 ? "" : undefined} onChange={(e) => setItem(i, { amount: e.target.value })}
              />
              <button type="button" className="fn-lx" aria-label={`Remove item ${i + 1}`} disabled={!editable || form.items.length < 2} onClick={() => removeItem(i)}>
                <Icons.X size={14} sw={2} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        {editable && (
          <button type="button" className="fn-addline" onClick={() => { addItem(); focusLastItem(); }}>
            <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> Add an item
          </button>
        )}
      </div>
    </div>
  );

  const side = (
    <div className="fn-flow" {...flow}>
      <div className="ec-block ec-wide">
        <span className="ec-cap">{creating ? `Number · fiscal year ${fy}` : "Expense number"}</span>
        <div className="fn-eid">{creating ? "Given when saved" : purchase.expenseId}</div>
      </div>
      {saved && <p className="ec-strip ec-wide" role="status"><span><b>Saved</b><small>{saved}. The next one is ready.</small></span></p>}
      <div className="ec-block ec-wide">
        <span className="ec-cap">Total</span>
        <div className="ec-fig">{money(totals.total)}</div>
      </div>
      <KV rows={[
        ["Items", money(totals.subtotal)],
        ...(Number(form.discountAmt) > 0 ? [["Discount", `− ${money(Number(form.discountAmt))}`]] : []),
        ...(form.vatBill === true ? [["VAT 13%", `+ ${money(totals.vat)}`, "good"]] : []),
      ]} />
      <Field label="Discount" htmlFor={`${uid}-disc`}>
        <NumberInput id={`${uid}-disc`} unit="NPR" value={form.discountAmt || ""} placeholder="0" disabled={!editable} onChange={(e) => set({ discountAmt: Number(e.target.value || 0) })} />
      </Field>
      {form.vatBill === true && (
        <Field label="Taxable amount" htmlFor={`${uid}-tax`} hint="Only when the bill splits taxable from non-taxable. Left empty, VAT is on everything after the discount.">
          <NumberInput id={`${uid}-tax`} unit="NPR" value={form.taxableAmt || ""} placeholder={String(Math.max(0, totals.subtotal - Number(form.discountAmt || 0)))} disabled={!editable} onChange={(e) => set({ taxableAmt: Number(e.target.value || 0) })} />
        </Field>
      )}
      <Field label="Region" htmlFor={`${uid}-reg`} wide>
        <Select
          id={`${uid}-reg`} label="Region" value={form.region || ""} onChange={thenAdvance((v) => set({ region: v }))} disabled={!editable} searchable={false}
          options={[...(creating ? [] : [{ value: "", label: "Not set" }]), ...REGIONS.map((r) => ({ value: r.id, label: r.label }))]}
        />
      </Field>
      {form.vatBill === true && (
        <div className="ec-block ec-wide">
          <span className="ec-cap">VAT bill file</span>
          {bills.length > 0 && (
            <ul className="fn-bills">
              {bills.map((b) => <li key={b.id}><a className="fn-link" href={b.fileUrl} target="_blank" rel="noopener noreferrer">{b.fileName || "Bill"} ↗</a></li>)}
            </ul>
          )}
          {editable && <FileDrop file={file} onFile={setFile} label={bills.length ? "Attach another" : "Attach the bill"} />}
        </div>
      )}
      {!creating && purchase.createdAt && (
        <KV rows={[["Entered", show(String(purchase.createdAt).slice(0, 10))]]} />
      )}
    </div>
  );

  return (
    <EditCard
      title={creating ? "New purchase" : `${purchase.expenseId || "Purchase"}`}
      subtitle={creating ? "A bill from a supplier or a shop" : `${(purchase.expenseItem || "").trim()} · ${show(purchase.date)}`}
      className="fn-pc"
      main={main} side={side} canEdit={editable} creating={creating} dirty={dirty || Boolean(file)}
      onClose={onClose} onSave={save}
      onDelete={creating ? undefined : async () => { const r = await removePurchase(purchase); if (r.ok) await reload(); return r; }}
      deleteName={purchase ? `${purchase.expenseId} ${(purchase.expenseItem || "").trim()}` : ""}
      deleteNote="It also deletes any VAT bills, stock entries and journal records made from it. This can't be undone."
      submitLabel={creating ? "Save" : "Save changes"}
      footerExtra={creating && editable ? (
        <button type="submit" className="ghost-button" title="Ctrl + Enter" onClick={() => { mode.current = "again"; }}>Save and add another</button>
      ) : !creating && !dirty && !file ? (
        <ShareButton type="purchase" record={{ purchase, bills }} compact title="Send this purchase to someone in Chat" />
      ) : null}
    />
  );
}

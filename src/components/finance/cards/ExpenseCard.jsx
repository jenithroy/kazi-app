/**
 * An expense, new or opened: the card in the middle of the screen (components/EditCard.jsx).
 *
 * New, it is built to be typed through: category, amount, date, how it was paid, a note; Enter moves on and Enter in the last
 * field saves, and "Save and add another" keeps the card up with the date still set, for a batch of bills from the same day.
 * Opened, it is the same form with the expense in it, and the only way an expense can be corrected (it could only be marked
 * paid or deleted before).
 */
import { useEffect, useId, useRef, useState } from "react";
import EditCard, { Field, KV, NumberInput, Seg, Tag } from "../../EditCard";
import Select from "../../Select";
import DateField from "../DateField";
import FileDrop from "../FileDrop";
import { useFin } from "../FinanceContext";
import { useMoney } from "../parts";
import { addExpense, emptyExpense, removeExpense, updateExpense } from "../../../lib/financeWrites";
import { EXPENSE_CATEGORIES } from "../../../lib/finance";
import { BANK_NAMES } from "../../../utils/billing.jsx";
import { kathmanduDate } from "../../../utils/date";
import { enterAdvance, focusFirst, thenAdvance } from "../flow";
import useCardForm from "./useCardForm";
import { REGIONS } from "../../../utils/region";
import ShareButton from "../../share/ShareButton";

const PAYMENT = [["CASH", "Cash"], ["Bank", "Bank"], ["Credit", "Credit"]];

function fromExpense(x) {
  return {
    category: x.category || "Other", amountNPR: x.amountNPR == null ? "" : String(x.amountNPR), date: x.date || "", note: x.note || "",
    vatBill: Boolean(x.vatBill), region: x.region || "", paymentType: x.paymentType || "CASH", bankName: x.bankName || "Nabil Bank",
    paid: x.status === "Paid",
  };
}

export default function ExpenseCard({ expense, bill, onClose }) {
  const { profile, region, canEditTab, reload, notify, show } = useFin();
  const money = useMoney();
  const uid = useId();
  const root = useRef(null);
  const mode = useRef("close");
  const creating = !expense;
  const editable = canEditTab("expenses");

  const { form, set, reset, dirty } = useCardForm(() => (creating ? { ...emptyExpense(kathmanduDate(), region), paid: false } : fromExpense(expense)));
  const [file, setFile] = useState(null);
  const [saved, setSaved] = useState("");
  useEffect(() => { focusFirst(root.current?.closest("form")); }, []);

  const known = EXPENSE_CATEGORIES.includes(form.category) || !form.category ? EXPENSE_CATEGORIES : [form.category, ...EXPENSE_CATEGORIES];
  const isOtherBank = form.bankName === "other" || (form.bankName && !BANK_NAMES.includes(form.bankName));
  const amount = Number(form.amountNPR) || 0;

  async function save() {
    const again = mode.current === "again";
    mode.current = "close";
    if (form.amountNPR === "" || !Number.isFinite(Number(form.amountNPR))) return { ok: false, message: "Enter the amount." };
    if (!form.date) return { ok: false, message: "Pick the date." };
    if (form.paymentType === "Bank" && (!form.bankName || form.bankName === "other")) return { ok: false, message: "Type the bank's name." };
    const res = creating
      ? await addExpense({ form, file, profile, region })
      : await updateExpense(expense.id, form);
    if (!res.ok) return res;
    if (res.warning) notify(res.warning, "warn");
    if (!again) { await reload(); return { ok: true }; }
    // the next expense starts at once, so what is typed from here on is its own; the list catches up behind it
    setSaved(`${form.category}, ${money(amount)}`);
    reset({ ...emptyExpense(form.date, region), paid: false });
    setFile(null);
    focusFirst(root.current);
    reload().catch(console.error);
    return { ok: true, keepOpen: true };
  }

  const flow = { onKeyDown: (e) => enterAdvance(e, () => { mode.current = creating ? "again" : "close"; e.target.closest("form")?.requestSubmit(); }) };

  const main = (
    <div className="fn-flow" ref={root} {...flow}>
      <Field label="Category" htmlFor={`${uid}-cat`}>
        <Select id={`${uid}-cat`} label="Category" value={form.category} onChange={thenAdvance((v) => set({ category: v }))} options={known.map((c) => ({ value: c, label: c }))} disabled={!editable} />
      </Field>
      <Field label="Amount" htmlFor={`${uid}-amt`}>
        <NumberInput id={`${uid}-amt`} unit="NPR" value={form.amountNPR} placeholder="0" disabled={!editable} onChange={(e) => set({ amountNPR: e.target.value })} step="any" min={undefined} />
      </Field>
      <DateField id={`${uid}-date`} label="Date" value={form.date} onChange={thenAdvance((v) => set({ date: v }))} disabled={!editable} required />
      <Field label="Paid by" labelId={`${uid}-pay`}>
        <Seg label="Paid by" value={form.paymentType} onChange={(v) => set({ paymentType: v })} options={PAYMENT} disabled={!editable} />
      </Field>
      {form.paymentType === "Bank" && (
        <Field label="Bank" htmlFor={`${uid}-bank`}>
          <Select
            id={`${uid}-bank`} label="Bank" value={isOtherBank ? "other" : (form.bankName || "Nabil Bank")}
            onChange={thenAdvance((v) => set({ bankName: v }))} disabled={!editable} searchable={false}
            options={[...BANK_NAMES.map((b) => ({ value: b, label: b })), { value: "other", label: "Another bank" }]}
          />
        </Field>
      )}
      {form.paymentType === "Bank" && isOtherBank && (
        <Field label="Bank's name" htmlFor={`${uid}-bankx`}>
          <input id={`${uid}-bankx`} type="text" value={form.bankName === "other" ? "" : form.bankName} placeholder="Type the bank's name" disabled={!editable} onChange={(e) => set({ bankName: e.target.value === "" ? "other" : e.target.value })} />
        </Field>
      )}
      <Field label="Region" htmlFor={`${uid}-reg`}>
        <Select
          id={`${uid}-reg`} label="Region" value={form.region} onChange={thenAdvance((v) => set({ region: v }))} disabled={!editable} searchable={false}
          options={[...(creating ? [] : [{ value: "", label: "Not set" }]), ...REGIONS.map((r) => ({ value: r.id, label: r.label }))]}
        />
      </Field>
      <Field label="Note" htmlFor={`${uid}-note`} wide>
        <input id={`${uid}-note`} type="text" value={form.note} placeholder="What was it for? (optional)" disabled={!editable} onChange={(e) => set({ note: e.target.value })} />
      </Field>
    </div>
  );

  const side = (
    <div className="fn-flow" {...flow}>
      <div className="ec-block ec-wide">
        <span className="ec-cap">Amount</span>
        <div className={`ec-fig${amount < 0 ? " ec-bad" : ""}`}>{money(amount)}</div>
      </div>
      {saved && <p className="ec-strip ec-wide" role="status"><span><b>Saved</b><small>{saved}. The next one is ready.</small></span></p>}
      <Field label="Status" labelId={`${uid}-st`} wide>
        <Seg label="Status" value={form.paid ? "paid" : "unpaid"} onChange={(v) => set({ paid: v === "paid" })} options={[["unpaid", "Not paid"], ["paid", "Paid"]]} disabled={!editable} />
        <small className="ec-hint">Only a paid expense counts as money out of cash or the bank in the ledger.</small>
      </Field>
      <div className="ec-block ec-wide">
        <span className="ec-cap">VAT bill</span>
        <label className="fn-check">
          <input type="checkbox" data-enter="tick" checked={form.vatBill} disabled={!editable} onChange={(e) => set({ vatBill: e.target.checked })} />
          <span>This expense has a VAT bill</span>
        </label>
        {form.vatBill && creating && <FileDrop file={file} onFile={setFile} disabled={!editable} label="Attach the bill" />}
        {form.vatBill && !creating && (bill
          ? <a className="fn-link" href={bill.fileUrl} target="_blank" rel="noopener noreferrer">View the bill ↗</a>
          : <p className="ec-note">No file is attached yet.</p>)}
      </div>
      {!creating && (
        <KV rows={[
          ["Logged by", (expense.loggedBy || "").trim() || "—"],
          ["On", show(expense.date)],
          ["Status", <Tag key="s" tone={expense.status === "Paid" ? "good" : undefined}>{expense.status === "Paid" ? "Paid" : "Not paid"}</Tag>],
        ]} />
      )}
    </div>
  );

  return (
    <EditCard
      title={creating ? "New expense" : `${expense.category || "Expense"}`}
      subtitle={creating ? "Money spent that is not a bill from a supplier" : `${show(expense.date)} · ${money(Number(expense.amountNPR) || 0)}`}
      main={main} side={side} canEdit={editable} creating={creating} dirty={dirty || Boolean(file)}
      onClose={onClose} onSave={save}
      onDelete={creating ? undefined : () => removeExpense(expense.id).then(async (r) => { if (r.ok) await reload(); return r; })}
      deleteName={expense ? `${expense.category || "Expense"} ${money(Number(expense.amountNPR) || 0)}` : ""}
      deleteNote="It is taken out of the books. This can't be undone."
      submitLabel={creating ? "Save" : "Save changes"}
      footerExtra={creating && editable ? (
        <button type="submit" className="ghost-button" onClick={() => { mode.current = "again"; }}>Save and add another</button>
      ) : !creating && !dirty && !file ? (
        <ShareButton type="expense" record={expense} compact title="Send this expense to someone in Chat" />
      ) : null}
    />
  );
}

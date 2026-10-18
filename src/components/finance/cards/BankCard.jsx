/**
 * A bank transaction: log a new one, or open one (most arrive from the bank's statement) to read it, correct its words, or delete it.
 *
 * What the table can keep is a date, a type (Debit or Credit), an amount, a description and a note. The old form also asked for the
 * bank and a category and kept neither, and its date and amount went to columns that do not exist, so nothing it saved had either.
 * This one asks for what is kept. A line from the statement keeps the date the bank gave it; the card says so.
 */
import { useEffect, useId, useRef, useState } from "react";
import EditCard, { Field, KV, NumberInput, Seg } from "../../EditCard";
import DateField from "../DateField";
import { useFin } from "../FinanceContext";
import { useMoney } from "../parts";
import useCardForm from "./useCardForm";
import { addBankTxn, emptyBankTxn, removeBankTxn, updateBankTxn } from "../../../lib/financeWrites";
import { bankText, isBankCredit } from "../../../lib/finance";
import { kathmanduDate } from "../../../utils/date";
import { enterAdvance, focusFirst, thenAdvance } from "../flow";

const TYPE = [["Debit", "Money out"], ["Credit", "Money in"]];

function fromTxn(t) {
  return {
    date: String(t.date || "").slice(0, 10), description: t.description || "", amount: t.amount == null ? "" : String(t.amount),
    type: isBankCredit(t) ? "Credit" : "Debit", reference: t.remarks || "",
  };
}

export default function BankCard({ txn, onClose }) {
  const { region, canEditTab, reload, show } = useFin();
  const money = useMoney();
  const uid = useId();
  const root = useRef(null);
  const mode = useRef("close");
  const creating = !txn;
  const editable = canEditTab("bank");
  // a line from the bank's statement keeps the date and time the bank gave it (it has the statement's running balance)
  const fromStatement = !creating && txn.balance != null;
  const { form, set, reset, dirty } = useCardForm(() => (creating ? emptyBankTxn(kathmanduDate()) : fromTxn(txn)));
  const [saved, setSaved] = useState("");

  useEffect(() => { focusFirst(root.current?.closest("form"), `#${CSS.escape(`${uid}-amt`)}`); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const amount = Number(form.amount) || 0;
  const credit = form.type === "Credit";

  async function save() {
    const again = mode.current === "again";
    mode.current = "close";
    if (!form.date) return { ok: false, message: "Pick the transaction date." };
    if (form.amount === "" || !Number.isFinite(Number(form.amount))) return { ok: false, message: "Enter the amount." };
    if (creating && !form.description.trim()) return { ok: false, message: "Say what the transaction was." };
    const res = creating ? await addBankTxn({ form, region }) : await updateBankTxn(txn.id, form, { dateEditable: !fromStatement });
    if (!res.ok) return res;
    if (!again) { await reload(); return { ok: true }; }
    // the next transaction starts at once, so what is typed from here on is its own; the list catches up behind it
    setSaved(`${credit ? "In" : "Out"} ${money(amount)}`);
    reset({ ...emptyBankTxn(form.date), type: form.type });
    focusFirst(root.current?.closest("form"), `#${CSS.escape(`${uid}-amt`)}`);
    reload().catch(console.error);
    return { ok: true, keepOpen: true };
  }

  const submitNow = (m) => (e) => { mode.current = m; e.target.closest("form")?.requestSubmit(); };
  const flow = {
    onKeyDown: (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitNow(creating ? "again" : "close")(e); return; }
      enterAdvance(e, () => submitNow(creating ? "again" : "close")(e));
    },
  };

  const main = (
    <div className="fn-flow" ref={root} {...flow}>
      <DateField
        id={`${uid}-date`} label="Date" value={form.date} onChange={thenAdvance((v) => set({ date: v }))} required
        disabled={!editable || fromStatement} hint={fromStatement ? "From the bank statement, so the date stays as the bank gave it." : undefined}
      />
      <Field label="Amount" htmlFor={`${uid}-amt`}>
        <NumberInput id={`${uid}-amt`} unit="NPR" value={form.amount} placeholder="0" disabled={!editable} onChange={(e) => set({ amount: e.target.value })} />
      </Field>
      <Field label="Type" labelId={`${uid}-type`} wide>
        <Seg label="Type" value={form.type} onChange={(v) => set({ type: v })} options={TYPE} disabled={!editable} />
      </Field>
      <Field label="Description" htmlFor={`${uid}-desc`} wide>
        <input id={`${uid}-desc`} type="text" value={form.description} placeholder="e.g. Supplier payment, fabric" disabled={!editable} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field label={fromStatement ? "Statement note" : "Reference or note"} htmlFor={`${uid}-ref`} wide>
        <textarea id={`${uid}-ref`} value={form.reference} placeholder="Cheque number, the bank's reference…" disabled={!editable} onChange={(e) => set({ reference: e.target.value })} />
      </Field>
    </div>
  );

  const side = (
    <div className="fn-flow" {...flow}>
      <div className="ec-block ec-wide">
        <span className="ec-cap">{credit ? "Money in" : "Money out"}</span>
        <div className={`ec-fig ${credit ? "ec-good" : "ec-bad"}`}>{credit ? "+" : "−"} {money(amount)}</div>
      </div>
      {saved && <p className="ec-strip ec-wide" role="status"><span><b>Saved</b><small>{saved}. The next one is ready.</small></span></p>}
      <KV rows={[
        ["Filed under", "Nabil Bank"],
        ...(fromStatement ? [["Balance after it", money(Number(txn.balance) || 0)]] : []),
        ...(!creating ? [["On", show(txn.date)], ["Time", String(txn.date || "").slice(11) || "—"]] : []),
      ]} />
      <p className="ec-note ec-wide">Every bank transaction is filed under Nabil Bank in the ledger: the table does not keep which bank.</p>
    </div>
  );

  return (
    <EditCard
      title={creating ? "Log a bank transaction" : (bankText(txn).slice(0, 60) || "Bank transaction")}
      subtitle={creating ? "Money that went in or out of the bank" : `${show(txn.date)} · ${credit ? "in" : "out"} ${money(Number(txn.amount) || 0)}`}
      main={main} side={side} canEdit={editable} creating={creating} dirty={dirty}
      onClose={onClose} onSave={save}
      onDelete={creating ? undefined : async () => { const r = await removeBankTxn(txn.id); if (r.ok) await reload(); return r; }}
      deleteName={txn ? (bankText(txn).slice(0, 40) || "this transaction") : ""} deleteNote="It is taken out of the books. This can't be undone."
      submitLabel={creating ? "Save" : "Save changes"}
      footerExtra={creating && editable ? (
        <button type="submit" className="ghost-button" title="Ctrl + Enter" onClick={() => { mode.current = "again"; }}>Save and add another</button>
      ) : null}
    />
  );
}

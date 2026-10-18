/**
 * Payments on one invoice: record what arrived, see what has arrived, take back one that was entered wrongly.
 *
 * Each payment is its own row, with the date it actually arrived (without it there is no telling how long anyone takes to pay). The
 * invoice's paid total is worked out from those rows by the database, and its status (Partial, Paid) follows from them here. A payment
 * can never be more than what is outstanding. A settled invoice shows only its history, so a payment recorded by mistake can still be
 * found and deleted. All of it is the old Billing page's payment dialog: its checks, its payload, its status rules.
 */
import { useEffect, useId, useState } from "react";
import EditCard, { Field, KV, NumberInput } from "../EditCard";
import Select from "../Select";
import DateField from "../finance/DateField";
import useCardForm from "../finance/cards/useCardForm";
import { enterAdvance, thenAdvance } from "../finance/flow";
import { deletePayment, loadPayments, recordPayment } from "../../lib/billingWrites";
import { fmtDate, fmtNPR } from "../../utils/billing.jsx";
import { toNPR } from "../../utils/currency";
import { todayDate } from "../../utils/date";

const METHODS = ["Bank", "Cash", "Cheque", "Online", "Other"];
// older rows were saved as "CASH"; show every method the way the dropdown spells it
const method = (m) => METHODS.find((x) => x.toLowerCase() === String(m).toLowerCase()) || m;

export default function PaymentCard({ info, canEdit, profile, api, onClose, onSaved }) {
  const uid = useId();
  const [cur, setCur] = useState({ currentPaid: info.currentPaid, docPaid: info.docPaid });
  const [history, setHistory] = useState([]);
  const [note, setNote] = useState("");
  const [deleting, setDeleting] = useState(null);
  const method0 = info.paymentType === "CASH" ? "Cash" : METHODS.includes(info.paymentType) ? info.paymentType : "Bank";
  const { form, set, dirty } = useCardForm(() => ({ amount: "", date: todayDate(), method: method0, reference: "" }));

  const now = { ...info, ...cur };
  const outstanding = Math.max(0, info.totalNPR - cur.currentPaid);
  const open = outstanding > 0.005;
  const typed = Number(form.amount);
  const after = form.amount && typed > 0 ? Math.min(cur.currentPaid + typed, info.totalNPR) : null;

  useEffect(() => { let live = true; loadPayments(info.id).then((rows) => { if (live) setHistory(rows); }); return () => { live = false; }; }, [info.id]);

  async function save() {
    if (form.date && form.date > todayDate()) return { ok: false, message: "The date received cannot be in the future." };
    const res = await recordPayment({ info: now, amount: form.amount, date: form.date, method: form.method, reference: form.reference, profile });
    if (!res.ok) return res;
    await api.reload();
    onSaved?.();
    return { ok: true };
  }

  async function remove(p) {
    // Never p.amountNPR: the view only knows GBP. amount is in the invoice's currency.
    const amt = toNPR(p.amount, p.invoiceCurrency || info.currency);
    const when = p.isOpening ? "opening balance" : `payment from ${fmtDate(p.paidOn)}`;
    const yes = await api.ask({
      title: "Delete this payment?", confirmLabel: "Delete payment", danger: true,
      body: <p>Delete the {fmtNPR(amt)} {when}? This cannot be undone.</p>,
    });
    if (!yes) return;
    setDeleting(p.id);
    setNote("");
    const res = await deletePayment({ info: now, payment: p });
    if (!res.ok) { setNote(res.message); setDeleting(null); return; }
    setCur((c) => ({ currentPaid: res.remaining, docPaid: Math.max(0, c.docPaid - res.removed) }));
    setHistory(await loadPayments(info.id));
    setDeleting(null);
    api.reload().catch(console.error);
  }

  const flow = { onKeyDown: (e) => enterAdvance(e, () => e.target.closest("form")?.requestSubmit()) };

  // what has arrived so far is on the left under the form (a long list needs the room, and a settled invoice has nothing else to show there);
  // the numbers are on the right
  const main = (
    <div className="fn-flow" {...flow}>
      {open && (
        <>
          <Field label="Amount received" htmlFor={`${uid}-amt`} wide>
            <NumberInput
              id={`${uid}-amt`} unit="NPR" value={form.amount} placeholder={`Up to ${fmtNPR(outstanding)}`} min="1" disabled={!canEdit} autoFocus
              onChange={(e) => set({ amount: e.target.value })}
            />
          </Field>
          <DateField id={`${uid}-date`} label="Date received" value={form.date} disabled={!canEdit} onChange={thenAdvance((v) => set({ date: v }))} />
          <Field label="Method" htmlFor={`${uid}-method`}>
            <Select id={`${uid}-method`} label="Method" value={form.method} options={METHODS.map((m) => ({ value: m, label: m }))} searchable={false} disabled={!canEdit} onChange={thenAdvance((v) => set({ method: v }))} />
          </Field>
          <Field label="Reference (optional)" htmlFor={`${uid}-ref`} wide>
            <input id={`${uid}-ref`} type="text" value={form.reference} placeholder="Cheque no., transaction id…" disabled={!canEdit} onChange={(e) => set({ reference: e.target.value })} />
          </Field>
        </>
      )}
      <div className="ec-block ec-wide">
        <span className="ec-cap">Payments so far</span>
        {history.length === 0 ? (
          <p className="ec-note">None recorded yet.</p>
        ) : (
          <ul className="bl-hist">
            {history.map((p) => (
              <li key={p.id}>
                <span>{p.isOpening ? "Date unknown" : fmtDate(p.paidOn)}{p.method && !p.isOpening ? ` · ${method(p.method)}` : ""}</span>
                <b>{fmtNPR(toNPR(p.amount, p.invoiceCurrency || info.currency))}</b>
                {canEdit && (
                  <button type="button" className="ghost-button bl-hist-x" title="Delete this payment" aria-label={`Delete the payment from ${p.isOpening ? "an unknown date" : fmtDate(p.paidOn)}`} disabled={deleting !== null} onClick={() => remove(p)}>
                    {deleting === p.id ? "…" : "Delete"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!open && <p className="ec-note">This invoice is settled. A payment entered by mistake can be deleted here.</p>}
      </div>
    </div>
  );

  const side = (
    <div className="fn-flow">
      <div className="ec-block ec-wide">
        <span className="ec-cap">Credit outstanding</span>
        <div className="ec-fig">{fmtNPR(outstanding)}</div>
      </div>
      <KV rows={[
        ["Invoice total", fmtNPR(info.totalNPR)],
        ["Already paid", fmtNPR(cur.currentPaid), cur.currentPaid > 0 ? "good" : undefined],
        ...(after != null ? [["Total paid after", fmtNPR(after)], ["Credit remaining", fmtNPR(Math.max(0, outstanding - typed)), Math.max(0, outstanding - typed) > 0 ? "bad" : "good"]] : []),
      ]} />
      {note && <p className="ec-strip is-warn ec-wide" role="alert"><span><b>{note}</b></span></p>}
    </div>
  );

  return (
    <EditCard
      title={open ? "Record payment" : "Payment history"} subtitle={`${info.docNum} · Total ${fmtNPR(info.totalNPR)}`}
      className="bl-pay" main={main} side={side} creating canEdit={canEdit && open} dirty={dirty}
      onClose={onClose} onSave={canEdit && open ? save : undefined} submitLabel="Save payment" closeLabel={open ? "Cancel" : "Close"}
    />
  );
}

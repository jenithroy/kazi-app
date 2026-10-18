import { useId, useState } from "react";
import Modal from "../Modal";
import Select from "../Select";
import DatePicker from "../DatePicker";
import { roundAmount } from "../../utils/format";
import { PAYMENT_TERMS, PAYMENT_TYPES, Switch } from "./OrderFormDialog";

const VAT_RATE = 0.13;

/**
 * "Issue invoice" for an order that exists already: the client's details, when it is due and how
 * it is paid, and the totals it will carry. It makes a Draft invoice in Billing and links it to
 * the order. `onSubmit(fields)` resolves to `{ ok, message }`.
 */
export default function InvoiceDialog({ order, initial, today, onSubmit, onClose }) {
  const uid = useId();
  const fid = (name) => `${uid}-${name}`;
  const [fields, setFields] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (patch) => { setFields((f) => ({ ...f, ...patch })); setError(""); };

  const qty = Number(order.quantity || 0);
  const rate = Number(order.pricePerPcNPR || 0);
  const sub = qty * rate;
  const vat = fields.applyVAT ? sub * VAT_RATE : 0;
  const total = sub + vat;

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const res = await onSubmit(fields);
    if (res?.ok) { onClose(); return; }
    setError(res?.message || "Could not issue the invoice. Try again.");
    setSaving(false);
  }

  return (
    <Modal
      size="sm"
      className="pr-dlg"
      glass
      title="Issue invoice"
      subtitle={`${order.orderId} · ${order.customerName}`}
      onClose={saving ? undefined : onClose}
      onSubmit={submit}
      footer={(
        <>
          {error && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
          <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Issuing…" : "Issue invoice (draft)"}</button>
        </>
      )}
    >
      <div className="pr-inv-line">
        <span>{order.styleName}{order.fabricType ? ` — ${order.fabricType}` : ""}{order.colorway ? ` (${order.colorway})` : ""}</span>
        <small>{qty.toLocaleString()} pcs × NPR {roundAmount(rate).toLocaleString()}</small>
      </div>

      <div className="kof">
        <label className="kof-f">
          <span className="kof-l">Client address</span>
          <input type="text" autoComplete="off" placeholder="Street, City, Country" value={fields.clientAddress} onChange={(e) => set({ clientAddress: e.target.value })} />
        </label>
        <label className="kof-f kof-c6 kof-h">
          <span className="kof-l">Client phone</span>
          <input type="tel" autoComplete="off" placeholder="+977 ..." value={fields.clientPhone} onChange={(e) => set({ clientPhone: e.target.value })} />
        </label>
        <label className="kof-f kof-c6 kof-h">
          <span className="kof-l">PAN / tax no.</span>
          <input type="text" autoComplete="off" placeholder="VAT / PAN number" value={fields.clientPAN} onChange={(e) => set({ clientPAN: e.target.value })} />
        </label>
        <div className="kof-f">
          <label className="kof-l" htmlFor={fid("due")}>Due date</label>
          <DatePicker id={fid("due")} label="Due date" value={fields.dueDate} onChange={(v) => set({ dueDate: v })} today={today} placeholder="No due date" />
        </div>
        <div className="kof-f kof-c6 kof-h">
          <label className="kof-l" htmlFor={fid("terms")}>Payment terms</label>
          <Select id={fid("terms")} label="Payment terms" value={fields.paymentTerms} onChange={(v) => set({ paymentTerms: v })} options={PAYMENT_TERMS} />
        </div>
        <div className="kof-f kof-c6 kof-h">
          <label className="kof-l" htmlFor={fid("type")}>Payment type</label>
          <Select id={fid("type")} label="Payment type" value={fields.paymentType} onChange={(v) => set({ paymentType: v })} options={PAYMENT_TYPES} />
        </div>
        <Switch checked={fields.applyVAT} onChange={(v) => set({ applyVAT: v })} label="Apply VAT (13%)" />
      </div>

      <dl className="kof-tot pr-inv-tot">
        <div><dt>Subtotal</dt><dd>NPR {roundAmount(sub).toLocaleString()}</dd></div>
        {fields.applyVAT && <div><dt>VAT 13%</dt><dd>NPR {roundAmount(vat).toLocaleString()}</dd></div>}
        <div className="kof-tot-total"><dt>Total</dt><dd>NPR {roundAmount(total).toLocaleString()}</dd></div>
      </dl>
    </Modal>
  );
}

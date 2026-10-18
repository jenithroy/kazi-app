import { useId, useMemo, useState } from "react";
import Modal from "../Modal";
import Select from "../Select";
import { Field } from "../EditCard";
import "./sales.css";

const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/**
 * Merging a duplicate: the backfill made one customer per distinct spelling, because guessing that "F.L.Y Clothing" and
 * "FLY CLOTHING" are the same buyer is not the database's call to make. This is how a person makes it: pick the one to
 * keep, and every order, invoice and payment of this one moves onto it, then this one is deleted.
 *
 * `onMerge(source, targetId)` resolves to `{ ok, message }`; on ok the page closes everything, otherwise the message
 * stays here.
 */
export default function MergeDialog({ source, rows, onClose, onMerge }) {
  const uid = useId();
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const options = useMemo(
    () => rows.filter((c) => c.id !== source.id)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map((c) => ({ value: c.id, label: c.name, hint: c.city || undefined })),
    [rows, source.id],
  );
  const target = rows.find((c) => c.id === targetId);

  async function submit(e) {
    e.preventDefault();
    if (!targetId || busy) return;
    setBusy(true);
    setError("");
    const res = await onMerge(source, targetId);
    if (!res.ok) { setError(res.message); setBusy(false); }
  }

  return (
    <Modal
      title={`Merge ${source.name}`}
      size="sm"
      glass
      className="kmodal--sales"
      onClose={busy ? undefined : onClose}
      onSubmit={submit}
      footer={(
        <>
          {error && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy || !targetId}>{busy ? "Merging…" : "Merge"}</button>
        </>
      )}
    >
      <div className="sl-merge">
        <p className="sl-text">
          Move every order, invoice and payment from <b>{source.name}</b> onto another customer, then
          delete <b>{source.name}</b>. Use this for duplicates: the same buyer typed two different ways.
        </p>
        <Field label="Merge into" htmlFor={`${uid}-target`}>
          <Select
            id={`${uid}-target`}
            label="Customer to keep"
            value={targetId}
            onChange={setTargetId}
            options={options}
            placeholder="Select the customer to keep…"
            searchPlaceholder="Search customers"
          />
        </Field>
        {target && (
          <p className="sl-well">
            {source.orders.length} {plural(source.orders.length, "order")},{" "}
            {source.invoices.length} {plural(source.invoices.length, "invoice")} and{" "}
            {source.payments.length} {plural(source.payments.length, "payment")} move to <b>{target.name}</b>.
            This cannot be undone.
          </p>
        )}
      </div>
    </Modal>
  );
}

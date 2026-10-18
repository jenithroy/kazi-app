/**
 * A small question in the middle of the screen, in the glass dialog's own look: what is about to happen, and a button for each answer.
 * For the things that are not a record's own Delete (that asks inside its card), such as renumbering issued expense numbers.
 */
import { useRef, useState } from "react";
import Modal from "../Modal";

export default function ConfirmDialog({ title, children, confirmLabel, busyLabel = "Working…", danger = false, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keep = useRef(null);

  async function go() {
    setBusy(true);
    setError("");
    try {
      const res = await onConfirm();
      if (res && res.ok === false) { setError(res.message || "That did not work. Try again."); setBusy(false); return; }
    } catch (err) {
      setError(err?.message || "That did not work. Try again.");
      setBusy(false);
      return;
    }
    onCancel();
  }

  return (
    <Modal
      title={title}
      size="sm"
      glass
      onClose={busy ? undefined : onCancel}
      footer={(
        <>
          {error && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
          <button type="button" ref={keep} className="ghost-button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={`primary-button${danger ? " ec-btn-danger" : ""}`} onClick={go} disabled={busy}>{busy ? busyLabel : confirmLabel}</button>
        </>
      )}
    >
      <div className="fn-confirm">{children}</div>
    </Modal>
  );
}

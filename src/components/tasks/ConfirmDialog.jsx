import { useState } from "react";
import Modal from "../Modal";
import "./tasks.css";

/**
 * "Are you sure?" for something that cannot be undone. Says what will happen in plain
 * words, and keeps the dialog open (with the buttons disabled) while it happens so it
 * cannot be pressed twice. `onConfirm` resolves to whether it worked; an error stays on
 * screen instead of vanishing with the dialog.
 */
export default function ConfirmDialog({ title, children, confirmLabel = "Delete", busyLabel = "Deleting…", onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await onConfirm();
    if (res === false || (res && res.ok === false)) {
      setError(res?.message || "That didn't work. Try again.");
      setBusy(false);
      return;
    }
    onClose();
  }

  return (
    <Modal
      title={title}
      size="sm"
      glass
      onClose={busy ? undefined : onClose}
      onSubmit={go}
      footer={(
        <>
          {error && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="primary-button tk-btn-danger" disabled={busy}>{busy ? busyLabel : confirmLabel}</button>
        </>
      )}
    >
      <p className="tk-hint">{children}</p>
    </Modal>
  );
}

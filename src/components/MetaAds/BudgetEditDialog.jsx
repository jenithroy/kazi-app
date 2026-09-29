import { useMemo, useState } from "react";
import Modal from "../Modal";
import { asCurrency } from "../../utils/format";

/**
 * Pause/resume and budget edits are real-money actions. A hard ceiling is
 * enforced server-side (the Worker checks meta_ads_settings.budget_ceiling_minor
 * before ever calling Meta — this dialog's own check is a courtesy, not the
 * real guard). The >3x confirm step here IS the real guard for that specific
 * case, since nothing server-side blocks a merely-large-but-under-ceiling jump.
 */
export default function BudgetEditDialog({ entity, level, currency, confirmMultiplier, ceilingMinor, busy, onCancel, onSubmit }) {
  const field = entity.dailyBudgetMinor != null || entity.lifetimeBudgetMinor == null ? "daily_budget" : "lifetime_budget";
  const currentMinor = field === "daily_budget" ? entity.dailyBudgetMinor : entity.lifetimeBudgetMinor;
  const [amount, setAmount] = useState(currentMinor != null ? (currentMinor / 100).toString() : "");
  const [confirmedOverCeiling, setConfirmedOverCeiling] = useState(false);
  const [err, setErr] = useState("");

  const valueMinor = Math.round((Number(amount) || 0) * 100);
  const overMultiplier = currentMinor ? valueMinor > currentMinor * confirmMultiplier : false;
  const overCeiling = ceilingMinor != null && valueMinor > ceilingMinor;

  const needsConfirm = overMultiplier && !confirmedOverCeiling;

  function submit(e) {
    e.preventDefault();
    setErr("");
    if (!valueMinor || valueMinor <= 0) { setErr("Enter a budget greater than zero."); return; }
    if (overCeiling) { setErr(`That's above the ${asCurrency(ceilingMinor / 100, currency)} ceiling set in Meta Ads → Settings.`); return; }
    if (needsConfirm) return; // checkbox below handles this instead of a hard stop
    onSubmit({ entity, level, field, valueMinor, confirmedOverCeiling });
  }

  return (
    <Modal
      size="sm"
      title={`Edit budget — ${entity.name}`}
      subtitle={field === "daily_budget" ? "Daily budget" : "Lifetime budget"}
      onClose={onCancel}
      onSubmit={submit}
      footer={
        <>
          {err && <p className="kmodal-msg kmodal-msg--err" role="alert">{err}</p>}
          <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Saving…" : needsConfirm ? "Review below" : "Save"}
          </button>
        </>
      }
    >
      <label className="kmkt-field">
        <span>New {field === "daily_budget" ? "daily" : "lifetime"} budget ({currency})</span>
        <input
          type="number" min="0.01" step="0.01" autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      {currentMinor != null && (
        <p className="kmkt-muted">Currently {asCurrency(currentMinor / 100, currency)}.</p>
      )}
      {overMultiplier && (
        <div className="kmkt-warn">
          <p>
            That's more than {confirmMultiplier}× the current budget
            {currentMinor ? ` (${asCurrency(currentMinor / 100, currency)} → ${asCurrency(valueMinor / 100, currency)})` : ""}.
          </p>
          <label className="kmkt-check">
            <input
              type="checkbox"
              checked={confirmedOverCeiling}
              onChange={(e) => setConfirmedOverCeiling(e.target.checked)}
            />
            <span>Yes, I meant to increase it this much</span>
          </label>
        </div>
      )}
    </Modal>
  );
}

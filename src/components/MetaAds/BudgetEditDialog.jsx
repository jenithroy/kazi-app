import { useState } from "react";
import Modal from "../Modal";
import { Btn } from "../ui";
import { moneyMinor } from "./money";

/**
 * Pause/resume and budget edits are real-money actions. A hard ceiling is
 * enforced server-side (the Worker checks meta_ads_settings.budget_ceiling_minor
 * and its currency before ever calling Meta — this dialog's own check is a
 * courtesy, not the real guard). The over-multiple confirm step here IS the
 * real guard for that specific case, since nothing server-side blocks a
 * merely-large-but-under-ceiling jump.
 *
 * Checks run live, in order: positive amount → ceiling currency → ceiling →
 * multiple. The multiple's confirm only shows once nothing harder blocks the
 * save, so ticking it can never lead to a refusal.
 */
export default function BudgetEditDialog({ entity, level, currency, confirmMultiplier, ceilingMinor, ceilingCurrency, serverError, busy, onCancel, onSubmit }) {
  const field = entity.dailyBudgetMinor != null || entity.lifetimeBudgetMinor == null ? "daily_budget" : "lifetime_budget";
  const currentMinor = field === "daily_budget" ? entity.dailyBudgetMinor : entity.lifetimeBudgetMinor;
  const [amount, setAmount] = useState(currentMinor != null ? (currentMinor / 100).toString() : "");
  const [confirmedBigJump, setConfirmedBigJump] = useState(false);

  const multiple = Number(confirmMultiplier) >= 1 ? Number(confirmMultiplier) : 3;
  const valueMinor = Math.round((Number(amount) || 0) * 100);
  const hasCeiling = ceilingMinor != null;
  const ceilingCur = (ceilingCurrency || "").toUpperCase();
  const accountCur = (currency || "").toUpperCase();

  let blocker = "";
  if (amount !== "" && valueMinor <= 0) {
    blocker = "Enter a budget greater than zero.";
  } else if (hasCeiling && !ceilingCur) {
    blocker = "The budget ceiling has no currency set, so it can't be checked. Set it in Meta Ads → Settings first.";
  } else if (hasCeiling && ceilingCur !== accountCur) {
    blocker = `The budget ceiling is in ${ceilingCur} but this ad account spends in ${accountCur || "an unknown currency"}, so it can't be checked. Change the ceiling's currency in Meta Ads → Settings.`;
  } else if (hasCeiling && valueMinor > ceilingMinor) {
    blocker = `That's above the ${moneyMinor(ceilingMinor, ceilingCur)} ceiling set in Meta Ads → Settings.`;
  }

  const overMultiplier = !blocker && currentMinor ? valueMinor > currentMinor * multiple : false;
  const canSave = !busy && !blocker && valueMinor > 0 && (!overMultiplier || confirmedBigJump);

  function submit(e) {
    e.preventDefault();
    if (!canSave) return;
    // The audit column is still named confirmed_over_ceiling; it records the
    // over-the-multiple confirm.
    onSubmit({ entity, level, field, valueMinor, confirmedOverCeiling: overMultiplier && confirmedBigJump });
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
          <Btn kind="ghost" type="button" onClick={onCancel}>Cancel</Btn>
          <Btn kind="primary" type="submit" disabled={!canSave}>
            {busy ? "Saving…" : "Save"}
          </Btn>
        </>
      }
    >
      <label className="kmkt-field">
        <span>New {field === "daily_budget" ? "daily" : "lifetime"} budget ({currency})</span>
        <input
          type="number" min="0.01" step="0.01" autoFocus
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setConfirmedBigJump(false); }}
        />
      </label>
      {currentMinor != null && (
        <p className="kmkt-muted">Currently {moneyMinor(currentMinor, currency)}.</p>
      )}
      {blocker && <p className="kmodal-msg kmodal-msg--err" role="alert">{blocker}</p>}
      {!blocker && serverError && <p className="kmodal-msg kmodal-msg--err" role="alert">{serverError}</p>}
      {overMultiplier && (
        <div className="kmkt-warn">
          <p>
            That's more than {multiple}× the current budget
            {` (${moneyMinor(currentMinor, currency)} → ${moneyMinor(valueMinor, currency)})`}.
          </p>
          <label className="kmkt-check">
            <input
              type="checkbox"
              checked={confirmedBigJump}
              onChange={(e) => setConfirmedBigJump(e.target.checked)}
            />
            <span>Yes, I meant to increase it this much</span>
          </label>
        </div>
      )}
    </Modal>
  );
}

import { useState } from "react";
import Modal from "../Modal";
import { Btn, Icons } from "../ui";
import { moneyMinor } from "./money";

/**
 * Budget Editor per REDESIGN §4.4:
 * - Checks run live: amount > 0 -> over ceiling (hard stop, Save off) -> over multiple (amber confirm)
 * - Real-time delta display (+/- vs now)
 * - Save button displays the exact amount to be set
 */
export default function BudgetEditDialog({
  entity,
  level = "campaign",
  currency = "USD",
  confirmMultiplier,
  ceilingMinor,
  ceilingCurrency,
  serverError,
  busy,
  onCancel,
  onSubmit,
}) {
  const isDaily = entity.dailyBudgetMinor != null || entity.lifetimeBudgetMinor == null;
  const field = isDaily ? "daily_budget" : "lifetime_budget";
  const currentMinor = isDaily ? entity.dailyBudgetMinor : entity.lifetimeBudgetMinor;
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
    blocker = "The budget ceiling has no currency set. Set it in Meta Ads → Settings first.";
  } else if (hasCeiling && ceilingCur !== accountCur) {
    blocker = `The budget ceiling is in ${ceilingCur} but this ad account spends in ${accountCur || "an unknown currency"}. Change the ceiling's currency in Meta Ads → Settings.`;
  } else if (hasCeiling && valueMinor > ceilingMinor) {
    blocker = `Above your ${moneyMinor(ceilingMinor, ceilingCur)} ceiling. Meta Ads → Settings`;
  }

  const overMultiplier = !blocker && currentMinor ? valueMinor > currentMinor * multiple : false;
  const canSave = !busy && !blocker && valueMinor > 0 && (!overMultiplier || confirmedBigJump);

  const deltaMinor = currentMinor != null && valueMinor > 0 ? valueMinor - currentMinor : 0;
  const ratio = currentMinor ? (valueMinor / currentMinor).toFixed(1) : 0;

  function submit(e) {
    e.preventDefault();
    if (!canSave) return;
    onSubmit({ entity, level, field, valueMinor, confirmedOverCeiling: overMultiplier && confirmedBigJump });
  }

  const saveLabel = busy
    ? "Saving…"
    : valueMinor > 0
    ? `Save ${moneyMinor(valueMinor, currency)}${isDaily ? " / day" : ""}`
    : "Save";

  return (
    <Modal
      size="sm"
      title={`Edit ${isDaily ? "daily" : "lifetime"} budget`}
      subtitle={`${entity.name} · ${level} · currently ${moneyMinor(currentMinor, currency)}${isDaily ? " / day" : ""}`}
      onClose={onCancel}
      onSubmit={submit}
      footer={
        <>
          <Btn kind="ghost" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </Btn>
          <Btn kind="primary" type="submit" disabled={!canSave}>
            {saveLabel}
          </Btn>
        </>
      }
    >
      <div className="kmkt-field">
        <span>New {isDaily ? "daily" : "lifetime"} budget</span>
        <div className="kmkt-input-currency-group">
          <span className="kmkt-currency-tag">{currency}</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            autoFocus
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setConfirmedBigJump(false);
            }}
            placeholder="0.00"
            className="kmkt-currency-input"
          />
        </div>
      </div>

      {currentMinor != null && valueMinor > 0 && deltaMinor !== 0 && (
        <p className={`kmkt-budget-delta ${deltaMinor > 0 ? "kmkt-budget-delta--up" : "kmkt-budget-delta--down"}`}>
          {deltaMinor > 0 ? "+" : "−"}
          {moneyMinor(Math.abs(deltaMinor), currency)}
          {isDaily ? " / day" : " total"} vs now
        </p>
      )}

      {blocker && (
        <div className="kmkt-err-box" role="alert">
          <Icons.AlertTriangle size={15} />
          <span>{blocker}</span>
        </div>
      )}

      {!blocker && serverError && (
        <div className="kmkt-err-box" role="alert">
          <Icons.AlertTriangle size={15} />
          <span>{serverError}</span>
        </div>
      )}

      {overMultiplier && (
        <div className="kmkt-warn">
          <p>
            That's {ratio}× the current budget.
          </p>
          <label className="kmkt-check">
            <input
              type="checkbox"
              checked={confirmedBigJump}
              onChange={(e) => setConfirmedBigJump(e.target.checked)}
            />
            <span>Yes, I meant to raise it this much</span>
          </label>
        </div>
      )}
    </Modal>
  );
}

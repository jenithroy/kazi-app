/**
 * The two confirmations for real-money actions on Meta: pause or resume an ad, and change a budget. Each is a small glass dialog that
 * asks before it does anything, says what it is about to do in words, and stays open with the reason when it could not.
 *
 * `onConfirm` resolves to `{ ok, message? }` (lib/metaWrites.js); on ok the page closes the dialog, otherwise the message shows here.
 * The budget dialog judges the amount as it is typed (lib/metaCalc.js `budgetCheck`): more than nothing, not above the ceiling (a hard
 * stop: Save is off), and, above the confirm multiple of what it is now, a tick that says they meant it. The server checks the ceiling
 * again, so this is to tell the person before they press Save, not to be the only guard.
 */
import { useId, useRef, useState } from "react";
import Modal from "../Modal";
import { Field, NumberInput } from "../EditCard";
import { Icons } from "../ui";
import { budgetCheck, budgetFieldOf } from "../../lib/metaCalc";
import { moneyMinor } from "../../lib/metaMoney";

/** A level as a person says it ("ad set", not the code's "adset"). */
const wordOf = (level) => (level === "adset" ? "ad set" : level);

/** Pause or resume. `hold` is what would keep it from running once it is on (its campaign or ad set being off), if anything would. */
export function PauseDialog({ entity, level, action, hold = null, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const once = useRef(false);                  // a second press in the same instant must not send a second request to Meta
  const [error, setError] = useState("");
  const pause = action === "pause";
  const verb = pause ? "Pause" : "Resume";

  async function confirm() {
    if (once.current) return;
    once.current = true;
    setBusy(true);
    setError("");
    const res = await onConfirm({ entity, level, action, hold });
    if (!res.ok) { setError(res.message || "That didn't work."); setBusy(false); once.current = false; }
  }

  const heldBy = hold === "ADSET_PAUSED" ? "ad set" : "campaign";
  return (
    <Modal
      title={`${verb} ${wordOf(level)}`} subtitle={entity.name} size="sm" glass className="kmodal--meta"
      onClose={busy ? undefined : onClose}
      footer={(
        <>
          {error && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={pause ? "primary-button ec-btn-danger" : "primary-button"} onClick={confirm} disabled={busy}>
            {busy ? (pause ? "Pausing…" : "Resuming…") : verb}
          </button>
        </>
      )}
    >
      <p className="ma-dlg-text">
        {pause
          ? <>Pausing this {wordOf(level)} will stop delivery on Meta (Facebook and Instagram){level === "campaign" ? " for all of its ad sets and ads" : ""}. You can resume it any time.</>
          : hold
            ? <>Resuming this {wordOf(level)} switches it on, but it will not run, or spend, until its {heldBy} is resumed too.</>
            : <>Resuming this {wordOf(level)} will reactivate ad delivery on Meta and begin spending toward its budget.</>}
      </p>
    </Modal>
  );
}

/** Change a daily or lifetime budget. `settings` holds the ceiling and the confirm multiple. */
export function BudgetDialog({ entity, level, currency, settings, onClose, onConfirm }) {
  const uid = useId();
  const { daily, field, currentMinor } = budgetFieldOf(entity);
  const [amount, setAmount] = useState(currentMinor != null ? (currentMinor / 100).toString() : "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const once = useRef(false);                  // a second press in the same instant must not send a second budget to Meta
  const [error, setError] = useState("");

  const check = budgetCheck({
    amount, currentMinor, currency, confirmed,
    ceilingMinor: settings?.budgetCeilingMinor, ceilingCurrency: settings?.budgetCeilingCurrency, confirmMultiplier: settings?.confirmMultiplier,
  });
  const unit = daily ? " / day" : "";
  const saveLabel = busy ? "Saving…" : check.valueMinor > 0 ? `Save ${moneyMinor(check.valueMinor, currency)}${unit}` : "Save";

  async function submit(e) {
    e.preventDefault();
    if (!check.canSave || once.current) return;
    once.current = true;
    setBusy(true);
    setError("");
    const res = await onConfirm({ entity, level, field, valueMinor: check.valueMinor, confirmedOverCeiling: check.overMultiplier && confirmed });
    if (!res.ok) { setError(res.message || "That didn't work."); setBusy(false); once.current = false; }
  }

  return (
    <Modal
      title={`Edit ${daily ? "daily" : "lifetime"} budget`}
      subtitle={`${entity.name} · ${wordOf(level)} · now ${moneyMinor(currentMinor, currency)}${unit}`}
      size="sm" glass className="kmodal--meta"
      onClose={busy ? undefined : onClose} onSubmit={submit}
      footer={(
        <>
          {error && !check.blocker && <p className="kmodal-msg kmodal-msg--err" role="alert">{error}</p>}
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy || !check.canSave}>{saveLabel}</button>
        </>
      )}
    >
      <div className="ma-dlg">
        <Field label={`New ${daily ? "daily" : "lifetime"} budget`} htmlFor={`${uid}-amount`}>
          <NumberInput
            id={`${uid}-amount`} unit={currency} min="0.01" step="0.01" autoFocus value={amount} placeholder="0.00"
            onChange={(e) => { setAmount(e.target.value); setConfirmed(false); setError(""); }}
          />
        </Field>

        {currentMinor != null && check.valueMinor > 0 && check.deltaMinor !== 0 && (
          <p className={`ma-delta ${check.deltaMinor > 0 ? "is-up" : "is-down"}`}>
            {check.deltaMinor > 0 ? "+" : "−"}{moneyMinor(Math.abs(check.deltaMinor), currency)}{daily ? " / day" : " total"} vs now
          </p>
        )}

        {check.unchanged && <p className="ma-delta is-same">That is the budget it already has.</p>}

        {check.blocker && (
          <p className="ma-warnbox is-bad" role="alert"><Icons.AlertTriangle size={15} sw={1.9} aria-hidden="true" /><span>{check.blocker}</span></p>
        )}

        {check.overMultiplier && (
          <div className="ma-warnbox">
            <Icons.AlertTriangle size={15} sw={1.9} aria-hidden="true" />
            <div>
              <p role="alert">That's {check.ratio}× the current budget. Tick the box below to save it.</p>
              <label className="ma-tick">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                <span>Yes, I meant to raise it this much</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

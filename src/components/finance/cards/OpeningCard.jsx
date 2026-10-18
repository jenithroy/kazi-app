/**
 * An account's opening balance, and the date it is from. With a fiscal year chosen the figure the ledger shows is "brought forward"
 * (the opening plus everything before the year); editing it moves the account's own opening by the same amount, so the earlier
 * years are not counted twice the next time the ledger loads.
 */
import { useEffect, useId, useRef } from "react";
import EditCard, { Field, KV, NumberInput } from "../../EditCard";
import DateField from "../DateField";
import { useFin } from "../FinanceContext";
import { useMoney } from "../parts";
import useCardForm from "./useCardForm";
import { saveOpeningBalance } from "../../../lib/financeWrites";
import { enterAdvance, focusFirst } from "../flow";

export default function OpeningCard({ account, data, onClose }) {
  const { canEditTab, reload, fy, fyActive } = useFin();
  const money = useMoney();
  const uid = useId();
  const root = useRef(null);
  const editable = canEditTab("ledger");
  const { form, set, dirty } = useCardForm({ amount: String(data.openingBalanceNPR ?? 0), date: data.openingBalanceDate ? String(data.openingBalanceDate).slice(0, 10) : "" });
  const earlier = (data.openingBalanceNPR || 0) - (data.baseOpeningNPR || 0);

  useEffect(() => { focusFirst(root.current?.closest("form"), `#${CSS.escape(`${uid}-amt`)}`); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (form.amount === "" || !Number.isFinite(Number(form.amount))) return { ok: false, message: "Enter the balance." };
    const res = await saveOpeningBalance({ accountId: data.accountId, amount: form.amount, earlierMovementNPR: earlier, date: form.date });
    if (!res.ok) return res;
    await reload();
    return { ok: true };
  }

  const flow = { onKeyDown: (e) => enterAdvance(e, () => e.target.closest("form")?.requestSubmit()) };
  const main = (
    <div className="fn-flow" ref={root} {...flow}>
      <Field label={fyActive ? "Balance brought forward" : "Opening balance"} htmlFor={`${uid}-amt`}>
        <NumberInput id={`${uid}-amt`} unit="NPR" value={form.amount} disabled={!editable} onChange={(e) => set({ amount: e.target.value })} step="any" min={undefined} />
      </Field>
      <DateField id={`${uid}-date`} label="As of" value={form.date} onChange={(v) => set({ date: v })} disabled={!editable} startBlank="Set the date" />
      {fyActive && (
        <p className="ec-note ec-wide">
          Before fiscal year {fy}, the account stood at {money(earlier + (data.baseOpeningNPR || 0))}: its own opening of {money(data.baseOpeningNPR || 0)} plus {money(earlier)} of earlier movement.
          Changing this changes the account's own opening balance by the same amount.
        </p>
      )}
    </div>
  );
  const side = (
    <div className="fn-flow">
      <div className="ec-block ec-wide"><span className="ec-cap">Now</span><div className="ec-fig">{money(data.openingBalanceNPR || 0)}</div></div>
      <KV rows={[["Account", account], ["Closing balance", money(data.closingBalance || 0)]]} />
    </div>
  );

  return (
    <EditCard
      title={`${account}: opening balance`} subtitle="Where the account's running balance starts"
      main={main} side={side} canEdit={editable} dirty={dirty} onClose={onClose} onSave={save}
    />
  );
}

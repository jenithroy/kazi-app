/**
 * "Convert to NPR": a rate typed in another currency, worked out into rupees. Type the amount in the other currency, check the rate (it
 * starts at the app's own rate for that currency, live when the feed answered), and the rupee figure is what goes into the line's Rate.
 *
 * It is the old Billing page's converter popover as a small card over the document card, with the same ten currencies. The one change: it
 * reads the app's shared rates (utils/currency.js, what the header's currency picker uses) instead of fetching a second feed of its own.
 */
import { useId, useState } from "react";
import EditCard, { Field, KV, NumberInput } from "../EditCard";
import Select from "../Select";
import { getRates, getRatesInfo, hasRate } from "../../utils/currency";
import { fmtNPR } from "../../utils/billing.jsx";

const CURRENCIES = ["USD", "GBP", "EUR", "AUD", "INR", "CNY", "SGD", "AED", "CAD", "JPY"];
const OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));

/** Rupees for one unit of `code`: the rates are units of the currency per rupee, so it is their inverse. */
const perUnit = (code) => {
  const r = Number(getRates()[code]);
  return r > 0 ? +(1 / r).toFixed(4) : 0;
};

export default function FxDialog({ onApply, onClose }) {
  const uid = useId();
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState(() => perUnit("USD"));
  const npr = Number(amount) > 0 && Number(rate) > 0 ? Number(amount) * Number(rate) : null;
  const live = getRatesInfo().live;

  async function save() {
    if (!npr) return { ok: false, message: "Type the amount first." };
    onApply(npr.toFixed(2));
    return { ok: true };
  }

  return (
    <EditCard
      title="Convert to NPR" subtitle="What an amount in another currency comes to in rupees"
      className="bl-fx" creating canEdit
      main={(
        <>
          <Field label="Currency" htmlFor={`${uid}-cur`}>
            <Select id={`${uid}-cur`} label="Currency" value={currency} options={OPTIONS} searchable={false} onChange={(v) => { setCurrency(v); setRate(perUnit(v)); }} />
          </Field>
          <Field label="Amount" htmlFor={`${uid}-amt`}>
            <NumberInput id={`${uid}-amt`} unit={currency} value={amount} placeholder="0" autoFocus onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label={`1 ${currency} is`} htmlFor={`${uid}-rate`} wide hint={hasRate(currency) ? (live ? "Today's rate. You can change it." : "An approximate rate: the live feed did not answer. You can change it.") : "No rate is held for this currency: type one."}>
            <NumberInput id={`${uid}-rate`} unit="NPR" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        </>
      )}
      side={(
        <>
          <div className="ec-block ec-wide">
            <span className="ec-cap">In rupees</span>
            <div className="ec-fig">{npr != null ? fmtNPR(npr) : "—"}</div>
          </div>
          <KV rows={[["Goes into", "the line's Rate"]]} />
        </>
      )}
      onClose={onClose} onSave={save} submitLabel="Apply to rate" closeLabel="Cancel"
    />
  );
}

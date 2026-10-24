/**
 * The row at the top of Bank: the date, what it was, whether money went out or came in, and the amount. It writes through
 * `addBankTxn`, the function the Log a transaction card uses. (The bank's own statement lines arrive on their own, with the bank's
 * running balance; this is for the ones typed by hand, so the balance column is where the button sits.)
 */
import EntryRow from "./EntryRow";
import CellDate from "./CellDate";
import { AmountBox, TextBox, Toggle } from "./cells";
import useEntry, { useOutsideNote } from "./useEntry";
import { useFin } from "../FinanceContext";
import { useMoney } from "../parts";
import { addBankTxn } from "../../../lib/financeWrites";
import { amountOf, bankForm, bankProblem, blankBank, notAnAmount } from "../../../lib/financeEntry";

export const BANK_NEEDS = ["when", "what", "type", "amt"];
const TYPES = [["Debit", "Out"], ["Credit", "In"]];

export default function BankEntry({ ctx, onSaved }) {
  const { region, loading, reload } = useFin();
  const money = useMoney();
  const outside = useOutsideNote();
  const e = useEntry({
    kind: "bank", first: "description", blank: blankBank, check: bankProblem,
    write: (f) => addBankTxn({ form: bankForm(f), region }),
    after: ({ res, form }) => {
      outside(form.date);
      reload().catch(console.error);
      onSaved?.(res.row?.id);
      return `${form.type === "Credit" ? "In" : "Out"} ${money(amountOf(form.amount) || 0)}`;
    },
  });
  const { form, set, problem, idOf } = e;
  const bad = (field) => problem?.field === field;

  const cells = {
    when: <CellDate id={idOf("date")} label="Date of the transaction" value={form.date} onChange={(v) => set({ date: v })} disabled={loading} invalid={bad("date")} />,
    what: <TextBox id={idOf("description")} label="What the transaction was" placeholder="What was it? e.g. Supplier payment" value={form.description} onChange={(v) => set({ description: v })} disabled={loading} invalid={bad("description")} />,
    type: <Toggle label="Money out or money in" value={form.type} options={TYPES} onChange={(v) => set({ type: v })} disabled={loading} />,
    amt: <AmountBox id={idOf("amount")} label="Amount in rupees" value={form.amount} onChange={(v) => set({ amount: v })} onRefuse={(t) => e.say(notAnAmount(t))} disabled={loading} invalid={bad("amount")} />,
  };

  return (
    <EntryRow
      ctx={ctx} label="Log a bank transaction" saveLabel="Add transaction" saveAt="bal" cells={cells}
      busy={e.busy} waiting={e.waiting} saved={e.saved} problem={e.problem} rowRef={e.rowRef} idOf={e.idOf} onSubmit={e.submit} onKeyDown={e.onKeyDown}
    />
  );
}

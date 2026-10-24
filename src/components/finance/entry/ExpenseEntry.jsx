/**
 * The row at the top of Expenses: the date, the category and a note, who paid, whether there is a VAT bill (with a paperclip to
 * attach it), the amount, and whether it is already paid. Enter goes from box to box and saves at the end; Ctrl + Enter saves from
 * anywhere. It writes through `addExpense`, the function the New expense card uses, with the form that card would have built.
 */
import EntryRow from "./EntryRow";
import CellDate from "./CellDate";
import { AmountBox, Clip, Pair, Pick, TextBox, Tick } from "./cells";
import useEntry, { useOutsideNote } from "./useEntry";
import { useFin } from "../FinanceContext";
import { useMoney } from "../parts";
import { addExpense } from "../../../lib/financeWrites";
import { EXPENSE_CATEGORIES } from "../../../lib/finance";
import { PAY_CHOICES, amountOf, blankExpense, expenseForm, expenseProblem, notAnAmount } from "../../../lib/financeEntry";

export const EXPENSE_NEEDS = ["date", "what", "pay", "amt"];
const CATEGORIES = EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }));

export default function ExpenseEntry({ ctx, onSaved }) {
  const { profile, region, loading, reload, notify } = useFin();
  const money = useMoney();
  const outside = useOutsideNote();
  const e = useEntry({
    kind: "expense", first: "category", blank: blankExpense, check: expenseProblem,
    write: (f) => addExpense({ form: expenseForm(f, region), file: f.file, profile, region }),
    after: ({ res, form }) => {
      if (res.warning) notify(res.warning, "warn");
      else outside(form.date);
      reload().catch(console.error);
      onSaved?.(res.row?.id);
      return `${form.category}, ${money(amountOf(form.amount) || 0)}`;
    },
  });
  const { form, set, problem, idOf } = e;
  const bad = (field) => problem?.field === field;

  const cells = {
    date: <CellDate id={idOf("date")} label="Date of the expense" value={form.date} onChange={(v) => set({ date: v })} disabled={loading} invalid={bad("date")} />,
    what: (
      <Pair>
        <Pick id={idOf("category")} label="Category" value={form.category} options={CATEGORIES} onChange={(v) => set({ category: v })} disabled={loading} />
        <TextBox id={idOf("note")} label="Note" placeholder="Note (optional)" value={form.note} onChange={(v) => set({ note: v })} disabled={loading} />
      </Pair>
    ),
    pay: <Pick id={idOf("pay")} label="Paid by" value={form.pay} options={PAY_CHOICES} onChange={(v) => set({ pay: v })} searchable={false} minWidth={180} disabled={loading} />,
    vat: (
      <>
        <Tick id={idOf("vat")} text="VAT" label="This expense has a VAT bill" checked={form.vat} onChange={(v) => set({ vat: v, ...(v ? {} : { file: null }) })} disabled={loading} />
        {form.vat ? <Clip id={idOf("file")} file={form.file} onFile={(file) => set({ file })} disabled={loading} /> : null}
      </>
    ),
    amt: <AmountBox id={idOf("amount")} label="Amount in rupees" value={form.amount} onChange={(v) => set({ amount: v })} onRefuse={(t) => e.say(notAnAmount(t))} disabled={loading} invalid={bad("amount")} />,
    paid: <Tick id={idOf("paid")} text="Paid" label="Already paid" checked={form.paid} onChange={(v) => set({ paid: v })} disabled={loading} />,
  };

  return (
    <EntryRow
      ctx={ctx} label="New expense" saveLabel="Add expense" saveAt="paid" cells={cells}
      busy={e.busy} waiting={e.waiting} saved={e.saved} problem={e.problem} rowRef={e.rowRef} idOf={e.idOf} onSubmit={e.submit} onKeyDown={e.onKeyDown}
    />
  );
}

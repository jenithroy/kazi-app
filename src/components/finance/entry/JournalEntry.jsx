/**
 * The row at the top of the Journal: the date, what the entry is for, the account debited and the account credited, and the amount.
 * It writes through `addJournalEntry`, the function the New journal entry card uses, and keeps the card's rules: the two accounts
 * must differ, and an entry against Advance Received or Advance Payable says whose advance it is (a second box appears for that).
 */
import { useMemo } from "react";
import EntryRow from "./EntryRow";
import CellDate from "./CellDate";
import { AmountBox, Pair, Pick, TextBox } from "./cells";
import useEntry, { useOutsideNote } from "./useEntry";
import { advance } from "../flow";
import { useFin } from "../FinanceContext";
import { useMoney } from "../parts";
import { addJournalEntry } from "../../../lib/financeWrites";
import { isAdvanceEntry } from "../../../lib/finance";
import { amountOf, blankJournal, journalForm, journalProblem, notAnAmount } from "../../../lib/financeEntry";

export const JOURNAL_NEEDS = ["date", "desc", "dr", "cr", "amt"];

export default function JournalEntry({ ctx, onSaved }) {
  const { profile, region, loading, reload, accounts } = useFin();
  const money = useMoney();
  const outside = useOutsideNote();
  const options = useMemo(() => accounts.map((a) => ({ value: a.name, label: a.name, hint: a.type })), [accounts]);
  const e = useEntry({
    kind: "journal", first: "description", blank: blankJournal, check: journalProblem,
    write: (f) => {
      const form = journalForm(f, region);
      return addJournalEntry({ form, profile, region, advance: isAdvanceEntry(form) });
    },
    after: ({ res, form }) => {
      outside(form.date);
      reload().catch(console.error);
      onSaved?.(res.row?.id);
      return `${form.debit} / ${form.credit}, ${money(amountOf(form.amount) || 0)}`;
    },
  });
  const { form, set, problem, idOf } = e;
  const bad = (field) => problem?.field === field;
  const advanceNow = isAdvanceEntry(journalForm(form, region));
  const none = loading || options.length === 0;

  // The box for whose advance it is comes into the Description column, which is before the two accounts. A choice that makes the entry an
  // advance (and nobody is named yet) sends the cursor there; otherwise the cursor goes on to the next field, as after any choice.
  const goAfter = (account) => (v) => {
    const becomes = isAdvanceEntry(journalForm({ ...form, [account]: v }, region));
    if (becomes && !form.party.trim()) e.focusField("party");
    else advance();
  };

  // Enter in that box goes on to what is still to be decided: the credit account, unless the credit account is what made it an advance
  const afterParty = (ev) => {
    if (ev.key !== "Enter" || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey || ev.target.id !== idOf("party")) return false;
    ev.preventDefault();
    e.focusField(isAdvanceEntry({ debitAccount: "", creditAccount: form.credit }) ? "amount" : "credit");
    return true;
  };

  const cells = {
    date: <CellDate id={idOf("date")} label="Date of the entry" value={form.date} onChange={(v) => set({ date: v })} disabled={loading} invalid={bad("date")} />,
    desc: (
      <Pair>
        <TextBox id={idOf("description")} label="What the entry is for" placeholder="What is it for?" value={form.description} onChange={(v) => set({ description: v })} disabled={loading} invalid={bad("description")} />
        {advanceNow ? <TextBox id={idOf("party")} label="Customer or supplier" placeholder="Customer or supplier" value={form.party} onChange={(v) => set({ party: v })} disabled={loading} invalid={bad("party")} /> : null}
      </Pair>
    ),
    dr: <Pick id={idOf("debit")} label="Debit account" value={form.debit} options={options} onChange={(v) => set({ debit: v })} then={goAfter("debit")} disabled={none} minWidth={240} />,
    cr: <Pick id={idOf("credit")} label="Credit account" value={form.credit} options={options} onChange={(v) => set({ credit: v })} then={goAfter("credit")} disabled={none} invalid={bad("credit")} minWidth={240} />,
    amt: <AmountBox id={idOf("amount")} label="Amount in rupees" value={form.amount} onChange={(v) => set({ amount: v })} onRefuse={(t) => e.say(notAnAmount(t))} disabled={loading} invalid={bad("amount")} />,
  };

  return (
    <EntryRow
      ctx={ctx} label="New journal entry" saveLabel="Post entry" saveAt="amt" cells={cells}
      busy={e.busy} waiting={e.waiting} saved={e.saved} problem={e.problem} rowRef={e.rowRef} idOf={e.idOf} onSubmit={e.submit}
      onKeyDown={(ev) => { if (!afterParty(ev)) e.onKeyDown(ev); }}
    />
  );
}

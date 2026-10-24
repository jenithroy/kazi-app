/**
 * The row at the top of Purchases: a bill with one line on it. The date, who it was bought from, what was bought, its category,
 * who paid, whether it carries VAT, and the amount. It writes through `addPurchase`, the function the New purchase card uses, so
 * the bill gets the next number of its fiscal year and VAT works out as it does there (13% of the amount, added on top).
 *
 * A bill with several items, a discount, a quantity or a stock item is the card's: "Full form" (in the Number column, where the
 * number will appear once it is saved) opens the card with whatever has been typed so far, and the row keeps it until the card has
 * saved it (closing the card without saving leaves the row as it was). A line that names a stock item is sent there by the row
 * itself, because stock only goes up when the line has a quantity; so "What was bought" suggests nothing from the stock list.
 */
import { useMemo } from "react";
import EntryRow from "./EntryRow";
import CellDate from "./CellDate";
import { AmountBox, Pair, Pick, TextBox } from "./cells";
import useEntry, { useOutsideNote } from "./useEntry";
import Suggest from "../../Suggest";
import { Icons } from "../../ui";
import { useFin } from "../FinanceContext";
import { useMoney } from "../parts";
import { PURCHASE_CATEGORIES } from "../../PurchaseRowGroup";
import { addPurchase, purchaseTotals } from "../../../lib/financeWrites";
import { PAY_CHOICES, VAT_CHOICES, amountOf, blankPurchase, notAnAmount, purchaseForm, purchaseProblem } from "../../../lib/financeEntry";

export const PURCHASE_NEEDS = ["date", "party", "cat", "pay", "vat", "amt"];
const CATEGORIES = PURCHASE_CATEGORIES.map((c) => ({ value: c, label: c }));

export default function PurchaseEntry({ ctx, parties = [], onSaved, onFull }) {
  const { profile, region, loading, reload, inventoryItems = [] } = useFin();
  const money = useMoney();
  const outside = useOutsideNote();
  const stockNames = useMemo(() => new Set(inventoryItems.map((i) => String(i.item || "").trim().toLowerCase()).filter(Boolean)), [inventoryItems]);
  const partyOptions = useMemo(() => parties.map((p) => ({ label: p.name, hint: `${p.count} ${p.count === 1 ? "bill" : "bills"}` })), [parties]);

  const e = useEntry({
    kind: "purchase", first: "party", blank: blankPurchase, check: (f) => purchaseProblem(f, stockNames),
    write: (f) => addPurchase({ form: purchaseForm(f, region), region, inventoryItems, profile }),
    after: ({ res, form }) => {
      outside(form.date);
      reload().catch(console.error);
      onSaved?.(res.row?.id);
      return `${res.expenseId} · ${money(purchaseTotals(purchaseForm(form, region)).total)}`;
    },
  });
  const { form, set, problem, idOf } = e;
  const bad = (field) => problem?.field === field;
  const vatNote = form.vat === "yes" ? "Before VAT" : "0";

  // what is typed goes to the card; the row is emptied when (and if) the card has saved it
  function full() {
    onFull?.(purchaseForm(form, region), e.clear);
  }

  const cells = {
    id: (
      <button type="button" className="fe-full" onClick={full} disabled={loading} title="Open the full form with what you have typed: several items, a quantity, a discount or a VAT bill file">
        <Icons.Edit size={13} sw={1.9} aria-hidden="true" /> Full form
      </button>
    ),
    date: <CellDate id={idOf("date")} label="Date of the bill" value={form.date} onChange={(v) => set({ date: v })} disabled={loading} invalid={bad("date")} />,
    party: (
      <Pair>
        <Suggest
          id={idOf("party")} label="Bought from" value={form.party} options={partyOptions} placeholder="Bought from" disabled={loading} passEnter
          onChange={(v) => set({ party: v })} inputProps={{ className: `fe-in${bad("party") ? " is-bad" : ""}`, "aria-invalid": bad("party") || undefined }}
        />
        <TextBox id={idOf("item")} label="What was bought" value={form.item} placeholder="What was bought" onChange={(v) => set({ item: v })} disabled={loading} invalid={bad("item")} />
      </Pair>
    ),
    cat: <Pick id={idOf("category")} label="Category" value={form.category} options={CATEGORIES} onChange={(v) => set({ category: v })} disabled={loading} />,
    pay: <Pick id={idOf("pay")} label="Paid by" value={form.pay} options={PAY_CHOICES} onChange={(v) => set({ pay: v })} searchable={false} minWidth={180} disabled={loading} />,
    vat: <Pick id={idOf("vat")} label="VAT bill" value={form.vat} options={VAT_CHOICES} onChange={(v) => set({ vat: v })} searchable={false} minWidth={160} disabled={loading} />,
    amt: (
      <AmountBox
        id={idOf("amount")} label={form.vat === "yes" ? "Amount before VAT, in rupees" : "Amount in rupees"} value={form.amount} onChange={(v) => set({ amount: v })}
        onRefuse={(t) => e.say(notAnAmount(t))} placeholder={vatNote} disabled={loading} invalid={bad("amount")}
        title={form.vat === "yes" && amountOf(form.amount) ? `With 13% VAT: ${money(purchaseTotals(purchaseForm(form, region)).total)}` : undefined}
      />
    ),
  };

  return (
    <EntryRow
      ctx={ctx} label="New purchase" saveLabel="Add purchase" saveAt="amt" cells={cells}
      busy={e.busy} waiting={e.waiting} saved={e.saved} problem={e.problem} rowRef={e.rowRef} idOf={e.idOf} onSubmit={e.submit} onKeyDown={e.onKeyDown} onFull={full}
    />
  );
}

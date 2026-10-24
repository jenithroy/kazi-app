/**
 * Expenses: money spent that is not a supplier's bill. One line each, newest first; "Mark paid" is on the row because it is what
 * gets pressed most; the rest of an expense (the amount, the date, who it was paid with) is the card the row opens.
 */
import { useEffect, useMemo, useState } from "react";
import DataTable from "../../table/DataTable";
import { FindBar } from "../FilterMenu";
import useTabFilters from "../useTabFilters";
import { EmptyNote } from "../../bento/Bento";
import { Icons } from "../../ui";
import PersonLink from "../../profile/PersonLink";
import FinPane from "../FinPane";
import ExpenseCard from "../cards/ExpenseCard";
import ExpenseEntry, { EXPENSE_NEEDS } from "../entry/ExpenseEntry";
import { fits } from "../entry/EntryRow";
import useFlash, { useHiddenNote } from "../entry/useFlash";
import { useFin, emptyWords } from "../FinanceContext";
import { Amt, Chip, ExportButton, Foot, FootSum, NameCell, UndoStrip, plural, useMoney, usePhoneRows, useUndo } from "../parts";
import { setExpensePaid } from "../../../lib/financeWrites";

const payLabel = (x) => (x.paymentType === "Bank" ? (x.bankName || "Bank") : x.paymentType === "Credit" ? "Credit" : "Cash");
const has = (hay, q) => String(hay || "").toLowerCase().includes(q);

export default function ExpensesTab() {
  const f = useFin();
  const { expenses, regionExpenses, regionVatBills, canEditTab, show, loading, reload, notify, fyActive, fy, newRef } = f;
  const money = useMoney();
  const canEdit = canEditTab("expenses");
  const [query, setQuery] = useState("");
  const [card, setCard] = useState(null);                 // null, or { id } (null id = a new expense)
  const [undo, offerUndo, clearUndo] = useUndo();
  const [fresh, flash] = useFlash();                        // the expense just typed into the row at the top

  useEffect(() => {
    newRef.current = canEdit ? () => setCard({ id: null }) : null;
    return () => { newRef.current = null; };
  }, [newRef, canEdit]);

  const billOf = useMemo(() => {
    const m = new Map();
    regionVatBills.forEach((b) => { if (b.expenseId != null) m.set(String(b.expenseId), b); });
    return m;
  }, [regionVatBills]);

  const q = query.trim().toLowerCase();
  const found = useMemo(
    () => expenses.filter((x) => !q || has(x.category, q) || has(x.note, q) || has(x.loggedBy, q) || has(payLabel(x), q) || has(x.amountNPR, q)),
    [expenses, q],
  );
  const unpaid = found.filter((x) => x.status !== "Paid");
  // What the Filters panel offers for this list: paid or not, a category, how it was paid, a VAT bill, who logged it, how much.
  const defs = useMemo(() => [
    {
      id: "pay", label: "Payment", kind: "chips",
      options: [{ value: "all", label: "All" }, { value: "unpaid", label: "Not paid", tone: "warn" }, { value: "paid", label: "Paid" }],
      test: (x, v) => (v === "unpaid" ? x.status !== "Paid" : x.status === "Paid"),
    },
    { id: "category", label: "Category", kind: "select", of: (x) => x.category, any: "Any category", none: "No category" },
    { id: "via", label: "Paid with", kind: "select", of: payLabel, any: "Any way of paying" },
    {
      id: "vat", label: "VAT bill", kind: "chips",
      options: [{ value: "any", label: "Any" }, { value: "yes", label: "Has a VAT bill" }, { value: "no", label: "No VAT bill" }],
      test: (x, v) => (v === "yes" ? Boolean(x.vatBill) : !x.vatBill),
    },
    { id: "by", label: "Logged by", kind: "select", of: (x) => (x.loggedBy || "").trim(), any: "Anyone", none: "Not recorded" },
    { id: "amount", label: "Amount", kind: "range", get: (x) => Number(x.amountNPR), unit: "NPR" },
  ], []);
  const tf = useTabFilters(defs, found);
  const shown = tf.rows;
  useHiddenNote(fresh, expenses, shown);                    // a record just typed in that the search or a filter hides is said so
  const total = shown.reduce((s, x) => s + Number(x.amountNPR || 0), 0);
  const [capped, more] = usePhoneRows(shown);

  const open = card?.id ? regionExpenses.find((x) => x.id === card.id) || null : null;
  useEffect(() => { if (card?.id && !loading && !open) setCard(null); }, [card, loading, open]);

  async function togglePaid(x) {
    const paid = x.status !== "Paid";
    const res = await setExpensePaid(x.id, paid);
    if (!res.ok) { notify(res.message, "bad"); return; }
    await reload();
    offerUndo(
      `${x.category || "Expense"}, ${money(Number(x.amountNPR) || 0)}, marked ${paid ? "paid" : "not paid"}.`,
      async () => {
        const back = await setExpensePaid(x.id, !paid);
        if (!back.ok) notify(back.message, "bad");
        await reload();
      },
    );
  }

  const columns = useMemo(() => [
    {
      id: "date", label: "Date", width: 116, drop: 3, first: "desc", sort: (x) => x.date || "",
      render: (x) => <span className="dt-num">{show(x.date)}</span>,
    },
    {
      // a narrow table has no room for the date or the status: they go under the name
      id: "what", label: "Category", grow: true, min: 160, max: 560, sort: (x) => (x.category || "").toLowerCase(),
      render: (x, { dropped }) => (
        <NameCell main={x.category || "—"} rest={x.note} extra={[dropped.has("date") && show(x.date), dropped.has("paid") && (x.status === "Paid" ? "Paid" : "Not paid")]} />
      ),
    },
    {
      id: "pay", label: "Paid by", width: 108, drop: 4, sort: (x) => payLabel(x).toLowerCase(),
      render: (x) => <span className="dt-clip dt-dim">{payLabel(x)}</span>,
    },
    {
      id: "vat", label: "VAT bill", width: 92, drop: 5,
      render: (x) => {
        if (!x.vatBill) return <span className="dt-dim">No</span>;
        const bill = billOf.get(String(x.id));
        return bill
          ? <a className="dt-act fn-link" href={bill.fileUrl} target="_blank" rel="noopener noreferrer">View ↗</a>
          : <Chip tone="good">Yes</Chip>;
      },
    },
    {
      id: "by", label: "Logged by", width: 132, drop: 6, sort: (x) => (x.loggedBy || "").trim().toLowerCase(),
      render: (x) => <span className="dt-clip dt-dim">{(x.loggedBy || "").trim() ? <PersonLink className="kpl--clip" name={(x.loggedBy || "").trim()} /> : "—"}</span>,
    },
    {
      id: "amt", label: "Amount", width: 124, align: "end", first: "desc", sort: (x) => Number(x.amountNPR) || 0,
      render: (x) => <Amt n={x.amountNPR} strong />,
    },
    {
      id: "paid", label: "Status", width: 118, drop: 2, align: "end",
      render: (x) => {
        const paid = x.status === "Paid";
        return canEdit ? (
          <button
            type="button" className={`dt-act fn-paid${paid ? " is-paid" : ""}`} aria-pressed={paid}
            title={paid ? "Paid. Press to mark as not paid" : "Not paid. Press to mark as paid"}
            onClick={() => togglePaid(x)}
          >
            {paid ? <><Icons.Check size={13} sw={2.4} aria-hidden="true" /> Paid</> : "Mark paid"}
          </button>
        ) : (paid ? <Chip tone="good">Paid</Chip> : <span className="dt-dim">Not paid</span>);
      },
    },
  // togglePaid reads the latest lists through reload(); the columns only need to change with what they show
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [show, billOf, canEdit, money]);

  const csv = useMemo(() => [
    { label: "Date", value: (x) => x.date }, { label: "Category", value: (x) => x.category }, { label: "Note", value: (x) => x.note },
    { label: "Paid by", value: payLabel }, { label: "VAT bill", value: (x) => (x.vatBill ? "Yes" : "No") },
    { label: "Logged by", value: (x) => (x.loggedBy || "").trim() }, { label: "Status", value: (x) => (x.status === "Paid" ? "Paid" : "Not paid") },
    { label: "Amount NPR", value: (x) => x.amountNPR },
  ], []);

  const empty = emptyWords({ fyActive, fy, noun: "expenses", regionCount: regionExpenses.length, fallback: "No expenses yet." });

  return (
    <>
      <FinPane
        title="Expenses"
        note={q || tf.count > 0 ? `${shown.length} of ${expenses.length}` : `${expenses.length} ${plural(expenses.length, "entry", "entries")}`}
        id="fin-pane" labelledBy="fin-tab-expenses"
        tools={<FindBar value={query} onChange={setQuery} placeholder="Search expenses" label="Search expenses by category, note, payment or who logged them" filters={tf} />}
        actions={(
          <>
            <ExportButton name="expenses" columns={csv} rows={shown} />
            {canEdit && (
              <button type="button" className="kb-btn kb-btn--primary" data-tour="add-expense" onClick={() => setCard({ id: null })} title="Shift + N">
                <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> New expense
              </button>
            )}
          </>
        )}
        foot={(
          <>
            <UndoStrip undo={undo} onClose={clearUndo} />
            <Foot>
              <FootSum count label={plural(shown.length, "entry", "entries")} value={shown.length} />
              <FootSum label="Total" value={money(total)} />
              {tf.values.pay === "all" && unpaid.length > 0 && <FootSum label="Not paid" value={money(unpaid.reduce((s, x) => s + Number(x.amountNPR || 0), 0))} tone="warn" />}
            </Foot>
          </>
        )}
      >
        {!canEdit && <p className="fn-viewonly">View only. Only Nepal staff with edit rights can add or change expenses.</p>}
        <DataTable
          className="fn-dense"
          label="Expenses"
          rows={capped}
          rowKey={(x) => x.id}
          columns={columns}
          defaultSort={{ id: "date", dir: "desc" }}
          onOpen={(x) => setCard({ id: x.id })}
          rowLabel={(x) => `Open ${x.category || "expense"} of ${money(Number(x.amountNPR) || 0)}`}
          activeKey={card?.id || undefined}
          flashKey={fresh}
          entry={canEdit ? (c) => (fits(c, EXPENSE_NEEDS) ? <ExpenseEntry ctx={c} onSaved={flash} /> : null) : undefined}
          loading={loading}
          empty={<EmptyNote icon={<Icons.File size={22} sw={1.5} />}>{expenses.length === 0 ? empty : "Nothing matches that."}</EmptyNote>}
        />
        {more}
      </FinPane>

      {card && (!card.id || open) && (
        <ExpenseCard key={card.id || "new"} expense={open} bill={open ? billOf.get(String(open.id)) : null} onClose={() => setCard(null)} />
      )}
    </>
  );
}

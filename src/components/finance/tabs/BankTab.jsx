/**
 * Bank: the bank's own record of what went in and out (most lines arrive from its statement), newest first. A row opens the
 * transaction; "Log transaction" adds one by hand. The strip under the table is the old page's In / Out / Net.
 */
import { useEffect, useMemo, useState } from "react";
import DataTable from "../../table/DataTable";
import { FindBar } from "../FilterMenu";
import useTabFilters from "../useTabFilters";
import { EmptyNote } from "../../bento/Bento";
import { Icons } from "../../ui";
import FinPane from "../FinPane";
import BankCard from "../cards/BankCard";
import BankEntry, { BANK_NEEDS } from "../entry/BankEntry";
import { fits } from "../entry/EntryRow";
import useFlash, { useHiddenNote } from "../entry/useFlash";
import { useFin, emptyWords } from "../FinanceContext";
import { Chip, ExportButton, Foot, FootSum, NameCell, plural, useMoney, usePhoneRows } from "../parts";
import { bankText, isBankCredit } from "../../../lib/finance";

const has = (hay, q) => String(hay || "").toLowerCase().includes(q);

export default function BankTab() {
  const f = useFin();
  const { bankTxns, regionBankTxns, canEditTab, show, loading, newRef, fyActive, fy } = f;
  const money = useMoney();
  const canEdit = canEditTab("bank");
  const [query, setQuery] = useState("");
  const [card, setCard] = useState(null);
  const [fresh, flash] = useFlash();                        // the transaction just typed into the row at the top

  useEffect(() => {
    newRef.current = canEdit ? () => setCard({ id: null }) : null;
    return () => { newRef.current = null; };
  }, [newRef, canEdit]);

  const q = query.trim().toLowerCase();
  const found = useMemo(() => bankTxns.filter((t) => !q || has(bankText(t), q) || has(t.remarks, q) || has(t.amount, q)), [bankTxns, q]);
  // What the Filters panel offers for this list: money in or out, and how much.
  const defs = useMemo(() => [
    {
      id: "dir", label: "Money", kind: "chips",
      options: [{ value: "all", label: "All" }, { value: "in", label: "Money in" }, { value: "out", label: "Money out" }],
      test: (t, v) => (v === "in" ? isBankCredit(t) : !isBankCredit(t)),
    },
    { id: "amount", label: "Amount", kind: "range", get: (t) => Number(t.amount), unit: "NPR" },
  ], []);
  const tf = useTabFilters(defs, found);
  const shown = tf.rows;
  useHiddenNote(fresh, bankTxns, shown);                    // a record just typed in that the search or a filter hides is said so
  const sum = (list) => list.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const totalIn = sum(shown.filter(isBankCredit));
  const totalOut = sum(shown.filter((t) => !isBankCredit(t)));
  const [capped, more] = usePhoneRows(shown);

  const open = card?.id ? regionBankTxns.find((t) => t.id === card.id) || null : null;
  useEffect(() => { if (card?.id && !loading && !open) setCard(null); }, [card, loading, open]);

  const columns = useMemo(() => [
    {
      id: "when", label: "Date", width: 150, drop: 1, first: "desc", sort: (t) => t.date || "",
      render: (t) => <span className="fn-when"><span className="dt-num">{show(t.date)}</span><i>{String(t.date || "").slice(11)}</i></span>,
    },
    {
      // a narrow table has no room for the date: it goes under the description
      id: "what", label: "Description", grow: true, min: 160, max: 560, sort: (t) => bankText(t).toLowerCase(),
      render: (t, { dropped }) => (
        <NameCell
          main={bankText(t) || "Bank transaction"} rest={t.description && t.remarks ? String(t.remarks).replace(/\s+/g, " ").trim() : ""}
          extra={[dropped.has("when") && show(t.date)]}
        />
      ),
    },
    {
      id: "type", label: "Type", width: 104, drop: 3, sort: (t) => (isBankCredit(t) ? 1 : 0),
      render: (t) => <Chip tone={isBankCredit(t) ? "good" : undefined}>{isBankCredit(t) ? "Money in" : "Money out"}</Chip>,
    },
    {
      id: "amt", label: "Amount", width: 132, align: "end", first: "desc", sort: (t) => Number(t.amount) || 0,
      render: (t) => <span className={`dt-num dt-strong ${isBankCredit(t) ? "dt-good" : "dt-bad"}`}>{isBankCredit(t) ? "+" : "−"} {money(Number(t.amount) || 0)}</span>,
    },
    {
      id: "bal", label: "Balance", width: 132, align: "end", drop: 4,
      render: (t) => (t.balance != null ? <span className="dt-num dt-dim">{money(Number(t.balance) || 0)}</span> : <span className="dt-dim">—</span>),
    },
  ], [show, money]);

  const csv = useMemo(() => [
    { label: "Date", value: (t) => t.date }, { label: "Description", value: bankText }, { label: "Type", value: (t) => (isBankCredit(t) ? "Credit" : "Debit") },
    { label: "Amount NPR", value: (t) => t.amount }, { label: "Balance NPR", value: (t) => t.balance },
  ], []);

  const empty = emptyWords({ fyActive, fy, noun: "transactions", regionCount: regionBankTxns.length, fallback: "No bank transactions yet." });

  return (
    <>
      <FinPane
        title="Bank" note={q || tf.count > 0 ? `${shown.length} of ${bankTxns.length}` : `${bankTxns.length} ${plural(bankTxns.length, "transaction")}`}
        id="fin-pane" labelledBy="fin-tab-bank"
        tools={<FindBar value={query} onChange={setQuery} placeholder="Search the bank" label="Search bank transactions by description, note or amount" filters={tf} />}
        actions={(
          <>
            <ExportButton name="bank" columns={csv} rows={shown} />
            {canEdit && (
              <button type="button" className="kb-btn kb-btn--primary" onClick={() => setCard({ id: null })} title="Shift + N">
                <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> Log transaction
              </button>
            )}
          </>
        )}
        foot={(
          <Foot>
            <FootSum count label={plural(shown.length, "transaction")} value={shown.length} />
            <FootSum label="In" value={money(totalIn)} tone="good" />
            <FootSum label="Out" value={money(totalOut)} tone="bad" />
            <FootSum label="Net" value={money(totalIn - totalOut)} tone={totalIn - totalOut >= 0 ? "good" : "bad"} />
          </Foot>
        )}
      >
        {!canEdit && <p className="fn-viewonly">View only. You do not have permission to log or change bank transactions.</p>}
        <DataTable
          className="fn-dense" label="Bank transactions" rows={capped} rowKey={(t) => t.id} columns={columns}
          defaultSort={{ id: "when", dir: "desc" }} onOpen={(t) => setCard({ id: t.id })}
          rowLabel={(t) => `Open the ${isBankCredit(t) ? "money in" : "money out"} of ${money(Number(t.amount) || 0)} on ${show(t.date)}`}
          activeKey={card?.id || undefined} loading={loading} flashKey={fresh}
          entry={canEdit ? (c) => (fits(c, BANK_NEEDS) ? <BankEntry ctx={c} onSaved={flash} /> : null) : undefined}
          empty={<EmptyNote icon={<Icons.Wallet size={22} sw={1.5} />}>{bankTxns.length === 0 ? empty : "Nothing matches that."}</EmptyNote>}
        />
        {more}
      </FinPane>

      {card && (!card.id || open) && <BankCard key={card.id || "new"} txn={open} onClose={() => setCard(null)} />}
    </>
  );
}

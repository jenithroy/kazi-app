/**
 * Ledger: Cash and each bank as a running Dr / Cr / Balance table, in the format of the accountant's notebook (what is "brought
 * forward", every line, the closing balance), and, as a last choice, the other accounts the journal has touched.
 *
 * Every line is worked out from the purchases, paid sales, paid expenses, bank transactions and journal entries: nothing is written
 * to a ledger of its own. A line goes to the record it came from; a bank or journal line opens its card here; the opening balance
 * is a card of its own.
 */
import { useEffect, useMemo, useState } from "react";
import DataTable from "../../table/DataTable";
import { FilterChips } from "../../table/Bar";
import { EmptyNote } from "../../bento/Bento";
import { Icons } from "../../ui";
import FinPane from "../FinPane";
import OpeningCard from "../cards/OpeningCard";
import BankCard from "../cards/BankCard";
import JournalCard from "../cards/JournalCard";
import { useFin } from "../FinanceContext";
import { Chip, ExportButton, Foot, FootSum, NameCell, Npr, npr, plural, useMoney } from "../parts";
import useMedia from "../../../hooks/useMedia";

const SOURCE = { purchase: "Purchase", invoice: "Sale", expense: "Expense", bank: "Bank", journal: "Journal" };
const OTHERS = "__others__";

export default function LedgerTab() {
  const f = useFin();
  const phone = useMedia("(max-width: 768px)");
  const { cashBank, bankNames, ledger, accounts, fyActive, fy, show, goToSource, openTab, canEditTab, loading, regionBankTxns, regionEntries } = f;
  const money = useMoney();
  const canEdit = canEditTab("ledger");
  const [which, setWhich] = useState("Cash");
  const [card, setCard] = useState(null);                       // { kind: "opening" } | { kind: "bank" | "journal", id }
  const [all, setAll] = useState(false);

  const names = useMemo(() => ["Cash", ...bankNames], [bankNames]);
  const account = names.includes(which) ? which : which === OTHERS ? OTHERS : "Cash";
  const data = account === OTHERS ? null : cashBank[account];

  const options = [
    ...names.map((n) => ({ value: n, label: n, count: money(cashBank[n]?.closingBalance || 0), tone: (cashBank[n]?.closingBalance || 0) < 0 ? "bad" : undefined })),
    { value: OTHERS, label: "Other accounts" },
  ];

  // the account's lines, behind the opening balance
  const lines = useMemo(() => {
    if (!data) return [];
    const opening = {
      key: "opening", opening: true, date: data.openingBalanceDate,
      particulars: fyActive ? `Balance brought forward (before FY ${fy})` : "Opening balance", dr: 0, cr: 0, balance: data.openingBalanceNPR,
    };
    return [opening, ...data.rows.map((r, i) => ({ ...r, key: `r-${i}` }))];
  }, [data, fyActive, fy]);
  const shown = phone && !all && lines.length > 61 ? [lines[0], ...lines.slice(-60)] : lines;

  const totalDr = data ? data.rows.reduce((s, r) => s + Number(r.dr || 0), 0) : 0;
  const totalCr = data ? data.rows.reduce((s, r) => s + Number(r.cr || 0), 0) : 0;

  const bankOpen = card?.kind === "bank" ? regionBankTxns.find((t) => t.id === card.id) || null : null;
  const entryOpen = card?.kind === "journal" ? regionEntries.find((e) => e.id === card.id) || null : null;
  useEffect(() => {
    if (!loading && ((card?.kind === "bank" && !bankOpen) || (card?.kind === "journal" && !entryOpen))) setCard(null);
  }, [card, loading, bankOpen, entryOpen]);

  function openLine(r) {
    if (r.opening) { if (data?.accountId) setCard({ kind: "opening" }); return; }
    if (r.sourceType === "purchase") goToSource("/purchases", { search: r.searchKey });
    else if (r.sourceType === "invoice") goToSource("/billing", { search: r.searchKey, autoEdit: true });
    else if (r.sourceType === "expense") openTab("expenses");
    else if (r.sourceType === "bank") setCard({ kind: "bank", id: r.sourceId });
    else if (r.sourceType === "journal") setCard({ kind: "journal", id: r.sourceId });
  }

  const columns = useMemo(() => [
    { id: "date", label: "Date", width: 116, drop: 2, render: (r) => <span className="dt-num">{r.date ? show(r.date) : "—"}</span> },
    {
      // a narrow table has no room for the date or the Dr and Cr columns: they go under the particulars
      id: "what", label: "Particulars", grow: true, min: 160, max: 600,
      render: (r, { dropped }) => (
        <NameCell
          main={r.particulars}
          rest={r.opening ? (canEdit && data?.accountId ? "press to change" : "") : (r.sourceType === "bank" || r.sourceType === "journal" ? SOURCE[r.sourceType] : "")}
          extra={[dropped.has("date") && r.date && show(r.date), dropped.has("dr") && dropped.has("cr") && (r.dr ? `Dr ${npr(r.dr)}` : r.cr ? `Cr ${npr(r.cr)}` : "")]}
        />
      ),
    },
    { id: "dr", label: "Dr (NPR)", width: 124, drop: 3, align: "end", render: (r) => <Npr n={r.dr} tone="good" /> },
    { id: "cr", label: "Cr (NPR)", width: 124, drop: 4, align: "end", render: (r) => <Npr n={r.cr} tone="bad" /> },
    { id: "bal", label: "Balance (NPR)", width: 140, align: "end", render: (r) => <Npr n={r.balance} strong tone={r.balance < 0 ? "bad" : undefined} /> },
  ], [show, canEdit, data]);

  // the other accounts: only what the journal has posted to them
  const others = useMemo(() => {
    const skip = new Set(names);
    return Object.entries(ledger)
      .filter(([a]) => !skip.has(a))
      .map(([name, d]) => {
        const type = accounts.find((a) => a.name === name)?.type || "Unknown";
        const balance = type === "Asset" ? d.debits - d.credits : d.credits - d.debits;
        return { key: name, name, type, dr: d.debits, cr: d.credits, balance, entries: d.entryCount };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ledger, names, accounts]);
  const otherColumns = useMemo(() => [
    {
      id: "name", label: "Account", grow: true, min: 160, max: 420, sort: (r) => r.name.toLowerCase(),
      render: (r, { dropped }) => (
        <NameCell
          main={r.name} rest={`${r.entries} ${plural(r.entries, "entry", "entries")}`}
          extra={[dropped.has("type") && r.type, dropped.has("dr") && dropped.has("cr") && `Dr ${npr(r.dr)} · Cr ${npr(r.cr)}`]}
        />
      ),
    },
    { id: "type", label: "Type", width: 110, drop: 4, sort: (r) => r.type, render: (r) => <Chip>{r.type}</Chip> },
    { id: "dr", label: "Dr (NPR)", width: 124, drop: 3, align: "end", first: "desc", sort: (r) => r.dr, render: (r) => <Npr n={r.dr} tone="good" /> },
    { id: "cr", label: "Cr (NPR)", width: 124, drop: 2, align: "end", first: "desc", sort: (r) => r.cr, render: (r) => <Npr n={r.cr} tone="bad" /> },
    { id: "bal", label: fyActive ? "Net for the year" : "Balance (NPR)", width: 140, align: "end", first: "desc", sort: (r) => r.balance, render: (r) => <Npr n={r.balance} strong tone={r.balance < 0 ? "bad" : undefined} /> },
  ], [fyActive]);

  const csv = useMemo(() => [
    { label: "Date", value: (r) => r.date }, { label: "Particulars", value: (r) => r.particulars }, { label: "Dr NPR", value: (r) => r.dr || "" },
    { label: "Cr NPR", value: (r) => r.cr || "" }, { label: "Balance NPR", value: (r) => r.balance },
  ], []);

  const onOthers = account === OTHERS;

  return (
    <>
      <FinPane
        title="Ledger" note={onOthers ? `${others.length} ${plural(others.length, "account")}` : `${data?.rows.length || 0} ${plural(data?.rows.length || 0, "line")}`}
        id="fin-pane" labelledBy="fin-tab-ledger"
        tools={<FilterChips label="Which account" value={account} onChange={(v) => { setWhich(v); setAll(false); }} options={options} />}
        actions={onOthers ? null : <ExportButton name={`ledger-${account.toLowerCase().replace(/\W+/g, "-")}`} columns={csv} rows={lines} />}
        foot={onOthers ? (
          <Foot>
            <FootSum count label={plural(others.length, "account")} value={others.length} />
            {fyActive && <span className="fn-sum"><span>Fiscal year {fy} activity only. The balance sheet has the position at the year's end.</span></span>}
          </Foot>
        ) : (
          <Foot>
            <FootSum label="Dr" value={money(totalDr)} tone="good" />
            <FootSum label="Cr" value={money(totalCr)} tone="bad" />
            <FootSum label="Closing balance" value={money(data?.closingBalance || 0)} tone={(data?.closingBalance || 0) < 0 ? "bad" : undefined} />
          </Foot>
        )}
      >
        {onOthers ? (
          <DataTable
            className="fn-dense" label="Other accounts" rows={others} rowKey={(r) => r.key} columns={otherColumns}
            defaultSort={{ id: "name", dir: "asc" }} loading={loading}
            empty={<EmptyNote icon={<Icons.File size={22} sw={1.5} />}>{fyActive && regionEntries.length > 0 ? `No journal entries in FY ${fy} for other accounts.` : "No journal entries yet for other accounts."}</EmptyNote>}
          />
        ) : (
          <DataTable
            className="fn-dense fn-book" label={`${account} ledger`} rows={shown} rowKey={(r) => r.key} columns={columns}
            onOpen={canEdit ? openLine : undefined}
            rowLabel={(r) => (r.opening ? `Change the ${account} opening balance` : `${SOURCE[r.sourceType]}: ${r.particulars}. Open it`)}
            loading={loading}
            empty={<EmptyNote icon={<Icons.File size={22} sw={1.5} />}>No transactions yet.</EmptyNote>}
          />
        )}
        {!onOthers && shown.length < lines.length && <div className="fn-more"><button type="button" onClick={() => setAll(true)}>Show every line</button></div>}
      </FinPane>

      {card?.kind === "opening" && data && <OpeningCard account={account} data={data} onClose={() => setCard(null)} />}
      {card?.kind === "bank" && bankOpen && <BankCard txn={bankOpen} onClose={() => setCard(null)} />}
      {card?.kind === "journal" && entryOpen && <JournalCard entry={entryOpen} onClose={() => setCard(null)} />}
    </>
  );
}

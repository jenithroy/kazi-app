/**
 * Journal: every entry posted to the books, newest first, each showing what was debited, what was credited and how much. A row
 * opens the entry's card; "New entry" opens it empty. "All accounts" narrows the list to the entries that touch one account.
 */
import { useEffect, useMemo, useState } from "react";
import DataTable from "../../table/DataTable";
import { SearchBox } from "../../table/Bar";
import Select from "../../Select";
import { EmptyNote } from "../../bento/Bento";
import { Icons } from "../../ui";
import FinPane from "../FinPane";
import JournalCard from "../cards/JournalCard";
import { useFin, emptyWords } from "../FinanceContext";
import { Amt, ExportButton, Foot, FootSum, NameCell, plural, useMoney, usePhoneRows } from "../parts";

const has = (hay, q) => String(hay || "").toLowerCase().includes(q);

export default function JournalTab() {
  const f = useFin();
  const { entries, regionEntries, canEditTab, show, loading, newRef, fyActive, fy } = f;
  const money = useMoney();
  const canEdit = canEditTab("journal");
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState("");
  const [card, setCard] = useState(null);

  useEffect(() => {
    newRef.current = canEdit ? () => setCard({ id: null }) : null;
    return () => { newRef.current = null; };
  }, [newRef, canEdit]);

  const used = useMemo(() => {
    const names = new Set();
    entries.forEach((e) => { names.add(e.debitAccount); names.add(e.creditAccount); });
    return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [entries]);
  const accountOptions = useMemo(() => [{ value: "", label: "All accounts" }, ...used.map((n) => ({ value: n, label: n }))], [used]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => entries.filter((e) => (!account || e.debitAccount === account || e.creditAccount === account)
      && (!q || has(e.description, q) || has(e.debitAccount, q) || has(e.creditAccount, q) || has(e.reference, q) || has(e.partyName, q) || has(e.amountNPR, q))),
    [entries, account, q],
  );
  const total = shown.reduce((s, e) => s + Number(e.amountNPR || 0), 0);
  const [capped, more] = usePhoneRows(shown);

  const open = card?.id ? regionEntries.find((e) => e.id === card.id) || null : null;
  useEffect(() => { if (card?.id && !loading && !open) setCard(null); }, [card, loading, open]);

  const columns = useMemo(() => [
    { id: "date", label: "Date", width: 116, drop: 1, first: "desc", sort: (e) => e.date || "", render: (e) => <span className="dt-num">{show(e.date)}</span> },
    {
      // a narrow table has no room for the date or the two accounts: they go under the name
      id: "desc", label: "Description", grow: true, min: 160, max: 520, sort: (e) => (e.description || "").toLowerCase(),
      render: (e, { dropped }) => (
        <NameCell
          main={e.description || "Journal entry"} rest={[e.partyName, e.reference].filter(Boolean).join(" · ")}
          extra={[dropped.has("date") && show(e.date), dropped.has("dr") && dropped.has("cr") && `${e.debitAccount} → ${e.creditAccount}`]}
        />
      ),
    },
    { id: "dr", label: "Debit (Dr)", width: 156, drop: 2, sort: (e) => (e.debitAccount || "").toLowerCase(), render: (e) => <span className="dt-clip fn-dr">{e.debitAccount}</span> },
    { id: "cr", label: "Credit (Cr)", width: 156, drop: 3, sort: (e) => (e.creditAccount || "").toLowerCase(), render: (e) => <span className="dt-clip fn-cr">{e.creditAccount}</span> },
    { id: "by", label: "Posted by", width: 128, drop: 4, sort: (e) => (e.createdBy || "").trim().toLowerCase(), render: (e) => <span className="dt-clip dt-dim">{(e.createdBy || "").trim() || "—"}</span> },
    { id: "amt", label: "Amount", width: 124, align: "end", first: "desc", sort: (e) => Number(e.amountNPR) || 0, render: (e) => <Amt n={e.amountNPR} strong /> },
  ], [show]);

  const csv = useMemo(() => [
    { label: "Date", value: (e) => e.date }, { label: "Description", value: (e) => e.description }, { label: "Debit", value: (e) => e.debitAccount },
    { label: "Credit", value: (e) => e.creditAccount }, { label: "Customer or supplier", value: (e) => e.partyName }, { label: "Reference", value: (e) => e.reference },
    { label: "Posted by", value: (e) => (e.createdBy || "").trim() }, { label: "Amount NPR", value: (e) => e.amountNPR },
  ], []);

  const empty = emptyWords({ fyActive, fy, noun: "journal entries", regionCount: regionEntries.length, fallback: "No journal entries yet." });

  return (
    <>
      <FinPane
        title="Journal" note={q || account ? `${shown.length} of ${entries.length}` : `${entries.length} ${plural(entries.length, "entry", "entries")}`}
        id="fin-pane" labelledBy="fin-tab-journal"
        tools={(
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Search entries" label="Search the journal by description, account, reference or amount" />
            <Select variant="pill" label="Account" value={account} onChange={setAccount} options={accountOptions} searchPlaceholder="Search accounts" minWidth={230} />
          </>
        )}
        actions={(
          <>
            <ExportButton name="journal" columns={csv} rows={shown} />
            {canEdit && (
              <button type="button" className="kb-btn kb-btn--primary" onClick={() => setCard({ id: null })} title="Shift + N">
                <Icons.Plus size={13} sw={2.2} aria-hidden="true" /> New entry
              </button>
            )}
          </>
        )}
        foot={(
          <Foot>
            <FootSum count label={plural(shown.length, "entry", "entries")} value={shown.length} />
            <FootSum label="Total" value={money(total)} />
          </Foot>
        )}
      >
        {!canEdit && <p className="fn-viewonly">View only. You do not have permission to post or change journal entries.</p>}
        <DataTable
          className="fn-dense" label="Journal" rows={capped} rowKey={(e) => e.id} columns={columns}
          defaultSort={{ id: "date", dir: "desc" }} onOpen={(e) => setCard({ id: e.id })}
          rowLabel={(e) => `Open the entry ${e.description || ""}: debit ${e.debitAccount}, credit ${e.creditAccount}, ${money(Number(e.amountNPR) || 0)}`}
          activeKey={card?.id || undefined} loading={loading}
          empty={<EmptyNote icon={<Icons.File size={22} sw={1.5} />}>{entries.length === 0 ? empty : "Nothing matches that."}</EmptyNote>}
        />
        {more}
      </FinPane>

      {card && (!card.id || open) && <JournalCard key={card.id || "new"} entry={open} onClose={() => setCard(null)} />}
    </>
  );
}

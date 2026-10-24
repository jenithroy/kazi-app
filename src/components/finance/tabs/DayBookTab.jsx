/**
 * Day book: every purchase, paid sale, paid expense, bank transaction and journal entry in one list, a heading for each day with that
 * day's total under it, the way a Nepali day book (रोजमेल) records the day's transactions before they are posted to the ledger.
 *
 * A row sends you to the section that owns the record. The grand total is in the strip under the table.
 */
import { useMemo, useState } from "react";
import DataTable from "../../table/DataTable";
import { FindBar } from "../FilterMenu";
import useTabFilters from "../useTabFilters";
import { EmptyNote } from "../../bento/Bento";
import { Icons } from "../../ui";
import FinPane from "../FinPane";
import { useFin, emptyWords } from "../FinanceContext";
import { ExportButton, Foot, FootSum, NameCell, Npr, plural, npr } from "../parts";
import useMedia from "../../../hooks/useMedia";

const SOURCE = { purchase: "Purchase", invoice: "Sale", expense: "Expense", bank: "Bank", journal: "Journal" };

/** The Dr and Cr columns when there is room for only one: the line's amount, with the side it is on. A day total can have both. */
function OneAmount({ r, strong }) {
  const side = (n, name, tone) => <span key={name} className={`dt-num dt-${tone}${strong ? " dt-strong" : ""}`}>{npr(n)}<i className="fn-side">{name}</i></span>;
  if (r.dr && r.cr) return <span className="dt-stack">{side(r.dr, "Dr", "good")}{side(r.cr, "Cr", "bad")}</span>;
  if (r.dr) return side(r.dr, "Dr", "good");
  if (r.cr) return side(r.cr, "Cr", "bad");
  return <span className="dt-dim">—</span>;
}
const GO = { purchase: "Open in Purchases", invoice: "Open in Billing", expense: "Open in Expenses", bank: "Open in Bank", journal: "Open in Journal" };
const has = (hay, q) => String(hay || "").toLowerCase().includes(q);
const PHONE_LINES = 60;

export default function DayBookTab() {
  const f = useFin();
  const phone = useMedia("(max-width: 768px)");
  const { dayBook, loading, show, goToSource, openTab, fyActive, fy, regionPurchases, regionInvoices, regionBankTxns, regionEntries } = f;
  const [order, setOrder] = useState("new");                  // new | old
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);

  const q = query.trim().toLowerCase();
  const found = useMemo(() => dayBook.filter((r) => !q || has(r.particulars, q) || has(r.account, q)), [dayBook, q]);
  // What the Filters panel offers: which way round to read it, then where a line came from, its account, which side it is on, how much.
  const defs = useMemo(() => [
    {
      id: "order", label: "Order", kind: "chips", controlled: { value: order, set: setOrder },
      options: [{ value: "new", label: "Newest first" }, { value: "old", label: "Oldest first" }],
    },
    {
      id: "from", label: "From", kind: "chips",
      options: [{ value: "all", label: "All" }, ...Object.entries(SOURCE).map(([value, label]) => ({ value, label }))],
      test: (r, v) => r.sourceType === v,
    },
    { id: "account", label: "Account", kind: "select", of: (r) => r.account, any: "Any account" },
    {
      id: "side", label: "Side", kind: "chips",
      options: [{ value: "any", label: "Both" }, { value: "dr", label: "Debits (Dr)" }, { value: "cr", label: "Credits (Cr)" }],
      test: (r, v) => Number(v === "dr" ? r.dr : r.cr) > 0,
    },
    { id: "amount", label: "Amount", kind: "range", get: (r) => Math.max(Number(r.dr) || 0, Number(r.cr) || 0), unit: "NPR" },
  ], [order]);
  const tf = useTabFilters(defs, found);
  const matched = tf.rows;
  const drTotal = matched.reduce((s, r) => s + Number(r.dr || 0), 0);
  const crTotal = matched.reduce((s, r) => s + Number(r.cr || 0), 0);

  // a heading for each day, its entries, then the day's total
  const list = useMemo(() => {
    const groups = [];
    for (const r of matched) {
      const last = groups[groups.length - 1];
      if (last && last.date === r.date) last.rows.push(r);
      else groups.push({ date: r.date, rows: [r] });
    }
    if (order === "new") groups.reverse();
    const out = [];
    for (const g of groups) {
      const dr = g.rows.reduce((s, r) => s + Number(r.dr || 0), 0);
      const cr = g.rows.reduce((s, r) => s + Number(r.cr || 0), 0);
      out.push({ kind: "group", key: `g-${g.date || "none"}`, label: `${g.date ? show(g.date) : "No date"} · ${g.rows.length} ${plural(g.rows.length, "entry", "entries")}` });
      g.rows.forEach((r, i) => out.push({ ...r, key: `${g.date}-${i}` }));
      out.push({ kind: "sum", key: `s-${g.date || "none"}`, dr, cr });
    }
    return out;
  }, [matched, order, show]);

  const shown = phone && !all && list.length > PHONE_LINES ? list.slice(0, PHONE_LINES) : list;

  const columns = useMemo(() => [
    {
      // a narrow table has no room for the source or the account: they go under the particulars
      id: "what", label: "Particulars", grow: true, min: 160, max: 600,
      render: (r, { dropped }) => (r.kind === "sum"
        ? <span className="fn-daytotal">Day total</span>
        : <NameCell main={r.particulars} extra={[dropped.has("from") && SOURCE[r.sourceType], dropped.has("acct") && r.account]} />),
    },
    { id: "from", label: "From", width: 96, drop: 4, render: (r) => (r.kind ? null : <span className="dt-clip dt-dim">{SOURCE[r.sourceType]}</span>) },
    { id: "acct", label: "Account", width: 150, drop: 3, render: (r) => (r.kind ? null : <span className="dt-clip dt-dim">{r.account}</span>) },
    {
      // with no room for the Cr column this one carries both sides, each named
      id: "dr", label: "Dr (NPR)", width: 124, align: "end",
      render: (r, { dropped }) => (dropped.has("cr") ? <OneAmount r={r} strong={r.kind === "sum"} /> : <Npr n={r.dr} tone="good" strong={r.kind === "sum"} />),
    },
    { id: "cr", label: "Cr (NPR)", width: 124, drop: 2, align: "end", render: (r) => <Npr n={r.cr} tone="bad" strong={r.kind === "sum"} /> },
  ], []);

  function open(r) {
    if (r.sourceType === "purchase") goToSource("/purchases", { search: r.searchKey });
    else if (r.sourceType === "invoice") goToSource("/billing", { search: r.searchKey, autoEdit: true, id: r.docId });
    else if (r.sourceType === "expense") openTab("expenses");
    else if (r.sourceType === "bank") openTab("bank");
    else if (r.sourceType === "journal") openTab("journal");
  }

  const csv = useMemo(() => [
    { label: "Date", value: (r) => r.date }, { label: "Particulars", value: (r) => r.particulars }, { label: "From", value: (r) => SOURCE[r.sourceType] },
    { label: "Account", value: (r) => r.account }, { label: "Dr NPR", value: (r) => r.dr || "" }, { label: "Cr NPR", value: (r) => r.cr || "" },
  ], []);

  const sources = regionPurchases.length + regionInvoices.length + regionBankTxns.length + regionEntries.length;
  const empty = emptyWords({ fyActive, fy, noun: "transactions", regionCount: sources, fallback: "No transactions yet." });

  return (
    <FinPane
      title="Day book" note={`${dayBook.length} ${plural(dayBook.length, "entry", "entries")}`} id="fin-pane" labelledBy="fin-tab-day-book"
      tools={(
        <FindBar value={query} onChange={(v) => { setQuery(v); setAll(false); }} placeholder="Search the day book" label="Search the day book by particulars or account" filters={tf} />
      )}
      actions={<ExportButton name="day-book" columns={csv} rows={matched} />}
      foot={(
        <Foot>
          <FootSum count label={plural(matched.length, "entry", "entries")} value={matched.length} />
          <FootSum label="Dr" value={npr(drTotal)} tone="good" />
          <FootSum label="Cr" value={npr(crTotal)} tone="bad" />
        </Foot>
      )}
    >
      {fyActive && <p className="fn-viewonly">Fiscal year {fy}: every purchase, paid sale, bank transaction and journal entry dated in this year, in the order they happened.</p>}
      <DataTable
        className="fn-dense fn-book" label="Day book" rows={shown} rowKey={(r) => r.key} columns={columns}
        kindOf={(r) => r.kind} onOpen={open} rowLabel={(r) => `${GO[r.sourceType] || "Open"}: ${r.particulars}`}
        loading={loading}
        empty={<EmptyNote icon={<Icons.File size={22} sw={1.5} />}>{dayBook.length === 0 ? empty : "Nothing matches that."}</EmptyNote>}
      />
      {shown.length < list.length && <div className="fn-more"><button type="button" onClick={() => setAll(true)}>Show everything</button></div>}
    </FinPane>
  );
}

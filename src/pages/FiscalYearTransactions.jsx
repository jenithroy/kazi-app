/**
 * Transactions by fiscal year (/finance/2083-84): everything that moved in one Nepali fiscal year (Shrawan 1 to the end of Asar) in one
 * list, whatever kind it is, with what came in, what went out and the net.
 *
 *   top row   how many records, money in, money out, the net
 *   pane      one line each, newest first, searched and narrowed by the Filters button beside the search (the kind, money in or out, whom it is
 *             with, a category, an amount, a day range… lib/fiscalYearFilters.js; the side of the business and A.D. or B.S. are in it too);
 *             a row opens the same card the rest of Finance uses for that kind (an expense, a purchase, a journal entry, a bank transaction,
 *             a payroll record); an invoice goes to Billing, which has its editor
 *
 * The rows, what counts as money in or out, and who may change which kind are the old page's. What changed: nothing is edited in a row any
 * more, so there are no unsaved drafts to forget; and an invoice is no longer edited here (Billing does that, and is one press away).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BentoGrid, BentoPage, EmptyNote, Figure, Money, Sub, Tile } from "../components/bento/Bento";
import { Icons } from "../components/ui";
import DataTable from "../components/table/DataTable";
import { FindBar } from "../components/filters/FilterMenu";
import useFilters from "../components/filters/useFilters";
import FinPane from "../components/finance/FinPane";
import { FinanceProvider } from "../components/finance/FinanceContext";
import ExpenseCard from "../components/finance/cards/ExpenseCard";
import PurchaseCard from "../components/finance/cards/PurchaseCard";
import JournalCard from "../components/finance/cards/JournalCard";
import BankCard from "../components/finance/cards/BankCard";
import PayrollCard from "../components/finance/cards/PayrollCard";
import { partiesOf } from "../components/finance/tabs/PurchasesTab";
import { Amt, Chip, ExportButton, Foot, FootSum, NameCell, plural, useMoney, usePhoneRows } from "../components/finance/parts";
import "../components/finance/finance.css";
import useDateMode from "../hooks/useDateMode";
import { fetchAll } from "../lib/db";
import { buildRows, withNpr, yearTotals } from "../lib/fiscalYearRows";
import { transactionFilterDefs } from "../lib/fiscalYearFilters";
import { useAuth } from "../context/AuthContext";
import { useRegion } from "../context/RegionContext";
import { useCurrency } from "../context/CurrencyContext";
import { financeTabAllowed, financeTabCanEdit, sectionCanEdit, FINANCE_TAB_KEYS } from "../utils/permissions";
import { fiscalYearDateRangeAD, fiscalYearToSlug, parseFiscalYearLabel, slugToFiscalYear } from "../utils/fiscalYear";
import { inRegion, countUntagged } from "../utils/region";

const TYPES = ["Expense", "Purchase", "Payroll", "Journal", "Bank", "Sales"];
const TONE = { Sales: "good", Payroll: "info", Journal: "warn" };
const TAB_OF = { Expense: "expenses", Purchase: "purchases", Payroll: "payroll", Journal: "journal", Bank: "bank" };
const has = (hay, q) => String(hay || "").toLowerCase().includes(q);
const ico = { size: 14, sw: 1.8 };

export default function FiscalYearTransactions() {
  const { fy: slug } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { ratesVersion } = useCurrency();
  const { region, label: regionLabel } = useRegion();
  const money = useMoney();
  const [, , show] = useDateMode();
  const fiscalYear = slugToFiscalYear(slug);
  const fyRange = useMemo(() => fiscalYearDateRangeAD(fiscalYear), [fiscalYear]);

  const canExpenses = financeTabAllowed(profile, "expenses");
  const canPurchases = financeTabAllowed(profile, "purchases");
  const canPayroll = financeTabAllowed(profile, "payroll");
  const canJournal = financeTabAllowed(profile, "journal");
  const canBank = financeTabAllowed(profile, "bank");
  const anyAccess = canExpenses || canPurchases || canPayroll || canJournal || canBank;
  // Editing is gated per kind of row, the same way each record's own section gates it
  const canEditTab = useCallback((t) => financeTabCanEdit(profile, FINANCE_TAB_KEYS[t]), [profile]);
  const canEditType = (type) => (type === "Sales" ? sectionCanEdit(profile, "billing") : financeTabCanEdit(profile, TAB_OF[type]));

  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState([]);                // every row of every year: stepping to another year is a re-filter, not a re-read
  const [accounts, setAccounts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const seq = useRef(0);

  const load = useCallback(async ({ quiet = false } = {}) => {
    const mine = ++seq.current;
    if (!quiet) setLoading(true);
    try {
      // These checks only decide what to bother fetching: row-level security re-applies them, so a kind someone cannot see comes back empty.
      const get = (allowed, name) => (allowed ? fetchAll(name) : Promise.resolve([]));
      const [expRows, purRows, payrollRows, journalRows, bankRows, invRows, accRows, empRows] = await Promise.all([
        get(canExpenses, "finance_expenses"), get(canPurchases, "finance_purchases"), get(canPayroll, "finance_payroll"),
        get(canJournal, "journal_entries"), get(canBank, "bank_transactions"), get(canPurchases || canJournal, "invoices"),
        get(canJournal, "accounts"), get(canPayroll, "employees"),
      ]);
      if (mine !== seq.current) return;
      setLoaded(buildRows({ expRows, purRows, payrollRows, journalRows, bankRows, invRows }));
      setAccounts(accRows);
      setEmployees([...empRows].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
      setFailed(false);
    } catch (err) {
      console.error(err);
      if (mine === seq.current) setFailed(true);
    } finally {
      if (mine === seq.current && !quiet) setLoading(false);
    }
  }, [canExpenses, canPurchases, canPayroll, canJournal, canBank]);

  useEffect(() => {
    if (!anyAccess) { setLoading(false); return; }
    load().catch(console.error);
  }, [anyAccess, load]);

  const allRows = useMemo(() => withNpr(loaded), [loaded, ratesVersion]);   // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => allRows.filter((r) => r.fy === fiscalYear && inRegion(r, region)), [allRows, fiscalYear, region]);

  // Fiscal years that contain something, oldest first. The current one is always there: it is where a first transaction will land.
  const years = useMemo(() => {
    const set = new Set(allRows.map((r) => r.fy));
    set.add(fiscalYear);
    return [...set].sort((a, b) => parseFiscalYearLabel(a).startYear - parseFiscalYearLabel(b).startYear);
  }, [allRows, fiscalYear]);
  const here = years.indexOf(fiscalYear);
  const prevYear = here > 0 ? years[here - 1] : null;
  const nextYear = here >= 0 && here < years.length - 1 ? years[here + 1] : null;
  const gotoYear = (label) => { if (label) navigate(`/finance/${fiscalYearToSlug(label)}`); };

  const [query, setQuery] = useState("");
  const totals = useMemo(() => yearTotals(rows), [rows]);
  const present = useMemo(() => TYPES.filter((t) => rows.some((r) => r.type === t)), [rows]);
  const q = query.trim().toLowerCase();
  const found = useMemo(() => rows.filter((r) => !q || has(r.description, q)), [rows, q]);
  // what the Filters panel offers on top of the search (lib/fiscalYearFilters.js): the kind (the old chips), money in or out, whom it is with, an amount…
  const filterDefs = useMemo(() => transactionFilterDefs({ types: present, show, rows }), [present, show, rows]);
  const tf = useFilters(filterDefs, found);
  const shown = tf.rows;
  // the strip under the table adds up what is shown (the tiles above are the whole year)
  const shownTotals = useMemo(() => yearTotals(shown), [shown]);
  const shownTypes = useMemo(() => TYPES.filter((t) => shown.some((r) => r.type === t)), [shown]);
  const [capped, more] = usePhoneRows(shown);
  const scope = useMemo(() => ({ label: "All of Finance", region: { untagged: countUntagged(rows) }, dates: true }), [rows]);
  // another year is another list: a kind, an amount or a day range chosen in this one would only leave that list empty
  const clearFilters = tf.clear;
  const shownYear = useRef(fiscalYear);
  useEffect(() => {
    if (shownYear.current === fiscalYear) return;
    shownYear.current = fiscalYear;
    clearFilters();
  }, [fiscalYear, clearFilters]);

  const [card, setCard] = useState(null);                   // a row's key
  const open = card ? rows.find((r) => r.key === card) || null : null;
  useEffect(() => { if (card && !loading && !open) setCard(null); }, [card, loading, open]);

  function openRow(r) {
    // an invoice number starts again every fiscal year, so the invoice's own id says which one is meant
    if (r.type === "Sales") { navigate("/billing", { state: { search: r.src.invoiceNumber || r.src.clientName, autoEdit: true, id: r.src.id } }); return; }
    setCard(r.key);
  }

  const [notice, setNotice] = useState(null);
  const timer = useRef(0);
  const notify = useCallback((text, tone = "bad") => { clearTimeout(timer.current); setNotice({ text, tone }); timer.current = setTimeout(() => setNotice(null), 7000); }, []);

  const ctx = {
    profile, region, show, loading, reload: () => load({ quiet: true }), notify, canEditTab, accounts, inventoryItems: [], regionVatBills: [], vatBills: [],
    purchases: [], regionPurchases: [], newRef: { current: null },
  };

  const columns = useMemo(() => [
    { id: "date", label: "Date", width: 116, drop: 1, first: "desc", sort: (r) => r.date || "", render: (r) => <span className="dt-num">{show(r.date)}</span> },
    { id: "type", label: "Kind", width: 100, drop: 3, sort: (r) => r.type, render: (r) => <Chip tone={TONE[r.type]}>{r.type}</Chip> },
    {
      // a narrow table has no room for the date or the kind: they go under the description
      id: "what", label: "What", grow: true, min: 160, max: 600, sort: (r) => r.description.toLowerCase(),
      render: (r, { dropped }) => (
        <NameCell main={r.description} rest={r.counts ? "" : "not in the totals: not paid yet"} extra={[dropped.has("date") && show(r.date), dropped.has("type") && r.type]} />
      ),
    },
    {
      id: "amt", label: "Amount", width: 132, align: "end", first: "desc", sort: (r) => r.amountNPR,
      render: (r) => (r.sign === 0
        ? <span className="dt-stack"><span className="dt-num dt-dim">{money(r.amountNPR)}</span></span>
        : <Amt n={r.amountNPR} strong tone={r.sign > 0 ? "good" : "bad"} sign={r.sign > 0 ? "+ " : "− "} />),
    },
  ], [show, money]);

  const csv = useMemo(() => [
    { label: "Date", value: (r) => r.date }, { label: "Kind", value: (r) => r.type }, { label: "What", value: (r) => r.description },
    { label: "Amount NPR", value: (r) => r.amountNPR }, { label: "Direction", value: (r) => (r.sign > 0 ? "In" : r.sign < 0 ? "Out" : "") },
    { label: "Counted", value: (r) => (r.counts ? "Yes" : "No") },
  ], []);

  const rangeText = fyRange?.startAD && fyRange?.endAD ? `${show(fyRange.startAD)} to ${show(fyRange.endAD)}` : "";

  if (!anyAccess) {
    return (
      <BentoPage className="fn-page fn-page--fy">
        <header className="kb-head"><div className="kb-head-l"><h1>Transactions</h1></div></header>
        <div className="kb-error" role="status"><p>You don't have permission to view Finance transactions.</p></div>
      </BentoPage>
    );
  }

  const cardType = open?.type;
  return (
    <FinanceProvider value={ctx}>
      <BentoPage className="fn-page fn-page--fy">
        <header className="kb-head kb-head--stack">
          <div className="kb-head-l">
            <h1>Transactions · FY {fiscalYear}</h1>
            <p className="kb-head-sub"><span>{[regionLabel, rangeText].filter(Boolean).join(" · ")}</span></p>
          </div>
          <div className="kb-head-r fn-head-r">
            <div className="kb-head-act">
              <button type="button" className="kb-pillbtn" onClick={() => navigate("/finance")}><Icons.ChevronLeft size={14} sw={2} aria-hidden="true" /> Finance</button>
              <button type="button" className="kb-pillbtn" disabled={loading || !prevYear} title={prevYear ? `Go to FY ${prevYear}` : "No earlier transactions recorded"} onClick={() => gotoYear(prevYear)}>
                <Icons.ChevronLeft size={14} sw={2} aria-hidden="true" /> {prevYear ? `FY ${prevYear}` : "Earlier year"}
              </button>
              <button type="button" className="kb-pillbtn" disabled={loading || !nextYear} title={nextYear ? `Go to FY ${nextYear}` : "No later transactions recorded"} onClick={() => gotoYear(nextYear)}>
                {nextYear ? `FY ${nextYear}` : "Later year"} <Icons.ChevronRight size={14} sw={2} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        {notice && (
          <div className={`fn-banner fn-banner--${notice.tone}`} role="alert"><Icons.Alert size={16} sw={1.9} aria-hidden="true" /><span>{notice.text}</span></div>
        )}

        {failed ? (
          <div className="kb-error" role="alert">
            <p>The transactions could not load. Check your connection and try again.</p>
            <button type="button" className="kb-btn kb-btn--ghost" onClick={() => load()}>Try again</button>
          </div>
        ) : (
          <BentoGrid layout="fy">
            <Tile area="t1" icon={<Icons.File {...ico} />} title="Records" loading={loading} className="fn-t">
              <Figure>{rows.length}</Figure>
              <Sub>{totals.uncounted > 0 ? <><b>{totals.uncounted}</b> not counted (unpaid invoices)</> : "in this fiscal year"}</Sub>
            </Tile>
            <Tile area="t2" icon={<Icons.Sales {...ico} />} title="Money in" loading={loading} className="fn-t">
              <Figure tone="good"><Money npr={totals.inflow} compact={totals.inflow >= 1e7} /></Figure>
              <Sub>paid sales and bank credits</Sub>
            </Tile>
            <Tile area="t3" icon={<Icons.Cart {...ico} />} title="Money out" loading={loading} className="fn-t">
              <Figure><Money npr={totals.outflow} compact={totals.outflow >= 1e7} /></Figure>
              <Sub>expenses, purchases, payroll, bank debits</Sub>
            </Tile>
            <Tile area="t4" tone={totals.net < 0 ? "terra" : "default"} icon={<Icons.Finance {...ico} />} title={totals.net < 0 ? "Net out" : "Net in"} loading={loading} className="fn-t">
              <Figure tone={totals.net < 0 ? "bad" : undefined}><Money npr={Math.abs(totals.net)} compact={Math.abs(totals.net) >= 1e7} /></Figure>
              <Sub>money in less money out</Sub>
            </Tile>

            <FinPane
              title="Transactions" note={q || tf.count > 0 ? `${shown.length} of ${rows.length}` : `${rows.length} ${plural(rows.length, "record")}`} id="fin-pane"
              tools={<FindBar filters={tf} scope={scope} value={query} onChange={setQuery} placeholder="Search transactions" label="Search this year's transactions" />}
              actions={<ExportButton name={`transactions-${fiscalYearToSlug(fiscalYear)}`} columns={csv} rows={shown} />}
              foot={(
                <Foot>
                  <FootSum count label={plural(shown.length, "record")} value={shown.length} />
                  {shownTypes.map((t) => <FootSum key={t} label={t} value={money(shownTotals.byType[t] || 0)} />)}
                </Foot>
              )}
            >
              <DataTable
                className="fn-dense" label={`Transactions in FY ${fiscalYear}`} rows={capped} rowKey={(r) => r.key} columns={columns}
                defaultSort={{ id: "date", dir: "desc" }} onOpen={openRow} activeKey={card || undefined}
                rowLabel={(r) => (r.type === "Sales" ? `Open ${r.description} in Billing` : `Open ${r.type.toLowerCase()}: ${r.description}`)} loading={loading}
                empty={<EmptyNote icon={<Icons.File size={22} sw={1.5} />}>{rows.length === 0 ? `No transactions found for FY ${fiscalYear}.` : "Nothing matches that."}</EmptyNote>}
              />
              {more}
            </FinPane>
          </BentoGrid>
        )}

        {open && cardType === "Expense" && <ExpenseCard key={open.key} expense={open.src} bill={null} onClose={() => setCard(null)} />}
        {open && cardType === "Purchase" && <PurchaseCard key={open.key} purchase={open.src} bills={[]} parties={partiesOf(allRows.filter((r) => r.type === "Purchase").map((r) => r.src))} onClose={() => setCard(null)} />}
        {open && cardType === "Journal" && <JournalCard key={open.key} entry={open.src} onClose={() => setCard(null)} />}
        {open && cardType === "Bank" && <BankCard key={open.key} txn={open.src} onClose={() => setCard(null)} />}
        {open && cardType === "Payroll" && (
          <PayrollCard key={open.key} record={open.src} employees={employees} canEdit={canEditType("Payroll")} profile={profile} reload={() => load({ quiet: true })} onClose={() => setCard(null)} />
        )}
      </BentoPage>
    </FinanceProvider>
  );
}

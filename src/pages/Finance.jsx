/**
 * Finance, on the same frosted-glass frame as the Dashboard, Sales and Inventory: one screen, no page scroll, the tables
 * scroll inside their pane and their heads and totals stay put.
 *
 *   header   the period (a fiscal year or any From / To), A.D. or B.S., UK or Nepal
 *   top row  income, purchases, expenses, payroll, and where that leaves the books
 *   left     the sections of Finance in three groups, each with how many records it holds
 *   pane     the chosen section: a table to read and a card to enter or change (nothing is typed into a row)
 *
 * Every figure and every write is the old page's (lib/finance.js, lib/financeWrites.js, hooks/useFinanceData.js). What a
 * position may see and change is the same: the tabs it is granted, view-only where it may not edit.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BentoGrid, BentoPage } from "../components/bento/Bento";
import { Icons } from "../components/ui";
import { PageTabs } from "../components/table/Bar";
import { RegionSwitch } from "../components/RegionSwitch";
import PeriodBar, { DateModeSwitch } from "../components/finance/PeriodBar";
import TabRail from "../components/finance/TabRail";
import FinanceTiles from "../components/finance/Tiles";
import FinPane from "../components/finance/FinPane";
import { FinanceProvider } from "../components/finance/FinanceContext";
import ExpensesTab from "../components/finance/tabs/ExpensesTab";
import PurchasesTab from "../components/finance/tabs/PurchasesTab";
import VatTab from "../components/finance/tabs/VatTab";
import JournalTab from "../components/finance/tabs/JournalTab";
import DayBookTab from "../components/finance/tabs/DayBookTab";
import LedgerTab from "../components/finance/tabs/LedgerTab";
import PnlTab from "../components/finance/tabs/PnlTab";
import BalanceTab from "../components/finance/tabs/BalanceTab";
import BankTab from "../components/finance/tabs/BankTab";
import OrderPnlTab from "../components/finance/tabs/OrderPnlTab";
import "../components/finance/finance.css";
import useFinanceData from "../hooks/useFinanceData";
import useDateMode from "../hooks/useDateMode";
import useMedia from "../hooks/useMedia";
import { useAuth } from "../context/AuthContext";
import { useRegion } from "../context/RegionContext";
import { useCurrency } from "../context/CurrencyContext";
import { financeTabAllowed, sectionCanEdit, FINANCE_TAB_KEYS } from "../utils/permissions";
import { countUntagged, filterByRegion } from "../utils/region";
import { BANK_NAMES } from "../utils/billing.jsx";
import {
  filterByFiscalYear, filterByDateRange, isDateRangeActive, fiscalYearDateRangeAD, fiscalYearsIn, mergeFiscalYears, isFiscalYearLabel,
  isoDay, payrollPeriodDate,
} from "../utils/fiscalYear";
import { useFiscalYearFilter } from "../components/FiscalYearFilter";
import { useDateRangeFilter } from "../components/DateRangeFilter";
import { describePeriod } from "../lib/period";
import {
  TABS, TAB_SHORTCUTS, asOfDateOf, balanceSheet, bankAccountNamesFrom, cashBankLedger, dayBookRows, expenseStats, journalTotals,
  profitAndLoss, summarise, tabLabel,
} from "../lib/finance";

const GROUPS = [
  { label: "Money in and out", tabs: ["expenses", "purchases", "vat bills", "bank"] },
  { label: "Books", tabs: ["journal", "day book", "ledger", "p&l", "balance sheet"] },
  { label: "Orders", tabs: ["order p&l"] },
];

const LOST_NAMES = {
  finance_payroll: "payroll", finance_expenses: "expenses", finance_purchases: "purchases", vat_bills: "VAT bills", employees: "staff",
  journal_entries: "journal", accounts: "accounts", invoices: "invoices", bank_transactions: "bank transactions", orders: "orders",
  order_costs: "order costs", production: "production", inventory: "inventory",
};

function Soon({ tab }) {
  return <FinPane title={tabLabel(tab)} labelledBy={`fin-tab-${tab.replace(/\W+/g, "-")}`} id="fin-pane"><p className="fn-viewonly">Not built yet.</p></FinPane>;
}

const VIEWS = {
  expenses: ExpensesTab,
  purchases: PurchasesTab,
  "vat bills": VatTab,
  journal: JournalTab,
  "day book": DayBookTab,
  ledger: LedgerTab,
  "p&l": PnlTab,
  "balance sheet": BalanceTab,
  bank: BankTab,
  "order p&l": OrderPnlTab,
};

export default function Finance() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { region } = useRegion();
  const { ratesVersion } = useCurrency();
  const [dateMode, , show] = useDateMode();
  const narrow = useMedia("(max-width: 1099px)");           // the rail is not drawn here, so the dropdown is what a guided tour points at
  const data = useFinanceData();
  const loading = data.status === "loading";

  /* ── which section ─────────────────────────────────────────── */
  // Restored in the first render (not in an effect), so the page doesn't flash "expenses" before jumping to the section she
  // was on when she clicked out to Purchases or Billing.
  const [activeTab, setActiveTab] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("financeReturnState"))?.tab || "expenses"; } catch { return "expenses"; }
  });
  const visibleTabs = useMemo(() => TABS.filter((t) => financeTabAllowed(profile, FINANCE_TAB_KEYS[t])), [profile]);
  const tab = visibleTabs.includes(activeTab) ? activeTab : visibleTabs[0];
  const canEditTab = useCallback((t) => sectionCanEdit(profile, "finance") && financeTabAllowed(profile, FINANCE_TAB_KEYS[t]), [profile]);
  useEffect(() => { try { sessionStorage.removeItem("financeReturnState"); } catch { /* nothing saved */ } }, []);

  const newRef = useRef(null);                  // the open tab says how to start a new record (Shift + N)
  const tabsRef = useRef(visibleTabs);
  tabsRef.current = visibleTabs;
  useEffect(() => {
    function onKey(e) {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.tagName === "SELECT" || t?.isContentEditable) return;
      if (document.querySelector(".kmodal-overlay")) return;
      const key = e.key.toLowerCase();
      // taken before anything under it sees the key: a dropdown that has the focus would otherwise also open on the letter
      if (key === "n" && newRef.current) { e.preventDefault(); e.stopPropagation(); newRef.current(); return; }
      const next = TAB_SHORTCUTS[key];
      if (!next || !tabsRef.current.includes(next)) return;
      e.preventDefault();
      e.stopPropagation();
      setActiveTab(next);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  /* ── a word at the top when something needs saying ─────────── */
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(0);
  const notify = useCallback((text, tone = "bad") => {
    clearTimeout(noticeTimer.current);
    setNotice({ text, tone });
    noticeTimer.current = setTimeout(() => setNotice(null), 7000);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  /* ── one region's books, then one period of them ───────────────
     The region says whose books, the fiscal year says which year of them and a From / To narrows that further. Everything below
     reads the narrowed lists and needs no knowledge of the pickers. The `region*` lists stay in scope where a number must reach
     across years: the ledger's brought-forward balances, the balance sheet's position at a year end, the bank-name list. */
  const regionPayroll = useMemo(() => filterByRegion(data.payroll, region), [data.payroll, region]);
  const employees = useMemo(() => filterByRegion(data.employees, region), [data.employees, region]);
  const regionExpenses = useMemo(() => filterByRegion(data.expenses, region), [data.expenses, region]);
  const regionPurchases = useMemo(() => filterByRegion(data.purchases, region), [data.purchases, region]);
  const inventoryItems = useMemo(() => filterByRegion(data.inventoryItems, region), [data.inventoryItems, region]);
  const regionVatBills = useMemo(() => filterByRegion(data.vatBills, region), [data.vatBills, region]);
  const regionEntries = useMemo(() => filterByRegion(data.entries, region), [data.entries, region]);
  const accounts = useMemo(() => filterByRegion(data.accounts, region), [data.accounts, region]);
  const regionInvoices = useMemo(() => filterByRegion(data.invoices, region), [data.invoices, region]);
  const regionBankTxns = useMemo(() => filterByRegion(data.bankTxns, region), [data.bankTxns, region]);
  const regionOrders = useMemo(() => filterByRegion(data.orders, region), [data.orders, region]);

  const [fy] = useFiscalYearFilter();
  const fyRange = useMemo(() => {
    if (!isFiscalYearLabel(fy)) return null;
    const r = fiscalYearDateRangeAD(fy);
    return r?.startAD && r?.endAD ? r : null;
  }, [fy]);
  const fyActive = Boolean(fyRange);
  const [dateRange] = useDateRangeFilter();
  const periodActive = fyActive || isDateRangeActive(dateRange);
  const inPeriod = (list, dateOf = (r) => r.date) => filterByDateRange(filterByFiscalYear(list, fy, dateOf), dateRange, dateOf);

  const payroll = useMemo(() => inPeriod(regionPayroll, payrollPeriodDate), [regionPayroll, fy, dateRange]);   // eslint-disable-line react-hooks/exhaustive-deps
  const expenses = useMemo(() => inPeriod(regionExpenses), [regionExpenses, fy, dateRange]);                    // eslint-disable-line react-hooks/exhaustive-deps
  const purchases = useMemo(() => inPeriod(regionPurchases), [regionPurchases, fy, dateRange]);                 // eslint-disable-line react-hooks/exhaustive-deps
  const entries = useMemo(() => inPeriod(regionEntries), [regionEntries, fy, dateRange]);                       // eslint-disable-line react-hooks/exhaustive-deps
  const invoices = useMemo(() => inPeriod(regionInvoices), [regionInvoices, fy, dateRange]);                    // eslint-disable-line react-hooks/exhaustive-deps
  const bankTxns = useMemo(() => inPeriod(regionBankTxns), [regionBankTxns, fy, dateRange]);                    // eslint-disable-line react-hooks/exhaustive-deps
  // An order's own date when it has one, else when it was created.
  const orders = useMemo(() => inPeriod(regionOrders, (o) => o.date || o.createdAt), [regionOrders, fy, dateRange]);   // eslint-disable-line react-hooks/exhaustive-deps
  // A bill has no date of its own worth filing by, so it goes in the year of what it is a bill FOR: a purchase's EXP id, an
  // expense's row id; if neither is found, when it was uploaded.
  const vatBills = useMemo(() => {
    if (!periodActive) return regionVatBills;
    const dateOf = new Map();
    data.expenses.forEach((e) => { if (e.id != null && e.date) dateOf.set(String(e.id), e.date); });
    data.purchases.forEach((p) => { if (p.expenseId && p.date) dateOf.set(String(p.expenseId), p.date); });
    return inPeriod(regionVatBills, (b) => dateOf.get(String(b.expenseId)) || b.uploadedAt);
  }, [regionVatBills, data.expenses, data.purchases, fy, periodActive, dateRange]);   // eslint-disable-line react-hooks/exhaustive-deps

  // The years the open section's records actually fall in. Sections built from several lists offer every year any of them touches.
  const yearsHere = useMemo(() => {
    const exp = fiscalYearsIn(regionExpenses);
    const pur = fiscalYearsIn(regionPurchases);
    const jnl = fiscalYearsIn(regionEntries);
    const bnk = fiscalYearsIn(regionBankTxns);
    const inv = fiscalYearsIn(regionInvoices);
    const pay = fiscalYearsIn(regionPayroll, payrollPeriodDate);
    switch (tab) {
      case "expenses": return exp;
      case "purchases": return pur;
      case "vat bills": return mergeFiscalYears(exp, pur);
      case "journal": return jnl;
      case "bank": return bnk;
      case "order p&l": return fiscalYearsIn(regionOrders, (o) => o.date || o.createdAt);
      case "ledger":
      case "day book": return mergeFiscalYears(pur, inv, bnk, jnl);
      default: return mergeFiscalYears(exp, pur, jnl, bnk, inv, pay);
    }
  }, [tab, regionExpenses, regionPurchases, regionEntries, regionBankTxns, regionInvoices, regionPayroll, regionOrders]);

  /* ── the sums (lib/finance.js) ─────────────────────────────── */
  const summary = useMemo(() => summarise({ payroll, expenses, purchases, periodActive }), [payroll, expenses, purchases, periodActive]);
  const exp = useMemo(() => expenseStats(expenses), [expenses]);
  const ledger = useMemo(() => journalTotals(entries), [entries]);
  const asOfDate = useMemo(() => asOfDateOf(fyRange, dateRange), [fyRange, dateRange]);
  const ledgerAsOf = useMemo(() => {
    if (!asOfDate) return ledger;
    return journalTotals(regionEntries.filter((e) => { const d = isoDay(e.date); return !!d && d <= asOfDate; }));
  }, [ledger, regionEntries, asOfDate]);
  const bankNames = useMemo(
    () => bankAccountNamesFrom({ builtIn: BANK_NAMES, purchases: regionPurchases, invoices: regionInvoices, expenses: regionExpenses, bankTxns: regionBankTxns }),
    [regionPurchases, regionInvoices, regionExpenses, regionBankTxns],
  );
  const cashBank = useMemo(
    () => cashBankLedger({ purchases: regionPurchases, invoices: regionInvoices, expenses: regionExpenses, bankTxns: regionBankTxns, entries: regionEntries, accounts, bankNames, fyRange }),
    [regionPurchases, regionInvoices, regionExpenses, regionBankTxns, regionEntries, accounts, bankNames, fyRange, ratesVersion],   // eslint-disable-line react-hooks/exhaustive-deps
  );
  const dayBook = useMemo(
    () => dayBookRows({ purchases, invoices, expenses, bankTxns, entries }),
    [purchases, invoices, expenses, bankTxns, entries, ratesVersion],   // eslint-disable-line react-hooks/exhaustive-deps
  );
  const pl = useMemo(
    () => profitAndLoss({ entries, accounts, expenses, purchases, payroll, invoices, periodActive }),
    [entries, accounts, expenses, purchases, payroll, invoices, periodActive, ratesVersion],   // eslint-disable-line react-hooks/exhaustive-deps
  );
  const bs = useMemo(() => balanceSheet({ accounts, ledgerAsOf }), [accounts, ledgerAsOf]);

  /* ── going to the page a record belongs to and coming back ──── */
  // A row that sends her to Purchases or Billing remembers the section, so "Back to Finance" lands right back here.
  const goToSource = useCallback((path, state) => {
    try { sessionStorage.setItem("financeReturnState", JSON.stringify({ tab })); } catch { /* not remembered */ }
    navigate(path, { state });
  }, [navigate, tab]);

  const counts = {
    expenses: expenses.length, purchases: purchases.length, "vat bills": vatBills.length, journal: entries.length,
    "day book": dayBook.length, bank: bankTxns.length, "order p&l": orders.length,
  };
  const groups = GROUPS.map((g) => ({ ...g, tabs: g.tabs.filter((t) => visibleTabs.includes(t)) })).filter((g) => g.tabs.length);
  const tabsForSelect = groups.flatMap((g, i) => [...(i ? [{ gap: true }] : []), ...g.tabs.map((t) => ({ id: t, label: tabLabel(t), count: counts[t] }))]);

  const ctx = {
    profile, region, show, status: data.status, loading, reload: data.reload, notify, goToSource, newRef, canEditTab,
    canSeeBills: financeTabAllowed(profile, FINANCE_TAB_KEYS["vat bills"]),
    fy, fyActive, fyRange, dateRange, periodActive, asOfDate, ratesVersion, dateMode,
    expenses, regionExpenses, purchases, regionPurchases, vatBills, regionVatBills, entries, regionEntries, bankTxns, regionBankTxns,
    invoices, regionInvoices, payroll, regionPayroll, orders, regionOrders, orderCosts: data.orderCosts, accounts, employees,
    inventoryItems, labourRate: data.labourRate, allExpenses: data.expenses, allPurchases: data.purchases,
    bankNames, cashBank, dayBook, ledger, ledgerAsOf, pl, bs, summary,
    openTab: setActiveTab,
  };

  const View = VIEWS[tab];
  const sub = describePeriod({ fy, range: dateRange, mode: dateMode });

  if (visibleTabs.length === 0) {
    return (
      <BentoPage className="fn-page">
        <header className="kb-head"><div className="kb-head-l"><h1>Finance</h1></div></header>
        <div className="kb-error" role="status"><p>Your position doesn't open any part of Finance.</p></div>
      </BentoPage>
    );
  }

  return (
    <FinanceProvider value={ctx}>
      <BentoPage className="fn-page">
        <header className="kb-head">
          <div className="kb-head-l">
            <h1>Finance</h1>
            <p className="kb-head-sub"><span>{sub}</span></p>
          </div>
          <div className="kb-head-r fn-head-r">
            <RegionSwitch untagged={countUntagged([...data.expenses, ...data.purchases, ...data.entries])} size="sm" />
            <DateModeSwitch />
            <PeriodBar years={yearsHere} />
          </div>
        </header>

        {notice && (
          <div className={`fn-banner fn-banner--${notice.tone}`} role={notice.tone === "bad" ? "alert" : "status"}>
            <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><Icons.X size={14} sw={2} aria-hidden="true" /></button>
          </div>
        )}
        {data.status === "ready" && data.failed.length > 0 && (
          <div className="fn-banner fn-banner--warn" role="status">
            <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
            <span>Could not load {data.failed.map((c) => LOST_NAMES[c] || c).join(", ")}, so some figures may be missing or out of date.</span>
          </div>
        )}

        {data.status === "error" ? (
          <div className="kb-error" role="alert">
            <p>Finance could not load. Check your connection and try again.</p>
            <button type="button" className="kb-btn kb-btn--ghost" onClick={data.reload}>Try again</button>
          </div>
        ) : (
          <BentoGrid layout="finance">
            <TabRail groups={groups} value={tab} onChange={setActiveTab} counts={counts} anchor={narrow ? undefined : "finance-tabs"} />
            <FinanceTiles
              loading={loading} summary={summary} pl={pl} exp={exp} purchaseCount={purchases.length} fy={fy} fyActive={fyActive} periodActive={periodActive}
              onTab={setActiveTab} onPayroll={() => goToSource("/employees?tab=payroll", { tab: "payroll" })}
            />
            <div className="fn-tabs" style={{ gridArea: "tabs" }} data-tour={narrow ? "finance-tabs" : undefined}>
              <PageTabs label="Finance sections" tabs={tabsForSelect} value={tab} onChange={setActiveTab} />
            </div>
            {View ? <View /> : <Soon tab={tab} />}
          </BentoGrid>
        )}
      </BentoPage>
    </FinanceProvider>
  );
}

/**
 * Finance: every sum the Finance page shows, in one place and free of React.
 *
 * These are the old page's calculations, moved here unchanged so the tiles, the ledger, the P&L and
 * the balance sheet can be checked against the numbers people already trust (see DESIGN.md, "The
 * Finance page"). Two things changed on purpose, both marked below:
 *   - `summarise` and `profitAndLoss` take `periodActive` (a fiscal year OR a From/To range is chosen)
 *     where the old page only looked at the fiscal year. With only a range chosen, the old payroll
 *     figure picked one month out of the range instead of adding the range up.
 *   - the rest is the same maths over the same lists.
 *
 * Every function here is handed the lists it needs. The page narrows them (region, fiscal year,
 * From/To) before calling, exactly as before: the `region*` lists reach across years (the ledger's
 * brought-forward balances, the balance sheet's position at a year end), the others are the period.
 */
import { toNPR } from "../utils/currency";
import { tsMillis } from "../utils/date";
import { isoDay } from "../utils/fiscalYear";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const isBankCredit = (t) => String(t?.type || "").toLowerCase() === "credit";

/* ── Starting data the page has always seeded ─────────────────────── */

export const SEED_PURCHASES = [
  { expenseId: "EXP001", expenseItem: "Office supplies stationary", category: "Office Supplies", vatBill: true, amountNPR: 5290 },
  { expenseId: "EXP002", expenseItem: "Mobile phones", category: "Equipment / IT", vatBill: true, amountNPR: 45000 },
  { expenseId: "EXP003", expenseItem: "Factory Essentials", category: "Consumables", vatBill: true, amountNPR: 11803 },
  { expenseId: "EXP004", expenseItem: "Fabric Ribs", category: "Raw Materials", vatBill: true, amountNPR: 3106 },
  { expenseId: "EXP005", expenseItem: "Chinese Terry Fabric", category: "Raw Materials", vatBill: true, amountNPR: 27138 },
  { expenseId: "EXP006", expenseItem: "Keyboard, mouse, mousepad", category: "Equipment / IT", vatBill: true, amountNPR: 7500 },
  { expenseId: "EXP007", expenseItem: "Calculator", category: "Office Supplies", vatBill: true, amountNPR: 1310 },
  { expenseId: "EXP008", expenseItem: "Steel glass Rack", category: "Furniture & Fixtures", vatBill: true, amountNPR: 17515 },
  { expenseId: "EXP009", expenseItem: "CCTV Installation", category: "Setup / Security", vatBill: true, amountNPR: 24500 },
  { expenseId: "EXP010", expenseItem: "Wifi Installation", category: "Setup / IT", vatBill: true, amountNPR: 5565 },
  { expenseId: "EXP011", expenseItem: "Monitor", category: "Equipment / IT", vatBill: true, amountNPR: 12500 },
  { expenseId: "EXP012", expenseItem: "Table office, Chair", category: "Furniture & Fixtures", vatBill: false, amountNPR: 23000 },
  { expenseId: "EXP013", expenseItem: "Curtain", category: "Furniture & Fixtures", vatBill: true, amountNPR: 19600 },
  { expenseId: "EXP014", expenseItem: "Tip-Top Sweets for opening", category: "Miscellaneous / Events", vatBill: true, amountNPR: 10425 },
  { expenseId: "EXP015", expenseItem: "Water dispenser", category: "Equipment", vatBill: true, amountNPR: 6500 },
  { expenseId: "EXP016", expenseItem: "Water Jar", category: "Office Supplies", vatBill: false, amountNPR: 600 },
  { expenseId: "EXP017", expenseItem: "Mug, water Sweeper", category: "Office Supplies", vatBill: true, amountNPR: 3500 },
  { expenseId: "EXP018", expenseItem: "Rack", category: "Furniture & Fixtures", vatBill: false, amountNPR: 12000 },
  { expenseId: "EXP019", expenseItem: "Temple", category: "Miscellaneous", vatBill: null, amountNPR: 2600 },
  { expenseId: "EXP020", expenseItem: "Wiring", category: "Setup / Maintenance", vatBill: true, amountNPR: 51000 },
  { expenseId: "EXP021", expenseItem: "God Statue", category: "Miscellaneous", vatBill: false, amountNPR: 1500 },
  { expenseId: "EXP022", expenseItem: "Room Rent", category: "Rent / Lease", vatBill: false, amountNPR: 70000 },
  { expenseId: "EXP023", expenseItem: "Lawyer", category: "Professional Fees", vatBill: false, amountNPR: 33000 },
  { expenseId: "EXP024", expenseItem: "Jhapali Store", category: "Miscellaneous", vatBill: false, amountNPR: 500 },
  { expenseId: "EXP025", expenseItem: "Sewing Machine", category: "Machinery / Assets", vatBill: true, amountNPR: 945500 },
];

export const EXPENSE_CATEGORIES = [
  "Utilities", "Rent / Lease", "Salaries", "Office Supplies",
  "Transport", "Meals & Entertainment", "Marketing", "Professional Fees",
  "Equipment", "Maintenance & Repairs", "Raw Materials", "Consumables",
  "Software & Subscriptions", "Miscellaneous", "Other",
];

// Cash and the bank accounts carry an opening balance because their Ledger view is a running
// Dr/Cr/Balance table seeded from it (see cashBankLedger).
export const DEFAULT_ACCOUNTS = [
  { name: "Cash", type: "Asset", openingBalanceNPR: 20000 },
  { name: "Bank Account", type: "Asset" },
  { name: "Nabil Bank", type: "Asset", openingBalanceNPR: 251000 },
  { name: "Sanima Bank", type: "Asset", openingBalanceNPR: 0 },
  { name: "Fonepay", type: "Asset" },
  { name: "Accounts Receivable", type: "Asset" },
  { name: "Advance Payable", type: "Asset" },
  { name: "Inventory", type: "Asset" },
  { name: "Equipment & Machinery", type: "Asset" },
  { name: "Accounts Payable", type: "Liability" },
  { name: "Advance Received", type: "Liability" },
  { name: "Salaries Payable", type: "Liability" },
  { name: "VAT Payable", type: "Liability" },
  { name: "Owner's Equity", type: "Equity" },
  { name: "Retained Earnings", type: "Equity" },
  { name: "Sales Revenue", type: "Income" },
  { name: "Service Revenue", type: "Income" },
  { name: "Other Income", type: "Income" },
  { name: "Salaries Expense", type: "Expense" },
  { name: "Rent Expense", type: "Expense" },
  { name: "Utilities Expense", type: "Expense" },
  { name: "Raw Materials Expense", type: "Expense" },
  { name: "Office Supplies Expense", type: "Expense" },
  { name: "Marketing Expense", type: "Expense" },
  { name: "Depreciation Expense", type: "Expense" },
  { name: "Miscellaneous Expense", type: "Expense" },
];

// Advance Received / Payable are sub-ledgered by customer or supplier, not just a lump balance, so
// posting against either one (on either side of the entry) asks who the advance belongs to.
const ADVANCE_ACCOUNTS = new Set(["Advance Received", "Advance Payable"]);
export const isAdvanceEntry = (f) => ADVANCE_ACCOUNTS.has(f.debitAccount) || ADVANCE_ACCOUNTS.has(f.creditAccount);

/* ── Tabs ─────────────────────────────────────────────────────────── */

export const TABS = ["expenses", "purchases", "vat bills", "journal", "day book", "ledger", "p&l", "balance sheet", "bank", "order p&l"];

export function tabLabel(t) {
  if (t === "vat bills") return "VAT bills";
  if (t === "p&l") return "Profit & loss";
  if (t === "balance sheet") return "Balance sheet";
  if (t === "order p&l") return "Order P&L";
  if (t === "day book") return "Day book";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Shift+letter tab switching: letters chosen to stay memorable while avoiding collisions between tabs that share
// a first letter (Purchases / P&L, Bank / Balance Sheet).
export const TAB_SHORTCUTS = {
  e: "expenses", p: "purchases", v: "vat bills", j: "journal", d: "day book",
  g: "ledger", l: "p&l", s: "balance sheet", k: "bank", o: "order p&l",
};
export const shortcutOf = (tab) => Object.keys(TAB_SHORTCUTS).find((k) => TAB_SHORTCUTS[k] === tab) || "";

/* ── Journal totals ───────────────────────────────────────────────── */

// Dr/Cr totals per account over a list of journal entries. The ledger's "Other accounts" and the
// balance sheet both read this, over different lists.
export function journalTotals(list) {
  const map = {};
  for (const entry of list) {
    [entry.debitAccount, entry.creditAccount].forEach((acc) => {
      if (!map[acc]) map[acc] = { debits: 0, credits: 0, entryCount: 0 };
    });
    map[entry.debitAccount].debits += Number(entry.amountNPR || 0);
    map[entry.debitAccount].entryCount++;
    map[entry.creditAccount].credits += Number(entry.amountNPR || 0);
    map[entry.creditAccount].entryCount++;
  }
  return map;
}

/* ── The four figures at the top ──────────────────────────────────── */

const sumOf = (rows, pick) => rows.reduce((s, r) => s + pick(r), 0);
const payrollPay = (r) => Number(r.grossNPR || r.netNPR || 0);

/**
 * Payroll, expenses and purchases for the tiles.
 *
 * With nothing chosen the payroll figure is this calendar month's; payroll tends to be entered after the
 * fact (a March run logged in September), so when this month is empty it falls back to whichever month has
 * the most recent rows, and says which. With a fiscal year or a From/To range chosen, `payroll` is already
 * that period's rows and the figure is all of them.
 */
export function summarise({ payroll, expenses, purchases, periodActive, now = new Date() }) {
  const curMonth = MONTHS[now.getMonth()];
  const curYear = now.getFullYear();
  let payrollRows = payroll.filter((r) => r.month === curMonth && Number(r.year) === curYear);
  // The month the tile's figure is for, by name ("October 2026"), never "this month": a payroll record is kept by the A.D. month it
  // names and counted in the period its first day falls in, so "this month" would be one thing here and another to the period menu.
  let payrollMonthLabel = payrollRows.length > 0 ? `${curMonth} ${curYear}` : null;
  if (!periodActive && payrollRows.length === 0 && payroll.length > 0) {
    const latest = payroll.reduce((best, r) => {
      const y = Number(r.year);
      const mi = MONTHS.indexOf(r.month);
      if (!y || mi < 0) return best;
      return (!best || y > best.y || (y === best.y && mi > best.mi)) ? { y, mi, month: r.month } : best;
    }, null);
    if (latest) {
      payrollRows = payroll.filter((r) => r.month === latest.month && Number(r.year) === latest.y);
      payrollMonthLabel = `${latest.month} ${latest.y}`;
    }
  }
  const payrollNPR = sumOf(periodActive ? payroll : payrollRows, payrollPay);
  const expensesNPR = sumOf(expenses, (r) => Number(r.amountNPR || 0));
  const purchNPR = sumOf(purchases, (r) => Number(r.amountNPR || 0));
  return {
    payrollNPR, expensesNPR, purchNPR, totalNPR: payrollNPR + expensesNPR + purchNPR, payrollMonthLabel,
    payrollMonthsLabel: periodActive ? monthsCovered(payroll) : payrollMonthLabel,
  };
}

/** The months some payroll records are for, briefly: "Nov 2026", "Oct, Nov 2026", "Dec 2025, Jan 2026", or "5 months". Empty when there are none. */
export function monthsCovered(rows) {
  const keys = [...new Set(rows.map((r) => ({ y: Number(r.year) || 0, m: MONTHS.indexOf(r.month) })).filter((k) => k.y && k.m >= 0).map((k) => k.y * 12 + k.m))].sort((a, b) => a - b);
  const name = (k) => MONTHS[k % 12].slice(0, 3);
  if (keys.length === 0) return "";
  if (keys.length === 1) return `${name(keys[0])} ${Math.floor(keys[0] / 12)}`;
  if (keys.length === 2) {
    const [a, b] = keys;
    return Math.floor(a / 12) === Math.floor(b / 12) ? `${name(a)}, ${name(b)} ${Math.floor(b / 12)}` : `${name(a)} ${Math.floor(a / 12)}, ${name(b)} ${Math.floor(b / 12)}`;
  }
  return `${keys.length} months`;
}

/** What the Expenses tile adds under its figure: how many entries, and how many are still unpaid. */
export function expenseStats(expenses) {
  const unpaid = expenses.filter((x) => x.status !== "Paid");
  return {
    count: expenses.length,
    unpaidCount: unpaid.length,
    unpaidNPR: sumOf(unpaid, (r) => Number(r.amountNPR || 0)),
  };
}

/* ── Banks, the cash and bank ledger, the day book ────────────────── */

// The built-in banks plus any bank name typed into the "Other" field on a purchase, invoice, expense or
// bank transaction, so a custom bank never silently drops off the ledger. Read from every year so the same
// banks are listed whichever year is picked.
export function bankAccountNamesFrom({ builtIn, purchases, invoices, expenses, bankTxns }) {
  const set = new Set(builtIn);
  purchases.forEach((p) => { if (p.paymentType === "Bank" && p.bankName) set.add(p.bankName); });
  invoices.forEach((i) => { if (i.paymentType === "Bank" && i.bankName) set.add(i.bankName); });
  expenses.forEach((x) => { if (x.paymentType === "Bank" && x.bankName) set.add(x.bankName); });
  bankTxns.forEach((t) => { if (t.accountName) set.add(t.accountName); });
  return [...builtIn, ...[...set].filter((n) => !builtIn.includes(n)).sort()];
}

// A bank statement line arrives with the text in `remarks` and often nothing in `description`.
export const bankText = (t) => t.description || cleanRemark(t.remarks) || "";
function cleanRemark(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

/**
 * The running Cash / bank ledger, in the format of the accountant's notebook (Particulars / Dr / Cr / Balance).
 * Rows are derived on the fly from purchases, paid or part-paid invoices, paid expenses, bank transactions and
 * journal entries: nothing is written back, so there is no separate ledger to keep in step.
 *
 * Built from every year's rows, then cut to the chosen year: what happened before the year folds into a
 * brought-forward opening balance (the account's own opening plus all earlier movement), the year's rows
 * follow, and later rows are left out, so the closing balance is the account's balance at that year's end and
 * carries straight into the next year's opening.
 */
export function cashBankLedger({ purchases, invoices, expenses, bankTxns, entries, accounts, bankNames, fyRange }) {
  const CASH = "Cash";
  const ACCOUNTS = [CASH, ...bankNames];
  const rowsFor = Object.fromEntries(ACCOUNTS.map((name) => [name, []]));

  purchases.forEach((p) => {
    // Anything not explicitly "Bank" or "Credit" is Cash: a row from before the field existed (paymentType null)
    // is cash, as a paid invoice with no payment type already was. A Credit purchase moves to Accounts Payable.
    const acct = p.paymentType === "Bank" ? (p.bankName || "Nabil Bank") : p.paymentType === "Credit" ? null : CASH;
    if (!acct || !rowsFor[acct]) return;
    rowsFor[acct].push({
      date: p.date || "", sortKey: tsMillis(p.createdAt),
      particulars: `Purchase — ${p.expenseItem || p.expenseId}`, dr: 0, cr: Number(p.amountNPR || 0),
      sourceType: "purchase", sourceId: p.id, searchKey: p.expenseId,
    });
  });

  // Paid AND part-paid invoices both carry real receipts. amountPaid (a trigger's running total of the
  // invoice's own payment rows) is what arrived, so it is used for both rather than totalNPR.
  invoices.filter((i) => i.status === "Paid" || i.status === "Partial").forEach((i) => {
    const amt = toNPR(Number(i.amountPaid || 0), i.currency);
    const acct = i.paymentType === "Bank" ? (i.bankName || "Nabil Bank") : i.paymentType === "Credit" ? null : CASH;
    if (!acct) return;
    rowsFor[acct].push({
      date: i.date || "", sortKey: tsMillis(i.createdAt),
      particulars: `Sales — ${i.clientName || i.invoiceNumber || ""}`, dr: amt, cr: 0,
      sourceType: "invoice", sourceId: null, searchKey: i.invoiceNumber || i.clientName, docId: i.id,
    });
  });

  // Only a PAID expense is a real cash or bank movement.
  expenses.filter((x) => x.status === "Paid").forEach((x) => {
    const acct = x.paymentType === "Bank" ? (x.bankName || "Nabil Bank") : x.paymentType === "Credit" ? null : CASH;
    if (!acct || !rowsFor[acct]) return;
    rowsFor[acct].push({
      date: x.date || "", sortKey: tsMillis(x.createdAt),
      particulars: `Expense — ${x.category || ""}${x.note ? ": " + x.note : ""}`, dr: 0, cr: Number(x.amountNPR || 0),
      sourceType: "expense", sourceId: x.id, searchKey: null,
    });
  });

  bankTxns.forEach((t) => {
    const acct = t.accountName || "Nabil Bank";   // transactions logged before multi-bank support default to Nabil
    if (!rowsFor[acct]) return;
    const amt = Number(t.amount ?? t.amountNPR ?? 0);
    rowsFor[acct].push({
      date: t.date || "", sortKey: tsMillis(t.createdAt),
      particulars: bankText(t) || "Bank transaction",
      dr: isBankCredit(t) ? amt : 0, cr: isBankCredit(t) ? 0 : amt,
      sourceType: "bank", sourceId: t.id,
    });
  });

  entries.forEach((e) => {
    const amt = Number(e.amountNPR || 0);
    if (rowsFor[e.debitAccount]) {
      rowsFor[e.debitAccount].push({ date: e.date || "", sortKey: tsMillis(e.createdAt), particulars: e.description || "Journal entry", dr: amt, cr: 0, sourceType: "journal", sourceId: e.id });
    }
    if (rowsFor[e.creditAccount]) {
      rowsFor[e.creditAccount].push({ date: e.date || "", sortKey: tsMillis(e.createdAt), particulars: e.description || "Journal entry", dr: 0, cr: amt, sourceType: "journal", sourceId: e.id });
    }
  });

  const result = {};
  for (const name of ACCOUNTS) {
    const accountRow = accounts.find((a) => a.name === name);
    const accountId = accountRow?.id || null;
    const baseOpening = Number(accountRow?.openingBalanceNPR) || 0;
    const openingBalanceDate = accountRow?.openingBalanceDate || null;
    const sorted = rowsFor[name].sort((a, b) => a.date.localeCompare(b.date) || a.sortKey - b.sortKey);
    let opening = baseOpening;
    let shown = sorted;
    if (fyRange) {
      shown = [];
      for (const r of sorted) {
        const day = isoDay(r.date);
        if (!day) continue;                                  // undated: belongs to no year
        if (day < fyRange.startAD) opening += r.dr - r.cr;   // earlier years: brought forward
        else if (day <= fyRange.endAD) shown.push(r);        // this year: listed
      }
    }
    let balance = opening;
    const rows = shown.map((r) => {
      balance += r.dr - r.cr;
      return { ...r, balance };
    });
    result[name] = { accountId, openingBalanceNPR: opening, baseOpeningNPR: baseOpening, openingBalanceDate, rows, closingBalance: balance, totalRows: sorted.length };
  }
  return result;
}

/**
 * Every purchase, paid or part-paid sale, paid expense, bank transaction and journal entry in one
 * chronological list: the day book (the book of original entry) records each day's transactions as they
 * happen, before they are posted into the per-account ledger. Same sources as the ledger, but every
 * account and merged by date. The lists given are already the period's.
 */
export function dayBookRows({ purchases, invoices, expenses, bankTxns, entries }) {
  const rows = [];

  purchases.forEach((p) => {
    const acct = p.paymentType === "Bank" ? (p.bankName || "Nabil Bank") : p.paymentType === "Credit" ? null : "Cash";
    if (!acct) return;       // credit purchases move to Accounts Payable: no cash or bank movement yet
    rows.push({
      date: p.date || "", sortKey: tsMillis(p.createdAt), account: acct,
      particulars: `Purchase — ${p.expenseItem || p.expenseId}`, dr: 0, cr: Number(p.amountNPR || 0),
      sourceType: "purchase", searchKey: p.expenseId,
    });
  });

  invoices.filter((i) => i.status === "Paid" || i.status === "Partial").forEach((i) => {
    const amt = toNPR(Number(i.amountPaid || 0), i.currency);
    const acct = i.paymentType === "Bank" ? (i.bankName || "Nabil Bank") : i.paymentType === "Credit" ? null : "Cash";
    if (!acct) return;
    rows.push({
      date: i.date || "", sortKey: tsMillis(i.createdAt), account: acct,
      particulars: `Sales — ${i.clientName || i.invoiceNumber || ""}`, dr: amt, cr: 0,
      sourceType: "invoice", searchKey: i.invoiceNumber || i.clientName, docId: i.id,
    });
  });

  expenses.filter((x) => x.status === "Paid").forEach((x) => {
    const acct = x.paymentType === "Bank" ? (x.bankName || "Nabil Bank") : x.paymentType === "Credit" ? null : "Cash";
    if (!acct) return;
    rows.push({
      date: x.date || "", sortKey: tsMillis(x.createdAt), account: acct,
      particulars: `Expense — ${x.category || ""}${x.note ? ": " + x.note : ""}`, dr: 0, cr: Number(x.amountNPR || 0),
      sourceType: "expense", searchKey: null,
    });
  });

  bankTxns.forEach((t) => {
    const amt = Number(t.amount ?? t.amountNPR ?? 0);
    rows.push({
      date: t.date || "", sortKey: tsMillis(t.createdAt), account: t.accountName || "Nabil Bank",
      particulars: bankText(t) || "Bank transaction",
      dr: isBankCredit(t) ? amt : 0, cr: isBankCredit(t) ? 0 : amt,
      sourceType: "bank",
    });
  });

  entries.forEach((e) => {
    const amt = Number(e.amountNPR || 0);
    const particulars = e.description || "Journal entry";
    rows.push({ date: e.date || "", sortKey: tsMillis(e.createdAt), account: e.debitAccount, particulars, dr: amt, cr: 0, sourceType: "journal" });
    rows.push({ date: e.date || "", sortKey: tsMillis(e.createdAt), account: e.creditAccount, particulars, dr: 0, cr: amt, sourceType: "journal" });
  });

  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.sortKey - b.sortKey);
}

/* ── Profit and loss, balance sheet ───────────────────────────────── */

/**
 * Income against everything spent. Income is paid invoices (totalNPR, VAT included, as the Dashboard and
 * Billing count it, converted to NPR) plus journal entries credited to an Income account.
 *
 * Payroll: with nothing chosen it is the current calendar year only (the P&L's long-standing rule); with a
 * fiscal year or a From/To range chosen, `payroll` is already that period's rows and all of it counts.
 */
export function profitAndLoss({ entries, accounts, expenses, purchases, payroll, invoices, periodActive, now = new Date() }) {
  const salesRevenue = invoices
    .filter((i) => i.status === "Paid")
    .reduce((s, i) => s + toNPR(Number(i.totalNPR || 0), i.currency), 0);
  const otherIncome = entries.filter((e) => accounts.find((a) => a.name === e.creditAccount && a.type === "Income")).reduce((s, e) => s + Number(e.amountNPR || 0), 0);
  const totalIncome = salesRevenue + otherIncome;
  const expensesTotal = sumOf(expenses, (r) => Number(r.amountNPR || 0));
  const purchasesTotal = sumOf(purchases, (r) => Number(r.amountNPR || 0));
  const curYear = now.getFullYear();
  const payrollTotal = payroll
    .filter((r) => periodActive || Number(r.year) === curYear)
    .reduce((s, r) => s + payrollPay(r), 0);
  const journalExpenses = entries.filter((e) => accounts.find((a) => a.name === e.debitAccount && a.type === "Expense")).reduce((s, e) => s + Number(e.amountNPR || 0), 0);
  const totalExpenses = expensesTotal + purchasesTotal + payrollTotal + journalExpenses;
  return { salesRevenue, otherIncome, totalIncome, expensesTotal, purchasesTotal, payrollTotal, journalExpenses, totalExpenses, netProfit: totalIncome - totalExpenses };
}

/**
 * The balance sheet is a position, not a period: with a year picked it is every entry dated up to that year's
 * END. A custom range works the same way: only its To date acts as an "as of" cutoff (its From side means
 * nothing for a snapshot); with both a fiscal year and a range set, the earlier of the two cutoffs wins.
 */
export function asOfDateOf(fyRange, dateRange) {
  const bounds = [fyRange?.endAD, dateRange?.to || null].filter(Boolean);
  return bounds.length ? bounds.reduce((a, b) => (a < b ? a : b)) : null;
}

export function balanceSheet({ accounts, ledgerAsOf }) {
  const balance = (name, type) => {
    const d = ledgerAsOf[name] || { debits: 0, credits: 0 };
    return type === "Asset" ? d.debits - d.credits : d.credits - d.debits;
  };
  const assets = accounts.filter((a) => a.type === "Asset").map((a) => ({ ...a, balance: balance(a.name, "Asset") }));
  const liabilities = accounts.filter((a) => a.type === "Liability").map((a) => ({ ...a, balance: balance(a.name, "Liability") }));
  const equity = accounts.filter((a) => a.type === "Equity").map((a) => ({ ...a, balance: balance(a.name, "Equity") }));
  return {
    assets, liabilities, equity,
    totalAssets: sumOf(assets, (a) => a.balance),
    totalLiabilities: sumOf(liabilities, (a) => a.balance),
    totalEquity: sumOf(equity, (a) => a.balance),
  };
}

/** Does Liabilities + Equity equal Assets? Money has paisa, floats drift: compare to half a paisa, not with ===. */
export const balances = (bs) => Math.abs(bs.totalLiabilities + bs.totalEquity - bs.totalAssets) < 0.005;

/* ── What the charts and rails summarise ──────────────────────────── */

/** Purchases by category, biggest first, the top eight. */
export function purchaseCategories(purchases, limit = 8) {
  const map = {};
  purchases.forEach((p) => { const cat = p.category || "Other"; map[cat] = (map[cat] || 0) + Number(p.amountNPR || 0); });
  return Object.entries(map).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total).slice(0, limit);
}

/* ── Order profit and loss ────────────────────────────────────────── */

/**
 * One row per order: revenue against the costs entered for it. Labour is the manual figure when there is one,
 * otherwise the auto rate (last month's payroll over last month's pieces passed) times the order's pieces.
 */
export function orderPnlRows(orders, orderCosts, labourRate) {
  return orders.map((o) => {
    const costKey = o.orderId || o.id;
    const costs = orderCosts[costKey] || {};
    const revenue = Number(o.totalValueNPR || 0);
    const mat = Number(costs.material || 0);
    const hasManualLabour = costs.labour != null && costs.labour !== "";
    const autoLab = (!hasManualLabour && labourRate) ? Math.round(labourRate * Number(o.quantity || 0)) : 0;
    const lab = hasManualLabour ? Number(costs.labour) : autoLab;
    const labIsAuto = !hasManualLabour && autoLab > 0;
    const ovh = Number(costs.overhead || 0);
    const shp = Number(costs.shipping || 0);
    const totalCost = mat + lab + ovh + shp;
    const profit = revenue - totalCost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : null;
    const hasCosts = mat + lab + ovh + shp > 0;
    return { ...o, costKey, revenue, mat, lab, labIsAuto, ovh, shp, totalCost, profit, margin, hasCosts, hasSheet: Boolean(orderCosts[costKey]) };
  });
}

const stateOf = (o) => (o.status || o.stage || "").toLowerCase();

/** The status filter: "active" is everything not completed or cancelled. */
export function orderStatusMatches(o, filter) {
  if (filter === "all") return true;
  const st = stateOf(o);
  if (filter === "active") return !(st === "completed" || st === "cancelled");
  if (filter === "completed") return st === "completed";
  return true;
}

/**
 * Totals across the rows shown. Cancelled orders are left out. Profit is only added up over the orders that have costs entered:
 * an order with none is worth its whole value and costs nothing, which is not a profit, so the old total (which counted it as one) is
 * no longer what is shown. `costed` says how many orders the profit is over.
 */
export function orderPnlTotals(rows) {
  const live = rows.filter((r) => stateOf(r) !== "cancelled");
  const costed = live.filter((r) => r.hasCosts);
  const withMargin = live.filter((r) => r.revenue > 0 && r.hasCosts);
  return {
    revenue: sumOf(live, (r) => r.revenue),
    cost: sumOf(live, (r) => r.totalCost),
    profit: costed.length ? sumOf(costed, (r) => r.profit) : null,
    costed: costed.length,
    avgMargin: withMargin.length ? withMargin.reduce((s, r) => s + r.margin, 0) / withMargin.length : null,
    withMargin: withMargin.length,
  };
}

/** Last month's payroll over last month's pieces passed: the auto labour rate, or null when either is missing. */
export function labourRatePerUnit({ payroll, employees, production, now = new Date() }) {
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // "YYYY-MM" from the local parts: toISOString() is UTC, which in Nepal (UTC+5:45) turns midnight of the 1st into the last day of the month before
  const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthName = MONTHS[lastMonth.getMonth()];
  const lastMonthYear = lastMonth.getFullYear();
  // Deliberately the unfiltered lists: the auto labour rate is a company-wide cost per unit, not a per-region one.
  const productionWorkers = new Set(employees.filter((e) => e.isProductionWorker).map((e) => (e.name || "").toLowerCase()));
  // Only production workers' payroll if any are tagged; otherwise all of it
  const lastMonthPayroll = payroll
    .filter((r) => r.month === lastMonthName && Number(r.year) === lastMonthYear)
    .filter((r) => productionWorkers.size === 0 || productionWorkers.has((r.staffName || "").toLowerCase()))
    .reduce((s, r) => s + Number(r.grossNPR || r.netNPR || 0), 0);
  const lastMonthUnits = production
    .filter((b) => (b.date || "").slice(0, 7) === lastMonthKey)
    .reduce((s, b) => s + Number(b.passed || 0), 0);
  return lastMonthPayroll > 0 && lastMonthUnits > 0 ? lastMonthPayroll / lastMonthUnits : null;
}

/* ── Payroll ──────────────────────────────────────────────────────── */

/** A payroll record's maths: gross is basic plus bonus, net is gross less the late cut and PF, never below nothing. */
export function calcPayroll(f) {
  const basic = Number(f.basicNPR || 0);
  const autoLate = Number(f.lateSalaryCutDeduction || 0);
  const adjustment = Number(f.lateAdjustmentNPR || 0);
  const late = Math.max(0, autoLate + adjustment);
  const pf = Number(f.pfDeductionNPR || 0);
  const bonus = Number(f.bonusNPR || 0);
  const gross = basic + bonus;
  const totalDeductions = late + pf;
  const rawNet = gross - totalDeductions;
  const net = Math.max(0, rawNet);
  return { gross, late, autoLate, adjustment, pf, totalDeductions, net, deductionsExceedGross: rawNet < 0 };
}

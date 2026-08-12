import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc as fsUpdateDoc,
  writeBatch
} from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import {
  Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";
import { useNavigate } from "react-router-dom";
import { fmt, Icons } from "../components/ui";
import { PurchaseRowGroup, emptyPurchaseForm, addLineItem, removeLineItem, applyItemChange, itemsTotal, purchaseSubtotal, purchaseVatAmount, purchaseGrandTotal, purchaseItemsPayload, focusNextOnEnter } from "../components/PurchaseRowGroup";
import KeyboardSelect from "../components/KeyboardSelect";
import { GBP_RATE, createdAfterCutoff } from "../constants";
import { db, storage } from "../firebase";
import { asCurrency, roundAmount } from "../utils/format";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { sectionCanEdit, financeTabAllowed, FINANCE_TAB_KEYS } from "../utils/permissions";
import { postPurchaseStockIn } from "../utils/stockLedger";

/* ── Seed data ─────────────────────────────────────── */
// NOT "__seeded__" — Firestore permanently rejects doc IDs matching "__*__" (reserved),
// so that name can never actually be written and the seed-once check never worked.
const SEED_MARKER_ID = "seed_marker";
const SEED_PURCHASES = [
  { expenseId: "EXP001", expenseItem: "Office supplies stationary",  category: "Office Supplies",       vatBill: true,  amountNPR: 5290   },
  { expenseId: "EXP002", expenseItem: "Mobile phones",                category: "Equipment / IT",        vatBill: true,  amountNPR: 45000  },
  { expenseId: "EXP003", expenseItem: "Factory Essentials",           category: "Consumables",           vatBill: true,  amountNPR: 11803  },
  { expenseId: "EXP004", expenseItem: "Fabric Ribs",                  category: "Raw Materials",         vatBill: true,  amountNPR: 3106   },
  { expenseId: "EXP005", expenseItem: "Chinese Terry Fabric",         category: "Raw Materials",         vatBill: true,  amountNPR: 27138  },
  { expenseId: "EXP006", expenseItem: "Keyboard, mouse, mousepad",    category: "Equipment / IT",        vatBill: true,  amountNPR: 7500   },
  { expenseId: "EXP007", expenseItem: "Calculator",                   category: "Office Supplies",       vatBill: true,  amountNPR: 1310   },
  { expenseId: "EXP008", expenseItem: "Steel glass Rack",             category: "Furniture & Fixtures",  vatBill: true,  amountNPR: 17515  },
  { expenseId: "EXP009", expenseItem: "CCTV Installation",            category: "Setup / Security",      vatBill: true,  amountNPR: 24500  },
  { expenseId: "EXP010", expenseItem: "Wifi Installation",            category: "Setup / IT",            vatBill: true,  amountNPR: 5565   },
  { expenseId: "EXP011", expenseItem: "Monitor",                      category: "Equipment / IT",        vatBill: true,  amountNPR: 12500  },
  { expenseId: "EXP012", expenseItem: "Table office, Chair",          category: "Furniture & Fixtures",  vatBill: false, amountNPR: 23000  },
  { expenseId: "EXP013", expenseItem: "Curtain",                      category: "Furniture & Fixtures",  vatBill: true,  amountNPR: 19600  },
  { expenseId: "EXP014", expenseItem: "Tip-Top Sweets for opening",   category: "Miscellaneous / Events",vatBill: true,  amountNPR: 10425  },
  { expenseId: "EXP015", expenseItem: "Water dispenser",              category: "Equipment",             vatBill: true,  amountNPR: 6500   },
  { expenseId: "EXP016", expenseItem: "Water Jar",                    category: "Office Supplies",       vatBill: false, amountNPR: 600    },
  { expenseId: "EXP017", expenseItem: "Mug, water Sweeper",           category: "Office Supplies",       vatBill: true,  amountNPR: 3500   },
  { expenseId: "EXP018", expenseItem: "Rack",                         category: "Furniture & Fixtures",  vatBill: false, amountNPR: 12000  },
  { expenseId: "EXP019", expenseItem: "Temple",                       category: "Miscellaneous",         vatBill: null,  amountNPR: 2600   },
  { expenseId: "EXP020", expenseItem: "Wiring",                       category: "Setup / Maintenance",   vatBill: true,  amountNPR: 51000  },
  { expenseId: "EXP021", expenseItem: "God Statue",                   category: "Miscellaneous",         vatBill: false, amountNPR: 1500   },
  { expenseId: "EXP022", expenseItem: "Room Rent",                    category: "Rent / Lease",          vatBill: false, amountNPR: 70000  },
  { expenseId: "EXP023", expenseItem: "Lawyer",                       category: "Professional Fees",     vatBill: false, amountNPR: 33000  },
  { expenseId: "EXP024", expenseItem: "Jhapali Store",                category: "Miscellaneous",         vatBill: false, amountNPR: 500    },
  { expenseId: "EXP025", expenseItem: "Sewing Machine",               category: "Machinery / Assets",    vatBill: true,  amountNPR: 945500 },
];

const EXPENSE_CATEGORIES = [
  "Utilities", "Rent / Lease", "Salaries", "Office Supplies",
  "Transport", "Meals & Entertainment", "Marketing", "Professional Fees",
  "Equipment", "Maintenance & Repairs", "Raw Materials", "Consumables",
  "Software & Subscriptions", "Miscellaneous", "Other"
];

// Cash and Nabil Bank carry an opening balance because their Ledger-tab
// view is a running Dr/Cr/Balance table seeded from it — see cashBankLedger.
const DEFAULT_ACCOUNTS = [
  { name: "Cash", type: "Asset", openingBalanceNPR: 20000 },
  { name: "Bank Account", type: "Asset" },
  { name: "Nabil Bank", type: "Asset", openingBalanceNPR: 251000 },
  { name: "Fonepay", type: "Asset" },
  { name: "Accounts Receivable", type: "Asset" },
  { name: "Inventory", type: "Asset" },
  { name: "Equipment & Machinery", type: "Asset" },
  { name: "Accounts Payable", type: "Liability" },
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

const initialExpense = {
  category: "Utilities", amountNPR: "",
  date: new Date().toISOString().slice(0, 10), note: "", vatBill: false
};

const emptyJournalForm = {
  date: new Date().toISOString().slice(0, 10),
  description: "", debitAccount: "Cash", creditAccount: "Sales Revenue",
  amountNPR: "", reference: ""
};

const fmtShort = v => v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);

function tabLabel(t) {
  if (t === "vat bills")     return "VAT Bills";
  if (t === "p&l")           return "P & L";
  if (t === "balance sheet") return "Balance Sheet";
  if (t === "order p&l")     return "Order P&L";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const TABS = ["expenses", "purchases", "vat bills", "journal", "ledger", "p&l", "balance sheet", "bank", "order p&l"];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function Finance() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { fmt: fmtC } = useCurrency();
  // Restored synchronously (not in an effect) so the page doesn't flash "expenses"
  // before jumping to the tab she was on when she clicked out to Purchases/Billing.
  const [activeTab, setActiveTab] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("financeReturnState"))?.tab || "expenses"; }
    catch { return "expenses"; }
  });

  const visibleTabs = TABS.filter(t => financeTabAllowed(profile, FINANCE_TAB_KEYS[t]));
  const canEditTab  = (tabLabel) => sectionCanEdit(profile, "finance") && financeTabAllowed(profile, FINANCE_TAB_KEYS[tabLabel]);
  const canEdit     = canEditTab(activeTab);

  /* ── Fix 3: page-level error banner (auto-clears after 5s) ── */
  const [pageError, setPageError] = useState("");
  const errorBannerRef = useRef(null);
  function showError(msg) {
    setPageError(msg);
    setTimeout(() => setPageError(""), 5000);
  }
  useEffect(() => {
    if (pageError) errorBannerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [pageError]);

  /* ── State ── */
  const [payroll, setPayroll]         = useState([]);
  const [employees, setEmployees]     = useState([]);
  const [expenses, setExpenses]       = useState([]);
  const [expenseForm, setExpenseForm] = useState(initialExpense);
  const [purchases, setPurchases]     = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]); // for auto-posting stock-in on purchase save
  const allPurchaseIdsRef = useRef([]); // unfiltered expenseIds (incl. historical, hidden-by-cutoff rows) — nextExpenseId() must never collide with these
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchaseForm);
  const [purchaseError, setPurchaseError] = useState("");     // inline error shown at the new-purchase row
  const [purchaseSuccess, setPurchaseSuccess] = useState(""); // "EXP027 saved" confirmation by the table title
  const [submitting, setSubmitting]   = useState(false);
  const [vatBills, setVatBills]       = useState([]);
  const [vatFile, setVatFile]         = useState(null);
  const [vatExpenseId, setVatExpenseId] = useState("");
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploading, setUploading]     = useState(false);
  const fileInputRef                  = useRef(null);
  const [expenseVatFile, setExpenseVatFile] = useState(null);
  const [expenseVatProgress, setExpenseVatProgress] = useState(null);
  const expenseFileRef                = useRef(null);

  const journalFormRef = useRef(null);

  /* ── Accounting state ── */
  const [entries, setEntries]   = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [journalForm, setJournalForm] = useState(emptyJournalForm);
  const [journalSubmitting, setJournalSubmitting] = useState(false);
  const [journalEditId, setJournalEditId] = useState(null);
  const [journalDraft, setJournalDraft] = useState({});
  const [journalSaving, setJournalSaving] = useState(false);
  const [invoices, setInvoices] = useState([]);
  // In-place edit for a Cash/Bank ledger row sourced from a bank txn or journal entry —
  // purchase/invoice rows deep-link to their own full editor (Purchases/Billing) instead.
  const [ledgerDraft, setLedgerDraft] = useState(null); // { type: "bank"|"journal", id, particulars, amount }

  /* ── Bank transactions state ── */
  const [bankTxns, setBankTxns]       = useState([]);
  const [showBankForm, setShowBankForm] = useState(false);
  const [bankForm, setBankForm]       = useState({ date: "", description: "", amountNPR: "", type: "debit", category: "", reference: "" });

  /* ── Order P&L state ── */
  const [orders, setOrders]               = useState([]);
  const [orderCosts, setOrderCosts]       = useState({});   // keyed by orderId
  const [oplSelectedId, setOplSelectedId] = useState(null); // order open in panel
  const [oplCostForm, setOplCostForm]     = useState({ material: "", labour: "", overhead: "", shipping: "" });
  const [oplSaving, setOplSaving]         = useState(false);
  const [oplStatusFilter, setOplStatusFilter] = useState("all");
  const [labourRatePerUnit, setLabourRatePerUnit] = useState(null); // auto-calculated NPR/unit
  const [oplDateFrom, setOplDateFrom]     = useState("");
  const [oplDateTo, setOplDateTo]         = useState("");

  /* ── Load data ── */
  async function loadData() {
    const [payrollSnap, expensesSnap, purchasesSnap, vatBillsSnap, employeesSnap,
           entriesSnap, accountsSnap, invSnap, bankSnap, ordersSnap, costsSnap, productionSnap, inventorySnap] = await Promise.all([
      getDocs(collection(db, "finance_payroll")),
      getDocs(collection(db, "finance_expenses")),
      getDocs(collection(db, "finance_purchases")),
      getDocs(collection(db, "vat_bills")),
      getDocs(collection(db, "employees")),
      getDocs(collection(db, "journal_entries")),
      getDocs(collection(db, "accounts")),
      getDocs(collection(db, "invoices")),
      getDocs(collection(db, "bank_transactions")),
      getDocs(collection(db, "orders")),
      getDocs(collection(db, "order_costs")),
      getDocs(collection(db, "production")),
      getDocs(collection(db, "inventory")),
    ]);
    setInventoryItems(inventorySnap.docs.map(d => ({ id: d.id, ...d.data() })));

    setEmployees(employeesSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.status !== "Inactive"));
    setPayroll(payrollSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    const txns = bankSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    txns.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    setBankTxns(txns);

    const expRows = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    expRows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    setExpenses(expRows);

    let purRows = purchasesSnap.docs.filter(d => d.id !== SEED_MARKER_ID).map(d => ({ id: d.id, ...d.data() }));
    // Seed data is backfilled once, ever — the marker doc records that it already ran,
    // and only fires when the collection is genuinely empty, so deleting a seeded
    // purchase (e.g. EXP001) doesn't bring it back on next load.
    // (Marker ID must not match Firestore's reserved "__*__" pattern — that throws on write.)
    const alreadySeeded = purchasesSnap.docs.some(d => d.id === SEED_MARKER_ID);
    if (!alreadySeeded && purRows.length === 0) {
      const today = new Date().toISOString().slice(0, 10);
      const batch = writeBatch(db);
      SEED_PURCHASES.forEach(p => batch.set(doc(db, "finance_purchases", p.expenseId), { ...p, date: today, createdAt: serverTimestamp() }));
      batch.set(doc(db, "finance_purchases", SEED_MARKER_ID), { seededAt: serverTimestamp() });
      await batch.commit();
      const fresh = await getDocs(collection(db, "finance_purchases"));
      purRows = fresh.docs.filter(d => d.id !== SEED_MARKER_ID).map(d => ({ id: d.id, ...d.data() }));
    }
    const seen = new Map();
    const toDelete = [];
    for (const r of purRows) {
      const prev = seen.get(r.expenseId);
      if (!prev) { seen.set(r.expenseId, r); }
      else { const keepNew = r.id === r.expenseId; toDelete.push((keepNew ? prev : r).id); if (keepNew) seen.set(r.expenseId, r); }
    }
    if (toDelete.length > 0) {
      const cb = writeBatch(db);
      toDelete.forEach(id => cb.delete(doc(db, "finance_purchases", id)));
      await cb.commit();
      purRows = [...seen.values()];
    }
    purRows.sort((a, b) => (a.expenseId || "").localeCompare(b.expenseId || ""));
    allPurchaseIdsRef.current = purRows.map(r => r.expenseId).filter(Boolean);
    purRows = purRows.filter(r => createdAfterCutoff(r));
    setPurchases(purRows);

    const bills = vatBillsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    bills.sort((a, b) => (b.uploadedAt?.seconds || 0) - (a.uploadedAt?.seconds || 0));
    setVatBills(bills);
    if (!vatExpenseId && purRows.length > 0) setVatExpenseId(purRows[0].expenseId || "");

    const entryRows = entriesSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => createdAfterCutoff(r));
    entryRows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    setEntries(entryRows);

    let accs = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (accs.length === 0) {
      for (const acc of DEFAULT_ACCOUNTS) await addDoc(collection(db, "accounts"), { ...acc, createdAt: serverTimestamp() });
      const freshSnap = await getDocs(collection(db, "accounts"));
      accs = freshSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      // Sync any new accounts added to DEFAULT_ACCOUNTS (e.g. Fonepay)
      const existingNames = new Set(accs.map(a => a.name));
      const missing = DEFAULT_ACCOUNTS.filter(a => !existingNames.has(a.name));
      if (missing.length > 0) {
        for (const acc of missing) await addDoc(collection(db, "accounts"), { ...acc, createdAt: serverTimestamp() });
        const freshSnap = await getDocs(collection(db, "accounts"));
        accs = freshSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
      // Backfill openingBalanceNPR onto accounts seeded before that field existed.
      for (const def of DEFAULT_ACCOUNTS) {
        if (def.openingBalanceNPR == null) continue;
        const acc = accs.find(a => a.name === def.name);
        if (acc && acc.openingBalanceNPR == null) {
          await fsUpdateDoc(doc(db, "accounts", acc.id), { openingBalanceNPR: def.openingBalanceNPR });
          acc.openingBalanceNPR = def.openingBalanceNPR;
        }
      }
    }
    // One-time rename of an already-seeded "Laxmi Sunrise Bank" → "Nabil Bank",
    // carrying its opening balance and any bank_transactions across so nothing drops off the ledger.
    const oldBankAcc = accs.find(a => a.name === "Laxmi Sunrise Bank");
    if (oldBankAcc && !accs.find(a => a.name === "Nabil Bank")) {
      await fsUpdateDoc(doc(db, "accounts", oldBankAcc.id), { name: "Nabil Bank" });
      oldBankAcc.name = "Nabil Bank";
      const staleTxns = bankSnap.docs.filter(d => d.data().accountName === "Laxmi Sunrise Bank");
      for (const d of staleTxns) await fsUpdateDoc(doc(db, "bank_transactions", d.id), { accountName: "Nabil Bank" });
    }
    const seenAcc = new Set();
    accs = accs.filter(a => { if (seenAcc.has(a.name)) return false; seenAcc.add(a.name); return true; });
    accs.sort((a, b) => a.name.localeCompare(b.name));
    setAccounts(accs);

    setInvoices(invSnap.docs.map(d => d.data()));

    // Orders
    const orderRows = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    orderRows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setOrders(orderRows);

    // Order costs — keyed by orderId (doc ID = orderId)
    const costsMap = {};
    costsSnap.docs.forEach(d => { costsMap[d.id] = { id: d.id, ...d.data() }; });
    setOrderCosts(costsMap);

    // Auto labour rate: last month's payroll ÷ last month's units passed
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = lastMonth.toISOString().slice(0, 7); // "YYYY-MM"
    const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const lastMonthName = MONTH_NAMES[lastMonth.getMonth()];
    const lastMonthYear = lastMonth.getFullYear();

    const payrollData = payrollSnap.docs.map(d => d.data());
    const allEmployees = employeesSnap.docs.map(d => d.data());
    const productionWorkers = new Set(
      allEmployees.filter(e => e.isProductionWorker).map(e => (e.name || "").toLowerCase())
    );
    // Only use production workers' payroll if any are tagged; otherwise fall back to all
    const lastMonthPayroll = payrollData
      .filter(r => r.month === lastMonthName && Number(r.year) === lastMonthYear)
      .filter(r => productionWorkers.size === 0 || productionWorkers.has((r.staffName || "").toLowerCase()))
      .reduce((s, r) => s + Number(r.grossNPR || r.netNPR || 0), 0);

    const productionData = productionSnap.docs.map(d => d.data());
    const lastMonthUnits = productionData
      .filter(b => (b.date || "").slice(0, 7) === lastMonthKey)
      .reduce((s, b) => s + Number(b.passed || 0), 0);

    if (lastMonthPayroll > 0 && lastMonthUnits > 0) {
      setLabourRatePerUnit(lastMonthPayroll / lastMonthUnits);
    }
  }

  useEffect(() => {
    loadData().catch(console.error).finally(() => {
      // Restore scroll only after this tab's content has actually rendered —
      // doing it before data loads would scroll into a page that's still short.
      try {
        const saved = JSON.parse(sessionStorage.getItem("financeReturnState"));
        if (saved) {
          sessionStorage.removeItem("financeReturnState");
          requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, saved.scrollY || 0)));
        }
      } catch { /* ignore malformed/missing saved state */ }
    });
  }, []);

  // Called instead of a bare navigate() when a ledger row sends her to Purchases/Billing —
  // remembers the ledger tab + scroll position so "Back to Finance" lands right back here.
  function goToLedgerSource(path, state) {
    sessionStorage.setItem("financeReturnState", JSON.stringify({ tab: activeTab, scrollY: window.scrollY }));
    navigate(path, { state });
  }

  /* ── Handlers ── */

  function nextExpenseId() {
    const nums = allPurchaseIdsRef.current.map(id => parseInt((id || "EXP000").replace("EXP", ""), 10)).filter(n => !isNaN(n));
    return `EXP${String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, "0")}`;
  }

  async function addPurchase() {
    if (!canEditTab("purchases")) { setPurchaseError("You don't have permission to add purchases."); return; }
    if (!purchaseForm.expenseItem.trim()) {
      // Inline, next to the field itself — a top-of-page banner is invisible from this table
      setPurchaseError("Required — who did you buy from?");
      return;
    }
    setPurchaseError("");
    setSubmitting(true);
    try {
      const newId = nextExpenseId();
      const subtotal = purchaseSubtotal(purchaseForm.items);
      const vatAmount = purchaseVatAmount(purchaseForm.items, purchaseForm.vatBill, purchaseForm.discountAmt, purchaseForm.taxableAmt);
      const grandTotal = purchaseGrandTotal(purchaseForm.items, purchaseForm.vatBill, purchaseForm.discountAmt, purchaseForm.taxableAmt);

      const purchasePayload = {
        expenseId: newId,
        expenseItem: purchaseForm.expenseItem,
        category: purchaseForm.category,
        paymentType: purchaseForm.paymentType || "CASH",
        vatBill: purchaseForm.vatBill,
        discountAmt: Number(purchaseForm.discountAmt || 0),
        taxableAmt: Number(purchaseForm.taxableAmt || 0),
        subtotalNPR: subtotal,
        vatAmountNPR: vatAmount,
        amountNPR: grandTotal,
        date: purchaseForm.date,
        createdAt: serverTimestamp(),
        items: purchaseItemsPayload(purchaseForm.items)
      };
      await addDoc(collection(db, "finance_purchases"), purchasePayload);
      // Auto-post stock-in for any line item whose particulars name an existing
      // inventory item (e.g. "Buff Meat") — silently skips everything else
      // (rent, fees, etc. aren't stock).
      postPurchaseStockIn({
        purchase: purchasePayload,
        items: purchasePayload.items,
        inventoryItems,
        createdBy: profile?.name || "Unknown",
      }).catch(err => console.error("Stock auto-post failed:", err));
      setPurchaseForm({ ...emptyPurchaseForm, date: new Date().toISOString().slice(0, 10), items: [{ ...emptyPurchaseForm.items[0] }] });
      setPurchaseSuccess(`✓ ${newId} saved`);
      setTimeout(() => setPurchaseSuccess(""), 4000);
      await loadData();
      // Straight back to Date so she can start the next purchase without touching the mouse.
      requestAnimationFrame(() => document.querySelector('[data-role="purchase-date"]')?.focus());
    } catch (err) {
      console.error("Failed to add purchase:", err);
      setPurchaseError(err?.code === "permission-denied"
        ? "You don't have permission to add purchases."
        : "Failed to save. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteExpense(id) {
    if (!window.confirm("Delete this expense?")) return;
    await deleteDoc(doc(db, "finance_expenses", id));
    await loadData();
  }

  async function markExpensePaid(id, current) {
    await fsUpdateDoc(doc(db, "finance_expenses", id), { status: current === "Paid" ? null : "Paid" });
    await loadData();
  }

  async function addExpense(e) {
    e.preventDefault(); if (!canEdit) return;
    setSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, "finance_expenses"), {
        ...expenseForm, amountNPR: Number(expenseForm.amountNPR || 0),
        loggedBy: profile?.name || "Unknown", createdAt: serverTimestamp()
      });
      if (expenseForm.vatBill && expenseVatFile) {
        const safeName = expenseVatFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `vat-bills/expense-${docRef.id}/${Date.now()}_${safeName}`;
        const fileRef = storageRef(storage, path);
        const task = uploadBytesResumable(fileRef, expenseVatFile);
        await new Promise((resolve, reject) => {
          task.on("state_changed", snap => setExpenseVatProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)), reject, resolve);
        });
        const url = await getDownloadURL(fileRef);
        await addDoc(collection(db, "vat_bills"), {
          expenseId: docRef.id, expenseItem: expenseForm.note || expenseForm.category,
          fileName: expenseVatFile.name, fileUrl: url, storagePath: path,
          fileType: expenseVatFile.type, uploadedBy: profile?.name || "Unknown",
          uploadedAt: serverTimestamp(), source: "expense"
        });
      }
      setExpenseForm(initialExpense);
      setExpenseVatFile(null); setExpenseVatProgress(null);
      if (expenseFileRef.current) expenseFileRef.current.value = "";
      await loadData();
    } finally { setSubmitting(false); }
  }

  async function uploadVatBill(e) {
    e.preventDefault(); if (!vatFile || !vatExpenseId) return;
    setUploading(true); setUploadProgress(0);
    try {
      const safeName = vatFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `vat-bills/${vatExpenseId}/${Date.now()}_${safeName}`;
      const fileRef = storageRef(storage, path);
      const task = uploadBytesResumable(fileRef, vatFile);
      await new Promise((resolve, reject) => {
        task.on("state_changed", snap => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)), reject, resolve);
      });
      const url = await getDownloadURL(fileRef);
      const purchase = purchases.find(p => p.expenseId === vatExpenseId);
      await addDoc(collection(db, "vat_bills"), {
        expenseId: vatExpenseId, expenseItem: purchase?.expenseItem || "",
        fileName: vatFile.name, fileUrl: url, storagePath: path, fileType: vatFile.type,
        uploadedBy: profile?.name || "Unknown", uploadedAt: serverTimestamp()
      });
      setVatFile(null); setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadData();
    } catch (err) { console.error("Upload failed:", err); alert("Upload failed: " + err.message); }
    finally { setUploading(false); }
  }

  async function deleteVatBill(bill) {
    if (!window.confirm(`Delete "${bill.fileName}"?`)) return;
    try { if (bill.storagePath) await deleteObject(storageRef(storage, bill.storagePath)); } catch (_) {}
    await deleteDoc(doc(db, "vat_bills", bill.id)); await loadData();
  }

  async function addEntry(e) {
    e.preventDefault();
    if (journalForm.debitAccount === journalForm.creditAccount) { alert("Debit and Credit accounts must be different."); return; }
    setJournalSubmitting(true);
    try {
      await addDoc(collection(db, "journal_entries"), {
        ...journalForm, amountNPR: Number(journalForm.amountNPR),
        createdBy: profile?.name || "Unknown", createdAt: serverTimestamp()
      });
      setJournalForm(emptyJournalForm); await loadData();
      requestAnimationFrame(() => document.querySelector('[data-role="journal-date"]')?.focus());
    } catch (err) {
      console.error("Failed to post journal entry:", err);
      showError("Failed to post journal entry. Please try again.");
    } finally {
      setJournalSubmitting(false);
    }
  }

  function startJournalEdit(entry) {
    setJournalEditId(entry.id);
    setJournalDraft({
      date: entry.date || "", description: entry.description || "",
      debitAccount: entry.debitAccount, creditAccount: entry.creditAccount,
      amountNPR: entry.amountNPR ?? "", reference: entry.reference || "",
    });
  }
  function cancelJournalEdit() {
    setJournalEditId(null);
    setJournalDraft({});
  }
  async function saveJournalEdit(id) {
    if (journalDraft.debitAccount === journalDraft.creditAccount) { alert("Debit and Credit accounts must be different."); return; }
    setJournalSaving(true);
    try {
      await fsUpdateDoc(doc(db, "journal_entries", id), {
        date: journalDraft.date,
        description: journalDraft.description,
        debitAccount: journalDraft.debitAccount,
        creditAccount: journalDraft.creditAccount,
        amountNPR: Number(journalDraft.amountNPR) || 0,
        reference: journalDraft.reference,
      });
      setJournalEditId(null);
      setJournalDraft({});
      await loadData();
    } catch (err) {
      console.error("Failed to update journal entry:", err);
      showError("Failed to save changes. Please try again.");
    } finally {
      setJournalSaving(false);
    }
  }

  async function commitLedgerDraft() {
    if (!ledgerDraft) return;
    const { type, id, particulars, amount } = ledgerDraft;
    try {
      if (type === "opening") {
        await fsUpdateDoc(doc(db, "accounts", id), { openingBalanceNPR: Number(amount || 0) });
      } else {
        const coll = type === "bank" ? "bank_transactions" : "journal_entries";
        await fsUpdateDoc(doc(db, coll, id), { description: particulars, amountNPR: Number(amount || 0) });
      }
      setLedgerDraft(null);
      await loadData();
    } catch (err) {
      console.error("Failed to update ledger entry:", err);
      showError("Failed to update ledger entry. Please try again.");
    }
  }

  /* ── Order P&L handlers ── */
  function openOplPanel(order) {
    setOplSelectedId(order.id);
    const existing = orderCosts[order.orderId || order.id] || orderCosts[order.id] || {};
    const autoLabour = (existing.labour == null && labourRatePerUnit)
      ? String(Math.round(labourRatePerUnit * Number(order.quantity || 0)))
      : "";
    setOplCostForm({
      material: existing.material != null ? String(existing.material) : "",
      labour:   existing.labour   != null ? String(existing.labour)   : autoLabour,
      overhead: existing.overhead != null ? String(existing.overhead) : "",
      shipping: existing.shipping != null ? String(existing.shipping) : "",
    });
  }

  async function saveOplCosts(e) {
    e.preventDefault();
    if (!oplSelectedId) return;
    setOplSaving(true);
    try {
      const order = orders.find(o => o.id === oplSelectedId);
      const costKey = order?.orderId || order?.id || oplSelectedId;
      await setDoc(doc(db, "order_costs", costKey), {
        orderId:  costKey,
        material: Number(oplCostForm.material || 0),
        labour:   Number(oplCostForm.labour   || 0),
        overhead: Number(oplCostForm.overhead  || 0),
        shipping: Number(oplCostForm.shipping  || 0),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await loadData();
      setOplSelectedId(null);
    } catch (err) {
      console.error("Failed to save order costs:", err);
      showError("Failed to save order costs. Please try again.");
    } finally {
      setOplSaving(false);
    }
  }

  /* ── Memos ── */
  const summary = useMemo(() => {
    const now = new Date();
    const curMonth = MONTHS[now.getMonth()];
    const curYear  = now.getFullYear();
    // KPI strip: payroll filtered to current month (MTD) — intentionally narrower than P&L which uses the full current year
    const payrollNPR  = payroll
      .filter(r => r.month === curMonth && Number(r.year) === curYear)
      .reduce((s, r) => s + Number(r.grossNPR || r.netNPR || 0), 0);
    const expensesNPR = expenses.reduce((s, r) => s + Number(r.amountNPR || 0), 0);
    const purchNPR    = purchases.reduce((s, r) => s + Number(r.amountNPR || 0), 0);
    const totalNPR    = payrollNPR + expensesNPR + purchNPR;
    return { payrollNPR, expensesNPR, purchNPR, totalNPR,
      payrollGBP:  payrollNPR  / GBP_RATE,
      expensesGBP: expensesNPR / GBP_RATE,
      purchGBP:    purchNPR    / GBP_RATE,
      totalGBP:    totalNPR    / GBP_RATE };
  }, [payroll, expenses, purchases]);

  const ledger = useMemo(() => {
    const map = {};
    for (const entry of entries) {
      [entry.debitAccount, entry.creditAccount].forEach(acc => {
        if (!map[acc]) map[acc] = { debits: 0, credits: 0, entryCount: 0 };
      });
      map[entry.debitAccount].debits  += Number(entry.amountNPR || 0);
      map[entry.debitAccount].entryCount++;
      map[entry.creditAccount].credits += Number(entry.amountNPR || 0);
      map[entry.creditAccount].entryCount++;
    }
    return map;
  }, [entries]);

  // Running Cash/Bank ledger — matches Deepa's notebook format (Particulars/Dr/Cr/Balance).
  // Rows are derived on the fly from Purchases, paid Invoices, Bank txns and Journal
  // entries — nothing is written back, so there's no separate ledger doc to keep in sync.
  const cashBankLedger = useMemo(() => {
    const CASH = "Cash";
    const BANK = "Nabil Bank";
    const rowsFor = { [CASH]: [], [BANK]: [] };

    purchases.forEach(p => {
      const acct = p.paymentType === "CASH" ? CASH : p.paymentType === "Bank" ? BANK : null;
      if (!acct) return; // Credit purchases move to Accounts Payable, not Cash/Bank
      rowsFor[acct].push({
        date: p.date || "", sortKey: p.createdAt?.seconds || 0,
        particulars: `Purchase — ${p.expenseItem || p.expenseId}`, dr: 0, cr: Number(p.amountNPR || 0),
        sourceType: "purchase", sourceId: p.id, searchKey: p.expenseId,
      });
    });

    invoices.filter(i => i.status === "Paid").forEach(i => {
      const val = Number(i.totalNPR || 0);
      const amt = i.currency === "GBP" ? val * GBP_RATE : val;
      const acct = i.paymentType === "Bank" ? BANK : CASH; // defaults to Cash for older invoices with no paymentType set
      rowsFor[acct].push({
        date: i.date || "", sortKey: i.createdAt?.seconds || 0,
        particulars: `Sales — ${i.clientName || i.invoiceNumber || ""}`, dr: amt, cr: 0,
        sourceType: "invoice", sourceId: null, searchKey: i.invoiceNumber || i.clientName,
      });
    });

    bankTxns.forEach(t => {
      if (t.accountName && t.accountName !== BANK) return; // future multi-bank-account support
      const amt = Number(t.amountNPR || 0);
      rowsFor[BANK].push({
        date: t.date || "", sortKey: t.createdAt?.seconds || 0,
        particulars: t.description || "Bank transaction",
        dr: t.type === "credit" ? amt : 0, cr: t.type === "debit" ? amt : 0,
        sourceType: "bank", sourceId: t.id,
      });
    });

    entries.forEach(e => {
      const amt = Number(e.amountNPR || 0);
      if (e.debitAccount === CASH || e.debitAccount === BANK) {
        rowsFor[e.debitAccount].push({ date: e.date || "", sortKey: e.createdAt?.seconds || 0, particulars: e.description || "Journal entry", dr: amt, cr: 0, sourceType: "journal", sourceId: e.id });
      }
      if (e.creditAccount === CASH || e.creditAccount === BANK) {
        rowsFor[e.creditAccount].push({ date: e.date || "", sortKey: e.createdAt?.seconds || 0, particulars: e.description || "Journal entry", dr: 0, cr: amt, sourceType: "journal", sourceId: e.id });
      }
    });

    const result = {};
    for (const name of [CASH, BANK]) {
      const accountId = accounts.find(a => a.name === name)?.id || null;
      const opening = accounts.find(a => a.name === name)?.openingBalanceNPR || 0;
      const sorted = rowsFor[name].sort((a, b) => a.date.localeCompare(b.date) || a.sortKey - b.sortKey);
      let balance = opening;
      const rows = sorted.map(r => {
        balance += r.dr - r.cr;
        return { ...r, balance };
      });
      result[name] = { accountId, openingBalanceNPR: opening, rows, closingBalance: balance };
    }
    return result;
  }, [purchases, invoices, bankTxns, entries, accounts]);

  const pl = useMemo(() => {
    // Fix 1+2: use totalNPR (inc VAT, matches Dashboard/Billing); convert GBP-currency invoices to NPR
    const salesRevenue = invoices
      .filter(i => i.status === "Paid")
      .reduce((s, i) => {
        const val = Number(i.totalNPR || 0);
        return s + (i.currency === "GBP" ? val * GBP_RATE : val);
      }, 0);
    const otherIncome   = entries.filter(e => accounts.find(a => a.name === e.creditAccount && a.type === "Income")).reduce((s, e) => s + Number(e.amountNPR || 0), 0);
    const totalIncome   = salesRevenue + otherIncome;
    const expensesTotal = expenses.reduce((s, r) => s + Number(r.amountNPR || 0), 0);
    const purchasesTotal= purchases.reduce((s, r) => s + Number(r.amountNPR || 0), 0);
    const curYear = new Date().getFullYear();
    const payrollTotal  = payroll
      .filter(r => Number(r.year) === curYear)
      .reduce((s, r) => s + Number(r.grossNPR || r.netNPR || 0), 0);
    const journalExpenses = entries.filter(e => accounts.find(a => a.name === e.debitAccount && a.type === "Expense")).reduce((s, e) => s + Number(e.amountNPR || 0), 0);
    const totalExpenses = expensesTotal + purchasesTotal + payrollTotal + journalExpenses;
    return { salesRevenue, otherIncome, totalIncome, expensesTotal, purchasesTotal, payrollTotal, journalExpenses, totalExpenses, netProfit: totalIncome - totalExpenses };
  }, [entries, accounts, expenses, purchases, payroll, invoices]);

  const bs = useMemo(() => {
    const balance = (name, type) => { const d = ledger[name] || { debits: 0, credits: 0 }; return type === "Asset" ? d.debits - d.credits : d.credits - d.debits; };
    const assets      = accounts.filter(a => a.type === "Asset").map(a => ({ ...a, balance: balance(a.name, "Asset") }));
    const liabilities = accounts.filter(a => a.type === "Liability").map(a => ({ ...a, balance: balance(a.name, "Liability") }));
    const equity      = accounts.filter(a => a.type === "Equity").map(a => ({ ...a, balance: balance(a.name, "Equity") }));
    return { assets, liabilities, equity,
      totalAssets:      assets.reduce((s, a) => s + a.balance, 0),
      totalLiabilities: liabilities.reduce((s, a) => s + a.balance, 0),
      totalEquity:      equity.reduce((s, a) => s + a.balance, 0) };
  }, [accounts, ledger]);

  const accountNames = [...new Set(accounts.map(a => a.name))];

  const donutData = useMemo(() => [
    { name: "Purchases", value: summary.purchNPR,    color: "#1f6e4c" },
    { name: "Expenses",  value: summary.expensesNPR, color: "#c4654a" },
    { name: "Payroll (MTD)",   value: summary.payrollNPR,  color: "#5688b0" },
  ].filter(d => d.value > 0), [summary]);

  const categoryBarData = useMemo(() => {
    const map = {};
    purchases.forEach(p => { const cat = p.category || "Other"; map[cat] = (map[cat] || 0) + Number(p.amountNPR || 0); });
    return Object.entries(map).map(([cat, total]) => ({ cat: cat.replace(" / ", "/"), total })).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [purchases]);

  const plChartData = [
    { name: "Income",     value: pl.totalIncome,              fill: "#1f6e4c" },
    { name: "Expenses",   value: pl.totalExpenses,            fill: "#c4654a" },
    { name: "Net Profit", value: Math.max(0, pl.netProfit),   fill: "#7dd3a8" },
  ];

  const purchaseTotal = purchases.reduce((s, r) => s + Number(r.amountNPR || 0), 0);

  /* ── Render ── */
  return (
      <div className="kfin-wrap">

        {/* Fix 3: error banner */}
        {pageError && (
          <div ref={errorBannerRef} style={{
            background: "var(--terra-soft, #fdf2ef)", color: "var(--terra)",
            border: "1px solid rgba(196,101,74,.3)", borderRadius: 8,
            padding: "10px 14px", marginBottom: 14, fontSize: 13, fontWeight: 500,
          }}>
            {pageError}
          </div>
        )}

        {/* ── KPI strip ── */}
        <div className="kfin-kpis">
          <div
            className="kfin-kpi kfin-kpi--link"
            role="button"
            tabIndex={0}
            onClick={() => goToLedgerSource("/employees", { tab: "payroll" })}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToLedgerSource("/employees", { tab: "payroll" }); } }}
            title="View all payroll records"
          >
            <Icons.ArrowRight size={13} sw={2} className="kfin-kpi-arrow" />
            <div className="kfin-kpi-ico" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="8" r="3.5"/><path d="M3 20c.6-3.4 3.1-5.5 6-5.5s5.4 2.1 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.7.4 4.4 2.2 5 5.3"/>
              </svg>
            </div>
            <p className="kfin-kpi-label">Payroll This Month</p>
            <p className="kfin-kpi-value">{asCurrency(summary.payrollNPR, "NPR")}</p>
            <p className="kfin-kpi-sub">{asCurrency(summary.payrollGBP, "GBP")}</p>
          </div>

          <div className="kfin-kpi">
            <div className="kfin-kpi-ico" style={{ background: "var(--terra-soft)", color: "var(--terra)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h4"/>
              </svg>
            </div>
            <p className="kfin-kpi-label">Total Expenses</p>
            <p className="kfin-kpi-value">{asCurrency(summary.expensesNPR, "NPR")}</p>
            <p className="kfin-kpi-sub">{asCurrency(summary.expensesGBP, "GBP")}</p>
          </div>

          <div
            className="kfin-kpi kfin-kpi--link"
            role="button"
            tabIndex={0}
            onClick={() => navigate("/purchases")}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/purchases"); } }}
            title="View all saved purchases"
          >
            <Icons.ArrowRight size={13} sw={2} className="kfin-kpi-arrow" />
            <div className="kfin-kpi-ico" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>
              </svg>
            </div>
            <p className="kfin-kpi-label">Total Purchases</p>
            <p className="kfin-kpi-value">{asCurrency(summary.purchNPR, "NPR")}</p>
            <p className="kfin-kpi-sub">{asCurrency(summary.purchGBP, "GBP")}</p>
          </div>

          <div className="kfin-kpi">
            <div className="kfin-kpi-ico" style={{
              background: pl.netProfit < 0 ? "var(--terra-soft)" : "var(--mint-soft)",
              color:      pl.netProfit < 0 ? "var(--terra)"      : "var(--mint-deep)",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9"/><path d="M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1.1-3 2.5 1.3 2 3 2.5 3 1.1 3 2.5-1.3 2.5-3 2.5-3-1.1-3-2.5M12 5v2M12 17v2"/>
              </svg>
            </div>
            <p className="kfin-kpi-label">Net {pl.netProfit >= 0 ? "Profit" : "Loss"}</p>
            <p className="kfin-kpi-value" style={{ color: pl.netProfit < 0 ? "var(--terra)" : undefined }}>
              {asCurrency(Math.abs(pl.netProfit), "NPR")}
            </p>
            <p className="kfin-kpi-sub">{asCurrency(Math.abs(pl.netProfit) / GBP_RATE, "GBP")}</p>
          </div>
        </div>

        {/* ── Charts ── */}
        <div className="kfin-charts">
          <div className="kfin-panel">
            <p className="kfin-panel-title">Outgoings Breakdown</p>
            {donutData.length === 0
              ? <p style={{ color: "var(--ink-4)", fontSize: 13 }}>No data yet.</p>
              : (
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={58} outerRadius={86} paddingAngle={3} dataKey="value">
                      {donutData.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={v => [`NPR ${roundAmount(Number(v)).toLocaleString()}`, ""]} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 12 }} />
                    <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </div>
          <div className="kfin-panel">
            <p className="kfin-panel-title">Purchases by Category</p>
            {categoryBarData.length === 0
              ? <p style={{ color: "var(--ink-4)", fontSize: 13 }}>No purchases yet.</p>
              : (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={categoryBarData} margin={{ top: 4, right: 8, left: 0, bottom: 48 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="cat" tick={{ fontSize: 10, fill: "var(--ink-3)" }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: "var(--ink-3)" }} width={40} />
                    <Tooltip formatter={v => [`NPR ${roundAmount(Number(v)).toLocaleString()}`, "Amount"]} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 12 }} />
                    <Bar dataKey="total" fill="var(--mint-deep)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="kfin-tabs">
          {visibleTabs.map(t => (
            <button
              key={t}
              className={`kfin-tab${activeTab === t ? " kfin-tab--on" : ""}`}
              onClick={() => setActiveTab(t)}
            >
              {tabLabel(t)}
            </button>
          ))}
        </div>
        {!visibleTabs.includes(activeTab) && visibleTabs.length > 0 && (() => { setActiveTab(visibleTabs[0]); return null; })()}

        {/* ── Expenses ── */}
        {activeTab === "expenses" && (
          <>
            {canEdit && (
              <div className="kfin-block">
                <div className="kfin-block-hd">
                  <p className="kfin-block-title">Add Expense</p>
                </div>
                <form className="kfin-form" onSubmit={addExpense}>
                  <label className="kfin-label">Category
                    <select className="kfin-select" value={expenseForm.category} disabled={!canEdit}
                      onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))}>
                      {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="kfin-label">Amount (NPR)
                    <input type="number" className="kfin-input" value={expenseForm.amountNPR} disabled={!canEdit}
                      onChange={e => setExpenseForm(f => ({ ...f, amountNPR: e.target.value }))} required />
                  </label>
                  <label className="kfin-label">Date
                    <input type="date" className="kfin-input" value={expenseForm.date} disabled={!canEdit}
                      onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))} required />
                  </label>
                  <label className="kfin-label kfin-full">Note
                    <input type="text" className="kfin-input" value={expenseForm.note} disabled={!canEdit}
                      onChange={e => setExpenseForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional description" />
                  </label>
                  <div className="kfin-full" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: canEdit ? "pointer" : "default", userSelect: "none", fontSize: 13, fontWeight: 500 }}>
                      <input type="checkbox" checked={expenseForm.vatBill} disabled={!canEdit}
                        onChange={e => setExpenseForm(f => ({ ...f, vatBill: e.target.checked }))}
                        style={{ width: 15, height: 15, accentColor: "var(--mint-deep)" }} />
                      Has VAT Bill
                    </label>
                    {expenseForm.vatBill && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label className="kfin-label">Upload VAT Bill
                          <input ref={expenseFileRef} type="file" accept="image/*,application/pdf" disabled={!canEdit}
                            onChange={e => setExpenseVatFile(e.target.files[0] || null)}
                            className="kfin-input" style={{ paddingTop: 6 }} />
                        </label>
                        {expenseVatProgress !== null && (
                          <div className="kfin-progress-bar">
                            <div className="kfin-progress-fill" style={{ width: `${expenseVatProgress}%` }} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button type="submit" className="primary-button" disabled={!canEdit || submitting}>
                    {submitting ? "Saving…" : "Add Expense"}
                  </button>
                </form>
              </div>
            )}
            {!canEdit && <div className="kfin-notice">ℹ View-only — only Nepal staff can add expenses.</div>}
            <div className="kfin-block">
              <div className="kfin-block-hd">
                <p className="kfin-block-title">Expenses <span className="kfin-block-sub">({expenses.length})</span></p>
              </div>
              <div className="kfin-tbl-wrap">
                <table className="kfin-tbl">
                  <thead><tr><th>Category</th><th>Amount NPR</th><th>Amount GBP</th><th>Date</th><th>Note</th><th>VAT Bill</th><th>Status</th><th>Logged By</th>{canEdit && <th></th>}</tr></thead>
                  <tbody>
                    {expenses.map(item => {
                      const bill = vatBills.find(b => b.expenseId === item.id);
                      const isPaid = item.status === "Paid";
                      return (
                        <tr key={item.id} style={{ opacity: isPaid ? 0.65 : 1 }}>
                          <td>{item.category}</td>
                          <td style={{ fontFamily: "var(--mono)", textDecoration: isPaid ? "line-through" : "none" }}>{asCurrency(item.amountNPR || 0, "NPR")}</td>
                          <td style={{ color: "var(--ink-3)" }}>{asCurrency((item.amountNPR || 0) / GBP_RATE, "GBP")}</td>
                          <td>{item.date}</td>
                          <td style={{ color: "var(--ink-3)" }}>{item.note || "—"}</td>
                          <td>
                            {item.vatBill
                              ? bill
                                ? <a href={bill.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--mint-deep)", fontWeight: 600, fontSize: 12, textDecoration: "none" }}>View ↗</a>
                                : <span className="badge-ok">Yes</span>
                              : <span className="badge-danger">No</span>}
                          </td>
                          <td>
                            {isPaid
                              ? <span className="kbil-badge kbil-badge--ok">Paid</span>
                              : <span className="kbil-badge kbil-badge--muted">Unpaid</span>}
                          </td>
                          <td style={{ color: "var(--ink-3)" }}>{item.loggedBy}</td>
                          {canEdit && (
                            <td>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button className="kbil-tbl-btn kbil-tbl-btn--ok"
                                  onClick={() => markExpensePaid(item.id, item.status)}
                                  title={isPaid ? "Mark as unpaid" : "Mark as paid"}>
                                  {isPaid ? "Unmark" : "Mark Paid"}
                                </button>
                                <button className="kbil-tbl-btn kbil-tbl-btn--danger"
                                  onClick={() => deleteExpense(item.id)}>
                                  Delete
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── Purchases ── */}
        {activeTab === "purchases" && (
          <div className="kfin-block">
            <div className="kfin-block-hd">
              <p className="kfin-block-title">
                Add Purchase
                {purchaseSuccess && (
                  <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 700, color: "var(--mint-deep)", background: "var(--mint-soft)", padding: "3px 10px", borderRadius: 20 }}>
                    {purchaseSuccess}
                  </span>
                )}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {purchases.length} saved · NPR {roundAmount(purchaseTotal).toLocaleString()}
                  <span style={{ color: "var(--ink-4)", fontWeight: 400, marginLeft: 8 }}>/ {asCurrency(purchaseTotal / GBP_RATE, "GBP")}</span>
                </span>
                <button type="button" className="ghost-button" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => navigate("/purchases")}>
                  View saved purchases →
                </button>
              </div>
            </div>
            {!canEdit && <div className="kfin-notice" style={{ marginBottom: 14 }}>ℹ You don't have permission to add or edit purchases.</div>}
            {canEdit && (
              <div className="kfin-tbl-wrap">
                <table className="kfin-tbl kfin-tbl-compact">
                  <thead><tr>
                    <th>Expense ID</th><th>Date</th><th>Party Name</th><th>Category</th><th>Payment</th><th>VAT Bill</th>
                    <th>Particulars</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount (NPR)</th><th>Total / Action</th>
                  </tr></thead>

                  <PurchaseRowGroup
                    expenseId={`${nextExpenseId()} (new)`}
                    data={purchaseForm}
                    highlight
                    partyError={purchaseError}
                    onFieldChange={patch => {
                      if ("expenseItem" in patch) setPurchaseError("");
                      setPurchaseForm(f => ({ ...f, ...patch }));
                    }}
                    onItemChange={(idx, patch) => setPurchaseForm(f => ({ ...f, items: applyItemChange(f.items, idx, patch) }))}
                    onAddItem={() => setPurchaseForm(f => ({ ...f, items: addLineItem(f.items) }))}
                    onRemoveItem={idx => setPurchaseForm(f => ({ ...f, items: removeLineItem(f.items, idx) }))}
                    onFinishEnter={addPurchase}
                    actionCell={
                      <button className="primary-button" type="button" disabled={submitting}
                        style={{ padding: "5px 12px", fontSize: 12 }} onClick={addPurchase}>
                        {submitting ? "Adding…" : "+ Add"}
                      </button>
                    }
                  />
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── VAT Bills ── */}
        {activeTab === "vat bills" && (
          <>
            <div className="kfin-block">
              <div className="kfin-block-hd">
                <p className="kfin-block-title">Upload VAT Bill</p>
              </div>
              {!canEdit && <div className="kfin-notice" style={{ marginBottom: 14 }}>ℹ Only Nepal staff can upload VAT bills.</div>}
              <form onSubmit={uploadVatBill} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="kfin-form">
                  <label className="kfin-label kfin-full">Linked Purchase (Expense ID)
                    <select className="kfin-select" value={vatExpenseId} disabled={!canEdit} onChange={e => setVatExpenseId(e.target.value)}>
                      {purchases.map(p => <option key={p.id} value={p.expenseId}>{p.expenseId} — {p.expenseItem}</option>)}
                    </select>
                  </label>
                  <label className="kfin-label kfin-full">File (image or PDF)
                    <input ref={fileInputRef} type="file" accept="image/*,.pdf" disabled={!canEdit}
                      onChange={e => setVatFile(e.target.files[0] || null)} className="kfin-input" style={{ paddingTop: 6 }} />
                  </label>
                  <button type="submit" className="primary-button" disabled={!canEdit || uploading || !vatFile || !vatExpenseId}>
                    {uploading ? "Uploading…" : "Upload Bill"}
                  </button>
                </div>
                {uploadProgress !== null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="kfin-progress-bar" style={{ flex: 1 }}>
                      <div className="kfin-progress-fill" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <span style={{ fontSize: 12, color: "var(--ink-3)", minWidth: 30 }}>{uploadProgress}%</span>
                  </div>
                )}
              </form>
            </div>
            <div className="kfin-block">
              <div className="kfin-block-hd">
                <p className="kfin-block-title">VAT Bills <span className="kfin-block-sub">({vatBills.length})</span></p>
              </div>
              {vatBills.length === 0
                ? <p style={{ color: "var(--ink-4)", fontSize: 13 }}>No VAT bills uploaded yet.</p>
                : (
                  <div className="kfin-tbl-wrap">
                    <table className="kfin-tbl">
                      <thead><tr><th>Expense ID</th><th>Expense Item</th><th>File</th><th>Uploaded By</th><th>Date</th><th>Actions</th></tr></thead>
                      <tbody>
                        {vatBills.map(bill => {
                          const uploadDate = bill.uploadedAt?.seconds
                            ? new Date(bill.uploadedAt.seconds * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                            : "—";
                          const isImg = bill.fileType?.startsWith("image/");
                          return (
                            <tr key={bill.id}>
                              <td style={{ color: "var(--ink-4)", fontSize: 12, fontFamily: "var(--mono)" }}>{bill.expenseId}</td>
                              <td style={{ fontWeight: 500 }}>{bill.expenseItem || "—"}</td>
                              <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isImg ? "🖼 " : "📄 "}{bill.fileName}</td>
                              <td>{bill.uploadedBy}</td>
                              <td>{uploadDate}</td>
                              <td>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <a href={bill.fileUrl} target="_blank" rel="noopener noreferrer" className="ghost-button" style={{ padding: "4px 10px", fontSize: 12, textDecoration: "none" }}>View ↗</a>
                                  {canEdit && <button className="ghost-button" style={{ padding: "4px 10px", fontSize: 12, color: "var(--terra)", borderColor: "rgba(196,101,74,.3)" }} onClick={() => deleteVatBill(bill)}>Delete</button>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          </>
        )}

        {/* ── Journal ── */}
        {activeTab === "journal" && (
          <>
            {!canEdit && <div className="kfin-notice">ℹ UK admin — view only.</div>}
            {canEdit && (
              <div className="kfin-block">
                <div className="kfin-block-hd">
                  <p className="kfin-block-title">Post Journal Entry</p>
                </div>
                <form className="kfin-form" ref={journalFormRef} onSubmit={addEntry}
                  onKeyDown={e => focusNextOnEnter(e, () => journalFormRef.current?.requestSubmit())}>
                  <label className="kfin-label">Date
                    <input type="date" className="kfin-input" data-role="journal-date" value={journalForm.date} required onChange={e => setJournalForm(f => ({ ...f, date: e.target.value }))} />
                  </label>
                  <label className="kfin-label">Amount (NPR)
                    <input type="number" min="1" className="kfin-input" value={journalForm.amountNPR} required placeholder="0"
                      onChange={e => setJournalForm(f => ({ ...f, amountNPR: e.target.value }))} />
                  </label>
                  <label className="kfin-label">Debit Account (Dr)
                    <KeyboardSelect className="kfin-select" value={journalForm.debitAccount} options={accountNames}
                      onChange={v => setJournalForm(f => ({ ...f, debitAccount: v }))} />
                  </label>
                  <label className="kfin-label">Credit Account (Cr)
                    <KeyboardSelect className="kfin-select" value={journalForm.creditAccount} options={accountNames}
                      onChange={v => setJournalForm(f => ({ ...f, creditAccount: v }))} />
                  </label>
                  <label className="kfin-label kfin-full">Description
                    <input type="text" className="kfin-input" value={journalForm.description} required placeholder="Transaction description"
                      onChange={e => setJournalForm(f => ({ ...f, description: e.target.value }))} />
                  </label>
                  <label className="kfin-label">Reference (optional)
                    <input type="text" className="kfin-input" value={journalForm.reference} placeholder="Invoice # / PO # etc."
                      onChange={e => setJournalForm(f => ({ ...f, reference: e.target.value }))} />
                  </label>
                  <button type="submit" className="primary-button" disabled={journalSubmitting} style={{ alignSelf: "flex-end" }}>
                    {journalSubmitting ? "Posting…" : "Post Entry"}
                  </button>
                </form>
              </div>
            )}
            <div className="kfin-block">
              <div className="kfin-block-hd">
                <p className="kfin-block-title">Journal Entries <span className="kfin-block-sub">({entries.length})</span></p>
              </div>
              {entries.length === 0
                ? <p style={{ color: "var(--ink-4)", fontSize: 13 }}>No journal entries yet.</p>
                : (
                  <div className="kfin-tbl-wrap">
                    <table className="kfin-tbl">
                      <thead><tr><th>Date</th><th>Description</th><th>Debit (Dr)</th><th>Credit (Cr)</th><th>Amount (NPR)</th><th>Amount (GBP)</th><th>Reference</th><th>Posted By</th>{canEdit && <th></th>}</tr></thead>
                      <tbody>
                        {entries.map(entry => {
                          const editing = journalEditId === entry.id;
                          const inputStyle = { padding: "3px 6px", fontSize: 12, width: "100%" };
                          if (!editing) {
                            return (
                              <tr key={entry.id}>
                                <td>{entry.date}</td>
                                <td style={{ fontWeight: 500 }}>{entry.description}</td>
                                <td style={{ color: "var(--mint-deep)", fontWeight: 500 }}>{entry.debitAccount}</td>
                                <td style={{ color: "var(--terra)", fontWeight: 500 }}>{entry.creditAccount}</td>
                                <td style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>NPR {roundAmount(entry.amountNPR || 0).toLocaleString()}</td>
                                <td style={{ color: "var(--ink-3)", fontFamily: "var(--mono)" }}>{asCurrency((entry.amountNPR || 0) / GBP_RATE, "GBP")}</td>
                                <td style={{ color: "var(--ink-4)", fontSize: 12 }}>{entry.reference || "—"}</td>
                                <td style={{ fontSize: 12 }}>{entry.createdBy}</td>
                                {canEdit && (
                                  <td>
                                    <button type="button" className="ghost-button" style={{ padding: "3px 10px", fontSize: 11.5 }} onClick={() => startJournalEdit(entry)}>
                                      Edit
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          }
                          return (
                            <tr key={entry.id} style={{ background: "var(--mint-soft)" }}
                              onKeyDown={e => focusNextOnEnter(e, () => saveJournalEdit(entry.id))}>
                              <td>
                                <input type="date" className="kfin-input" style={inputStyle} value={journalDraft.date} autoFocus
                                  onChange={e => setJournalDraft(d => ({ ...d, date: e.target.value }))} />
                              </td>
                              <td>
                                <input className="kfin-input" style={inputStyle} value={journalDraft.description}
                                  onChange={e => setJournalDraft(d => ({ ...d, description: e.target.value }))} />
                              </td>
                              <td>
                                <KeyboardSelect className="kfin-select" style={inputStyle} value={journalDraft.debitAccount} options={accountNames}
                                  onChange={v => setJournalDraft(d => ({ ...d, debitAccount: v }))} />
                              </td>
                              <td>
                                <KeyboardSelect className="kfin-select" style={inputStyle} value={journalDraft.creditAccount} options={accountNames}
                                  onChange={v => setJournalDraft(d => ({ ...d, creditAccount: v }))} />
                              </td>
                              <td>
                                <input type="number" min="0" step="any" className="kfin-input" style={inputStyle} value={journalDraft.amountNPR}
                                  onChange={e => setJournalDraft(d => ({ ...d, amountNPR: e.target.value }))} />
                              </td>
                              <td style={{ color: "var(--ink-3)", fontFamily: "var(--mono)" }}>
                                {asCurrency((Number(journalDraft.amountNPR) || 0) / GBP_RATE, "GBP")}
                              </td>
                              <td>
                                <input className="kfin-input" style={inputStyle} value={journalDraft.reference}
                                  onChange={e => setJournalDraft(d => ({ ...d, reference: e.target.value }))} />
                              </td>
                              <td style={{ fontSize: 12 }}>{entry.createdBy}</td>
                              <td>
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button type="button" className="primary-button" style={{ padding: "3px 10px", fontSize: 11.5 }}
                                    disabled={journalSaving} onClick={() => saveJournalEdit(entry.id)}>
                                    {journalSaving ? "…" : "Save"}
                                  </button>
                                  <button type="button" className="ghost-button" style={{ padding: "3px 10px", fontSize: 11.5 }}
                                    disabled={journalSaving} onClick={cancelJournalEdit}>
                                    Cancel
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          </>
        )}

        {/* ── Ledger ── */}
        {activeTab === "ledger" && (
          <>
            {[["Cash", cashBankLedger.Cash], ["Nabil Bank", cashBankLedger["Nabil Bank"]]].map(([name, data]) => (
              <div className="kfin-block" key={name} style={{ marginBottom: 14 }}>
                <div className="kfin-block-hd">
                  <p className="kfin-block-title">{name}</p>
                  <span style={{ fontSize: 13, fontWeight: 700, color: data.closingBalance >= 0 ? "var(--mint-deep)" : "var(--terra)" }}>
                    Balance: NPR {roundAmount(data.closingBalance).toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-4)", fontWeight: 400, marginLeft: 6 }}>
                      ({asCurrency(data.closingBalance / GBP_RATE, "GBP")})
                    </span>
                  </span>
                </div>
                <div className="kfin-tbl-wrap">
                  <table className="kfin-tbl">
                    <thead><tr><th>Date</th><th>Particulars</th><th>Dr Amt (NPR)</th><th>Cr Amt (NPR)</th><th>Balance (NPR)</th></tr></thead>
                    <tbody>
                      {(() => {
                        const editingOpening = ledgerDraft && ledgerDraft.type === "opening" && ledgerDraft.id === data.accountId;
                        return (
                          <tr
                            style={{ background: "var(--bg-2)", cursor: canEdit ? "pointer" : "default" }}
                            title={canEdit ? "Click to edit opening balance" : undefined}
                            onClick={() => {
                              if (!canEdit || editingOpening) return;
                              setLedgerDraft({ type: "opening", id: data.accountId, particulars: "Opening Balance", amount: data.openingBalanceNPR });
                            }}
                            onBlur={e => { if (editingOpening && !e.currentTarget.contains(e.relatedTarget)) commitLedgerDraft(); }}
                          >
                            <td style={{ color: "var(--ink-4)", fontSize: 12 }}>—</td>
                            <td style={{ fontWeight: 600 }}>Opening Balance</td>
                            <td></td><td></td>
                            <td style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>
                              {editingOpening
                                ? <input type="number" min="0" step="any" className="kfin-input" style={{ padding: "3px 6px", fontSize: 12, width: "100%" }}
                                    value={ledgerDraft.amount} autoFocus
                                    onChange={e => setLedgerDraft(d => ({ ...d, amount: e.target.value }))}
                                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } }} />
                                : roundAmount(data.openingBalanceNPR).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })()}
                      {data.rows.length === 0 ? (
                        <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--ink-4)", padding: "16px 0" }}>No transactions yet.</td></tr>
                      ) : data.rows.map((r, i) => {
                        const editing = ledgerDraft && ledgerDraft.type === r.sourceType && ledgerDraft.id === r.sourceId;
                        const inputStyle = { padding: "3px 6px", fontSize: 12, width: "100%" };
                        return (
                          <tr
                            key={i}
                            title={canEdit ? (r.sourceType === "purchase" ? "Click to edit in Purchases" : r.sourceType === "invoice" ? "Click to edit in Billing" : "Click to edit") : undefined}
                            style={{ cursor: canEdit ? "pointer" : "default" }}
                            onClick={() => {
                              if (!canEdit || editing) return;
                              if (r.sourceType === "purchase") goToLedgerSource("/purchases", { search: r.searchKey });
                              else if (r.sourceType === "invoice") goToLedgerSource("/billing", { search: r.searchKey, autoEdit: true });
                              else setLedgerDraft({ type: r.sourceType, id: r.sourceId, particulars: r.particulars, amount: r.dr || r.cr });
                            }}
                            onBlur={e => { if (editing && !e.currentTarget.contains(e.relatedTarget)) commitLedgerDraft(); }}
                          >
                            <td style={{ color: "var(--ink-4)", fontSize: 12, whiteSpace: "nowrap" }}>{r.date || "—"}</td>
                            <td>
                              {editing
                                ? <input className="kfin-input" style={inputStyle} value={ledgerDraft.particulars} autoFocus
                                    onChange={e => setLedgerDraft(d => ({ ...d, particulars: e.target.value }))}
                                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } }} />
                                : r.particulars}
                            </td>
                            <td style={{ color: "var(--mint-deep)", fontFamily: "var(--mono)" }}>
                              {editing && r.dr
                                ? <input type="number" min="0" step="any" className="kfin-input" style={inputStyle} value={ledgerDraft.amount}
                                    onChange={e => setLedgerDraft(d => ({ ...d, amount: e.target.value }))}
                                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } }} />
                                : (r.dr ? roundAmount(r.dr).toLocaleString() : "—")}
                            </td>
                            <td style={{ color: "var(--terra)", fontFamily: "var(--mono)" }}>
                              {editing && r.cr
                                ? <input type="number" min="0" step="any" className="kfin-input" style={inputStyle} value={ledgerDraft.amount}
                                    onChange={e => setLedgerDraft(d => ({ ...d, amount: e.target.value }))}
                                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } }} />
                                : (r.cr ? roundAmount(r.cr).toLocaleString() : "—")}
                            </td>
                            <td style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>{roundAmount(r.balance).toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          <div className="kfin-block">
            <div className="kfin-block-hd">
              <p className="kfin-block-title">Other Accounts</p>
            </div>
            {Object.entries(ledger).filter(([a]) => a !== "Cash" && a !== "Nabil Bank").length === 0
              ? <p style={{ color: "var(--ink-4)", fontSize: 13 }}>No journal entries yet for other accounts.</p>
              : (
                <div className="kfin-ledger-grid">
                  {Object.entries(ledger).filter(([a]) => a !== "Cash" && a !== "Nabil Bank").sort(([a], [b]) => a.localeCompare(b)).map(([account, data]) => {
                    const accInfo = accounts.find(a => a.name === account);
                    const accType = accInfo?.type || "Unknown";
                    const isAsset = accType === "Asset";
                    const balance = isAsset ? data.debits - data.credits : data.credits - data.debits;
                    const typeColors = {
                      Asset:     { color: "var(--mint-deep)", bg: "var(--mint-soft)" },
                      Liability: { color: "var(--terra)",     bg: "var(--terra-soft)" },
                      Equity:    { color: "var(--amber)",     bg: "var(--amber-soft)" },
                      Income:    { color: "var(--blue)",      bg: "var(--blue-soft)" },
                      Expense:   { color: "var(--terra)",     bg: "var(--terra-soft)" },
                    };
                    const tc = typeColors[accType] || { color: "var(--ink-4)", bg: "var(--bg-2)" };
                    return (
                      <div key={account} className="kfin-ledger-card">
                        <div className="kfin-ledger-card-top">
                          <div>
                            <p className="kfin-ledger-name">{account}</p>
                            <span className="kfin-ledger-type" style={{ color: tc.color, background: tc.bg }}>{accType}</span>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <p className="kfin-ledger-bal-label">Balance</p>
                            <p className="kfin-ledger-bal" style={{ color: balance >= 0 ? "var(--mint-deep)" : "var(--terra)" }}>
                              NPR {roundAmount(Math.abs(balance)).toLocaleString()}
                            </p>
                            <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, fontFamily: "var(--mono)" }}>
                              ({asCurrency(Math.abs(balance) / GBP_RATE, "GBP")})
                            </p>
                          </div>
                        </div>
                        <div className="kfin-ledger-footer">
                          <span style={{ color: "var(--mint-deep)" }}>
                            Dr: {roundAmount(data.debits).toLocaleString()} <span style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 400 }}>({asCurrency(data.debits / GBP_RATE, "GBP")})</span>
                          </span>
                          <span style={{ color: "var(--terra)" }}>
                            Cr: {roundAmount(data.credits).toLocaleString()} <span style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 400 }}>({asCurrency(data.credits / GBP_RATE, "GBP")})</span>
                          </span>
                          <span style={{ color: "var(--ink-4)", marginLeft: "auto" }}>{data.entryCount} entries</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── P&L ── */}
        {activeTab === "p&l" && (
          <div className="kfin-pl">
            <div className="kfin-block">
              <p className="kfin-block-title" style={{ marginBottom: 18 }}>Profit & Loss Statement</p>
              <div className="kfin-pl-section">
                <p className="kfin-pl-section-title" style={{ color: "var(--mint-deep)" }}>Income</p>
                <div className="kfin-pl-row">
                  <span className="kfin-pl-row-label">Sales Revenue (paid invoices)</span>
                  <span className="kfin-pl-row-val">
                    NPR {roundAmount(pl.salesRevenue).toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(pl.salesRevenue / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
                <div className="kfin-pl-row">
                  <span className="kfin-pl-row-label">Other Income (journal)</span>
                  <span className="kfin-pl-row-val">
                    NPR {roundAmount(pl.otherIncome).toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(pl.otherIncome / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
                <div className="kfin-pl-total">
                  <span>Total Income</span>
                  <span style={{ color: "var(--mint-deep)" }}>
                    NPR {roundAmount(pl.totalIncome).toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 6, fontWeight: 500 }}>({asCurrency(pl.totalIncome / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
              </div>
              <div className="kfin-pl-section">
                <p className="kfin-pl-section-title" style={{ color: "var(--terra)" }}>Expenses</p>
                <div className="kfin-pl-row">
                  <span className="kfin-pl-row-label">Operating Expenses</span>
                  <span className="kfin-pl-row-val">
                    NPR {roundAmount(pl.expensesTotal).toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(pl.expensesTotal / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
                <div className="kfin-pl-row">
                  <span className="kfin-pl-row-label">Purchases</span>
                  <span className="kfin-pl-row-val">
                    NPR {roundAmount(pl.purchasesTotal).toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(pl.purchasesTotal / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
                <div className="kfin-pl-row">
                  <span className="kfin-pl-row-label">Payroll</span>
                  <span className="kfin-pl-row-val">
                    NPR {roundAmount(pl.payrollTotal).toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(pl.payrollTotal / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
                {pl.journalExpenses > 0 && (
                  <div className="kfin-pl-row">
                    <span className="kfin-pl-row-label">Journal Expenses</span>
                    <span className="kfin-pl-row-val">
                      NPR {roundAmount(pl.journalExpenses).toLocaleString()}
                      <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(pl.journalExpenses / GBP_RATE, "GBP")})</span>
                    </span>
                  </div>
                )}
                <div className="kfin-pl-total">
                  <span>Total Expenses</span>
                  <span style={{ color: "var(--terra)" }}>
                    NPR {roundAmount(pl.totalExpenses).toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 6, fontWeight: 500 }}>({asCurrency(pl.totalExpenses / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
              </div>
              <div className="kfin-pl-net">
                <span>Net {pl.netProfit >= 0 ? "Profit" : "Loss"}</span>
                <span style={{ color: pl.netProfit >= 0 ? "var(--mint-deep)" : "var(--terra)" }}>
                  NPR {roundAmount(Math.abs(pl.netProfit)).toLocaleString()}
                  <span style={{ fontSize: 13, color: pl.netProfit >= 0 ? "var(--mint-deep)" : "var(--terra)", marginLeft: 6, fontWeight: 500, opacity: 0.85 }}>
                    ({asCurrency(Math.abs(pl.netProfit) / GBP_RATE, "GBP")})
                  </span>
                </span>
              </div>
              <p className="kfin-pl-net-sub">{asCurrency(Math.abs(pl.netProfit) / GBP_RATE, "GBP")}</p>
            </div>
            <div className="kfin-block">
              <p className="kfin-block-title" style={{ marginBottom: 16 }}>Income vs Expenses</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={plChartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--ink-3)" }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: "var(--ink-3)" }} width={46} />
                  <Tooltip formatter={v => [`NPR ${roundAmount(Number(v)).toLocaleString()}`, ""]} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 12 }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {plChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Balance Sheet ── */}
        {activeTab === "balance sheet" && (
          <div className="kfin-bs">
            <div className="kfin-block">
              <p className="kfin-block-title" style={{ marginBottom: 14, color: "var(--mint-deep)" }}>Assets</p>
              {bs.assets.map(a => (
                <div key={a.id} className="kfin-bs-row">
                  <span>{a.name}</span>
                  <span style={{ fontFamily: "var(--mono)", fontWeight: 500 }}>
                    NPR {roundAmount(a.balance).toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(a.balance / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
              ))}
              <div className="kfin-bs-total">
                <span>Total Assets</span>
                <span style={{ color: "var(--mint-deep)" }}>
                  NPR {roundAmount(bs.totalAssets).toLocaleString()}
                  <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 6, fontWeight: 500 }}>({asCurrency(bs.totalAssets / GBP_RATE, "GBP")})</span>
                </span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="kfin-block">
                <p className="kfin-block-title" style={{ marginBottom: 14, color: "var(--terra)" }}>Liabilities</p>
                {bs.liabilities.map(a => (
                  <div key={a.id} className="kfin-bs-row">
                    <span>{a.name}</span>
                    <span style={{ fontFamily: "var(--mono)", fontWeight: 500 }}>
                      NPR {roundAmount(a.balance).toLocaleString()}
                      <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(a.balance / GBP_RATE, "GBP")})</span>
                    </span>
                  </div>
                ))}
                <div className="kfin-bs-total">
                  <span>Total Liabilities</span>
                  <span style={{ color: "var(--terra)" }}>
                    NPR {roundAmount(bs.totalLiabilities).toLocaleString()}
                    <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 6, fontWeight: 500 }}>({asCurrency(bs.totalLiabilities / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
              </div>
              <div className="kfin-block">
                <p className="kfin-block-title" style={{ marginBottom: 14 }}>Equity</p>
                {bs.equity.map(a => (
                  <div key={a.id} className="kfin-bs-row">
                    <span>{a.name}</span>
                    <span style={{ fontFamily: "var(--mono)", fontWeight: 500 }}>
                      NPR {roundAmount(a.balance).toLocaleString()}
                      <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(a.balance / GBP_RATE, "GBP")})</span>
                    </span>
                  </div>
                ))}
                <div className="kfin-bs-total">
                  <span>Total Equity</span>
                  <span>
                    NPR {roundAmount(bs.totalEquity).toLocaleString()}
                    <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 6, fontWeight: 500 }}>({asCurrency(bs.totalEquity / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
                <div className="kfin-bs-check">
                  <span>Liabilities + Equity</span>
                  <span style={{ color: (bs.totalLiabilities + bs.totalEquity) === bs.totalAssets ? "var(--mint-deep)" : "var(--amber)" }}>
                    NPR {roundAmount(bs.totalLiabilities + bs.totalEquity).toLocaleString()}
                    <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 6, fontWeight: 500 }}>({asCurrency((bs.totalLiabilities + bs.totalEquity) / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Bank Transactions ── */}
        {activeTab === "bank" && (
          <>
            {!canEdit && <div className="kfin-notice">ℹ UK admin — view only.</div>}
            {canEdit && (
              <div className="kfin-block">
                <div className="kfin-block-hd">
                  <p className="kfin-block-title">Log Transaction</p>
                  <button className="ghost-button" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => setShowBankForm(v => !v)}>
                    {showBankForm ? "✕ Cancel" : "+ Add Transaction"}
                  </button>
                </div>
                {showBankForm && (
                  <form className="kfin-form" onSubmit={async e => {
                    e.preventDefault();
                    await addDoc(collection(db, "bank_transactions"), {
                      ...bankForm,
                      accountName: "Nabil Bank",
                      amountNPR: Number(bankForm.amountNPR),
                      createdBy: profile?.name || "Unknown",
                      createdAt: serverTimestamp(),
                    });
                    setBankForm({ date: "", description: "", amountNPR: "", type: "debit", category: "", reference: "" });
                    setShowBankForm(false);
                    await loadData();
                  }}>
                    <label className="kfin-label">Date
                      <input type="date" className="kfin-input" value={bankForm.date} required onChange={e => setBankForm(f => ({ ...f, date: e.target.value }))} />
                    </label>
                    <label className="kfin-label">Description
                      <input type="text" className="kfin-input" value={bankForm.description} required placeholder="e.g. Supplier payment — fabric" onChange={e => setBankForm(f => ({ ...f, description: e.target.value }))} />
                    </label>
                    <label className="kfin-label">Amount (NPR)
                      <input type="number" min="0" className="kfin-input" value={bankForm.amountNPR} required placeholder="0" onChange={e => setBankForm(f => ({ ...f, amountNPR: e.target.value }))} />
                    </label>
                    <label className="kfin-label">Type
                      <select className="kfin-select" value={bankForm.type} onChange={e => setBankForm(f => ({ ...f, type: e.target.value }))}>
                        <option value="debit">Debit (money out)</option>
                        <option value="credit">Credit (money in)</option>
                      </select>
                    </label>
                    <label className="kfin-label">Category
                      <select className="kfin-select" value={bankForm.category} onChange={e => setBankForm(f => ({ ...f, category: e.target.value }))}>
                        <option value="">— Select —</option>
                        {["Payroll","Supplier","Rent","Utilities","Tax","Client Payment","Loan","Transfer","Other"].map(c => <option key={c}>{c}</option>)}
                      </select>
                    </label>
                    <label className="kfin-label">Reference / Note
                      <input type="text" className="kfin-input" value={bankForm.reference} placeholder="Cheque no, bank ref, etc." onChange={e => setBankForm(f => ({ ...f, reference: e.target.value }))} />
                    </label>
                    <button type="submit" className="primary-button">Save Transaction</button>
                  </form>
                )}
              </div>
            )}

            {/* Summary strip */}
            {(() => {
              const totalIn  = bankTxns.filter(t => t.type === "credit").reduce((s, t) => s + Number(t.amountNPR || 0), 0);
              const totalOut = bankTxns.filter(t => t.type === "debit").reduce((s, t) => s + Number(t.amountNPR || 0), 0);
              const net = totalIn - totalOut;
              return (
                <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                  {[
                    { label: "Total In", value: totalIn, color: "var(--mint-deep)" },
                    { label: "Total Out", value: totalOut, color: "var(--terra)" },
                    { label: "Net", value: net, color: net >= 0 ? "var(--mint-deep)" : "var(--terra)" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="kfin-kpi" style={{ flex: "1 1 140px" }}>
                      <p className="kfin-kpi-label">{label}</p>
                      <p className="kfin-kpi-value" style={{ color }}>{asCurrency(value, "NPR")}</p>
                      <p className="kfin-kpi-sub">{asCurrency(value / GBP_RATE, "GBP")}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="kfin-block">
              <div className="kfin-block-hd">
                <p className="kfin-block-title">Transactions <span className="kfin-block-sub">({bankTxns.length})</span></p>
              </div>
              <div className="kfin-tbl-wrap">
                <table className="kfin-tbl">
                  <thead>
                    <tr><th>Date</th><th>Description</th><th>Category</th><th>Type</th><th>Amount (NPR)</th><th>Amount (GBP)</th><th>Reference</th>{canEdit && <th></th>}</tr>
                  </thead>
                  <tbody>
                    {bankTxns.length === 0 && (
                      <tr><td colSpan={canEdit ? 8 : 7} style={{ textAlign: "center", color: "var(--ink-4)", padding: "24px 0" }}>No transactions yet — add one above.</td></tr>
                    )}
                    {bankTxns.map(t => (
                      <tr key={t.id}>
                        <td>{t.date || "—"}</td>
                        <td style={{ fontWeight: 500 }}>{t.description}</td>
                        <td>{t.category || "—"}</td>
                        <td>
                          <span style={{ fontWeight: 600, color: t.type === "credit" ? "var(--mint-deep)" : "var(--terra)" }}>
                            {t.type === "credit" ? "Credit" : "Debit"}
                          </span>
                        </td>
                        <td style={{ color: t.type === "credit" ? "var(--mint-deep)" : "var(--terra)", fontWeight: 600 }}>
                          {t.type === "credit" ? "+" : "−"} NPR {roundAmount(t.amountNPR || 0).toLocaleString()}
                        </td>
                        <td style={{ color: "var(--ink-3)" }}>{asCurrency((t.amountNPR || 0) / GBP_RATE, "GBP")}</td>
                        <td style={{ color: "var(--ink-4)", fontSize: 12 }}>{t.reference || "—"}</td>
                        {canEdit && (
                          <td>
                            <button onClick={async () => {
                              if (!window.confirm("Delete this transaction?")) return;
                              await deleteDoc(doc(db, "bank_transactions", t.id));
                              await loadData();
                            }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-5)", fontSize: 16 }}>×</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── Order P&L ── */}
        {activeTab === "order p&l" && (() => {
          // Filtered orders
          const filteredOrders = orders.filter(o => {
            if (oplStatusFilter !== "all") {
              const st = (o.status || o.stage || "").toLowerCase();
              if (oplStatusFilter === "active"    && (st === "completed" || st === "cancelled")) return false;
              if (oplStatusFilter === "completed" && st !== "completed") return false;
            }
            if (oplDateFrom && o.createdAt?.seconds) {
              const d = new Date(o.createdAt.seconds * 1000).toISOString().slice(0, 10);
              if (d < oplDateFrom) return false;
            }
            if (oplDateTo && o.createdAt?.seconds) {
              const d = new Date(o.createdAt.seconds * 1000).toISOString().slice(0, 10);
              if (d > oplDateTo) return false;
            }
            return true;
          });

          // Per-order P&L rows
          const rows = filteredOrders.map(o => {
            const costKey = o.orderId || o.id;
            const costs   = orderCosts[costKey] || {};
            const revenue = Number(o.totalValueNPR || 0);
            const mat     = Number(costs.material || 0);
            // Auto-calculate labour from rate if not manually entered
            const hasManualLabour = costs.labour != null && costs.labour !== "";
            const autoLab = (!hasManualLabour && labourRatePerUnit)
              ? Math.round(labourRatePerUnit * Number(o.quantity || 0))
              : 0;
            const lab     = hasManualLabour ? Number(costs.labour) : autoLab;
            const labIsAuto = !hasManualLabour && autoLab > 0;
            const ovh     = Number(costs.overhead  || 0);
            const shp     = Number(costs.shipping  || 0);
            const totalCost = mat + lab + ovh + shp;
            const profit    = revenue - totalCost;
            const margin    = revenue > 0 ? (profit / revenue) * 100 : null;
            const hasCosts  = mat + lab + ovh + shp > 0;
            return { ...o, costKey, revenue, mat, lab, labIsAuto, ovh, shp, totalCost, profit, margin, hasCosts };
          });

          // KPI summary — exclude Cancelled orders from revenue/cost/profit totals
          const nonCancelledRows = rows.filter(r => (r.status || r.stage || "").toLowerCase() !== "cancelled");
          const kpiRevenue  = nonCancelledRows.reduce((s, r) => s + r.revenue,   0);
          const kpiCost     = nonCancelledRows.reduce((s, r) => s + r.totalCost, 0);
          const kpiProfit   = nonCancelledRows.reduce((s, r) => s + r.profit,    0);
          const withMargin  = nonCancelledRows.filter(r => r.revenue > 0 && r.hasCosts);
          const avgMargin   = withMargin.length
            ? withMargin.reduce((s, r) => s + r.margin, 0) / withMargin.length
            : null;

          // Currently open order
          const openOrder = oplSelectedId ? orders.find(o => o.id === oplSelectedId) : null;
          const openCosts = openOrder ? (orderCosts[openOrder.orderId || openOrder.id] || {}) : {};
          const openRevenue = Number(openOrder?.totalValueNPR || 0);
          const previewMat  = Number(oplCostForm.material || 0);
          const previewLab  = Number(oplCostForm.labour   || 0);
          const previewOvh  = Number(oplCostForm.overhead  || 0);
          const previewShp  = Number(oplCostForm.shipping  || 0);
          const previewTotal  = previewMat + previewLab + previewOvh + previewShp;
          const previewProfit = openRevenue - previewTotal;
          const previewMargin = openRevenue > 0 ? (previewProfit / openRevenue) * 100 : null;

          function marginPill(m) {
            if (m === null) return <span className="kopl-margin-pill kopl-margin-pill--warn">—</span>;
            const cls = m >= 20 ? "kopl-margin-pill--good" : m >= 0 ? "kopl-margin-pill--warn" : "kopl-margin-pill--bad";
            return <span className={`kopl-margin-pill ${cls}`}>{m.toFixed(1)}%</span>;
          }

          return (
            <>
              {/* KPI strip */}
              <div className="kopl-kpis">
                {[
                  { label: "Total Revenue",  value: kpiRevenue,  color: "var(--mint-deep)" },
                  { label: "Total Costs",    value: kpiCost,     color: "var(--terra)"     },
                  { label: "Total Profit",   value: kpiProfit,   color: kpiProfit >= 0 ? "var(--mint-deep)" : "var(--terra)" },
                  { label: "Avg Margin",     value: avgMargin,   color: avgMargin != null && avgMargin >= 0 ? "var(--mint-deep)" : "var(--terra)", isMargin: true },
                ].map(({ label, value, color, isMargin }) => (
                  <div key={label} className="kopl-kpi">
                    <p className="kopl-kpi-label">{label}</p>
                    <p className="kopl-kpi-value" style={{ color }}>
                      {isMargin
                        ? (value != null ? `${value.toFixed(1)}%` : "—")
                        : fmt.npr(value)}
                    </p>
                    {!isMargin && (
                      <p className="kopl-kpi-sub">{asCurrency(value / GBP_RATE, "GBP")}</p>
                    )}
                    {isMargin && (
                      <p className="kopl-kpi-sub">{withMargin.length} orders with cost data</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Labour rate banner */}
              {labourRatePerUnit && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--mint-soft)", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                  <span style={{ color: "var(--mint-deep)", fontWeight: 600 }}>⚡ Auto labour rate:</span>
                  <span style={{ color: "var(--ink-2)" }}>
                    {fmtC(labourRatePerUnit)}/unit — based on last month's payroll ÷ units produced
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-4)" }}>Override per order by entering a manual labour cost</span>
                </div>
              )}

              {/* Filters */}
              <div className="kfin-block">
                <div className="kopl-filters">
                  <label className="kfin-label" style={{ margin: 0, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: "var(--ink-4)", whiteSpace: "nowrap" }}>Status</span>
                    <select className="kfin-select" value={oplStatusFilter} onChange={e => setOplStatusFilter(e.target.value)} style={{ padding: "6px 10px", fontSize: 13 }}>
                      <option value="all">All orders</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>
                  <label className="kfin-label" style={{ margin: 0, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: "var(--ink-4)", whiteSpace: "nowrap" }}>From</span>
                    <input type="date" className="kfin-input" value={oplDateFrom} onChange={e => setOplDateFrom(e.target.value)} style={{ padding: "6px 10px", fontSize: 13 }} />
                  </label>
                  <label className="kfin-label" style={{ margin: 0, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: "var(--ink-4)", whiteSpace: "nowrap" }}>To</span>
                    <input type="date" className="kfin-input" value={oplDateTo} onChange={e => setOplDateTo(e.target.value)} style={{ padding: "6px 10px", fontSize: 13 }} />
                  </label>
                  {(oplStatusFilter !== "all" || oplDateFrom || oplDateTo) && (
                    <button className="ghost-button" style={{ fontSize: 12, padding: "6px 12px" }}
                      onClick={() => { setOplStatusFilter("all"); setOplDateFrom(""); setOplDateTo(""); }}>
                      Clear filters
                    </button>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-4)" }}>
                    {filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""}
                    {filteredOrders.length !== orders.length && ` (of ${orders.length})`}
                  </span>
                </div>

                {/* Table */}
                <div className="kopl-tbl-wrap">
                  <table className="kopl-tbl">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>Customer</th>
                        <th>Qty</th>
                        <th>Revenue (NPR)</th>
                        <th>Material</th>
                        <th>Labour</th>
                        <th>Overhead</th>
                        <th>Shipping</th>
                        <th>Total Cost</th>
                        <th>Profit</th>
                        <th>Margin %</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={13} style={{ textAlign: "center", color: "var(--ink-4)", padding: "32px 0" }}>
                            No orders found. {orders.length === 0 ? "Orders will appear here once created." : "Try adjusting your filters."}
                          </td>
                        </tr>
                      )}
                      {rows.map(row => (
                        <tr key={row.id} className={oplSelectedId === row.id ? "kopl-tbl-selected" : ""}
                          onClick={() => openOplPanel(row)}>
                          <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-4)" }}>{row.orderId || row.id}</td>
                          <td style={{ fontWeight: 500 }}>{row.customerName || "—"}</td>
                          <td style={{ fontFamily: "var(--mono)" }}>{Number(row.quantity || 0).toLocaleString()}</td>
                          <td style={{ fontFamily: "var(--mono)", fontWeight: 600, color: "var(--mint-deep)" }}>
                            {fmtC(row.revenue)}
                          </td>
                          <td style={{ fontFamily: "var(--mono)", color: row.mat ? "var(--ink)" : "var(--ink-5)" }}>
                            {row.mat ? fmtC(row.mat) : "—"}
                          </td>
                          <td style={{ fontFamily: "var(--mono)", color: row.lab ? "var(--ink)" : "var(--ink-5)" }}>
                            {row.lab ? fmtC(row.lab) : "—"}
                            {row.labIsAuto && <span title="Auto-calculated from payroll" style={{ marginLeft: 4, fontSize: 10, color: "var(--mint-deep)", fontFamily: "var(--font)" }}>⚡</span>}
                          </td>
                          <td style={{ fontFamily: "var(--mono)", color: row.ovh ? "var(--ink)" : "var(--ink-5)" }}>
                            {row.ovh ? fmtC(row.ovh) : "—"}
                          </td>
                          <td style={{ fontFamily: "var(--mono)", color: row.shp ? "var(--ink)" : "var(--ink-5)" }}>
                            {row.shp ? fmtC(row.shp) : "—"}
                          </td>
                          <td style={{ fontFamily: "var(--mono)", color: "var(--terra)" }}>
                            {row.hasCosts ? fmtC(row.totalCost) : "—"}
                          </td>
                          <td style={{ fontFamily: "var(--mono)", fontWeight: 600,
                            color: !row.hasCosts ? "var(--ink-5)" : row.profit >= 0 ? "var(--mint-deep)" : "var(--terra)" }}>
                            {row.hasCosts ? (row.profit >= 0 ? "+" : "") + fmtC(row.profit) : "—"}
                          </td>
                          <td>{row.hasCosts ? marginPill(row.margin) : <span className="kopl-margin-pill kopl-margin-pill--warn">No costs</span>}</td>
                          <td>
                            <span style={{
                              display: "inline-block", padding: "2px 8px", borderRadius: "var(--r-pill)",
                              fontSize: 11.5, fontWeight: 600,
                              background: (row.status || "").toLowerCase() === "completed" ? "var(--mint-soft)" : "var(--blue-soft)",
                              color:      (row.status || "").toLowerCase() === "completed" ? "var(--mint-deep)" : "var(--blue)",
                            }}>
                              {row.status || row.stage || "Active"}
                            </span>
                          </td>
                          <td>
                            <button className="ghost-button" style={{ fontSize: 11, padding: "4px 10px" }}
                              onClick={ev => { ev.stopPropagation(); openOplPanel(row); }}>
                              {orderCosts[row.costKey] ? "Edit costs" : "Add costs"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cost entry side panel */}
              {oplSelectedId && openOrder && (
                <div className="kopl-overlay" onClick={() => setOplSelectedId(null)}>
                  <div className="kopl-panel" onClick={e => e.stopPropagation()}>
                    <div className="kopl-panel-hd">
                      <div>
                        <p className="kopl-panel-title">Cost Entry</p>
                        <p className="kopl-panel-sub">
                          {openOrder.orderId || openOrder.id} · {openOrder.customerName || "—"} · {Number(openOrder.quantity || 0).toLocaleString()} pcs
                        </p>
                      </div>
                      <button className="kopl-panel-close" onClick={() => setOplSelectedId(null)}>×</button>
                    </div>

                    <div className="kopl-panel-body">
                      {/* Revenue summary */}
                      <div className="kopl-panel-summary">
                        <div className="kopl-panel-summary-row">
                          <span>Revenue</span>
                          <span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: "var(--mint-deep)" }}>
                            {fmtC(openRevenue)}
                          </span>
                        </div>
                        <div className="kopl-panel-summary-row">
                          <span>Material</span>
                          <span style={{ fontFamily: "var(--mono)" }}>{fmtC(previewMat)}</span>
                        </div>
                        <div className="kopl-panel-summary-row">
                          <span>Labour</span>
                          <span style={{ fontFamily: "var(--mono)" }}>{fmtC(previewLab)}</span>
                        </div>
                        <div className="kopl-panel-summary-row">
                          <span>Overhead</span>
                          <span style={{ fontFamily: "var(--mono)" }}>{fmtC(previewOvh)}</span>
                        </div>
                        <div className="kopl-panel-summary-row">
                          <span>Shipping</span>
                          <span style={{ fontFamily: "var(--mono)" }}>{fmtC(previewShp)}</span>
                        </div>
                        <div className="kopl-panel-summary-row total">
                          <span>Total Cost</span>
                          <span style={{ fontFamily: "var(--mono)", color: "var(--terra)" }}>{fmtC(previewTotal)}</span>
                        </div>
                        <div className={`kopl-panel-summary-row ${previewProfit >= 0 ? "profit-row" : "loss-row"}`}>
                          <span>{previewProfit >= 0 ? "Profit" : "Loss"}</span>
                          <span style={{ fontFamily: "var(--mono)" }}>
                            {fmtC(Math.abs(previewProfit))}
                            {previewMargin !== null && (
                              <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.8 }}>
                                ({previewMargin.toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Cost fields */}
                      <form id="opl-cost-form" onSubmit={saveOplCosts} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {[
                          { key: "material", label: "Material Cost (NPR)", placeholder: "Fabric, trims, thread…" },
                          { key: "labour",   label: "Labour Cost (NPR)",   placeholder: "Cutting, sewing, finishing…" },
                          { key: "overhead", label: "Overhead (NPR)",      placeholder: "Factory, utilities, depreciation…" },
                          { key: "shipping", label: "Shipping (NPR)",      placeholder: "Freight, packaging, customs…" },
                        ].map(({ key, label, placeholder }) => (
                          <label key={key} className="kfin-label" style={{ fontSize: 13, gap: 5 }}>
                            {label}
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className="kfin-input"
                              value={oplCostForm[key]}
                              placeholder={placeholder}
                              onChange={e => setOplCostForm(f => ({ ...f, [key]: e.target.value }))}
                              disabled={!canEdit}
                            />
                          </label>
                        ))}
                        {!canEdit && (
                          <div className="kfin-notice" style={{ margin: 0 }}>ℹ View-only — only Nepal staff can edit costs.</div>
                        )}
                      </form>
                    </div>

                    <div className="kopl-panel-foot">
                      {canEdit && (
                        <button form="opl-cost-form" type="submit" className="primary-button" style={{ flex: 1 }} disabled={oplSaving}>
                          {oplSaving ? "Saving…" : "Save Costs"}
                        </button>
                      )}
                      <button className="ghost-button" style={{ flex: canEdit ? "0 0 auto" : 1, padding: "9px 16px" }}
                        onClick={() => setOplSelectedId(null)}>
                        {canEdit ? "Cancel" : "Close"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}

      </div>
  );
}

export default Finance;

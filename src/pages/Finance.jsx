import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc as fsUpdateDoc,
  writeBatch
} from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import {
  Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";
import AppLayout from "../components/AppLayout";
import { GBP_RATE } from "../constants";
import { db, storage } from "../firebase";
import { asCurrency } from "../utils/format";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit, financeTabAllowed, FINANCE_TAB_KEYS } from "../utils/permissions";

/* ── Seed data ─────────────────────────────────────── */
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

const PURCHASE_CATEGORIES = [
  "Office Supplies", "Equipment / IT", "Equipment", "Consumables",
  "Raw Materials", "Furniture & Fixtures", "Setup / Security", "Setup / IT",
  "Setup / Maintenance", "Machinery / Assets", "Miscellaneous / Events",
  "Miscellaneous", "Rent / Lease", "Professional Fees", "Utilities", "Other"
];

const EXPENSE_CATEGORIES = [
  "Utilities", "Rent / Lease", "Salaries", "Office Supplies",
  "Transport", "Meals & Entertainment", "Marketing", "Professional Fees",
  "Equipment", "Maintenance & Repairs", "Raw Materials", "Consumables",
  "Software & Subscriptions", "Miscellaneous", "Other"
];

const DEFAULT_ACCOUNTS = [
  { name: "Cash", type: "Asset" },
  { name: "Bank Account", type: "Asset" },
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

const emptyPurchaseForm = {
  date: new Date().toISOString().slice(0, 10),
  expenseItem: "", category: "Office Supplies", vatBill: false, amountNPR: ""
};

const initialExpense = {
  category: "Utilities", amountNPR: "",
  date: new Date().toISOString().slice(0, 10), note: "", vatBill: false
};

const emptyJournalForm = {
  date: new Date().toISOString().slice(0, 10),
  description: "", debitAccount: "Cash", creditAccount: "Sales Revenue",
  amountNPR: "", reference: ""
};

function vatLabel(v) {
  if (v === true)  return <span className="badge-ok">Yes</span>;
  if (v === false) return <span className="badge-danger">No</span>;
  return <span className="badge-muted">N/A</span>;
}

const fmtShort = v => v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);

function tabLabel(t) {
  if (t === "vat bills")     return "VAT Bills";
  if (t === "p&l")           return "P & L";
  if (t === "balance sheet") return "Balance Sheet";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const TABS = ["expenses", "purchases", "vat bills", "journal", "ledger", "p&l", "balance sheet", "bank"];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function Finance() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState("expenses");

  const visibleTabs = TABS.filter(t => financeTabAllowed(profile, FINANCE_TAB_KEYS[t]));
  const canEditTab  = (tabLabel) => sectionCanEdit(profile, "finance") && financeTabAllowed(profile, FINANCE_TAB_KEYS[tabLabel]);
  const canEdit     = canEditTab(activeTab);

  /* ── State ── */
  const [payroll, setPayroll]         = useState([]);
  const [employees, setEmployees]     = useState([]);
  const [expenses, setExpenses]       = useState([]);
  const [expenseForm, setExpenseForm] = useState(initialExpense);
  const [purchases, setPurchases]     = useState([]);
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchaseForm);
  const [editingId, setEditingId]     = useState(null);
  const [editForm, setEditForm]       = useState({});
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

  /* ── Accounting state ── */
  const [entries, setEntries]   = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [journalForm, setJournalForm] = useState(emptyJournalForm);
  const [journalSubmitting, setJournalSubmitting] = useState(false);
  const [invoices, setInvoices] = useState([]);

  /* ── Bank transactions state ── */
  const [bankTxns, setBankTxns]       = useState([]);
  const [showBankForm, setShowBankForm] = useState(false);
  const [bankForm, setBankForm]       = useState({ date: "", description: "", amountNPR: "", type: "debit", category: "", reference: "" });

  /* ── Load data ── */
  async function loadData() {
    const [payrollSnap, expensesSnap, purchasesSnap, vatBillsSnap, employeesSnap,
           entriesSnap, accountsSnap, invSnap, bankSnap] = await Promise.all([
      getDocs(collection(db, "finance_payroll")),
      getDocs(collection(db, "finance_expenses")),
      getDocs(collection(db, "finance_purchases")),
      getDocs(collection(db, "vat_bills")),
      getDocs(collection(db, "employees")),
      getDocs(collection(db, "journal_entries")),
      getDocs(collection(db, "accounts")),
      getDocs(collection(db, "invoices")),
      getDocs(collection(db, "bank_transactions")),
    ]);

    setEmployees(employeesSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.status !== "Inactive"));
    setPayroll(payrollSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    const txns = bankSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    txns.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    setBankTxns(txns);

    const expRows = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    expRows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    setExpenses(expRows);

    let purRows = purchasesSnap.docs.filter(d => d.id !== "__seeded__").map(d => ({ id: d.id, ...d.data() }));
    const existingIds = new Set(purRows.map(r => r.expenseId).filter(Boolean));
    const missing = SEED_PURCHASES.filter(p => !existingIds.has(p.expenseId));
    if (missing.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const batch = writeBatch(db);
      missing.forEach(p => batch.set(doc(db, "finance_purchases", p.expenseId), { ...p, date: today, createdAt: serverTimestamp() }));
      await batch.commit();
      const fresh = await getDocs(collection(db, "finance_purchases"));
      purRows = fresh.docs.filter(d => d.id !== "__seeded__").map(d => ({ id: d.id, ...d.data() }));
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
    setPurchases(purRows);

    const bills = vatBillsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    bills.sort((a, b) => (b.uploadedAt?.seconds || 0) - (a.uploadedAt?.seconds || 0));
    setVatBills(bills);
    if (!vatExpenseId && purRows.length > 0) setVatExpenseId(purRows[0].expenseId || "");

    const entryRows = entriesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
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
    }
    const seenAcc = new Set();
    accs = accs.filter(a => { if (seenAcc.has(a.name)) return false; seenAcc.add(a.name); return true; });
    accs.sort((a, b) => a.name.localeCompare(b.name));
    setAccounts(accs);

    setInvoices(invSnap.docs.map(d => d.data()));
  }

  useEffect(() => { loadData().catch(console.error); }, []);

  /* ── Handlers ── */

  function nextExpenseId() {
    const nums = purchases.map(p => parseInt((p.expenseId || "EXP000").replace("EXP", ""), 10)).filter(n => !isNaN(n));
    return `EXP${String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, "0")}`;
  }

  async function addPurchase(e) {
    e.preventDefault(); setSubmitting(true);
    await addDoc(collection(db, "finance_purchases"), {
      expenseId: nextExpenseId(), expenseItem: purchaseForm.expenseItem,
      category: purchaseForm.category, vatBill: purchaseForm.vatBill,
      amountNPR: Number(purchaseForm.amountNPR), date: purchaseForm.date, createdAt: serverTimestamp()
    });
    setPurchaseForm(emptyPurchaseForm);
    await loadData(); setSubmitting(false);
  }

  async function saveEdit(id) {
    await fsUpdateDoc(doc(db, "finance_purchases", id), {
      expenseItem: editForm.expenseItem, category: editForm.category,
      vatBill: editForm.vatBill, amountNPR: Number(editForm.amountNPR), date: editForm.date
    });
    setEditingId(null); await loadData();
  }

  async function deletePurchase(id) {
    if (!window.confirm("Delete this purchase record?")) return;
    await deleteDoc(doc(db, "finance_purchases", id)); await loadData();
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
    await addDoc(collection(db, "journal_entries"), {
      ...journalForm, amountNPR: Number(journalForm.amountNPR),
      createdBy: profile?.name || "Unknown", createdAt: serverTimestamp()
    });
    setJournalForm(emptyJournalForm); await loadData(); setJournalSubmitting(false);
  }

  /* ── Memos ── */
  const summary = useMemo(() => {
    const now = new Date();
    const curMonth = MONTHS[now.getMonth()];
    const curYear  = now.getFullYear();
    const payrollNPR  = payroll
      .filter(r => r.month === curMonth && Number(r.year) === curYear)
      .reduce((s, r) => s + Number(r.netNPR || 0), 0);
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

  const pl = useMemo(() => {
    const salesRevenue  = invoices.filter(i => i.status === "Paid").reduce((s, i) => s + Number(i.subtotalNPR || 0), 0);
    const otherIncome   = entries.filter(e => accounts.find(a => a.name === e.creditAccount && a.type === "Income")).reduce((s, e) => s + Number(e.amountNPR || 0), 0);
    const totalIncome   = salesRevenue + otherIncome;
    const expensesTotal = expenses.reduce((s, r) => s + Number(r.amountNPR || 0), 0);
    const purchasesTotal= purchases.reduce((s, r) => s + Number(r.amountNPR || 0), 0);
    const payrollTotal  = payroll.reduce((s, r) => s + Number(r.netNPR || 0), 0);
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
    { name: "Payroll",   value: summary.payrollNPR,  color: "#5688b0" },
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
    <AppLayout>
      <div className="kfin-wrap">

        {/* ── KPI strip ── */}
        <div className="kfin-kpis">
          <div className="kfin-kpi">
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

          <div className="kfin-kpi">
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
                    <Tooltip formatter={v => [`NPR ${Number(v).toLocaleString()}`, ""]} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 12 }} />
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
                    <Tooltip formatter={v => [`NPR ${Number(v).toLocaleString()}`, "Amount"]} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 12 }} />
                    <Bar dataKey="total" fill="var(--mint-deep)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="kfin-tabs">
          {visibleTabs.map(t => (
            <button key={t} className={`kfin-tab${activeTab === t ? " kfin-tab--on" : ""}`} onClick={() => setActiveTab(t)}>
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
          <>
            <div className="kfin-block">
              <div className="kfin-block-hd">
                <p className="kfin-block-title">Add Purchase</p>
              </div>
              <form className="kfin-form" onSubmit={addPurchase}>
                <label className="kfin-label">Date
                  <input type="date" className="kfin-input" value={purchaseForm.date} required onChange={e => setPurchaseForm(f => ({ ...f, date: e.target.value }))} />
                </label>
                <label className="kfin-label kfin-full">Expense Item
                  <input type="text" className="kfin-input" value={purchaseForm.expenseItem} required placeholder="e.g. Office supplies, Sewing Machine"
                    onChange={e => setPurchaseForm(f => ({ ...f, expenseItem: e.target.value }))} />
                </label>
                <label className="kfin-label">Category
                  <select className="kfin-select" value={purchaseForm.category} onChange={e => setPurchaseForm(f => ({ ...f, category: e.target.value }))}>
                    {PURCHASE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </label>
                <label className="kfin-label">Amount (NPR)
                  <input type="number" min="0" step="1" className="kfin-input" value={purchaseForm.amountNPR} required placeholder="0"
                    onChange={e => setPurchaseForm(f => ({ ...f, amountNPR: e.target.value }))} />
                </label>
                <label className="kfin-label">VAT Bill
                  <div className="vat-toggle" style={{ marginTop: 2 }}>
                    <input type="checkbox" id="vat-check" checked={purchaseForm.vatBill} onChange={e => setPurchaseForm(f => ({ ...f, vatBill: e.target.checked }))} />
                    <label htmlFor="vat-check" className="vat-toggle-label">{purchaseForm.vatBill ? "Yes" : "No"}</label>
                  </div>
                </label>
                <button className="primary-button" type="submit" disabled={submitting} style={{ alignSelf: "flex-end" }}>
                  {submitting ? "Adding…" : "Add Purchase"}
                </button>
              </form>
            </div>

            <div className="kfin-block">
              <div className="kfin-block-hd">
                <p className="kfin-block-title">Purchases <span className="kfin-block-sub">({purchases.length})</span></p>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  NPR {purchaseTotal.toLocaleString()}
                  <span style={{ color: "var(--ink-4)", fontWeight: 400, marginLeft: 8 }}>/ {asCurrency(purchaseTotal / GBP_RATE, "GBP")}</span>
                </span>
              </div>
              <div className="kfin-tbl-wrap">
                <table className="kfin-tbl">
                  <thead><tr><th>Expense ID</th><th>Expense Item</th><th>Category</th><th>VAT Bill</th><th>Amount (NPR)</th><th>Amount (GBP)</th><th>Action</th></tr></thead>
                  <tbody>
                    {purchases.map(row => editingId === row.id ? (
                      <tr key={row.id} style={{ background: "var(--mint-soft)" }}>
                        <td style={{ color: "var(--ink-4)", fontSize: 12 }}>{row.expenseId}</td>
                        <td><input value={editForm.expenseItem} onChange={e => setEditForm(f => ({ ...f, expenseItem: e.target.value }))} className="kfin-input" style={{ padding: "5px 8px", fontSize: 13, minWidth: 160 }} /></td>
                        <td><select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} className="kfin-select" style={{ padding: "5px 8px", fontSize: 13 }}>{PURCHASE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></td>
                        <td>
                          <select value={editForm.vatBill === null ? "na" : editForm.vatBill ? "yes" : "no"}
                            onChange={e => { const v = e.target.value; setEditForm(f => ({ ...f, vatBill: v === "yes" ? true : v === "no" ? false : null })); }}
                            className="kfin-select" style={{ padding: "5px 8px", fontSize: 13 }}>
                            <option value="yes">Yes</option><option value="no">No</option><option value="na">N/A</option>
                          </select>
                        </td>
                        <td><input type="number" value={editForm.amountNPR} onChange={e => setEditForm(f => ({ ...f, amountNPR: e.target.value }))} className="kfin-input" style={{ padding: "5px 8px", fontSize: 13, width: 110 }} /></td>
                        <td style={{ color: "var(--ink-3)", fontFamily: "var(--mono)", fontSize: 13, verticalAlign: "middle" }}>{asCurrency(Number(editForm.amountNPR || 0) / GBP_RATE, "GBP")}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="primary-button" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => saveEdit(row.id)}>Save</button>
                            <button className="ghost-button" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => setEditingId(null)}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={row.id}>
                        <td style={{ color: "var(--ink-4)", fontSize: 12, fontFamily: "var(--mono)" }}>{row.expenseId}</td>
                        <td style={{ fontWeight: 500 }}>{row.expenseItem}</td>
                        <td>{row.category}</td>
                        <td>{vatLabel(row.vatBill)}</td>
                        <td style={{ fontFamily: "var(--mono)" }}>{Number(row.amountNPR || 0).toLocaleString()}</td>
                        <td style={{ color: "var(--ink-3)", fontFamily: "var(--mono)" }}>{asCurrency((row.amountNPR || 0) / GBP_RATE, "GBP")}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="ghost-button" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => { setEditingId(row.id); setEditForm({ ...row }); }}>Edit</button>
                            <button className="ghost-button" style={{ padding: "4px 10px", fontSize: 12, color: "var(--terra)", borderColor: "rgba(196,101,74,.3)" }} onClick={() => deletePurchase(row.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
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
                <form className="kfin-form" onSubmit={addEntry}>
                  <label className="kfin-label">Date
                    <input type="date" className="kfin-input" value={journalForm.date} required onChange={e => setJournalForm(f => ({ ...f, date: e.target.value }))} />
                  </label>
                  <label className="kfin-label">Amount (NPR)
                    <input type="number" min="1" className="kfin-input" value={journalForm.amountNPR} required placeholder="0"
                      onChange={e => setJournalForm(f => ({ ...f, amountNPR: e.target.value }))} />
                  </label>
                  <label className="kfin-label">Debit Account (Dr)
                    <select className="kfin-select" value={journalForm.debitAccount} onChange={e => setJournalForm(f => ({ ...f, debitAccount: e.target.value }))}>
                      {accountNames.map((a, i) => <option key={`${a}-${i}`}>{a}</option>)}
                    </select>
                  </label>
                  <label className="kfin-label">Credit Account (Cr)
                    <select className="kfin-select" value={journalForm.creditAccount} onChange={e => setJournalForm(f => ({ ...f, creditAccount: e.target.value }))}>
                      {accountNames.map((a, i) => <option key={`${a}-${i}`}>{a}</option>)}
                    </select>
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
                      <thead><tr><th>Date</th><th>Description</th><th>Debit (Dr)</th><th>Credit (Cr)</th><th>Amount (NPR)</th><th>Amount (GBP)</th><th>Reference</th><th>Posted By</th></tr></thead>
                      <tbody>
                        {entries.map(entry => (
                          <tr key={entry.id}>
                            <td>{entry.date}</td>
                            <td style={{ fontWeight: 500 }}>{entry.description}</td>
                            <td style={{ color: "var(--mint-deep)", fontWeight: 500 }}>{entry.debitAccount}</td>
                            <td style={{ color: "var(--terra)", fontWeight: 500 }}>{entry.creditAccount}</td>
                            <td style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>NPR {Number(entry.amountNPR || 0).toLocaleString()}</td>
                            <td style={{ color: "var(--ink-3)", fontFamily: "var(--mono)" }}>{asCurrency((entry.amountNPR || 0) / GBP_RATE, "GBP")}</td>
                            <td style={{ color: "var(--ink-4)", fontSize: 12 }}>{entry.reference || "—"}</td>
                            <td style={{ fontSize: 12 }}>{entry.createdBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          </>
        )}

        {/* ── Ledger ── */}
        {activeTab === "ledger" && (
          <div className="kfin-block">
            <div className="kfin-block-hd">
              <p className="kfin-block-title">Account Ledger</p>
            </div>
            {Object.keys(ledger).length === 0
              ? <p style={{ color: "var(--ink-4)", fontSize: 13 }}>No entries yet. Post journal entries to see the ledger.</p>
              : (
                <div className="kfin-ledger-grid">
                  {Object.entries(ledger).sort(([a], [b]) => a.localeCompare(b)).map(([account, data]) => {
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
                              NPR {Math.abs(balance).toLocaleString()}
                            </p>
                            <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, fontFamily: "var(--mono)" }}>
                              ({asCurrency(Math.abs(balance) / GBP_RATE, "GBP")})
                            </p>
                          </div>
                        </div>
                        <div className="kfin-ledger-footer">
                          <span style={{ color: "var(--mint-deep)" }}>
                            Dr: {data.debits.toLocaleString()} <span style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 400 }}>({asCurrency(data.debits / GBP_RATE, "GBP")})</span>
                          </span>
                          <span style={{ color: "var(--terra)" }}>
                            Cr: {data.credits.toLocaleString()} <span style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 400 }}>({asCurrency(data.credits / GBP_RATE, "GBP")})</span>
                          </span>
                          <span style={{ color: "var(--ink-4)", marginLeft: "auto" }}>{data.entryCount} entries</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
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
                    NPR {pl.salesRevenue.toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(pl.salesRevenue / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
                <div className="kfin-pl-row">
                  <span className="kfin-pl-row-label">Other Income (journal)</span>
                  <span className="kfin-pl-row-val">
                    NPR {pl.otherIncome.toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(pl.otherIncome / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
                <div className="kfin-pl-total">
                  <span>Total Income</span>
                  <span style={{ color: "var(--mint-deep)" }}>
                    NPR {pl.totalIncome.toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 6, fontWeight: 500 }}>({asCurrency(pl.totalIncome / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
              </div>
              <div className="kfin-pl-section">
                <p className="kfin-pl-section-title" style={{ color: "var(--terra)" }}>Expenses</p>
                <div className="kfin-pl-row">
                  <span className="kfin-pl-row-label">Operating Expenses</span>
                  <span className="kfin-pl-row-val">
                    NPR {pl.expensesTotal.toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(pl.expensesTotal / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
                <div className="kfin-pl-row">
                  <span className="kfin-pl-row-label">Purchases</span>
                  <span className="kfin-pl-row-val">
                    NPR {pl.purchasesTotal.toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(pl.purchasesTotal / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
                <div className="kfin-pl-row">
                  <span className="kfin-pl-row-label">Payroll</span>
                  <span className="kfin-pl-row-val">
                    NPR {pl.payrollTotal.toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(pl.payrollTotal / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
                {pl.journalExpenses > 0 && (
                  <div className="kfin-pl-row">
                    <span className="kfin-pl-row-label">Journal Expenses</span>
                    <span className="kfin-pl-row-val">
                      NPR {pl.journalExpenses.toLocaleString()}
                      <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(pl.journalExpenses / GBP_RATE, "GBP")})</span>
                    </span>
                  </div>
                )}
                <div className="kfin-pl-total">
                  <span>Total Expenses</span>
                  <span style={{ color: "var(--terra)" }}>
                    NPR {pl.totalExpenses.toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 6, fontWeight: 500 }}>({asCurrency(pl.totalExpenses / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
              </div>
              <div className="kfin-pl-net">
                <span>Net {pl.netProfit >= 0 ? "Profit" : "Loss"}</span>
                <span style={{ color: pl.netProfit >= 0 ? "var(--mint-deep)" : "var(--terra)" }}>
                  NPR {Math.abs(pl.netProfit).toLocaleString()}
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
                  <Tooltip formatter={v => [`NPR ${Number(v).toLocaleString()}`, ""]} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 12 }} />
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
                    NPR {a.balance.toLocaleString()}
                    <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(a.balance / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
              ))}
              <div className="kfin-bs-total">
                <span>Total Assets</span>
                <span style={{ color: "var(--mint-deep)" }}>
                  NPR {bs.totalAssets.toLocaleString()}
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
                      NPR {a.balance.toLocaleString()}
                      <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(a.balance / GBP_RATE, "GBP")})</span>
                    </span>
                  </div>
                ))}
                <div className="kfin-bs-total">
                  <span>Total Liabilities</span>
                  <span style={{ color: "var(--terra)" }}>
                    NPR {bs.totalLiabilities.toLocaleString()}
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
                      NPR {a.balance.toLocaleString()}
                      <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(a.balance / GBP_RATE, "GBP")})</span>
                    </span>
                  </div>
                ))}
                <div className="kfin-bs-total">
                  <span>Total Equity</span>
                  <span>
                    NPR {bs.totalEquity.toLocaleString()}
                    <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 6, fontWeight: 500 }}>({asCurrency(bs.totalEquity / GBP_RATE, "GBP")})</span>
                  </span>
                </div>
                <div className="kfin-bs-check">
                  <span>Liabilities + Equity</span>
                  <span style={{ color: (bs.totalLiabilities + bs.totalEquity) === bs.totalAssets ? "var(--mint-deep)" : "var(--amber)" }}>
                    NPR {(bs.totalLiabilities + bs.totalEquity).toLocaleString()}
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
                          {t.type === "credit" ? "+" : "−"} NPR {Number(t.amountNPR || 0).toLocaleString()}
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

      </div>
    </AppLayout>
  );
}

export default Finance;

import { useEffect, useMemo, useState } from "react";
import { fetchAll, insertRow } from "../lib/db";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip
} from "recharts";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { asCurrency } from "../utils/format";
import { GBP_RATE, createdAfterCutoff } from "../constants";
import { useRegion } from "../context/RegionContext";
import { RegionSwitch } from "../components/RegionSwitch";
import { countUntagged, filterByRegion } from "../utils/region";

const DEFAULT_ACCOUNTS = [
  { name: "Cash", type: "Asset" },
  { name: "Bank Account", type: "Asset" },
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

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  description: "",
  debitAccount: "Cash",
  creditAccount: "Sales Revenue",
  amountNPR: "",
  reference: "",
  region: ""
};

const fmt = v => v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);

function Accounting() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "nepal_admin";
  const [activeTab, setActiveTab] = useState("journal");

  const { region } = useRegion();

  const [allEntries, setEntries] = useState([]);
  const [allAccounts, setAccounts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // Pull from other collections for P&L
  const [allExpenses, setExpenses] = useState([]);
  const [allPurchases, setPurchases] = useState([]);
  const [allPayroll, setPayroll] = useState([]);
  const [allInvoices, setInvoices] = useState([]);

  /* ── One set of books at a time ────────────────────────────
     The ledger, the P&L and the balance sheet are all built out of these five
     lists, so narrowing them here is what makes "UK profit" and "Nepal profit"
     two different numbers rather than one blended one. Payroll follows the
     employee's own location rather than a tag of its own — see migration 0029. */
  const entries   = useMemo(() => filterByRegion(allEntries,   region), [allEntries,   region]);
  const accounts  = useMemo(() => filterByRegion(allAccounts,  region), [allAccounts,  region]);
  const expenses  = useMemo(() => filterByRegion(allExpenses,  region), [allExpenses,  region]);
  const purchases = useMemo(() => filterByRegion(allPurchases, region), [allPurchases, region]);
  const payroll   = useMemo(() => filterByRegion(allPayroll,   region), [allPayroll,   region]);
  const invoices  = useMemo(() => filterByRegion(allInvoices,  region), [allInvoices,  region]);

  async function loadData() {
    const [entryRowsAll, accountRows, expRows, purRows, payRows, invRows] = await Promise.all([
      fetchAll("journal_entries"),
      fetchAll("accounts"),
      fetchAll("finance_expenses"),
      fetchAll("finance_purchases"),
      fetchAll("finance_payroll"),
      fetchAll("invoices"),
    ]);

    const entryRows = entryRowsAll.filter(r => createdAfterCutoff(r));
    entryRows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    setEntries(entryRows);

    let accs = accountRows;
    if (accs.length === 0) {
      for (const acc of DEFAULT_ACCOUNTS) {
        await insertRow("accounts", acc);
      }
      accs = await fetchAll("accounts");
    }
    // Deduplicate by name — keep first occurrence per name
    const seen = new Set();
    accs = accs.filter(a => { if (seen.has(a.name)) return false; seen.add(a.name); return true; });
    accs.sort((a, b) => a.name.localeCompare(b.name));
    setAccounts(accs);

    setExpenses(expRows);
    setPurchases(purRows.filter(d => d.expenseId).filter(d => createdAfterCutoff(d)));
    setPayroll(payRows);
    setInvoices(invRows);
  }

  useEffect(() => { loadData().catch(console.error); }, []);

  async function addEntry(e) {
    e.preventDefault();
    if (form.debitAccount === form.creditAccount) {
      alert("Debit and Credit accounts must be different.");
      return;
    }
    setSubmitting(true);
    await insertRow("journal_entries", {
      ...form,
      region: form.region || region,
      amountNPR: Number(form.amountNPR),
      createdBy: profile?.name || "Unknown",
    });
    setForm(emptyForm);
    await loadData();
    setSubmitting(false);
  }

  // Build ledger map
  const ledger = useMemo(() => {
    const map = {};
    for (const entry of entries) {
      [entry.debitAccount, entry.creditAccount].forEach(acc => {
        if (!map[acc]) map[acc] = { debits: 0, credits: 0, entryCount: 0 };
      });
      map[entry.debitAccount].debits += Number(entry.amountNPR || 0);
      map[entry.debitAccount].entryCount++;
      map[entry.creditAccount].credits += Number(entry.amountNPR || 0);
      map[entry.creditAccount].entryCount++;
    }
    return map;
  }, [entries]);

  // P&L
  const pl = useMemo(() => {
    const salesRevenue = invoices.filter(i => i.status === "Paid").reduce((s, i) => s + Number(i.subtotalNPR || 0), 0);
    const otherIncome = entries.filter(e => accounts.find(a => a.name === e.creditAccount && a.type === "Income"))
      .reduce((s, e) => s + Number(e.amountNPR || 0), 0);
    const totalIncome = salesRevenue + otherIncome;

    const expensesTotal = expenses.reduce((s, r) => s + Number(r.amountNPR || 0), 0);
    const purchasesTotal = purchases.reduce((s, r) => s + Number(r.amountNPR || 0), 0);
    const payrollTotal = payroll.reduce((s, r) => s + Number(r.netNPR || 0), 0);
    const journalExpenses = entries.filter(e => accounts.find(a => a.name === e.debitAccount && a.type === "Expense"))
      .reduce((s, e) => s + Number(e.amountNPR || 0), 0);
    const totalExpenses = expensesTotal + purchasesTotal + payrollTotal + journalExpenses;

    return {
      salesRevenue, otherIncome, totalIncome,
      expensesTotal, purchasesTotal, payrollTotal, journalExpenses,
      totalExpenses,
      netProfit: totalIncome - totalExpenses
    };
  }, [entries, accounts, expenses, purchases, payroll, invoices]);

  // Balance sheet
  const bs = useMemo(() => {
    const balance = (name, type) => {
      const data = ledger[name] || { debits: 0, credits: 0 };
      return type === "Asset" ? data.debits - data.credits : data.credits - data.debits;
    };
    const assets = accounts.filter(a => a.type === "Asset").map(a => ({ ...a, balance: balance(a.name, "Asset") }));
    const liabilities = accounts.filter(a => a.type === "Liability").map(a => ({ ...a, balance: balance(a.name, "Liability") }));
    const equity = accounts.filter(a => a.type === "Equity").map(a => ({ ...a, balance: balance(a.name, "Equity") }));
    return {
      assets, liabilities, equity,
      totalAssets: assets.reduce((s, a) => s + a.balance, 0),
      totalLiabilities: liabilities.reduce((s, a) => s + a.balance, 0),
      totalEquity: equity.reduce((s, a) => s + a.balance, 0),
    };
  }, [accounts, ledger]);

  const accountNames = [...new Set(accounts.map(a => a.name))];

  const plChartData = [
    { name: "Income", value: pl.totalIncome, fill: "#2e7d32" },
    { name: "Expenses", value: pl.totalExpenses, fill: "#c62828" },
    { name: "Net Profit", value: Math.max(0, pl.netProfit), fill: "#66bb6a" },
  ];

  return (
      <PageHeader
        title="Accounting"
        description="Journal entries, ledger, profit &amp; loss statement and balance sheet."
        action={<RegionSwitch untagged={countUntagged(allEntries)} />}
      />

      {/* Summary cards */}
      <section className="stats-grid">
        <article className="stat-card">
          <p className="stat-title">Total Income</p>
          <h3 className="stat-value">{asCurrency(pl.totalIncome, "NPR")}</h3>
          <p className="stat-note">{asCurrency(pl.totalIncome / GBP_RATE, "GBP")}</p>
        </article>
        <article className="stat-card">
          <p className="stat-title">Total Expenses</p>
          <h3 className="stat-value">{asCurrency(pl.totalExpenses, "NPR")}</h3>
          <p className="stat-note">{asCurrency(pl.totalExpenses / GBP_RATE, "GBP")}</p>
        </article>
        <article className={`stat-card${pl.netProfit < 0 ? " warning" : ""}`}>
          <p className="stat-title">Net {pl.netProfit >= 0 ? "Profit" : "Loss"}</p>
          <h3 className="stat-value">{asCurrency(Math.abs(pl.netProfit), "NPR")}</h3>
          <p className="stat-note">{asCurrency(Math.abs(pl.netProfit) / GBP_RATE, "GBP")}</p>
        </article>
        <article className="stat-card">
          <p className="stat-title">Journal Entries</p>
          <h3 className="stat-value">{entries.length}</h3>
          <p className="stat-note">{accounts.length} accounts</p>
        </article>
      </section>

      {/* Tabs */}
      <div className="tab-row">
        {["journal", "ledger", "p&l", "balance sheet"].map(t => (
          <button key={t} className={activeTab === t ? "tab-button active" : "tab-button"}
            onClick={() => setActiveTab(t)}>
            {t === "p&l" ? "P & L" : t === "balance sheet" ? "Balance Sheet" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Journal ── */}
      {activeTab === "journal" && (
        <>
          {canEdit && (
            <section className="panel">
              <h3>Post Journal Entry</h3>
              <form className="grid-form" onSubmit={addEntry}>
                <label>
                  Date
                  <input type="date" value={form.date} required
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </label>
                <label>
                  Amount (NPR)
                  <input type="number" min="1" value={form.amountNPR} required placeholder="0"
                    onChange={e => setForm(f => ({ ...f, amountNPR: e.target.value }))} />
                </label>
                <label>
                  Debit Account (Dr)
                  <select value={form.debitAccount}
                    onChange={e => setForm(f => ({ ...f, debitAccount: e.target.value }))}>
                    {accountNames.map((a, i) => <option key={`${a}-${i}`}>{a}</option>)}
                  </select>
                </label>
                <label>
                  Credit Account (Cr)
                  <select value={form.creditAccount}
                    onChange={e => setForm(f => ({ ...f, creditAccount: e.target.value }))}>
                    {accountNames.map((a, i) => <option key={`${a}-${i}`}>{a}</option>)}
                  </select>
                </label>
                <label style={{ gridColumn: "span 2" }}>
                  Description
                  <input type="text" value={form.description} required placeholder="Transaction description"
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </label>
                <label>
                  Reference (optional)
                  <input type="text" value={form.reference} placeholder="Invoice # / PO # etc."
                    onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
                </label>
                <button type="submit" className="primary-button" disabled={submitting} style={{ alignSelf: "flex-end" }}>
                  {submitting ? "Posting…" : "Post Entry"}
                </button>
              </form>
            </section>
          )}
          {!canEdit && <p className="banner-warning">UK admin view-only mode.</p>}

          <section className="panel">
            <h3>Journal <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>({entries.length} entries)</span></h3>
            {entries.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No journal entries yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Debit (Dr)</th>
                      <th>Credit (Cr)</th>
                      <th>Amount (NPR)</th>
                      <th>Reference</th>
                      <th>Posted By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(entry => (
                      <tr key={entry.id}>
                        <td>{entry.date}</td>
                        <td style={{ fontWeight: 500 }}>{entry.description}</td>
                        <td style={{ color: "var(--ok)", fontWeight: 500 }}>{entry.debitAccount}</td>
                        <td style={{ color: "var(--danger)", fontWeight: 500 }}>{entry.creditAccount}</td>
                        <td style={{ fontFamily: "monospace", fontWeight: 600 }}>
                          NPR {Number(entry.amountNPR || 0).toLocaleString()}
                        </td>
                        <td style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{entry.reference || "—"}</td>
                        <td style={{ fontSize: "0.82rem" }}>{entry.createdBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* ── Ledger ── */}
      {activeTab === "ledger" && (
        <section className="panel">
          <h3>Account Ledger</h3>
          {Object.keys(ledger).length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No entries yet. Post journal entries to see the ledger.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14, marginTop: 8 }}>
              {Object.entries(ledger).sort(([a], [b]) => a.localeCompare(b)).map(([account, data]) => {
                const accInfo = accounts.find(a => a.name === account);
                const accType = accInfo?.type || "Unknown";
                const isAsset = accType === "Asset";
                const balance = isAsset ? data.debits - data.credits : data.credits - data.debits;
                const typeColor = { Asset: "var(--ok)", Liability: "var(--danger)", Equity: "var(--warn)", Income: "#1565c0", Expense: "var(--danger)" };
                return (
                  <div key={account} style={{ background: "var(--bg-surface-soft)", borderRadius: 10, padding: "14px 16px", border: "1.5px solid var(--line)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>{account}</p>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: typeColor[accType] || "var(--text-muted)" }}>{accType.toUpperCase()}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Balance</p>
                        <p style={{ fontWeight: 700, fontSize: "0.95rem", color: balance >= 0 ? "var(--ok)" : "var(--danger)" }}>
                          NPR {Math.abs(balance).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: "0.83rem", borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                      <span style={{ color: "var(--ok)" }}>Dr: NPR {data.debits.toLocaleString()}</span>
                      <span style={{ color: "var(--danger)" }}>Cr: NPR {data.credits.toLocaleString()}</span>
                      <span style={{ color: "var(--text-muted)", marginLeft: "auto" }}>{data.entryCount} entries</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── P&L ── */}
      {activeTab === "p&l" && (
        <div className="kacc-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 14 }}>
          <section className="panel">
            <h3>Profit & Loss Statement</h3>
            <div style={{ marginTop: 14, fontSize: "0.9rem" }}>
              {/* Income */}
              <div style={{ padding: "0 0 12px", borderBottom: "1.5px solid var(--line)", marginBottom: 12 }}>
                <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--ok)", letterSpacing: "0.06em", marginBottom: 8 }}>INCOME</p>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ color: "var(--text-muted)" }}>Sales Revenue (paid invoices)</span>
                  <span>NPR {pl.salesRevenue.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ color: "var(--text-muted)" }}>Other Income (journal)</span>
                  <span>NPR {pl.otherIncome.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, paddingTop: 8, marginTop: 4, borderTop: "1px solid var(--line)" }}>
                  <span>Total Income</span>
                  <span style={{ color: "var(--ok)" }}>NPR {pl.totalIncome.toLocaleString()}</span>
                </div>
              </div>

              {/* Expenses */}
              <div style={{ padding: "0 0 12px", borderBottom: "1.5px solid var(--line)", marginBottom: 12 }}>
                <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--danger)", letterSpacing: "0.06em", marginBottom: 8 }}>EXPENSES</p>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ color: "var(--text-muted)" }}>Operating Expenses</span>
                  <span>NPR {pl.expensesTotal.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ color: "var(--text-muted)" }}>Purchases</span>
                  <span>NPR {pl.purchasesTotal.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ color: "var(--text-muted)" }}>Payroll</span>
                  <span>NPR {pl.payrollTotal.toLocaleString()}</span>
                </div>
                {pl.journalExpenses > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                    <span style={{ color: "var(--text-muted)" }}>Journal Expenses</span>
                    <span>NPR {pl.journalExpenses.toLocaleString()}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, paddingTop: 8, marginTop: 4, borderTop: "1px solid var(--line)" }}>
                  <span>Total Expenses</span>
                  <span style={{ color: "var(--danger)" }}>NPR {pl.totalExpenses.toLocaleString()}</span>
                </div>
              </div>

              {/* Net */}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "1.05rem", padding: "8px 0" }}>
                <span>Net {pl.netProfit >= 0 ? "Profit" : "Loss"}</span>
                <span style={{ color: pl.netProfit >= 0 ? "var(--ok)" : "var(--danger)" }}>
                  NPR {Math.abs(pl.netProfit).toLocaleString()}
                </span>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "right" }}>
                {asCurrency(Math.abs(pl.netProfit) / GBP_RATE, "GBP")}
              </p>
            </div>
          </section>

          <section className="panel">
            <h3>Income vs Expenses</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={plChartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dde8dd" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#637363" }} />
                <YAxis tickFormatter={fmt} tick={{ fontSize: 10, fill: "#637363" }} width={46} />
                <Tooltip formatter={v => [`NPR ${Number(v).toLocaleString()}`, ""]}
                  contentStyle={{ borderRadius: 10, border: "1px solid #dde8dd", fontSize: "0.82rem" }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {plChartData.map((entry, i) => (
                    <rect key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>
        </div>
      )}

      {/* ── Balance Sheet ── */}
      {activeTab === "balance sheet" && (
        <div className="kacc-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* Assets */}
          <section className="panel">
            <h3 style={{ color: "var(--ok)" }}>Assets</h3>
            <div style={{ marginTop: 10 }}>
              {bs.assets.map(a => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: "0.9rem" }}>
                  <span>{a.name}</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 500 }}>NPR {a.balance.toLocaleString()}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: 700, fontSize: "1rem", marginTop: 4 }}>
                <span>Total Assets</span>
                <span style={{ color: "var(--ok)" }}>NPR {bs.totalAssets.toLocaleString()}</span>
              </div>
            </div>
          </section>

          {/* Liabilities + Equity */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <section className="panel">
              <h3 style={{ color: "var(--danger)" }}>Liabilities</h3>
              <div style={{ marginTop: 10 }}>
                {bs.liabilities.map(a => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: "0.9rem" }}>
                    <span>{a.name}</span>
                    <span style={{ fontFamily: "monospace", fontWeight: 500 }}>NPR {a.balance.toLocaleString()}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: 700, fontSize: "1rem" }}>
                  <span>Total Liabilities</span>
                  <span style={{ color: "var(--danger)" }}>NPR {bs.totalLiabilities.toLocaleString()}</span>
                </div>
              </div>
            </section>

            <section className="panel">
              <h3>Equity</h3>
              <div style={{ marginTop: 10 }}>
                {bs.equity.map(a => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: "0.9rem" }}>
                    <span>{a.name}</span>
                    <span style={{ fontFamily: "monospace", fontWeight: 500 }}>NPR {a.balance.toLocaleString()}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: 700, fontSize: "1rem" }}>
                  <span>Total Equity</span>
                  <span>NPR {bs.totalEquity.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: 700, fontSize: "0.95rem", borderTop: "2px solid var(--line)", marginTop: 4 }}>
                  <span>Liabilities + Equity</span>
                  <span style={{ color: (bs.totalLiabilities + bs.totalEquity) === bs.totalAssets ? "var(--ok)" : "var(--warn)" }}>
                    NPR {(bs.totalLiabilities + bs.totalEquity).toLocaleString()}
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
  );
}

export default Accounting;

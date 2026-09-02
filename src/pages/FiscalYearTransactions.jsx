import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchAll } from "../lib/db";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { financeTabAllowed } from "../utils/permissions";
import { GBP_RATE } from "../constants";
import { asCurrency, roundAmount } from "../utils/format";
import {
  slugToFiscalYear, fiscalYearToSlug, fiscalYearDateRangeAD,
  fiscalYearForDate, parseFiscalYearLabel,
} from "../utils/fiscalYear";
import { useRegion } from "../context/RegionContext";
import { RegionSwitch } from "../components/RegionSwitch";
import { inRegion } from "../utils/region";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const TYPE_STYLE = {
  Expense: { color: "var(--terra)",     bg: "var(--terra-soft)" },
  Purchase:{ color: "var(--terra)",     bg: "var(--terra-soft)" },
  Payroll: { color: "var(--blue)",      bg: "var(--blue-soft)" },
  Journal: { color: "var(--amber)",     bg: "var(--amber-soft)" },
  Bank:    { color: "var(--ink-2)",     bg: "var(--bg-2)" },
  Sales:   { color: "var(--mint-deep)", bg: "var(--mint-soft)" },
};

function TypePill({ type }) {
  const t = TYPE_STYLE[type] || { color: "var(--ink-3)", bg: "var(--bg-2)" };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
      color: t.color, background: t.bg, whiteSpace: "nowrap",
    }}>
      {type}
    </span>
  );
}

export default function FiscalYearTransactions() {
  const { fy: fySlug } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { region } = useRegion();
  const fiscalYear = slugToFiscalYear(fySlug);
  const fyRange = useMemo(() => fiscalYearDateRangeAD(fiscalYear), [fiscalYear]);

  const canExpenses = financeTabAllowed(profile, "expenses");
  const canPurchases = financeTabAllowed(profile, "purchases");
  const canPayroll   = financeTabAllowed(profile, "payroll");
  const canJournal   = financeTabAllowed(profile, "journal");
  const canBank      = financeTabAllowed(profile, "bank");
  const anyAccess = canExpenses || canPurchases || canPayroll || canJournal || canBank;

  const [loading, setLoading] = useState(true);
  // Every transaction, tagged with the fiscal year it falls in. Holding all of
  // them rather than only the year on screen is what lets the Prev/Next buttons
  // know which years actually contain anything — and it means changing year is
  // a re-filter rather than another six round trips.
  const [allRows, setAllRows] = useState([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!anyAccess) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      // The finance-tab checks below only decide what to bother fetching. RLS
      // re-applies them server-side, so a tab someone cannot see returns
      // nothing even if this list were wrong.
      const [expRows, purRows, payrollRows, journalRows, bankRows, invRows] = await Promise.all([
        canExpenses  ? fetchAll("finance_expenses")  : [],
        canPurchases ? fetchAll("finance_purchases") : [],
        canPayroll   ? fetchAll("finance_payroll")   : [],
        canJournal   ? fetchAll("journal_entries")   : [],
        canBank      ? fetchAll("bank_transactions") : [],
        canPurchases || canJournal ? fetchAll("invoices") : [],
      ]);
      if (cancelled) return;

      const out = [];
      // fy is null for a row with an unusable date; those are dropped, the
      // same as before when they matched no year.
      const push = (fy, row) => { if (fy) out.push({ ...row, fy }); };

      expRows.forEach(r => {
        push(fiscalYearForDate(r.date), { id: `exp-${r.id}`, region: r.region, type: "Expense", date: r.date, description: `${r.category || "Expense"}${r.note ? " — " + r.note : ""}`, amountNPR: Number(r.amountNPR || 0), sign: -1 });
      });

      purRows.forEach(r => {
        push(fiscalYearForDate(r.date), { id: `pur-${r.id}`, region: r.region, type: "Purchase", date: r.date, description: `${r.expenseItem || r.expenseId || "Purchase"}${r.category ? " — " + r.category : ""}`, amountNPR: Number(r.amountNPR || 0), sign: -1 });
      });

      payrollRows.forEach(r => {
        const monthIdx = MONTHS.indexOf(r.month);
        const repDate = r.year && monthIdx >= 0 ? `${r.year}-${String(monthIdx + 1).padStart(2, "0")}-01` : null;
        push(repDate && fiscalYearForDate(repDate), { id: `pay-${r.id}`, region: r.region, type: "Payroll", date: repDate, description: `${r.staffName || "Staff"}${r.role ? " — " + r.role : ""} (${r.month} ${r.year})`, amountNPR: Number(r.grossNPR || r.netNPR || 0), sign: -1 });
      });

      journalRows.forEach(r => {
        push(fiscalYearForDate(r.date), { id: `jnl-${r.id}`, region: r.region, type: "Journal", date: r.date, description: `${r.description || "Journal entry"} (Dr ${r.debitAccount} / Cr ${r.creditAccount})`, amountNPR: Number(r.amountNPR || 0), sign: 0 });
      });

      bankRows.forEach(r => {
        // The view calls the column "amount", and the stored type is capitalised
        // ("Credit"/"Debit") — comparing against "credit" made every
        // transaction an outflow of zero.
        push(fiscalYearForDate(r.date), { id: `bnk-${r.id}`, region: r.region, type: "Bank", date: r.date, description: r.description || "Bank transaction", amountNPR: Number(r.amount ?? 0), sign: String(r.type || "").toLowerCase() === "credit" ? 1 : -1 });
      });

      invRows.forEach(r => {
        if (r.status !== "Paid") return;
        const val = Number(r.totalNPR || 0);
        const amt = r.currency === "GBP" ? val * GBP_RATE : val;
        push(fiscalYearForDate(r.date), { id: `inv-${r.id}`, region: r.region, type: "Sales", date: r.date, description: `${r.clientName || ""}${r.invoiceNumber ? " — " + r.invoiceNumber : ""}`, amountNPR: amt, sign: 1 });
      });

      out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      if (!cancelled) { setAllRows(out); setLoading(false); }
    })().catch(err => { console.error(err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // Deliberately not keyed on fiscalYear — the data covers every year, so
    // switching year filters what we already have.
  }, [anyAccess, canExpenses, canPurchases, canPayroll, canJournal, canBank]);

  // Year and region are the two things this page is a slice of. Totals, the
  // type pills and the table all read `rows`, so both cuts land everywhere.
  const rows = useMemo(
    () => allRows.filter(r => r.fy === fiscalYear && inRegion(r, region)),
    [allRows, fiscalYear, region]
  );

  /**
   * Fiscal years that actually contain something, oldest first.
   *
   * The current year is always included even when empty: it is where a first
   * transaction will land, so refusing to show it would be strange, and it
   * keeps the page navigable when the books are brand new.
   */
  const yearsWithData = useMemo(() => {
    const years = new Set(allRows.map(r => r.fy));
    years.add(fiscalYear);
    return [...years].sort((a, b) => parseFiscalYearLabel(a).startYear - parseFiscalYearLabel(b).startYear);
  }, [allRows, fiscalYear]);

  // The next populated year in each direction, or null when there is none.
  // Stepping to the neighbouring year would strand you on an empty page, and
  // skipping to the nearest one with records means a gap in the books does not
  // cut off everything behind it.
  const here = yearsWithData.indexOf(fiscalYear);
  const prevYear = here > 0 ? yearsWithData[here - 1] : null;
  const nextYear = here >= 0 && here < yearsWithData.length - 1 ? yearsWithData[here + 1] : null;

  const filtered = useMemo(() => {
    let list = rows;
    if (typeFilter !== "all") list = list.filter(r => r.type === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(r => r.description.toLowerCase().includes(q));
    return list;
  }, [rows, typeFilter, search]);

  const totals = useMemo(() => {
    const byType = {};
    for (const r of rows) byType[r.type] = (byType[r.type] || 0) + r.amountNPR;
    const inflow  = rows.filter(r => r.sign > 0).reduce((s, r) => s + r.amountNPR, 0);
    const outflow = rows.filter(r => r.sign < 0).reduce((s, r) => s + r.amountNPR, 0);
    return { byType, inflow, outflow, net: inflow - outflow };
  }, [rows]);

  function gotoYear(label) {
    if (!label) return;
    navigate(`/finance/${fiscalYearToSlug(label)}`);
  }

  const types = ["Expense", "Purchase", "Payroll", "Journal", "Bank", "Sales"].filter(t => rows.some(r => r.type === t));

  return (
    <div className="kfin-wrap">
      <button type="button" className="ghost-button" style={{ alignSelf: "flex-start", marginBottom: 12 }} onClick={() => navigate("/finance")}>
        ← Back to Finance
      </button>

      <PageHeader
        title={`Transactions — FY ${fiscalYear}`}
        description={`${fyRange.startAD} to ${fyRange.endAD} (B.S. Shrawan 1 – Ashar end)`}
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <RegionSwitch hint={false} size="sm" />
            {/* Disabled, with the reason in the tooltip, rather than hidden —
                a control that vanishes reads as a bug, and the title explains
                that there is simply nothing recorded further back or forward. */}
            <button
              className="ghost-button"
              style={{ padding: "6px 12px" }}
              disabled={loading || !prevYear}
              title={prevYear ? `Go to FY ${prevYear}` : "No earlier transactions recorded"}
              onClick={() => gotoYear(prevYear)}
            >
              ← {prevYear ? `FY ${prevYear}` : "Prev Year"}
            </button>
            <button
              className="ghost-button"
              style={{ padding: "6px 12px" }}
              disabled={loading || !nextYear}
              title={nextYear ? `Go to FY ${nextYear}` : "No later transactions recorded"}
              onClick={() => gotoYear(nextYear)}
            >
              {nextYear ? `FY ${nextYear}` : "Next Year"} →
            </button>
          </div>
        }
      />

      {!anyAccess && (
        <div className="kfin-notice">ℹ You don't have permission to view Finance transactions.</div>
      )}

      {anyAccess && (
        <>
          {/* Summary strip */}
          <div className="kfin-kpis" style={{ marginBottom: 16 }}>
            <div className="kfin-kpi">
              <p className="kfin-kpi-label">Total Records</p>
              <p className="kfin-kpi-value">{rows.length}</p>
            </div>
            <div className="kfin-kpi">
              <p className="kfin-kpi-label">Money In (Sales + Bank Credits)</p>
              <p className="kfin-kpi-value" style={{ color: "var(--mint-deep)" }}>{asCurrency(totals.inflow, "NPR")}</p>
            </div>
            <div className="kfin-kpi">
              <p className="kfin-kpi-label">Money Out (Expenses/Purchases/Payroll/Bank Debits)</p>
              <p className="kfin-kpi-value" style={{ color: "var(--terra)" }}>{asCurrency(totals.outflow, "NPR")}</p>
            </div>
            <div className="kfin-kpi">
              <p className="kfin-kpi-label">Net</p>
              <p className="kfin-kpi-value" style={{ color: totals.net >= 0 ? "var(--mint-deep)" : "var(--terra)" }}>{asCurrency(totals.net, "NPR")}</p>
            </div>
          </div>

          {/* Per-type breakdown */}
          {types.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
              {types.map(t => (
                <div key={t} className="kfin-kpi" style={{ flex: "1 1 150px" }}>
                  <TypePill type={t} />
                  <p className="kfin-kpi-value" style={{ marginTop: 6, fontSize: 18 }}>{asCurrency(totals.byType[t] || 0, "NPR")}</p>
                  <p className="kfin-kpi-sub">{rows.filter(r => r.type === t).length} records</p>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="kopl-filters" style={{ marginBottom: 14 }}>
            <label className="kfin-label" style={{ margin: 0, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 12, color: "var(--ink-4)", whiteSpace: "nowrap" }}>Type</span>
              <select className="kfin-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: "6px 10px", fontSize: 13 }}>
                <option value="all">All types</option>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <input
              type="text" className="kfin-input" placeholder="Search description…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ padding: "6px 10px", fontSize: 13, maxWidth: 240 }}
            />
          </div>

          {/* Transaction list */}
          <div className="kfin-block">
            <div className="kfin-block-hd">
              <p className="kfin-block-title">Transactions <span className="kfin-block-sub">({filtered.length})</span></p>
            </div>
            {loading ? (
              <p style={{ color: "var(--ink-4)", fontSize: 13 }}>Loading…</p>
            ) : filtered.length === 0 ? (
              <p style={{ color: "var(--ink-4)", fontSize: 13 }}>No transactions found for FY {fiscalYear}.</p>
            ) : (
              <div className="kfin-tbl-wrap">
                <table className="kfin-tbl">
                  <thead><tr><th>Date</th><th>Type</th><th>Description</th><th style={{ textAlign: "right" }}>Amount (NPR)</th></tr></thead>
                  <tbody>
                    {filtered.map(r => (
                      <tr key={r.id}>
                        <td>{r.date || "—"}</td>
                        <td><TypePill type={r.type} /></td>
                        <td>{r.description}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--mono)", fontWeight: 600, color: r.sign > 0 ? "var(--mint-deep)" : r.sign < 0 ? "var(--terra)" : "var(--ink)" }}>
                          {r.sign > 0 ? "+" : r.sign < 0 ? "−" : ""} {roundAmount(r.amountNPR).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

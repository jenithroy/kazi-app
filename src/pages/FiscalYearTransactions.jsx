import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchAll, insertRow, updateRow } from "../lib/db";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { financeTabAllowed, financeTabCanEdit, sectionCanEdit } from "../utils/permissions";
import { GBP_RATE } from "../constants";
import { asCurrency, roundAmount } from "../utils/format";
import {
  slugToFiscalYear, fiscalYearToSlug, fiscalYearDateRangeAD,
  fiscalYearForDate, parseFiscalYearLabel, fmtDateBS,
} from "../utils/fiscalYear";
import { useRegion } from "../context/RegionContext";
import { RegionSwitch } from "../components/RegionSwitch";
import { inRegion } from "../utils/region";
import {
  FiscalYearRowGroup, MONTHS, COLL_BY_TYPE, TAB_BY_TYPE,
  initialRowData, rowDate, rowError, rowUpdates, salesSettlement,
} from "../components/FiscalYearRowGroup";
import { applyItemChange, addLineItem, removeLineItem } from "../components/PurchaseRowGroup";
import { deleteTransaction, removalPrompt } from "../utils/financeRows";
import { emptyItem } from "../utils/billing.jsx";

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

// A line item belongs to a purchase or an invoice, and the two name their fields
// differently. Purchases also auto-fill amount from qty × rate; invoice totals
// are computed from qty × rate directly, so there is no stored amount to keep up.
function patchItems(type, items, idx, patch) {
  return type === "Purchase"
    ? applyItemChange(items, idx, patch)
    : items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
}
function appendItem(type, items) {
  return type === "Purchase" ? addLineItem(items) : [...items, { ...emptyItem }];
}
function dropItem(type, items, idx) {
  return type === "Purchase" ? removeLineItem(items, idx) : (items.length > 1 ? items.filter((_, i) => i !== idx) : items);
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

  // Editing is gated per kind of row, the same way each record's own page gates
  // it — seeing a year's transactions is not the same permission as changing
  // payroll. Invoices belong to Billing, not to a Finance tab.
  function canEditType(type) {
    return type === "Sales"
      ? sectionCanEdit(profile, "billing")
      : financeTabCanEdit(profile, TAB_BY_TYPE[type]);
  }
  const canEditAnything = ["Expense", "Purchase", "Payroll", "Journal", "Bank", "Sales"].some(canEditType);

  const [loading, setLoading] = useState(true);
  // Every transaction, tagged with the fiscal year it falls in. Holding all of
  // them rather than only the year on screen is what lets the Prev/Next buttons
  // know which years actually contain anything — and it means changing year is
  // a re-filter rather than another six round trips.
  const [allRows, setAllRows] = useState([]);
  const [accountNames, setAccountNames] = useState([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateMode, setDateMode] = useState("ad"); // "ad" | "bs" — one switch for every date on the page

  // rowKey -> in-progress edit, held until focus leaves the row group. Writing on
  // every keystroke would be a request per character and would fight the cursor.
  const [drafts, setDrafts] = useState({});
  const [errors, setErrors] = useState({});   // rowKey -> why the last save was refused
  const [saving, setSaving] = useState(null); // rowKey being written
  const removingRef = useRef(new Set());
  const dirtyCount = Object.keys(drafts).length;

  /**
   * Re-read every source table.
   *
   * `quiet` keeps the spinner off: a save or a delete refreshes the list, and
   * swapping the whole table for "Loading…" after each one would throw away the
   * scroll position and make a row-by-row pass through a year unusable.
   */
  async function load({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    try {
      // The finance-tab checks below only decide what to bother fetching. RLS
      // re-applies them server-side, so a tab someone cannot see returns
      // nothing even if this list were wrong.
      const [expRows, purRows, payrollRows, journalRows, bankRows, invRows, accRows] = await Promise.all([
        canExpenses  ? fetchAll("finance_expenses")  : [],
        canPurchases ? fetchAll("finance_purchases") : [],
        canPayroll   ? fetchAll("finance_payroll")   : [],
        canJournal   ? fetchAll("journal_entries")   : [],
        canBank      ? fetchAll("bank_transactions") : [],
        canPurchases || canJournal ? fetchAll("invoices") : [],
        canJournal   ? fetchAll("accounts")          : [],
      ]);

      const out = [];
      // A row with no usable date belongs to no year, and is dropped rather than
      // filed under whichever year happens to be current.
      const push = (date, row) => {
        const fy = date ? fiscalYearForDate(date) : null;
        if (fy) out.push({ ...row, fy, date });
      };

      expRows.forEach(r => push(r.date, {
        key: `exp-${r.id}`, type: "Expense", src: r, region: r.region,
        description: `${r.category || "Expense"}${r.note ? " — " + r.note : ""}`,
        amountNPR: Number(r.amountNPR || 0), sign: -1, counts: true,
      }));

      purRows.forEach(r => push(r.date, {
        key: `pur-${r.id}`, type: "Purchase", src: r, region: r.region,
        description: `${r.expenseItem || r.expenseId || "Purchase"}${r.category ? " — " + r.category : ""}`,
        amountNPR: Number(r.amountNPR || 0), sign: -1, counts: true,
      }));

      payrollRows.forEach(r => {
        const monthIdx = MONTHS.indexOf(r.month);
        const repDate = r.year && monthIdx >= 0 ? `${r.year}-${String(monthIdx + 1).padStart(2, "0")}-01` : null;
        push(repDate, {
          key: `pay-${r.id}`, type: "Payroll", src: r, region: r.region,
          description: `${r.staffName || "Staff"}${r.role ? " — " + r.role : ""} (${r.month} ${r.year})`,
          amountNPR: Number(r.grossNPR || r.netNPR || 0), sign: -1, counts: true,
        });
      });

      journalRows.forEach(r => push(r.date, {
        key: `jnl-${r.id}`, type: "Journal", src: r, region: r.region,
        description: `${r.description || "Journal entry"} (Dr ${r.debitAccount} / Cr ${r.creditAccount})`,
        amountNPR: Number(r.amountNPR || 0), sign: 0, counts: true,
      }));

      bankRows.forEach(r => push(r.date, {
        // The view calls the column "amount", and the stored type is capitalised
        // ("Credit"/"Debit") — comparing against "credit" made every
        // transaction an outflow of zero.
        key: `bnk-${r.id}`, type: "Bank", src: r, region: r.region,
        description: r.description || "Bank transaction",
        amountNPR: Number(r.amount ?? 0),
        sign: String(r.type || "").toLowerCase() === "credit" ? 1 : -1, counts: true,
      }));

      invRows.forEach(r => {
        // Cancelled invoices are not transactions; everything else is listed so
        // it can be corrected here. Only a Paid one is money actually received,
        // so only a Paid one counts toward the year's figures — exactly as
        // before this page became editable.
        if (r.status === "Cancelled") return;
        const paid = r.status === "Paid";
        const val = Number(r.totalNPR || 0);
        push(r.date, {
          key: `inv-${r.id}`, type: "Sales", src: r, region: r.region,
          description: `${r.clientName || ""}${r.invoiceNumber ? " — " + r.invoiceNumber : ""}`,
          amountNPR: r.currency === "GBP" ? val * GBP_RATE : val,
          sign: paid ? 1 : 0, counts: paid,
        });
      });

      // Newest first by date. fetchAll has no ORDER BY, so rows sharing a date
      // arrive in whatever order the database happens to hand them back — not
      // necessarily the order their numbers run in (e.g. INV-005 ahead of
      // INV-004). Doc numbers follow dates (see resequencePurchaseExpenseIds /
      // resequenceDocNumbers), so within a day the higher number is the later
      // one; this mirrors the tiebreak Billing.jsx's own list uses.
      const seqNum = (entry) => {
        const raw = entry.type === "Sales" ? entry.src.invoiceNumber
          : entry.type === "Purchase" ? entry.src.expenseId
          : "";
        const m = /(\d+)\s*$/.exec(raw || "");
        return m ? parseInt(m[1], 10) : -1;
      };
      out.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (seqNum(b) - seqNum(a)));
      setAllRows(out);
      setAccountNames([...new Set(accRows.map(a => a.name).filter(Boolean))]);
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    if (!anyAccess) { setLoading(false); return; }
    load().catch(err => { console.error(err); setLoading(false); });
    // Deliberately not keyed on fiscalYear — the data covers every year, so
    // switching year filters what we already have.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyAccess, canExpenses, canPurchases, canPayroll, canJournal, canBank]);

  /* ── Draft editing ─────────────────────────────────────────────────────── */

  const rowData = (entry) => drafts[entry.key] || initialRowData(entry.type, entry.src);

  function patchRow(entry, patch) {
    setDrafts(d => ({ ...d, [entry.key]: { ...rowData(entry), ...patch } }));
  }
  function patchRowItem(entry, idx, patch) {
    setDrafts(d => {
      const base = rowData(entry);
      return { ...d, [entry.key]: { ...base, items: patchItems(entry.type, base.items, idx, patch) } };
    });
  }
  function addRowItem(entry) {
    setDrafts(d => {
      const base = rowData(entry);
      return { ...d, [entry.key]: { ...base, items: appendItem(entry.type, base.items) } };
    });
  }
  function removeRowItem(entry, idx) {
    setDrafts(d => {
      const base = rowData(entry);
      return { ...d, [entry.key]: { ...base, items: dropItem(entry.type, base.items, idx) } };
    });
  }

  function clearDraft(key) {
    setDrafts(d => { const nd = { ...d }; delete nd[key]; return nd; });
  }

  async function saveRow(entry) {
    if (removingRef.current.has(entry.key)) return;
    const draft = drafts[entry.key];
    if (!draft) return;

    const problem = rowError(entry.type, draft);
    if (problem) {
      // Keep the draft: discarding it would throw away what was typed and snap
      // the row back with no explanation of what was wrong with it.
      setErrors(e => ({ ...e, [entry.key]: problem }));
      return;
    }

    setSaving(entry.key);
    try {
      await updateRow(COLL_BY_TYPE[entry.type], entry.src.id, rowUpdates(entry.type, draft));
      // Marking an invoice Paid has to settle its credit as a payment row —
      // amountPaid on the invoice is a trigger-maintained sum of those rows,
      // so writing it directly would be recomputed away by the next payment.
      const settlement = salesSettlement(entry.type, draft, entry.src, { recordedBy: profile?.name });
      if (settlement) await insertRow("payments", settlement);
      clearDraft(entry.key);
      setErrors(e => { const ne = { ...e }; delete ne[entry.key]; return ne; });
      await load({ quiet: true });
    } catch (err) {
      console.error(`Failed to update ${entry.type.toLowerCase()}:`, err);
      setErrors(e => ({ ...e, [entry.key]: err.message || "Could not save this row." }));
    } finally {
      setSaving(null);
    }
  }

  async function removeRow(entry) {
    const { verb, message } = removalPrompt(entry.type, entry.src);
    if (!window.confirm(message)) return;
    removingRef.current.add(entry.key);
    try {
      clearDraft(entry.key);
      setAllRows(prev => prev.filter(r => r.key !== entry.key));
      await deleteTransaction(entry.type, entry.src);
      await load({ quiet: true });
    } catch (err) {
      console.error(`Failed to ${verb.toLowerCase()} ${entry.type.toLowerCase()}:`, err);
      alert(`Failed to ${verb.toLowerCase()} this record: ${err.message || "Unknown error"}`);
      await load({ quiet: true });
    } finally {
      removingRef.current.delete(entry.key);
    }
  }

  /* ── Slicing ───────────────────────────────────────────────────────────── */

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

  // Only rows that count as money moved feed the figures — an invoice that is
  // not yet paid is listed and editable, but it is not income.
  const totals = useMemo(() => {
    const counted = rows.filter(r => r.counts);
    const byType = {};
    for (const r of counted) byType[r.type] = (byType[r.type] || 0) + r.amountNPR;
    const inflow  = counted.filter(r => r.sign > 0).reduce((s, r) => s + r.amountNPR, 0);
    const outflow = counted.filter(r => r.sign < 0).reduce((s, r) => s + r.amountNPR, 0);
    return { byType, inflow, outflow, net: inflow - outflow, uncounted: rows.length - counted.length };
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
              {totals.uncounted > 0 && (
                <p className="kfin-kpi-sub">{totals.uncounted} not counted (unpaid invoices)</p>
              )}
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
              <p className="kfin-block-title">
                Transactions <span className="kfin-block-sub">({filtered.length})</span>
              </p>
              <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
                {saving ? "Saving…"
                  : dirtyCount ? `${dirtyCount} row${dirtyCount === 1 ? "" : "s"} with unsaved changes — press Save on each`
                  : canEditAnything ? "Edit any field, then press Save on the row" : ""}
              </span>
            </div>

            {!canEditAnything && (
              <div className="kfin-notice" style={{ marginBottom: 14 }}>ℹ You don't have permission to edit these records.</div>
            )}

            {loading ? (
              <p style={{ color: "var(--ink-4)", fontSize: 13 }}>Loading…</p>
            ) : filtered.length === 0 ? (
              <p style={{ color: "var(--ink-4)", fontSize: 13 }}>No transactions found for FY {fiscalYear}.</p>
            ) : (
              <div className="kfin-tbl-wrap">
                <table className="kfin-tbl kfin-tbl-compact kfin-tbl--plain">
                  <thead>
                    <tr>
                      <th>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          Date
                          <button
                            type="button"
                            onClick={() => setDateMode(m => m === "ad" ? "bs" : "ad")}
                            title="Switch between English (A.D.) and Nepali (B.S.) dates"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 3,
                              fontSize: 10.5, fontWeight: 600, color: "var(--mint-deep)", cursor: "pointer",
                              background: "var(--mint-wash)", border: "1px solid rgba(45,155,111,.25)",
                              borderRadius: 20, padding: "2px 7px 2px 6px", lineHeight: 1.4, textTransform: "none",
                            }}
                          >
                            <span style={{ fontSize: 11 }}>⇄</span>{dateMode === "ad" ? "B.S." : "A.D."}
                          </button>
                        </div>
                      </th>
                      <th>Type</th>
                      <th>Description</th>
                      <th>Detail</th>
                      <th>Particulars</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th>Rate</th>
                      <th>Amount</th>
                      <th>Total / Actions</th>
                    </tr>
                  </thead>

                  {filtered.map(entry => {
                    const data = rowData(entry);
                    const editable = canEditType(entry.type);
                    const { verb } = removalPrompt(entry.type, entry.src);
                    return (
                      <FiscalYearRowGroup
                        key={entry.key}
                        type={entry.type}
                        data={data}
                        readOnly={!editable}
                        error={errors[entry.key]}
                        accountNames={accountNames}
                        dateMode={dateMode}
                        onDateModeChange={setDateMode}
                        onFieldChange={patch => patchRow(entry, patch)}
                        onItemChange={(idx, patch) => patchRowItem(entry, idx, patch)}
                        onAddItem={() => addRowItem(entry)}
                        onRemoveItem={idx => removeRowItem(entry, idx)}
                        dirty={!!drafts[entry.key]}
                        saving={saving === entry.key}
                        onSave={() => editable && saveRow(entry)}
                        onDiscard={() => { clearDraft(entry.key); setErrors(e => { const ne = { ...e }; delete ne[entry.key]; return ne; }); }}
                        typeCell={
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                            <TypePill type={entry.type} />
                            <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
                              {dateMode === "bs" ? fmtDateBS(rowDate(entry.type, data)) : (rowDate(entry.type, data) || "—")}
                            </span>
                            {!entry.counts && (
                              <span style={{ fontSize: 10, color: "var(--ink-4)" }} title="Only a paid invoice counts as money received.">
                                not in totals
                              </span>
                            )}
                          </div>
                        }
                        actionCell={editable && (
                          <div className="kbil-tbl-actions" style={{ marginTop: 2 }}>
                            <button className="kbil-tbl-btn kbil-tbl-btn--danger" type="button"
                              onMouseDown={e => e.stopPropagation()}
                              onClick={() => removeRow(entry)}>{verb}</button>
                          </div>
                        )}
                      />
                    );
                  })}
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

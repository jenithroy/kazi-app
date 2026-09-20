import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { fetchAll, updateRow } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit, financeTabAllowed, FINANCE_TAB_KEYS } from "../utils/permissions";
import { GBP_RATE, createdAfterCutoff } from "../constants";
import { asCurrency, roundAmount } from "../utils/format";
import { Icons } from "../components/ui";
import { useRegion } from "../context/RegionContext";
import { RegionSwitch } from "../components/RegionSwitch";
import { countUntagged, filterByRegion } from "../utils/region";
import { FiscalYearSelect, useFiscalYearFilter } from "../components/FiscalYearFilter";
import { filterByFiscalYear, fiscalYearsIn, isFiscalYearLabel } from "../utils/fiscalYear";
import { deletePurchaseWithLinks } from "../utils/financeRows";
import {
  PurchaseRowGroup, initialGroupData, applyItemChange, addLineItem, removeLineItem,
  itemsTotal, purchaseSubtotal, purchaseVatAmount, purchaseGrandTotal, purchaseItemsPayload,
} from "../components/PurchaseRowGroup";

function Purchases() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "finance") && financeTabAllowed(profile, FINANCE_TAB_KEYS.purchases);

  const { region } = useRegion();
  const [allPurchases, setPurchases] = useState([]);
  const [fy] = useFiscalYearFilter();
  const fyActive = isFiscalYearLabel(fy);
  // The count, the total and the table all read `purchases`, so scoping it
  // here is the whole of the region and fiscal-year split on this page.
  const regionPurchases = useMemo(() => filterByRegion(allPurchases, region), [allPurchases, region]);
  const purchases = useMemo(() => filterByFiscalYear(regionPurchases, fy), [regionPurchases, fy]);
  const yearsHere = useMemo(() => fiscalYearsIn(regionPurchases), [regionPurchases]);
  const [purchaseDrafts, setPurchaseDrafts] = useState({}); // rowId -> in-progress edit, until blur-commit
  const [loading, setLoading] = useState(true);
  // Prefilled when arriving from a Finance-ledger deep link (click a purchase row there)
  const [searchQuery, setSearchQuery] = useState(location.state?.search || "");
  const deletingIdsRef = useRef(new Set());

  async function loadPurchases() {
    setLoading(true);
    try {
      let rows = await fetchAll("finance_purchases");
      // Newest purchase on top, oldest at the bottom — dates (ISO YYYY-MM-DD)
      // increase as you go up. expenseId breaks ties on the same day.
      rows.sort((a, b) =>
        (b.date || "").localeCompare(a.date || "") ||
        (b.expenseId || "").localeCompare(a.expenseId || "")
      );
      rows = rows.filter(r => createdAfterCutoff(r));
      setPurchases(rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPurchases().catch(console.error); }, []);

  function purchaseRowData(row) {
    return purchaseDrafts[row.id] || initialGroupData(row);
  }
  function updatePurchaseField(row, patch) {
    setPurchaseDrafts(d => ({ ...d, [row.id]: { ...purchaseRowData(row), ...patch } }));
  }
  function updatePurchaseItem(row, idx, patch) {
    setPurchaseDrafts(d => {
      const base = purchaseRowData(row);
      return { ...d, [row.id]: { ...base, items: applyItemChange(base.items, idx, patch) } };
    });
  }
  function addPurchaseItem(row) {
    setPurchaseDrafts(d => {
      const base = purchaseRowData(row);
      return { ...d, [row.id]: { ...base, items: addLineItem(base.items) } };
    });
  }
  function removePurchaseItem(row, idx) {
    setPurchaseDrafts(d => {
      const base = purchaseRowData(row);
      return { ...d, [row.id]: { ...base, items: removeLineItem(base.items, idx) } };
    });
  }
  async function commitPurchaseDraft(row) {
    if (deletingIdsRef.current.has(row.id)) return;
    const draft = purchaseDrafts[row.id];
    if (!draft) return;
    try {
      const subtotal = purchaseSubtotal(draft.items);
      const vatAmount = purchaseVatAmount(draft.items, draft.vatBill, draft.discountAmt, draft.taxableAmt);
      const grandTotal = purchaseGrandTotal(draft.items, draft.vatBill, draft.discountAmt, draft.taxableAmt);

      await updateRow("finance_purchases", row.id, {
        expenseItem: draft.expenseItem,
        category: draft.category,
        paymentType: draft.paymentType || "CASH",
        bankName: draft.bankName || "Nabil Bank",
        vatBill: draft.vatBill,
        discountAmt: Number(draft.discountAmt || 0),
        taxableAmt: Number(draft.taxableAmt || 0),
        subtotalNPR: subtotal,
        vatAmountNPR: vatAmount,
        amountNPR: grandTotal,
        date: draft.date,
        region: draft.region || null,
        items: purchaseItemsPayload(draft.items)
      });
      setPurchaseDrafts(d => { const nd = { ...d }; delete nd[row.id]; return nd; });
      await loadPurchases();
    } catch (err) {
      if (deletingIdsRef.current.has(row.id)) return;
      console.error("Failed to update purchase:", err);
      alert("Failed to update purchase. Please try again.");
    }
  }
  async function deletePurchase(row) {
    const id = row.id;
    const expenseId = row.expenseId;
    deletingIdsRef.current.add(id);
    if (!window.confirm(`Delete purchase ${expenseId || id}? This will also delete any linked VAT bills, stock entries, and journal records.`)) {
      deletingIdsRef.current.delete(id);
      return;
    }
    try {
      setPurchaseDrafts(d => { const nd = { ...d }; delete nd[id]; return nd; });
      setPurchases(prev => prev.filter(p => p.id !== id));

      // Deleting the purchase alone would strand its VAT bills, stock movements
      // and journal entries; the cascade lives in utils/financeRows so the
      // fiscal-year page removes a purchase exactly the same way.
      await deletePurchaseWithLinks(id, expenseId);

      await loadPurchases();
    } catch (err) {
      console.error("Failed to delete purchase:", err);
      alert("Failed to delete purchase: " + (err.message || "Unknown error"));
      await loadPurchases();
    } finally {
      deletingIdsRef.current.delete(id);
    }
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter(r =>
      (r.expenseId || "").toLowerCase().includes(q) ||
      (r.expenseItem || "").toLowerCase().includes(q) ||
      (r.category || "").toLowerCase().includes(q)
    );
  }, [purchases, searchQuery]);

  const total = useMemo(() => purchases.reduce((s, r) => s + Number(r.amountNPR || 0), 0), [purchases]);

  return (
    <div className="kfin-wrap">
      <button
        type="button"
        className="ghost-button"
        style={{ alignSelf: "flex-start" }}
        onClick={() => navigate("/finance")}
      >
        <Icons.ChevronLeft size={15} sw={2} /> Back to Finance
      </button>

      <div className="kbil-page-hd">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", width: "100%" }}>
          <div>
          <h1 className="kbil-page-title">Purchases</h1>
          <p className="kbil-page-sub">
            {purchases.length} record{purchases.length !== 1 ? "s" : ""} · NPR {roundAmount(total).toLocaleString()}
            <span style={{ marginLeft: 6 }}>/ {asCurrency(total / GBP_RATE, "GBP")}</span>
          </p>
          </div>
          <RegionSwitch untagged={countUntagged(allPurchases)} />
        </div>
      </div>

      <div className="kfin-block">
        <div className="kfin-block-hd">
          <h2 className="kfin-block-title">
            Saved Purchases <span className="kfin-block-sub">({filtered.length}{searchQuery ? ` of ${purchases.length}` : ""})</span>
          </h2>
        </div>

        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <input
            className="kfin-input"
            type="text"
            placeholder="Search by party name, category, or expense ID…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ maxWidth: 360 }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", fontSize: 13 }}
            >✕ Clear</button>
          )}
          <FiscalYearSelect years={yearsHere} />
        </div>

        {!canEdit && <div className="kfin-notice" style={{ marginBottom: 14 }}>ℹ You don't have permission to edit or delete purchases.</div>}

        {loading ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-4)" }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-4)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {fyActive && purchases.length === 0 && regionPurchases.length > 0 ? `No purchases in FY ${fy}` : "No purchases found"}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {fyActive && purchases.length === 0 && regionPurchases.length > 0
                ? `${regionPurchases.length} purchase${regionPurchases.length !== 1 ? "s" : ""} in other years — pick another year or "All years" to see them.`
                : searchQuery ? (fyActive ? `Nothing in FY ${fy} matches your search — try clearing it or choosing "All years".` : "Try clearing your search.")
                : "Add a purchase from the Finance page to see it here."}
            </div>
          </div>
        ) : (
          <div className="kfin-tbl-wrap">
            <table className="kfin-tbl kfin-tbl-compact kfin-tbl--plain">
              <thead><tr>
                <th>Expense ID</th><th>Date</th><th>Party Name</th><th>Category</th><th>Payment</th><th>VAT Bill</th>
                <th>Particulars</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount (NPR)</th><th>Total / Action</th>
              </tr></thead>

              {filtered.map(row => (
                <PurchaseRowGroup
                  key={row.id}
                  // The purchase's own stored id (the one Finance issues, search matches and
                  // the delete prompt quotes) — a position in this list would renumber
                  // whenever the year, region or search changed.
                  expenseId={row.expenseId || "—"}
                  data={purchaseRowData(row)}
                  onFieldChange={patch => canEdit && updatePurchaseField(row, patch)}
                  onItemChange={(idx, patch) => canEdit && updatePurchaseItem(row, idx, patch)}
                  onAddItem={() => canEdit && addPurchaseItem(row)}
                  onRemoveItem={idx => canEdit && removePurchaseItem(row, idx)}
                  onBlurAway={() => canEdit && commitPurchaseDraft(row)}
                  actionCell={canEdit && (
                    <div className="kbil-tbl-actions">
                      <button className="kbil-tbl-btn kbil-tbl-btn--danger" type="button"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={() => deletePurchase(row)}>Delete</button>
                    </div>
                  )}
                />
              ))}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Purchases;

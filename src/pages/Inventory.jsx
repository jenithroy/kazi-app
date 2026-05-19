import { useEffect, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp
} from "firebase/firestore";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import useFirestore from "../hooks/useFirestore";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import { db } from "../firebase";
import { cn, Pill, Icons } from "../components/ui";

/* ── Constants ─────────────────────────────────────────── */
const STOCK_CATEGORIES = [
  "Raw Materials", "Fabric", "Thread & Accessories", "Packaging",
  "Equipment", "Consumables", "Finished Goods", "Office Supplies", "Other"
];

const emptyItemForm = {
  item: "", unit: "pcs", category: "Raw Materials", supplier: "",
  openingStock: 0, stockIn: 0, stockUsed: 0, minLevel: 0,
  unitCostNPR: "", location: ""
};

function nextItemId(rows) {
  const nums = rows.map(r => parseInt((r.itemId || "ITEM000").replace(/\D/g, ""), 10)).filter(n => !isNaN(n));
  return `IT${String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, "0")}`;
}

/* ── Stepper input ─────────────────────────────────────── */
function Stepper({ value, onChange, disabled, min = 0 }) {
  const v = Number(value) || 0;
  return (
    <div className={cn("kinv-stepper", disabled && "kinv-stepper--disabled")}>
      <button
        type="button"
        className="kinv-stepper-btn"
        onClick={() => onChange(Math.max(min, v - 1))}
        disabled={disabled || v <= min}
        tabIndex={-1}
      >−</button>
      <input
        className="kinv-stepper-val"
        type="number"
        value={v}
        min={min}
        disabled={disabled}
        onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))}
      />
      <button
        type="button"
        className="kinv-stepper-btn"
        onClick={() => onChange(v + 1)}
        disabled={disabled}
        tabIndex={-1}
      >+</button>
    </div>
  );
}

/* ── Trash icon ────────────────────────────────────────── */
function TrashIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
    </svg>
  );
}

/* ── Save icon ─────────────────────────────────────────── */
function SaveIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
      <path d="M17 21v-8H7v8M7 3v5h8"/>
    </svg>
  );
}

/* ── Main component ─────────────────────────────────────── */
function Inventory() {
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "inventory");
  const { updateDoc } = useFirestore("inventory");

  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({});
  const [activeTab, setActiveTab] = useState("stock");
  const [showAddForm, setShowAddForm] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [addingItem, setAddingItem] = useState(false);
  const [search, setSearch] = useState("");
  const [savingRow, setSavingRow] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // row.id pending confirm
  const [deletingRow, setDeletingRow] = useState(null);

  async function loadData() {
    const snap = await getDocs(collection(db, "inventory"));
    const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    records.sort((a, b) => (a.item || "").localeCompare(b.item || ""));
    setRows(records);
  }

  useEffect(() => { loadData().catch(console.error); }, []);

  function getClosing(row, rowDraft = {}) {
    const opening  = Number(row.openingStock || 0);
    const stockIn  = Number(rowDraft.stockIn  ?? row.stockIn  ?? 0);
    const stockUsed = Number(rowDraft.stockUsed ?? row.stockUsed ?? 0);
    return opening + stockIn - stockUsed;
  }

  function setStockIn(rowId, val) {
    setDraft(d => ({ ...d, [rowId]: { ...d[rowId], stockIn: val } }));
  }
  function setStockUsed(rowId, val) {
    setDraft(d => ({ ...d, [rowId]: { ...d[rowId], stockUsed: val } }));
  }

  async function saveRow(row) {
    if (!canEdit) return;
    setSavingRow(row.id);
    const rowDraft = draft[row.id] || {};
    await updateDoc(row.id, {
      stockIn:     Number(rowDraft.stockIn     ?? row.stockIn     ?? 0),
      stockUsed:   Number(rowDraft.stockUsed   ?? row.stockUsed   ?? 0),
      lastUpdated: new Date().toISOString().slice(0, 10),
      updatedBy:   profile?.name || "Unknown"
    });
    await loadData();
    setDraft(d => ({ ...d, [row.id]: {} }));
    setSavingRow(null);
  }

  async function deleteRow(rowId) {
    setDeletingRow(rowId);
    await deleteDoc(doc(db, "inventory", rowId));
    await loadData();
    setDeleteConfirm(null);
    setDeletingRow(null);
  }

  async function addItem(e) {
    e.preventDefault();
    setAddingItem(true);
    await addDoc(collection(db, "inventory"), {
      ...itemForm,
      itemId:       nextItemId(rows),
      openingStock: Number(itemForm.openingStock || 0),
      stockIn:      Number(itemForm.stockIn      || 0),
      stockUsed:    Number(itemForm.stockUsed    || 0),
      minLevel:     Number(itemForm.minLevel     || 0),
      unitCostNPR:  Number(itemForm.unitCostNPR  || 0),
      createdBy:    profile?.name || "Unknown",
      createdAt:    serverTimestamp()
    });
    setItemForm(emptyItemForm);
    setShowAddForm(false);
    await loadData();
    setAddingItem(false);
  }

  /* ── Stats ── */
  const lowStockCount  = rows.filter(r => getClosing(r) <= Number(r.minLevel || 0)).length;
  const totalItems     = rows.length;
  const totalStockValue = rows.reduce((s, r) => s + getClosing(r) * Number(r.unitCostNPR || 0), 0);
  const categories     = new Set(rows.map(r => r.category).filter(Boolean)).size;

  const filtered = rows.filter(r =>
    !search ||
    r.item?.toLowerCase().includes(search.toLowerCase()) ||
    r.category?.toLowerCase().includes(search.toLowerCase()) ||
    r.supplier?.toLowerCase().includes(search.toLowerCase())
  );

  /* ── Draft helpers ── */
  function draftStockIn(row)   { return draft[row.id]?.stockIn   ?? row.stockIn   ?? 0; }
  function draftStockUsed(row) { return draft[row.id]?.stockUsed ?? row.stockUsed ?? 0; }

  return (
    <AppLayout>
      <PageHeader
        title="Inventory & Stock"
        description="Monitor stock levels, reorder alerts and item details."
        action={canEdit && (
          <button className="primary-button" onClick={() => setShowAddForm(v => !v)}>
            {showAddForm ? "Cancel" : "+ Add Item"}
          </button>
        )}
      />

      {!canEdit && <p className="banner-warning">UK admin view-only mode enabled.</p>}

      {/* ── KPI Cards ── */}
      <div className="kinv-kpis">
        <div className={cn("kinv-kpi", lowStockCount > 0 && "kinv-kpi--warn")}>
          <span className="kinv-kpi-l">TOTAL ITEMS</span>
          <span className="kinv-kpi-v">{totalItems}</span>
        </div>
        <div className={cn("kinv-kpi", lowStockCount > 0 && "kinv-kpi--warn")}>
          <span className="kinv-kpi-l">LOW / REORDER</span>
          <span className="kinv-kpi-v" style={{ color: lowStockCount > 0 ? "var(--terra)" : undefined }}>
            {lowStockCount}
          </span>
          <span className="kinv-kpi-note">{lowStockCount > 0 ? `${lowStockCount} needs attention` : "all OK"}</span>
        </div>
        <div className="kinv-kpi">
          <span className="kinv-kpi-l">STOCK VALUE (NPR)</span>
          <span className="kinv-kpi-v" style={{ fontSize: totalStockValue > 999999 ? 22 : 28 }}>
            NPR {totalStockValue.toLocaleString()}
          </span>
          <span className="kinv-kpi-note">closing × unit cost</span>
        </div>
        <div className="kinv-kpi">
          <span className="kinv-kpi-l">CATEGORIES</span>
          <span className="kinv-kpi-v">{categories}</span>
        </div>
      </div>

      {/* ── Add Item Form ── */}
      {showAddForm && canEdit && (
        <section className="panel">
          <h3 style={{ marginBottom: 16, fontSize: "0.95rem", fontWeight: 700 }}>New Stock Item</h3>
          <form className="grid-form" onSubmit={addItem}>
            <label style={{ gridColumn: "span 2" }}>
              Item Name
              <input type="text" value={itemForm.item} required placeholder="e.g. Chinese Terry Fabric"
                onChange={e => setItemForm(f => ({ ...f, item: e.target.value }))} />
            </label>
            <label>
              Category
              <select value={itemForm.category} onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))}>
                {STOCK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>
              Unit
              <input type="text" value={itemForm.unit} placeholder="pcs / kg / metres"
                onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))} />
            </label>
            <label>
              Supplier
              <input type="text" value={itemForm.supplier} placeholder="Supplier name"
                onChange={e => setItemForm(f => ({ ...f, supplier: e.target.value }))} />
            </label>
            <label>
              Location / Store
              <input type="text" value={itemForm.location} placeholder="e.g. Warehouse A"
                onChange={e => setItemForm(f => ({ ...f, location: e.target.value }))} />
            </label>
            <label>
              Opening Stock
              <input type="number" min="0" value={itemForm.openingStock} placeholder="0"
                onChange={e => setItemForm(f => ({ ...f, openingStock: e.target.value }))} />
            </label>
            <label>
              Min Reorder Level
              <input type="number" min="0" value={itemForm.minLevel} placeholder="0"
                onChange={e => setItemForm(f => ({ ...f, minLevel: e.target.value }))} />
            </label>
            <label>
              Unit Cost (NPR)
              <input type="number" min="0" value={itemForm.unitCostNPR} placeholder="0"
                onChange={e => setItemForm(f => ({ ...f, unitCostNPR: e.target.value }))} />
            </label>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <button type="submit" className="primary-button" disabled={addingItem}>
                {addingItem ? "Adding…" : "Add Item"}
              </button>
              <button type="button" className="ghost-button" onClick={() => setShowAddForm(false)}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      {/* ── Tabs + Content ── */}
      <div className="kinv-panel">

        {/* Panel header */}
        <div className="kinv-panel-hd">
          <div className="kinv-tabs">
            <button className={cn("kinv-tab", activeTab === "stock" && "kinv-tab--on")}
              onClick={() => setActiveTab("stock")}>Stock Levels</button>
            <button className={cn("kinv-tab", activeTab === "details" && "kinv-tab--on")}
              onClick={() => setActiveTab("details")}>Item Details</button>
          </div>

          <div className="kinv-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              placeholder="Search items…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* ── Stock Levels ── */}
        {activeTab === "stock" && (
          <div className="kinv-table-wrap">
            <table className="kinv-table">
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th>Opening</th>
                  <th>Stock In</th>
                  <th>Stock Used</th>
                  <th>Closing</th>
                  <th>Min Level</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ textAlign: "center", padding: "32px 0", color: "var(--ink-4)", fontSize: 13 }}>
                      No items found
                    </td>
                  </tr>
                )}
                {filtered.map(row => {
                  const rowDraft  = draft[row.id] || {};
                  const closing   = getClosing(row, rowDraft);
                  const minLevel  = Number(row.minLevel || 0);
                  const lowStock  = closing <= minLevel;
                  const isDirty   = rowDraft.stockIn !== undefined || rowDraft.stockUsed !== undefined;
                  const isDelConfirm = deleteConfirm === row.id;

                  return (
                    <tr key={row.id} className={cn("kinv-row", lowStock && "kinv-row--low")}>
                      {/* Item ID */}
                      <td>
                        <span className="kinv-id">{row.itemId}</span>
                      </td>

                      {/* Item name */}
                      <td>
                        <span className="kinv-name">{row.item}</span>
                      </td>

                      {/* Category */}
                      <td>
                        <span className="kinv-cat">{row.category || "—"}</span>
                      </td>

                      {/* Unit */}
                      <td>
                        <span className="kinv-unit">{row.unit}</span>
                      </td>

                      {/* Opening */}
                      <td>
                        <span className="kinv-num">{Number(row.openingStock || 0).toLocaleString()}</span>
                      </td>

                      {/* Stock In – stepper */}
                      <td>
                        <Stepper
                          value={draftStockIn(row)}
                          onChange={val => setStockIn(row.id, val)}
                          disabled={!canEdit}
                        />
                      </td>

                      {/* Stock Used – stepper */}
                      <td>
                        <Stepper
                          value={draftStockUsed(row)}
                          onChange={val => setStockUsed(row.id, val)}
                          disabled={!canEdit}
                        />
                      </td>

                      {/* Closing */}
                      <td>
                        <span className={cn("kinv-closing", lowStock && "kinv-closing--low")}>
                          {closing.toLocaleString()}
                        </span>
                      </td>

                      {/* Min Level */}
                      <td>
                        <span className="kinv-num">{minLevel}</span>
                      </td>

                      {/* Status */}
                      <td>
                        {lowStock
                          ? <Pill tone="terra">Reorder</Pill>
                          : <Pill tone="mint">OK</Pill>
                        }
                      </td>

                      {/* Actions */}
                      <td>
                        {isDelConfirm ? (
                          <div className="kinv-del-confirm">
                            <span style={{ fontSize: 12, color: "var(--terra)", fontWeight: 600 }}>Delete?</span>
                            <button
                              className="kinv-btn-danger"
                              onClick={() => deleteRow(row.id)}
                              disabled={deletingRow === row.id}
                            >{deletingRow === row.id ? "…" : "Yes"}</button>
                            <button
                              className="kinv-btn-ghost"
                              onClick={() => setDeleteConfirm(null)}
                            >No</button>
                          </div>
                        ) : (
                          <div className="kinv-actions">
                            <button
                              className={cn("kinv-btn-save", isDirty && "kinv-btn-save--dirty")}
                              disabled={!canEdit || savingRow === row.id}
                              onClick={() => saveRow(row)}
                              title="Save changes"
                            >
                              {savingRow === row.id ? (
                                <span style={{ fontSize: 11 }}>…</span>
                              ) : (
                                <>
                                  <SaveIcon size={13} />
                                  <span>Save</span>
                                </>
                              )}
                            </button>
                            {canEdit && (
                              <button
                                className="kinv-btn-del"
                                onClick={() => setDeleteConfirm(row.id)}
                                title="Delete item"
                              >
                                <TrashIcon size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Item Details ── */}
        {activeTab === "details" && (
          <div className="kinv-table-wrap">
            <table className="kinv-table">
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th>Supplier</th>
                  <th>Location</th>
                  <th>Unit Cost</th>
                  <th>Closing Stock</th>
                  <th>Stock Value</th>
                  <th>Min Level</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ textAlign: "center", padding: "32px 0", color: "var(--ink-4)", fontSize: 13 }}>
                      No items found
                    </td>
                  </tr>
                )}
                {filtered.map(row => {
                  const closing    = getClosing(row);
                  const stockValue = closing * Number(row.unitCostNPR || 0);
                  return (
                    <tr key={row.id} className="kinv-row">
                      <td><span className="kinv-id">{row.itemId}</span></td>
                      <td><span className="kinv-name">{row.item}</span></td>
                      <td><span className="kinv-cat">{row.category || "—"}</span></td>
                      <td><span className="kinv-unit">{row.unit}</span></td>
                      <td style={{ fontSize: 13, color: "var(--ink-2)" }}>{row.supplier || "—"}</td>
                      <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{row.location || "—"}</td>
                      <td>
                        <span className="kinv-mono">
                          {row.unitCostNPR ? `NPR ${Number(row.unitCostNPR).toLocaleString()}` : "—"}
                        </span>
                      </td>
                      <td><span className="kinv-closing">{closing.toLocaleString()}</span></td>
                      <td>
                        <span className="kinv-mono" style={{ color: row.unitCostNPR ? "var(--mint-deep)" : "var(--ink-4)" }}>
                          {row.unitCostNPR ? `NPR ${stockValue.toLocaleString()}` : "—"}
                        </span>
                      </td>
                      <td><span className="kinv-num">{row.minLevel || 0}</span></td>
                      <td style={{ fontSize: 11, color: "var(--ink-4)" }}>{row.lastUpdated || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default Inventory;

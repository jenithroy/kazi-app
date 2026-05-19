import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc, deleteField } from "firebase/firestore";
import AppLayout from "../components/AppLayout";
import DocPreview from "../components/DocPreview";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import {
  DOC_TYPES, STATUS_BY_TYPE, emptyItem, makeEmptyForm,
  fmtNPR, fmtDate, calcTotals, getNextNumber, statusBadge,
} from "../utils/billing.jsx";

/* ══════════════════════════════════════════════════════
   BILLING PAGE — VAT Invoice · Challan · Quotation
   Nepal IRD–compliant: 13% VAT, discount before VAT,
   sequential numbering, partial payment tracking
══════════════════════════════════════════════════════ */
function Billing() {
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "billing");

  const [tab, setTab]               = useState("invoice");
  const [invoices, setInvoices]     = useState([]);
  const [challans, setChallans]     = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState(makeEmptyForm("invoice"));
  const [submitting, setSubmitting] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [editingId, setEditingId]   = useState(null);   // doc id when editing, null when creating

  const [showCancelled, setShowCancelled] = useState(false);

  // Payment modal state
  const [payModal, setPayModal]     = useState(null); // { id, docNum, totalNPR, currentPaid, coll }
  const [payAmt, setPayAmt]         = useState("");

  /* ── Load data ── */
  async function loadAll() {
    const [invSnap, chSnap, qtSnap] = await Promise.all([
      getDocs(collection(db, "invoices")),
      getDocs(collection(db, "challans")),
      getDocs(collection(db, "quotations")),
    ]);
    const sort = (a, b) => (b.date || "").localeCompare(a.date || "");
    setInvoices(invSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort(sort));
    setChallans(chSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort(sort));
    setQuotations(qtSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort(sort));
  }

  useEffect(() => { loadAll().catch(console.error); }, []);

  /* ── Tab change ── */
  function switchTab(t) {
    setTab(t);
    setShowForm(false);
    setEditingId(null);
    setForm(makeEmptyForm(t));
  }

  /* ── Active list & meta ── */
  const activeList     = tab === "invoice" ? invoices : tab === "challan" ? challans : quotations;
  const meta           = DOC_TYPES[tab];
  const activeDocs     = activeList.filter(r => r.status !== "Cancelled");
  const cancelledDocs  = activeList.filter(r => r.status === "Cancelled");

  /* ── Form totals (live preview) ── */
  const formTotals = useMemo(
    () => calcTotals(form.items, form.applyVAT || false, form.discountPct || 0),
    [form.items, form.applyVAT, form.discountPct],
  );

  /* ── Open edit mode for an existing document ── */
  function openEdit(row) {
    // Load the row data into the form, stripping Firestore-only fields
    const { id, ...rest } = row;
    setForm({ ...makeEmptyForm(tab), ...rest });
    setEditingId(id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ── Submit: create OR update ── */
  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const applyVAT = tab === "invoice" && form.applyVAT;
      const { subtotal, discountAmt, taxableAmt, vatAmt, total } = calcTotals(form.items, applyVAT, form.discountPct);

      if (editingId) {
        /* ── UPDATE existing document ── */
        const updates = {
          ...form,
          subtotalNPR:    subtotal,
          discountPct:    Number(form.discountPct) || 0,
          discountAmtNPR: discountAmt,
          taxableAmtNPR:  taxableAmt,
          vatAmountNPR:   applyVAT ? vatAmt : 0,
          totalNPR:       total,
          updatedBy:      profile?.name || "Unknown",
          updatedAt:      serverTimestamp(),
        };
        // Remove read-only fields that shouldn't be overwritten
        delete updates.createdAt;
        delete updates.createdBy;
        delete updates.id;
        await updateDoc(doc(db, meta.coll, editingId), updates);
        setEditingId(null);
      } else {
        /* ── CREATE new document ── */
        const docNumber = await getNextNumber(tab);
        const record = {
          ...form,
          [meta.numberField]: docNumber,
          subtotalNPR:    subtotal,
          discountPct:    Number(form.discountPct) || 0,
          discountAmtNPR: discountAmt,
          taxableAmtNPR:  taxableAmt,
          vatAmountNPR:   applyVAT ? vatAmt : 0,
          totalNPR:       total,
          amountPaid:     0,
          createdBy:      profile?.name || "Unknown",
          createdAt:      serverTimestamp(),
        };
        // Strip fields irrelevant to this doc type
        if (tab !== "invoice")   { delete record.applyVAT; delete record.dueDate; delete record.paymentTerms; delete record.amountPaid; delete record.relatedChallan; delete record.relatedQuotation; }
        if (tab !== "challan")   { delete record.vehicleNo; delete record.driverName; delete record.routeFrom; delete record.routeTo; }
        if (tab !== "quotation") { delete record.validUntil; delete record.terms; }
        await addDoc(collection(db, meta.coll), record);
      }

      setForm(makeEmptyForm(tab));
      setShowForm(false);
      await loadAll();
    } catch (err) {
      console.error("Failed to save document:", err);
      alert("Failed to save document. Please try again.");
    }
    setSubmitting(false);
  }

  /* ── Status update ── */
  async function updateStatus(id, status) {
    await updateDoc(doc(db, meta.coll, id), { status });
    await loadAll();
  }

  /* ── Cancel document (preserve record) ── */
  async function cancelDoc(id) {
    if (!window.confirm("Cancel this document? The record will be preserved.")) return;
    await updateDoc(doc(db, meta.coll, id), { status: "Cancelled" });
    await loadAll();
  }

  /* ── Record payment (partial or full) ── */
  async function recordPayment() {
    if (!payModal) return;
    const newAmt = Number(payAmt);
    if (isNaN(newAmt) || newAmt <= 0) { alert("Enter a valid payment amount."); return; }
    const totalPaid = Math.min(payModal.currentPaid + newAmt, payModal.totalNPR);
    const creditLeft = payModal.totalNPR - totalPaid;
    const newStatus  = creditLeft <= 0.005 ? "Paid" : "Partial";
    await updateDoc(doc(db, payModal.coll, payModal.id), { amountPaid: totalPaid, status: newStatus });
    setPayModal(null);
    setPayAmt("");
    await loadAll();
  }

  /* ── Convert Quotation → Invoice ── */
  async function convertToInvoice(qt) {
    if (!window.confirm(`Convert ${qt.quotationNumber} to a VAT Invoice?`)) return;
    setSubmitting(true);
    try {
      const { subtotal, discountAmt, taxableAmt, vatAmt, total } = calcTotals(qt.items || [], true, qt.discountPct || 0);
      const invNumber = await getNextNumber("invoice");
      const d = new Date(); d.setDate(d.getDate() + 30);

      await addDoc(collection(db, "invoices"), {
        invoiceNumber:    invNumber,
        date:             new Date().toISOString().slice(0, 10),
        dueDate:          d.toISOString().slice(0, 10),
        fiscalYear:       qt.fiscalYear || "",
        paymentTerms:     "Net 30",
        clientName:       qt.clientName || "",
        clientPAN:        qt.clientPAN || "",
        clientAddress:    qt.clientAddress || "",
        clientPhone:      qt.clientPhone || "",
        status:           "Draft",
        applyVAT:         true,
        items:            qt.items || [],
        note:             qt.note || "",
        discountPct:      qt.discountPct || 0,
        discountAmtNPR:   discountAmt,
        taxableAmtNPR:    taxableAmt,
        relatedQuotation: qt.quotationNumber || "",
        relatedChallan:   "",
        subtotalNPR:      subtotal,
        vatAmountNPR:     vatAmt,
        totalNPR:         total,
        amountPaid:       0,
        createdBy:        profile?.name || "Unknown",
        createdAt:        serverTimestamp(),
      });

      await updateDoc(doc(db, "quotations", qt.id), {
        relatedInvoice: invNumber,
        status: qt.status === "Sent" ? "Accepted" : qt.status,
      });

      await loadAll();
      setTab("invoice");
      alert(`Created ${invNumber} from ${qt.quotationNumber}`);
    } catch (err) {
      console.error(err);
      alert("Conversion failed.");
    }
    setSubmitting(false);
  }

  /* ── Form item helpers ── */
  function updateItem(idx, field, value) {
    setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, [field]: value } : it) }));
  }
  function setF(field, value) { setForm(f => ({ ...f, [field]: value })); }

  /* ── KPI Summary ── */
  const summary = useMemo(() => {
    const list = activeList;
    const total = list.reduce((s, d) => s + Number(d.totalNPR || 0), 0);
    const paid  = list.filter(d => ["Paid", "Delivered", "Accepted"].includes(d.status)).reduce((s, d) => s + Number(d.totalNPR || 0), 0);
    const partialPaid = list.filter(d => d.status === "Partial").reduce((s, d) => s + Number(d.amountPaid || 0), 0);
    const pending = list.filter(d => !["Paid", "Delivered", "Accepted", "Cancelled", "Rejected"].includes(d.status)).reduce((s, d) => {
      const due = Number(d.totalNPR || 0) - Number(d.amountPaid || 0);
      return s + Math.max(0, due);
    }, 0);
    const vatCollected = tab === "invoice"
      ? list.filter(d => ["Paid", "Partial"].includes(d.status)).reduce((s, d) => {
          const paidFraction = d.totalNPR > 0 ? (d.amountPaid || 0) / d.totalNPR : 0;
          return s + Number(d.vatAmountNPR || 0) * (d.status === "Paid" ? 1 : paidFraction);
        }, 0)
      : 0;
    return { total, paid: paid + partialPaid, pending, vatCollected, count: list.length };
  }, [activeList, tab]);

  const numField = meta.numberField;

  return (
    <AppLayout>
      <div className="kfin-wrap">

        {/* ── Page Header ── */}
        <div className="kbil-page-hd">
          <div>
            <h1 className="kbil-page-title">Billing &amp; Invoicing</h1>
            <p className="kbil-page-sub">VAT invoices · challan bills · quotations · Nepal IRD compliant</p>
          </div>
          {canEdit && (
            <button className="kbil-btn-primary" onClick={() => {
              if (showForm) { setShowForm(false); setEditingId(null); setForm(makeEmptyForm(tab)); }
              else { setEditingId(null); setForm(makeEmptyForm(tab)); setShowForm(true); }
            }}>
              {showForm ? "✕ Cancel" : `+ New ${meta.label}`}
            </button>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="tab-row">
          {Object.entries(DOC_TYPES).map(([key, dt]) => {
            const count = key === "invoice" ? invoices.length : key === "challan" ? challans.length : quotations.length;
            return (
              <button key={key} className={`tab-button ${tab === key ? "active" : ""}`} onClick={() => switchTab(key)}>
                {dt.label}<span className="tab-badge">{count}</span>
              </button>
            );
          })}
        </div>

        {/* ── KPI Strip ── */}
        <div className="kfin-kpis">
          <div className="kfin-kpi">
            <div className="kfin-kpi-ico" style={{ background: "rgba(31,110,76,.12)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1f6e4c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20"/></svg>
            </div>
            <p className="kfin-kpi-label">Total {meta.label}s</p>
            <p className="kfin-kpi-value">{fmtNPR(summary.total)}</p>
            <p className="kfin-kpi-sub">{summary.count} record{summary.count !== 1 ? "s" : ""}</p>
          </div>
          <div className="kfin-kpi">
            <div className="kfin-kpi-ico" style={{ background: "rgba(86,136,176,.12)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5688b0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <p className="kfin-kpi-label">{tab === "invoice" ? "Collected" : tab === "challan" ? "Delivered" : "Accepted"}</p>
            <p className="kfin-kpi-value">{fmtNPR(summary.paid)}</p>
          </div>
          <div className="kfin-kpi">
            <div className="kfin-kpi-ico" style={{ background: "rgba(196,101,74,.12)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c4654a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <p className="kfin-kpi-label">Credit Outstanding</p>
            <p className="kfin-kpi-value">{fmtNPR(summary.pending)}</p>
          </div>
          {tab === "invoice" && (
            <div className="kfin-kpi">
              <div className="kfin-kpi-ico" style={{ background: "rgba(180,130,30,.12)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b4821e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
              <p className="kfin-kpi-label">VAT Collected</p>
              <p className="kfin-kpi-value">{fmtNPR(summary.vatCollected)}</p>
              <p className="kfin-kpi-sub">13% VAT · paid invoices</p>
            </div>
          )}
        </div>

        {/* ══ New Document Form ══ */}
        {showForm && (
          <div className="kfin-block">
            <div className="kfin-block-hd">
              <h2 className="kfin-block-title">{editingId ? `Edit ${meta.label}` : `New ${meta.label}`}</h2>
              <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
                {editingId
                  ? `Editing ${form[meta.numberField] || editingId} · FY ${form.fiscalYear || "—"}`
                  : `Number auto-assigned (${meta.prefix}-###) · FY ${form.fiscalYear || "—"}`}
              </span>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="kfin-form" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>

                {/* Date */}
                <label className="kfin-label">
                  Date
                  <input className="kfin-input" type="date" value={form.date} required onChange={e => setF("date", e.target.value)} />
                </label>

                {/* Due Date / Valid Until */}
                {tab === "invoice" && (
                  <label className="kfin-label">
                    Due Date
                    <input className="kfin-input" type="date" value={form.dueDate} onChange={e => setF("dueDate", e.target.value)} />
                  </label>
                )}
                {tab === "quotation" && (
                  <label className="kfin-label">
                    Valid Until
                    <input className="kfin-input" type="date" value={form.validUntil} onChange={e => setF("validUntil", e.target.value)} />
                  </label>
                )}

                {/* Status */}
                <label className="kfin-label">
                  Status
                  <select className="kfin-select" value={form.status} onChange={e => setF("status", e.target.value)}>
                    {STATUS_BY_TYPE[tab].map(s => <option key={s}>{s}</option>)}
                  </select>
                </label>

                {/* Fiscal Year (invoice + challan) */}
                {(tab === "invoice" || tab === "challan") && (
                  <label className="kfin-label">
                    Fiscal Year (B.S.)
                    <input className="kfin-input" type="text" value={form.fiscalYear || ""} placeholder="e.g. 2082/83" onChange={e => setF("fiscalYear", e.target.value)} />
                  </label>
                )}

                {/* Payment Terms (invoice) */}
                {tab === "invoice" && (
                  <label className="kfin-label">
                    Payment Terms
                    <input className="kfin-input" type="text" value={form.paymentTerms} placeholder="Net 30" onChange={e => setF("paymentTerms", e.target.value)} />
                  </label>
                )}

                {/* Challan — Transport Details (Nepal compliance) */}
                {tab === "challan" && (
                  <>
                    <label className="kfin-label">
                      Vehicle No.
                      <input className="kfin-input" type="text" value={form.vehicleNo || ""} placeholder="BA 1 KA 1234" onChange={e => setF("vehicleNo", e.target.value)} />
                    </label>
                    <label className="kfin-label">
                      Driver Name
                      <input className="kfin-input" type="text" value={form.driverName || ""} placeholder="Full name" onChange={e => setF("driverName", e.target.value)} />
                    </label>
                    <label className="kfin-label">
                      Route — From
                      <input className="kfin-input" type="text" value={form.routeFrom || ""} placeholder="Departure location" onChange={e => setF("routeFrom", e.target.value)} />
                    </label>
                    <label className="kfin-label">
                      Route — To
                      <input className="kfin-input" type="text" value={form.routeTo || ""} placeholder="Destination" onChange={e => setF("routeTo", e.target.value)} />
                    </label>
                  </>
                )}

                {/* Client fields */}
                <label className="kfin-label" style={{ gridColumn: "span 3" }}>
                  Client / Company Name
                  <input className="kfin-input" type="text" value={form.clientName} required placeholder="Client or company name" onChange={e => setF("clientName", e.target.value)} />
                </label>
                <label className="kfin-label">
                  Client PAN
                  <input className="kfin-input" type="text" value={form.clientPAN} placeholder="9-digit PAN (required if > NPR 50,000)" onChange={e => setF("clientPAN", e.target.value)} />
                </label>
                <label className="kfin-label">
                  Client Phone
                  <input className="kfin-input" type="text" value={form.clientPhone} placeholder="+977 ..." onChange={e => setF("clientPhone", e.target.value)} />
                </label>
                <label className="kfin-label">
                  Client Address
                  <textarea className="kfin-input" value={form.clientAddress} placeholder="Street, Ward No., City" rows={2} style={{ resize: "vertical", fontFamily: "var(--font)" }} onChange={e => setF("clientAddress", e.target.value)} />
                </label>
              </div>

              {/* ── Line Items ── */}
              <div className="kbil-items">
                <div className="kbil-items-hd">
                  <h3 className="kbil-items-title">Line Items</h3>
                  <button type="button" className="kbil-items-add" onClick={() => setForm(f => ({ ...f, items: [...f.items, { ...emptyItem }] }))}>+ Add Row</button>
                </div>
                <div className="kbil-cols">
                  <span className="kbil-col-label">Description</span>
                  <span className="kbil-col-label">Qty</span>
                  <span className="kbil-col-label">Unit</span>
                  <span className="kbil-col-label">Rate (NPR)</span>
                  <span className="kbil-col-label kbil-col-right">Amount</span>
                  <span />
                </div>
                {form.items.map((item, idx) => (
                  <div className="kbil-item-row" key={idx}>
                    <input className="kfin-input" type="text" value={item.description} placeholder="Item or service" onChange={e => updateItem(idx, "description", e.target.value)} />
                    <input className="kfin-input" type="number" min="0" step="any" value={item.qty} onChange={e => updateItem(idx, "qty", e.target.value)} />
                    <input className="kfin-input" type="text" value={item.unit} placeholder="Pcs" onChange={e => updateItem(idx, "unit", e.target.value)} />
                    <input className="kfin-input" type="number" min="0" step="any" value={item.rate} placeholder="0" onChange={e => updateItem(idx, "rate", e.target.value)} />
                    <span className="kbil-item-amount">{(Number(item.qty || 0) * Number(item.rate || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    <button type="button" className="kbil-item-del" disabled={form.items.length <= 1} onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}>×</button>
                  </div>
                ))}
              </div>

              {/* ── Totals + Discount ── */}
              <div className="kbil-totals">
                {/* VAT toggle */}
                {tab === "invoice" && (
                  <label className="kbil-vat-check">
                    <input type="checkbox" checked={form.applyVAT} onChange={e => setF("applyVAT", e.target.checked)} />
                    Apply VAT @ 13% (Nepal IRD)
                  </label>
                )}

                {/* Discount */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <label style={{ fontSize: 13, color: "var(--ink-3)", whiteSpace: "nowrap" }}>Discount %</label>
                  <input
                    className="kfin-input"
                    type="number" min="0" max="100" step="0.5"
                    value={form.discountPct || 0}
                    style={{ width: 80 }}
                    onChange={e => setF("discountPct", e.target.value)}
                  />
                  {Number(form.discountPct) > 0 && (
                    <span style={{ fontSize: 12, color: "var(--terra)", fontWeight: 600 }}>
                      − {fmtNPR(formTotals.discountAmt)} off
                    </span>
                  )}
                </div>

                <div className="kbil-totals-card">
                  <div className="kbil-totals-row">
                    <span className="kbil-totals-label">Subtotal</span>
                    <span className="kbil-totals-val">{fmtNPR(formTotals.subtotal)}</span>
                  </div>
                  {Number(form.discountPct) > 0 && (
                    <>
                      <div className="kbil-totals-row" style={{ color: "var(--terra)" }}>
                        <span className="kbil-totals-label">Discount ({form.discountPct}%)</span>
                        <span className="kbil-totals-val">− {fmtNPR(formTotals.discountAmt)}</span>
                      </div>
                      <div className="kbil-totals-row">
                        <span className="kbil-totals-label">Taxable Amount</span>
                        <span className="kbil-totals-val">{fmtNPR(formTotals.taxableAmt)}</span>
                      </div>
                    </>
                  )}
                  {tab === "invoice" && form.applyVAT && (
                    <div className="kbil-totals-row">
                      <span className="kbil-totals-label">VAT (13%)</span>
                      <span className="kbil-totals-val">{fmtNPR(formTotals.vatAmt)}</span>
                    </div>
                  )}
                  <div className="kbil-totals-grand">
                    <span>Grand Total</span>
                    <span className="kbil-totals-grand-val">{fmtNPR(formTotals.total)}</span>
                  </div>
                </div>
              </div>

              {/* Terms (quotation) */}
              {tab === "quotation" && (
                <label className="kfin-label" style={{ marginTop: 16 }}>
                  Terms &amp; Conditions
                  <textarea className="kfin-input" value={form.terms || ""} rows={4} style={{ resize: "vertical", fontFamily: "var(--font)", marginTop: 4 }} onChange={e => setF("terms", e.target.value)} />
                </label>
              )}

              {/* Notes / Bank Details */}
              <label className="kfin-label" style={{ marginTop: 16 }}>
                Notes / Bank Details / Remarks
                <textarea className="kfin-input" value={form.note} rows={3} placeholder={"Bank: \nAccount No.: \nBranch:"} style={{ resize: "vertical", fontFamily: "var(--font)", marginTop: 4 }} onChange={e => setF("note", e.target.value)} />
              </label>

              <div className="kbil-form-actions">
                <button type="submit" className="kbil-btn-primary" disabled={submitting}>
                  {submitting ? "Saving…" : editingId ? "Save Changes" : `Create ${meta.label}`}
                </button>
                <button type="button" className="kbil-btn-ghost" onClick={() => { setShowForm(false); setEditingId(null); setForm(makeEmptyForm(tab)); }}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* ══ Document List ══ */}
        <div className="kfin-block">
          <div className="kfin-block-hd">
            <h2 className="kfin-block-title">
              {meta.label}s <span className="kfin-block-sub">({activeDocs.length})</span>
            </h2>
          </div>

          {activeDocs.length === 0 ? (
            <p style={{ color: "var(--ink-3)", fontSize: "0.9rem", padding: "8px 0" }}>No {meta.label.toLowerCase()}s yet. Create your first one above.</p>
          ) : (
            <div className="kfin-tbl-wrap">
              <table className="kfin-tbl">
                <thead>
                  <tr>
                    <th>{meta.label} #</th>
                    <th>Date</th>
                    <th>Client</th>
                    <th>PAN</th>
                    {tab === "invoice"   && <th>Related</th>}
                    {tab === "challan"   && <th>Related</th>}
                    {tab === "quotation" && <th>Valid Until</th>}
                    <th style={{ textAlign: "right" }}>Subtotal</th>
                    {tab === "invoice" && <th style={{ textAlign: "right" }}>Disc.</th>}
                    {tab === "invoice" && <th style={{ textAlign: "right" }}>VAT 13%</th>}
                    <th style={{ textAlign: "right" }}>Total</th>
                    {tab === "invoice" && <th style={{ textAlign: "right" }}>Credit Due</th>}
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDocs.map(row => {
                    const creditDue = Math.max(0, (row.totalNPR || 0) - (row.amountPaid || 0));
                    return (
                      <tr key={row.id}>
                        <td style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--mint-deep)" }}>{row[numField]}</td>
                        <td>{fmtDate(row.date)}</td>
                        <td style={{ fontWeight: 500 }}>{row.clientName}</td>
                        <td style={{ color: "var(--ink-4)", fontSize: 12 }}>{row.clientPAN || "—"}</td>

                        {tab === "invoice" && (
                          <td style={{ fontSize: 11, color: "var(--ink-4)" }}>
                            {row.relatedQuotation && <span title="From quotation">QT: {row.relatedQuotation}</span>}
                            {row.relatedChallan   && <span title="Challan ref"> CH: {row.relatedChallan}</span>}
                            {!row.relatedQuotation && !row.relatedChallan && "—"}
                          </td>
                        )}
                        {tab === "challan" && (
                          <td style={{ fontSize: 11, color: "var(--ink-4)" }}>
                            {row.relatedInvoice ? <span>INV: {row.relatedInvoice}</span> : "—"}
                          </td>
                        )}
                        {tab === "quotation" && (
                          <td style={{ fontSize: 12, color: "var(--ink-4)" }}>{fmtDate(row.validUntil)}</td>
                        )}

                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtNPR(row.subtotalNPR || 0)}</td>
                        {tab === "invoice" && (
                          <td style={{ textAlign: "right", fontSize: 12, color: "var(--terra)", fontVariantNumeric: "tabular-nums" }}>
                            {row.discountPct > 0 ? `${row.discountPct}%` : "—"}
                          </td>
                        )}
                        {tab === "invoice" && <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtNPR(row.vatAmountNPR || 0)}</td>}
                        <td style={{ textAlign: "right", fontWeight: 700, color: "var(--mint-deep)", fontVariantNumeric: "tabular-nums" }}>{fmtNPR(row.totalNPR || 0)}</td>

                        {/* Credit Due column — invoices only */}
                        {tab === "invoice" && (
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {row.status === "Cancelled" ? (
                              <span style={{ color: "var(--ink-4)", fontSize: 12 }}>—</span>
                            ) : creditDue > 0 ? (
                              <span style={{ color: "var(--terra)", fontWeight: 700, fontSize: 12 }}>{fmtNPR(creditDue)}</span>
                            ) : (
                              <span style={{ color: "var(--mint-deep)", fontSize: 12 }}>Settled</span>
                            )}
                          </td>
                        )}

                        <td>{statusBadge(row.status)}</td>
                        <td>
                          <div className="kbil-tbl-actions">
                            <button className="kbil-tbl-btn kbil-tbl-btn--primary" onClick={() => setPreviewDoc({ data: row, docType: tab })}>View</button>

                            {/* Edit */}
                            {canEdit && row.status !== "Cancelled" && (
                              <button className="kbil-tbl-btn" onClick={() => openEdit(row)}>Edit</button>
                            )}

                            {/* Record payment (invoice) */}
                            {canEdit && tab === "invoice" && !["Paid", "Cancelled"].includes(row.status) && (
                              <button
                                className="kbil-tbl-btn kbil-tbl-btn--ok"
                                onClick={() => {
                                  setPayModal({ id: row.id, docNum: row.invoiceNumber, totalNPR: row.totalNPR || 0, currentPaid: row.amountPaid || 0, coll: meta.coll });
                                  setPayAmt("");
                                }}
                              >
                                {(row.amountPaid || 0) > 0 ? "Add Payment" : "Record Payment"}
                              </button>
                            )}

                            {/* Delivered (challan) */}
                            {canEdit && tab === "challan" && !["Delivered", "Cancelled"].includes(row.status) && (
                              <button className="kbil-tbl-btn kbil-tbl-btn--ok" onClick={() => updateStatus(row.id, "Delivered")}>Delivered</button>
                            )}

                            {/* Accept (quotation) */}
                            {canEdit && tab === "quotation" && !["Accepted", "Rejected", "Cancelled"].includes(row.status) && (
                              <button className="kbil-tbl-btn kbil-tbl-btn--ok" onClick={() => updateStatus(row.id, "Accepted")}>Accept</button>
                            )}

                            {/* Convert quotation → invoice */}
                            {canEdit && tab === "quotation" && !row.relatedInvoice && row.status !== "Cancelled" && row.status !== "Rejected" && (
                              <button className="kbil-tbl-btn kbil-tbl-btn--primary" disabled={submitting} onClick={() => convertToInvoice(row)}>→ Invoice</button>
                            )}

                            {/* Cancel */}
                            {canEdit && row.status !== "Cancelled" && (
                              <button className="kbil-tbl-btn kbil-tbl-btn--danger" onClick={() => cancelDoc(row.id)}>Cancel</button>
                            )}
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

        {/* ══ Cancelled Documents ══ */}
        {cancelledDocs.length > 0 && (
          <div className="kfin-block" style={{ borderColor: "var(--terra)", opacity: 0.85 }}>
            <div className="kfin-block-hd" style={{ cursor: "pointer" }} onClick={() => setShowCancelled(v => !v)}>
              <h2 className="kfin-block-title" style={{ color: "var(--terra)", display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                Cancelled {meta.label}s
                <span className="kfin-block-sub">({cancelledDocs.length})</span>
              </h2>
              <span style={{ fontSize: 12, color: "var(--ink-4)" }}>{showCancelled ? "▲ Hide" : "▼ Show"}</span>
            </div>

            {showCancelled && (
              <div className="kfin-tbl-wrap">
                <table className="kfin-tbl" style={{ opacity: 0.7 }}>
                  <thead>
                    <tr>
                      <th>{meta.label} #</th>
                      <th>Date</th>
                      <th>Client</th>
                      <th>PAN</th>
                      {tab === "invoice"   && <th>Related</th>}
                      {tab === "challan"   && <th>Related</th>}
                      {tab === "quotation" && <th>Valid Until</th>}
                      <th style={{ textAlign: "right" }}>Subtotal</th>
                      {tab === "invoice" && <th style={{ textAlign: "right" }}>Disc.</th>}
                      {tab === "invoice" && <th style={{ textAlign: "right" }}>VAT 13%</th>}
                      <th style={{ textAlign: "right" }}>Total</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancelledDocs.map(row => (
                      <tr key={row.id}>
                        <td style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--ink-3)" }}>{row[numField]}</td>
                        <td>{fmtDate(row.date)}</td>
                        <td style={{ fontWeight: 500 }}>{row.clientName}</td>
                        <td style={{ color: "var(--ink-4)", fontSize: 12 }}>{row.clientPAN || "—"}</td>

                        {tab === "invoice" && (
                          <td style={{ fontSize: 11, color: "var(--ink-4)" }}>
                            {row.relatedQuotation && <span title="From quotation">QT: {row.relatedQuotation}</span>}
                            {row.relatedChallan   && <span title="Challan ref"> CH: {row.relatedChallan}</span>}
                            {!row.relatedQuotation && !row.relatedChallan && "—"}
                          </td>
                        )}
                        {tab === "challan" && (
                          <td style={{ fontSize: 11, color: "var(--ink-4)" }}>
                            {row.relatedInvoice ? <span>INV: {row.relatedInvoice}</span> : "—"}
                          </td>
                        )}
                        {tab === "quotation" && (
                          <td style={{ fontSize: 12, color: "var(--ink-4)" }}>{fmtDate(row.validUntil)}</td>
                        )}

                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtNPR(row.subtotalNPR || 0)}</td>
                        {tab === "invoice" && (
                          <td style={{ textAlign: "right", fontSize: 12, color: "var(--terra)", fontVariantNumeric: "tabular-nums" }}>
                            {row.discountPct > 0 ? `${row.discountPct}%` : "—"}
                          </td>
                        )}
                        {tab === "invoice" && <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtNPR(row.vatAmountNPR || 0)}</td>}
                        <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtNPR(row.totalNPR || 0)}</td>
                        <td>{statusBadge(row.status)}</td>
                        <td>
                          <button className="kbil-tbl-btn kbil-tbl-btn--primary" onClick={() => setPreviewDoc({ data: row, docType: tab })}>View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Payment Modal ── */}
      {payModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: 28, width: "100%", maxWidth: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.22)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: "1.05rem", fontWeight: 700 }}>Record Payment</h3>
            <p style={{ color: "var(--ink-3)", fontSize: 13, margin: "0 0 14px" }}>
              {payModal.docNum} · Total: <strong>{fmtNPR(payModal.totalNPR)}</strong>
            </p>
            {payModal.currentPaid > 0 && (
              <div style={{ background: "var(--bg)", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12 }}>
                <div>Already paid: <strong>{fmtNPR(payModal.currentPaid)}</strong></div>
                <div style={{ color: "var(--terra)" }}>Credit outstanding: <strong>{fmtNPR(payModal.totalNPR - payModal.currentPaid)}</strong></div>
              </div>
            )}
            <label className="kfin-label">
              Amount Received (NPR)
              <input
                className="kfin-input"
                type="number" min="1" step="any"
                value={payAmt}
                autoFocus
                onChange={e => setPayAmt(e.target.value)}
                placeholder={`Up to ${(payModal.totalNPR - payModal.currentPaid).toFixed(2)}`}
                style={{ marginTop: 4 }}
              />
            </label>
            {payAmt && Number(payAmt) > 0 && (
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.6 }}>
                Total paid after: <strong>{fmtNPR(Math.min(payModal.currentPaid + Number(payAmt), payModal.totalNPR))}</strong><br />
                Credit remaining: <strong style={{ color: Math.max(0, payModal.totalNPR - payModal.currentPaid - Number(payAmt)) > 0 ? "var(--terra)" : "var(--mint-deep)" }}>
                  {fmtNPR(Math.max(0, payModal.totalNPR - payModal.currentPaid - Number(payAmt)))}
                </strong>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="kbil-btn-primary" onClick={recordPayment}>Save Payment</button>
              <button className="kbil-btn-ghost" onClick={() => { setPayModal(null); setPayAmt(""); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── A4 Document Preview ── */}
      {previewDoc && (
        <DocPreview data={previewDoc.data} docType={previewDoc.docType} onClose={() => setPreviewDoc(null)} />
      )}
    </AppLayout>
  );
}

export default Billing;

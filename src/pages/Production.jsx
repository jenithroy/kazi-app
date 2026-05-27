import { useEffect, useMemo, useState } from "react";
import {
  addDoc, collection, doc, getDocs, serverTimestamp, updateDoc, deleteDoc
} from "firebase/firestore";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import { db, storage } from "../firebase";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { useRef } from "react";
import { todayDate } from "../utils/date";
import { cn, Pill, Progress, Icons } from "../components/ui";
import { GBP_RATE } from "../constants";

const VAT_RATE = 0.13;

function dueIn30(fromDate) {
  const d = fromDate ? new Date(fromDate) : new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

const emptyInvFields = {
  clientAddress: "", clientPhone: "", clientPAN: "",
  dueDate: dueIn30(todayDate()), applyVAT: true, paymentTerms: "Net 30",
};

/* ── Batch form defaults ──────────────────────────────── */
const initialBatchForm = {
  date: todayDate(), cut: "", stitched: "", passed: "", rejected: "", note: ""
};

/* ── Order stages ─────────────────────────────────────── */
const STAGES = [
  "Order Received",
  "Fabric Sourcing",
  "Cutting",
  "Stitching",
  "Finishing & Pressing",
  "Quality Check",
  "Packing",
  "Shipped",
  "Delivered"
];

const FABRIC_TYPES = [
  "Terry Cotton", "Chinese Terry Fabric", "Rib Fabric", "Fleece", "Jersey",
  "Denim", "Linen", "Polyester Blend", "Other"
];

function parseInvoiceDescription(desc) {
  let styleName = desc || "";
  let fabricType = "Terry Cotton";
  let colorway = "";

  const colorMatch = desc.match(/\(([^)]+)\)$/);
  let baseDesc = desc;
  if (colorMatch) {
    colorway = colorMatch[1];
    baseDesc = desc.replace(/\s*\([^)]+\)$/, "");
  }

  const parts = baseDesc.split(/\s*(?:—|-)\s*/);
  if (parts.length > 1) {
    styleName = parts[0].trim();
    const fabricCandidate = parts[1].trim();
    if (FABRIC_TYPES.includes(fabricCandidate)) {
      fabricType = fabricCandidate;
    } else {
      fabricType = "Other";
    }
  } else {
    styleName = baseDesc.trim();
  }

  return { styleName, fabricType, colorway };
}

const emptyOrderForm = {
  date: todayDate(),
  deliveryDate: "",
  customerName: "",
  styleName: "",
  fabricType: "Terry Cotton",
  colorway: "",
  quantity: "",
  pricePerPcNPR: "",
  invoiceRef: "",
  assignedTo: "",
  stage: "Order Received",
  status: "Active",
  notes: ""
};

/* ── Invoice modal (existing orders) ─────────────────── */
function InvoiceModal({ order, fields, setFields, onClose, onSubmit, saving }) {
  const qty  = Number(order.quantity || 0);
  const rate = Number(order.pricePerPcNPR || 0);
  const sub  = qty * rate;
  const vat  = fields.applyVAT ? sub * VAT_RATE : 0;
  const tot  = sub + vat;

  return (
    <div className="kbrf-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="kbrf-modal" style={{ maxWidth: 520 }}>
        <div className="kbrf-modal-hd">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Issue Invoice</div>
            <div style={{ fontSize: 12, color: "var(--ink-4)", fontWeight: 400, marginTop: 2 }}>
              {order.orderId} · {order.customerName}
            </div>
          </div>
          <button className="kbrf-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Line item preview */}
        <div className="kprod-inv-line-preview">
          <div className="kprod-inv-line-row">
            <span style={{ flex: 1, fontSize: 13, color: "var(--ink)" }}>
              {order.styleName}{order.fabricType ? ` — ${order.fabricType}` : ""}{order.colorway ? ` (${order.colorway})` : ""}
            </span>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{qty.toLocaleString()} pcs × NPR {rate.toLocaleString()}</span>
          </div>
        </div>

        <div className="kprod-inv-grid" style={{ marginTop: 16 }}>
          <label className="kprod-inv-label">
            Client Address
            <input className="kprod-inv-input" type="text" placeholder="Street, City, Country"
              value={fields.clientAddress}
              onChange={e => setFields(f => ({ ...f, clientAddress: e.target.value }))} />
          </label>
          <label className="kprod-inv-label">
            Client Phone
            <input className="kprod-inv-input" type="text" placeholder="+977 ..."
              value={fields.clientPhone}
              onChange={e => setFields(f => ({ ...f, clientPhone: e.target.value }))} />
          </label>
          <label className="kprod-inv-label">
            PAN / Tax No.
            <input className="kprod-inv-input" type="text" placeholder="VAT / PAN number"
              value={fields.clientPAN}
              onChange={e => setFields(f => ({ ...f, clientPAN: e.target.value }))} />
          </label>
          <label className="kprod-inv-label">
            Due Date
            <input className="kprod-inv-input" type="date"
              value={fields.dueDate}
              onChange={e => setFields(f => ({ ...f, dueDate: e.target.value }))} />
          </label>
          <label className="kprod-inv-label">
            Payment Terms
            <select className="kprod-inv-input" value={fields.paymentTerms}
              onChange={e => setFields(f => ({ ...f, paymentTerms: e.target.value }))}>
              <option>Net 15</option><option>Net 30</option>
              <option>Net 45</option><option>Net 60</option>
              <option>Due on Receipt</option>
            </select>
          </label>
          <label className="kprod-inv-label">
            <div className="kprod-inv-vat-row">
              <span>Apply VAT (13%)</span>
              <button type="button"
                className={cn("kadm-toggle", fields.applyVAT && "kadm-toggle--on")}
                onClick={() => setFields(f => ({ ...f, applyVAT: !f.applyVAT }))}>
                <span className="kadm-toggle-knob" />
              </button>
            </div>
          </label>
        </div>

        {/* Totals */}
        <div className="kprod-inv-totals">
          <div className="kprod-inv-totals-row">
            <span>Subtotal</span><span>NPR {sub.toLocaleString()}</span>
          </div>
          {fields.applyVAT && (
            <div className="kprod-inv-totals-row">
              <span>VAT 13%</span><span>NPR {Math.round(vat).toLocaleString()}</span>
            </div>
          )}
          <div className="kprod-inv-totals-row kprod-inv-totals-total">
            <span>Total</span><span>NPR {Math.round(tot).toLocaleString()}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button className="ghost-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={saving} onClick={() => onSubmit(order, fields)}>
            {saving ? "Issuing…" : "Issue Invoice (Draft)"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Pipeline columns (5-stage view) ─────────────────── */
const PIPELINE_COLS = [
  {
    id: "received",
    label: "Order Received",
    stages: ["Order Received"],
    accent: "var(--blue)",
    tone: "blue"
  },
  {
    id: "cutting",
    label: "Cutting",
    stages: ["Fabric Sourcing", "Cutting"],
    accent: "var(--amber)",
    tone: "amber"
  },
  {
    id: "stitching",
    label: "Stitching",
    stages: ["Stitching", "Finishing & Pressing"],
    accent: "var(--terra)",
    tone: "terra"
  },
  {
    id: "qc",
    label: "QC",
    stages: ["Quality Check"],
    accent: "var(--mint-2)",
    tone: "mint"
  },
  {
    id: "dispatch",
    label: "Dispatch",
    stages: ["Packing", "Shipped", "Delivered"],
    accent: "#5b8af5",
    tone: "blue"
  },
];

function colForStage(stage) {
  return PIPELINE_COLS.find(c => c.stages.includes(stage)) || PIPELINE_COLS[0];
}

function orderPriority(order) {
  if (!order.deliveryDate) return { label: "Normal", tone: "neutral" };
  const days = Math.ceil((new Date(order.deliveryDate) - new Date()) / 86400000);
  if (days <= 5)  return { label: "Urgent", tone: "terra"   };
  if (days <= 12) return { label: "High",   tone: "amber"  };
  return              { label: "Normal", tone: "neutral" };
}

function stageProgress(stage) {
  const idx = STAGES.indexOf(stage);
  return idx < 0 ? 0 : Math.round((idx / (STAGES.length - 1)) * 100);
}

function orderStatusBadge(status) {
  const map = {
    Active:    "badge-ok",
    "On Hold": "badge-warn",
    Completed: "badge-muted",
    Cancelled: "badge-danger"
  };
  return <span className={map[status] || "badge-muted"}>{status}</span>;
}

/* ── Pipeline card ────────────────────────────────────── */
function PipelineCard({ order, col, expanded, onToggle, onAdvance, onReverse, canEdit, profile, onUpdate }) {
  const pri = orderPriority(order);
  const pct = stageProgress(order.stage);

  return (
    <div
      className="kprod-card"
      draggable={canEdit}
      onDragStart={e => e.dataTransfer.setData("orderId", order.id)}
      onClick={onToggle}
    >
      <div className="kprod-card-h">
        <span className="kprod-id">{order.orderId}</span>
        <Pill tone={pri.tone}>{pri.label}</Pill>
      </div>
      <div className="kprod-card-c">{order.customerName}</div>
      <div className="kprod-card-p">{order.styleName}</div>
      <div className="kprod-card-bar">
        <Progress pct={pct} h={4} color={col.accent} track="rgba(15,46,34,.07)" />
      </div>
      <div className="kprod-card-foot">
        <span>{Number(order.quantity || 0).toLocaleString()} pcs</span>
        {order.deliveryDate && (
          <span className="kprod-card-due">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
            {order.deliveryDate}
          </span>
        )}
      </div>

      {expanded && (
        <div
          style={{ marginTop: 8, borderTop: "1px solid var(--line)", paddingTop: 8, fontSize: 11 }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ color: "var(--ink-3)", marginBottom: 2 }}>
            {order.fabricType}{order.colorway ? ` · ${order.colorway}` : ""}
          </div>
          <div style={{ color: "var(--ink-3)" }}>
            Stage: <strong style={{ color: "var(--ink)" }}>{order.stage}</strong>
          </div>
          {order.invoiceRef && (
            <div style={{ color: "var(--ink-4)", marginTop: 2 }}>Ref: {order.invoiceRef}</div>
          )}
          {canEdit && order.status === "Active" && (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button
                className="ghost-button"
                style={{ fontSize: 11, padding: "3px 8px" }}
                onClick={e => { e.stopPropagation(); onReverse(); }}
                disabled={STAGES.indexOf(order.stage) === 0}
              >← Back</button>
              <button
                className="primary-button"
                style={{ fontSize: 11, padding: "3px 8px" }}
                onClick={e => { e.stopPropagation(); onAdvance(); }}
                disabled={STAGES.indexOf(order.stage) === STAGES.length - 1}
              >{STAGES.indexOf(order.stage) === STAGES.length - 2 ? "Deliver" : "Next →"}</button>
            </div>
          )}
          <OrderNotesSection
            order={order}
            canEdit={canEdit}
            profile={profile}
            onUpdate={onUpdate}
          />
        </div>
      )}
    </div>
  );
}

/* ── Image compression helper ───────────────────────── */
function compressImage(file, maxWidth = 2000, maxHeight = 2000, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error("Canvas conversion to Blob failed"));
              return;
            }
            const compressedFile = new File([blob], file.name, {
              type: "image/jpeg",
              lastModified: Date.now()
            });
            resolve(compressedFile);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = err => reject(err);
      img.src = event.target.result;
    };
    reader.onerror = err => reject(err);
  });
}

/* ── Notes and Attachments Section ─────────────────── */
function OrderNotesSection({ order, canEdit, profile, onUpdate }) {
  const [noteText, setNoteText] = useState("");
  const [file, setFile] = useState(null);
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);
  const fileInputRef = useRef(null);

  async function handleFileChange(e) {
    const selected = e.target.files[0];
    if (!selected) {
      setFile(null);
      return;
    }

    if (selected.type.startsWith("image/")) {
      setCompressing(true);
      setFile(selected);
      try {
        const compressed = await compressImage(selected);
        setFile(compressed);
      } catch (err) {
        console.warn("Image compression failed, using original file:", err);
      } finally {
        setCompressing(false);
      }
    } else {
      setFile(selected);
    }
  }

  async function handleAddNote(e) {
    e.preventDefault();
    if (!noteText.trim() && !file) return;
    setUploading(true);
    let imageUrl = null;
    let storagePath = null;

    try {
      if (file) {
        const fileToUpload = file;
        const safeName = fileToUpload.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `production-notes/${order.id}/${Date.now()}_${safeName}`;
        const fileRef = storageRef(storage, path);
        const task = uploadBytesResumable(fileRef, fileToUpload);
        
        task.on(
          "state_changed",
          snap => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100))
        );
        
        await task;
        
        imageUrl = await getDownloadURL(fileRef);
        storagePath = path;
      }

      const newNote = {
        id: `note_${Date.now()}`,
        text: noteText.trim(),
        date: todayDate(),
        by: profile?.name || "Unknown",
        ...(imageUrl ? { imageUrl, storagePath } : {})
      };

      const updatedNotes = [...(order.notesList || []), newNote];
      await updateDoc(doc(db, "orders", order.id), { notesList: updatedNotes });
      setNoteText("");
      setFile(null);
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error("Failed to add note:", err);
      alert("Failed to add note: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteNote(noteId, storagePath) {
    if (!window.confirm("Are you sure you want to delete this note?")) return;
    try {
      if (storagePath) {
        try {
          await deleteObject(storageRef(storage, storagePath));
        } catch (e) {
          console.warn("Storage file delete failed or didn't exist:", e);
        }
      }
      const updatedNotes = (order.notesList || []).filter(n => n.id !== noteId);
      await updateDoc(doc(db, "orders", order.id), { notesList: updatedNotes });
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error("Failed to delete note:", err);
      alert("Failed to delete note: " + err.message);
    }
  }

  return (
    <div style={{ marginTop: 12, borderTop: "1px dashed var(--line-strong)", paddingTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
        Notes &amp; Attachments
      </div>

      {/* Notes List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {(!order.notesList || order.notesList.length === 0) ? (
          <span style={{ fontSize: 11, color: "var(--ink-4)", fontStyle: "italic" }}>No notes added yet.</span>
        ) : (
          order.notesList.map(n => (
            <div key={n.id} style={{ background: "var(--bg-surface-soft, #f8faf8)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 11.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-4)", fontSize: 10, marginBottom: 4 }}>
                <span><strong>{n.by}</strong> · {n.date}</span>
                {canEdit && (
                  <button
                    onClick={() => handleDeleteNote(n.id, n.storagePath)}
                    style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 10, padding: 0 }}
                  >
                    Delete
                  </button>
                )}
              </div>
              {n.text && <div style={{ color: "var(--ink)", whiteSpace: "pre-wrap" }}>{n.text}</div>}
              {n.imageUrl && (
                <div style={{ marginTop: 6 }}>
                  <a href={n.imageUrl} target="_blank" rel="noopener noreferrer">
                    <img
                      src={n.imageUrl}
                      alt="Attachment"
                      style={{ maxWidth: "100%", maxHeight: 600, borderRadius: 6, border: "1px solid var(--line-strong)", cursor: "zoom-in" }}
                    />
                  </a>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add Note Form */}
      {canEdit && (
        <form onSubmit={handleAddNote} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea
            placeholder="Write a note..."
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            rows={2}
            style={{
              width: "100%",
              borderRadius: 6,
              border: "1px solid var(--line-strong)",
              padding: "6px 8px",
              fontSize: 11.5,
              fontFamily: "var(--font)",
              resize: "vertical"
            }}
          />
          {file && (
            <div style={{ position: "relative", display: "inline-flex", marginTop: 4, marginBottom: 4, alignSelf: "flex-start" }}>
              <img
                src={URL.createObjectURL(file)}
                alt="Upload preview"
                style={{ height: 180, borderRadius: 6, border: "1px solid var(--line-strong)", objectFit: "cover" }}
              />
              <button
                type="button"
                onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  background: "var(--danger, #dc2626)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "50%",
                  width: 16,
                  height: 16,
                  fontSize: 10,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "bold",
                  lineHeight: 1
                }}
                title="Remove image"
              >
                ✕
              </button>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <label style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--ink-3)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              {compressing ? "Optimizing image..." : file ? file.name.slice(0, 15) + "..." : "Attach Picture"}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={compressing || uploading}
                style={{ display: "none" }}
              />
            </label>
            <button
              type="submit"
              className="primary-button"
              disabled={uploading || compressing || (!noteText.trim() && !file)}
              style={{ fontSize: 10.5, padding: "4px 10px" }}
            >
              {uploading ? "Uploading..." : "Add Note"}
            </button>
          </div>
          {progress !== null && (
            <div style={{ height: 3, background: "var(--line)", borderRadius: 3, overflow: "hidden", marginTop: 2 }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent)" }} />
            </div>
          )}
        </form>
      )}
    </div>
  );
}

/* ── Main component ───────────────────────────────────── */
function Production() {
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "production");

  const [activeTab, setActiveTab] = useState("pipeline");

  /* ── Batch state ── */
  const [batches, setBatches] = useState([]);
  const [batchForm, setBatchForm] = useState(initialBatchForm);
  const [saving, setSaving] = useState(false);

  /* ── Order state ── */
  const [orders, setOrders] = useState([]);
  const [orderForm, setOrderForm] = useState(emptyOrderForm);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [employees, setEmployees] = useState([]);

  /* ── Pipeline drag state ── */
  const [dragOver, setDragOver] = useState(null);

  /* ── Show completed toggle ── */
  const [showCompleted, setShowCompleted] = useState(false);

  /* ── Invoice state ── */
  const [issueInvoice,    setIssueInvoice]    = useState(false);
  const [invFields,       setInvFields]       = useState(emptyInvFields);
  const [invoices,        setInvoices]        = useState([]);
  const [invoiceModal,    setInvoiceModal]    = useState(null); // order object
  const [savingInvoice,   setSavingInvoice]   = useState(false);
  const [invModalFields,  setInvModalFields]  = useState(emptyInvFields);

  /* ── Recommendation state & helpers ── */
  const [dismissedSuggestion, setDismissedSuggestion] = useState(false);

  const latestInvoice = useMemo(() => {
    if (!invoices || invoices.length === 0) return null;
    const sorted = [...invoices].sort((a, b) => {
      const timeA = a.createdAt?.seconds || (a.date ? new Date(a.date).getTime() / 1000 : 0);
      const timeB = b.createdAt?.seconds || (b.date ? new Date(b.date).getTime() / 1000 : 0);
      return timeB - timeA;
    });
    return sorted[0];
  }, [invoices]);

  useEffect(() => {
    if (showOrderForm) {
      setDismissedSuggestion(false);
    }
  }, [showOrderForm]);

  function applyInvoiceSuggestion() {
    if (!latestInvoice) return;
    const firstItem = latestInvoice.items?.[0] || {};
    const parsed = parseInvoiceDescription(firstItem.description || "");

    setOrderForm(f => ({
      ...f,
      customerName: latestInvoice.clientName || "",
      styleName: parsed.styleName,
      fabricType: parsed.fabricType,
      colorway: parsed.colorway,
      quantity: firstItem.qty || "",
      pricePerPcNPR: firstItem.rate || "",
      invoiceRef: latestInvoice.invoiceNumber || "",
      notes: latestInvoice.note || "",
    }));

    if (latestInvoice.clientAddress || latestInvoice.clientPhone || latestInvoice.clientPAN) {
      setIssueInvoice(true);
      setInvFields(f => ({
        ...f,
        clientAddress: latestInvoice.clientAddress || "",
        clientPhone: latestInvoice.clientPhone || "",
        clientPAN: latestInvoice.clientPAN || "",
        dueDate: latestInvoice.dueDate || dueIn30(todayDate()),
        applyVAT: latestInvoice.applyVAT ?? true,
        paymentTerms: latestInvoice.paymentTerms || "Net 30",
      }));
    }
  }

  async function loadData() {
    const [batchSnap, orderSnap, empSnap, invSnap] = await Promise.all([
      getDocs(collection(db, "production")),
      getDocs(collection(db, "orders")),
      getDocs(collection(db, "employees")),
      getDocs(collection(db, "invoices")),
    ]);
    const batchRows = batchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    batchRows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    setBatches(batchRows);

    const orderRows = orderSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    orderRows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    setOrders(orderRows);

    setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.status !== "Inactive"));
    setInvoices(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  function nextInvoiceNumber(currentInvoices) {
    const list = currentInvoices ?? invoices;
    const nums = list.map(i => parseInt((i.invoiceNumber || "INV000").replace("INV-", ""), 10)).filter(n => !isNaN(n));
    return `INV-${String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, "0")}`;
  }

  function buildInvoiceDoc(order, fields, invNumber, orderId) {
    const qty  = Number(order.quantity || 0);
    const rate = Number(order.pricePerPcNPR || 0);
    const subtotal = qty * rate;
    const vatAmt   = fields.applyVAT ? subtotal * VAT_RATE : 0;
    const total    = subtotal + vatAmt;
    return {
      invoiceNumber:  invNumber,
      date:           order.date || todayDate(),
      dueDate:        fields.dueDate || dueIn30(order.date),
      fiscalYear:     "",
      paymentTerms:   fields.paymentTerms || "Net 30",
      clientName:     order.customerName || "",
      clientPAN:      fields.clientPAN || "",
      clientAddress:  fields.clientAddress || "",
      clientPhone:    fields.clientPhone || "",
      challanNumber:  order.invoiceRef || "",
      status:         "Draft",
      applyVAT:       !!fields.applyVAT,
      note:           order.notes || "",
      items: [{
        description: `${order.styleName || ""}${order.fabricType ? " — " + order.fabricType : ""}${order.colorway ? " (" + order.colorway + ")" : ""}`,
        qty,
        unit: "Pcs",
        rate,
      }],
      subtotalNPR:    subtotal,
      vatAmountNPR:   vatAmt,
      totalNPR:       total,
      linkedOrderId:  orderId || "",
      createdBy:      profile?.name || "Unknown",
      createdAt:      serverTimestamp(),
    };
  }

  useEffect(() => { loadData().catch(console.error); }, []);

  /* ── Batch helpers ── */
  const nextBatchId = useMemo(() => {
    const max = batches.reduce((m, b) => {
      const n = Number(String(b.batchId || "").replace("B", ""));
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `B${String(max + 1).padStart(3, "0")}`;
  }, [batches]);

  async function submitBatch(e) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "production"), {
        batchId: nextBatchId,
        date: batchForm.date,
        cut: Number(batchForm.cut || 0),
        stitched: Number(batchForm.stitched || 0),
        passed: Number(batchForm.passed || 0),
        rejected: Number(batchForm.rejected || 0),
        note: batchForm.note,
        loggedBy: profile?.name || "Unknown",
        createdAt: serverTimestamp()
      });
      setBatchForm(initialBatchForm);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  /* ── Order helpers ── */
  function nextOrderId() {
    const nums = orders.map(o => parseInt((o.orderId || "ORD000").replace("ORD-", ""), 10)).filter(n => !isNaN(n));
    return `ORD-${String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, "0")}`;
  }

  async function submitOrder(e) {
    e.preventDefault();
    setSavingOrder(true);
    const orderId  = nextOrderId();
    const total    = Number(orderForm.quantity || 0) * Number(orderForm.pricePerPcNPR || 0);
    const invNum   = issueInvoice ? nextInvoiceNumber() : null;

    const orderDoc = {
      ...orderForm,
      orderId,
      quantity:      Number(orderForm.quantity || 0),
      pricePerPcNPR: Number(orderForm.pricePerPcNPR || 0),
      totalValueNPR: total,
      stageHistory:  [{ stage: "Order Received", date: todayDate(), by: profile?.name || "Unknown" }],
      createdBy:     profile?.name || "Unknown",
      createdAt:     serverTimestamp(),
      ...(invNum ? { invoiceNumber: invNum } : {}),
    };

    const orderRef = await addDoc(collection(db, "orders"), orderDoc);

    if (issueInvoice && invNum) {
      const invDoc = buildInvoiceDoc(
        { ...orderForm, quantity: orderDoc.quantity },
        invFields,
        invNum,
        orderRef.id
      );
      await addDoc(collection(db, "invoices"), invDoc);
    }

    setOrderForm(emptyOrderForm);
    setIssueInvoice(false);
    setInvFields(emptyInvFields);
    setShowOrderForm(false);
    await loadData();
    setSavingOrder(false);
  }

  /* ── Issue invoice for existing order ── */
  async function issueInvoiceForOrder(order, fields) {
    setSavingInvoice(true);
    const invNum = nextInvoiceNumber();
    const invDoc = buildInvoiceDoc(order, fields, invNum, order.id);
    await addDoc(collection(db, "invoices"), invDoc);
    await updateDoc(doc(db, "orders", order.id), { invoiceNumber: invNum });
    setInvoiceModal(null);
    await loadData();
    setSavingInvoice(false);
  }

  async function advanceStage(order) {
    const curIdx = STAGES.indexOf(order.stage);
    if (curIdx >= STAGES.length - 1) return;
    const newStage = STAGES[curIdx + 1];
    const newStatus = newStage === "Delivered" ? "Completed" : order.status;
    const history = [...(order.stageHistory || []), { stage: newStage, date: todayDate(), by: profile?.name || "Unknown" }];
    await updateDoc(doc(db, "orders", order.id), { stage: newStage, status: newStatus, stageHistory: history });
    await loadData();
  }

  async function reverseStage(order) {
    const curIdx = STAGES.indexOf(order.stage);
    if (curIdx <= 0) return;
    const newStage = STAGES[curIdx - 1];
    const history = [...(order.stageHistory || []), { stage: `↩ Reverted to ${newStage}`, date: todayDate(), by: profile?.name || "Unknown" }];
    await updateDoc(doc(db, "orders", order.id), { stage: newStage, status: "Active", stageHistory: history });
    await loadData();
  }

  async function updateOrderStatus(order, status) {
    await updateDoc(doc(db, "orders", order.id), { status });
    await loadData();
  }

  async function deleteOrder(order) {
    if (!window.confirm(`Are you sure you want to permanently delete order ${order.orderId}?`)) return;
    await deleteDoc(doc(db, "orders", order.id));
    await loadData();
  }

  async function moveOrderToCol(orderId, col) {
    const order = orders.find(o => o.id === orderId);
    if (!order || !canEdit) return;
    const targetStage = col.stages[0];
    if (order.stage === targetStage) return;
    const history = [...(order.stageHistory || []), { stage: targetStage, date: todayDate(), by: profile?.name || "Unknown" }];
    await updateDoc(doc(db, "orders", orderId), { stage: targetStage, status: "Active", stageHistory: history });
    await loadData();
  }

  /* ── Stats ── */
  const orderStats = useMemo(() => ({
    total: orders.length,
    active: orders.filter(o => o.status === "Active").length,
    completed: orders.filter(o => o.status === "Completed").length,
    totalUnits: orders.filter(o => o.status === "Active").reduce((s, o) => s + Number(o.quantity || 0), 0),
    totalValue: orders.reduce((s, o) => s + Number(o.totalValueNPR || 0), 0)
  }), [orders]);

  return (
    <AppLayout>
      <PageHeader
        title="Production"
        description="Track the full garment pipeline — from order through dispatch."
        action={(activeTab === "orders" || activeTab === "pipeline") && canEdit && (
          <button className="primary-button" onClick={() => { setShowOrderForm(v => !v); setActiveTab("orders"); }}>
            {showOrderForm ? "Cancel" : "+ New Order"}
          </button>
        )}
      />

      {!canEdit && <p className="banner-warning">UK admin view-only mode enabled.</p>}

      {/* ── Tabs ── */}
      <div className="tab-row">
        <button className={cn("tab-button", activeTab === "pipeline" && "active")} onClick={() => setActiveTab("pipeline")}>
          Pipeline
        </button>
        <button className={cn("tab-button", activeTab === "orders" && "active")} onClick={() => setActiveTab("orders")}>
          Order Management
        </button>
        <button className={cn("tab-button", activeTab === "batches" && "active")} onClick={() => setActiveTab("batches")}>
          Batch Tracking
        </button>
      </div>

      {/* ══════════════════ PIPELINE KANBAN ══════════════════ */}
      {activeTab === "pipeline" && (
        <>
          {/* Mini stats strip */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { label: "Total Orders",      value: orderStats.total },
              { label: "Active",            value: orderStats.active },
              { label: "Completed",         value: orderStats.completed },
              { label: "Units in Pipeline", value: orderStats.totalUnits.toLocaleString() },
            ].map(s => (
              <div key={s.label} style={{
                background: "var(--card)", borderRadius: "var(--r-card)", border: "1.5px solid var(--line)",
                padding: "10px 18px", display: "flex", flexDirection: "column", gap: 2,
                boxShadow: "var(--shadow-1)", minWidth: 120
              }}>
                <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, letterSpacing: ".03em" }}>{s.label.toUpperCase()}</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", lineHeight: 1.2 }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Board */}
          <div className="kprod-board">
            {PIPELINE_COLS.map(col => {
              const colOrders = orders.filter(
                o => col.stages.includes(o.stage) &&
                     o.status !== "Cancelled" &&
                     o.status !== "Completed"
              );
              const isOver = dragOver === col.id;

              return (
                <div
                  key={col.id}
                  className="kprod-col"
                  style={isOver ? { outline: `2px dashed ${col.accent}`, outlineOffset: -2 } : undefined}
                  onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOver(null);
                    const orderId = e.dataTransfer.getData("orderId");
                    if (orderId) moveOrderToCol(orderId, col);
                  }}
                >
                  <div className="kprod-col-h">
                    <span className="kprod-col-l" style={{ color: col.accent }}>{col.label}</span>
                    <span className="kprod-col-c">{colOrders.length}</span>
                  </div>
                  <div className="kprod-col-body">
                    {colOrders.length === 0 ? (
                      <div className="kprod-empty">No orders here</div>
                    ) : colOrders.map(order => (
                      <PipelineCard
                        key={order.id}
                        order={order}
                        col={col}
                        expanded={expandedOrder === order.id}
                        onToggle={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                        onAdvance={() => advanceStage(order)}
                        onReverse={() => reverseStage(order)}
                        canEdit={canEdit}
                        profile={profile}
                        onUpdate={loadData}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ══════════════════ ORDER MANAGEMENT ══════════════════ */}
      {activeTab === "orders" && (
        <>
          {/* Summary */}
          <section className="stats-grid">
            <article className="stat-card">
              <p className="stat-title">Total Orders</p>
              <h3 className="stat-value">{orderStats.total}</h3>
              <p className="stat-note">{orderStats.active} active</p>
            </article>
            <article className="stat-card">
              <p className="stat-title">Completed</p>
              <h3 className="stat-value">{orderStats.completed}</h3>
            </article>
            <article className="stat-card">
              <p className="stat-title">Units in Pipeline</p>
              <h3 className="stat-value">{orderStats.totalUnits.toLocaleString()}</h3>
              <p className="stat-note">active orders only</p>
            </article>
            <article className="stat-card">
              <p className="stat-title">Total Order Value</p>
              <h3 className="stat-value">NPR {orderStats.totalValue.toLocaleString()}</h3>
            </article>
          </section>

          {/* New Order Form */}
          {showOrderForm && canEdit && (
            <section className="panel">
              <h3>New Production Order</h3>

              {latestInvoice && !dismissedSuggestion && (
                <div className="kprod-suggestion-banner" style={{
                  background: "var(--ok-container)",
                  border: "1.5px solid var(--ok-container-border)",
                  borderRadius: "var(--r-card, 10px)",
                  padding: "14px 18px",
                  marginBottom: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  boxShadow: "var(--shadow-1)",
                  animation: "fadeIn 0.2s ease-out"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ok-text)", fontWeight: 600, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      <span style={{ fontSize: "1.1rem" }}>💡</span> Smart Recommendation
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      style={{ padding: "3px 8px", fontSize: 11, border: "none", background: "transparent", color: "var(--ok-text)", opacity: 0.8, cursor: "pointer" }}
                      onClick={() => setDismissedSuggestion(true)}
                    >
                      Dismiss
                    </button>
                  </div>
                  
                  <div style={{ fontSize: 13, color: "var(--ok-text)", lineHeight: 1.4 }}>
                    Auto-fill order details using the latest invoice <strong>{latestInvoice.invoiceNumber}</strong> for <strong>{latestInvoice.clientName}</strong>:
                  </div>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                    gap: 12,
                    fontSize: 12,
                    color: "var(--ok-text)",
                    background: "rgba(255, 255, 255, 0.4)",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--ok-container-border)"
                  }}>
                    <div><strong>Customer:</strong> {latestInvoice.clientName}</div>
                    {latestInvoice.items?.[0] && (
                      <>
                        <div style={{ gridColumn: "span 2" }}><strong>Item:</strong> {latestInvoice.items[0].description}</div>
                        <div><strong>Qty:</strong> {latestInvoice.items[0].qty?.toLocaleString()} pcs</div>
                        <div><strong>Rate:</strong> NPR {latestInvoice.items[0].rate?.toLocaleString()}</div>
                      </>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                    <button
                      type="button"
                      className="primary-button"
                      style={{
                        fontSize: 11.5,
                        padding: "6px 14px",
                        background: "var(--primary-deep, #1b5e20)",
                        borderColor: "var(--primary-deep, #1b5e20)",
                        color: "#fff",
                        cursor: "pointer"
                      }}
                      onClick={applyInvoiceSuggestion}
                    >
                      ✓ Apply Recommendation
                    </button>
                  </div>
                </div>
              )}

              <form className="grid-form" onSubmit={submitOrder}>
                <label>
                  Order Date
                  <input type="date" value={orderForm.date} required
                    onChange={e => setOrderForm(f => ({ ...f, date: e.target.value }))} />
                </label>
                <label>
                  Delivery Date
                  <input type="date" value={orderForm.deliveryDate}
                    onChange={e => setOrderForm(f => ({ ...f, deliveryDate: e.target.value }))} />
                </label>
                <label style={{ gridColumn: "span 2" }}>
                  Customer Name
                  <input type="text" value={orderForm.customerName} required placeholder="e.g. RetailCorp UK"
                    onChange={e => setOrderForm(f => ({ ...f, customerName: e.target.value }))} />
                </label>
                <label>
                  Style / Item Name
                  <input type="text" value={orderForm.styleName} required placeholder="e.g. Men's Hoodie"
                    onChange={e => setOrderForm(f => ({ ...f, styleName: e.target.value }))} />
                </label>
                <label>
                  Fabric Type
                  <select value={orderForm.fabricType} onChange={e => setOrderForm(f => ({ ...f, fabricType: e.target.value }))}>
                    {FABRIC_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label>
                  Colorway
                  <input type="text" value={orderForm.colorway} placeholder="e.g. Black, Navy, Olive"
                    onChange={e => setOrderForm(f => ({ ...f, colorway: e.target.value }))} />
                </label>
                <label>
                  Quantity (pcs)
                  <input type="number" min="1" value={orderForm.quantity} required placeholder="0"
                    onChange={e => setOrderForm(f => ({ ...f, quantity: e.target.value }))} />
                </label>
                <label>
                  Price per Piece (NPR)
                  <input type="number" min="0" value={orderForm.pricePerPcNPR} placeholder="0"
                    onChange={e => setOrderForm(f => ({ ...f, pricePerPcNPR: e.target.value }))} />
                </label>
                <label>
                  Invoice / Challan Ref
                  <input type="text" value={orderForm.invoiceRef} placeholder="INV001 / CH-001"
                    onChange={e => setOrderForm(f => ({ ...f, invoiceRef: e.target.value }))} />
                </label>
                <label>
                  Assigned To
                  <select value={orderForm.assignedTo} onChange={e => setOrderForm(f => ({ ...f, assignedTo: e.target.value }))}>
                    <option value="">— Select —</option>
                    {employees.map(em => <option key={em.id} value={em.name}>{em.name}</option>)}
                  </select>
                </label>
                <label>
                  Initial Stage
                  <select value={orderForm.stage} onChange={e => setOrderForm(f => ({ ...f, stage: e.target.value }))}>
                    {STAGES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label style={{ gridColumn: "span 2" }}>
                  Notes
                  <input type="text" value={orderForm.notes} placeholder="Optional notes"
                    onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))} />
                </label>

                {orderForm.quantity && orderForm.pricePerPcNPR && (
                  <div style={{ gridColumn: "span 2", background: "var(--bg-surface-soft)", borderRadius: 10, padding: "10px 16px", border: "1.5px solid var(--line)", fontSize: "0.9rem" }}>
                    Order Value: <strong>NPR {(Number(orderForm.quantity) * Number(orderForm.pricePerPcNPR)).toLocaleString()}</strong>
                    <span style={{ color: "var(--text-muted)", marginLeft: 12 }}>({orderForm.quantity} pcs × NPR {Number(orderForm.pricePerPcNPR).toLocaleString()})</span>
                  </div>
                )}

                {/* ── Issue Invoice toggle ── */}
                <div style={{ gridColumn: "span 2" }}>
                  <button
                    type="button"
                    onClick={() => setIssueInvoice(v => !v)}
                    className={cn("kprod-inv-toggle", issueInvoice && "kprod-inv-toggle--on")}
                  >
                    <span className="kprod-inv-toggle-box">
                      {issueInvoice && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </span>
                    <span>Issue invoice with this order</span>
                    <span className="kprod-inv-toggle-tag">optional</span>
                  </button>
                </div>

                {issueInvoice && (
                  <div className="kprod-inv-section">
                    <div className="kprod-inv-section-hd">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      Invoice Details
                    </div>
                    <div className="kprod-inv-grid">
                      <label className="kprod-inv-label">
                        Client Address
                        <input className="kprod-inv-input" type="text" placeholder="Street, City, Country"
                          value={invFields.clientAddress}
                          onChange={e => setInvFields(f => ({ ...f, clientAddress: e.target.value }))} />
                      </label>
                      <label className="kprod-inv-label">
                        Client Phone
                        <input className="kprod-inv-input" type="text" placeholder="+977 ..."
                          value={invFields.clientPhone}
                          onChange={e => setInvFields(f => ({ ...f, clientPhone: e.target.value }))} />
                      </label>
                      <label className="kprod-inv-label">
                        PAN / Tax No.
                        <input className="kprod-inv-input" type="text" placeholder="VAT / PAN number"
                          value={invFields.clientPAN}
                          onChange={e => setInvFields(f => ({ ...f, clientPAN: e.target.value }))} />
                      </label>
                      <label className="kprod-inv-label">
                        Due Date
                        <input className="kprod-inv-input" type="date"
                          value={invFields.dueDate}
                          onChange={e => setInvFields(f => ({ ...f, dueDate: e.target.value }))} />
                      </label>
                      <label className="kprod-inv-label">
                        Payment Terms
                        <select className="kprod-inv-input"
                          value={invFields.paymentTerms}
                          onChange={e => setInvFields(f => ({ ...f, paymentTerms: e.target.value }))}>
                          <option>Net 15</option>
                          <option>Net 30</option>
                          <option>Net 45</option>
                          <option>Net 60</option>
                          <option>Due on Receipt</option>
                        </select>
                      </label>
                      <label className="kprod-inv-label" style={{ justifyContent: "flex-end" }}>
                        <div className="kprod-inv-vat-row">
                          <span>Apply VAT (13%)</span>
                          <button type="button"
                            className={cn("kadm-toggle", invFields.applyVAT && "kadm-toggle--on")}
                            onClick={() => setInvFields(f => ({ ...f, applyVAT: !f.applyVAT }))}>
                            <span className="kadm-toggle-knob" />
                          </button>
                        </div>
                        {orderForm.quantity && orderForm.pricePerPcNPR && (
                          <div className="kprod-inv-preview">
                            {(() => {
                              const sub = Number(orderForm.quantity) * Number(orderForm.pricePerPcNPR);
                              const vat = invFields.applyVAT ? sub * VAT_RATE : 0;
                              const tot = sub + vat;
                              return <>
                                <span>Subtotal: <strong>NPR {sub.toLocaleString()}</strong></span>
                                {invFields.applyVAT && <span>VAT 13%: <strong>NPR {Math.round(vat).toLocaleString()}</strong></span>}
                                <span className="kprod-inv-total">Total: <strong>NPR {Math.round(tot).toLocaleString()}</strong></span>
                              </>;
                            })()}
                          </div>
                        )}
                      </label>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <button type="submit" className="primary-button" disabled={savingOrder}>
                    {savingOrder ? "Creating…" : issueInvoice ? "Create Order + Invoice" : "Create Order"}
                  </button>
                  <button type="button" className="ghost-button" onClick={() => { setShowOrderForm(false); setIssueInvoice(false); setInvFields(emptyInvFields); }}>Cancel</button>
                </div>
              </form>
            </section>
          )}

          {/* Order list */}
          {orders.length === 0 ? (
            <section className="panel">
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No orders yet. Create your first production order above.</p>
            </section>
          ) : (() => {
            const activeOrders = orders.filter(o => o.status === "Active" || o.status === "On Hold");
            const doneOrders   = orders.filter(o => o.status === "Completed" || o.status === "Cancelled");

            const renderOrderCard = (order) => {
                const curIdx = STAGES.indexOf(order.stage);
                const pct = Math.round((curIdx / (STAGES.length - 1)) * 100);
                const isExpanded = expandedOrder === order.id;

                return (
                  <section key={order.id} className="panel" style={{ padding: "20px 24px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--accent)", fontSize: "1rem" }}>{order.orderId}</span>
                          {orderStatusBadge(order.status)}
                          {order.invoiceNumber
                            ? <span className="kprod-inv-badge">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                {order.invoiceNumber}
                              </span>
                            : canEdit && <button className="kprod-inv-issue-btn" type="button"
                                onClick={() => { setInvoiceModal(order); setInvModalFields({ ...emptyInvFields, dueDate: dueIn30(order.date) }); }}>
                                + Invoice
                              </button>
                          }
                        </div>
                        <p style={{ fontWeight: 600, fontSize: "1rem", marginTop: 4 }}>{order.customerName}</p>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 2 }}>
                          {order.quantity?.toLocaleString()} pcs · {order.styleName} · {order.fabricType}
                          {order.colorway ? ` · ${order.colorway}` : ""}
                          {order.totalValueNPR ? ` · NPR ${Number(order.totalValueNPR).toLocaleString()}` : ""}
                        </p>
                        {(order.deliveryDate || order.assignedTo || order.invoiceRef) && (
                          <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: 3 }}>
                            {order.deliveryDate ? `Due: ${order.deliveryDate}` : ""}
                            {order.assignedTo ? `  ·  ${order.assignedTo}` : ""}
                            {order.invoiceRef ? `  ·  Ref: ${order.invoiceRef}` : ""}
                          </p>
                        )}
                      </div>
                      <button className="ghost-button" style={{ fontSize: "0.82rem", padding: "4px 10px" }}
                        onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                        {isExpanded ? "Collapse" : "Details"}
                      </button>
                    </div>

                    {/* Stage progress */}
                    <div style={{ marginTop: 20, marginBottom: 8 }}>
                      <div style={{ height: 6, background: "#dde8dd", borderRadius: 99, overflow: "hidden", marginBottom: 16 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", borderRadius: 99, transition: "width 0.3s" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
                        {STAGES.map((stage, idx) => {
                          const done = idx < curIdx;
                          const current = idx === curIdx;
                          return (
                            <div key={stage} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                              <div style={{
                                width: 28, height: 28, borderRadius: "50%",
                                background: done ? "var(--accent)" : current ? "var(--accent-soft)" : "#dde8dd",
                                color: done || current ? "#fff" : "var(--text-muted)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontWeight: 700, fontSize: "0.75rem",
                                border: current ? "3px solid var(--accent)" : "3px solid transparent",
                                marginBottom: 6
                              }}>
                                {done ? "✓" : idx + 1}
                              </div>
                              <span style={{
                                fontSize: "0.72rem", textAlign: "center", lineHeight: 1.3,
                                color: done || current ? "var(--text-main)" : "var(--text-muted)",
                                fontWeight: current ? 700 : done ? 500 : 400,
                                maxWidth: 64
                              }}>
                                {stage}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {canEdit && (
                      <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        {order.status === "Active" && (
                          <>
                            <button className="ghost-button" style={{ fontSize: "0.82rem", padding: "5px 14px" }}
                              onClick={() => reverseStage(order)} disabled={curIdx === 0}>
                              ← Previous Stage
                            </button>
                            <button className="primary-button" style={{ fontSize: "0.82rem", padding: "5px 14px" }}
                              onClick={() => advanceStage(order)} disabled={curIdx === STAGES.length - 1}>
                              {curIdx === STAGES.length - 2 ? "Mark Delivered" : "Advance Stage →"}
                            </button>
                          </>
                        )}
                        {order.status === "Active" && (
                          <button className="ghost-button" style={{ fontSize: "0.82rem", padding: "5px 14px", color: "var(--warn)", borderColor: "rgba(230,81,0,0.35)" }}
                            onClick={() => updateOrderStatus(order, "On Hold")}>
                            Hold
                          </button>
                        )}
                        {order.status === "On Hold" && (
                          <button className="ghost-button" style={{ fontSize: "0.82rem", padding: "5px 14px", color: "var(--ok)", borderColor: "rgba(46,125,50,0.4)" }}
                            onClick={() => updateOrderStatus(order, "Active")}>
                            Resume
                          </button>
                        )}
                        <button className="ghost-button" style={{ fontSize: "0.82rem", padding: "5px 14px", color: "var(--danger)", borderColor: "rgba(220,38,38,0.4)" }}
                          onClick={() => deleteOrder(order)}>
                          Delete
                        </button>
                      </div>
                    )}

                    {isExpanded && (
                      <div style={{ marginTop: 16, borderTop: "1.5px solid var(--line)", paddingTop: 14 }}>
                        <p style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: 8 }}>STAGE HISTORY</p>
                        {(order.stageHistory || []).map((h, i) => (
                          <div key={i} style={{ display: "flex", gap: 12, fontSize: "0.83rem", padding: "3px 0", borderBottom: "1px solid var(--line)" }}>
                            <span style={{ color: "var(--text-muted)", minWidth: 90 }}>{h.date}</span>
                            <span style={{ fontWeight: 500 }}>{h.stage}</span>
                            <span style={{ color: "var(--text-muted)", marginLeft: "auto" }}>{h.by}</span>
                          </div>
                        ))}
                        {order.notes && (
                          <p style={{ marginTop: 10, fontSize: "0.85rem", color: "var(--text-muted)", padding: "8px 12px", background: "var(--bg-surface-soft)", borderRadius: 8 }}>
                            {order.notes}
                          </p>
                        )}
                        <OrderNotesSection
                          order={order}
                          canEdit={canEdit}
                          profile={profile}
                          onUpdate={loadData}
                        />
                      </div>
                    )}
                  </section>
                );
            };

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                {/* ── Active / On Hold orders ── */}
                {activeOrders.length === 0 ? (
                  <section className="panel" style={{ padding: "24px", textAlign: "center" }}>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                      No active orders in progress.
                    </p>
                  </section>
                ) : activeOrders.map(renderOrderCard)}

                {/* ── Completed / Cancelled section ── */}
                {doneOrders.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowCompleted(v => !v)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        background: "none", border: "none", cursor: "pointer",
                        padding: "6px 2px", marginBottom: 10, color: "var(--text-muted)",
                        fontSize: "0.82rem", fontWeight: 600
                      }}
                    >
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 18, height: 18, borderRadius: "50%",
                        background: "var(--bg-2)", color: "var(--ink-3)",
                        fontSize: 10, fontWeight: 700, transition: "transform .2s",
                        transform: showCompleted ? "rotate(90deg)" : "rotate(0deg)"
                      }}>▶</span>
                      Completed &amp; Cancelled
                      <span style={{
                        background: "var(--bg-2)", color: "var(--ink-3)",
                        borderRadius: 20, padding: "1px 8px", fontSize: "0.78rem", fontWeight: 700
                      }}>{doneOrders.length}</span>
                    </button>

                    {showCompleted && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, opacity: 0.8 }}>
                        {doneOrders.map(renderOrderCard)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}

      {/* ══════════════════ BATCH TRACKING ══════════════════ */}
      {activeTab === "batches" && (
        <>
          <section className="panel">
            <h3>Add Batch ({nextBatchId})</h3>
            <form className="grid-form" onSubmit={submitBatch}>
              <label>
                Date
                <input type="date" value={batchForm.date} required disabled={!canEdit}
                  onChange={e => setBatchForm(f => ({ ...f, date: e.target.value }))} />
              </label>
              <label>
                Cut
                <input type="number" value={batchForm.cut} required disabled={!canEdit}
                  onChange={e => setBatchForm(f => ({ ...f, cut: e.target.value }))} />
              </label>
              <label>
                Stitched
                <input type="number" value={batchForm.stitched} required disabled={!canEdit}
                  onChange={e => setBatchForm(f => ({ ...f, stitched: e.target.value }))} />
              </label>
              <label>
                Passed
                <input type="number" value={batchForm.passed} required disabled={!canEdit}
                  onChange={e => setBatchForm(f => ({ ...f, passed: e.target.value }))} />
              </label>
              <label>
                Rejected
                <input type="number" value={batchForm.rejected} required disabled={!canEdit}
                  onChange={e => setBatchForm(f => ({ ...f, rejected: e.target.value }))} />
              </label>
              <label className="full-width">
                Note
                <input type="text" value={batchForm.note} disabled={!canEdit}
                  onChange={e => setBatchForm(f => ({ ...f, note: e.target.value }))} />
              </label>
              <button type="submit" className="primary-button" disabled={!canEdit || saving}>
                {saving ? "Saving…" : "Add Batch"}
              </button>
            </form>
          </section>

          <section className="panel">
            <h3>All Batches</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Batch</th><th>Date</th><th>Cut</th><th>Stitched</th>
                    <th>Passed</th><th>Rejected</th><th>Pass Rate</th><th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(batch => {
                    const inspected = Number(batch.passed || 0) + Number(batch.rejected || 0);
                    const passRate = inspected ? ((Number(batch.passed || 0) / inspected) * 100).toFixed(1) : "0.0";
                    return (
                      <tr key={batch.id}>
                        <td style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--accent)" }}>{batch.batchId}</td>
                        <td>{batch.date}</td>
                        <td>{batch.cut}</td>
                        <td>{batch.stitched}</td>
                        <td>{batch.passed}</td>
                        <td>{batch.rejected}</td>
                        <td>
                          <span style={{ color: Number(passRate) >= 90 ? "var(--ok)" : Number(passRate) >= 75 ? "var(--warn)" : "var(--danger)", fontWeight: 600 }}>
                            {passRate}%
                          </span>
                        </td>
                        <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{batch.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ── Invoice modal for existing orders ── */}
      {invoiceModal && (
        <InvoiceModal
          order={invoiceModal}
          fields={invModalFields}
          setFields={setInvModalFields}
          onClose={() => setInvoiceModal(null)}
          onSubmit={issueInvoiceForOrder}
          saving={savingInvoice}
        />
      )}
    </AppLayout>
  );
}

export default Production;

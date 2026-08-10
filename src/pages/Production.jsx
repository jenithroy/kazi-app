import { useEffect, useMemo, useState } from "react";
import {
  addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, deleteDoc, where, orderBy, limit
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import { db, storage } from "../firebase";
import { roundAmount } from "../utils/format";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { useRef } from "react";
import { todayDate } from "../utils/date";
import { cn, Pill, Progress, Icons } from "../components/ui";
import { GBP_RATE } from "../constants";
import ProductionCalendar from "../components/ProductionCalendar";
import { notifyStageChange } from "../utils/telegram";
import { useCurrency } from "../context/CurrencyContext";
// eslint-disable-next-line no-unused-vars
import { ORDER_STAGES, ORDER_STATUSES, ATTENDANCE_STATUSES } from "../constants/enums";
import { awardPoints, resolveUidByName } from "../utils/rewardService";
import { useReward } from "../context/RewardContext";

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
  const firstLine = (desc || "").split("\n")[0] || "";
  let styleName = firstLine;
  let fabricType = "Terry Cotton";
  let colorway = "";

  const colorMatch = firstLine.match(/\(([^)]+)\)$/);
  let baseDesc = firstLine;
  if (colorMatch) {
    colorway = colorMatch[1];
    baseDesc = firstLine.replace(/\s*\([^)]+\)$/, "");
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
  notes: "",
  sampleId: "",
  sampleName: "",
  fabricGramsUsed: "",
  fabricCostPerPcNPR: ""
};

function findFabricByNameProd(fabrics, name) {
  const n = (name || "").trim().toLowerCase();
  if (!n) return null;
  return fabrics.find(f => (f.name || "").trim().toLowerCase() === n) || null;
}

// Fabric is priced by weight (₨/1000g) in the Fabrics library — this derives the
// per-piece fabric cost from grams used, same math as the Inventory Item Cost tab,
// so it doesn't have to be hand-calculated and retyped here too.
function computeFabricCostProd(fabrics, name, gramsUsed) {
  const match = findFabricByNameProd(fabrics, name);
  const grams = Number(gramsUsed);
  if (match && match.pricePerKg && grams > 0) {
    return Math.round((Number(match.pricePerKg) / 1000) * grams * 100) / 100;
  }
  return null;
}

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
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{qty.toLocaleString()} pcs × NPR {roundAmount(rate).toLocaleString()}</span>
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
            <span>Subtotal</span><span>NPR {roundAmount(sub).toLocaleString()}</span>
          </div>
          {fields.applyVAT && (
            <div className="kprod-inv-totals-row">
              <span>VAT 13%</span><span>NPR {roundAmount(vat).toLocaleString()}</span>
            </div>
          )}
          <div className="kprod-inv-totals-row kprod-inv-totals-total">
            <span>Total</span><span>NPR {roundAmount(tot).toLocaleString()}</span>
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
function PipelineCard({ order, col, expanded, onToggle, onAdvance, onReverse, onEdit, canEdit, profile, onUpdate }) {
  const pri = orderPriority(order);
  const pct = stageProgress(order.stage);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchMsg, setDispatchMsg] = useState(null); // { type: "success"|"error", text }
  const [latestAssignment, setLatestAssignment] = useState(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);

  // Load latest assignment when card is expanded
  useEffect(() => {
    if (!expanded) return;
    setAssignmentLoading(true);
    getDocs(
      query(
        collection(db, "order_assignments"),
        where("orderId", "==", order.id),
        orderBy("assignedAt", "desc"),
        limit(1)
      )
    ).then(snap => {
      setLatestAssignment(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
    }).catch(() => {}).finally(() => setAssignmentLoading(false));
  }, [expanded, order.id]);

  async function handleDispatch(e) {
    e.stopPropagation();
    setDispatching(true);
    setDispatchMsg(null);
    try {
      const dispatchStage = httpsCallable(getFunctions(), "dispatchStage");
      const result = await dispatchStage({ orderId: order.id, stage: order.stage });
      const workerName = result?.data?.workerName || "worker";
      setDispatchMsg({ type: "success", text: `Dispatched to ${workerName}` });
    } catch (err) {
      setDispatchMsg({ type: "error", text: err.message || "Dispatch failed" });
    } finally {
      setDispatching(false);
    }
  }

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

          {/* Current assignment */}
          {assignmentLoading ? (
            <div style={{ color: "var(--ink-4)", marginTop: 4 }}>Loading assignment…</div>
          ) : latestAssignment ? (
            <div style={{ color: "var(--ink-4)", marginTop: 4 }}>
              Assigned: <strong style={{ color: "var(--ink-2)" }}>{latestAssignment.workerName}</strong>
              {" "}({latestAssignment.status})
            </div>
          ) : null}

          {canEdit && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {order.status === "Active" && (
                <>
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
                </>
              )}
              <button
                className="ghost-button"
                style={{ fontSize: 11, padding: "3px 8px" }}
                onClick={e => { e.stopPropagation(); onEdit(); }}
              >Edit</button>
              {order.status === "Active" && (
                <button
                  className="ghost-button"
                  style={{ fontSize: 11, padding: "3px 8px", borderColor: "var(--mint-deep)", color: "var(--mint-deep)" }}
                  onClick={handleDispatch}
                  disabled={dispatching}
                >{dispatching ? "Dispatching…" : "Dispatch"}</button>
              )}
            </div>
          )}

          {/* Dispatch feedback message */}
          {dispatchMsg && (
            <div style={{
              marginTop: 6,
              fontSize: 11,
              padding: "4px 8px",
              borderRadius: 6,
              background: dispatchMsg.type === "success" ? "var(--mint-soft)" : "var(--terra-soft)",
              color: dispatchMsg.type === "success" ? "var(--mint-deep)" : "var(--terra)",
            }}>
              {dispatchMsg.text}
            </div>
          )}

          {order.stageHistory?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Stage History</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {order.stageHistory.slice(-5).map((h, i) => (
                  <div key={i} style={{ fontSize: 11, color: "var(--ink-3)", display: "flex", gap: 8 }}>
                    <span style={{ fontFamily: "var(--mono)", color: "var(--ink-5)" }}>{h.date}</span>
                    <span>{h.stage}</span>
                    <span style={{ color: "var(--ink-4)" }}>by {h.by}</span>
                  </div>
                ))}
              </div>
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
  const { fmt: fmtC } = useCurrency();
  const { showPointsToast } = useReward();

  const [activeTab, setActiveTab] = useState("pipeline");
  const [currentMonthOnly, setCurrentMonthOnly] = useState(false);

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; // "YYYY-MM"
  const currentMonthName = now.toLocaleDateString("en-US", { month: "long", year: "numeric" }); // "June 2026"
  const inCurrentMonth = (date) => (date || "").slice(0, 7) === currentMonthKey;

  /* ── Batch state ── */
  const [batches, setBatches] = useState([]);
  const [batchForm, setBatchForm] = useState(initialBatchForm);
  const [saving, setSaving] = useState(false);

  /* ── Fix 3: page-level error state (auto-clears after 5s) ── */
  const [pageError, setPageError] = useState("");
  function showError(msg) {
    setPageError(msg);
    setTimeout(() => setPageError(""), 5000);
  }

  /* ── Order state ── */
  const [orders, setOrders] = useState([]);
  const [orderForm, setOrderForm] = useState(emptyOrderForm);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [orderCosts, setOrderCosts] = useState({});
  const [labourRatePerUnit, setLabourRatePerUnit] = useState(null);
  const [fabrics, setFabrics] = useState([]);
  const [samples, setSamples] = useState([]);

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
    const [batchSnap, orderSnap, empSnap, invSnap, costsSnap, payrollSnap, fabricSnap, sampleSnap] = await Promise.all([
      getDocs(collection(db, "production")),
      getDocs(collection(db, "orders")),
      getDocs(collection(db, "employees")),
      getDocs(collection(db, "invoices")),
      getDocs(collection(db, "order_costs")),
      getDocs(collection(db, "finance_payroll")),
      getDocs(collection(db, "fabrics")),
      getDocs(collection(db, "samples")),
    ]);
    setFabrics(fabricSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setSamples(sampleSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    const batchRows = batchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    batchRows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    setBatches(batchRows);

    const orderRows = orderSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    orderRows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    setOrders(orderRows);

    setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.status !== "Inactive"));
    setInvoices(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    const costs = {};
    costsSnap.docs.forEach(d => { costs[d.id] = d.data(); });
    setOrderCosts(costs);

    // Auto labour rate: last month payroll ÷ units produced
    const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthName = MONTHS[lastMonth.getMonth()];
    const lastMonthYear = lastMonth.getFullYear();
    const lastMonthKey = lastMonth.toISOString().slice(0, 7);

    const payrollData = payrollSnap.docs.map(d => d.data());
    const empData = empSnap.docs.map(d => d.data());
    const prodWorkers = new Set(empData.filter(e => e.isProductionWorker).map(e => (e.name || "").toLowerCase()));
    const lastMonthPayroll = payrollData
      .filter(p => p.month === lastMonthName && Number(p.year) === lastMonthYear)
      .filter(p => prodWorkers.size === 0 || prodWorkers.has((p.staffName || "").toLowerCase()))
      .reduce((s, p) => s + Number(p.netNPR || 0), 0);

    const lastMonthUnits = batchRows
      .filter(b => (b.date || "").slice(0, 7) === lastMonthKey)
      .reduce((s, b) => s + Number(b.passed || 0), 0);

    if (lastMonthPayroll > 0 && lastMonthUnits > 0) {
      setLabourRatePerUnit(lastMonthPayroll / lastMonthUnits);
    }
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
      const passed  = Number(batchForm.passed  || 0);
      const rejected = Number(batchForm.rejected || 0);
      const batchRef = await addDoc(collection(db, "production"), {
        batchId: nextBatchId,
        date: batchForm.date,
        cut: Number(batchForm.cut || 0),
        stitched: Number(batchForm.stitched || 0),
        passed,
        rejected,
        note: batchForm.note,
        loggedBy: profile?.name || "Unknown",
        createdAt: serverTimestamp()
      });
      setBatchForm(initialBatchForm);
      await loadData();
      // Award QC points to the logger
      const total = passed + rejected;
      if (total > 0 && profile?.name) {
        const uid = await resolveUidByName(profile.name);
        if (uid) {
          const passRate = passed / total;
          let qcEventType = null;
          if (passRate === 1) qcEventType = "qc_batch_perfect";
          else if (passRate >= 0.9) qcEventType = "qc_batch_good";
          if (qcEventType) {
            const pts = await awardPoints({
              uid,
              displayName: profile.name,
              eventType: qcEventType,
              sourceId: batchRef.id,
              reason: `Batch ${nextBatchId}`,
            });
            if (pts) showPointsToast(pts, `Batch ${nextBatchId} QC`);
          }
        }
      }
    } catch (err) {
      console.error("Failed to save batch:", err);
      showError("Failed to save batch. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  /* ── Order helpers ── */
  function nextOrderId() {
    const nums = orders.map(o => parseInt((o.orderId || "ORD000").replace("ORD-", ""), 10)).filter(n => !isNaN(n));
    return `ORD-${String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, "0")}`;
  }

  // Fabric type + grams used share the same auto-calc: typing/changing either one
  // recomputes fabricCostPerPcNPR from the material's stored ₨/kg price, but the
  // cost field stays directly editable afterwards if she wants to override it.
  function updateOrderFabric(field, value) {
    setOrderForm(f => {
      const next = { ...f, [field]: value };
      const computed = computeFabricCostProd(
        fabrics,
        field === "fabricType" ? value : next.fabricType,
        field === "fabricGramsUsed" ? value : next.fabricGramsUsed
      );
      if (computed !== null) next.fabricCostPerPcNPR = computed;
      return next;
    });
  }

  function selectOrderSample(sampleId) {
    const sample = samples.find(s => s.id === sampleId);
    setOrderForm(f => ({
      ...f,
      sampleId: sampleId || "",
      sampleName: sample?.name || "",
      fabricType: f.fabricType || sample?.fabric_used || f.fabricType,
      colorway: f.colorway || sample?.color || f.colorway,
    }));
  }

  async function submitOrder(e) {
    e.preventDefault();
    setSavingOrder(true);
    const total = Number(orderForm.quantity || 0) * Number(orderForm.pricePerPcNPR || 0);
    const materialCostTotalNPR = Number(orderForm.quantity || 0) * Number(orderForm.fabricCostPerPcNPR || 0);
    try {

    // A fabric type typed here that isn't in the priced Fabrics library yet gets
    // saved there (no price set) so it's available — and priceable — next time,
    // instead of being a one-off value disconnected from Inventory.
    const typedFabricName = (orderForm.fabricType || "").trim();
    if (typedFabricName && !findFabricByNameProd(fabrics, typedFabricName)) {
      await addDoc(collection(db, "fabrics"), {
        name: typedFabricName, pricePerKg: null, composition: "", gsm: null,
        weight: "", status: "In Stock", swatchImageUrl: "", createdAt: serverTimestamp()
      });
    }

    if (editingOrder) {
      // Edit existing order
      await updateDoc(doc(db, "orders", editingOrder.id), {
        customerName:  orderForm.customerName,
        styleName:     orderForm.styleName,
        fabricType:    orderForm.fabricType,
        colorway:      orderForm.colorway,
        quantity:      Number(orderForm.quantity || 0),
        pricePerPcNPR: Number(orderForm.pricePerPcNPR || 0),
        totalValueNPR: total,
        deliveryDate:  orderForm.deliveryDate,
        assignedTo:    orderForm.assignedTo,
        invoiceRef:    orderForm.invoiceRef,
        notes:         orderForm.notes,
        sampleId:            orderForm.sampleId,
        sampleName:          orderForm.sampleName,
        fabricGramsUsed:     Number(orderForm.fabricGramsUsed || 0),
        fabricCostPerPcNPR:  Number(orderForm.fabricCostPerPcNPR || 0),
        materialCostTotalNPR,
      });
      setEditingOrder(null);
    } else {
      // Create new order
      const orderId = nextOrderId();
      const invNum  = issueInvoice ? nextInvoiceNumber() : null;
      const orderDoc = {
        ...orderForm,
        orderId,
        quantity:      Number(orderForm.quantity || 0),
        pricePerPcNPR: Number(orderForm.pricePerPcNPR || 0),
        totalValueNPR: total,
        fabricGramsUsed:    Number(orderForm.fabricGramsUsed || 0),
        fabricCostPerPcNPR: Number(orderForm.fabricCostPerPcNPR || 0),
        materialCostTotalNPR,
        stageHistory:  [{ stage: "Order Received", date: todayDate(), by: profile?.name || "Unknown" }],
        createdBy:     profile?.name || "Unknown",
        createdAt:     serverTimestamp(),
        ...(invNum ? { invoiceNumber: invNum } : {}),
      };
      const orderRef = await addDoc(collection(db, "orders"), orderDoc);
      if (issueInvoice && invNum) {
        const invDoc = buildInvoiceDoc(
          { ...orderForm, quantity: orderDoc.quantity },
          invFields, invNum, orderRef.id
        );
        await addDoc(collection(db, "invoices"), invDoc);
      }
    }

      setOrderForm(emptyOrderForm);
      setIssueInvoice(false);
      setInvFields(emptyInvFields);
      setShowOrderForm(false);
      await loadData();
    } catch (err) {
      console.error("Failed to save order:", err);
      showError("Failed to save order. Please check your connection and try again.");
    } finally {
      setSavingOrder(false);
    }
  }

  function handleOpenEditOrder(order) {
    setEditingOrder(order);
    setOrderForm({
      date:          order.date || todayDate(),
      deliveryDate:  order.deliveryDate || "",
      customerName:  order.customerName || "",
      styleName:     order.styleName || "",
      fabricType:    order.fabricType || "Terry Cotton",
      colorway:      order.colorway || "",
      quantity:      order.quantity || "",
      pricePerPcNPR: order.pricePerPcNPR || "",
      invoiceRef:    order.invoiceRef || "",
      assignedTo:    order.assignedTo || "",
      stage:         order.stage || "Order Received",
      status:        order.status || "Active",
      notes:         order.notes || "",
      sampleId:            order.sampleId || "",
      sampleName:          order.sampleName || "",
      fabricGramsUsed:     order.fabricGramsUsed || "",
      fabricCostPerPcNPR:  order.fabricCostPerPcNPR || "",
    });
    setShowOrderForm(true);
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
    notifyStageChange({ orderId: order.orderId, customerName: order.customerName, stage: newStage, quantity: order.quantity, updatedBy: profile?.name || "Unknown" });
    // Auto-dispatch the new stage to the next available worker
    try {
      const dispatchFn = httpsCallable(getFunctions(), "dispatchStage");
      await dispatchFn({ orderId: order.id, stage: newStage });
    } catch (err) {
      console.warn("Dispatch skipped:", err.message);
    }
    await loadData();
    if (profile?.name) {
      const uid = await resolveUidByName(profile.name);
      if (uid) {
        if (newStage === "Delivered") {
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const isOnTime = order.deliveryDate && today <= new Date(order.deliveryDate);
          const bonusPoints = isOnTime ? 20 : 0;
          const pts = await awardPoints({
            uid,
            displayName: profile.name,
            eventType: "order_delivered",
            sourceId: order.id + "_delivered",
            reason: order.orderId || order.id,
            bonusPoints,
          });
          if (pts) showPointsToast(pts, `Order ${order.orderId || order.id} delivered`);
        } else {
          const pts = await awardPoints({
            uid,
            displayName: profile.name,
            eventType: "order_stage_advanced",
            sourceId: order.id + "_" + newStage,
            reason: `${order.orderId || order.id} → ${newStage}`,
          });
          if (pts) showPointsToast(pts, `${order.orderId || order.id} → ${newStage}`);
        }
      }
    }
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
    notifyStageChange({ orderId: order.orderId, customerName: order.customerName, stage: targetStage, quantity: order.quantity, updatedBy: profile?.name || "Unknown" });
    await loadData();
  }

  const filteredOrdersForList = useMemo(() => {
    return orders.filter(o => !currentMonthOnly || inCurrentMonth(o.date) || inCurrentMonth(o.deliveryDate));
  }, [orders, currentMonthOnly, currentMonthKey]);

  const filteredBatches = useMemo(() => {
    return batches.filter(b => !currentMonthOnly || inCurrentMonth(b.date));
  }, [batches, currentMonthOnly, currentMonthKey]);

  /* ── Stats ── */
  const orderStats = useMemo(() => ({
    total: filteredOrdersForList.length,
    active: filteredOrdersForList.filter(o => o.status === "Active").length,
    completed: filteredOrdersForList.filter(o => o.status === "Completed").length,
    totalUnits: filteredOrdersForList.filter(o => o.status === "Active").reduce((s, o) => s + Number(o.quantity || 0), 0),
    totalValue: filteredOrdersForList.reduce((s, o) => s + Number(o.totalValueNPR || 0), 0)
  }), [filteredOrdersForList]);

  return (
    <>
      <PageHeader
        title="Production"
        description="Track the full garment pipeline — from order through dispatch."
        action={(activeTab === "orders" || activeTab === "pipeline") && canEdit && (
          <button className="primary-button" onClick={() => setShowOrderForm(true)}>
            + New Order
          </button>
        )}
      />

      {!canEdit && <p className="banner-warning">UK admin view-only mode enabled.</p>}
      {/* Fix 3: error banner */}
      {pageError && (
        <p className="banner-warning" style={{ background: "var(--terra-soft, #fdf2ef)", color: "var(--terra)", borderColor: "rgba(196,101,74,.3)" }}>
          {pageError}
        </p>
      )}

      {/* ── Tabs & Monthly View Toggle ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div className="tab-row" style={{ marginBottom: 0 }}>
          <button
            className={cn("tab-button", activeTab === "pipeline" && "active")}
            onClick={() => setActiveTab("pipeline")}
          >
            Pipeline
          </button>
          <button
            className={cn("tab-button", activeTab === "orders" && "active")}
            onClick={() => setActiveTab("orders")}
          >
            Order Management
          </button>
          <button
            className={cn("tab-button", activeTab === "calendar" && "active")}
            onClick={() => setActiveTab("calendar")}
          >
            Timeline &amp; Calendar
          </button>
          <button
            className={cn("tab-button", activeTab === "batches" && "active")}
            onClick={() => setActiveTab("batches")}
          >
            Batch Tracking
          </button>
        </div>

        {activeTab !== "calendar" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)" }}>
              Current Month Only ({currentMonthName})
            </span>
            <button
              type="button"
              className={cn("kadm-toggle", currentMonthOnly && "kadm-toggle--on")}
              onClick={() => setCurrentMonthOnly(v => !v)}
              style={{ display: "flex", alignItems: "center" }}
            >
              <span className="kadm-toggle-knob" />
            </button>
          </div>
        )}
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
              <div key={s.label} className="kprod-ministat" style={{
                background: "var(--card)", borderRadius: "var(--r-card)", border: "1.5px solid var(--line)",
                padding: "10px 18px", display: "flex", flexDirection: "column", gap: 2,
                boxShadow: "var(--shadow-1)"
              }}>
                <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, letterSpacing: ".03em" }}>{s.label.toUpperCase()}</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", lineHeight: 1.2 }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Board */}
          <div className="kprod-board">
            {PIPELINE_COLS.map(col => {
              const colOrders = filteredOrdersForList.filter(
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
                        onEdit={() => handleOpenEditOrder(order)}
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
              <h3 className="stat-value">NPR {roundAmount(orderStats.totalValue).toLocaleString()}</h3>
            </article>
          </section>



          {/* Order list */}
          {orders.length === 0 ? (
            <section className="panel">
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No orders yet. Create your first production order above.</p>
            </section>
          ) : (() => {
            const activeOrders = filteredOrdersForList.filter(o => o.status === "Active" || o.status === "On Hold");
            const doneOrders   = filteredOrdersForList.filter(o => o.status === "Completed" || o.status === "Cancelled");

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
                          {order.totalValueNPR ? ` · NPR ${roundAmount(order.totalValueNPR).toLocaleString()}` : ""}
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
                        <button className="ghost-button" style={{ fontSize: "0.82rem", padding: "5px 14px" }}
                          onClick={() => handleOpenEditOrder(order)}>
                          Edit
                        </button>
                        <button className="ghost-button" style={{ fontSize: "0.82rem", padding: "5px 14px", color: "var(--danger)", borderColor: "rgba(220,38,38,0.4)" }}
                          onClick={() => deleteOrder(order)}>
                          Delete
                        </button>
                      </div>
                    )}

                    {isExpanded && (() => {
                      const costKey = order.orderId || order.id;
                      const costs = orderCosts[costKey] || {};
                      const revenue = Number(order.totalValueNPR || 0);
                      const mat = Number(costs.material || 0);
                      const hasManualLabour = costs.labour != null && costs.labour !== "";
                      const autoLab = (!hasManualLabour && labourRatePerUnit)
                        ? Math.round(labourRatePerUnit * Number(order.quantity || 0))
                        : 0;
                      const lab = hasManualLabour ? Number(costs.labour) : autoLab;
                      const labIsAuto = !hasManualLabour && autoLab > 0;
                      const ovh = Number(costs.overhead || 0);
                      const shp = Number(costs.shipping || 0);
                      const totalCost = mat + lab + ovh + shp;
                      const profit = revenue - totalCost;
                      const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : null;
                      const hasCosts = totalCost > 0;
                      return (
                        <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--line)" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>P&L</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 10 }}>
                            {[
                              { label: "Revenue", value: fmtC(revenue), color: "var(--mint-deep)" },
                              { label: "Materials", value: hasCosts ? fmtC(mat) : "—", color: "var(--ink-3)" },
                              { label: labIsAuto ? "Labour ⚡" : "Labour", value: (hasCosts || labIsAuto) ? fmtC(lab) : "—", color: "var(--ink-3)" },
                              { label: "Overhead", value: hasCosts ? fmtC(ovh) : "—", color: "var(--ink-3)" },
                              { label: "Shipping", value: hasCosts ? fmtC(shp) : "—", color: "var(--ink-3)" },
                              { label: "Profit", value: (hasCosts || labIsAuto) ? fmtC(profit) : "—", color: (hasCosts || labIsAuto) ? (profit >= 0 ? "var(--mint-deep)" : "var(--terra)") : "var(--ink-4)" },
                              ...(margin !== null && (hasCosts || labIsAuto) ? [{ label: "Margin", value: `${margin}%`, color: Number(margin) >= 20 ? "var(--mint-deep)" : Number(margin) >= 0 ? "var(--amber)" : "var(--terra)" }] : []),
                            ].map(({ label, value, color }) => (
                              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</span>
                                <span style={{ fontSize: 14, fontWeight: 600, color, fontFamily: "var(--mono)" }}>{value}</span>
                              </div>
                            ))}
                          </div>
                          {labIsAuto && (
                            <p style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 6 }}>
                              ⚡ Labour auto-calculated from last month's payroll ÷ units
                            </p>
                          )}
                          {!hasCosts && !labIsAuto && (
                            <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 8 }}>
                              No payroll data yet — enter costs in Finance → Order P&L
                            </p>
                          )}
                        </div>
                      );
                    })()}

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

      {/* ══════════════════ TIMELINE & CALENDAR ══════════════════ */}
      {activeTab === "calendar" && (
        <ProductionCalendar 
          orders={orders} 
          canEdit={canEdit} 
          onUpdate={loadData} 
        />
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
                  {filteredBatches.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>
                        No batches found for this month.
                      </td>
                    </tr>
                  ) : filteredBatches.map(batch => {
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
      {/* ── Order Form Modal (New / Edit) ── */}
      {showOrderForm && canEdit && (
        <div className="kbrf-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowOrderForm(false); setEditingOrder(null); setIssueInvoice(false); setInvFields(emptyInvFields); setOrderForm(emptyOrderForm); } }}>
          <div className="kbrf-modal" style={{ maxWidth: 640, maxHeight: "90vh", overflowY: "auto" }}>
            <div className="kbrf-modal-hd">
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {editingOrder ? `Edit Order — ${editingOrder.orderId}` : "New Production Order"}
                </div>
              </div>
              <button className="kbrf-modal-close" onClick={() => { setShowOrderForm(false); setEditingOrder(null); setIssueInvoice(false); setInvFields(emptyInvFields); setOrderForm(emptyOrderForm); }}>✕</button>
            </div>

            {latestInvoice && !dismissedSuggestion && !editingOrder && (
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
                      <div><strong>Rate:</strong> NPR {roundAmount(latestInvoice.items[0].rate || 0).toLocaleString()}</div>
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
                <input type="text" list="prod-fabric-names" value={orderForm.fabricType} placeholder="e.g. Terry Cotton"
                  onChange={e => updateOrderFabric("fabricType", e.target.value)} />
                <datalist id="prod-fabric-names">
                  {fabrics.map(f => <option key={f.id} value={f.name} />)}
                  {FABRIC_TYPES.map(t => <option key={t} value={t} />)}
                </datalist>
              </label>
              <label>
                Colorway
                <input type="text" value={orderForm.colorway} placeholder="e.g. Black, Navy, Olive"
                  onChange={e => setOrderForm(f => ({ ...f, colorway: e.target.value }))} />
              </label>
              <label>
                Sample
                <select value={orderForm.sampleId} onChange={e => selectOrderSample(e.target.value)}>
                  <option value="">— None —</option>
                  {samples.map(s => <option key={s.id} value={s.id}>{s.name}{s.product_type ? ` (${s.product_type})` : ""}</option>)}
                </select>
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
                Fabric Used (grams / pc)
                <input type="number" min="0" value={orderForm.fabricGramsUsed} placeholder="e.g. 900"
                  onChange={e => updateOrderFabric("fabricGramsUsed", e.target.value)} />
              </label>
              <label>
                Fabric Cost / pc (NPR)
                <input type="number" min="0" value={orderForm.fabricCostPerPcNPR} placeholder="auto from material price"
                  onChange={e => setOrderForm(f => ({ ...f, fabricCostPerPcNPR: e.target.value }))} />
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
                  Order Value: <strong>NPR {roundAmount(Number(orderForm.quantity) * Number(orderForm.pricePerPcNPR)).toLocaleString()}</strong>
                  <span style={{ color: "var(--text-muted)", marginLeft: 12 }}>({orderForm.quantity} pcs × NPR {roundAmount(orderForm.pricePerPcNPR).toLocaleString()})</span>
                  {orderForm.fabricCostPerPcNPR && (
                    <div style={{ marginTop: 4 }}>
                      Material Cost: <strong>NPR {roundAmount(Number(orderForm.quantity) * Number(orderForm.fabricCostPerPcNPR)).toLocaleString()}</strong>
                      <span style={{ color: "var(--text-muted)", marginLeft: 12 }}>({orderForm.quantity} pcs × NPR {roundAmount(orderForm.fabricCostPerPcNPR).toLocaleString()}/pc)</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Issue Invoice toggle ── */}
              {!editingOrder && (
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
              )}

              {issueInvoice && !editingOrder && (
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
                              <span>Subtotal: <strong>NPR {roundAmount(sub).toLocaleString()}</strong></span>
                              {invFields.applyVAT && <span>VAT 13%: <strong>NPR {roundAmount(vat).toLocaleString()}</strong></span>}
                              <span className="kprod-inv-total">Total: <strong>NPR {roundAmount(tot).toLocaleString()}</strong></span>
                            </>;
                          })()}
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button type="submit" className="primary-button" disabled={savingOrder}>
                  {savingOrder ? "Saving…" : editingOrder ? "Save Changes" : issueInvoice ? "Create Order + Invoice" : "Create Order"}
                </button>
                <button type="button" className="ghost-button" onClick={() => { setShowOrderForm(false); setEditingOrder(null); setIssueInvoice(false); setInvFields(emptyInvFields); setOrderForm(emptyOrderForm); }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default Production;

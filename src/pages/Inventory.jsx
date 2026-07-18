import { useEffect, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc, setDoc
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import useFirestore from "../hooks/useFirestore";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit, sectionVisible } from "../utils/permissions";
import { db, storage } from "../firebase";
import { cn, Pill, Icons, Card, Btn, fmt } from "../components/ui";

/* ── Image compression & upload helpers ───────────────── */
function compressFabricImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        const MAX_WIDTH = 1200;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                type: "image/jpeg",
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else {
              reject(new Error("Image compression failed to generate blob."));
            }
          },
          "image/jpeg",
          0.8
        );
      };
      img.onerror = (err) => reject(err);
      img.src = event.target.result;
    };
    reader.onerror = (err) => reject(err);
  });
}

async function uploadFabricSwatch(fabricId, file) {
  const timestamp = Date.now();
  const path = `fabrics/swatches/${fabricId}_${timestamp}.jpg`;
  const storageRef = ref(storage, path);
  
  const metadata = {
    cacheControl: "public, max-age=31536000, immutable",
    contentType: "image/jpeg"
  };

  const snapshot = await uploadBytes(storageRef, file, metadata);
  const downloadUrl = await getDownloadURL(snapshot.ref);
  return downloadUrl;
}

async function uploadPatternTechPack(patternId, file) {
  const timestamp = Date.now();
  const path = `patterns/techpacks/${patternId}_${timestamp}.jpg`;
  const storageRef = ref(storage, path);
  
  const metadata = {
    cacheControl: "public, max-age=31536000, immutable",
    contentType: "image/jpeg"
  };

  const snapshot = await uploadBytes(storageRef, file, metadata);
  const downloadUrl = await getDownloadURL(snapshot.ref);
  return downloadUrl;
}

/* ── Stock Constants ───────────────────────────────────── */
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
  const kaziRows = rows.filter(r => r.itemId && r.itemId.toLowerCase().includes("kazi"));
  if (kaziRows.length > 0) {
    const nums = kaziRows.map(r => parseInt(r.itemId.replace(/\D/g, ""), 10)).filter(n => !isNaN(n));
    const nextNum = nums.length ? Math.max(...nums) + 1 : 1001;
    return `#kazi${nextNum}`;
  }
  const nums = rows.map(r => parseInt((r.itemId || "ITEM000").replace(/\D/g, ""), 10)).filter(n => !isNaN(n));
  return `IT${String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, "0")}`;
}

/* ── Library Constants ─────────────────────────────────── */
const PROCESS_CATEGORIES = ["printing", "embellishment", "construction", "finishing", "other"];
const COMMON_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

const emptyFabric   = { name: "", composition: "", gsm: "", weight: "", available_colors: "", supplier: "", price_per_meter: "", notes: "" };
const emptyProcess  = { name: "", category: "", description: "", cost_per_unit: "", min_quantity: "", lead_time_days: "", notes: "" };
const emptyPattern  = { name: "", product_type: "", sizes_available: [], tech_pack_url: "", notes: "" };

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

/* ── Cost spreadsheet cell input ────────────────────────── */
function CostCell({ value, onChange, disabled }) {
  const [localVal, setLocalVal] = useState(value ?? "");

  useEffect(() => {
    setLocalVal(value ?? "");
  }, [value]);

  return (
    <input
      type="number"
      value={localVal === 0 && localVal !== "0" ? "" : localVal}
      disabled={disabled}
      onChange={e => setLocalVal(e.target.value)}
      onBlur={() => {
        const num = localVal === "" ? 0 : Number(localVal);
        if (num !== Number(value)) {
          onChange(num);
        }
      }}
      onKeyDown={e => {
        if (e.key === "Enter") {
          e.target.blur();
        }
      }}
      style={{
        width: "80px",
        padding: "4px 6px",
        fontSize: "12.5px",
        fontFamily: "var(--mono)",
        textAlign: "right",
        border: "1px solid var(--line-strong)",
        borderRadius: "4px",
        background: disabled ? "var(--bg-2)" : "#fff",
        color: "var(--ink-2)",
        outline: "none",
        transition: "border-color 0.15s, box-shadow 0.15s"
      }}
    />
  );
}

/* ── Text spreadsheet cell input ────────────────────────── */
function TextCell({ value, onChange, disabled, width = "110px", style = {} }) {
  const [localVal, setLocalVal] = useState(value ?? "");

  useEffect(() => {
    setLocalVal(value ?? "");
  }, [value]);

  return (
    <input
      type="text"
      value={localVal}
      disabled={disabled}
      onChange={e => setLocalVal(e.target.value)}
      onBlur={() => {
        if (localVal !== value) {
          onChange(localVal);
        }
      }}
      onKeyDown={e => {
        if (e.key === "Enter") {
          e.target.blur();
        }
      }}
      style={{
        width,
        padding: "4px 6px",
        fontSize: "12.5px",
        fontFamily: "var(--mono)",
        textAlign: "left",
        border: "1px solid var(--line-strong)",
        borderRadius: "4px",
        background: disabled ? "var(--bg-2)" : "#fff",
        color: "var(--ink-2)",
        outline: "none",
        transition: "border-color 0.15s, box-shadow 0.15s",
        ...style
      }}
    />
  );
}

/* ── Icons ─────────────────────────────────────────────── */
function TrashIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
    </svg>
  );
}

function SaveIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
      <path d="M17 21v-8H7v8M7 3v5h8"/>
    </svg>
  );
}

/* ── Library Modals & Cards ──────────────────────────── */
function LibraryModal({ tab, item, onClose, onSaved }) {
  const isEdit = !!item;
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const [form, setForm] = useState(() => {
    if (!item) {
      if (tab === "fabrics")   return { ...emptyFabric };
      if (tab === "processes") return { ...emptyProcess };
      return { ...emptyPattern };
    }
    return {
      ...item,
      available_colors: Array.isArray(item.available_colors) ? item.available_colors.join(", ") : (item.available_colors || ""),
      sizes_available: item.sizes_available || [],
    };
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(item?.tech_pack_url && (item.tech_pack_url.includes(".jpg") || item.tech_pack_url.includes("techpacks")) ? item.tech_pack_url : "");
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleSize = (s) => set("sizes_available", form.sizes_available.includes(s)
    ? form.sizes_available.filter(x => x !== s)
    : [...form.sizes_available, s]
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true); setError("");
    try {
      const payload = { ...form };
      if (tab === "fabrics") {
        payload.gsm             = form.gsm ? Number(form.gsm) : null;
        payload.price_per_meter = form.price_per_meter ? Number(form.price_per_meter) : null;
      }
      if (tab === "processes") {
        payload.cost_per_unit  = form.cost_per_unit  ? Number(form.cost_per_unit)  : null;
        payload.min_quantity   = form.min_quantity   ? Number(form.min_quantity)   : null;
        payload.lead_time_days = form.lead_time_days ? Number(form.lead_time_days) : null;
      }

      let docId = item?.id;
      if (isEdit) {
        if (tab === "patterns" && imageFile) {
          const compressed = await compressFabricImage(imageFile);
          payload.tech_pack_url = await uploadPatternTechPack(docId, compressed);
        }
        await updateDoc(doc(db, tab, docId), { ...payload, updatedAt: serverTimestamp() });
        onSaved({ id: docId, ...payload });
      } else {
        const ref = await addDoc(collection(db, tab), { ...payload, createdAt: serverTimestamp() });
        docId = ref.id;
        if (tab === "patterns" && imageFile) {
          const compressed = await compressFabricImage(imageFile);
          const uploadedUrl = await uploadPatternTechPack(docId, compressed);
          await updateDoc(doc(db, tab, docId), { tech_pack_url: uploadedUrl });
          payload.tech_pack_url = uploadedUrl;
        }
        onSaved({ id: docId, ...payload });
      }
    } catch (err) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="kbrf-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="kbrf-modal" style={{ maxWidth: 520 }}>
        <div className="kbrf-modal-hd">
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {isEdit ? "Edit" : "Add"} {tab === "fabrics" ? "Fabric" : tab === "processes" ? "Process" : "Pattern"}
          </div>
          <button className="kbrf-modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="kfin-label">Name *</label>
            <input className="kfin-input" value={form.name ?? ""} onChange={e => set("name", e.target.value)} placeholder={tab === "fabrics" ? "e.g. 180 GSM Cotton Jersey" : tab === "processes" ? "e.g. DTG Printing" : "e.g. Oversized Tee"} />
          </div>

          {tab === "fabrics" && <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="kfin-label">Composition</label>
                <input className="kfin-input" value={form.composition ?? ""} onChange={e => set("composition", e.target.value)} placeholder="100% Cotton" />
              </div>
              <div>
                <label className="kfin-label">Weight (GSM)</label>
                <input className="kfin-input" type="number" value={form.gsm ?? ""} onChange={e => set("gsm", e.target.value)} placeholder="180" />
              </div>
            </div>
            <div>
              <label className="kfin-label">Available Colors (comma-separated)</label>
              <input className="kfin-input" value={form.available_colors ?? ""} onChange={e => set("available_colors", e.target.value)} placeholder="White, Black, Navy" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="kfin-label">Supplier</label>
                <input className="kfin-input" value={form.supplier ?? ""} onChange={e => set("supplier", e.target.value)} />
              </div>
              <div>
                <label className="kfin-label">Price/metre (NPR)</label>
                <input className="kfin-input" type="number" value={form.price_per_meter ?? ""} onChange={e => set("price_per_meter", e.target.value)} placeholder="350" />
              </div>
            </div>
          </>}

          {tab === "processes" && <>
            <div>
              <label className="kfin-label">Category</label>
              <select className="kfin-input" value={form.category ?? ""} onChange={e => set("category", e.target.value)}>
                <option value="">Select category</option>
                {PROCESS_CATEGORIES.map(c => <option key={c} value={c} style={{ textTransform: "capitalize" }}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="kfin-label">Description</label>
              <textarea className="kfin-input" rows={2} value={form.description ?? ""} onChange={e => set("description", e.target.value)} style={{ resize: "vertical" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label className="kfin-label">Cost/unit (NPR)</label>
                <input className="kfin-input" type="number" value={form.cost_per_unit ?? ""} onChange={e => set("cost_per_unit", e.target.value)} />
              </div>
              <div>
                <label className="kfin-label">Min qty</label>
                <input className="kfin-input" type="number" value={form.min_quantity ?? ""} onChange={e => set("min_quantity", e.target.value)} />
              </div>
              <div>
                <label className="kfin-label">Lead time (days)</label>
                <input className="kfin-input" type="number" value={form.lead_time_days ?? ""} onChange={e => set("lead_time_days", e.target.value)} />
              </div>
            </div>
          </>}

          {tab === "patterns" && <>
            <div>
              <label className="kfin-label">Product Type</label>
              <input className="kfin-input" value={form.product_type ?? ""} onChange={e => set("product_type", e.target.value)} placeholder="T-Shirt, Hoodie…" />
            </div>
            <div>
              <label className="kfin-label">Sizes Available</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {COMMON_SIZES.map(s => (
                  <button key={s} type="button"
                    onClick={() => toggleSize(s)}
                    style={{
                      padding: "4px 10px", borderRadius: 6, fontSize: 12, border: "1.5px solid",
                      borderColor: form.sizes_available.includes(s) ? "var(--mint-deep)" : "var(--line)",
                      background: form.sizes_available.includes(s) ? "var(--mint-soft)" : "transparent",
                      color: form.sizes_available.includes(s) ? "var(--mint-deep)" : "var(--ink-3)",
                      cursor: "pointer",
                    }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="kfin-label">Tech Pack URL (or upload picture below)</label>
              <input className="kfin-input" value={form.tech_pack_url ?? ""} onChange={e => set("tech_pack_url", e.target.value)} placeholder="https://…" />
            </div>
            <div>
              <label className="kfin-label">Tech Pack Picture</label>
              <div
                className={cn("kazi-dropzone", dragActive && "kazi-dropzone--active")}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById("pattern-file-input").click()}
                style={{
                  border: "2px dashed var(--line)",
                  borderRadius: 8,
                  padding: "16px",
                  textAlign: "center",
                  background: "var(--bg)",
                  cursor: "pointer",
                  transition: "border-color .15s",
                  marginTop: 6
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--ink-4)", marginBottom: 4 }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                </svg>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>
                  Drag tech pack picture here or click to browse
                </p>
                <p style={{ margin: "2px 0 0 0", fontSize: 10, color: "var(--ink-4)" }}>
                  PNG, JPG, JPEG (automatic compression)
                </p>
                <input
                  type="file"
                  id="pattern-file-input"
                  style={{ display: "none" }}
                  accept="image/*"
                  onChange={handleFileChange}
                />
              </div>
              {imagePreview && (
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                  <img src={imagePreview} alt="Preview" style={{ width: 50, height: 50, borderRadius: 6, objectFit: "cover", border: "1px solid var(--line)" }} />
                  <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Selected Tech Pack Picture</span>
                </div>
              )}
            </div>
          </>}

          <div>
            <label className="kfin-label">Notes</label>
            <textarea className="kfin-input" rows={2} value={form.notes ?? ""} onChange={e => set("notes", e.target.value)} style={{ resize: "vertical" }} />
          </div>

          {error && <p style={{ color: "var(--terra)", fontSize: 13 }}>{error}</p>}

          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button type="submit" className="primary-button" disabled={saving} style={{ flex: 1 }}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Add"}
            </button>
            <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FabricCard({ item, onClick }) {
  const initials = item.name
    ? item.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  
  let statusClass = "kazi-status-dot--instock";
  if (item.status === "Low Stock") statusClass = "kazi-status-dot--lowstock";
  if (item.status === "Out of Stock") statusClass = "kazi-status-dot--outofstock";

  return (
    <div className="kazi-fabric-card fade-in" onClick={onClick}>
      <div className="kazi-fabric-frame">
        {item.swatchImageUrl ? (
          <img src={item.swatchImageUrl} alt={item.name} className="kazi-fabric-img" loading="lazy" />
        ) : (
          <div className="kazi-fabric-placeholder">
            <span className="kazi-fabric-placeholder-initials">{initials}</span>
            <span className="kazi-fabric-placeholder-gsm">{item.gsm ? `${item.gsm} GSM` : "— GSM"}</span>
          </div>
        )}
      </div>
      <div className="kazi-fabric-body">
        <h4 className="kazi-fabric-name">{item.name}</h4>
        <p className="kazi-fabric-comp">{item.composition || "No composition specified"}</p>
        <div className="kazi-fabric-meta" style={{ flexWrap: "wrap", gap: 6 }}>
          <Pill tone={item.gsm ? "mint" : "neutral"}>
            {item.gsm ? `${item.gsm} GSM` : "— GSM"}
          </Pill>
          {item.weight && (
            <Pill tone="blue">
              {item.weight}
            </Pill>
          )}
          <span className="kazi-status-dot-wrap">
            <span className={cn("kazi-status-dot", statusClass)} />
            {item.status || "In Stock"}
          </span>
        </div>
      </div>
    </div>
  );
}

function FabricDrawer({ item, onClose, onSaved, onDelete, canEdit }) {
  const [name, setName] = useState(item.name || "");
  const [gsm, setGsm] = useState(item.gsm !== null && item.gsm !== undefined ? String(item.gsm) : "");
  const [weight, setWeight] = useState(item.weight || "");
  const [composition, setComposition] = useState(item.composition || "");
  const [status, setStatus] = useState(item.status || "In Stock");
  const [swatchImageUrl, setSwatchImageUrl] = useState(item.swatchImageUrl || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const initials = item.name
    ? item.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  async function handleFile(file) {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const compressed = await compressFabricImage(file);
      const url = await uploadFabricSwatch(item.id, compressed);
      setSwatchImageUrl(url);
    } catch (err) {
      setError("Failed to upload image: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Fabric name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const parsedGsm = gsm === "" ? null : Number(gsm);
      const payload = {
        name,
        gsm: parsedGsm,
        weight,
        composition,
        status,
        swatchImageUrl,
        updatedAt: serverTimestamp()
      };
      await updateDoc(doc(db, "fabrics", item.id), payload);
      onSaved({ id: item.id, ...payload });
    } catch (err) {
      setError("Failed to update fabric: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteClick() {
    if (!window.confirm(`Are you sure you want to delete "${item.name}"?`)) return;
    setDeleting(true);
    setError("");
    try {
      await deleteDoc(doc(db, "fabrics", item.id));
      onDelete(item.id);
    } catch (err) {
      setError("Failed to delete fabric: " + err.message);
      setDeleting(false);
    }
  }

  return (
    <div className="kazi-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="kazi-sheet">
        <div className="kazi-sheet-hd">
          <h3 className="kazi-sheet-title">Fabric Inspection</h3>
          <button className="kazi-sheet-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="kazi-sheet-content">
          <div className="kazi-sheet-macro-frame">
            {swatchImageUrl ? (
              <img src={swatchImageUrl} alt={name} className="kazi-sheet-macro-img" />
            ) : (
              <div className="kazi-sheet-macro-placeholder">
                <span>{initials}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSave} className="kazi-sheet-form">
            {error && <p style={{ color: "var(--terra)", fontSize: 13, margin: 0 }}>{error}</p>}

            <div>
              <label className="kfin-label">Fabric Name *</label>
              <input
                className="kfin-input"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={!canEdit || saving || deleting}
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label className="kfin-label">Weight (GSM)</label>
                <input
                  className="kfin-input"
                  type="number"
                  value={gsm}
                  onChange={e => setGsm(e.target.value)}
                  placeholder="e.g. 240 (optional)"
                  disabled={!canEdit || saving || deleting}
                />
              </div>
              <div>
                <label className="kfin-label">Fabric Weight</label>
                <input
                  className="kfin-input"
                  type="text"
                  value={weight}
                  onChange={e => setWeight(e.target.value)}
                  placeholder="e.g. 1.2 kg / roll"
                  disabled={!canEdit || saving || deleting}
                />
              </div>
              <div>
                <label className="kfin-label">Status</label>
                <select
                  className="kfin-input"
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  disabled={!canEdit || saving || deleting}
                >
                  <option value="In Stock">In Stock</option>
                  <option value="Low Stock">Low Stock</option>
                  <option value="Out of Stock">Out of Stock</option>
                </select>
              </div>
            </div>

            <div>
              <label className="kfin-label">Composition</label>
              <input
                className="kfin-input"
                value={composition}
                onChange={e => setComposition(e.target.value)}
                placeholder="e.g. 100% Cotton, Woolen"
                disabled={!canEdit || saving || deleting}
              />
            </div>

            {canEdit && (
              <div>
                <label className="kfin-label">Update Swatch Photo</label>
                <div
                  className={cn("kazi-dropzone", dragActive && "kazi-dropzone--active")}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById("drawer-file-input").click()}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="kazi-dropzone-icon">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                  </svg>
                  <p className="kazi-dropzone-text">
                    {uploading ? "Uploading Swatch..." : "Drag swatch photo here or click to browse"}
                  </p>
                  <p className="kazi-dropzone-hint">PNG, JPG, JPEG (automatic compression)</p>
                  <input
                    type="file"
                    id="drawer-file-input"
                    style={{ display: "none" }}
                    accept="image/*"
                    onChange={e => handleFile(e.target.files[0])}
                  />
                </div>
              </div>
            )}

            {canEdit && (
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button type="submit" className="primary-button" style={{ flex: 1 }} disabled={saving || deleting || uploading}>
                  {saving ? (
                    <>
                      <span className="kazi-spinner" style={{ marginRight: 6 }} />
                      Saving...
                    </>
                  ) : "Save Changes"}
                </button>
                <button type="button" className="ghost-button" style={{ color: "var(--terra)" }} onClick={handleDeleteClick} disabled={saving || deleting || uploading}>
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

function AddFabricModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [gsm, setGsm] = useState("");
  const [weight, setWeight] = useState("");
  const [composition, setComposition] = useState("");
  const [status, setStatus] = useState("In Stock");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Fabric name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const parsedGsm = gsm === "" ? null : Number(gsm);
      
      const tempPayload = {
        name,
        gsm: parsedGsm,
        weight,
        composition,
        status,
        swatchImageUrl: "",
        createdAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, "fabrics"), tempPayload);
      const fabricId = docRef.id;

      let finalUrl = "";
      if (imageFile) {
        const compressed = await compressFabricImage(imageFile);
        finalUrl = await uploadFabricSwatch(fabricId, compressed);
        await updateDoc(doc(db, "fabrics", fabricId), {
          swatchImageUrl: finalUrl
        });
      }

      onSaved({ id: fabricId, ...tempPayload, swatchImageUrl: finalUrl });
    } catch (err) {
      setError("Failed to create fabric: " + err.message);
      setSaving(false);
    }
  }

  return (
    <div className="kbrf-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="kbrf-modal" style={{ maxWidth: 520 }}>
        <div className="kbrf-modal-hd">
          <div style={{ fontSize: 16, fontWeight: 700 }}>Add New Fabric</div>
          <button className="kbrf-modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {error && <p style={{ color: "var(--terra)", fontSize: 13, margin: 0 }}>{error}</p>}

          <div>
            <label className="kfin-label">Fabric Name *</label>
            <input
              className="kfin-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. SOS Cotton, 30s Sinker Nepali"
              required
              disabled={saving}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label className="kfin-label">Weight (GSM)</label>
              <input
                className="kfin-input"
                type="number"
                value={gsm}
                onChange={e => setGsm(e.target.value)}
                placeholder="e.g. 420"
                disabled={saving}
              />
            </div>
            <div>
              <label className="kfin-label">Fabric Weight</label>
              <input
                className="kfin-input"
                type="text"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                placeholder="e.g. 1.2 kg"
                disabled={saving}
              />
            </div>
            <div>
              <label className="kfin-label">Status</label>
              <select
                className="kfin-input"
                value={status}
                onChange={e => setStatus(e.target.value)}
                disabled={saving}
              >
                <option value="In Stock">In Stock</option>
                <option value="Low Stock">Low Stock</option>
                <option value="Out of Stock">Out of Stock</option>
              </select>
            </div>
          </div>

          <div>
            <label className="kfin-label">Composition</label>
            <input
              className="kfin-input"
              value={composition}
              onChange={e => setComposition(e.target.value)}
              placeholder="e.g. 100% Cotton"
              disabled={saving}
            />
          </div>

          <div>
            <label className="kfin-label">Fabric Swatch Photo</label>
            <div
              className={cn("kazi-dropzone", dragActive && "kazi-dropzone--active")}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById("modal-file-input").click()}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="kazi-dropzone-icon">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
              <p className="kazi-dropzone-text">Drag swatch photo here or click to browse</p>
              <p className="kazi-dropzone-hint">PNG, JPG, JPEG (automatic compression)</p>
              <input
                type="file"
                id="modal-file-input"
                style={{ display: "none" }}
                accept="image/*"
                onChange={handleFileChange}
              />
            </div>
            {imagePreview && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                <img src={imagePreview} alt="Preview" className="kazi-upload-preview" />
                <span style={{ fontSize: 12, color: "var(--ink-4)" }}>Selected Swatch Photo</span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, paddingTop: 10 }}>
            <button type="submit" className="primary-button" style={{ flex: 1 }} disabled={saving}>
              {saving ? (
                <>
                  <span className="kazi-spinner" style={{ marginRight: 6 }} />
                  Creating Fabric...
                </>
              ) : "Add Fabric"}
            </button>
            <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProcessCard({ item, canEdit, onEdit, onDelete }) {
  return (
    <div className="kazi-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
          {item.description && <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2 }}>{item.description}</div>}
        </div>
        {item.category && <Pill tone="amber" style={{ textTransform: "capitalize" }}>{item.category}</Pill>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, color: "var(--ink-4)" }}>
        {item.cost_per_unit  && <span>{fmt.npr(item.cost_per_unit)}/unit</span>}
        {item.min_quantity   && <span>Min: {item.min_quantity} pcs</span>}
        {item.lead_time_days && <span>Lead: {item.lead_time_days}d</span>}
      </div>
      {item.notes && <div style={{ fontSize: 12, color: "var(--ink-4)", borderTop: "1px solid var(--line)", paddingTop: 8 }}>{item.notes}</div>}
      {canEdit && (
        <div style={{ display: "flex", gap: 10 }}>
          <button className="ghost-button" style={{ fontSize: 12, padding: "3px 10px" }} onClick={onEdit}>Edit</button>
          <button className="ghost-button" style={{ fontSize: 12, padding: "3px 10px", color: "var(--terra)" }} onClick={onDelete}>Delete</button>
        </div>
      )}
    </div>
  );
}

function PatternCard({ item, canEdit, onEdit, onDelete }) {
  const sizes = Array.isArray(item.sizes_available) ? item.sizes_available : [];
  const isImageTechPack = item.tech_pack_url && (
    item.tech_pack_url.includes(".jpg") ||
    item.tech_pack_url.includes(".png") ||
    item.tech_pack_url.includes(".jpeg") ||
    item.tech_pack_url.includes("techpacks")
  );

  return (
    <div className="kazi-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      {isImageTechPack && (
        <div style={{ width: "100%", height: 120, borderRadius: 8, overflow: "hidden", background: "var(--bg-2)", border: "1px solid var(--line)", position: "relative" }}>
          <img src={item.tech_pack_url} alt="Tech Pack" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <a href={item.tech_pack_url} target="_blank" rel="noopener noreferrer" style={{ position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,0.9)", color: "var(--ink-1)", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 600, textDecoration: "none", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
            View Full ↗
          </a>
        </div>
      )}
      <div style={{ display: "flex", justifycontent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
          {item.product_type && <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2 }}>{item.product_type}</div>}
        </div>
        {item.tech_pack_url && !isImageTechPack && (
          <a href={item.tech_pack_url} target="_blank" rel="noopener noreferrer" className="ghost-button" style={{ fontSize: 12, padding: "3px 10px" }}>
            Tech Pack ↗
          </a>
        )}
      </div>
      {sizes.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {sizes.map(s => <Pill key={s} tone="neutral">{s}</Pill>)}
        </div>
      )}
      {item.notes && <div style={{ fontSize: 12, color: "var(--ink-4)", borderTop: "1px solid var(--line)", paddingTop: 8 }}>{item.notes}</div>}
      {canEdit && (
        <div style={{ display: "flex", gap: 10 }}>
          <button className="ghost-button" style={{ fontSize: 12, padding: "3px 10px" }} onClick={onEdit}>Edit</button>
          <button className="ghost-button" style={{ fontSize: 12, padding: "3px 10px", color: "var(--terra)" }} onClick={onDelete}>Delete</button>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ────────────────────────────────────── */
function Inventory() {
  const { profile } = useAuth();
  const canEditInventory = sectionCanEdit(profile, "inventory");
  const canEditLibrary = sectionCanEdit(profile, "library");
  const canEditUnitEconomics = canEditLibrary || canEditInventory || profile?.role === "nepal_staff" || profile?.appRole === "nepal_staff";

  const showInventory = sectionVisible(profile, "inventory");
  const showLibrary = sectionVisible(profile, "library");

  const { updateDoc: updateInventoryDoc } = useFirestore("inventory");

  // Dynamic Allowed Tabs Setup
  const allowedTabs = [];
  if (showLibrary || showInventory) {
    allowedTabs.push({ key: "unit_economics", label: "Items Cost" });
  }
  if (showInventory) {
    allowedTabs.push({ key: "stock", label: "Stock Levels" });
    allowedTabs.push({ key: "details", label: "Item Details" });
  }
  if (showLibrary) {
    allowedTabs.push({ key: "fabrics", label: "Materials & Fabrics" });
    allowedTabs.push({ key: "processes", label: "Processes" });
    allowedTabs.push({ key: "patterns", label: "Patterns" });
  }

  const [activeTab, setActiveTab] = useState(() => {
    return allowedTabs[0]?.key || "stock";
  });

  const [rows, setRows] = useState([]);
  const [fabrics, setFabrics] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [unitEconomics, setUnitEconomics] = useState({});
  const [draftEconomics, setDraftEconomics] = useState({});
  const [loading, setLoading] = useState(true);

  const [draft, setDraft] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [addingItem, setAddingItem] = useState(false);
  const [search, setSearch] = useState("");
  const [savingRow, setSavingRow] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deletingRow, setDeletingRow] = useState(null);

  // Library-specific UI states
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [libraryEditItem, setLibraryEditItem] = useState(null);

  // Fabrics-specific UI states
  const [fabricFilter, setFabricFilter] = useState("all");
  const [selectedFabric, setSelectedFabric] = useState(null);
  const [seedingCatalog, setSeedingCatalog] = useState(false);
  const [fabricModalOpen, setFabricModalOpen] = useState(false);

  async function seedDefaultFabrics() {
    setSeedingCatalog(true);
    try {
      const defaults = [
        { name: "Rib Fabric", gsm: 200, composition: "Woolen", status: "In Stock" },
        { name: "Collar T-shirt", gsm: 210, composition: "Cotton 100%", status: "In Stock" },
        { name: "Linen", gsm: null, composition: "Cotton 100%", status: "In Stock" },
        { name: "AP Cotton", gsm: 380, composition: "Cotton 100%", status: "In Stock" },
        { name: "24 Come Sinker", gsm: 160, composition: "Cotton 100%", status: "In Stock" },
        { name: "Stripe Linen", gsm: null, composition: "Cotton 100%", status: "In Stock" },
        { name: "Cotton Terry", gsm: 280, composition: "Cotton 100%", status: "In Stock" },
        { name: "SOS Cotton", gsm: 420, composition: "Cotton 100%", status: "In Stock" },
        { name: "30s Sinker Nepali", gsm: 160, composition: "Cotton 100%", status: "In Stock" },
        { name: "PC PK", gsm: 260, composition: "Cotton 100%", status: "In Stock" },
        { name: "Anti-Grunge Cotton", gsm: 420, composition: "Cotton 100%", status: "In Stock" },
        { name: "Sinker Cotton", gsm: 140, composition: "Cotton 100%", status: "In Stock" }
      ];

      const seededItems = [];
      for (const item of defaults) {
        const payload = {
          name: item.name,
          gsm: item.gsm,
          weight: "",
          composition: item.composition,
          status: item.status,
          swatchImageUrl: "",
          createdAt: serverTimestamp()
        };
        const ref = await addDoc(collection(db, "fabrics"), payload);
        seededItems.push({ id: ref.id, ...payload });
      }

      setFabrics(prev => [...prev, ...seededItems]);
    } catch (err) {
      console.error("Failed to seed fabrics:", err);
      alert("Seeding failed: " + err.message);
    } finally {
      setSeedingCatalog(false);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const promises = [];
      let inventoryIdx = -1;
      let fabricsIdx = -1;
      let processesIdx = -1;
      let patternsIdx = -1;
      let unitEconomicsIdx = -1;

      if (showInventory || showLibrary) {
        inventoryIdx = promises.length;
        promises.push(getDocs(collection(db, "inventory")));
        unitEconomicsIdx = promises.length;
        promises.push(getDocs(collection(db, "unit_economics")));
      }
      if (showLibrary) {
        fabricsIdx = promises.length;
        promises.push(getDocs(collection(db, "fabrics")));
        processesIdx = promises.length;
        promises.push(getDocs(collection(db, "processes")));
        patternsIdx = promises.length;
        promises.push(getDocs(collection(db, "patterns")));
      }

      const results = await Promise.allSettled(promises);

      if (inventoryIdx !== -1) {
        const res = results[inventoryIdx];
        if (res.status === "fulfilled") {
          const records = res.value.docs.map(d => ({ id: d.id, ...d.data() }));
          records.sort((a, b) => (a.item || "").localeCompare(b.item || ""));
          setRows(records);
        }
      }
      if (fabricsIdx !== -1) {
        const res = results[fabricsIdx];
        if (res.status === "fulfilled") {
          setFabrics(res.value.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      }
      if (processesIdx !== -1) {
        const res = results[processesIdx];
        if (res.status === "fulfilled") {
          setProcesses(res.value.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      }
      if (patternsIdx !== -1) {
        const res = results[patternsIdx];
        if (res.status === "fulfilled") {
          setPatterns(res.value.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      }
      if (unitEconomicsIdx !== -1) {
        const res = results[unitEconomicsIdx];
        if (res.status === "fulfilled") {
          const uMap = {};
          res.value.docs.forEach(d => {
            uMap[d.id] = d.data();
          });
          setUnitEconomics(uMap);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData().catch(console.error); }, [profile]);

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
    if (!canEditInventory) return;
    setSavingRow(row.id);
    const rowDraft = draft[row.id] || {};
    await updateInventoryDoc(row.id, {
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

  /* ── Unit Economics handlers ── */
  async function saveEconomicsRow(patternId) {
    if (!canEditUnitEconomics) return;
    setSavingRow(patternId);
    const draftData = draftEconomics[patternId] || {};
    const currentData = unitEconomics[patternId] || {};

    const payload = {
      fabric:       Number(draftData.fabric       ?? currentData.fabric       ?? 0),
      rib:          Number(draftData.rib          ?? currentData.rib          ?? 0),
      trims:        Number(draftData.trims        ?? currentData.trims        ?? 0),
      directLabour: Number(draftData.directLabour ?? currentData.directLabour ?? 0),
      others:       Number(draftData.others       ?? currentData.others       ?? 0),
      targetPrice:  Number(draftData.targetPrice  ?? currentData.targetPrice  ?? 0),
      updatedAt:    serverTimestamp(),
      updatedBy:    profile?.name || "Unknown"
    };

    try {
      await setDoc(doc(db, "unit_economics", patternId), payload, { merge: true });
      setUnitEconomics(prev => ({
        ...prev,
        [patternId]: payload
      }));

      const cogsNpr = payload.fabric + payload.rib + payload.trims + payload.directLabour + payload.others;
      const invUpdates = {
        unitCostNPR: cogsNpr,
        lastUpdated: new Date().toISOString().slice(0, 10),
        updatedBy: profile?.name || "Unknown"
      };
      if (draftData.itemId !== undefined) {
        invUpdates.itemId = draftData.itemId;
      }
      if (draftData.item !== undefined) {
        invUpdates.item = draftData.item;
      }
      await updateDoc(doc(db, "inventory", patternId), invUpdates);
      setRows(prev => prev.map(r => r.id === patternId ? { ...r, ...invUpdates } : r));

      setDraftEconomics(prev => {
        const copy = { ...prev };
        delete copy[patternId];
        return copy;
      });
    } catch (err) {
      console.error("Failed to save unit economics:", err);
      alert("Error saving: " + err.message);
    } finally {
      setSavingRow(null);
    }
  }

  function updateDraftEconomics(patternId, field, value) {
    setDraftEconomics(prev => ({
      ...prev,
      [patternId]: {
        ...(prev[patternId] || {}),
        [field]: value
      }
    }));
  }

  /* ── Library handlers ── */
  async function handleDeleteLibraryItem(item) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    await deleteDoc(doc(db, activeTab, item.id));
    if (activeTab === "fabrics")   setFabrics(fabrics.filter(x => x.id !== item.id));
    if (activeTab === "processes") setProcesses(processes.filter(x => x.id !== item.id));
    if (activeTab === "patterns")  setPatterns(patterns.filter(x => x.id !== item.id));
  }

  function handleSavedLibraryItem(saved) {
    if (activeTab === "fabrics") {
      if (libraryEditItem) {
        setFabrics(fabrics.map(x => x.id === saved.id ? saved : x));
      } else {
        setFabrics([...fabrics, saved]);
      }
    }
    if (activeTab === "processes") {
      if (libraryEditItem) {
        setProcesses(processes.map(x => x.id === saved.id ? saved : x));
      } else {
        setProcesses([...processes, saved]);
      }
    }
    if (activeTab === "patterns") {
      if (libraryEditItem) {
        setPatterns(patterns.map(x => x.id === saved.id ? saved : x));
      } else {
        setPatterns([...patterns, saved]);
      }
    }
    setLibraryModalOpen(false);
    setLibraryEditItem(null);
  }

  function getActiveLibraryItems() {
    if (activeTab === "fabrics")   return fabrics;
    if (activeTab === "processes") return processes;
    return patterns;
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

  const filteredFabrics = fabrics.filter(r => {
    const matchesSearch = !search ||
      r.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.composition?.toLowerCase().includes(search.toLowerCase()) ||
      r.supplier?.toLowerCase().includes(search.toLowerCase());
    
    if (!matchesSearch) return false;

    if (fabricFilter === "heavy") {
      return r.gsm !== null && r.gsm > 300;
    }
    if (fabricFilter === "light") {
      return r.gsm !== null && r.gsm < 200;
    }
    return true;
  });
  const filteredProcesses = processes.filter(r =>
    !search ||
    r.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.category?.toLowerCase().includes(search.toLowerCase()) ||
    r.description?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredPatterns = patterns.filter(r =>
    !search ||
    r.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.product_type?.toLowerCase().includes(search.toLowerCase())
  );

  /* ── Draft helpers ── */
  function draftStockIn(row)   { return draft[row.id]?.stockIn   ?? row.stockIn   ?? 0; }
  function draftStockUsed(row) { return draft[row.id]?.stockUsed ?? row.stockUsed ?? 0; }

  // Resolve dynamic title/desc
  let pageTitle = "Inventory & Library";
  let pageDesc = "Monitor stock levels, reorder alerts, fabrics, processes, and patterns.";
  if (showInventory && !showLibrary) {
    pageTitle = "Inventory & Stock";
    pageDesc = "Monitor stock levels, reorder alerts, and item details.";
  } else if (showLibrary && !showInventory) {
    pageTitle = "Production Library";
    pageDesc = "Reference repository for fabrics, processes, and patterns.";
  }

  const renderAction = () => {
    if (activeTab === "stock" || activeTab === "details") {
      if (!canEditInventory) return null;
      return (
        <button className="primary-button" onClick={() => setShowAddForm(v => !v)}>
          {showAddForm ? "Cancel" : "+ Add Item"}
        </button>
      );
    }
    if (activeTab === "fabrics") {
      if (!canEditLibrary) return null;
      return (
        <button className="primary-button" onClick={() => { setFabricModalOpen(true); }}>
          + Add Fabric
        </button>
      );
    }
    if (activeTab === "processes" || activeTab === "patterns") {
      if (!canEditLibrary) return null;
      const typeLabel = activeTab === "processes" ? "Process" : "Pattern";
      return (
        <button className="primary-button" onClick={() => { setLibraryEditItem(null); setLibraryModalOpen(true); }}>
          + Add {typeLabel}
        </button>
      );
    }
    return null;
  };

  const handleTabSelect = (e, tabKey) => {
    if (e.type === "touchstart") {
      e.preventDefault();
    }
    setActiveTab(tabKey);
    setShowAddForm(false);
  };

  return (
    <AppLayout>
      <PageHeader
        title={pageTitle}
        description={pageDesc}
        action={renderAction()}
      />

      {activeTab === "stock" && !canEditInventory && (
        <p className="banner-warning">UK admin view-only mode enabled.</p>
      )}

      {/* ── KPI Cards (Only visible if user has Inventory permission) ── */}
      {showInventory && (
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
      )}

      {/* ── Add Item Form (Stock) ── */}
      {showAddForm && canEditInventory && (
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
            {allowedTabs.map(t => (
              <button
                key={t.key}
                className={cn("kinv-tab", activeTab === t.key && "kinv-tab--on")}
                onClick={(e) => handleTabSelect(e, t.key)}
                onTouchStart={(e) => handleTabSelect(e, t.key)}
              >
                {t.label}
                {["fabrics", "processes", "patterns"].includes(t.key) && (
                  <span style={{ marginLeft: 6, fontSize: 11, background: "var(--bg-2)", padding: "1px 6px", borderRadius: 10, color: "var(--ink-4)" }}>
                    {t.key === "fabrics" ? fabrics.length : t.key === "processes" ? processes.length : patterns.length}
                  </span>
                )}
              </button>
            ))}
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
        {activeTab === "stock" && showInventory && (
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
                      <td>
                        <span className="kinv-id">{row.itemId}</span>
                      </td>
                      <td>
                        <span className="kinv-name">{row.item}</span>
                      </td>
                      <td>
                        <span className="kinv-cat">{row.category || "—"}</span>
                      </td>
                      <td>
                        <span className="kinv-unit">{row.unit}</span>
                      </td>
                      <td>
                        <span className="kinv-num">{Number(row.openingStock || 0).toLocaleString()}</span>
                      </td>
                      <td>
                        <Stepper
                          value={draftStockIn(row)}
                          onChange={val => setStockIn(row.id, val)}
                          disabled={!canEditInventory}
                        />
                      </td>
                      <td>
                        <Stepper
                          value={draftStockUsed(row)}
                          onChange={val => setStockUsed(row.id, val)}
                          disabled={!canEditInventory}
                        />
                      </td>
                      <td>
                        <span className={cn("kinv-closing", lowStock && "kinv-closing--low")}>
                          {closing.toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <span className="kinv-num">{minLevel}</span>
                      </td>
                      <td>
                        {lowStock
                          ? <Pill tone="terra">Reorder</Pill>
                          : <Pill tone="mint">OK</Pill>
                        }
                      </td>
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
                              disabled={!canEditInventory || savingRow === row.id}
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
                            {canEditInventory && (
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
        {activeTab === "details" && showInventory && (
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
        {/* ── Unit Economics costing spreadsheet grid ── */}
        {activeTab === "unit_economics" && (showLibrary || showInventory) && (
          <div className="kinv-table-wrap">
            <table className="kinv-table">
              <thead>
                <tr>
                  <th>S.NO</th>
                  <th>Code</th>
                  <th>Items</th>
                  <th style={{ textAlign: "right" }}>Fabric</th>
                  <th style={{ textAlign: "right" }}>Rib</th>
                  <th style={{ textAlign: "right" }}>Trims</th>
                  <th style={{ textAlign: "right" }}>Labour</th>
                  <th style={{ textAlign: "right" }}>others</th>
                  <th style={{ textAlign: "right", minWidth: "130px" }}>total</th>
                  <th style={{ textAlign: "right" }}>Stock</th>
                  <th style={{ textAlign: "right" }}>Stock Value</th>
                  <th style={{ textAlign: "right" }}>Target Price</th>
                  <th style={{ textAlign: "right" }}>GP & Margin</th>
                  <th>Cost Driver & 50% Target</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={15} style={{ textAlign: "center", padding: "32px 0", color: "var(--ink-4)", fontSize: 13 }}>
                      No items found. Add an item under the "Stock Levels" tab first.
                    </td>
                  </tr>
                )}
                {filtered.map((row, idx) => {
                  const savedCost = unitEconomics[row.id] || {};
                  const draftCost = draftEconomics[row.id] || {};

                  const fabric       = draftCost.fabric       !== undefined ? draftCost.fabric       : (savedCost.fabric       || 0);
                  const rib          = draftCost.rib          !== undefined ? draftCost.rib          : (savedCost.rib          || 0);
                  const trims        = draftCost.trims        !== undefined ? draftCost.trims        : (savedCost.trims        || 0);
                  const directLabour = draftCost.directLabour !== undefined ? draftCost.directLabour : (savedCost.directLabour || 0);
                  const others       = draftCost.others       !== undefined ? draftCost.others       : (savedCost.others       || 0);
                  const targetPrice  = draftCost.targetPrice  !== undefined ? draftCost.targetPrice  : (savedCost.targetPrice  || 0);

                  const cogsNpr = fabric + rib + trims + directLabour + others;
                  const cogsGbp = cogsNpr / 200;

                  const targetPriceGbp = targetPrice / 200;

                  const gpNpr = targetPrice - cogsNpr;
                  const gpGbp = gpNpr / 200;

                  const marginPct = targetPrice > 0 ? (gpNpr / targetPrice) * 100 : 0;

                  // Microeconomics Insights
                  const components = [
                    { name: "Fabric", val: fabric },
                    { name: "Rib", val: rib },
                    { name: "Trims", val: trims },
                    { name: "Direct Labour", val: directLabour },
                    { name: "Others", val: others }
                  ];
                  components.sort((a, b) => b.val - a.val);
                  const highestComp = components[0];
                  const driverText = cogsNpr > 0 && highestComp.val > 0 
                    ? `${highestComp.name} (${((highestComp.val / cogsNpr) * 100).toFixed(1)}%)`
                    : "—";

                  const target50Npr = cogsNpr * 2;
                  const target50Gbp = target50Npr / 200;

                  const isDirty = draftCost.fabric !== undefined || 
                                  draftCost.rib !== undefined || 
                                  draftCost.trims !== undefined || 
                                  draftCost.directLabour !== undefined || 
                                  draftCost.others !== undefined || 
                                  draftCost.targetPrice !== undefined ||
                                  draftCost.itemId !== undefined ||
                                  draftCost.item !== undefined;

                  const saving = savingRow === row.id;

                  // Margin color tone
                  let marginColor = "var(--ink-4)";
                  if (targetPrice > 0) {
                    if (marginPct < 0) marginColor = "var(--terra)";
                    else if (marginPct < 30) marginColor = "var(--amber)";
                    else marginColor = "var(--mint-deep)";
                  }

                  return (
                    <tr key={row.id} className="kinv-row">
                      <td>{idx + 1}</td>
                      <td>
                        <TextCell
                          value={draftCost.itemId !== undefined ? draftCost.itemId : row.itemId}
                          onChange={val => updateDraftEconomics(row.id, "itemId", val)}
                          disabled={!canEditUnitEconomics}
                          width="110px"
                        />
                      </td>
                      <td>
                        <TextCell
                          value={draftCost.item !== undefined ? draftCost.item : row.item}
                          onChange={val => updateDraftEconomics(row.id, "item", val)}
                          disabled={!canEditUnitEconomics}
                          width="240px"
                          style={{ fontFamily: "inherit", fontWeight: 600 }}
                        />
                        {row.category && <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, paddingLeft: 6 }}>{row.category}</div>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <CostCell
                          value={fabric}
                          onChange={val => updateDraftEconomics(row.id, "fabric", val)}
                          disabled={!canEditUnitEconomics}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <CostCell
                          value={rib}
                          onChange={val => updateDraftEconomics(row.id, "rib", val)}
                          disabled={!canEditUnitEconomics}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <CostCell
                          value={trims}
                          onChange={val => updateDraftEconomics(row.id, "trims", val)}
                          disabled={!canEditUnitEconomics}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <CostCell
                          value={directLabour}
                          onChange={val => updateDraftEconomics(row.id, "directLabour", val)}
                          disabled={!canEditUnitEconomics}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <CostCell
                          value={others}
                          onChange={val => updateDraftEconomics(row.id, "others", val)}
                          disabled={!canEditUnitEconomics}
                        />
                      </td>
                      <td style={{ textAlign: "right", minWidth: "130px" }}>
                        <div style={{ fontWeight: 600, fontSize: "15px", color: "var(--ink-1)" }}>NPR {cogsNpr.toLocaleString()}</div>
                        <div style={{ fontSize: "12px", color: "var(--ink-4)", fontFamily: "var(--mono)", marginTop: 2 }}>£{cogsGbp.toFixed(2)}</div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className="kinv-num">{getClosing(row).toLocaleString()}</span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 600, fontSize: "13px" }}>
                          NPR {(getClosing(row) * cogsNpr).toLocaleString()}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <CostCell
                          value={targetPrice}
                          onChange={val => updateDraftEconomics(row.id, "targetPrice", val)}
                          disabled={!canEditUnitEconomics}
                        />
                        {targetPrice > 0 && (
                          <div style={{ fontSize: "10px", color: "var(--ink-4)", fontFamily: "var(--mono)", marginTop: 2 }}>£{targetPriceGbp.toFixed(2)}</div>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {targetPrice > 0 ? (
                          <>
                            <div style={{ fontWeight: 600, color: marginColor }}>{marginPct.toFixed(1)}%</div>
                            <div style={{ fontSize: "11px", color: "var(--ink-4)", fontFamily: "var(--mono)", marginTop: 2 }}>
                              GP: NPR {gpNpr.toLocaleString()} (£{gpGbp.toFixed(2)})
                            </div>
                          </>
                        ) : (
                          <span style={{ color: "var(--ink-5)" }}>—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: "12px", color: "var(--ink-2)" }}>
                          <strong>Driver:</strong> {driverText}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--ink-4)", marginTop: 2 }}>
                          <strong>50% SP:</strong> NPR {target50Npr.toLocaleString()} (£{target50Gbp.toFixed(2)})
                        </div>
                      </td>
                      <td>
                        <button
                          className={cn("kinv-btn-save", isDirty && "kinv-btn-save--dirty")}
                          disabled={!canEditUnitEconomics || saving}
                          onClick={() => saveEconomicsRow(row.id)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 500,
                            cursor: canEditUnitEconomics && isDirty ? "pointer" : "default"
                          }}
                        >
                          {saving ? (
                            <span>…</span>
                          ) : (
                            <>
                              <SaveIcon size={12} />
                              <span>Save</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Library Tabs (Fabrics, Processes, Patterns) ── */}
        {["fabrics", "processes", "patterns"].includes(activeTab) && showLibrary && (
          <div style={{ padding: 20 }}>
            {loading ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                {[1, 2, 3].map(i => <div key={i} style={{ height: 140, background: "var(--bg-2)", borderRadius: 14, animation: "pulse 1.5s infinite" }} />)}
              </div>
            ) : activeTab === "fabrics" ? (
              <>
                {fabrics.length === 0 ? (
                  <div className="kazi-seed-card">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--ink-4)" }}>
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-2)" }}>No Fabrics in Production Library</div>
                    <p style={{ fontSize: 13, color: "var(--ink-4)", margin: "0 0 8px", maxWidth: 360 }}>
                      Populate the library with our standard fabric catalog items (SOS Cotton, Linen, Nepali Sinker, etc.) to get started.
                    </p>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={seedDefaultFabrics}
                      disabled={seedingCatalog}
                    >
                      {seedingCatalog ? (
                        <>
                          <span className="kazi-spinner" style={{ marginRight: 6 }} />
                          Seeding Catalog...
                        </>
                      ) : "Seed Default Catalog"}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="kazi-fabric-toolbar">
                      <div className="kazi-fabric-chips">
                        <button
                          type="button"
                          className={cn("kazi-fabric-chip", fabricFilter === "all" && "kazi-fabric-chip--active")}
                          onClick={() => setFabricFilter("all")}
                        >
                          All Fabrics
                        </button>
                        <button
                          type="button"
                          className={cn("kazi-fabric-chip", fabricFilter === "heavy" && "kazi-fabric-chip--active")}
                          onClick={() => setFabricFilter("heavy")}
                        >
                          Heavyweight (&gt;300 GSM)
                        </button>
                        <button
                          type="button"
                          className={cn("kazi-fabric-chip", fabricFilter === "light" && "kazi-fabric-chip--active")}
                          onClick={() => setFabricFilter("light")}
                        >
                          Lightweight (&lt;200 GSM)
                        </button>
                      </div>
                    </div>

                    {filteredFabrics.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-4)" }}>
                        No fabrics match your search or filters.
                      </div>
                    ) : (
                      <div className="kazi-fabric-grid">
                        {filteredFabrics.map(item => (
                          <FabricCard
                            key={item.id}
                            item={item}
                            onClick={() => setSelectedFabric(item)}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : getActiveLibraryItems().length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-4)" }}>
                <div style={{ fontSize: 15, marginBottom: 12 }}>No {activeTab} added yet</div>
                {canEditLibrary && (
                  <button className="primary-button" onClick={() => { setLibraryEditItem(null); setLibraryModalOpen(true); }}>
                    Add first entry
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                {activeTab === "processes" && filteredProcesses.map(item => (
                  <ProcessCard key={item.id} item={item} canEdit={canEditLibrary}
                    onEdit={() => { setLibraryEditItem(item); setLibraryModalOpen(true); }}
                    onDelete={() => handleDeleteLibraryItem(item)} />
                ))}
                {activeTab === "patterns" && filteredPatterns.map(item => (
                  <PatternCard key={item.id} item={item} canEdit={canEditLibrary}
                    onEdit={() => { setLibraryEditItem(item); setLibraryModalOpen(true); }}
                    onDelete={() => handleDeleteLibraryItem(item)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {libraryModalOpen && (
        <LibraryModal
          tab={activeTab}
          item={libraryEditItem}
          onClose={() => { setLibraryModalOpen(false); setLibraryEditItem(null); }}
          onSaved={handleSavedLibraryItem}
        />
      )}

      {fabricModalOpen && (
        <AddFabricModal
          onClose={() => setFabricModalOpen(false)}
          onSaved={(newFabric) => {
            setFabrics(prev => [...prev, newFabric]);
            setFabricModalOpen(false);
          }}
        />
      )}

      {selectedFabric && (
        <FabricDrawer
          item={selectedFabric}
          canEdit={canEditLibrary}
          onClose={() => setSelectedFabric(null)}
          onSaved={(updated) => {
            setFabrics(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x));
            setSelectedFabric(null);
          }}
          onDelete={(id) => {
            setFabrics(prev => prev.filter(x => x.id !== id));
            setSelectedFabric(null);
          }}
        />
      )}
    </AppLayout>
  );
}

export default Inventory;

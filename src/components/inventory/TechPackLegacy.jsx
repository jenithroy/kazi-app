/**
 * The tech pack pieces of the old Inventory page: the spec-sheet editor, the printable spec sheet, the card, and
 * the full-screen viewer. Moved here untouched when the page was redone, because tech packs are being redone on
 * their own later and the spec sheet is a printed document that must not change. They still look and behave as
 * they did; the Inventory page opens them from its Tech packs tab.
 *
 * When tech packs are redone: replace this file's pieces one at a time with `EditCard` and `DataTable`
 * (components/EditCard.jsx, components/table/), keep `#kinv-spec-print-area` and the datalist ids
 * `kinv-fabric-names` / `kinv-season-options`, and delete the `kbrf-*`, `ktp-*` and `klib-*` CSS with them.
 */
import { useEffect, useRef, useState } from "react";
import { Pill, cn } from "../ui";
import { insertRow, updateRow } from "../../lib/db";
import {
  compressFabricImage, getTechPackImages, isTechPackImageUrl, uploadPatternSketch, uploadPatternTechPack,
} from "../../lib/inventoryImages";
import ShareButton from "../share/ShareButton";

const GARMENT_CATEGORIES = ["Menswear", "Womenswear", "Kidswear"];
const SEASONS = ["Spring-Summer", "Autumn-Winter", "Winter", "Summer"];

// Garment Specification Sheet — matches the paper/Excel tech pack Anusha builds by
// hand per style: header block, a variable measurement grid, front/back sketches,
// wash care, up to 3 fabric/lining rows, trims, and remarks.
const emptyTechPackSpec = {
  styleNo: "", market: "", category: "Menswear", specDate: "", specSize: "", season: "",
  designerName: "", name: "", product_type: "",
  measurements: [], frontSketchUrl: "", backSketchUrl: "",
  washCare: "", fabricRows: [{ fabricName: "", description: "" }], trims: "", remarks: "",
  sizes_available: [], tech_pack_images: [], notes: ""
};

function nextStyleCode(patterns) {
  const nums = patterns
    .map(p => p.styleNo || "")
    .map(s => parseInt(String(s).replace(/\D/g, ""), 10))
    .filter(n => !isNaN(n));
  const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
  return `#KAZI${String(nextNum).padStart(3, "0")}`;
}

function findFabricInLibrary(fabrics, name) {
  const n = (name || "").trim().toLowerCase();
  if (!n) return null;
  return fabrics.find(f => (f.name || "").trim().toLowerCase() === n) || null;
}

function TrashIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
    </svg>
  );
}


/* ── Sketch upload slot (Front / Back) ─────────────────── */
function SketchUpload({ label, previewUrl, onFile, disabled }) {
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]);
  };

  return (
    <div>
      <label className="kfin-label">{label}</label>
      <div
        className={cn("kazi-dropzone", dragActive && "kazi-dropzone--active")}
        onDragEnter={disabled ? undefined : handleDrag}
        onDragOver={disabled ? undefined : handleDrag}
        onDragLeave={disabled ? undefined : handleDrag}
        onDrop={disabled ? undefined : handleDrop}
        onClick={disabled ? undefined : () => fileInputRef.current?.click()}
        style={{ minHeight: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: 8, cursor: disabled ? "default" : "pointer" }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={label} style={{ maxHeight: 130, maxWidth: "100%", objectFit: "contain" }} />
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "var(--ink-4)" }}>{disabled ? "No sketch" : "Click or drag to upload"}</p>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: "none" }}
        accept="image/*"
        onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ""; }}
      />
    </div>
  );
}

/* ── Garment Specification Sheet — create/edit ─────────── */
export function TechPackSpecModal({ item, fabrics, patterns, onClose, onSaved }) {
  const isEdit = !!item;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState(() => isEdit
    ? { ...emptyTechPackSpec, ...item }
    : { ...emptyTechPackSpec, styleNo: nextStyleCode(patterns || []), specDate: new Date().toISOString().slice(0, 10) }
  );
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [measurements, setMeasurements] = useState(() => (isEdit && Array.isArray(item.measurements)) ? item.measurements : []);
  const [fabricRows, setFabricRows] = useState(() => (isEdit && Array.isArray(item.fabricRows) && item.fabricRows.length) ? item.fabricRows : [{ fabricName: "", description: "" }]);

  const [frontSketchFile, setFrontSketchFile] = useState(null);
  const [frontSketchPreview, setFrontSketchPreview] = useState(item?.frontSketchUrl || "");
  const [backSketchFile, setBackSketchFile] = useState(null);
  const [backSketchPreview, setBackSketchPreview] = useState(item?.backSketchUrl || "");

  // Legacy scanned/photographed tech pack pages — kept alongside the structured
  // fields so older photo-only tech packs don't lose their pages.
  const [packImages, setPackImages] = useState(() => isEdit ? getTechPackImages(item) : []);
  const [packFiles, setPackFiles] = useState([]);
  const [packPreviews, setPackPreviews] = useState([]);
  const packInputRef = useRef(null);

  function addMeasurementRow() {
    setMeasurements(m => [...m, { label: "", inch: "" }]);
  }
  function updateMeasurementRow(idx, field, val) {
    setMeasurements(m => m.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }
  function removeMeasurementRow(idx) {
    setMeasurements(m => m.filter((_, i) => i !== idx));
  }

  function addFabricRow() {
    if (fabricRows.length >= 3) return;
    setFabricRows(r => [...r, { fabricName: "", description: "" }]);
  }
  function updateFabricRow(idx, field, val) {
    setFabricRows(rows => rows.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, [field]: val };
      if (field === "fabricName") {
        const match = findFabricInLibrary(fabrics, val);
        if (match && !r.description) {
          const parts = [match.composition, match.gsm ? `${match.gsm} GSM` : ""].filter(Boolean);
          next.description = parts.join(", ");
        }
      }
      return next;
    }));
  }
  function removeFabricRow(idx) {
    setFabricRows(rows => rows.filter((_, i) => i !== idx));
  }

  function addPackFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith("image/"));
    if (!files.length) return;
    setPackFiles(prev => [...prev, ...files]);
    setPackPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
  }
  function removePackFile(idx) {
    setPackFiles(prev => prev.filter((_, i) => i !== idx));
    setPackPreviews(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Description of Garment is required"); return; }
    setSaving(true); setError("");
    try {
      const payload = {
        styleNo:      form.styleNo,
        market:       form.market,
        category:     form.category,
        specDate:     form.specDate,
        specSize:     form.specSize,
        season:       form.season,
        designerName: form.designerName,
        name:         form.name,
        product_type: form.product_type,
        measurements: measurements.filter(r => r.label.trim() !== ""),
        washCare:     form.washCare,
        fabricRows:   fabricRows.filter(r => r.fabricName.trim() !== "" || r.description.trim() !== ""),
        trims:        form.trims,
        remarks:      form.remarks,
        sizes_available: form.sizes_available,
        notes:        form.notes
      };

      let docId = item?.id;
      if (!isEdit) {
        const ref = await insertRow("patterns", { ...payload, frontSketchUrl: "", backSketchUrl: "", tech_pack_images: [] });
        docId = ref.id;
      }

      if (frontSketchFile) payload.frontSketchUrl = await uploadPatternSketch(docId, await compressFabricImage(frontSketchFile), "front");
      else payload.frontSketchUrl = form.frontSketchUrl || "";

      if (backSketchFile) payload.backSketchUrl = await uploadPatternSketch(docId, await compressFabricImage(backSketchFile), "back");
      else payload.backSketchUrl = form.backSketchUrl || "";

      if (packFiles.length) {
        const uploaded = [];
        for (let i = 0; i < packFiles.length; i++) {
          const compressed = await compressFabricImage(packFiles[i]);
          uploaded.push(await uploadPatternTechPack(docId, compressed, i));
        }
        payload.tech_pack_images = [...packImages, ...uploaded];
      } else {
        payload.tech_pack_images = packImages;
      }

      await updateRow("patterns", docId, { ...payload, updatedAt: new Date().toISOString() });
      onSaved({ id: docId, ...payload });
    } catch (err) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="kbrf-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="kbrf-modal" style={{ maxWidth: 760 }}>
        <div className="kbrf-modal-hd">
          <div style={{ fontSize: 16, fontWeight: 700 }}>{isEdit ? "Edit" : "New"} Garment Specification Sheet</div>
          <button className="kbrf-modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 16, maxHeight: "78vh", overflowY: "auto" }}>
          {error && <p style={{ color: "var(--terra)", fontSize: 13, margin: 0 }}>{error}</p>}

          {/* Header block */}
          <div className="krsp-2" style={{ gap: 12 }}>
            <div>
              <label className="kfin-label">Style No.</label>
              <input className="kfin-input" value={form.styleNo} onChange={e => set("styleNo", e.target.value)} placeholder="#KAZI000" />
            </div>
            <div>
              <label className="kfin-label">Date</label>
              <input className="kfin-input" type="date" value={form.specDate} onChange={e => set("specDate", e.target.value)} />
            </div>
          </div>

          <div className="krsp-2" style={{ gap: 12 }}>
            <div>
              <label className="kfin-label">Category</label>
              <select className="kfin-input" value={form.category} onChange={e => set("category", e.target.value)}>
                {GARMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="kfin-label">Size</label>
              <input className="kfin-input" value={form.specSize} onChange={e => set("specSize", e.target.value)} placeholder="e.g. Medium, Extra Large (XL)" />
            </div>
          </div>

          <div className="krsp-2" style={{ gap: 12 }}>
            <div>
              <label className="kfin-label">Season</label>
              <input className="kfin-input" list="kinv-season-options" value={form.season} onChange={e => set("season", e.target.value)} placeholder="e.g. Spring-Summer" />
              <datalist id="kinv-season-options">
                {SEASONS.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className="kfin-label">Designer's Name</label>
              <input className="kfin-input" value={form.designerName} onChange={e => set("designerName", e.target.value)} />
            </div>
          </div>

          <div>
            <label className="kfin-label">Market</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["UK", "Nepal"].map(m => (
                <button key={m} type="button"
                  onClick={() => set("market", form.market === m ? "" : m)}
                  style={{
                    padding: "6px 14px", borderRadius: 8, fontSize: 13, border: "1.5px solid",
                    borderColor: form.market === m ? "var(--mint-deep)" : "var(--line)",
                    background: form.market === m ? "var(--mint-soft)" : "transparent",
                    color: form.market === m ? "var(--mint-deep)" : "var(--ink-3)",
                    cursor: "pointer"
                  }}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="kfin-label">Description of Garment *</label>
            <input className="kfin-input" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Men Tailored Tank Top" required />
          </div>

          <div>
            <label className="kfin-label">Product Type</label>
            <input className="kfin-input" value={form.product_type} onChange={e => set("product_type", e.target.value)} placeholder="T-Shirt, Hoodie, Kurthi…" />
          </div>

          {/* Measurements */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label className="kfin-label" style={{ margin: 0 }}>Measurements (Inch)</label>
              <button type="button" className="kinv-btn-ghost" onClick={addMeasurementRow}>+ Add Point</button>
            </div>
            {measurements.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-4)", margin: "4px 0" }}>No measurement points yet.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {measurements.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--ink-4)", width: 18 }}>{i + 1}</span>
                  <input className="kfin-input" style={{ flex: 2 }} value={r.label} placeholder="e.g. Full length"
                    onChange={e => updateMeasurementRow(i, "label", e.target.value)} />
                  <input className="kfin-input" style={{ flex: 1 }} value={r.inch} placeholder="Inch"
                    onChange={e => updateMeasurementRow(i, "inch", e.target.value)} />
                  <button type="button" className="kinv-btn-del" onClick={() => removeMeasurementRow(i)} title="Remove"><TrashIcon size={13} /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Sketches */}
          <div className="krsp-2" style={{ gap: 12 }}>
            <SketchUpload label="Front Sketch" previewUrl={frontSketchPreview}
              onFile={f => { setFrontSketchFile(f); setFrontSketchPreview(URL.createObjectURL(f)); }} />
            <SketchUpload label="Back Sketch" previewUrl={backSketchPreview}
              onFile={f => { setBackSketchFile(f); setBackSketchPreview(URL.createObjectURL(f)); }} />
          </div>

          <div>
            <label className="kfin-label">Wash Care Instructions</label>
            <input className="kfin-input" value={form.washCare} onChange={e => set("washCare", e.target.value)} placeholder="e.g. Machine Wash, Line Dry, Iron medium, do not bleach" />
          </div>

          {/* Fabrics/linings */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label className="kfin-label" style={{ margin: 0 }}>Fabrics / Linings</label>
              {fabricRows.length < 3 && (
                <button type="button" className="kinv-btn-ghost" onClick={addFabricRow}>+ Add Fabric</button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {fabricRows.map((r, i) => {
                const match = findFabricInLibrary(fabrics, r.fabricName);
                return (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
                    {match?.swatchImageUrl && (
                      <img src={match.swatchImageUrl} alt={r.fabricName} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, border: "1px solid var(--line)" }} />
                    )}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <input className="kfin-input" list="kinv-fabric-names" value={r.fabricName} placeholder={`Fabric ${i + 1} name`}
                        onChange={e => updateFabricRow(i, "fabricName", e.target.value)} />
                      <input className="kfin-input" value={r.description} placeholder="Description (composition, construction, GSM)"
                        onChange={e => updateFabricRow(i, "description", e.target.value)} />
                    </div>
                    {fabricRows.length > 1 && (
                      <button type="button" className="kinv-btn-del" onClick={() => removeFabricRow(i)} title="Remove fabric"><TrashIcon size={13} /></button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="kfin-label">Trims and Accessories</label>
            <textarea className="kfin-input" rows={2} value={form.trims} onChange={e => set("trims", e.target.value)} style={{ resize: "vertical" }} placeholder="e.g. 0.5inch placket bias, white thread" />
          </div>

          <div>
            <label className="kfin-label">Remarks</label>
            <textarea className="kfin-input" rows={2} value={form.remarks} onChange={e => set("remarks", e.target.value)} style={{ resize: "vertical" }} placeholder="Construction notes" />
          </div>

          {/* Legacy scanned pages */}
          <div>
            <label className="kfin-label">Scanned Pages (optional — for photographed/legacy tech packs)</label>
            <div
              className="kazi-dropzone"
              onClick={() => packInputRef.current?.click()}
              style={{ padding: 12 }}
            >
              <p style={{ margin: 0, fontSize: 12, color: "var(--ink-4)" }}>Click to attach photos of a physical tech pack, if you have one</p>
            </div>
            <input ref={packInputRef} type="file" style={{ display: "none" }} accept="image/*" multiple
              onChange={e => { addPackFiles(e.target.files); e.target.value = ""; }} />
            {(packImages.length > 0 || packPreviews.length > 0) && (
              <div className="ktp-page-thumbs">
                {packImages.map((url, i) => (
                  <div key={`saved-${i}`} className="ktp-page-thumb">
                    <img src={url} alt={`Page ${i + 1}`} />
                    <button type="button" className="ktp-page-thumb-x" title="Remove page"
                      onClick={() => setPackImages(prev => prev.filter((_, x) => x !== i))}>✕</button>
                  </div>
                ))}
                {packPreviews.map((url, i) => (
                  <div key={`new-${i}`} className="ktp-page-thumb ktp-page-thumb--new">
                    <img src={url} alt={`New page ${i + 1}`} />
                    <button type="button" className="ktp-page-thumb-x" title="Remove page"
                      onClick={() => removePackFile(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button type="submit" className="primary-button" disabled={saving} style={{ flex: 1 }}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Spec Sheet"}
            </button>
            <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Garment Specification Sheet — formatted read/print view ── */
export function TechPackSpecPreview({ item, onClose, onEdit }) {
  const measurements = Array.isArray(item.measurements) ? item.measurements : [];
  const fabricRows = Array.isArray(item.fabricRows) ? item.fabricRows.filter(r => r.fabricName || r.description) : [];

  return (
    <div className="kbrf-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="kbrf-modal" style={{ maxWidth: 820 }}>
        <div className="kbrf-modal-hd kinv-no-print">
          <div style={{ fontSize: 16, fontWeight: 700 }}>Garment Specification Sheet</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="ghost-button" onClick={() => window.print()}>Print</button>
            {onEdit && <button type="button" className="ghost-button" onClick={onEdit}>Edit</button>}
            <button className="kbrf-modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div id="kinv-spec-print-area" style={{ padding: "20px 24px 24px", maxHeight: "78vh", overflowY: "auto", fontSize: 13 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", border: "1.5px solid #000" }}>
            <tbody>
              <tr>
                <td style={specLabelStyle}>Style No.</td>
                <td style={specValStyle}>{item.styleNo || "—"}</td>
                <td style={specLabelStyle}>Date</td>
                <td style={specValStyle}>{item.specDate || "—"}</td>
              </tr>
              <tr>
                <td style={specLabelStyle}>Category</td>
                <td style={specValStyle}>{item.category || "—"}</td>
                <td style={specLabelStyle}>Size</td>
                <td style={specValStyle}>{item.specSize || "—"}</td>
              </tr>
              <tr>
                <td style={specLabelStyle}>Season</td>
                <td style={specValStyle}>{item.season || "—"}</td>
                <td style={specLabelStyle}>Designer's Name</td>
                <td style={specValStyle}>{item.designerName || "—"}</td>
              </tr>
              <tr>
                <td style={specLabelStyle}>Description of Garment</td>
                <td colSpan={3} style={specValStyle}>
                  {item.name}
                  {item.market && <span style={{ marginLeft: 10, fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "var(--mint-soft)", color: "var(--mint-deep)" }}>{item.market}</span>}
                </td>
              </tr>
            </tbody>
          </table>

          <table style={{ width: "100%", borderCollapse: "collapse", border: "1.5px solid #000", borderTop: "none" }}>
            <tbody>
              <tr>
                <td style={{ ...specLabelStyle, verticalAlign: "top", width: "30%" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={specGridHead}>S.No</th>
                        <th style={specGridHead}>Measurement</th>
                        <th style={specGridHead}>Inch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {measurements.length === 0 && (
                        <tr><td colSpan={3} style={{ ...specGridCell, textAlign: "center", color: "var(--ink-4)" }}>No points entered</td></tr>
                      )}
                      {measurements.map((r, i) => (
                        <tr key={i}>
                          <td style={specGridCell}>{i + 1}</td>
                          <td style={specGridCell}>{r.label}</td>
                          <td style={specGridCell}>{r.inch}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
                <td style={{ ...specValStyle, width: "70%", textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "space-around", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Front</div>
                      {item.frontSketchUrl
                        ? <img src={item.frontSketchUrl} alt="Front" style={{ maxWidth: "100%", maxHeight: 220 }} />
                        : <div style={{ color: "var(--ink-4)", fontSize: 12 }}>No sketch</div>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Back</div>
                      {item.backSketchUrl
                        ? <img src={item.backSketchUrl} alt="Back" style={{ maxWidth: "100%", maxHeight: 220 }} />
                        : <div style={{ color: "var(--ink-4)", fontSize: 12 }}>No sketch</div>}
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <table style={{ width: "100%", borderCollapse: "collapse", border: "1.5px solid #000", borderTop: "none" }}>
            <tbody>
              <tr>
                <td style={specLabelStyle}>Wash Care Instructions</td>
                <td style={specValStyle}>{item.washCare || "—"}</td>
              </tr>
              <tr>
                <td style={{ ...specLabelStyle, verticalAlign: "top" }}>Fabrics / Linings</td>
                <td style={specValStyle}>
                  {fabricRows.length === 0 && "—"}
                  {fabricRows.map((r, i) => (
                    <div key={i} style={{ marginBottom: i < fabricRows.length - 1 ? 8 : 0 }}>
                      <strong>{r.fabricName || `Fabric ${i + 1}`}:</strong> {r.description || "—"}
                    </div>
                  ))}
                </td>
              </tr>
              <tr>
                <td style={specLabelStyle}>Trims and Accessories</td>
                <td style={specValStyle}>{item.trims || "—"}</td>
              </tr>
              <tr>
                <td style={specLabelStyle}>Remarks</td>
                <td style={specValStyle}>{item.remarks || "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const specLabelStyle = { border: "1px solid #000", padding: "6px 8px", fontWeight: 700, background: "#f4f4f4", width: "20%" };
const specValStyle = { border: "1px solid #000", padding: "6px 8px" };
const specGridHead = { border: "1px solid #000", padding: "3px 6px", fontSize: 11, background: "#f4f4f4" };
const specGridCell = { border: "1px solid #000", padding: "3px 6px", fontSize: 12 };

export function TechPackCard({ item, canEdit, onEdit, onDelete, onView, onViewSpec }) {
  const sizes = Array.isArray(item.sizes_available) ? item.sizes_available : [];
  const images = getTechPackImages(item);
  const hasExternalLink = item.tech_pack_url && !isTechPackImageUrl(item.tech_pack_url);
  const hasSpec = !!(item.styleNo || (Array.isArray(item.measurements) && item.measurements.length));

  return (
    <div className="klib-card ktp-card">
      {/* Cover — first tech pack page, or a placeholder sheet */}
      <div
        className={cn("ktp-cover", images.length > 0 && "ktp-cover--clickable")}
        onClick={images.length > 0 ? onView : undefined}
        role={images.length > 0 ? "button" : undefined}
        title={images.length > 0 ? "Open tech pack" : undefined}
      >
        {images.length > 0 ? (
          <>
            <img src={images[0]} alt={`${item.name} tech pack`} className="ktp-cover-img" loading="lazy" />
            <div className="ktp-cover-overlay">
              <span className="ktp-cover-open">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                Open
              </span>
            </div>
            {images.length > 1 && (
              <span className="ktp-page-badge">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/><path d="M2 6v14a2 2 0 0 0 2 2h10"/></svg>
                {images.length} pages
              </span>
            )}
          </>
        ) : (
          <div className="ktp-cover-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
            <span>No pages yet</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="klib-card-body">
        <div className="ktp-title-row">
          <h4 className="klib-card-name">{item.name}</h4>
          {item.product_type && <span className="ktp-type-pill">{item.product_type}</span>}
        </div>

        {(item.styleNo || item.category || item.season || item.market) && (
          <div className="klib-card-meta" style={{ flexWrap: "wrap", gap: 6 }}>
            {item.styleNo && <Pill tone="neutral">{item.styleNo}</Pill>}
            {item.category && <Pill tone="blue">{item.category}</Pill>}
            {item.season && <Pill tone="neutral">{item.season}</Pill>}
            {item.market && <Pill tone="mint">{item.market}</Pill>}
          </div>
        )}
        {item.designerName && (
          <p className="kazi-fabric-comp">Designer: {item.designerName}</p>
        )}

        {hasExternalLink && (
          <a href={item.tech_pack_url} target="_blank" rel="noopener noreferrer" className="klib-meta-chip" style={{ textDecoration: "none", display: "inline-flex", alignSelf: "flex-start" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            External file ↗
          </a>
        )}

        {sizes.length > 0 && (
          <div className="klib-card-sizes">
            {sizes.map(s => (
              <span key={s} className="klib-size-pill">{s}</span>
            ))}
          </div>
        )}

        {item.notes && (
          <p className="klib-card-notes">{item.notes}</p>
        )}
      </div>

      {/* Actions */}
      <div className="klib-card-actions">
        {hasSpec && (
          <button className="klib-action-btn" onClick={onViewSpec}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
            Spec Sheet
          </button>
        )}
        {(images.length > 0 || hasSpec) && <ShareButton type="techpack" record={item} className="klib-action-btn" title="Send this tech pack to someone in Chat" />}
        {canEdit && (
          <>
            <button className="klib-action-btn" onClick={onEdit}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
            <button className="klib-action-btn klib-action-btn--danger" onClick={onDelete}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Full-screen tech pack viewer ─────────────────────── */
export function TechPackViewer({ item, onClose }) {
  const images = getTechPackImages(item);
  const [page, setPage] = useState(0);
  const touchStartX = useRef(null);
  const thumbsRef = useRef(null);

  // Keep the active thumbnail visible as pages change (strip scrolls on mobile)
  useEffect(() => {
    thumbsRef.current?.querySelector(".ktp-viewer-thumb--active")
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [page]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setPage(p => Math.min(images.length - 1, p + 1));
      if (e.key === "ArrowLeft")  setPage(p => Math.max(0, p - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose]);

  // Swipe left/right between pages on touch devices
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) setPage(p => Math.min(images.length - 1, p + 1));
    else        setPage(p => Math.max(0, p - 1));
  };

  if (!images.length) return null;
  const current = images[Math.min(page, images.length - 1)];

  return (
    <div className="ktp-viewer" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Top bar */}
      <div className="ktp-viewer-bar">
        <div className="ktp-viewer-title">
          <span className="ktp-viewer-name">{item.name}</span>
          {item.product_type && <span className="ktp-viewer-type">{item.product_type}</span>}
        </div>
        <div className="ktp-viewer-bar-actions">
          <span className="ktp-viewer-counter">{page + 1} / {images.length}</span>
          <ShareButton type="techpack" record={item} label="" className="ktp-viewer-btn" title="Send this tech pack to someone in Chat" />
          <a href={current} target="_blank" rel="noopener noreferrer" className="ktp-viewer-btn" title="Open original in new tab">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
          <button className="ktp-viewer-btn" onClick={onClose} title="Close (Esc)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="ktp-viewer-stage" onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {images.length > 1 && (
          <button className="ktp-viewer-nav ktp-viewer-nav--prev" disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
        )}
        <img src={current} alt={`${item.name} — page ${page + 1}`} className="ktp-viewer-img" />
        {images.length > 1 && (
          <button className="ktp-viewer-nav ktp-viewer-nav--next" disabled={page === images.length - 1}
            onClick={() => setPage(p => Math.min(images.length - 1, p + 1))}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 6l6 6-6 6"/></svg>
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="ktp-viewer-thumbs" ref={thumbsRef}>
          {images.map((url, i) => (
            <button key={i} className={cn("ktp-viewer-thumb", i === page && "ktp-viewer-thumb--active")}
              onClick={() => setPage(i)}>
              <img src={url} alt={`Page ${i + 1}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


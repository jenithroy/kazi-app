import { useEffect, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc
} from "firebase/firestore";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import { db } from "../firebase";
import { Card, Btn, Pill, Icons, cn, fmt } from "../components/ui";

const TABS = [
  { key: "fabrics",   label: "Materials & Fabrics" },
  { key: "processes", label: "Processes" },
  { key: "patterns",  label: "Patterns" },
];

const PROCESS_CATEGORIES = ["printing", "embellishment", "construction", "finishing", "other"];
const COMMON_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

/* ── Empty form defaults ─────────────────────────────── */
const emptyFabric   = { name: "", composition: "", weight_gsm: "", available_colors: "", supplier: "", price_per_meter: "", notes: "" };
const emptyProcess  = { name: "", category: "", description: "", cost_per_unit: "", min_quantity: "", lead_time_days: "", notes: "" };
const emptyPattern  = { name: "", product_type: "", sizes_available: [], tech_pack_url: "", notes: "" };

/* ── Modal ───────────────────────────────────────────── */
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
        payload.available_colors = form.available_colors
          ? form.available_colors.split(",").map(c => c.trim()).filter(Boolean)
          : [];
        payload.weight_gsm = form.weight_gsm ? Number(form.weight_gsm) : null;
        payload.price_per_meter = form.price_per_meter ? Number(form.price_per_meter) : null;
      }
      if (tab === "processes") {
        payload.cost_per_unit  = form.cost_per_unit  ? Number(form.cost_per_unit)  : null;
        payload.min_quantity   = form.min_quantity   ? Number(form.min_quantity)   : null;
        payload.lead_time_days = form.lead_time_days ? Number(form.lead_time_days) : null;
      }
      if (isEdit) {
        await updateDoc(doc(db, tab, item.id), { ...payload, updatedAt: serverTimestamp() });
        onSaved({ id: item.id, ...payload });
      } else {
        const ref = await addDoc(collection(db, tab), { ...payload, createdAt: serverTimestamp() });
        onSaved({ id: ref.id, ...payload });
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
            <input className="kfin-input" value={form.name} onChange={e => set("name", e.target.value)} placeholder={tab === "fabrics" ? "e.g. 180 GSM Cotton Jersey" : tab === "processes" ? "e.g. DTG Printing" : "e.g. Oversized Tee"} />
          </div>

          {tab === "fabrics" && <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="kfin-label">Composition</label>
                <input className="kfin-input" value={form.composition} onChange={e => set("composition", e.target.value)} placeholder="100% Cotton" />
              </div>
              <div>
                <label className="kfin-label">Weight (GSM)</label>
                <input className="kfin-input" type="number" value={form.weight_gsm} onChange={e => set("weight_gsm", e.target.value)} placeholder="180" />
              </div>
            </div>
            <div>
              <label className="kfin-label">Available Colors (comma-separated)</label>
              <input className="kfin-input" value={form.available_colors} onChange={e => set("available_colors", e.target.value)} placeholder="White, Black, Navy" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="kfin-label">Supplier</label>
                <input className="kfin-input" value={form.supplier} onChange={e => set("supplier", e.target.value)} />
              </div>
              <div>
                <label className="kfin-label">Price/metre (NPR)</label>
                <input className="kfin-input" type="number" value={form.price_per_meter} onChange={e => set("price_per_meter", e.target.value)} placeholder="350" />
              </div>
            </div>
          </>}

          {tab === "processes" && <>
            <div>
              <label className="kfin-label">Category</label>
              <select className="kfin-input" value={form.category} onChange={e => set("category", e.target.value)}>
                <option value="">Select category</option>
                {PROCESS_CATEGORIES.map(c => <option key={c} value={c} style={{ textTransform: "capitalize" }}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="kfin-label">Description</label>
              <textarea className="kfin-input" rows={2} value={form.description} onChange={e => set("description", e.target.value)} style={{ resize: "vertical" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label className="kfin-label">Cost/unit (NPR)</label>
                <input className="kfin-input" type="number" value={form.cost_per_unit} onChange={e => set("cost_per_unit", e.target.value)} />
              </div>
              <div>
                <label className="kfin-label">Min qty</label>
                <input className="kfin-input" type="number" value={form.min_quantity} onChange={e => set("min_quantity", e.target.value)} />
              </div>
              <div>
                <label className="kfin-label">Lead time (days)</label>
                <input className="kfin-input" type="number" value={form.lead_time_days} onChange={e => set("lead_time_days", e.target.value)} />
              </div>
            </div>
          </>}

          {tab === "patterns" && <>
            <div>
              <label className="kfin-label">Product Type</label>
              <input className="kfin-input" value={form.product_type} onChange={e => set("product_type", e.target.value)} placeholder="T-Shirt, Hoodie…" />
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
              <label className="kfin-label">Tech Pack URL</label>
              <input className="kfin-input" value={form.tech_pack_url} onChange={e => set("tech_pack_url", e.target.value)} placeholder="https://…" />
            </div>
          </>}

          <div>
            <label className="kfin-label">Notes</label>
            <textarea className="kfin-input" rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} style={{ resize: "vertical" }} />
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

/* ── Cards ───────────────────────────────────────────── */
function FabricCard({ item, canEdit, onEdit, onDelete }) {
  const colors = Array.isArray(item.available_colors) ? item.available_colors : [];
  return (
    <div className="kazi-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
          {item.composition && <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2 }}>{item.composition}</div>}
        </div>
        {item.weight_gsm && <Pill tone="mint">{item.weight_gsm} GSM</Pill>}
      </div>
      {colors.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {colors.map(c => <Pill key={c} tone="blue">{c}</Pill>)}
        </div>
      )}
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--ink-4)" }}>
        {item.supplier && <span>Supplier: {item.supplier}</span>}
        {item.price_per_meter && <span>{fmt.npr(item.price_per_meter)}/m</span>}
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
  return (
    <div className="kazi-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
          {item.product_type && <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2 }}>{item.product_type}</div>}
        </div>
        {item.tech_pack_url && (
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

/* ── Main page ───────────────────────────────────────── */
export default function Library() {
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "library");
  const [tab, setTab]         = useState("fabrics");
  const [fabrics, setFabrics]   = useState([]);
  const [processes, setProcesses] = useState([]);
  const [patterns, setPatterns]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null); // null | { item: null|obj }
  const [editItem, setEditItem] = useState(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [fs, ps, pats] = await Promise.all([
        getDocs(collection(db, "fabrics")),
        getDocs(collection(db, "processes")),
        getDocs(collection(db, "patterns")),
      ]);
      setFabrics(fs.docs.map(d => ({ id: d.id, ...d.data() })));
      setProcesses(ps.docs.map(d => ({ id: d.id, ...d.data() })));
      setPatterns(pats.docs.map(d => ({ id: d.id, ...d.data() })));
    } finally {
      setLoading(false);
    }
  }

  function setForTab(data) {
    if (tab === "fabrics")   setFabrics(data);
    if (tab === "processes") setProcesses(data);
    if (tab === "patterns")  setPatterns(data);
  }

  function getForTab() {
    if (tab === "fabrics")   return fabrics;
    if (tab === "processes") return processes;
    return patterns;
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    await deleteDoc(doc(db, tab, item.id));
    setForTab(getForTab().filter(x => x.id !== item.id));
  }

  function handleSaved(saved) {
    const current = getForTab();
    if (editItem) {
      setForTab(current.map(x => x.id === saved.id ? saved : x));
    } else {
      setForTab([...current, saved]);
    }
    setModal(null);
    setEditItem(null);
  }

  const items = getForTab();

  return (
    <AppLayout>
      <PageHeader
        title="Production Library"
        description="Reference repository for materials, processes and patterns."
        action={canEdit && (
          <button className="primary-button" onClick={() => { setEditItem(null); setModal(true); }}>
            + Add {tab === "fabrics" ? "Fabric" : tab === "processes" ? "Process" : "Pattern"}
          </button>
        )}
      />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1.5px solid var(--line)", marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: "10px 20px", fontSize: 13, fontWeight: 500, border: "none", background: "none",
              borderBottom: tab === t.key ? "2.5px solid var(--mint-deep)" : "2.5px solid transparent",
              color: tab === t.key ? "var(--mint-deep)" : "var(--ink-4)",
              cursor: "pointer", marginBottom: -1.5,
            }}>
            {t.label}
            <span style={{ marginLeft: 6, fontSize: 11, background: "var(--bg-2)", padding: "1px 6px", borderRadius: 10, color: "var(--ink-4)" }}>
              {t.key === "fabrics" ? fabrics.length : t.key === "processes" ? processes.length : patterns.length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {[1, 2, 3].map(i => <div key={i} style={{ height: 140, background: "var(--bg-2)", borderRadius: 14, animation: "pulse 1.5s infinite" }} />)}
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-4)" }}>
          <div style={{ fontSize: 15, marginBottom: 12 }}>No {tab} added yet</div>
          {canEdit && <button className="primary-button" onClick={() => { setEditItem(null); setModal(true); }}>Add first entry</button>}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {tab === "fabrics" && fabrics.map(item => (
            <FabricCard key={item.id} item={item} canEdit={canEdit}
              onEdit={() => { setEditItem(item); setModal(true); }}
              onDelete={() => handleDelete(item)} />
          ))}
          {tab === "processes" && processes.map(item => (
            <ProcessCard key={item.id} item={item} canEdit={canEdit}
              onEdit={() => { setEditItem(item); setModal(true); }}
              onDelete={() => handleDelete(item)} />
          ))}
          {tab === "patterns" && patterns.map(item => (
            <PatternCard key={item.id} item={item} canEdit={canEdit}
              onEdit={() => { setEditItem(item); setModal(true); }}
              onDelete={() => handleDelete(item)} />
          ))}
        </div>
      )}

      {modal && (
        <LibraryModal
          tab={tab}
          item={editItem}
          onClose={() => { setModal(null); setEditItem(null); }}
          onSaved={handleSaved}
        />
      )}
    </AppLayout>
  );
}

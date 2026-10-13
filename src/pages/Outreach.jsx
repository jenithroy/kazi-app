/**
 * Outreach — the cold-DM/call list, before any of these brands are a lead or
 * a customer.
 *
 * Leads (Messenger tab) exists because a customer messaged Kazi first.
 * Customers exists because an order or invoice exists. This page is the
 * stage before either: brands identified as plausible manufacturing
 * customers, being cold-DMed or called, with no relationship yet in either
 * direction. Status here is entirely self-reported by whoever is doing the
 * outreach — there is no bot or webhook feeding it.
 */
import { useEffect, useMemo, useState } from "react";
import { deleteRow, fetchAll, insertRow, updateRow } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import { Icons, KPI, Pill } from "../components/ui";

const TIERS = ["S", "A", "B", "C", "D"];
const TIER_LABEL = { S: "Warmest lead", A: "Core target", B: "Strong secondary", C: "Verify first", D: "Unverified" };
const TIER_TONE  = { S: "mint", A: "mint", B: "amber", C: "amber", D: "neutral" };

const STATUSES = ["not_contacted", "dm_sent", "replied", "call_booked", "dead"];
const STATUS_LABEL = {
  not_contacted: "Not contacted",
  dm_sent:       "DM/email sent",
  replied:       "Replied",
  call_booked:   "Call booked",
  dead:          "Dead",
};
const STATUS_TONE = {
  not_contacted: "neutral",
  dm_sent:       "amber",
  replied:       "mint",
  call_booked:   "mint",
  dead:          "terra",
};

const EMPTY = {
  tier: "C", brand_name: "", country: "", category: "",
  website: "", instagram: "", email: "", contact_note: "",
  rationale: "", status: "not_contacted", notes: "",
};

const inp = {
  border: "1px solid var(--line-strong)", borderRadius: 7, padding: "7px 10px",
  fontSize: 13, fontFamily: "var(--font)", outline: "none", width: "100%",
  background: "var(--bg)",
};
const lbl = {
  display: "flex", flexDirection: "column", gap: 4,
  fontSize: 12, fontWeight: 600, color: "var(--ink-3)",
};

function ProspectForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="krsp-2" style={{ gap: 10 }}>
        <label style={lbl}>Brand name *
          <input style={inp} value={form.brand_name} onChange={set("brand_name")} placeholder="e.g. Parlez" autoFocus /></label>
        <label style={lbl}>Country
          <input style={inp} value={form.country} onChange={set("country")} placeholder="UK" /></label>
        <label style={lbl}>Category
          <input style={inp} value={form.category} onChange={set("category")} placeholder="streetwear" /></label>
        <label style={lbl}>Tier
          <select style={inp} value={form.tier} onChange={set("tier")}>
            {TIERS.map(t => <option key={t} value={t}>{t} — {TIER_LABEL[t]}</option>)}
          </select></label>
        <label style={lbl}>Website
          <input style={inp} value={form.website} onChange={set("website")} placeholder="brand.com" /></label>
        <label style={lbl}>Instagram
          <input style={inp} value={form.instagram} onChange={set("instagram")} placeholder="handle, no @" /></label>
        <label style={lbl}>Email
          <input style={inp} type="email" value={form.email} onChange={set("email")} placeholder="hello@brand.com" /></label>
        <label style={lbl}>Status
          <select style={inp} value={form.status} onChange={set("status")}>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select></label>
      </div>
      <label style={lbl}>Why this brand
        <textarea style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} rows={2} value={form.rationale} onChange={set("rationale")} placeholder="Why they're a plausible target…" /></label>
      <label style={lbl}>Notes
        <textarea style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} rows={2} value={form.notes} onChange={set("notes")} placeholder="Outreach log, replies, next step…" /></label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
        <button className="ghost-button" onClick={onCancel}>Cancel</button>
        <button className="primary-button" onClick={() => form.brand_name.trim() && onSave(form)}
          style={{ opacity: form.brand_name.trim() ? 1 : .5 }}>Save prospect</button>
      </div>
    </div>
  );
}

function ContactLinks({ p }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
      {p.website && (
        <a href={/^https?:\/\//.test(p.website) ? p.website : `https://${p.website}`}
          target="_blank" rel="noreferrer" style={{ color: "var(--ink-2)" }}>{p.website}</a>
      )}
      {p.instagram && (
        <a href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noreferrer" style={{ color: "var(--mint-deep)" }}>
          @{p.instagram}
        </a>
      )}
      {p.email && (
        <a href={`mailto:${p.email}`} style={{ color: "var(--ink-3)" }}>{p.email}</a>
      )}
      {!p.website && !p.instagram && !p.email && (
        <span style={{ color: "var(--ink-4)" }}>—</span>
      )}
    </div>
  );
}

function ProspectRow({ p, canEdit, expanded, onToggle, onStatusChange, onEdit, onDelete }) {
  return (
    <>
      <div className="kcust-row2" onClick={onToggle} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        style={{ cursor: "pointer" }}>

        <div style={{ width: 30, flexShrink: 0 }}>
          <Pill tone={TIER_TONE[p.tier] || "neutral"}>{p.tier}</Pill>
        </div>

        <div className="kcust-name">
          <div className="kcust-name-t">{p.brand_name}</div>
          <div className="kcust-name-s">
            {p.country || "—"}{p.category ? ` · ${p.category}` : ""}
          </div>
        </div>

        <div onClick={e => e.stopPropagation()}>
          <ContactLinks p={p} />
        </div>

        <div onClick={e => e.stopPropagation()}>
          {canEdit ? (
            <select value={p.status} onChange={e => onStatusChange(p, e.target.value)} style={{ ...inp, width: 150, fontSize: 12 }}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          ) : (
            <Pill tone={STATUS_TONE[p.status] || "neutral"}>{STATUS_LABEL[p.status] || p.status}</Pill>
          )}
        </div>

        <div className="kcust-acts" onClick={e => e.stopPropagation()}>
          {canEdit && (
            <>
              <button onClick={() => onEdit(p)} title="Edit"><Icons.Settings size={14} /></button>
              <button onClick={() => onDelete(p)} title="Delete"><Icons.X size={14} /></button>
            </>
          )}
          <span className={`kcust-chev${expanded ? " is-open" : ""}`}>›</span>
        </div>
      </div>

      {expanded && (
        <div className="kcust-detail" style={{ padding: "12px 20px 18px", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
          {p.rationale && <p style={{ margin: "0 0 8px" }}><strong>Why:</strong> {p.rationale}</p>}
          {p.contact_note && <p style={{ margin: "0 0 8px", color: "var(--ink-3)" }}><strong>Contact note:</strong> {p.contact_note}</p>}
          {p.notes
            ? <p style={{ margin: 0 }}><strong>Outreach notes:</strong> {p.notes}</p>
            : <p style={{ margin: 0, color: "var(--ink-4)" }}>No outreach notes yet.</p>}
        </div>
      )}
    </>
  );
}

const TIER_ORDER = Object.fromEntries(TIERS.map((t, i) => [t, i]));

function Outreach() {
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "outreach");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  async function load() {
    try {
      const data = await fetchAll("outreach_prospects");
      setRows(data);
      setLoadError("");
    } catch (err) {
      console.error("Outreach: failed to load:", err);
      setLoadError("Could not load the prospect list. Check your connection and refresh.");
    }
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (tierFilter !== "all") list = list.filter(p => p.tier === tierFilter);
    if (statusFilter !== "all") list = list.filter(p => p.status === statusFilter);
    if (q) list = list.filter(p =>
      (p.brand_name || "").toLowerCase().includes(q) ||
      (p.country || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q) ||
      (p.rationale || "").toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      const t = (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
      if (t !== 0) return t;
      return (a.brand_name || "").localeCompare(b.brand_name || "");
    });
  }, [rows, query, tierFilter, statusFilter]);

  const totals = useMemo(() => {
    const byStatus = Object.fromEntries(STATUSES.map(s => [s, rows.filter(p => p.status === s).length]));
    return {
      total: rows.length,
      contacted: rows.length - (byStatus.not_contacted || 0),
      replied: byStatus.replied || 0,
      callBooked: byStatus.call_booked || 0,
    };
  }, [rows]);

  async function handleSave(form) {
    try {
      if (editing) await updateRow("outreach_prospects", editing.id, form);
      else await insertRow("outreach_prospects", form);
      setShowForm(false); setEditing(null);
      await load();
    } catch (err) {
      console.error("Failed to save prospect:", err);
      alert("Could not save — you may not have permission to edit outreach.");
    }
  }

  async function handleStatusChange(p, status) {
    setRows(rs => rs.map(r => r.id === p.id ? { ...r, status } : r));
    try {
      await updateRow("outreach_prospects", p.id, { status });
    } catch (err) {
      console.error("Failed to update status:", err);
      alert("Could not save that status change — reload and try again.");
      await load();
    }
  }

  async function handleDelete(p) {
    if (!window.confirm(`Remove ${p.brand_name} from the outreach list?`)) return;
    try {
      await deleteRow("outreach_prospects", p.id);
      await load();
    } catch {
      alert("Could not delete — you may not have permission to edit outreach.");
    }
  }

  const modal = (title, body, onClose) => (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(10,28,20,.4)", backdropFilter: "blur(3px)", zIndex: 50 }} onClick={onClose} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 51, background: "#fff", borderRadius: 14, padding: 28, width: "min(580px, 94vw)", maxHeight: "88vh", overflowY: "auto", boxShadow: "var(--shadow-pop)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--ink-4)" }}>×</button>
        </div>
        {body}
      </div>
    </>
  );

  return (
    <div className="kscr fade-in" style={{ padding: "4px 0 0" }}>

      <div className="kph" style={{ padding: "8px 0 20px" }}>
        <div>
          <h2>Outreach</h2>
          <p>{rows.length} prospect{rows.length !== 1 ? "s" : ""} · cold-DM/call list, not yet leads or customers</p>
        </div>
        <div className="kph-a" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {canEdit && (
            <button className="primary-button" style={{ display: "flex", alignItems: "center", gap: 6 }}
              onClick={() => { setEditing(null); setShowForm(true); }}>
              <Icons.Plus size={13} sw={2.2} /> Add prospect
            </button>
          )}
        </div>
      </div>

      {loadError && <div className="kcust-err">{loadError}</div>}

      <div className="kkpi-row krsp-4" style={{ gap: 12, marginBottom: 16 }}>
        <KPI label="Total prospects" value={loading ? "—" : totals.total} />
        <KPI label="Contacted" value={loading ? "—" : totals.contacted} accent="var(--amber)" />
        <KPI label="Replied" value={loading ? "—" : totals.replied} accent="var(--mint-deep)" />
        <KPI label="Calls booked" value={loading ? "—" : totals.callBooked} accent="var(--mint-deep)" />
      </div>

      <div className="kcust-controls">
        <input className="kcust-search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search prospects…" />
        <select style={{ ...inp, width: 160 }} value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
          <option value="all">All tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{t} — {TIER_LABEL[t]}</option>)}
        </select>
        <select style={{ ...inp, width: 170 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      <div className="kcust-tbl">
        {loading ? (
          <p style={{ padding: "32px 16px", color: "var(--ink-4)" }}>Loading…</p>
        ) : visible.length === 0 ? (
          <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--ink-4)" }}>
            <div style={{ fontWeight: 600 }}>
              {rows.length === 0 ? "No prospects yet" : "Nothing matches that"}
            </div>
          </div>
        ) : (
          visible.map(p => (
            <ProspectRow key={p.id} p={p} canEdit={canEdit}
              expanded={expanded === p.id}
              onToggle={() => setExpanded(x => x === p.id ? null : p.id)}
              onStatusChange={handleStatusChange}
              onEdit={x => { setEditing(x); setShowForm(true); }}
              onDelete={handleDelete} />
          ))
        )}
      </div>

      {showForm && modal(
        editing ? "Edit prospect" : "New prospect",
        <ProspectForm initial={editing || undefined} onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }} />,
        () => { setShowForm(false); setEditing(null); })}
    </div>
  );
}

export default Outreach;

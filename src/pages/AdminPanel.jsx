import { useEffect, useState, useCallback } from "react";
import { collection, getDocs, doc, updateDoc, setDoc } from "firebase/firestore";
import AppLayout from "../components/AppLayout";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { TEAM_MEMBERS } from "../constants";
import { sectionCanEdit, financeTabAllowed } from "../utils/permissions";
import { Avatar, cn } from "../components/ui";

/* ── Constants ─────────────────────────────────────────── */
const SECTIONS = [
  { key: "tasks",      label: "Tasks",           icon: "✓" },
  { key: "attendance", label: "Attendance",       icon: "📅" },
  { key: "production", label: "Production",       icon: "⚙" },
  { key: "inventory",  label: "Inventory",        icon: "📦" },
  { key: "qc",         label: "Quality Control",  icon: "🛡" },
  { key: "billing",    label: "Billing",          icon: "📄" },
  { key: "employees",  label: "Employee and HR",  icon: "👥" },
  { key: "budget",     label: "Budget & Reqs",    icon: "💷" },
];

const FINANCE_TABS = [
  { key: "expenses",     label: "Expenses" },
  { key: "payroll",      label: "Payroll" },
  { key: "purchases",    label: "Purchases" },
  { key: "vatBills",     label: "VAT Bills" },
  { key: "journal",      label: "Journal" },
  { key: "ledger",       label: "Ledger" },
  { key: "pl",           label: "P & L" },
  { key: "balanceSheet", label: "Balance Sheet" },
];

const ROLE_META = {
  super_admin:  { label: "Super Admin",  tone: "amber",   desc: "Full access to everything" },
  nepal_admin:  { label: "Nepal Admin",  tone: "mint",    desc: "Configurable edit access" },
  uk_admin:     { label: "UK Admin",     tone: "blue",    desc: "Configurable edit access" },
  employee:     { label: "Employee",     tone: "neutral", desc: "Configurable edit access" },
  nepal_staff:  { label: "Nepal Staff",  tone: "neutral", desc: "Configurable edit access" },
};

function hueFromName(name = "") {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return h % 360;
}

/* ── Production Chain constants ─────────────────────────── */
const DISPATCH_STAGES = [
  { stage: "Order Received",        order: 0, enabled: false, timeoutHours: 2  },
  { stage: "Fabric Sourcing",       order: 1, enabled: true,  timeoutHours: 8  },
  { stage: "Cutting",               order: 2, enabled: true,  timeoutHours: 8  },
  { stage: "Stitching",             order: 3, enabled: true,  timeoutHours: 12 },
  { stage: "Finishing & Pressing",  order: 4, enabled: true,  timeoutHours: 8  },
  { stage: "Quality Check",         order: 5, enabled: true,  timeoutHours: 6  },
  { stage: "Packing",               order: 6, enabled: true,  timeoutHours: 4  },
  { stage: "Shipped",               order: 7, enabled: false, timeoutHours: 2  },
  { stage: "Delivered",             order: 8, enabled: false, timeoutHours: 2  },
];

const WORKER_ROLES = ["nepal_admin", "employee", "nepal_staff"];

/* ── StageRow ────────────────────────────────────────────── */
function StageRow({ stageDoc, workerPool, onUpdate }) {
  const { stage, enabled, timeoutHours, workerUids = [] } = stageDoc;
  const [savingToggle,   setSavingToggle]   = useState(false);
  const [savingTimeout,  setSavingTimeout]  = useState(false);
  const [savingWorkers,  setSavingWorkers]  = useState(false);
  const [localTimeout,   setLocalTimeout]   = useState(timeoutHours);

  async function handleToggle() {
    setSavingToggle(true);
    const ref = doc(db, "stage_config", stage);
    await setDoc(ref, { enabled: !enabled }, { merge: true });
    onUpdate(stage, { enabled: !enabled });
    setSavingToggle(false);
  }

  async function handleTimeoutBlur() {
    const val = Math.max(2, Math.min(24, Number(localTimeout) || timeoutHours));
    setLocalTimeout(val);
    if (val === timeoutHours) return;
    setSavingTimeout(true);
    const ref = doc(db, "stage_config", stage);
    await setDoc(ref, { timeoutHours: val }, { merge: true });
    onUpdate(stage, { timeoutHours: val });
    setSavingTimeout(false);
  }

  async function handleWorkerToggle(uid) {
    setSavingWorkers(true);
    const isChecked = workerUids.includes(uid);
    const newUids = isChecked
      ? workerUids.filter(id => id !== uid)
      : [...workerUids, uid];
    const newNames = newUids.map(id => workerPool.find(w => w.id === id)?.name || id);
    const ref = doc(db, "stage_config", stage);
    await setDoc(ref, { workerUids: newUids, workerNames: newNames }, { merge: true });
    onUpdate(stage, { workerUids: newUids, workerNames: newNames });
    setSavingWorkers(false);
  }

  return (
    <div className="kpc-stage-row">
      {/* Stage name + enabled toggle */}
      <div className="kpc-stage-hd">
        <div className="kpc-stage-name-wrap">
          <span className={cn("kpc-stage-order", enabled && "kpc-stage-order--on")}>
            {stageDoc.order + 1}
          </span>
          <span className="kpc-stage-name">{stage}</span>
          {/* Telegram badge */}
          <span className="kpc-badge-telegram">Telegram (WhatsApp ready)</span>
        </div>
        <div className="kpc-stage-hd-r">
          {savingToggle
            ? <span className="kadm-saving">…</span>
            : <Toggle checked={enabled} onChange={handleToggle} />
          }
          <span className={cn("kpc-stage-status", enabled ? "kpc-stage-status--on" : "kpc-stage-status--off")}>
            {enabled ? "Auto-dispatch" : "Manual"}
          </span>
        </div>
      </div>

      {/* No-workers warning */}
      {enabled && workerUids.length === 0 && (
        <div className="kpc-warn">
          ⚠ No workers assigned — orders will not be auto-dispatched
        </div>
      )}

      {/* Worker assignment */}
      <div className="kpc-workers-section">
        <div className="kpc-section-label">Assigned workers {savingWorkers && <span className="kadm-saving">…</span>}</div>
        {workerPool.length === 0 ? (
          <span style={{ fontSize: 12, color: "var(--ink-4)" }}>No eligible workers found</span>
        ) : (
          <div className="kpc-worker-list">
            {workerPool.map(w => (
              <label key={w.id} className="kpc-worker-check">
                <input
                  type="checkbox"
                  checked={workerUids.includes(w.id)}
                  onChange={() => handleWorkerToggle(w.id)}
                />
                <Avatar name={w.name} hue={hueFromName(w.name)} size={22} />
                <span className="kpc-worker-name">{w.name}</span>
                <span className="kpc-worker-role">{ROLE_META[w.role]?.label || w.role}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Timeout hours */}
      <div className="kpc-timeout-section">
        <label className="kpc-section-label" htmlFor={`timeout-${stage}`}>
          Alert timeout (hours) {savingTimeout && <span className="kadm-saving">…</span>}
        </label>
        <input
          id={`timeout-${stage}`}
          type="number"
          min={2}
          max={24}
          value={localTimeout}
          onChange={e => setLocalTimeout(e.target.value)}
          onBlur={handleTimeoutBlur}
          className="kpc-timeout-input"
        />
      </div>
    </div>
  );
}

/* ── ProductionChain section ─────────────────────────────── */
function ProductionChain({ users }) {
  const [stages,  setStages]  = useState(null); // null = loading
  const [seeding, setSeeding] = useState(false);

  const workerPool = users.filter(u => WORKER_ROLES.includes(u.role));

  const loadStages = useCallback(async () => {
    const snap = await getDocs(collection(db, "stage_config"));
    if (snap.empty) {
      // Seed defaults
      setSeeding(true);
      for (const s of DISPATCH_STAGES) {
        await setDoc(doc(db, "stage_config", s.stage), {
          stage:        s.stage,
          order:        s.order,
          enabled:      s.enabled,
          timeoutHours: s.timeoutHours,
          workerUids:   [],
          workerNames:  [],
        });
      }
      setSeeding(false);
      // Re-fetch after seeding
      const snap2 = await getDocs(collection(db, "stage_config"));
      const rows = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => a.order - b.order);
      setStages(rows);
    } else {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => a.order - b.order);
      setStages(rows);
    }
  }, []);

  useEffect(() => { loadStages().catch(console.error); }, [loadStages]);

  function handleUpdate(stageName, patch) {
    setStages(prev => prev.map(s => s.stage === stageName ? { ...s, ...patch } : s));
  }

  if (stages === null || seeding) {
    return <div style={{ padding: 24, color: "var(--ink-4)", fontSize: 14 }}>Loading production chain…</div>;
  }

  return (
    <div className="kpc-wrap">
      <div className="kpc-header">
        <div className="kpc-header-title">Production Chain</div>
        <div className="kpc-header-sub">Configure auto-dispatch for each manufacturing stage</div>
      </div>

      {/* Telegram notice */}
      <div className="kpc-notice">
        <span className="kadm-notice-ico">ℹ</span>
        <span>
          Workers need a Telegram ID linked to receive dispatch messages.
          Add <strong>telegramId</strong> to user profiles in Employees.
        </span>
      </div>

      <div className="kpc-stage-list">
        {stages.map(s => (
          <StageRow
            key={s.stage}
            stageDoc={s}
            workerPool={workerPool}
            onUpdate={handleUpdate}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Toggle ────────────────────────────────────────────── */
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      aria-checked={checked}
      role="switch"
      className={cn("kadm-toggle", checked && "kadm-toggle--on", disabled && "kadm-toggle--dis")}
    >
      <span className="kadm-toggle-knob" />
    </button>
  );
}

/* ── Permission row ────────────────────────────────────── */
function PermRow({ label, checked, onChange, disabled, saving }) {
  return (
    <div className={cn("kadm-perm-row", checked && "kadm-perm-row--on")}>
      <div className="kadm-perm-row-l">
        <span className={cn("kadm-perm-dot", checked && "kadm-perm-dot--on")} />
        <span className="kadm-perm-label">{label}</span>
      </div>
      <div className="kadm-perm-row-r">
        <span className={cn("kadm-perm-state", checked ? "kadm-perm-state--edit" : "kadm-perm-state--view")}>
          {checked ? "Edit" : "View"}
        </span>
        {saving
          ? <span className="kadm-saving">…</span>
          : <Toggle checked={checked} onChange={onChange} disabled={disabled} />
        }
      </div>
    </div>
  );
}

/* ── Role pill ─────────────────────────────────────────── */
function RolePill({ role }) {
  const meta = ROLE_META[role] || ROLE_META.employee;
  const colors = {
    amber:   { bg: "#fef9c3", color: "#854d0e" },
    mint:    { bg: "#dcfce7", color: "#166534" },
    blue:    { bg: "#dbeafe", color: "#1d4ed8" },
    neutral: { bg: "#f1f5f9", color: "#475569" },
  }[meta.tone] || {};
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: ".04em",
      padding: "2px 9px", borderRadius: 20,
      background: colors.bg, color: colors.color,
    }}>{meta.label}</span>
  );
}

/* ── Main component ─────────────────────────────────────── */
export default function AdminPanel() {
  const { profile } = useAuth();
  const [users,         setUsers]         = useState([]);
  const [selected,      setSelected]      = useState(null); // user.id
  const [saving,        setSaving]        = useState({});
  const [finOpen,       setFinOpen]       = useState(false);
  const [chainOpen,     setChainOpen]     = useState(false);
  const [telegramEdit,  setTelegramEdit]  = useState(""); // local edit value
  const [savingTg,      setSavingTg]      = useState(false);

  async function loadUsers() {
    const snap = await getDocs(collection(db, "users"));
    const firestoreUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const emailToDoc = new Map(firestoreUsers.map(u => [(u.email || "").toLowerCase(), u]));

    for (const m of TEAM_MEMBERS) {
      const existing = emailToDoc.get(m.email.toLowerCase());
      if (!existing) {
        const stubId = m.email.toLowerCase().replace(/[^a-z0-9]/g, "_");
        const stub = {
          name: m.name, role: m.appRole, jobRole: m.role,
          email: m.email, location: m.location, isStub: true,
          permissions: {}
        };
        await setDoc(doc(db, "users", stubId), stub, { merge: true });
        emailToDoc.set(m.email.toLowerCase(), { id: stubId, ...stub });
      } else {
        if (existing.role !== m.appRole || existing.name !== m.name) {
          await updateDoc(doc(db, "users", existing.id), { role: m.appRole, name: m.name });
          existing.role = m.appRole; existing.name = m.name;
        }
        if (!existing.permissions) {
          await updateDoc(doc(db, "users", existing.id), { permissions: {} });
          existing.permissions = {};
        }
      }
    }

    const freshSnap = await getDocs(collection(db, "users"));
    const rows = freshSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    setUsers(rows);

    // Auto-select first editable user
    const firstEditable = rows.find(u => u.role !== "super_admin");
    if (firstEditable) setSelected(firstEditable.id);
  }

  useEffect(() => { loadUsers().catch(console.error); }, []);

  async function toggle(userId, path, current) {
    const key = userId + path;
    setSaving(s => ({ ...s, [key]: true }));
    await updateDoc(doc(db, "users", userId), { ["permissions." + path]: !current });
    setUsers(prev => prev.map(u => {
      if (u.id !== userId) return u;
      const perms = JSON.parse(JSON.stringify(u.permissions || {}));
      const keys = path.split(".");
      if (keys.length === 1) perms[keys[0]] = !current;
      else { if (!perms[keys[0]]) perms[keys[0]] = {}; perms[keys[0]][keys[1]] = !current; }
      return { ...u, permissions: perms };
    }));
    setSaving(s => { const n = { ...s }; delete n[key]; return n; });
  }

  async function resetToDefault(user) {
    if (!window.confirm(`Reset ${user.name}'s permissions to defaults?`)) return;
    await updateDoc(doc(db, "users", user.id), { permissions: {} });
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, permissions: {} } : u));
  }

  // Sync telegram input when selection changes
  useEffect(() => {
    const u = users.find(u => u.id === selected);
    setTelegramEdit(u?.telegramId != null ? String(u.telegramId) : "");
  }, [selected, users]);

  async function saveTelegramId(userId, value) {
    const parsed = value.trim() === "" ? null : Number(value);
    setSavingTg(true);
    await setDoc(doc(db, "users", userId), { telegramId: parsed ?? null }, { merge: true });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, telegramId: parsed ?? null } : u));
    setSavingTg(false);
  }

  const isAdmin = ["super_admin", "uk_admin"].includes(profile?.role) || ["super_admin", "uk_admin"].includes(profile?.appRole);
  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="kadm-deny">
          <div className="kadm-deny-ico">🔒</div>
          <h2>Access Restricted</h2>
          <p>Only Admins can access this panel.</p>
        </div>
      </AppLayout>
    );
  }

  const selectedUser = users.find(u => u.id === selected);
  const canEdit      = selectedUser && selectedUser.role !== "super_admin";
  const admins       = users.filter(u => ["super_admin", "uk_admin", "nepal_admin"].includes(u.role));
  const staff        = users.filter(u => !["super_admin", "uk_admin", "nepal_admin"].includes(u.role));

  return (
    <AppLayout>
      <div className="kadm-wrap">

        {/* ── Left: User roster ── */}
        <div className="kadm-sidebar">
          <div className="kadm-sidebar-hd">
            <span className="kadm-sidebar-title">Team</span>
            <span className="kadm-sidebar-count">{users.length}</span>
          </div>

          {/* Administrators */}
          {admins.length > 0 && (
            <div className="kadm-section-group">
              <div className="kadm-group-label">Administrators</div>
              {admins.map(u => (
                <button
                  key={u.id}
                  className={cn("kadm-user-row", selected === u.id && "kadm-user-row--active")}
                  onClick={() => setSelected(u.id)}
                >
                  <Avatar name={u.name} hue={hueFromName(u.name)} size={32} />
                  <div className="kadm-user-info">
                    <span className="kadm-user-name">{u.name}</span>
                    <span className="kadm-user-sub">{ROLE_META[u.role]?.label || u.role}</span>
                  </div>
                  {/* Access count badge */}
                  {(() => {
                    const count = SECTIONS.filter(s => sectionCanEdit(u, s.key)).length;
                    return count > 0
                      ? <span className="kadm-user-badge">{count}</span>
                      : null;
                  })()}
                </button>
              ))}
            </div>
          )}

          {/* Staff & Employees */}
          {staff.length > 0 && (
            <div className="kadm-section-group">
              <div className="kadm-group-label">Staff & Employees</div>
              {staff.map(u => (
                <button
                  key={u.id}
                  className={cn("kadm-user-row", selected === u.id && "kadm-user-row--active")}
                  onClick={() => setSelected(u.id)}
                >
                  <Avatar name={u.name} hue={hueFromName(u.name)} size={32} />
                  <div className="kadm-user-info">
                    <span className="kadm-user-name">{u.name}</span>
                    <span className="kadm-user-sub">{ROLE_META[u.role]?.label || u.role}</span>
                  </div>
                  {/* Access count badge */}
                  {(() => {
                    const count = SECTIONS.filter(s => sectionCanEdit(u, s.key)).length;
                    return count > 0
                      ? <span className="kadm-user-badge">{count}</span>
                      : null;
                  })()}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Detail panel ── */}
        <div className="kadm-detail">
          {!selectedUser ? (
            <div className="kadm-empty-state">
              <span style={{ fontSize: 36 }}>👤</span>
              <p>Select a user to view or edit their permissions</p>
            </div>
          ) : (
            <>
              {/* User header */}
              <div className="kadm-detail-hd">
                <div className="kadm-detail-hd-l">
                  <Avatar name={selectedUser.name} hue={hueFromName(selectedUser.name)} size={44} />
                  <div>
                    <div className="kadm-detail-name">{selectedUser.name}</div>
                    <div className="kadm-detail-sub">
                      <RolePill role={selectedUser.role} />
                      {selectedUser.email && (
                        <span style={{ fontSize: 12, color: "var(--ink-4)" }}>{selectedUser.email}</span>
                      )}
                      {selectedUser.jobRole && (
                        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>· {selectedUser.jobRole}</span>
                      )}
                    </div>
                  </div>
                </div>
                {canEdit && (
                  <button className="ghost-button" style={{ fontSize: 12, padding: "5px 12px" }}
                    onClick={() => resetToDefault(selectedUser)}>
                    Reset to defaults
                  </button>
                )}
              </div>

              {/* Fixed-role notice */}
              {!canEdit && (
                <div className="kadm-notice">
                  <span className="kadm-notice-ico">ℹ</span>
                  <span>{ROLE_META[selectedUser.role]?.desc || "Fixed access — not configurable."}</span>
                </div>
              )}

              {/* ── Page access section ── */}
              <div className="kadm-perm-block">
                <div className="kadm-perm-block-hd">
                  <span className="kadm-perm-block-title">Page Edit Access</span>
                  {canEdit && (
                    <span className="kadm-perm-block-note">
                      {SECTIONS.filter(s => sectionCanEdit(selectedUser, s.key)).length} of {SECTIONS.length} enabled
                    </span>
                  )}
                </div>
                <div className="kadm-perm-grid">
                  {SECTIONS.map(sec => {
                    const val  = sectionCanEdit(selectedUser, sec.key);
                    const key  = selectedUser.id + sec.key;
                    return (
                      <PermRow
                        key={sec.key}
                        label={sec.label}
                        checked={val}
                        onChange={() => canEdit && toggle(selectedUser.id, sec.key, val)}
                        disabled={!canEdit || !!saving[key]}
                        saving={!!saving[key]}
                      />
                    );
                  })}
                </div>
              </div>

              {/* ── Finance access (collapsible) ── */}
              <div className="kadm-perm-block">
                <button
                  className="kadm-perm-block-hd kadm-collapsible"
                  onClick={() => setFinOpen(v => !v)}
                >
                  <span className="kadm-perm-block-title">Finance Tab Access</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {canEdit && (
                      <span className="kadm-perm-block-note">
                        {FINANCE_TABS.filter(t => financeTabAllowed(selectedUser, t.key)).length} of {FINANCE_TABS.length} enabled
                      </span>
                    )}
                    <span className={cn("kadm-chevron", finOpen && "kadm-chevron--open")}>▾</span>
                  </div>
                </button>

                {finOpen && (
                  <div className="kadm-perm-grid">
                    {FINANCE_TABS.map(tab => {
                      const val  = financeTabAllowed(selectedUser, tab.key);
                      const path = `finance.${tab.key}`;
                      const key  = selectedUser.id + path;
                      return (
                        <PermRow
                          key={tab.key}
                          label={tab.label}
                          checked={val}
                          onChange={() => canEdit && toggle(selectedUser.id, path, val)}
                          disabled={!canEdit || !!saving[key]}
                          saving={!!saving[key]}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Telegram ID ── */}
              <div className="kadm-perm-block">
                <div className="kadm-perm-block-hd">
                  <span className="kadm-perm-block-title">Dispatch Integration</span>
                </div>
                <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <label
                    htmlFor={`tg-${selectedUser.id}`}
                    style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}
                  >
                    Telegram ID (for dispatch messages)
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      id={`tg-${selectedUser.id}`}
                      type="number"
                      placeholder="e.g. 123456789"
                      value={telegramEdit}
                      onChange={e => setTelegramEdit(e.target.value)}
                      disabled={!canEdit || savingTg}
                      style={{
                        width: 180, padding: "7px 10px",
                        border: "1px solid var(--ink-5)", borderRadius: 6,
                        fontSize: 13, fontFamily: "var(--mono)",
                        background: canEdit ? "#fff" : "var(--bg-2)",
                        color: "var(--ink)",
                        opacity: !canEdit ? 0.6 : 1,
                      }}
                    />
                    {canEdit && (
                      <button
                        onClick={() => saveTelegramId(selectedUser.id, telegramEdit)}
                        disabled={savingTg}
                        style={{
                          padding: "7px 14px", borderRadius: 6,
                          border: "1px solid var(--ink-5)", background: "var(--mint-deep)",
                          color: "#fff", fontSize: 12, fontWeight: 600,
                          cursor: savingTg ? "not-allowed" : "pointer",
                          opacity: savingTg ? 0.6 : 1,
                        }}
                      >
                        {savingTg ? "…" : "Save"}
                      </button>
                    )}
                    {!savingTg && selectedUser.telegramId && (
                      <span style={{ fontSize: 11, color: "var(--mint-deep)", fontWeight: 600 }}>✓ Linked</span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-4)" }}>
                    Numeric Telegram user ID — workers need this to receive auto-dispatch messages.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Production Chain section (full-width below) ── */}
      <div className="kadm-wrap" style={{ marginTop: 0, borderTop: "1px solid var(--bg-2)" }}>
        <div style={{ width: "100%", gridColumn: "1 / -1" }}>
          <button
            className="kadm-perm-block-hd kadm-collapsible"
            style={{
              width: "100%", borderRadius: 0, background: "transparent",
              borderBottom: chainOpen ? "1px solid var(--bg-2)" : "none",
              padding: "14px 20px",
            }}
            onClick={() => setChainOpen(v => !v)}
          >
            <span className="kadm-perm-block-title" style={{ fontSize: 15 }}>Production Chain</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="kadm-perm-block-note">Auto-dispatch stage configuration</span>
              <span className={cn("kadm-chevron", chainOpen && "kadm-chevron--open")}>▾</span>
            </div>
          </button>
          {chainOpen && <ProductionChain users={users} />}
        </div>
      </div>
    </AppLayout>
  );
}

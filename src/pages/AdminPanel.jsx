import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc, setDoc } from "firebase/firestore";
import AppLayout from "../components/AppLayout";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { TEAM_MEMBERS } from "../constants";
import { DEFAULT_NEPAL_ADMIN_PERMISSIONS } from "../utils/permissions";
import { Avatar, cn } from "../components/ui";

/* ── Constants ─────────────────────────────────────────── */
const SECTIONS = [
  { key: "tasks",      label: "Tasks",           icon: "✓" },
  { key: "attendance", label: "Attendance",       icon: "📅" },
  { key: "production", label: "Production",       icon: "⚙" },
  { key: "inventory",  label: "Inventory",        icon: "📦" },
  { key: "qc",         label: "Quality Control",  icon: "🛡" },
  { key: "billing",    label: "Billing",          icon: "📄" },
  { key: "employees",  label: "Employee and HR",        icon: "👥" },
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
  uk_admin:     { label: "UK Admin",     tone: "blue",    desc: "View-only on UK sections" },
  employee:     { label: "Employee",     tone: "neutral", desc: "Own tasks & attendance only" },
};

function hueFromName(name = "") {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return h % 360;
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
  const [users,       setUsers]       = useState([]);
  const [selected,    setSelected]    = useState(null); // user.id
  const [saving,      setSaving]      = useState({});
  const [finOpen,     setFinOpen]     = useState(false);

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
          ...(m.appRole === "nepal_admin" ? { permissions: DEFAULT_NEPAL_ADMIN_PERMISSIONS } : {}),
        };
        await setDoc(doc(db, "users", stubId), stub, { merge: true });
        emailToDoc.set(m.email.toLowerCase(), { id: stubId, ...stub });
      } else {
        if (existing.role !== m.appRole || existing.name !== m.name) {
          await updateDoc(doc(db, "users", existing.id), { role: m.appRole, name: m.name });
          existing.role = m.appRole; existing.name = m.name;
        }
        if (m.appRole === "nepal_admin" && !existing.permissions) {
          await updateDoc(doc(db, "users", existing.id), { permissions: DEFAULT_NEPAL_ADMIN_PERMISSIONS });
          existing.permissions = DEFAULT_NEPAL_ADMIN_PERMISSIONS;
        }
      }
    }

    const freshSnap = await getDocs(collection(db, "users"));
    const rows = freshSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    setUsers(rows);

    // Auto-select first nepal_admin
    const firstEditable = rows.find(u => u.role === "nepal_admin");
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
    await updateDoc(doc(db, "users", user.id), { permissions: DEFAULT_NEPAL_ADMIN_PERMISSIONS });
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, permissions: DEFAULT_NEPAL_ADMIN_PERMISSIONS } : u));
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
  const canEdit      = selectedUser?.role === "nepal_admin";
  const nepals       = users.filter(u => u.role === "nepal_admin");
  const others       = users.filter(u => u.role !== "nepal_admin");

  return (
    <AppLayout>
      <div className="kadm-wrap">

        {/* ── Left: User roster ── */}
        <div className="kadm-sidebar">
          <div className="kadm-sidebar-hd">
            <span className="kadm-sidebar-title">Team</span>
            <span className="kadm-sidebar-count">{users.length}</span>
          </div>

          {/* Nepal admins (editable) */}
          {nepals.length > 0 && (
            <div className="kadm-section-group">
              <div className="kadm-group-label">Nepal Admin</div>
              {nepals.map(u => (
                <button
                  key={u.id}
                  className={cn("kadm-user-row", selected === u.id && "kadm-user-row--active")}
                  onClick={() => setSelected(u.id)}
                >
                  <Avatar name={u.name} hue={hueFromName(u.name)} size={32} />
                  <div className="kadm-user-info">
                    <span className="kadm-user-name">{u.name}</span>
                    <span className="kadm-user-sub">{u.jobRole || "Nepal Admin"}</span>
                  </div>
                  {/* Mini access count */}
                  {(() => {
                    const count = SECTIONS.filter(s => u.permissions?.[s.key]).length;
                    return count > 0
                      ? <span className="kadm-user-badge">{count}</span>
                      : null;
                  })()}
                </button>
              ))}
            </div>
          )}

          {/* Other roles (read-only) */}
          {others.length > 0 && (
            <div className="kadm-section-group">
              <div className="kadm-group-label">Fixed Access</div>
              {others.map(u => (
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
                      {SECTIONS.filter(s => selectedUser.permissions?.[s.key]).length} of {SECTIONS.length} enabled
                    </span>
                  )}
                </div>
                <div className="kadm-perm-grid">
                  {SECTIONS.map(sec => {
                    const val  = canEdit ? (selectedUser.permissions?.[sec.key] === true) : true;
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
                        {FINANCE_TABS.filter(t => selectedUser.permissions?.finance?.[t.key]).length} of {FINANCE_TABS.length} enabled
                      </span>
                    )}
                    <span className={cn("kadm-chevron", finOpen && "kadm-chevron--open")}>▾</span>
                  </div>
                </button>

                {finOpen && (
                  <div className="kadm-perm-grid">
                    {FINANCE_TABS.map(tab => {
                      const val  = canEdit ? (selectedUser.permissions?.finance?.[tab.key] === true) : true;
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
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

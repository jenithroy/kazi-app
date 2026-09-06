import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { deleteRow, fetchAll, insertRow, updateRow } from "../lib/db";
import { authClient, authRedirectUrl, createSignupClient, supabase } from "../supabase";
import PageHeader from "../components/PageHeader";
import SalarySlipModal from "../components/SalarySlipModal";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit, financeTabAllowed } from "../utils/permissions";
import { GBP_RATE, WEEKDAYS, setEmployeeScheduleOverrides } from "../constants";
import { asCurrency, roundAmount } from "../utils/format";
import { scrollAppToTop } from "../utils/scroll";
import { tsMillis } from "../utils/date";

const DEPARTMENTS = ["Management", "Operations", "Production", "Finance", "HR", "Marketing", "IT", "Other"];

// Creates the employee's Supabase account on a throwaway client (so signing
// them up does not replace the admin's own session), links it to their
// people row, then emails them a link to set their own password.
//
// An address that already has an account is not an error — it means they were
// added before, or still sign in through Firebase — so we just send the
// set-password email and let them come across.
async function createEmployeeLogin(email, fullName, personId) {
  const signup = createSignupClient();
  try {
    const { data, error } = await signup.auth.signUp({
      email,
      password: crypto.randomUUID(),
      options: {
        // Without this the account shows up nameless in the Supabase dashboard
        // and in any email template that greets by name. `display_name` is the
        // column the Users list actually reads; `full_name` matches what
        // provision-auth.cjs writes for everyone migrated ahead of this.
        data: { full_name: fullName, display_name: fullName },
        // If the project has "Confirm email" on, signUp also sends its own
        // confirmation email. Point it at the same place the reset link goes so
        // clicking whichever one arrives first still lands on the password form.
        emailRedirectTo: authRedirectUrl("/login"),
      },
    });
    if (error && !/already/i.test(error.message)) throw error;

    if (data?.user?.id && personId) {
      // Straight to the table: auth_uid is deliberately not exposed through
      // the employees view, so updateRow would drop it.
      await supabase.from("people").update({ auth_uid: data.user.id }).eq("id", personId);
    }
  } finally {
    await signup.auth.signOut().catch(() => {});
  }
  await authClient.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectUrl("/login"),
  });
}

const emptyForm = {
  name: "", positionId: "", department: "Operations", email: "", phone: "",
  address: "", panNumber: "", bankAccount: "", bankName: "", bankBranch: "",
  joinDate: new Date().toISOString().slice(0, 10),
  basicSalaryNPR: "", location: "nepal", status: "Active",
  reportsTo: "", isProductionWorker: false,
  scheduleStart: "", scheduleEnd: "",
  scheduleWorkingDays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"],
  scheduleDayOverrides: {}, // { Tue: { start: "09:30", end: "15:30" } }
};

const DEFAULT_WORKING_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

function scheduleSummary(emp) {
  if (!emp.scheduleStart || !emp.scheduleEnd) return null;
  const days = Array.isArray(emp.scheduleWorkingDays) && emp.scheduleWorkingDays.length
    ? emp.scheduleWorkingDays
    : DEFAULT_WORKING_DAYS;
  const offDays = WEEKDAYS.filter(d => !days.includes(d));
  const ovr = emp.scheduleDayOverrides && typeof emp.scheduleDayOverrides === "object"
    ? Object.entries(emp.scheduleDayOverrides).filter(([, v]) => v && (v.start || v.end))
    : [];
  return {
    time: `${emp.scheduleStart}–${emp.scheduleEnd}`,
    off: offDays.length && offDays.length < 7 ? offDays.join(", ") : offDays.length === 7 ? "every day" : "none",
    exceptions: ovr.map(([d, v]) => `${d} ${v.start || emp.scheduleStart}–${v.end || emp.scheduleEnd}`),
  };
}

/* ── Org chart ───────────────────────────────────────── */
const ORG_CSS = `
.korg { overflow-x: auto; padding: 32px 16px; min-height: 300px; }
.korg-tree { display: inline-flex; flex-direction: column; align-items: center; min-width: 100%; }
.korg-roots { display: flex; gap: 0; justify-content: center; }
.korg-level { display: flex; gap: 0; justify-content: center; position: relative; padding-top: 22px; }
.korg-level::before { content: ""; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 2px; height: 22px; background: var(--line); }
.korg-branch { display: flex; flex-direction: column; align-items: center; padding: 0 10px; position: relative; }
.korg-branch::before { content: ""; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 2px; height: 22px; background: var(--line); }
.korg-branch::after { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--line); }
.korg-branch:first-child::after { left: 50%; }
.korg-branch:last-child::after { right: 50%; }
.korg-branch:only-child::before { display: none; }
.korg-branch:only-child::after { display: none; }
.korg-card { background: var(--card); border: 1.5px solid var(--line); border-radius: 12px; padding: 14px 16px; min-width: 148px; max-width: 190px; text-align: center; transition: border-color .15s, box-shadow .15s; }
.korg-card:hover { border-color: var(--mint-deep); box-shadow: 0 0 0 3px var(--mint-soft); }
.korg-card--prod { border-color: var(--mint-deep); background: var(--mint-soft); }
.korg-avatar { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; margin: 0 auto 8px; }
.korg-name { font-weight: 600; font-size: 13px; color: var(--ink); line-height: 1.2; }
.korg-role { font-size: 11px; color: var(--ink-4); margin-top: 3px; }
.korg-tags { display: flex; gap: 4px; justify-content: center; margin-top: 8px; flex-wrap: wrap; }
.korg-tag { font-size: 10px; padding: 2px 7px; border-radius: 99px; font-weight: 500; }
.korg-tag--prod { background: var(--mint-soft); color: var(--mint-deep); }
.korg-tag--uk { background: var(--bg-2); color: var(--ink-3); }
.korg-tag--np { background: var(--bg-2); color: var(--ink-3); }
`;

const HUE_MAP = { Management: 145, Operations: 200, Production: 35, Finance: 260, HR: 310, Marketing: 10, IT: 190, Other: 90 };

function OrgCard({ emp, points }) {
  const hue = HUE_MAP[emp.department] ?? 145;
  const bg = `oklch(0.78 0.08 ${hue})`;
  const fg = `oklch(0.28 0.08 ${hue})`;
  const initials = (emp.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={`korg-card${emp.isProductionWorker ? " korg-card--prod" : ""}`}>
      <div className="korg-avatar" style={{ background: bg, color: fg }}>{initials}</div>
      <div className="korg-name">{emp.name}</div>
      <div className="korg-role">{emp.role}</div>
      <div className="korg-tags">
        {emp.isProductionWorker && <span className="korg-tag korg-tag--prod">⚡ Production</span>}
        <span className={`korg-tag korg-tag--${emp.location === "uk" ? "uk" : "np"}`}>
          {emp.location === "uk" ? "🇬🇧 UK" : "🇳🇵 Nepal"}
        </span>
      </div>
      {points != null && (
        <div style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--mono)", marginTop: 6 }}>
          ⭐ {points} pts
        </div>
      )}
    </div>
  );
}

function OrgNode({ emp, allEmps, pointsMap }) {
  const children = allEmps.filter(e => (e.reportsTo || "").toLowerCase() === emp.name.toLowerCase() && e.status !== "Inactive");
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <OrgCard emp={emp} points={pointsMap[(emp.email || "").toLowerCase()]} />
      {children.length > 0 && (
        <div className="korg-level">
          {children.map(child => (
            <div key={child.id} className="korg-branch">
              <OrgNode emp={child} allEmps={allEmps} pointsMap={pointsMap} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OrgChart({ employees, pointsMap = {} }) {
  const active = employees.filter(e => e.status !== "Inactive");
  const roots = active.filter(e => !e.reportsTo || !active.find(a => a.name.toLowerCase() === e.reportsTo.toLowerCase()));
  const prodCount = active.filter(e => e.isProductionWorker).length;

  return (
    <div>
      <style>{ORG_CSS}</style>
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ padding: "10px 16px", background: "var(--card)", borderRadius: 10, border: "1.5px solid var(--line)", fontSize: 13 }}>
          <span style={{ fontWeight: 600 }}>{active.length}</span> <span style={{ color: "var(--ink-4)" }}>active staff</span>
        </div>
        <div style={{ padding: "10px 16px", background: "var(--mint-soft)", borderRadius: 10, border: "1.5px solid var(--mint-deep)", fontSize: 13, color: "var(--mint-deep)" }}>
          <span style={{ fontWeight: 600 }}>⚡ {prodCount}</span> <span>production workers</span>
        </div>
        {prodCount === 0 && (
          <div style={{ padding: "10px 16px", background: "rgba(230,81,0,0.08)", borderRadius: 10, border: "1.5px solid rgba(230,81,0,0.3)", fontSize: 13, color: "var(--terra)" }}>
            Tag production workers in Directory → labour costs auto-calculate in Finance
          </div>
        )}
      </div>
      <div className="korg">
        <div className="korg-tree">
          <div className="korg-roots" style={{ display: "flex", gap: 32 }}>
            {roots.map(emp => <OrgNode key={emp.id} emp={emp} allEmps={active} pointsMap={pointsMap} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function statusBadge(status) {
  return status === "Active"
    ? <span className="badge-ok">Active</span>
    : <span className="badge-danger">Inactive</span>;
}

function Employees() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const canEdit = sectionCanEdit(profile, "employees");
  const canViewPayroll = financeTabAllowed(profile, "payroll");
  const canEditPayroll = canEdit && canViewPayroll;

  // Arrived from Finance's "Payroll This Month" KPI — land straight on the Payroll tab
  const fromFinance = location.state?.tab === "payroll";
  const [activeTab, setActiveTab] = useState(fromFinance && canViewPayroll ? "payroll" : "directory");

  /* ── Points map: email → totalPoints ── */
  const [pointsMap, setPointsMap] = useState({});

  useEffect(() => {
    async function loadPoints() {
      try {
        const [users, points] = await Promise.all([
          fetchAll("users"),
          fetchAll("user_points"),
        ]);
        const byPerson = {};
        points.forEach(p => { byPerson[p.personId] = p.totalPoints || 0; });
        const map = {};
        users.forEach(u => {
          if (u.email && byPerson[u.personId] != null) {
            map[u.email.toLowerCase()] = byPerson[u.personId];
          }
        });
        setPointsMap(map);
      } catch (err) {
        console.error("loadPoints:", err);
      }
    }
    loadPoints();
  }, []);

  /* ── Salary Slip State ── */
  const [activeSalarySlip, setActiveSalarySlip] = useState(null);

  /* ── Directory State ── */
  const [employees, setEmployees] = useState([]);
  // The position list drives both the dropdown and, through
  // position_permissions, everything the person is allowed to see.
  const [positions, setPositions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");

  /* ── Payroll State ── */
  const [payroll, setPayroll] = useState([]);
  const [payrollForm, setPayrollForm] = useState({
    staffName: "", role: "",
    month: new Date().toLocaleString("default", { month: "long" }),
    year: new Date().getFullYear(),
    basicNPR: "", lateDays: 0, lateSalaryCutDeduction: 0, lateCutsCount: 0, lateAdjustmentNPR: 0, bonusNPR: 0, pfDeductionNPR: 0, note: ""
  });
  const [showPayrollForm, setShowPayrollForm] = useState(false);
  const [editingPayrollId, setEditingPayrollId] = useState(null);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [attWarning, setAttWarning] = useState("");

  useEffect(() => {
    if (!payrollForm.staffName || !payrollForm.month || !payrollForm.year) return;
    
    let active = true;
    const MONTH_MAP = {
      January: "01", February: "02", March: "03", April: "04", May: "05", June: "06",
      July: "07", August: "08", September: "09", October: "10", November: "11", December: "12"
    };

    async function autoCalculate() {
      setLoadingAtt(true);
      try {
        const monthNum = MONTH_MAP[payrollForm.month];
        if (!monthNum) return;
        const monthIdx = Object.keys(MONTH_MAP).indexOf(payrollForm.month);
        const daysInMonth = new Date(Number(payrollForm.year), monthIdx + 1, 0).getDate();
        const start = `${payrollForm.year}-${monthNum}-01`;
        const end = `${payrollForm.year}-${monthNum}-${String(daysInMonth).padStart(2, "0")}`;

        const attRows = await fetchAll("attendance", { filters: [
          { field: "date", op: "gte", value: start },
          { field: "date", op: "lte", value: end },
        ] });

        if (!active) return;

        const logs = attRows
          .filter(r => r.staffName?.toLowerCase() === payrollForm.staffName.toLowerCase());

        const lateDays = logs.filter(r => r.status === "Late").length;
        const lateCutsCount = logs.filter(r => r.status === "Late" && r.lateCutApplied === true).length;

        const basic = Number(payrollForm.basicNPR || 0);
        const dailySalary = basic / 30;
        const cutAmount = Math.round(dailySalary * 0.25 * lateCutsCount);

        if (logs.length === 0 && basic > 0) {
          // No attendance records found — may be a name mismatch
          setAttWarning(`⚠️ No attendance records found for ${payrollForm.staffName} in ${payrollForm.month}. Check that the name matches attendance records exactly.`);
        } else if (logs.length > 0) {
          setAttWarning("");
        }

        setPayrollForm(f => ({
          ...f,
          lateDays,
          lateCutsCount,
          lateSalaryCutDeduction: cutAmount
        }));
      } catch (err) {
        console.error("Error auto-calculating deductions:", err);
      } finally {
        if (active) setLoadingAtt(false);
      }
    }
    
    autoCalculate();
    return () => { active = false; };
  }, [payrollForm.staffName, payrollForm.month, payrollForm.year, payrollForm.basicNPR]);

  async function loadData() {
    const [rows, payRows, positionRows] = await Promise.all([
      fetchAll("employees"),
      canViewPayroll ? fetchAll("finance_payroll") : [],
      fetchAll("positions"),
    ]);

    // The de-duplicate-by-email pass is gone: people.email is a citext column
    // with a unique index, so a second row with the same address cannot be
    // created in the first place. Deleting rows on every page load to repair
    // that was papering over a missing constraint.
    setPositions(positionRows);
    rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    setEmployees(rows);
    setEmployeeScheduleOverrides(rows);

    if (canViewPayroll) {
      const pRows = [...payRows];
      pRows.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
      setPayroll(pRows);
    }
  }

  useEffect(() => { loadData().catch(console.error); }, [canViewPayroll]);

  /* ── Directory Handlers ── */
  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    const data = { ...form, basicSalaryNPR: Number(form.basicSalaryNPR || 0) };
    const isNewEmployee = !editId;
    let personId = editId;
    if (editId) {
      await updateRow("employees", editId, { ...data, updatedBy: profile?.name || "Unknown", updatedAt: new Date().toISOString() });
      setEditId(null);
    } else {
      const created = await insertRow("employees", { ...data, createdBy: profile?.name || "Unknown" });
      personId = created?.id || null;
    }

    // There is no separate user record to keep in step any more. `employees`
    // and `users` were two views of one thing that had to be written twice and
    // could drift apart; both now read the same `people` row, and the position
    // saved above is what grants access.
    if (data.email && isNewEmployee) {
      try {
        await createEmployeeLogin(data.email, data.name, personId);
        alert(`${data.name} was added — a password-setup email was sent to ${data.email}.`);
      } catch (err) {
        console.warn("Failed to auto-create login:", err);
        alert(`${data.name} was saved, but their login email couldn't be sent automatically (${err.message}). You can invite them from the Supabase dashboard under Authentication.`);
      }
    }

    setForm(emptyForm);
    setShowForm(false);
    await loadData();
    setSubmitting(false);
  }

  function startEdit(emp) {
    setForm({ ...emptyForm, ...emp });
    setEditId(emp.id);
    setShowForm(true);
    setActiveTab("directory");
    scrollAppToTop();
  }

  async function toggleStatus(emp) {
    await updateRow("employees", emp.id, { status: emp.status === "Active" ? "Inactive" : "Active" });
    await loadData();
  }

  async function handleDeleteEmployee(emp) {
    if (!window.confirm(`Are you sure you want to delete employee ${emp.name}? They will lose access immediately.`)) return;
    try {
      // One row, one delete. Their permissions went with the position on this
      // record, so there is no second user document left behind to clean up.
      // Their sign-in account is not touched — it simply resolves to nobody,
      // and every policy then denies it.
      await deleteRow("employees", emp.id);
      await loadData();
    } catch (err) {
      console.error("Error deleting employee:", err);
      alert("Failed to delete employee: " + err.message);
    }
  }

  /* ── Payroll Handlers ── */
  function calcPayroll(f) {
    const basic = Number(f.basicNPR || 0);
    const autoLate = Number(f.lateSalaryCutDeduction || 0);
    const adjustment = Number(f.lateAdjustmentNPR || 0);
    const late = Math.max(0, autoLate + adjustment);
    const pf = Number(f.pfDeductionNPR || 0);
    const bonus = Number(f.bonusNPR || 0);
    const gross = basic + bonus;
    const totalDeductions = late + pf;
    const rawNet = gross - totalDeductions;
    const net = Math.max(0, rawNet);
    return { gross, late, autoLate, adjustment, pf, totalDeductions, net, deductionsExceedGross: rawNet < 0 };
  }

  async function handleAddPayroll(e) {
    e.preventDefault();
    if (!canEditPayroll) return;
    const { gross, late, pf, totalDeductions, net } = calcPayroll(payrollForm);
    const data = {
      staffName: payrollForm.staffName, role: payrollForm.role,
      month: payrollForm.month, year: Number(payrollForm.year),
      basicNPR: Number(payrollForm.basicNPR || 0),
      lateDays: Number(payrollForm.lateDays || 0),
      lateSalaryCutDeduction: Number(payrollForm.lateSalaryCutDeduction || 0),
      lateCutsCount: Number(payrollForm.lateCutsCount || 0),
      lateAdjustmentNPR: Number(payrollForm.lateAdjustmentNPR || 0),
      lateDeductionNPR: late,
      pfDeductionNPR: pf, 
      bonusNPR: Number(payrollForm.bonusNPR || 0),
      grossNPR: gross, 
      totalDeductionsNPR: totalDeductions, 
      netNPR: net,
      note: payrollForm.note, 
      loggedBy: profile?.name || "Unknown",
    };
    if (editingPayrollId) {
      await updateRow("finance_payroll", editingPayrollId, data);
      setEditingPayrollId(null);
    } else {
      await insertRow("finance_payroll", data);
    }
    setPayrollForm(f => ({ ...f, staffName: "", role: "", basicNPR: "", lateDays: 0, lateSalaryCutDeduction: 0, lateCutsCount: 0, lateAdjustmentNPR: 0, bonusNPR: 0, pfDeductionNPR: 0, note: "" }));
    setShowPayrollForm(false);
    await loadData();
  }

  async function handleDeletePayroll(id) {
    if (!window.confirm("Delete this payroll record?")) return;
    await deleteRow("finance_payroll", id);
    await loadData();
  }

  const filtered = employees.filter(e =>
    !search || e.name?.toLowerCase().includes(search.toLowerCase()) ||
    e.role?.toLowerCase().includes(search.toLowerCase()) ||
    e.department?.toLowerCase().includes(search.toLowerCase())
  );
  const active = employees.filter(e => e.status === "Active");
  const totalPayroll = active.reduce((s, e) => s + Number(e.basicSalaryNPR || 0), 0);

  return (
    <>
      {fromFinance && (
        <button
          type="button"
          className="ghost-button"
          style={{ alignSelf: "flex-start", marginBottom: 12 }}
          onClick={() => navigate("/finance")}
        >
          ← Back to Finance
        </button>
      )}
      <PageHeader
        title="Employee and HR"
        description="Manage employee profiles, salaries, and payroll runs."
        action={
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="ghost-button"
              style={{ display: "flex", alignItems: "center", gap: 6, borderColor: "var(--mint-deep)", color: "var(--mint-deep)", fontWeight: 600 }}
              onClick={() => setActiveSalarySlip({})}
            >
              <span>🖨️ Salary Slip</span>
            </button>
            {canEdit && activeTab === "directory" && (
              <button className="primary-button" onClick={() => { setShowForm(v => !v); setEditId(null); setForm(emptyForm); }}>
                {showForm && !editId ? "Cancel" : "+ Add Employee"}
              </button>
            )}
          </div>
        }
      />

      <div className="kfin-tabs" style={{ marginBottom: 20 }}>
        <button className={`kfin-tab ${activeTab === "directory" ? "kfin-tab--on" : ""}`} onClick={() => setActiveTab("directory")}>Directory</button>
        <button className={`kfin-tab ${activeTab === "org" ? "kfin-tab--on" : ""}`} onClick={() => setActiveTab("org")}>Org Chart</button>
        {canViewPayroll && (
          <button className={`kfin-tab ${activeTab === "payroll" ? "kfin-tab--on" : ""}`} onClick={() => setActiveTab("payroll")}>Payroll</button>
        )}
      </div>

      {activeTab === "directory" && (
        <>
          <section className="stats-grid">
            <article className="stat-card">
              <p className="stat-title">Total Employees</p>
              <h3 className="stat-value">{employees.length}</h3>
              <p className="stat-note">{active.length} active</p>
            </article>
            <article className="stat-card">
              <p className="stat-title">Nepal Staff</p>
              <h3 className="stat-value">{employees.filter(e => e.location === "nepal").length}</h3>
              <p className="stat-note">local team</p>
            </article>
            <article className="stat-card">
              <p className="stat-title">UK Team</p>
              <h3 className="stat-value">{employees.filter(e => e.location === "uk").length}</h3>
              <p className="stat-note">remote</p>
            </article>
            <article className="stat-card">
              <p className="stat-title">Total Basic Payroll</p>
              <h3 className="stat-value">{asCurrency(totalPayroll, "NPR")}</h3>
              <p className="stat-note">active staff only ({asCurrency(totalPayroll / GBP_RATE, "GBP")})</p>
            </article>
          </section>

          {showForm && (
            <section className="panel">
              <h3>{editId ? "Edit Employee" : "Add Employee"}</h3>
              <form className="grid-form" onSubmit={handleSubmit}>
                <label style={{ gridColumn: "span 2" }}>
                  Full Name
                  <input type="text" value={form.name} required placeholder="Employee full name"
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </label>
                <label>
                  Role / Position
                  <select
                    value={form.positionId}
                    required
                    onChange={e => setForm(f => ({ ...f, positionId: e.target.value }))}
                  >
                    <option value="" disabled>Select a position…</option>
                    {[...positions]
                      .sort((a, b) => (b.tier - a.tier) || a.label.localeCompare(b.label))
                      .map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                  </select>
                  <span className="kfield-hint">
                    Access follows from the position — every page and finance tab
                    this person can open is set by the permission matrix, not per
                    person. Changing it here changes what they can see.
                  </span>
                </label>
                <label>
                  Department
                  <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                    {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </label>
                <label>
                  Email
                  <input type="email" value={form.email} placeholder="email@example.com"
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </label>
                <label>
                  Phone
                  <input type="text" value={form.phone} placeholder="+977-"
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </label>
                <label>
                  Join Date
                  <input type="date" value={form.joinDate}
                    onChange={e => setForm(f => ({ ...f, joinDate: e.target.value }))} />
                </label>
                <label>
                  Basic Salary (NPR) {form.basicSalaryNPR ? <span style={{ fontWeight: 400, color: "var(--ink-4)", fontSize: 11 }}>≈ {asCurrency(Number(form.basicSalaryNPR) / GBP_RATE, "GBP")}</span> : null}
                  <input type="number" min="0" value={form.basicSalaryNPR} placeholder="0"
                    onChange={e => setForm(f => ({ ...f, basicSalaryNPR: e.target.value }))} />
                </label>
                <label>
                  PAN Number
                  <input type="text" value={form.panNumber} placeholder="9-digit PAN"
                    onChange={e => setForm(f => ({ ...f, panNumber: e.target.value }))} />
                </label>
                <label>
                  Bank Name
                  <input type="text" value={form.bankName} placeholder="e.g. Nabil Bank"
                    onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} />
                </label>
                <label>
                  Branch
                  <input type="text" value={form.bankBranch} placeholder="e.g. Thamel"
                    onChange={e => setForm(f => ({ ...f, bankBranch: e.target.value }))} />
                </label>
                <label>
                  Bank Account No.
                  <input type="text" value={form.bankAccount} placeholder="Account number"
                    onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value }))} />
                </label>
                <label style={{ gridColumn: "span 2" }}>
                  Address
                  <input type="text" value={form.address} placeholder="City, District"
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                </label>
                <label>
                  Location
                  <select value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}>
                    <option value="nepal">Nepal</option>
                    <option value="uk">UK</option>
                  </select>
                </label>
                <label>
                  Reports To
                  <select value={form.reportsTo} onChange={e => setForm(f => ({ ...f, reportsTo: e.target.value }))}>
                    <option value="">— No manager —</option>
                    {employees.filter(e => e.name !== form.name).map(e => (
                      <option key={e.id} value={e.name}>{e.name} ({e.role})</option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </label>
                {/* The separate "System Role" dropdown is gone. It set a second,
                    parallel notion of seniority that could disagree with the
                    person's actual job — someone could be an Operations Intern
                    with UK Admin access. Position is now the only input to
                    permissions, so there is one thing to set and one to audit. */}
                <div style={{ gridColumn: "span 2", padding: "14px 16px", background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-4)", marginBottom: 10 }}>
                    Work Schedule
                    <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 8, fontSize: 11 }}>
                      — drives the late-arrival auto-flag in Attendance
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <label style={{ display: "flex", flexDirection: "column", fontSize: 12, fontWeight: 600 }}>
                      Start time
                      <input type="time" value={form.scheduleStart}
                        onChange={e => setForm(f => ({ ...f, scheduleStart: e.target.value }))}
                        style={{ marginTop: 4 }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", fontSize: 12, fontWeight: 600 }}>
                      End time
                      <input type="time" value={form.scheduleEnd}
                        onChange={e => setForm(f => ({ ...f, scheduleEnd: e.target.value }))}
                        style={{ marginTop: 4 }} />
                    </label>
                    <div style={{ display: "flex", flexDirection: "column", fontSize: 12, fontWeight: 600 }}>
                      Working days
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                        {WEEKDAYS.map(d => {
                          const on = (form.scheduleWorkingDays || DEFAULT_WORKING_DAYS).includes(d);
                          return (
                            <button key={d} type="button"
                              onClick={() => setForm(f => {
                                const cur = f.scheduleWorkingDays || DEFAULT_WORKING_DAYS;
                                return { ...f, scheduleWorkingDays: cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d] };
                              })}
                              style={{
                                padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                border: `1.5px solid ${on ? "var(--mint-deep)" : "var(--line)"}`,
                                background: on ? "var(--mint-soft)" : "var(--card)",
                                color: on ? "var(--mint-deep)" : "var(--ink-4)",
                              }}>
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const days = (form.scheduleWorkingDays && form.scheduleWorkingDays.length ? form.scheduleWorkingDays : DEFAULT_WORKING_DAYS);
                    const ovr = form.scheduleDayOverrides && typeof form.scheduleDayOverrides === "object" ? form.scheduleDayOverrides : {};
                    const entries = WEEKDAYS.filter(d => ovr[d]).map(d => [d, ovr[d]]);
                    const setOvr = next => setForm(f => ({ ...f, scheduleDayOverrides: next }));
                    const patchEntry = (day, patch) => setOvr({ ...ovr, [day]: { ...ovr[day], ...patch } });
                    const removeEntry = day => { const n = { ...ovr }; delete n[day]; setOvr(n); };
                    const moveEntry = (from, to) => { const n = { ...ovr }; n[to] = n[from]; delete n[from]; setOvr(n); };
                    const freeDay = WEEKDAYS.filter(d => days.includes(d) && !ovr[d])[0];
                    return (
                      <div style={{ marginTop: 14, borderTop: "1px dashed var(--line)", paddingTop: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>
                          Day exceptions
                          <span style={{ fontWeight: 400, color: "var(--ink-4)", fontSize: 11, marginLeft: 6 }}>— different hours on a specific day (e.g. Anmol on Tuesday)</span>
                        </div>
                        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                          {entries.map(([day, v]) => (
                            <div key={day} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                              <label style={{ display: "flex", flexDirection: "column", fontSize: 11, fontWeight: 600 }}>
                                Day
                                <select value={day} onChange={e => moveEntry(day, e.target.value)} style={{ marginTop: 4 }}>
                                  {WEEKDAYS.filter(d => days.includes(d) && (d === day || !ovr[d])).map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", fontSize: 11, fontWeight: 600 }}>
                                Start
                                <input type="time" value={v.start || ""} onChange={e => patchEntry(day, { start: e.target.value })} style={{ marginTop: 4 }} />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", fontSize: 11, fontWeight: 600 }}>
                                End
                                <input type="time" value={v.end || ""} onChange={e => patchEntry(day, { end: e.target.value })} style={{ marginTop: 4 }} />
                              </label>
                              <button type="button" className="ghost-button"
                                style={{ padding: "4px 10px", fontSize: "0.8rem", color: "var(--terra)", borderColor: "rgba(211,47,47,0.35)" }}
                                onClick={() => removeEntry(day)}>Remove</button>
                            </div>
                          ))}
                          {freeDay ? (
                            <button type="button" className="ghost-button" style={{ padding: "5px 12px", fontSize: "0.82rem", alignSelf: "flex-start" }}
                              onClick={() => patchEntry(freeDay, { start: form.scheduleStart, end: form.scheduleEnd })}>
                              + Add exception
                            </button>
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Every working day already has an exception.</span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <label style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: 12 }}>
                  <input type="checkbox" checked={!!form.isProductionWorker}
                    onChange={e => setForm(f => ({ ...f, isProductionWorker: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: "var(--mint-deep)" }} />
                  <span>
                    <strong>Production worker</strong>
                    <span style={{ color: "var(--ink-4)", fontWeight: 400, marginLeft: 6, fontSize: 12 }}>
                      — includes this person's salary in the auto labour cost calculation for Order P&L
                    </span>
                  </span>
                </label>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                  <button type="submit" className="primary-button" disabled={submitting}>
                    {submitting ? "Saving…" : editId ? "Update Employee" : "Add Employee"}
                  </button>
                  <button type="button" className="ghost-button" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</button>
                </div>
              </form>
            </section>
          )}

          <section className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3>Employee Directory <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>({filtered.length})</span></h3>
              <input
                type="text" placeholder="Search name, role, dept…" value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ padding: "7px 12px", borderRadius: 8, border: "1.5px solid var(--line)", fontSize: "0.85rem", width: 220 }}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Dept</th>
                    <th>Location</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Join Date</th>
                    <th>Basic Salary</th>
                    <th>PAN</th>
                    <th>Bank Details</th>
                    <th>Reports To</th>
                    <th>Schedule</th>
                    <th>Production</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(emp => (
                    <tr key={emp.id}>
                      <td style={{ fontWeight: 600 }}>{emp.name}</td>
                      <td>
                        {/* `role` is the position's label, joined in by the view —
                            the same string the dropdown offers, so what is shown
                            here is exactly what governs their access. */}
                        <div>{emp.role}</div>
                      </td>
                      <td>{emp.department || "—"}</td>
                      <td>
                        <span style={{ textTransform: "capitalize", fontSize: "0.82rem" }}>{emp.location || "nepal"}</span>
                      </td>
                      <td style={{ fontSize: "0.82rem" }}>{emp.email || "—"}</td>
                      <td style={{ fontSize: "0.85rem" }}>{emp.phone || "—"}</td>
                      <td style={{ fontSize: "0.85rem" }}>{emp.joinDate || "—"}</td>
                      <td style={{ fontFamily: "monospace" }}>
                        {emp.basicSalaryNPR ? (
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span>NPR {roundAmount(emp.basicSalaryNPR).toLocaleString()}</span>
                            <span style={{ fontSize: "11px", color: "var(--ink-4)" }}>({asCurrency(emp.basicSalaryNPR / GBP_RATE, "GBP")})</span>
                          </div>
                        ) : "—"}
                      </td>
                      <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{emp.panNumber || "—"}</td>
                      <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                        {emp.bankName ? `${emp.bankName}${emp.bankBranch ? ` (${emp.bankBranch})` : ""}` : (emp.bankAccount ? "Bank Account" : "—")}
                        {emp.bankAccount && <div style={{ fontFamily: "monospace", marginTop: 2 }}>{emp.bankAccount}</div>}
                      </td>
                      <td style={{ fontSize: "0.82rem", color: "var(--ink-4)" }}>{emp.reportsTo || "—"}</td>
                      <td style={{ fontSize: "0.8rem" }}>
                        {(() => {
                          const s = scheduleSummary(emp);
                          return s ? (
                            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
                              <span style={{ fontFamily: "monospace" }}>{s.time}</span>
                              <span style={{ fontSize: "10px", color: "var(--ink-4)" }}>off: {s.off}</span>
                              {s.exceptions.map(x => (
                                <span key={x} style={{ fontSize: "10px", color: "var(--amber-deep)", fontFamily: "monospace" }}>{x}</span>
                              ))}
                            </div>
                          ) : <span style={{ color: "var(--ink-5)" }}>—</span>;
                        })()}
                      </td>
                      <td>{emp.isProductionWorker ? <span style={{ fontSize: 12, color: "var(--mint-deep)", fontWeight: 600 }}>⚡ Yes</span> : <span style={{ fontSize: 12, color: "var(--ink-5)" }}>—</span>}</td>
                      <td>{statusBadge(emp.status)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            className="ghost-button"
                            style={{ padding: "4px 8px", fontSize: "0.82rem", borderColor: "var(--mint-deep)", color: "var(--mint-deep)", fontWeight: 600 }}
                            title="Generate & Print Monthly Salary Slip"
                            onClick={() => setActiveSalarySlip({ empName: emp.name, designation: emp.role, basicSalaryNPR: emp.basicSalaryNPR })}
                          >
                            🖨️ Slip
                          </button>
                          {canEdit && (
                            <>
                              <button className="ghost-button" style={{ padding: "4px 10px", fontSize: "0.82rem" }}
                                onClick={() => startEdit(emp)}>Edit</button>
                              <button className="ghost-button"
                                style={{ padding: "4px 10px", fontSize: "0.82rem", color: emp.status === "Active" ? "var(--warn)" : "var(--ok)", borderColor: emp.status === "Active" ? "rgba(230,81,0,0.35)" : "rgba(46,125,50,0.4)" }}
                                onClick={() => toggleStatus(emp)}>
                                {emp.status === "Active" ? "Deactivate" : "Activate"}
                              </button>
                              <button className="ghost-button"
                                style={{ padding: "4px 10px", fontSize: "0.82rem", color: "var(--terra)", borderColor: "rgba(211,47,47,0.35)" }}
                                onClick={() => handleDeleteEmployee(emp)}>
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activeTab === "org" && (
        <section className="panel">
          <OrgChart employees={employees} pointsMap={pointsMap} />
        </section>
      )}

      {activeTab === "payroll" && canViewPayroll && (
        <>
          {!canEditPayroll && <div style={{ padding: 16, background: "rgba(0,0,0,0.03)", borderRadius: 8, marginBottom: 16 }}>ℹ View only access.</div>}
          {canEditPayroll && (
            <section className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3>{editingPayrollId ? "Edit Payroll Record" : "Payroll Entry"}</h3>
                <button className="ghost-button" onClick={() => {
                  setShowPayrollForm(v => !v);
                  if (showPayrollForm) { setEditingPayrollId(null); setPayrollForm(f => ({ ...f, staffName: "", role: "", basicNPR: "", lateDays: 0, lateSalaryCutDeduction: 0, lateCutsCount: 0, lateAdjustmentNPR: 0, bonusNPR: 0, pfDeductionNPR: 0, note: "" })); }
                }}>
                  {showPayrollForm ? "✕ Cancel" : "+ Add Payroll"}
                </button>
              </div>
              {showPayrollForm && (() => {
                const calc = calcPayroll(payrollForm);
                return (
                  <form className="kfin-form" onSubmit={handleAddPayroll} style={{ background: "transparent", border: "none", padding: 0 }}>
                    <label className="kfin-label">Staff Name
                      <select className="kfin-select" value={payrollForm.staffName}
                        onChange={e => { const emp = employees.find(em => em.name === e.target.value); setPayrollForm(f => ({ ...f, staffName: e.target.value, role: emp?.role || f.role, basicNPR: emp?.basicSalaryNPR || f.basicNPR, lateAdjustmentNPR: 0 })); }} required>
                        <option value="">— Select Staff —</option>
                        {employees.map(em => <option key={em.id} value={em.name}>{em.name}</option>)}
                      </select>
                    </label>
                    <label className="kfin-label">Role
                      <input type="text" className="kfin-input" value={payrollForm.role} required placeholder="e.g. Operations Manager"
                        onChange={e => setPayrollForm(f => ({ ...f, role: e.target.value }))} />
                    </label>
                    <label className="kfin-label">Month
                      <select className="kfin-select" value={payrollForm.month} onChange={e => setPayrollForm(f => ({ ...f, month: e.target.value }))}>
                        {["January","February","March","April","May","June","July","August","September","October","November","December"].map(m => <option key={m}>{m}</option>)}
                      </select>
                    </label>
                    <label className="kfin-label">Year
                      <input type="number" className="kfin-input" value={payrollForm.year} min="2020" max="2099"
                        onChange={e => setPayrollForm(f => ({ ...f, year: e.target.value }))} />
                    </label>
                    <label className="kfin-label">Basic Salary (NPR)
                      <input type="number" min="0" className="kfin-input" value={payrollForm.basicNPR} required placeholder="0"
                        onChange={e => setPayrollForm(f => ({ ...f, basicNPR: e.target.value }))} />
                    </label>
                    <label className="kfin-label">Bonus (NPR)
                      <input type="number" min="0" className="kfin-input" value={payrollForm.bonusNPR} placeholder="0"
                        onChange={e => setPayrollForm(f => ({ ...f, bonusNPR: e.target.value }))} />
                    </label>
                    <div className="kfin-full" style={{ padding: "12px 14px", background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 8, display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-end" }}>
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em" }}>Late deduction</div>
                        <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>Auto-calculated from Attendance</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10.5, color: "var(--ink-4)" }}>Late days</div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{loadingAtt ? "…" : payrollForm.lateDays}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10.5, color: "var(--ink-4)" }}>25% cuts (&ge;15m late)</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: payrollForm.lateCutsCount > 0 ? "var(--terra)" : undefined }}>{loadingAtt ? "…" : payrollForm.lateCutsCount}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10.5, color: "var(--ink-4)" }}>Auto amount (NPR)</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: payrollForm.lateSalaryCutDeduction > 0 ? "var(--terra)" : undefined }}>
                          {loadingAtt ? "…" : `− ${roundAmount(payrollForm.lateSalaryCutDeduction || 0).toLocaleString()}`}
                        </div>
                      </div>
                      <label style={{ fontSize: 10.5, color: "var(--ink-4)", fontWeight: 600 }}>
                        Adjustment (+/− NPR)
                        <input type="number" className="kfin-input" style={{ marginTop: 2, width: 130 }} value={payrollForm.lateAdjustmentNPR}
                          placeholder="0"
                          onChange={e => setPayrollForm(f => ({ ...f, lateAdjustmentNPR: e.target.value }))} />
                      </label>
                      <div>
                        <div style={{ fontSize: 10.5, color: "var(--ink-4)" }}>Final deduction (NPR)</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--terra)" }}>
                          − {roundAmount(Math.max(0, Number(payrollForm.lateSalaryCutDeduction || 0) + Number(payrollForm.lateAdjustmentNPR || 0))).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    {Number(payrollForm.lateAdjustmentNPR || 0) !== 0 && (
                      <div className="kfin-full" style={{ padding: "8px 14px", fontSize: 12, color: "var(--ink-3)" }}>
                        {Number(payrollForm.lateAdjustmentNPR) > 0
                          ? `Adding NPR ${roundAmount(payrollForm.lateAdjustmentNPR).toLocaleString()} on top of the auto-calculated cut.`
                          : `Reducing the auto-calculated cut by NPR ${roundAmount(Math.abs(Number(payrollForm.lateAdjustmentNPR))).toLocaleString()}.`}
                        {" "}Explain why in the Note field below.
                      </div>
                    )}
                    <label className="kfin-label">PF / Other Deduction (NPR)
                      <input type="number" min="0" className="kfin-input" value={payrollForm.pfDeductionNPR} placeholder="0"
                        onChange={e => setPayrollForm(f => ({ ...f, pfDeductionNPR: e.target.value }))} />
                    </label>
                    <label className="kfin-label">Note
                      <input type="text" className="kfin-input" value={payrollForm.note} placeholder="Optional note"
                        onChange={e => setPayrollForm(f => ({ ...f, note: e.target.value }))} />
                    </label>
                    {attWarning && (
                      <div className="kfin-full" style={{ padding: "10px 14px", background: "rgba(255,160,0,0.12)", border: "1.5px solid rgba(255,160,0,0.45)", borderRadius: 8, fontSize: 13, color: "#a06000", fontWeight: 500, marginBottom: 12 }}>
                        {attWarning}
                      </div>
                    )}
                    <div className="kfin-calc kfin-full" style={{ marginBottom: 16 }}>
                      <p className="kfin-calc-title">Salary Calculation</p>
                      <div className="kfin-calc-grid">
                        <span className="kfin-calc-key">Basic Salary</span>
                        <span className="kfin-calc-val">
                          NPR {roundAmount(payrollForm.basicNPR || 0).toLocaleString()}
                          <span style={{ fontSize: "11px", color: "var(--ink-4)", marginLeft: 6 }}>({asCurrency(Number(payrollForm.basicNPR || 0) / GBP_RATE, "GBP")})</span>
                        </span>
                        <span className="kfin-calc-key">Bonus</span>
                        <span className="kfin-calc-val">
                          NPR {roundAmount(payrollForm.bonusNPR || 0).toLocaleString()}
                          <span style={{ fontSize: "11px", color: "var(--ink-4)", marginLeft: 6 }}>({asCurrency(Number(payrollForm.bonusNPR || 0) / GBP_RATE, "GBP")})</span>
                        </span>
                        <span className="kfin-calc-key kfin-calc-bold">Gross Pay</span>
                        <span className="kfin-calc-val kfin-calc-bold">
                          NPR {roundAmount(calc.gross).toLocaleString()}
                          <span style={{ fontSize: "11px", color: "var(--ink-4)", marginLeft: 6, fontWeight: 400 }}>({asCurrency(calc.gross / GBP_RATE, "GBP")})</span>
                        </span>
                        <span className="kfin-calc-key kfin-calc-deduct">
                          Late Deduction ({payrollForm.lateCutsCount} × 25% cuts{calc.adjustment !== 0 ? `, ${calc.adjustment > 0 ? "+" : "−"} NPR ${roundAmount(Math.abs(calc.adjustment)).toLocaleString()} adj.` : ""})
                        </span>
                        <span className="kfin-calc-val kfin-calc-deduct">
                          − NPR {roundAmount(calc.late).toLocaleString()}
                          <span style={{ fontSize: "11px", color: "var(--ink-4)", marginLeft: 6 }}>({asCurrency(calc.late / GBP_RATE, "GBP")})</span>
                        </span>
                        <span className="kfin-calc-key kfin-calc-deduct">PF / Other</span>
                        <span className="kfin-calc-val kfin-calc-deduct">
                          − NPR {roundAmount(calc.pf).toLocaleString()}
                          <span style={{ fontSize: "11px", color: "var(--ink-4)", marginLeft: 6 }}>({asCurrency(calc.pf / GBP_RATE, "GBP")})</span>
                        </span>
                        <span className="kfin-calc-key kfin-calc-total">Net Pay</span>
                        <span className="kfin-calc-val kfin-calc-total">
                          NPR {roundAmount(calc.net).toLocaleString()}
                          <span style={{ fontSize: "11px", color: "var(--mint-deep)", marginLeft: 6, fontWeight: 700 }}>({asCurrency(calc.net / GBP_RATE, "GBP")})</span>
                        </span>
                      </div>
                      {calc.deductionsExceedGross && (
                        <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(255,160,0,0.12)", border: "1.5px solid rgba(255,160,0,0.45)", borderRadius: 8, fontSize: 13, color: "#a06000", fontWeight: 500 }}>
                          ⚠️ Deductions exceed gross salary — net pay has been clamped to NPR 0.
                        </div>
                      )}
                    </div>
                    <button type="submit" className="primary-button">{editingPayrollId ? "Update Payroll" : "Save Payroll"}</button>
                  </form>
                );
              })()}
            </section>
          )}

          <section className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3>Payroll Records <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>({payroll.length})</span></h3>
            </div>
            <div className="table-wrap kfin-tbl-wrap" style={{ border: "none", margin: 0 }}>
              <table className="kfin-tbl">
                <thead>
                  <tr><th>Staff</th><th>Role</th><th>Month</th><th>Year</th><th>Basic</th><th>Bonus</th><th>Late Days</th><th>Late Ded.</th><th>PF/Other</th><th>Gross</th><th>Net NPR</th><th>Net GBP</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {payroll.map(item => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 500 }}>{item.staffName}</td>
                      <td>{item.role}</td>
                      <td>{item.month}</td>
                      <td>{item.year}</td>
                      <td>
                        {item.basicNPR ? (
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span>NPR {roundAmount(item.basicNPR).toLocaleString()}</span>
                            <span style={{ fontSize: "10px", color: "var(--ink-4)" }}>({asCurrency(item.basicNPR / GBP_RATE, "GBP")})</span>
                          </div>
                        ) : "—"}
                      </td>
                      <td>
                        {item.bonusNPR ? (
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span>NPR {roundAmount(item.bonusNPR).toLocaleString()}</span>
                            <span style={{ fontSize: "10px", color: "var(--ink-4)" }}>({asCurrency(item.bonusNPR / GBP_RATE, "GBP")})</span>
                          </div>
                        ) : "—"}
                      </td>
                      <td>{item.lateDays ?? "—"}</td>
                      <td style={{ color: item.lateDeductionNPR ? "var(--terra)" : undefined }}>
                        {item.lateDeductionNPR ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontWeight: 600 }}>− NPR {roundAmount(item.lateDeductionNPR).toLocaleString()}</span>
                            <span style={{ fontSize: "10px", color: "var(--ink-4)" }}>({asCurrency(item.lateDeductionNPR / GBP_RATE, "GBP")})</span>
                            {item.lateCutsCount > 0 && (
                              <span style={{ fontSize: "10px", color: "var(--ink-4)", fontStyle: "italic" }}>
                                ({item.lateCutsCount} × 25% cuts)
                              </span>
                            )}
                            {item.lateAdjustmentNPR ? (
                              <span style={{ fontSize: "10px", color: "var(--amber-deep)", fontStyle: "italic" }}>
                                (manually {item.lateAdjustmentNPR > 0 ? "+" : "−"}NPR {roundAmount(Math.abs(item.lateAdjustmentNPR)).toLocaleString()})
                              </span>
                            ) : null}
                          </div>
                        ) : "—"}
                      </td>
                      <td style={{ color: item.pfDeductionNPR ? "var(--terra)" : undefined }}>
                        {item.pfDeductionNPR ? (
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span>− NPR {roundAmount(item.pfDeductionNPR).toLocaleString()}</span>
                            <span style={{ fontSize: "10px", color: "var(--ink-4)" }}>({asCurrency(item.pfDeductionNPR / GBP_RATE, "GBP")})</span>
                          </div>
                        ) : "—"}
                      </td>
                      <td>
                        {item.grossNPR ? (
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span>NPR {roundAmount(item.grossNPR).toLocaleString()}</span>
                            <span style={{ fontSize: "10px", color: "var(--ink-4)" }}>({asCurrency(item.grossNPR / GBP_RATE, "GBP")})</span>
                          </div>
                        ) : "—"}
                      </td>
                      <td style={{ fontWeight: 600, color: "var(--mint-deep)" }}>{asCurrency(item.netNPR || 0, "NPR")}</td>
                      <td style={{ color: "var(--ink-3)" }}>{asCurrency((item.netNPR || 0) / GBP_RATE, "GBP")}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="kbil-tbl-btn kbil-tbl-btn--primary"
                            title="Print Salary Slip"
                            onClick={() => setActiveSalarySlip({
                              empName: item.staffName,
                              designation: item.role,
                              month: item.month,
                              year: item.year,
                              basicNPR: item.basicNPR,
                              bonusNPR: item.bonusNPR,
                              lateDeductionNPR: item.lateDeductionNPR,
                              pfDeductionNPR: item.pfDeductionNPR
                            })}
                          >
                            🖨️ Slip
                          </button>
                          {canEditPayroll && (
                            <>
                              <button className="kbil-tbl-btn kbil-tbl-btn--primary"
                                onClick={() => {
                                  setEditingPayrollId(item.id);
                                  setPayrollForm({
                                    staffName: item.staffName || "",
                                    role: item.role || "",
                                    month: item.month || "",
                                    year: item.year || new Date().getFullYear(),
                                    basicNPR: item.basicNPR || "",
                                    lateDays: item.lateDays || 0,
                                    lateSalaryCutDeduction: item.lateSalaryCutDeduction || 0,
                                    lateCutsCount: item.lateCutsCount || 0,
                                    lateAdjustmentNPR: item.lateAdjustmentNPR || 0,
                                    bonusNPR: item.bonusNPR || 0,
                                    pfDeductionNPR: item.pfDeductionNPR || 0,
                                    note: item.note || "",
                                  });
                                  setShowPayrollForm(true);
                                  scrollAppToTop();
                                }}>
                                Edit
                              </button>
                              <button className="kbil-tbl-btn kbil-tbl-btn--danger"
                                onClick={() => handleDeletePayroll(item.id)}>
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}


      {/* Salary Slip Modal */}
      {activeSalarySlip !== null && (
        <SalarySlipModal
          initialData={activeSalarySlip}
          employees={employees}
          onClose={() => setActiveSalarySlip(null)}
        />
      )}
    </>
  );
}

export default Employees;

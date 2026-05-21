import { useEffect, useState } from "react";
import {
  addDoc, collection, getDocs, serverTimestamp, doc, updateDoc, deleteDoc, writeBatch
} from "firebase/firestore";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit, financeTabAllowed } from "../utils/permissions";
import { TEAM_MEMBERS, GBP_RATE } from "../constants";
import { asCurrency } from "../utils/format";

const DEPARTMENTS = ["Management", "Operations", "Production", "Finance", "HR", "Marketing", "IT", "Other"];

const emptyForm = {
  name: "", role: "", department: "Operations", email: "", phone: "",
  address: "", panNumber: "", bankAccount: "", bankName: "", bankBranch: "",
  joinDate: new Date().toISOString().slice(0, 10),
  basicSalaryNPR: "", location: "nepal", status: "Active"
};

function statusBadge(status) {
  return status === "Active"
    ? <span className="badge-ok">Active</span>
    : <span className="badge-danger">Inactive</span>;
}

function Employees() {
  const { profile } = useAuth();
  const canEdit = sectionCanEdit(profile, "employees");
  const canViewPayroll = financeTabAllowed(profile, "payroll");
  const canEditPayroll = canEdit && canViewPayroll;

  const [activeTab, setActiveTab] = useState("directory");

  /* ── Directory State ── */
  const [employees, setEmployees] = useState([]);
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
    basicNPR: "", lateDays: 0, lateRateNPR: 500, lateSalaryCutDeduction: 0, lateCutsCount: 0, bonusNPR: 0, pfDeductionNPR: 0, note: ""
  });
  const [showPayrollForm, setShowPayrollForm] = useState(false);
  const [editingPayrollId, setEditingPayrollId] = useState(null);
  const [loadingAtt, setLoadingAtt] = useState(false);

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

        const attSnap = await getDocs(query(
          collection(db, "attendance"),
          where("date", ">=", start),
          where("date", "<=", end)
        ));

        if (!active) return;

        const logs = attSnap.docs
          .map(d => d.data())
          .filter(r => r.staffName?.toLowerCase() === payrollForm.staffName.toLowerCase());

        const lateDays = logs.filter(r => r.status === "Late").length;
        const lateCutsCount = logs.filter(r => r.status === "Late" && r.lateCutApplied === true).length;
        
        const basic = Number(payrollForm.basicNPR || 0);
        const dailySalary = basic / 30;
        const cutAmount = Math.round(dailySalary * 0.25 * lateCutsCount);

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
    const [empSnap, paySnap] = await Promise.all([
      getDocs(collection(db, "employees")),
      canViewPayroll ? getDocs(collection(db, "finance_payroll")) : { docs: [] }
    ]);

    let rows = empSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const validEmails = new Set(TEAM_MEMBERS.map(m => m.email.toLowerCase()));
    const batch = writeBatch(db);
    let batchHasOps = false;

    // Group by email — keep first, delete duplicates and stale old entries
    const seen = new Map();
    for (const row of rows) {
      const email = (row.email || "").toLowerCase();
      if (!validEmails.has(email)) {
        batch.delete(doc(db, "employees", row.id));
        batchHasOps = true;
      } else if (seen.has(email)) {
        batch.delete(doc(db, "employees", row.id));
        batchHasOps = true;
      } else {
        seen.set(email, row);
      }
    }

    if (batchHasOps) await batch.commit();

    const seedBatch = writeBatch(db);
    let seedHasOps = false;
    for (const m of TEAM_MEMBERS) {
      if (!seen.has(m.email.toLowerCase())) {
        const ref = doc(collection(db, "employees"));
        seedBatch.set(ref, {
          name: m.name, role: m.role, department: "Operations",
          email: m.email, phone: "", address: "", panNumber: "",
          bankAccount: "", bankName: "", bankBranch: "", joinDate: new Date().toISOString().slice(0, 10),
          basicSalaryNPR: 0, location: m.location, status: "Active",
          createdAt: serverTimestamp()
        });
        seedHasOps = true;
      }
    }
    if (seedHasOps) await seedBatch.commit();

    const freshSnap = await getDocs(collection(db, "employees"));
    rows = freshSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    setEmployees(rows);

    if (canViewPayroll) {
      const pRows = paySnap.docs.map(d => ({ id: d.id, ...d.data() }));
      pRows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPayroll(pRows);
    }
  }

  useEffect(() => { loadData().catch(console.error); }, [canViewPayroll]);

  /* ── Directory Handlers ── */
  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    const data = { ...form, basicSalaryNPR: Number(form.basicSalaryNPR || 0) };
    if (editId) {
      await updateDoc(doc(db, "employees", editId), { ...data, updatedBy: profile?.name || "Unknown", updatedAt: serverTimestamp() });
      setEditId(null);
    } else {
      await addDoc(collection(db, "employees"), { ...data, createdBy: profile?.name || "Unknown", createdAt: serverTimestamp() });
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleStatus(emp) {
    await updateDoc(doc(db, "employees", emp.id), { status: emp.status === "Active" ? "Inactive" : "Active" });
    await loadData();
  }

  /* ── Payroll Handlers ── */
  function calcPayroll(f) {
    const basic = Number(f.basicNPR || 0);
    const lateFee = Number(f.lateDays || 0) * Number(f.lateRateNPR || 0);
    const lateCut = Number(f.lateSalaryCutDeduction || 0);
    const late = lateFee + lateCut;
    const pf = Number(f.pfDeductionNPR || 0);
    const bonus = Number(f.bonusNPR || 0);
    const gross = basic + bonus;
    const totalDeductions = late + pf;
    return { gross, late, pf, totalDeductions, net: gross - totalDeductions };
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
      lateRateNPR: Number(payrollForm.lateRateNPR || 0), 
      lateSalaryCutDeduction: Number(payrollForm.lateSalaryCutDeduction || 0),
      lateCutsCount: Number(payrollForm.lateCutsCount || 0),
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
      await updateDoc(doc(db, "finance_payroll", editingPayrollId), data);
      setEditingPayrollId(null);
    } else {
      await addDoc(collection(db, "finance_payroll"), { ...data, createdAt: serverTimestamp() });
    }
    setPayrollForm(f => ({ ...f, staffName: "", role: "", basicNPR: "", lateDays: 0, lateSalaryCutDeduction: 0, lateCutsCount: 0, bonusNPR: 0, pfDeductionNPR: 0, note: "" }));
    setShowPayrollForm(false);
    await loadData();
  }

  async function handleDeletePayroll(id) {
    if (!window.confirm("Delete this payroll record?")) return;
    await deleteDoc(doc(db, "finance_payroll", id));
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
    <AppLayout>
      <PageHeader
        title="Employee and HR"
        description="Manage employee profiles, salaries, and payroll runs."
        action={canEdit && activeTab === "directory" ? (
          <button className="primary-button" onClick={() => { setShowForm(v => !v); setEditId(null); setForm(emptyForm); }}>
            {showForm && !editId ? "Cancel" : "+ Add Employee"}
          </button>
        ) : null}
      />

      {canViewPayroll && (
        <div className="kfin-tabs" style={{ marginBottom: 20 }}>
          <button className={`kfin-tab ${activeTab === "directory" ? "kfin-tab--on" : ""}`} onClick={() => setActiveTab("directory")}>Directory</button>
          <button className={`kfin-tab ${activeTab === "payroll" ? "kfin-tab--on" : ""}`} onClick={() => setActiveTab("payroll")}>Payroll</button>
        </div>
      )}

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
              <p className="stat-note">active staff only</p>
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
                  <input type="text" value={form.role} required placeholder="e.g. Operations Manager"
                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
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
                  Basic Salary (NPR)
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
                  Status
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
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
                    <th>Status</th>
                    {canEdit && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(emp => (
                    <tr key={emp.id}>
                      <td style={{ fontWeight: 600 }}>{emp.name}</td>
                      <td>{emp.role}</td>
                      <td>{emp.department || "—"}</td>
                      <td>
                        <span style={{ textTransform: "capitalize", fontSize: "0.82rem" }}>{emp.location || "nepal"}</span>
                      </td>
                      <td style={{ fontSize: "0.82rem" }}>{emp.email || "—"}</td>
                      <td style={{ fontSize: "0.85rem" }}>{emp.phone || "—"}</td>
                      <td style={{ fontSize: "0.85rem" }}>{emp.joinDate || "—"}</td>
                      <td style={{ fontFamily: "monospace" }}>
                        {emp.basicSalaryNPR ? `NPR ${Number(emp.basicSalaryNPR).toLocaleString()}` : "—"}
                      </td>
                      <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{emp.panNumber || "—"}</td>
                      <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                        {emp.bankName ? `${emp.bankName}${emp.bankBranch ? ` (${emp.bankBranch})` : ""}` : (emp.bankAccount ? "Bank Account" : "—")}
                        {emp.bankAccount && <div style={{ fontFamily: "monospace", marginTop: 2 }}>{emp.bankAccount}</div>}
                      </td>
                      <td>{statusBadge(emp.status)}</td>
                      {canEdit && (
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="ghost-button" style={{ padding: "4px 10px", fontSize: "0.82rem" }}
                              onClick={() => startEdit(emp)}>Edit</button>
                            <button className="ghost-button"
                              style={{ padding: "4px 10px", fontSize: "0.82rem", color: emp.status === "Active" ? "var(--warn)" : "var(--ok)", borderColor: emp.status === "Active" ? "rgba(230,81,0,0.35)" : "rgba(46,125,50,0.4)" }}
                              onClick={() => toggleStatus(emp)}>
                              {emp.status === "Active" ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
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
                  if (showPayrollForm) { setEditingPayrollId(null); setPayrollForm(f => ({ ...f, staffName: "", role: "", basicNPR: "", lateDays: 0, bonusNPR: 0, pfDeductionNPR: 0, note: "" })); }
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
                        onChange={e => { const emp = employees.find(em => em.name === e.target.value); setPayrollForm(f => ({ ...f, staffName: e.target.value, role: emp?.role || f.role, basicNPR: emp?.basicSalaryNPR || f.basicNPR })); }} required>
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
                    <label className="kfin-label">Late Days
                      <input type="number" min="0" max="31" className="kfin-input" value={payrollForm.lateDays} placeholder="0"
                        onChange={e => setPayrollForm(f => ({ ...f, lateDays: e.target.value }))} />
                    </label>
                    <label className="kfin-label">Late Fee / Day (NPR)
                      <input type="number" min="0" className="kfin-input" value={payrollForm.lateRateNPR} placeholder="500"
                        onChange={e => setPayrollForm(f => ({ ...f, lateRateNPR: e.target.value }))} />
                    </label>
                    <label className="kfin-label">Late Cuts (&gt;10m)
                      <input type="number" min="0" max="31" className="kfin-input" value={payrollForm.lateCutsCount} placeholder="0"
                        onChange={e => {
                          const cuts = Number(e.target.value || 0);
                          const basic = Number(payrollForm.basicNPR || 0);
                          setPayrollForm(f => ({ 
                            ...f, 
                            lateCutsCount: cuts,
                            lateSalaryCutDeduction: Math.round((basic / 30) * 0.25 * cuts)
                          }));
                        }} />
                    </label>
                    <label className="kfin-label">Late Salary Cut Deduction (NPR)
                      <input type="number" min="0" className="kfin-input" value={payrollForm.lateSalaryCutDeduction} placeholder="0"
                        onChange={e => setPayrollForm(f => ({ ...f, lateSalaryCutDeduction: e.target.value }))} />
                    </label>
                    <label className="kfin-label">PF / Other Deduction (NPR)
                      <input type="number" min="0" className="kfin-input" value={payrollForm.pfDeductionNPR} placeholder="0"
                        onChange={e => setPayrollForm(f => ({ ...f, pfDeductionNPR: e.target.value }))} />
                    </label>
                    <label className="kfin-label">Note
                      <input type="text" className="kfin-input" value={payrollForm.note} placeholder="Optional note"
                        onChange={e => setPayrollForm(f => ({ ...f, note: e.target.value }))} />
                    </label>
                    <div className="kfin-calc kfin-full" style={{ marginBottom: 16 }}>
                      <p className="kfin-calc-title">Salary Calculation</p>
                      <div className="kfin-calc-grid">
                        <span className="kfin-calc-key">Basic Salary</span>
                        <span className="kfin-calc-val">NPR {Number(payrollForm.basicNPR || 0).toLocaleString()}</span>
                        <span className="kfin-calc-key">Bonus</span>
                        <span className="kfin-calc-val">NPR {Number(payrollForm.bonusNPR || 0).toLocaleString()}</span>
                        <span className="kfin-calc-key kfin-calc-bold">Gross Pay</span>
                        <span className="kfin-calc-val kfin-calc-bold">NPR {calc.gross.toLocaleString()}</span>
                        <span className="kfin-calc-key kfin-calc-deduct">Flat Late Fee ({payrollForm.lateDays} × {payrollForm.lateRateNPR})</span>
                        <span className="kfin-calc-val kfin-calc-deduct">− NPR {Math.round(payrollForm.lateDays * payrollForm.lateRateNPR).toLocaleString()}</span>
                        <span className="kfin-calc-key kfin-calc-deduct">25% Salary Cuts ({payrollForm.lateCutsCount} cuts)</span>
                        <span className="kfin-calc-val kfin-calc-deduct">− NPR {Number(payrollForm.lateSalaryCutDeduction || 0).toLocaleString()}</span>
                        <span className="kfin-calc-key kfin-calc-bold">Total Late Deduction</span>
                        <span className="kfin-calc-val kfin-calc-bold">− NPR {calc.late.toLocaleString()}</span>
                        <span className="kfin-calc-key kfin-calc-deduct">PF / Other</span>
                        <span className="kfin-calc-val kfin-calc-deduct">− NPR {calc.pf.toLocaleString()}</span>
                        <span className="kfin-calc-key kfin-calc-total">Net Pay</span>
                        <span className="kfin-calc-val kfin-calc-total">NPR {calc.net.toLocaleString()}</span>
                      </div>
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
                  <tr><th>Staff</th><th>Role</th><th>Month</th><th>Year</th><th>Basic</th><th>Bonus</th><th>Late Days</th><th>Late Ded.</th><th>PF/Other</th><th>Gross</th><th>Net NPR</th><th>Net GBP</th>{canEditPayroll && <th></th>}</tr>
                </thead>
                <tbody>
                  {payroll.map(item => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 500 }}>{item.staffName}</td>
                      <td>{item.role}</td>
                      <td>{item.month}</td>
                      <td>{item.year}</td>
                      <td>{item.basicNPR ? `NPR ${Number(item.basicNPR).toLocaleString()}` : "—"}</td>
                      <td>{item.bonusNPR ? `NPR ${Number(item.bonusNPR).toLocaleString()}` : "—"}</td>
                      <td>{item.lateDays ?? "—"}</td>
                      <td style={{ color: item.lateDeductionNPR ? "var(--terra)" : undefined }}>
                        {item.lateDeductionNPR ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontWeight: 600 }}>− NPR {Number(item.lateDeductionNPR).toLocaleString()}</span>
                            {item.lateSalaryCutDeduction > 0 && (
                              <span style={{ fontSize: "10px", color: "var(--ink-3)", fontStyle: "italic" }}>
                                (incl. {item.lateCutsCount || 0} cuts: −NPR {Number(item.lateSalaryCutDeduction).toLocaleString()})
                              </span>
                            )}
                          </div>
                        ) : "—"}
                      </td>
                      <td style={{ color: item.pfDeductionNPR ? "var(--terra)" : undefined }}>{item.pfDeductionNPR ? `− NPR ${Number(item.pfDeductionNPR).toLocaleString()}` : "—"}</td>
                      <td>{item.grossNPR ? `NPR ${Number(item.grossNPR).toLocaleString()}` : "—"}</td>
                      <td style={{ fontWeight: 600, color: "var(--mint-deep)" }}>{asCurrency(item.netNPR || 0, "NPR")}</td>
                      <td style={{ color: "var(--ink-3)" }}>{asCurrency((item.netNPR || 0) / GBP_RATE, "GBP")}</td>
                      {canEditPayroll && (
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
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
                                  lateRateNPR: item.lateRateNPR || 500,
                                  lateSalaryCutDeduction: item.lateSalaryCutDeduction || 0,
                                  lateCutsCount: item.lateCutsCount || 0,
                                  bonusNPR: item.bonusNPR || 0,
                                  pfDeductionNPR: item.pfDeductionNPR || 0,
                                  note: item.note || "",
                                });
                                setShowPayrollForm(true);
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}>
                              Edit
                            </button>
                            <button className="kbil-tbl-btn kbil-tbl-btn--danger"
                              onClick={() => handleDeletePayroll(item.id)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AppLayout>
  );
}

export default Employees;

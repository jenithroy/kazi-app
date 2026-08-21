import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  addDoc, collection, getDocs, serverTimestamp, doc, updateDoc, deleteDoc, writeBatch,
  query, where, setDoc
} from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import PageHeader from "../components/PageHeader";
import SalarySlipModal from "../components/SalarySlipModal";
import { db, auth, firebaseConfig } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit, financeTabAllowed } from "../utils/permissions";
import { GBP_RATE } from "../constants";
import { asCurrency, roundAmount } from "../utils/format";
import { scrollAppToTop } from "../utils/scroll";

const DEPARTMENTS = ["Management", "Operations", "Production", "Finance", "HR", "Marketing", "IT", "Other"];

// Creates the employee's Firebase Auth account on a throwaway secondary app instance
// (so signing them up doesn't kick the admin out of their own session), then emails
// them a link to set their own password.
async function createEmployeeLogin(email) {
  const secondaryApp = initializeApp(firebaseConfig, `employee-signup-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const tempPassword = crypto.randomUUID();
    await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
    await sendPasswordResetEmail(secondaryAuth, email);
    await signOut(secondaryAuth);
  } catch (err) {
    if (err.code === "auth/email-already-in-use") {
      await sendPasswordResetEmail(auth, email);
    } else {
      throw err;
    }
  } finally {
    await deleteApp(secondaryApp);
  }
}

const emptyForm = {
  name: "", role: "", department: "Operations", email: "", phone: "",
  address: "", panNumber: "", bankAccount: "", bankName: "", bankBranch: "",
  joinDate: new Date().toISOString().slice(0, 10),
  basicSalaryNPR: "", location: "nepal", status: "Active",
  reportsTo: "", isProductionWorker: false,
  appRole: "employee",
};

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
        const [usersSnap, pointsSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "user_points")),
        ]);
        // uid → totalPoints
        const uidToPoints = {};
        pointsSnap.docs.forEach(d => { uidToPoints[d.id] = d.data().totalPoints || 0; });
        // email (lowercased) → totalPoints via uid
        const map = {};
        usersSnap.docs.forEach(d => {
          const { email, uid } = d.data();
          const id = uid || d.id;
          if (email && uidToPoints[id] != null) {
            map[email.toLowerCase()] = uidToPoints[id];
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
    const [empSnap, paySnap] = await Promise.all([
      getDocs(collection(db, "employees")),
      canViewPayroll ? getDocs(collection(db, "finance_payroll")) : { docs: [] }
    ]);

    let rows = empSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const batch = writeBatch(db);
    let batchHasOps = false;

    // Group by email — keep first, delete duplicates
    const seen = new Map();
    for (const row of rows) {
      const email = (row.email || "").toLowerCase();
      if (email) {
        if (seen.has(email)) {
          batch.delete(doc(db, "employees", row.id));
          batchHasOps = true;
        } else {
          seen.set(email, row);
        }
      }
    }

    if (batchHasOps) {
      await batch.commit();
      const freshSnap = await getDocs(collection(db, "employees"));
      rows = freshSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
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
    const isNewEmployee = !editId;
    if (editId) {
      await updateDoc(doc(db, "employees", editId), { ...data, updatedBy: profile?.name || "Unknown", updatedAt: serverTimestamp() });
      setEditId(null);
    } else {
      await addDoc(collection(db, "employees"), { ...data, createdBy: profile?.name || "Unknown", createdAt: serverTimestamp() });
    }

    // Sync user profile stub in users collection
    if (data.email) {
      try {
        const userQuery = query(collection(db, "users"), where("email", "==", data.email.toLowerCase()));
        const userSnap = await getDocs(userQuery);
        if (!userSnap.empty) {
          const userDocRef = doc(db, "users", userSnap.docs[0].id);
          await updateDoc(userDocRef, {
            name: data.name,
            role: data.appRole || "employee",
            jobRole: data.role,
            location: data.location,
          });
        } else {
          const stubId = data.email.toLowerCase().replace(/[^a-z0-9]/g, "_");
          await setDoc(doc(db, "users", stubId), {
            name: data.name,
            role: data.appRole || "employee",
            jobRole: data.role,
            email: data.email,
            location: data.location,
            isStub: true,
            permissions: {}
          }, { merge: true });
        }
      } catch (err) {
        console.warn("Failed to sync user profile stub:", err);
      }

      if (isNewEmployee) {
        try {
          await createEmployeeLogin(data.email);
          alert(`${data.name} was added — a password-setup email was sent to ${data.email}.`);
        } catch (err) {
          console.warn("Failed to auto-create login:", err);
          alert(`${data.name} was saved, but their login email couldn't be sent automatically (${err.message}). You can add them manually in Firebase Authentication.`);
        }
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
    await updateDoc(doc(db, "employees", emp.id), { status: emp.status === "Active" ? "Inactive" : "Active" });
    await loadData();
  }

  async function handleDeleteEmployee(emp) {
    if (!window.confirm(`Are you sure you want to delete employee ${emp.name}? This will also delete their system permissions/user record.`)) return;
    try {
      await deleteDoc(doc(db, "employees", emp.id));
      if (emp.email) {
        const userQuery = query(collection(db, "users"), where("email", "==", emp.email.toLowerCase()));
        const userSnap = await getDocs(userQuery);
        if (!userSnap.empty) {
          for (const d of userSnap.docs) {
            await deleteDoc(doc(db, "users", d.id));
          }
        }
      }
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
      await updateDoc(doc(db, "finance_payroll", editingPayrollId), data);
      setEditingPayrollId(null);
    } else {
      await addDoc(collection(db, "finance_payroll"), { ...data, createdAt: serverTimestamp() });
    }
    setPayrollForm(f => ({ ...f, staffName: "", role: "", basicNPR: "", lateDays: 0, lateSalaryCutDeduction: 0, lateCutsCount: 0, lateAdjustmentNPR: 0, bonusNPR: 0, pfDeductionNPR: 0, note: "" }));
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
                <label>
                  System Role
                  <select value={form.appRole || "employee"} onChange={e => setForm(f => ({ ...f, appRole: e.target.value }))}>
                    <option value="employee">Employee (Read-Only)</option>
                    <option value="nepal_staff">Nepal Staff (Stitchers/Workers)</option>
                    <option value="nepal_admin">Nepal Admin (Factory Ops)</option>
                    <option value="uk_admin">UK Admin (Director)</option>
                  </select>
                </label>
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
                        <div>{emp.role}</div>
                        {emp.appRole && (
                          <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: 4, background: "var(--bg-2)", color: "var(--ink-3)", fontWeight: 600, display: "inline-block", marginTop: 4 }}>
                            {emp.appRole === "nepal_admin" ? "Nepal Admin" : emp.appRole === "uk_admin" ? "UK Admin" : emp.appRole === "nepal_staff" ? "Nepal Staff" : "Employee"}
                          </span>
                        )}
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
                        <div style={{ fontSize: 10.5, color: "var(--ink-4)" }}>25% cuts (&gt;10m late)</div>
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

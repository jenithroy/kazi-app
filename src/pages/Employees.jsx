import { useEffect, useState } from "react";
import {
  addDoc, collection, getDocs, serverTimestamp, doc, updateDoc, deleteDoc, writeBatch
} from "firebase/firestore";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import { TEAM_MEMBERS } from "../constants";
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

  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");

  async function loadData() {
    const snap = await getDocs(collection(db, "employees"));
    let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const validEmails = new Set(TEAM_MEMBERS.map(m => m.email.toLowerCase()));
    const batch = writeBatch(db);
    let batchHasOps = false;

    // Group by email — keep first, delete duplicates and stale old entries
    const seen = new Map();
    for (const row of rows) {
      const email = (row.email || "").toLowerCase();
      if (!validEmails.has(email)) {
        // Not in current team — delete (old seed data)
        batch.delete(doc(db, "employees", row.id));
        batchHasOps = true;
      } else if (seen.has(email)) {
        // Duplicate — delete the extra
        batch.delete(doc(db, "employees", row.id));
        batchHasOps = true;
      } else {
        seen.set(email, row);
      }
    }

    if (batchHasOps) await batch.commit();

    // Seed any TEAM_MEMBERS not yet in Firestore
    const seedBatch = writeBatch(db);
    let seedHasOps = false;
    for (const m of TEAM_MEMBERS) {
      if (!seen.has(m.email.toLowerCase())) {
        const ref = doc(collection(db, "employees"));
        seedBatch.set(ref, {
          name: m.name, role: m.role, department: "Operations",
          email: m.email, phone: "", address: "", panNumber: "",
          bankAccount: "", joinDate: new Date().toISOString().slice(0, 10),
          basicSalaryNPR: 0, location: m.location, status: "Active",
          createdAt: serverTimestamp()
        });
        seedHasOps = true;
      }
    }
    if (seedHasOps) await seedBatch.commit();

    // Final clean load
    const freshSnap = await getDocs(collection(db, "employees"));
    rows = freshSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    setEmployees(rows);
  }

  useEffect(() => { loadData().catch(console.error); }, []);

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
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleStatus(emp) {
    await updateDoc(doc(db, "employees", emp.id), { status: emp.status === "Active" ? "Inactive" : "Active" });
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
        title="Employees"
        description="Manage employee profiles, salaries, PAN and bank details."
        action={canEdit && (
          <button className="primary-button" onClick={() => { setShowForm(v => !v); setEditId(null); setForm(emptyForm); }}>
            {showForm && !editId ? "Cancel" : "+ Add Employee"}
          </button>
        )}
      />

      {/* Stats */}
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

      {/* Form */}
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

      {/* Directory */}
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
    </AppLayout>
  );
}

export default Employees;

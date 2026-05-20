import { useEffect, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, getDocs,
  orderBy, query, serverTimestamp, updateDoc,
} from "firebase/firestore";
import AppLayout from "../components/AppLayout";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { Icons } from "../components/ui";

const EMPTY = {
  name: "", country: "UK", city: "", address: "",
  contactPerson: "", email: "", phone: "", notes: "",
};

const inp = {
  border: "1px solid var(--line-strong)", borderRadius: 7, padding: "7px 10px",
  fontSize: 13, fontFamily: "var(--font)", outline: "none", width: "100%",
  background: "var(--bg)",
};

function CustomerForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>
          Customer name *
          <input style={inp} value={form.name} onChange={set("name")} placeholder="e.g. Next plc" autoFocus />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>
          Country
          <input style={inp} value={form.country} onChange={set("country")} placeholder="UK" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>
          City
          <input style={inp} value={form.city} onChange={set("city")} placeholder="London" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>
          Contact person
          <input style={inp} value={form.contactPerson} onChange={set("contactPerson")} placeholder="Jane Smith" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>
          Email
          <input style={inp} type="email" value={form.email} onChange={set("email")} placeholder="jane@example.com" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>
          Phone
          <input style={inp} value={form.phone} onChange={set("phone")} placeholder="+44 20 7946 0958" />
        </label>
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>
        Address
        <input style={inp} value={form.address} onChange={set("address")} placeholder="123 High Street, London, W1A 1AA" />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>
        Notes
        <textarea style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} rows={2} value={form.notes} onChange={set("notes")} placeholder="Any additional notes…" />
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
        <button className="ghost-button" onClick={onCancel}>Cancel</button>
        <button
          className="primary-button"
          onClick={() => form.name.trim() && onSave(form)}
          style={{ opacity: form.name.trim() ? 1 : .5 }}
        >
          Save customer
        </button>
      </div>
    </div>
  );
}

function CustomerRow({ customer, canEdit, onEdit, onDelete }) {
  const initials = customer.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  let hue = 0;
  for (const c of customer.name) hue = (hue * 31 + c.charCodeAt(0)) % 360;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "40px 1fr 1fr 1fr 1fr auto",
      alignItems: "center",
      gap: 12,
      padding: "12px 16px",
      borderBottom: "1px solid var(--line)",
      fontSize: 13,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: `oklch(88% .06 ${hue})`, color: `oklch(35% .12 ${hue})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 800, flexShrink: 0,
      }}>{initials}</div>

      <div>
        <div style={{ fontWeight: 600, color: "var(--ink)" }}>{customer.name}</div>
        {customer.city && <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 1 }}>{customer.city}{customer.country ? `, ${customer.country}` : ""}</div>}
      </div>

      <div style={{ color: "var(--ink-2)" }}>{customer.contactPerson || <span style={{ color: "var(--ink-5)" }}>—</span>}</div>

      <div>
        {customer.email
          ? <a href={`mailto:${customer.email}`} style={{ color: "var(--mint-deep)", textDecoration: "none", fontSize: 12 }}>{customer.email}</a>
          : <span style={{ color: "var(--ink-5)" }}>—</span>}
      </div>

      <div style={{ color: "var(--ink-3)", fontSize: 12 }}>{customer.phone || <span style={{ color: "var(--ink-5)" }}>—</span>}</div>

      {canEdit ? (
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => onEdit(customer)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", padding: "4px 6px", borderRadius: 6, fontSize: 13 }}
            title="Edit">
            <Icons.Settings size={14} />
          </button>
          <button onClick={() => onDelete(customer.id)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-5)", padding: "4px 6px", borderRadius: 6, fontSize: 13 }}
            title="Delete">
            <Icons.X size={14} />
          </button>
        </div>
      ) : <span />}
    </div>
  );
}

function Customers() {
  const { profile } = useAuth();
  const role = profile?.appRole || profile?.role;
  const canEdit = role === "super_admin" || role === "nepal_admin" || role === "uk_admin";

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState(null);

  async function load() {
    const snap = await getDocs(query(collection(db, "customers"), orderBy("name")));
    setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  function openNew() { setEditing(null); setShowForm(true); }
  function openEdit(c) { setEditing(c); setShowForm(true); }

  async function handleSave(form) {
    if (editing) {
      await updateDoc(doc(db, "customers", editing.id), form);
    } else {
      await addDoc(collection(db, "customers"), { ...form, createdAt: serverTimestamp() });
    }
    setShowForm(false);
    setEditing(null);
    await load();
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this customer?")) return;
    try {
      await deleteDoc(doc(db, "customers", id));
      setCustomers(c => c.filter(x => x.id !== id));
    } catch {
      alert("Could not delete — check Firestore rules.");
    }
  }

  return (
    <AppLayout>
      <div className="kscr fade-in" style={{ padding: "4px 0 0" }}>

        <div className="kph" style={{ padding: "8px 0 20px" }}>
          <div>
            <h2>Customers</h2>
            <p>{customers.length} client{customers.length !== 1 ? "s" : ""}</p>
          </div>
          {canEdit && (
            <div className="kph-a">
              <button className="primary-button" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={openNew}>
                <Icons.Plus size={13} sw={2.2} /> Add customer
              </button>
            </div>
          )}
        </div>

        {/* Add / edit form */}
        {showForm && (
          <>
            <div style={{ position: "fixed", inset: 0, background: "rgba(10,28,20,.4)", backdropFilter: "blur(3px)", zIndex: 50 }} onClick={() => setShowForm(false)} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 51, background: "#fff", borderRadius: 14, padding: 28, width: "min(580px, 94vw)", boxShadow: "var(--shadow-pop)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{editing ? "Edit customer" : "New customer"}</h3>
                <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--ink-4)" }}>×</button>
              </div>
              <CustomerForm
                initial={editing || undefined}
                onSave={handleSave}
                onCancel={() => setShowForm(false)}
              />
            </div>
          </>
        )}

        {/* Table */}
        <div style={{ background: "var(--bg-2)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)" }}>
          {/* Column headers */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "40px 1fr 1fr 1fr 1fr auto",
            gap: 12, padding: "9px 16px",
            background: "var(--bg-3)",
            borderBottom: "1px solid var(--line-strong)",
            fontSize: 11, fontWeight: 700, color: "var(--ink-4)",
            textTransform: "uppercase", letterSpacing: ".05em",
          }}>
            <span />
            <span>Customer</span>
            <span>Contact</span>
            <span>Email</span>
            <span>Phone</span>
            <span />
          </div>

          {loading ? (
            <p style={{ padding: "32px 16px", color: "var(--ink-4)" }}>Loading…</p>
          ) : customers.length === 0 ? (
            <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--ink-4)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🏢</div>
              <div style={{ fontWeight: 600 }}>No customers yet</div>
              {canEdit && <div style={{ fontSize: 13, marginTop: 4 }}>Click "Add customer" to get started.</div>}
            </div>
          ) : (
            customers.map(c => (
              <CustomerRow key={c.id} customer={c} canEdit={canEdit} onEdit={openEdit} onDelete={handleDelete} />
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default Customers;

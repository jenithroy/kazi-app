/**
 * The product costing (COGS) table: too wide for a tile and with no page of its
 * own, so it opens from the Dashboard's header as a pop-up.
 */
import { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import { deleteRow, fetchAll, upsertRow } from "../../lib/db";
import { useCurrency } from "../../context/CurrencyContext";
import { PRODUCT_COSTS } from "../../constants/productCosts";

/* ── Product costing (COGS) ─────────────────────────────── */

const EMPTY_PRODUCT = { code: "", name: "", fabric: "", rib: "", trims: "", labour: "", others: "" };
const COST_COLS = ["fabric", "rib", "trims", "labour", "others"];

export function ProductCostsModal({ canEdit, onClose }) {
  const { money, currency } = useCurrency();
  // Costs are stored in NPR; this prints one in whichever currency the header is set to.
  const cost = (n) => (n != null && n !== "" && !isNaN(n)) ? money(n) : "—";
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null); // doc id being edited, or "new"
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [saving, setSaving] = useState(false);

  // Load from the database; seed from constants if empty
  useEffect(() => {
    async function load() {
      // product_costs is keyed by `code`, not a generated id.
      const rows = await fetchAll("product_costs");
      if (rows.length === 0) {
        // First load — seed from constants
        await Promise.all(PRODUCT_COSTS.map((p) =>
          upsertRow("product_costs", { ...p, updatedAt: new Date().toISOString() }, ["code"])));
        setProducts(PRODUCT_COSTS.map((p) => ({ id: p.code, ...p })));
      } else {
        setProducts([...rows].sort((a, b) => a.code.localeCompare(b.code)));
      }
      setLoading(false);
    }
    load().catch((e) => { console.error(e); setLoading(false); });
  }, []);

  const computedTotal = (f) => COST_COLS.map((c) => Number(f[c]) || 0).reduce((s, v) => s + v, 0);

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim()) return;
    setSaving(true);
    const total = computedTotal(form);
    const data = { ...form, total, updatedAt: new Date().toISOString() };
    COST_COLS.forEach((c) => { data[c] = Number(data[c]) || 0; });
    await upsertRow("product_costs", { ...data, code: form.code.trim() }, ["code"]);
    setProducts((prev) => {
      const exists = prev.find((p) => p.id === form.code.trim());
      const updated = { id: form.code.trim(), ...data };
      return exists
        ? prev.map((p) => p.id === form.code.trim() ? updated : p)
        : [...prev, updated].sort((a, b) => a.code.localeCompare(b.code));
    });
    setEditId(null);
    setForm(EMPTY_PRODUCT);
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm(`Delete ${id}?`)) return;
    await deleteRow("product_costs", id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  const inp = { border: "1px solid var(--line-strong)", borderRadius: 5, padding: "3px 6px", fontSize: 12, fontFamily: "var(--font)", background: "#fff", width: "100%" };

  const editRow = (key) => (
    <tr key={key} style={{ background: "var(--mint-soft)" }}>
      <td><input style={inp} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="kazi100x" /></td>
      <td><input style={{ ...inp, width: 160 }} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Product name" /></td>
      {COST_COLS.map((c) => (
        <td key={c}><input style={{ ...inp, textAlign: "right", width: 60 }} type="number" value={form[c]} onChange={(e) => setForm((f) => ({ ...f, [c]: e.target.value }))} /></td>
      ))}
      <td style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-3)" }}>{cost(computedTotal(form))}</td>
      <td style={{ whiteSpace: "nowrap" }}>
        <button type="button" style={{ ...inp, width: "auto", background: "var(--mint-deep)", color: "#fff", border: "none", cursor: "pointer", marginRight: 4 }} onClick={handleSave} disabled={saving}>{saving ? "…" : "Save"}</button>
        <button type="button" aria-label="Cancel" style={{ ...inp, width: "auto", cursor: "pointer" }} onClick={() => setEditId(null)}>Cancel</button>
      </td>
    </tr>
  );

  return (
    <Modal
      title="Product costing (COGS)"
      subtitle="Per-unit cost breakdown · editable by admins"
      size="xl"
      onClose={onClose}
      footer={
        <>
          <span style={{ marginRight: "auto", fontSize: 12, color: "var(--ink-3)" }}>
            All values in {currency} · Total is worked out from the components
            {editId ? " · type costs in NPR" : ""}
          </span>
          {canEdit && editId !== "new" && (
            <button type="button" className="ghost-button" onClick={() => { setForm(EMPTY_PRODUCT); setEditId("new"); }}>
              + Add product
            </button>
          )}
        </>
      }
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Item</th>
              <th style={{ textAlign: "right" }}>Fabric</th>
              <th style={{ textAlign: "right" }}>Rib</th>
              <th style={{ textAlign: "right" }}>Trims</th>
              <th style={{ textAlign: "right" }}>Labour</th>
              <th style={{ textAlign: "right" }}>Others</th>
              <th style={{ textAlign: "right", fontWeight: 700 }}>Total</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canEdit ? 9 : 8} style={{ padding: "16px 8px" }}><div className="kskel kskel-row" /></td></tr>
            ) : products.map((p) => (
              editId === p.id ? editRow(p.id) : (
                <tr key={p.id}>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-3)" }}>#{p.code}</td>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  {COST_COLS.map((c) => (
                    <td key={c} style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 13 }}>{cost(p[c])}</td>
                  ))}
                  <td style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700 }}>{cost(p.total)}</td>
                  {canEdit && (
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button type="button" style={{ ...inp, width: "auto", cursor: "pointer", marginRight: 4, fontSize: 11 }} onClick={() => { setForm({ ...p }); setEditId(p.id); }}>Edit</button>
                      <button type="button" aria-label={`Delete ${p.code}`} style={{ ...inp, width: "auto", cursor: "pointer", fontSize: 11, color: "var(--terra)" }} onClick={() => handleDelete(p.id)}>Delete</button>
                    </td>
                  )}
                </tr>
              )
            ))}
            {editId === "new" && editRow("new")}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

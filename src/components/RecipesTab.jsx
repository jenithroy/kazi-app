import { useEffect, useRef, useState } from "react";
import { deleteRow, fetchAll, insertRow, updateRow } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import StockItemSelect from "./StockItemSelect";
import { DEFAULT_WASTAGE_PCT, LINE_KINDS, LINE_UNITS, emptyRecipeLine } from "../utils/productionConsumption";

const kindLabel = (kind) => LINE_KINDS.find(k => k.value === kind)?.label || "Other";
const fmtNum = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 3 });
const hint = { fontSize: 12, color: "var(--ink-4)", margin: 0 };

let lineSeq = 0;
const withKey = (line) => ({ ...emptyRecipeLine(), ...line, qty: line.qty ?? "", qtyLarge: line.qtyLarge ?? "", _k: ++lineSeq });

function summarise(recipe) {
  const lines = recipe.lines || [];
  if (!lines.length) return "No materials yet";
  return lines.map(l => `${l.label || kindLabel(l.kind)} ${fmtNum(l.qty)} ${l.unit}`).join(" · ");
}

function friendlyError(err) {
  const msg = err?.message || String(err);
  if (/product_recipes_name_key|duplicate key/i.test(msg)) return "A recipe with that name already exists.";
  if (/row-level security|permission denied/i.test(msg)) return "You don't have permission to change recipes.";
  return `Could not save: ${msg}`;
}

function RecipeEditor({ recipe, items, onClose, onSaved }) {
  const { profile } = useAuth();
  const [name, setName] = useState(recipe?.name || "");
  const [wastage, setWastage] = useState(String(recipe?.wastagePct ?? DEFAULT_WASTAGE_PCT));
  const [notes, setNotes] = useState(recipe?.notes || "");
  const [lines, setLines] = useState(() =>
    recipe?.lines?.length ? recipe.lines.map(withKey) : [withKey({})]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setLine = (key, patch) => setLines(prev => prev.map(l => (l._k === key ? { ...l, ...patch } : l)));

  async function save() {
    setError("");
    const trimmed = name.trim();
    if (!trimmed) { setError("Give the recipe a name — use the same product name as on orders."); return; }
    const wastagePct = Number(wastage);
    if (!Number.isFinite(wastagePct) || wastagePct < 0 || wastagePct > 100) {
      setError("Wastage must be a number from 0 to 100."); return;
    }

    const cleaned = [];
    for (const l of lines) {
      const itemName = items.find(i => i.id === l.itemId)?.item || "";
      const blank = !String(l.label).trim() && l.qty === "" && !l.itemId;
      if (blank) continue;
      const label = String(l.label).trim() || itemName || kindLabel(l.kind);
      const qty = Number(l.qty);
      if (!Number.isFinite(qty) || qty <= 0) { setError(`Enter how much ${label} one piece uses.`); return; }
      const large = l.qtyLarge === "" ? null : Number(l.qtyLarge);
      if (large !== null && (!Number.isFinite(large) || large < 0)) {
        setError(`The XXL-and-above amount for ${label} must be a number, or left blank.`); return;
      }
      cleaned.push({ kind: l.kind, label, itemId: l.itemId || null, qty, qtyLarge: large, unit: l.unit });
    }
    if (!cleaned.length) { setError("Add at least one material."); return; }

    setSaving(true);
    try {
      const payload = { name: trimmed, wastagePct, lines: cleaned, notes: notes.trim() || null };
      if (recipe) await updateRow("recipes", recipe.id, { ...payload, updatedAt: new Date().toISOString() });
      else await insertRow("recipes", { ...payload, createdBy: profile?.name || "Unknown" });
      onSaved();
    } catch (err) {
      setError(friendlyError(err));
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete the recipe for “${recipe.name}”? Past deductions are not affected.`)) return;
    setSaving(true);
    try {
      await deleteRow("recipes", recipe.id);
      onSaved();
    } catch (err) {
      setError(friendlyError(err));
      setSaving(false);
    }
  }

  return (
    <div className="kbrf-overlay" onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="kbrf-modal" style={{ maxWidth: 820 }} role="dialog" aria-modal="true" aria-label="Recipe">
        <div className="kbrf-modal-hd">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{recipe ? "Edit recipe" : "New recipe"}</div>
            <div style={{ fontSize: 12, color: "var(--ink-4)", fontWeight: 400, marginTop: 2 }}>
              What ONE piece of this product uses.
            </div>
          </div>
          <button className="kbrf-modal-close" onClick={onClose} disabled={saving} aria-label="Close">✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <label className="kfin-label" style={{ gridColumn: "1 / -1" }}>
              Product name
              <input className="kfin-input" value={name} placeholder="e.g. Oversized Tee — same name as on orders"
                onChange={e => setName(e.target.value)} />
            </label>
            <label className="kfin-label">
              Fabric wastage (%)
              <input className="kfin-input" type="number" min="0" max="100" step="any" value={wastage}
                onChange={e => setWastage(e.target.value)} />
            </label>
          </div>
          <p style={hint}>
            Wastage is added on top of every fabric line (cutting waste and defects). Thread, trims and packaging are used as written.
          </p>

          {lines.map(l => (
            <div key={l._k} style={{
              border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px",
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select className="kfin-select" style={{ width: "auto" }} value={l.kind} aria-label="Kind of material"
                  onChange={e => setLine(l._k, { kind: e.target.value })}>
                  {LINE_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
                <input className="kfin-input" value={l.label} placeholder="Name, e.g. Main fabric, Rib, Black thread, Poly bag"
                  onChange={e => setLine(l._k, { label: e.target.value })} />
                <button className="kbrf-modal-close" title="Remove this material" aria-label="Remove this material"
                  onClick={() => setLines(prev => prev.filter(x => x._k !== l._k))} disabled={saving}>✕</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                <label className="kfin-label" style={{ gridColumn: "1 / -1" }}>
                  Usual stock item {l.kind === "fabric" ? "(leave empty — colour is chosen per order)" : "(optional)"}
                  <StockItemSelect items={items} kind={l.kind} value={l.itemId || ""}
                    onChange={id => setLine(l._k, { itemId: id || null })} placeholder="Chosen when deducting" />
                </label>
                <label className="kfin-label">
                  Per piece, S to XL
                  <input className="kfin-input" type="number" min="0" step="any" value={l.qty}
                    onChange={e => setLine(l._k, { qty: e.target.value })} />
                </label>
                <label className="kfin-label">
                  Per piece, XXL and above
                  <input className="kfin-input" type="number" min="0" step="any" value={l.qtyLarge} placeholder="Same"
                    onChange={e => setLine(l._k, { qtyLarge: e.target.value })} />
                </label>
                <label className="kfin-label">
                  Unit
                  <select className="kfin-select" value={l.unit} onChange={e => setLine(l._k, { unit: e.target.value })}>
                    {LINE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </label>
              </div>
            </div>
          ))}

          <div>
            <button className="ghost-button" style={{ fontSize: 13 }} onClick={() => setLines(prev => [...prev, withKey({})])} disabled={saving}>
              + Add material
            </button>
          </div>

          <label className="kfin-label">
            Notes (optional)
            <textarea className="kfin-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </label>

          {error && <div role="alert" style={{ fontSize: 13, color: "var(--terra)" }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              {recipe && (
                <button className="ghost-button" style={{ color: "var(--danger)", borderColor: "rgba(220,38,38,0.4)" }}
                  onClick={remove} disabled={saving}>Delete recipe</button>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ghost-button" onClick={onClose} disabled={saving}>Cancel</button>
              <button className="primary-button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save recipe"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The Recipes tab: for each product, what one piece uses. Production reads these
 * to pre-fill the materials-used confirmation when an order comes out of QC.
 */
export default function RecipesTab({ items, canEdit, newRecipeRequest = 0 }) {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(null); // recipe object, or {} for new

  // "+ New Recipe" lives in the page header like every other tab's action, so it
  // asks for the editor by bumping a counter. Only a change from the value seen
  // at mount opens it, so re-opening the tab never pops the editor by itself.
  const lastRequest = useRef(newRecipeRequest);
  useEffect(() => {
    if (newRecipeRequest === lastRequest.current) return;
    lastRequest.current = newRecipeRequest;
    if (canEdit) setEditing({});
  }, [newRecipeRequest]);

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const rows = await fetchAll("recipes");
      setRecipes([...rows].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    } catch (err) {
      setLoadError(err?.message || "Could not load recipes.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ ...hint, maxWidth: 620 }}>
        A recipe says how much of each material one piece of a product uses. Pick it when you create an order; when that
        order comes out of Quality Check, Production asks which materials it used, pre-filled from the recipe, and takes
        them out of stock.
      </p>

      {loading && <p style={hint}>Loading recipes…</p>}
      {!loading && loadError && (
        <p style={{ fontSize: 13, color: "var(--terra)" }}>
          Recipes couldn't be loaded: {loadError}. If this is a new feature, the database update
          0039_product_recipes.sql needs to be applied first.
        </p>
      )}
      {!loading && !loadError && recipes.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
          No recipes yet.{canEdit ? " Add one for each product you make." : ""}
        </p>
      )}

      {!loading && !loadError && recipes.length > 0 && (
        <div className="kinv-table-wrap">
          <table className="kinv-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Materials per piece (S to XL)</th>
                <th>Wastage</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recipes.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td>{summarise(r)}</td>
                  <td>{fmtNum(r.wastagePct ?? DEFAULT_WASTAGE_PCT)}%</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="ghost-button" style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => setEditing(r)}>
                      {canEdit ? "Edit" : "View"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        canEdit ? (
          <RecipeEditor
            recipe={editing.id ? editing : null}
            items={items}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); load(); }}
          />
        ) : (
          <div className="kbrf-overlay" onClick={() => setEditing(null)}>
            <div className="kbrf-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
              <div className="kbrf-modal-hd">
                <div style={{ fontSize: 16, fontWeight: 700 }}>{editing.name}</div>
                <button className="kbrf-modal-close" onClick={() => setEditing(null)} aria-label="Close">✕</button>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--ink-2)", display: "flex", flexDirection: "column", gap: 4 }}>
                {(editing.lines || []).map((l, i) => (
                  <li key={i}>
                    {l.label || kindLabel(l.kind)}: {fmtNum(l.qty)} {l.unit}
                    {l.qtyLarge !== null && l.qtyLarge !== undefined ? ` (XXL and above: ${fmtNum(l.qtyLarge)} ${l.unit})` : ""}
                  </li>
                ))}
              </ul>
              <p style={{ ...hint, marginTop: 10 }}>Fabric wastage: {fmtNum(editing.wastagePct ?? DEFAULT_WASTAGE_PCT)}%</p>
            </div>
          </div>
        )
      )}
    </div>
  );
}

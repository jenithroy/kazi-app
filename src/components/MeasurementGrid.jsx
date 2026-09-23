import { useState } from "react";
import { resolveSpecSizeKey } from "../utils/techPackMaterials";

/* ── The measurement table: one row per point, one column per size ──
 *
 * The old grid held a single "Inch" figure, which is what the PRINTED spec
 * sheet shows and must keep showing. That sheet is a compliance artefact, so
 * rather than replace `inch`, the per-size numbers sit alongside it and the
 * column matching the sheet's own Size field is copied into it — the printout
 * is unchanged, and the extra sizes are there for grading and for working out
 * how much fabric each size actually needs.
 *
 * Numbers are typed from measuring the real garment. Templates only supply the
 * list of point NAMES ("Chest", "Length", "Sleeve"), never values or positions:
 * a name is the part worth not retyping, a measurement is the part that must be
 * taken fresh every time.
 */
export default function MeasurementGrid({
  measurements, onChange, sizes, specSize,
  templates = [], onSaveTemplate, canSaveTemplate = true,
}) {
  const [templateName, setTemplateName] = useState("");
  const [saving, setSaving] = useState(false);
  const printKey = resolveSpecSizeKey(specSize, sizes);

  const rows = measurements || [];

  const patch = (idx, p) => onChange(rows.map((m, i) => (i === idx ? { ...m, ...p } : m)));
  const setCell = (idx, size, value) => {
    const row = rows[idx];
    const bySize = { ...(row.bySize || {}) };
    if (value === "") delete bySize[size]; else bySize[size] = value;
    // The printed sheet reads `inch`, so the column it is quoting keeps it fed.
    const p = { bySize };
    if (printKey && size === printKey) p.inch = value;
    patch(idx, p);
  };

  const addRow = (label = "") => onChange([...rows, { label, inch: "", bySize: {}, line: null }]);
  const dropRow = idx => onChange(rows.filter((_, i) => i !== idx));

  function applyTemplate(id) {
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    const labels = Array.isArray(tpl.labels) ? tpl.labels : [];
    // Adds only the points that are missing, so applying a template over a
    // part-filled grid cannot wipe numbers someone already measured.
    const have = new Set(rows.map(r => String(r.label || "").trim().toLowerCase()));
    const additions = labels
      .filter(l => l && !have.has(String(l).trim().toLowerCase()))
      .map(l => ({ label: l, inch: "", bySize: {}, line: null }));
    if (additions.length) onChange([...rows, ...additions]);
  }

  async function saveTemplate() {
    const name = templateName.trim();
    const labels = rows.map(r => String(r.label || "").trim()).filter(Boolean);
    if (!name || !labels.length) return;
    setSaving(true);
    try { await onSaveTemplate({ name, labels }); setTemplateName(""); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <label className="kfin-label" style={{ margin: 0 }}>Measurements (inch)</label>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {templates.length > 0 && (
            <select
              className="kfin-input"
              style={{ padding: "3px 6px", fontSize: 12, maxWidth: 170 }}
              value=""
              onChange={e => { applyTemplate(e.target.value); e.target.value = ""; }}
            >
              <option value="">Use a template…</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.product_type ? ` · ${t.product_type}` : ""}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="kinv-btn-ghost" onClick={() => addRow()}>+ Add point</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--ink-4)", margin: "4px 0" }}>
          No measurement points yet. Add one, pick a template, or draw one on the photo above.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={cellHead}>#</th>
                <th style={{ ...cellHead, textAlign: "left", minWidth: 108 }}>Point</th>
                {sizes.map(s => (
                  <th key={s} style={{
                    ...cellHead, minWidth: 42,
                    // The sheet quotes one size; showing which one stops the
                    // printout looking like it picked a number at random.
                    background: s === printKey ? "var(--mint-soft)" : undefined,
                    color: s === printKey ? "var(--mint-deep)" : undefined,
                  }}>
                    {s}
                  </th>
                ))}
                <th style={cellHead} />
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => (
                <tr key={i}>
                  <td style={{ ...cell, color: "var(--ink-4)", textAlign: "center" }}>{i + 1}</td>
                  <td style={cell}>
                    <input className="kfin-input" style={{ padding: "3px 6px", fontSize: 12 }}
                      value={m.label} placeholder="e.g. Full length"
                      onChange={e => patch(i, { label: e.target.value })} />
                  </td>
                  {sizes.map(s => (
                    <td key={s} style={cell}>
                      <input className="kfin-input" type="number" step="any"
                        style={{ padding: "3px 4px", fontSize: 12, width: "100%" }}
                        value={m.bySize?.[s] ?? (s === printKey ? (m.inch ?? "") : "")}
                        onChange={e => setCell(i, s, e.target.value)} />
                    </td>
                  ))}
                  <td style={{ ...cell, textAlign: "center" }}>
                    <button type="button" className="kinv-btn-del" title="Remove point" onClick={() => dropRow(i)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 11, color: "var(--ink-4)", margin: "6px 0 0" }}>
        {printKey
          ? `The printed spec sheet shows the ${printKey} column, because its Size field says “${specSize}”.`
          : "Set the Size field above to choose which column the printed spec sheet shows."}
      </p>

      {canSaveTemplate && rows.some(r => String(r.label || "").trim()) && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <input className="kfin-input" style={{ flex: 1, minWidth: 140, padding: "3px 6px", fontSize: 12 }}
            value={templateName} placeholder="Save these point names as… e.g. T-Shirt"
            onChange={e => setTemplateName(e.target.value)} />
          <button type="button" className="kinv-btn-ghost" disabled={!templateName.trim() || saving}
            onClick={saveTemplate}>
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      )}
    </div>
  );
}

const cellHead = { border: "1px solid var(--line)", padding: "3px 5px", fontSize: 11, fontWeight: 700, background: "var(--bg-2)" };
const cell = { border: "1px solid var(--line)", padding: 2 };

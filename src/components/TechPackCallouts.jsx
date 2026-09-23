import { useRef, useState } from "react";
import {
  CALLOUT_KINDS, CALLOUT_UNITS, STANDARD_SIZES, LARGE_SIZES,
  emptyCallout, numberedCallouts, qtyForSize, calloutIsUsable, resolveSpecSizeKey,
} from "../utils/techPackMaterials";

/* ── Tech pack callouts: the bill of materials, placed on the garment photo ──
 *
 * Instead of describing a garment's materials in a text box, a person taps the
 * front or back photo where the material actually is and labels that dot from
 * the stock list. One dot is one line of the bill of materials, so the picture
 * and the data are the same thing and cannot drift apart.
 *
 * The same board draws measurement lines: two taps mark where a measurement is
 * taken. The numbers are always typed from the real garment -- a photo has
 * perspective and no scale, so deriving inches from pixel distance would
 * produce confident, wrong measurements.
 *
 * Positions are stored as fractions of the image (0..1), never pixels, so a dot
 * lands in the same spot on a phone, a laptop and a printout.
 */

const DOT = 24; // px

function pointFromEvent(e, el) {
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
  };
}

/* Reads the pixel under a dot so the colour does not have to be eyeballed.
 * Firebase Storage images are cross-origin, and a canvas that has drawn one
 * refuses to be read, so this is strictly best-effort: it returns "" and the
 * colour box stays a normal, typeable input. */
function sampleColour(img, x, y) {
  try {
    if (!img?.naturalWidth) return "";
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(
      Math.round(x * (img.naturalWidth - 1)),
      Math.round(y * (img.naturalHeight - 1)), 1, 1
    ).data;
    if (px[3] === 0) return "";
    return "#" + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, "0")).join("");
  } catch {
    return ""; // tainted canvas — expected, not an error worth showing
  }
}

export default function TechPackCallouts({
  frontUrl, backUrl,
  callouts, onCalloutsChange,
  measurements, onMeasurementsChange,
  sizes, specSize,
  fabrics = [], inventoryItems = [],
}) {
  const [side, setSide] = useState("front");
  const [mode, setMode] = useState("materials"); // "materials" | "measurements"
  const [selectedId, setSelectedId] = useState(null);
  const [pendingPoint, setPendingPoint] = useState(null); // first tap of a measurement line
  const [dragId, setDragId] = useState(null);
  const draggedRef = useRef(false);
  const boardRef = useRef(null);
  const imgRef = useRef(null);

  const url = side === "front" ? frontUrl : backUrl;
  const shown = numberedCallouts(callouts, side);
  const lines = (measurements || [])
    .map((m, i) => ({ ...m, idx: i }))
    .filter(m => m.line && m.line.side === side);

  const selected = (callouts || []).find(c => c.id === selectedId) || null;

  function patchCallout(id, patch) {
    onCalloutsChange((callouts || []).map(c => (c.id === id ? { ...c, ...patch } : c)));
  }
  function removeCallout(id) {
    onCalloutsChange((callouts || []).filter(c => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function handleBoardClick(e) {
    // A drag that ends over the image must not also drop a new dot there.
    if (draggedRef.current) { draggedRef.current = false; return; }
    if (!url) return;
    const p = pointFromEvent(e, boardRef.current);
    if (!p) return;

    if (mode === "materials") {
      const dot = emptyCallout(side, p.x, p.y);
      const colour = sampleColour(imgRef.current, p.x, p.y);
      if (colour) dot.colorHex = colour;
      onCalloutsChange([...(callouts || []), dot]);
      setSelectedId(dot.id);
      return;
    }

    if (!pendingPoint) { setPendingPoint(p); return; }
    onMeasurementsChange([
      ...(measurements || []),
      {
        label: "", inch: "", bySize: {},
        line: { side, x1: pendingPoint.x, y1: pendingPoint.y, x2: p.x, y2: p.y },
      },
    ]);
    setPendingPoint(null);
  }

  function handleDotMove(e) {
    if (!dragId) return;
    const p = pointFromEvent(e, boardRef.current);
    if (!p) return;
    draggedRef.current = true;
    patchCallout(dragId, { x: p.x, y: p.y });
  }

  const hasImage = !!url;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["front", "back"].map(s => (
            <Toggle key={s} on={side === s} onClick={() => { setSide(s); setPendingPoint(null); }}>
              {s === "front" ? "Front" : "Back"}
            </Toggle>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Toggle on={mode === "materials"} onClick={() => { setMode("materials"); setPendingPoint(null); }}>
            Materials ({(callouts || []).length})
          </Toggle>
          <Toggle on={mode === "measurements"} onClick={() => { setMode("measurements"); setSelectedId(null); }}>
            Measure ({(measurements || []).filter(m => m.line).length})
          </Toggle>
        </div>
      </div>

      {!hasImage ? (
        <div style={{ border: "1px dashed var(--line)", borderRadius: 12, padding: 24, textAlign: "center", fontSize: 12, color: "var(--ink-4)" }}>
          Upload the {side} sketch below, then tap it to place {mode === "materials" ? "materials" : "measurements"}.
        </div>
      ) : (
        <div
          ref={boardRef}
          onClick={handleBoardClick}
          onPointerMove={handleDotMove}
          onPointerUp={() => setDragId(null)}
          onPointerLeave={() => setDragId(null)}
          style={{
            position: "relative", border: "1px solid var(--line)", borderRadius: 12,
            overflow: "hidden", cursor: mode === "materials" ? "crosshair" : "copy",
            touchAction: "none", background: "var(--bg-2)",
          }}
        >
          <img
            ref={imgRef}
            src={url}
            alt={side}
            crossOrigin="anonymous"
            draggable={false}
            style={{ display: "block", width: "100%", userSelect: "none" }}
          />

          {/* measurement lines */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            {lines.map(m => (
              <g key={m.idx}>
                <line
                  x1={`${m.line.x1 * 100}%`} y1={`${m.line.y1 * 100}%`}
                  x2={`${m.line.x2 * 100}%`} y2={`${m.line.y2 * 100}%`}
                  stroke="var(--terra)" strokeWidth="2" strokeDasharray="4 3"
                />
                {[[m.line.x1, m.line.y1], [m.line.x2, m.line.y2]].map(([px, py], k) => (
                  <circle key={k} cx={`${px * 100}%`} cy={`${py * 100}%`} r="4" fill="var(--terra)" />
                ))}
              </g>
            ))}
            {pendingPoint && (
              <circle cx={`${pendingPoint.x * 100}%`} cy={`${pendingPoint.y * 100}%`} r="5"
                fill="none" stroke="var(--terra)" strokeWidth="2" />
            )}
          </svg>

          {/* material dots */}
          {shown.map(c => {
            const on = c.id === selectedId;
            const ready = calloutIsUsable(c) || !c.fromStock;
            return (
              <button
                key={c.id}
                type="button"
                title={c.label || `Point ${c.n}`}
                onClick={e => { e.stopPropagation(); if (!draggedRef.current) { setMode("materials"); setSelectedId(c.id); } draggedRef.current = false; }}
                onPointerDown={e => { e.stopPropagation(); draggedRef.current = false; setDragId(c.id); }}
                style={{
                  position: "absolute",
                  left: `${c.x * 100}%`, top: `${c.y * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: DOT, height: DOT, borderRadius: "50%",
                  border: `2px solid ${on ? "var(--ink)" : "#fff"}`,
                  // An unfinished dot is amber: it is on the drawing but would
                  // deduct nothing, which is exactly the state worth seeing.
                  background: ready ? "var(--mint-deep)" : "var(--amber, #c8871a)",
                  color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: 1,
                  cursor: "grab", boxShadow: "0 1px 4px rgba(0,0,0,.4)", padding: 0,
                }}
              >
                {c.n}
              </button>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 11, color: "var(--ink-4)", margin: "6px 0 0" }}>
        {mode === "materials"
          ? "Tap the photo to add a material point. Drag a point to move it."
          : pendingPoint
            ? "Now tap the second end of the measurement."
            : "Tap the two ends of a measurement to draw it. Type the actual inches below."}
      </p>

      {mode === "materials" && (
        <MaterialList
          shown={shown}
          selected={selected}
          sizes={sizes}
          fabrics={fabrics}
          inventoryItems={inventoryItems}
          onSelect={setSelectedId}
          onPatch={patchCallout}
          onRemove={removeCallout}
        />
      )}

      {mode === "measurements" && (
        <MeasurementLineList
          lines={lines}
          sizes={sizes}
          specSize={specSize}
          measurements={measurements}
          onMeasurementsChange={onMeasurementsChange}
        />
      )}
    </div>
  );
}

function Toggle({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: "4px 12px", borderRadius: 10, fontSize: 12, fontWeight: on ? 700 : 500,
      border: "1.5px solid", borderColor: on ? "var(--mint-deep)" : "var(--line)",
      background: on ? "var(--mint-soft)" : "transparent",
      color: on ? "var(--mint-deep)" : "var(--ink-3)", cursor: "pointer",
    }}>{children}</button>
  );
}

/* ── the list beside the picture, and the editor for whichever dot is picked ── */
function MaterialList({ shown, selected, sizes, fabrics, inventoryItems, onSelect, onPatch, onRemove }) {
  if (!shown.length && !selected) {
    return <p style={{ fontSize: 12, color: "var(--ink-4)", margin: "10px 0 0" }}>No material points on this side yet.</p>;
  }
  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      {shown.map(c => {
        const on = selected?.id === c.id;
        const source = c.fabricId
          ? fabrics.find(f => f.id === c.fabricId)?.name
          : c.itemId
            ? inventoryItems.find(i => i.id === c.itemId)?.item
            : null;
        return (
          <div key={c.id}>
            <button type="button" onClick={() => onSelect(on ? null : c.id)} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
              padding: "6px 8px", borderRadius: 10, cursor: "pointer",
              border: "1px solid", borderColor: on ? "var(--mint-deep)" : "var(--line)",
              background: on ? "var(--mint-soft)" : "transparent",
            }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--mint-deep)", minWidth: 14 }}>{c.n}</span>
              <span style={{ flex: 1, fontSize: 13 }}>{c.label || <em style={{ color: "var(--ink-4)" }}>Untitled point</em>}</span>
              {c.colorHex && <span style={{ width: 12, height: 12, borderRadius: "50%", background: c.colorHex, border: "1px solid var(--line)" }} />}
              <span style={{ fontSize: 11, color: source ? "var(--ink-3)" : "var(--amber, #c8871a)" }}>
                {source || (c.fromStock ? "no material" : "vendor supplies")}
              </span>
            </button>
            {on && (
              <CalloutEditor
                key={c.id}
                callout={c}
                sizes={sizes}
                fabrics={fabrics}
                inventoryItems={inventoryItems}
                onPatch={patch => onPatch(c.id, patch)}
                onRemove={() => onRemove(c.id)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CalloutEditor({ callout: c, sizes, fabrics, inventoryItems, onPatch, onRemove }) {
  const [perSize, setPerSize] = useState(() => {
    // If the saved numbers do not fit the two buckets, the person already needs
    // the detailed view; dropping them into it avoids hiding their own data.
    const vals = sizes.map(s => qtyForSize(c, s));
    const std = sizes.filter(s => STANDARD_SIZES.includes(s)).map(s => qtyForSize(c, s));
    const lrg = sizes.filter(s => LARGE_SIZES.includes(s)).map(s => qtyForSize(c, s));
    const uniform = arr => arr.every(v => v === arr[0]);
    return vals.some(v => v > 0) && !(uniform(std) && uniform(lrg));
  });

  const stdSizes = sizes.filter(s => STANDARD_SIZES.includes(s));
  const lrgSizes = sizes.filter(s => LARGE_SIZES.includes(s));
  const stdValue = stdSizes.length ? qtyForSize(c, stdSizes[0]) || "" : "";
  const lrgValue = lrgSizes.length ? qtyForSize(c, lrgSizes[0]) || "" : "";

  const setBucket = (bucket, value) => {
    const next = { ...(c.qtyBySize || {}) };
    for (const s of bucket) {
      if (value === "" ) delete next[s];
      else next[s] = Number(value);
    }
    onPatch({ qtyBySize: next });
  };
  const setOne = (size, value) => {
    const next = { ...(c.qtyBySize || {}) };
    if (value === "") delete next[size]; else next[size] = Number(value);
    onPatch({ qtyBySize: next });
  };

  /* Which of the three the person has chosen, held here rather than worked out
     from whichever id happens to be set. Deriving it looked tidier and was
     wrong: picking "a specific stock item" clears fabricId and sets no itemId
     yet, so the derived answer flipped straight back to "fabric" and the item
     dropdown never appeared. */
  const [source, setSource] = useState(() => (!c.fromStock ? "vendor" : c.itemId ? "item" : "fabric"));

  return (
    <div style={{ border: "1px solid var(--mint-deep)", borderTop: "none", borderRadius: "0 0 10px 10px", padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="krsp-2" style={{ gap: 8 }}>
        <div>
          <label className="kfin-label">Label</label>
          <input className="kfin-input" value={c.label} placeholder="e.g. CF zipper, rib collar"
            onChange={e => onPatch({ label: e.target.value })} />
        </div>
        <div>
          <label className="kfin-label">Kind</label>
          <select className="kfin-input" value={c.kind} onChange={e => onPatch({ kind: e.target.value })}>
            {CALLOUT_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="kfin-label">Comes from</label>
        <select
          className="kfin-input"
          value={source}
          onChange={e => {
            const v = e.target.value;
            setSource(v);
            if (v === "vendor") onPatch({ fromStock: false, itemId: null, fabricId: null });
            if (v === "fabric") onPatch({ fromStock: true, itemId: null });
            if (v === "item")   onPatch({ fromStock: true, fabricId: null });
          }}
        >
          <option value="fabric">Materials &amp; Fabrics — colour chosen per order</option>
          <option value="item">A specific stock item</option>
          <option value="vendor">Vendor supplies it — never deducted</option>
        </select>

        {source === "fabric" && (
          <select className="kfin-input" style={{ marginTop: 6 }} value={c.fabricId || ""}
            onChange={e => onPatch({ fabricId: e.target.value || null })}>
            <option value="">— choose a fabric —</option>
            {[...fabrics].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
              .map(f => <option key={f.id} value={f.id}>{f.name}{f.gsm ? ` · ${f.gsm} GSM` : ""}</option>)}
          </select>
        )}
        {source === "item" && (
          <select className="kfin-input" style={{ marginTop: 6 }} value={c.itemId || ""}
            onChange={e => onPatch({ itemId: e.target.value || null })}>
            <option value="">— choose a stock item —</option>
            {[...inventoryItems].sort((a, b) => String(a.item || "").localeCompare(String(b.item || "")))
              .map(i => <option key={i.id} value={i.id}>{i.item}{i.unit ? ` (${i.unit})` : ""}</option>)}
          </select>
        )}
        {source === "vendor" && (
          <p style={{ fontSize: 11, color: "var(--ink-4)", margin: "6px 0 0" }}>
            Shown on the tech pack so the factory sees it, but never taken out of stock — this is how buttons work.
          </p>
        )}
      </div>

      {c.fromStock && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <label className="kfin-label" style={{ margin: 0 }}>Used by one piece</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select className="kfin-input" style={{ padding: "2px 6px", fontSize: 11, width: 64 }}
                value={c.unit} onChange={e => onPatch({ unit: e.target.value })}>
                {CALLOUT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <button type="button" className="kinv-btn-ghost" style={{ fontSize: 11 }}
                onClick={() => setPerSize(v => !v)}>
                {perSize ? "Use size buckets" : "Per size"}
              </button>
            </div>
          </div>

          {!perSize ? (
            <div className="krsp-2" style={{ gap: 8 }}>
              <div>
                <label className="kfin-label" style={{ fontSize: 11 }}>
                  {stdSizes.length ? `${stdSizes[0]}–${stdSizes[stdSizes.length - 1]}` : "Standard"}
                </label>
                <input className="kfin-input" type="number" min="0" step="any" value={stdValue}
                  placeholder="0" disabled={!stdSizes.length}
                  onChange={e => setBucket(stdSizes, e.target.value)} />
              </div>
              <div>
                <label className="kfin-label" style={{ fontSize: 11 }}>XXL and above</label>
                <input className="kfin-input" type="number" min="0" step="any" value={lrgValue}
                  placeholder={stdValue === "" ? "0" : String(stdValue)} disabled={!lrgSizes.length}
                  onChange={e => setBucket(lrgSizes, e.target.value)} />
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(sizes.length, 4)}, 1fr)`, gap: 6 }}>
              {sizes.map(s => (
                <div key={s}>
                  <label className="kfin-label" style={{ fontSize: 11 }}>{s}</label>
                  <input className="kfin-input" type="number" min="0" step="any" placeholder="0"
                    value={qtyForSize(c, s) || ""} onChange={e => setOne(s, e.target.value)} />
                </div>
              ))}
            </div>
          )}
          {c.kind === "fabric" && (
            <p style={{ fontSize: 11, color: "var(--ink-4)", margin: "6px 0 0" }}>
              Wastage is added on top of this when an order is costed — don't include it here.
            </p>
          )}
        </div>
      )}

      <div className="krsp-2" style={{ gap: 8 }}>
        <div>
          <label className="kfin-label">Colour on the photo</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="color" value={c.colorHex || "#cccccc"} style={{ width: 34, height: 30, padding: 0, border: "1px solid var(--line)", borderRadius: 10, background: "none" }}
              onChange={e => onPatch({ colorHex: e.target.value })} />
            <input className="kfin-input" style={{ flex: 1 }} value={c.colorHex || ""} placeholder="picked from the photo"
              onChange={e => onPatch({ colorHex: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="kfin-label">Note</label>
          <input className="kfin-input" value={c.note || ""} placeholder="e.g. 2-way metal"
            onChange={e => onPatch({ note: e.target.value })} />
        </div>
      </div>

      <button type="button" className="kinv-btn-del" style={{ alignSelf: "flex-start" }} onClick={onRemove}>
        Remove this point
      </button>
    </div>
  );
}

/* ── measurement lines drawn on this side ── */
function MeasurementLineList({ lines, sizes, specSize, measurements, onMeasurementsChange }) {
  if (!lines.length) return null;
  const printKey = resolveSpecSizeKey(specSize, sizes);

  const patch = (idx, p) =>
    onMeasurementsChange(measurements.map((m, i) => (i === idx ? { ...m, ...p } : m)));
  const drop = idx => onMeasurementsChange(measurements.filter((_, i) => i !== idx));

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      {lines.map(m => (
        <div key={m.idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input className="kfin-input" style={{ flex: 2 }} value={m.label} placeholder="e.g. Chest width"
            onChange={e => patch(m.idx, { label: e.target.value })} />
          <input className="kfin-input" style={{ flex: 1 }} type="number" step="any"
            value={printKey ? (m.bySize?.[printKey] ?? "") : m.inch}
            placeholder={printKey ? `${printKey} inch` : "inch"}
            onChange={e => {
              const v = e.target.value;
              if (printKey) patch(m.idx, { bySize: { ...(m.bySize || {}), [printKey]: v }, inch: v });
              else patch(m.idx, { inch: v });
            }} />
          <button type="button" className="kinv-btn-del" title="Remove measurement" onClick={() => drop(m.idx)}>✕</button>
        </div>
      ))}
      <p style={{ fontSize: 11, color: "var(--ink-4)", margin: 0 }}>
        Every size is filled in on the measurement table below.
      </p>
    </div>
  );
}

/**
 * The Design step's side panel: what you can change about the selected shapes (where they are, how big, what colour, how they
 * are stitched, their outline, their lettering), or, with nothing selected, about the whole design (hoop, fabric, name).
 */
import { useEffect, useRef } from "react";
import Select from "../Select";
import { Group, Row, NumberField, Slider, Segmented, Toggle, ColorField } from "./Controls";
import { HOOPS, boxOfObjects, objectSize } from "../../lib/digitizer/model";
import { FABRICS } from "../../lib/embroidery/stitch/presets";
import { FONTS } from "../../lib/digitizer/text";

const FILL_TYPES = [
  { value: "auto", label: "Auto", title: "Satin for strokes and letters, tatami for areas" },
  { value: "tatami", label: "Tatami", title: "Rows of stitches over the whole area" },
  { value: "satin", label: "Satin", title: "Smooth zigzag across a stroke" },
  { value: "none", label: "None", title: "Do not fill (outline only)" },
];
const OUTLINE_TYPES = [
  { value: "none", label: "None" },
  { value: "run", label: "Running" },
  { value: "bean", label: "Bean" },
  { value: "satin", label: "Satin" },
];
const FILL_UNDERLAY = [
  { value: "auto", label: "Automatic" },
  { value: "none", label: "None" },
  { value: "edge", label: "Edge run" },
  { value: "edge+tatami", label: "Edge run + weave" },
];
const SATIN_UNDERLAY = [
  { value: "auto", label: "Automatic" },
  { value: "none", label: "None" },
  { value: "center", label: "Centre run" },
  { value: "edge", label: "Edge run" },
  { value: "center+edge", label: "Centre + edge" },
];

const A = ({ children }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">{children}</svg>
);
const ALIGN = [
  ["left", "Line up left", <A><path d="M4 4v16" /><rect x="7" y="6" width="12" height="4" rx="1" /><rect x="7" y="14" width="7" height="4" rx="1" /></A>],
  ["centerX", "Centre across", <A><path d="M12 3v18" /><rect x="5" y="6" width="14" height="4" rx="1" /><rect x="8" y="14" width="8" height="4" rx="1" /></A>],
  ["right", "Line up right", <A><path d="M20 4v16" /><rect x="5" y="6" width="12" height="4" rx="1" /><rect x="10" y="14" width="7" height="4" rx="1" /></A>],
  ["top", "Line up top", <A><path d="M4 4h16" /><rect x="6" y="7" width="4" height="12" rx="1" /><rect x="14" y="7" width="4" height="7" rx="1" /></A>],
  ["centerY", "Centre down", <A><path d="M3 12h18" /><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="8" width="4" height="8" rx="1" /></A>],
  ["bottom", "Line up bottom", <A><path d="M4 20h16" /><rect x="6" y="5" width="4" height="12" rx="1" /><rect x="14" y="10" width="4" height="7" rx="1" /></A>],
];

const same = (list, get) => {
  const first = get(list[0]);
  return list.every((o) => get(o) === first) ? first : undefined;
};

function DesignSettings({ api }) {
  const { design } = api;
  const hoopValue = HOOPS.find((h) => h.w === design.hoop.w && h.h === design.hoop.h)?.id || "custom";
  return (
    <>
      <Group title="This design">
        <Row label="Name">
          <input className="dz-text" aria-label="Design name" value={design.name} onChange={(e) => api.setDesign({ name: e.target.value }, "coalesce")} maxLength={60} />
        </Row>
        <Row label="Hoop">
          <Select
            value={hoopValue}
            label="Hoop size"
            variant="field"
            options={[...HOOPS.map((h) => ({ value: h.id, label: h.label })), { value: "custom", label: "Custom size" }]}
            onChange={(v) => { const h = HOOPS.find((x) => x.id === v); if (h) api.setHoop(h.w, h.h); }}
          />
        </Row>
        <Row label="Size (mm)">
          <div className="dz-pair">
            <NumberField label="Hoop width in millimetres" value={design.hoop.w} min={20} max={1000} digits={0} unit="W" onChange={(v) => api.setHoop(v, design.hoop.h)} />
            <NumberField label="Hoop height in millimetres" value={design.hoop.h} min={20} max={1000} digits={0} unit="H" onChange={(v) => api.setHoop(design.hoop.w, v)} />
          </div>
        </Row>
        <Row label="Fabric" hint="Sets how dense and how long the stitches are, and the underlay.">
          <Select value={design.fabric} label="Fabric" variant="field" options={Object.entries(FABRICS).map(([id, f]) => ({ value: id, label: f.label }))} onChange={(v) => api.setDesign({ fabric: v })} />
        </Row>
      </Group>
      <Group title="Cloth">
        <Row label="Colour">
          <ColorField value={design.fabricColor} label="Cloth colour" onChange={(c) => api.setFabricColor(c)} />
        </Row>
        <p className="dz-hint">The colour of the garment. Only for looking at the design: white thread on white cloth is hard to see. Colours in a picture that match it are left out when the picture is converted. It is not saved in the stitch file.</p>
      </Group>
      <Group title="Add">
        <div className="dz-actions">
          <button type="button" className="kb-btn kb-btn--ghost" onClick={() => api.setTool("text")}>Text</button>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={() => api.setTool("rect")}>Rectangle</button>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={() => api.setTool("ellipse")}>Ellipse</button>
        </div>
        <p className="dz-hint">Pick a tool, then click or drag on the canvas.</p>
      </Group>
    </>
  );
}

export default function InspectorPanel({ api }) {
  const { selected, design } = api;
  const textRef = useRef(null);
  useEffect(() => {
    if (api.openRequest && selected.length === 1 && selected[0].kind === "text") textRef.current?.focus();
  }, [api.openRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selected.length) return <DesignSettings api={api} />;

  const ids = selected.map((o) => o.id);
  const one = selected.length === 1 ? selected[0] : null;
  const usedColors = [...new Set(design.objects.flatMap((o) => [o.fill.color, o.stroke.type !== "none" ? o.stroke.color : null]).filter(Boolean))];
  const box = boxOfObjects(selected);
  // One object shows its own width and height (what typing a size sets), turned or not; a group shows the box around it.
  const own = one ? objectSize(one) : null;
  const w = own ? own.w : box[2] - box[0], h = own ? own.h : box[3] - box[1];
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
  const fillType = same(selected, (o) => o.fill.type);
  const strokeType = same(selected, (o) => o.stroke.type);
  const color = same(selected, (o) => o.fill.color);
  const fill = one ? one.fill : selected[0].fill;
  const stroke = one ? one.stroke : selected[0].stroke;
  const sat = fill.satin || {};
  // What an object does when it has no setting of its own is what its fabric asks for, so that is what the boxes show.
  const fabric = FABRICS[design.fabric] || FABRICS.woven;
  const base = (fillType === "satin" ? fabric.satin : fabric.fill) || {};
  const locked = selected.every((o) => o.locked);

  const setFill = (patch) => api.patchFill(ids, patch);
  const setSat = (patch) => api.patchSatin(ids, patch);
  const setBoth = (key, v) => { api.patchFill(ids, { [key]: v }); api.patchSatin(ids, { [key]: v }); };

  return (
    <>
      <Group title={one ? one.name : `${selected.length} objects`}>
        <Row label="Position (mm)">
          <div className="dz-pair">
            <NumberField label="X position in millimetres" value={cx} digits={2} step={0.1} unit="X" disabled={locked} onChange={(v) => api.setCentre(ids, v, null)} />
            <NumberField label="Y position in millimetres" value={cy} digits={2} step={0.1} unit="Y" disabled={locked} onChange={(v) => api.setCentre(ids, null, v)} />
          </div>
        </Row>
        <Row label="Size (mm)">
          <div className="dz-pair">
            <NumberField label="Width in millimetres" value={w} min={0.5} max={1000} digits={2} step={0.5} unit="W" disabled={locked || !one} onChange={(v) => api.setSize(ids, v, null, true)} />
            <NumberField label="Height in millimetres" value={h} min={0.5} max={1000} digits={2} step={0.5} unit="H" disabled={locked || !one} onChange={(v) => api.setSize(ids, null, v, true)} />
          </div>
        </Row>
        {one && (
          <Row label="Turn (°)">
            <NumberField label="Rotation in degrees" value={((one.transform.rot % 360) + 360) % 360} min={0} max={360} digits={1} step={1} unit="°" disabled={locked} onChange={(v) => api.setRotation(ids, v)} />
          </Row>
        )}
        <div className="dz-iconrow" role="group" aria-label="Line up">
          {ALIGN.map(([how, title, icon]) => (
            <button key={how} type="button" title={title} aria-label={title} onClick={() => api.align(ids, how)}>{icon}</button>
          ))}
        </div>
        <p className="dz-hint">{one ? "Centre uses the hoop's middle; with several objects they line up with each other." : "With several objects they line up with each other."}</p>
      </Group>

      {one && one.kind === "text" && one.text && (
        <Group title="Text">
          <textarea ref={textRef} className="dz-textarea" aria-label="The words" value={one.text.value} rows={2} onChange={(e) => api.editText(one.id, { value: e.target.value })} />
          <Row label="Font">
            <Select value={one.text.font} label="Font" variant="field" options={FONTS.map((f) => ({ value: f.id, label: f.label }))} onChange={(v) => api.editText(one.id, { font: v })} />
          </Row>
          <Row label="Letter height">
            <NumberField label="Letter height in millimetres" value={one.text.size} min={2} max={400} digits={1} step={0.5} unit="mm" onChange={(v) => api.editText(one.id, { size: v })} />
          </Row>
          <Row label="Style">
            <div className="dz-pair">
              <Toggle checked={one.text.bold} onChange={(v) => api.editText(one.id, { bold: v })}>Bold</Toggle>
              <Toggle checked={one.text.italic} onChange={(v) => api.editText(one.id, { italic: v })}>Italic</Toggle>
            </div>
          </Row>
          <Row label="Letter gap">
            <NumberField label="Space between letters in millimetres" value={one.text.spacing} min={-3} max={30} digits={1} step={0.2} unit="mm" onChange={(v) => api.editText(one.id, { spacing: v })} />
          </Row>
          <Row label="Line gap">
            <NumberField label="Line height as a multiple" value={one.text.lineHeight} min={0.7} max={3} digits={2} step={0.05} unit="×" onChange={(v) => api.editText(one.id, { lineHeight: v })} />
          </Row>
          <Row label="Align">
            <Segmented label="Text alignment" value={one.text.align} onChange={(v) => api.editText(one.id, { align: v })} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]} />
          </Row>
          {one.text.size < 5 && <p className="dz-warn">Letters under about 5 mm tall are hard to sew cleanly. Try a bolder font or make it larger.</p>}
          <button type="button" className="kb-btn kb-btn--ghost" onClick={() => api.breakApart(ids)}>Split into letters</button>
        </Group>
      )}

      <Group title="Colour and stitching">
        <Row label="Thread">
          <ColorField value={color ?? "#888888"} used={usedColors} label="Fill colour" onChange={(c) => api.patchFill(ids, { color: c })} />
        </Row>
        <Row label="Stitch as">
          <Segmented label="How the shape is stitched" value={fillType} onChange={(v) => setFill({ type: v })} options={FILL_TYPES} size="wrap" />
        </Row>
        {fillType !== "none" && (
          <>
            <Row label="Density" hint="Distance between rows, in mm. Smaller is thicker.">
              <NumberField label="Row spacing in millimetres" value={fill.spacing ?? base.spacing ?? 0.4} min={0.2} max={1.2} digits={2} step={0.02} unit="mm" onChange={(v) => setBoth("spacing", v)} />
            </Row>
            {fillType !== "satin" && (
              <>
                <Row label="Angle">
                  <div className="dz-angle">
                    <Slider label="Stitch angle" value={fill.angle ?? 45} min={0} max={179} step={1} onChange={(v) => setFill({ angle: v })} format={(v) => `${Math.round(v)}°`} />
                  </div>
                </Row>
                <Row label="Stitch length">
                  <NumberField label="Stitch length in millimetres" value={fill.stitchLen ?? base.stitchLen ?? 3.5} min={1.5} max={7} digits={1} step={0.1} unit="mm" onChange={(v) => setFill({ stitchLen: v })} />
                </Row>
              </>
            )}
            <Row label="Pull comp." hint="Makes stitching a little wider, because thread pulls the cloth in.">
              <NumberField label="Pull compensation in millimetres" value={fill.pullComp ?? base.pullComp ?? 0.2} min={0} max={1} digits={2} step={0.05} unit="mm" onChange={(v) => setBoth("pullComp", v)} />
            </Row>
            <Row label="Underlay" hint="Stitches sewn first that hold the cloth flat.">
              {fillType === "satin" ? (
                <Select value={sat.underlay ?? "auto"} label="Satin underlay" variant="field" options={SATIN_UNDERLAY} onChange={(v) => setSat({ underlay: v })} />
              ) : (
                <Select value={fill.underlay ?? "auto"} label="Fill underlay" variant="field" options={FILL_UNDERLAY} onChange={(v) => setFill({ underlay: v })} />
              )}
            </Row>
          </>
        )}
      </Group>

      <Group title="Outline">
        <Row label="Line">
          <Segmented label="Outline type" value={strokeType} onChange={(v) => api.patchStroke(ids, { type: v })} options={OUTLINE_TYPES} size="wrap" />
        </Row>
        {strokeType && strokeType !== "none" && (
          <>
            <Row label="Thread">
              <ColorField value={stroke.color} used={usedColors} label="Outline colour" onChange={(c) => api.patchStroke(ids, { color: c })} />
            </Row>
            {strokeType === "satin" ? (
              <>
                <Row label="Width">
                  <NumberField label="Outline width in millimetres" value={stroke.width ?? 1.5} min={0.8} max={7} digits={1} step={0.1} unit="mm" onChange={(v) => api.patchStroke(ids, { width: v })} />
                </Row>
                <Row label="Sits">
                  <Segmented label="Where the outline sits" value={stroke.position ?? "center"} onChange={(v) => api.patchStroke(ids, { position: v })} options={[{ value: "inside", label: "Inside" }, { value: "center", label: "On edge" }, { value: "outside", label: "Outside" }]} />
                </Row>
              </>
            ) : (
              <Row label="Stitch length">
                <NumberField label="Outline stitch length in millimetres" value={stroke.len ?? 2.5} min={1} max={6} digits={1} step={0.1} unit="mm" onChange={(v) => api.patchStroke(ids, { len: v })} />
              </Row>
            )}
          </>
        )}
      </Group>

      <Group title="Arrange">
        <div className="dz-actions">
          <button type="button" className="kb-btn kb-btn--ghost" onClick={() => api.stepOrder(ids, -1)} title="Sew it earlier">Sew earlier</button>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={() => api.stepOrder(ids, 1)} title="Sew it later (on top)">Sew later</button>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={() => api.flip(ids, "h")}>Flip across</button>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={() => api.flip(ids, "v")}>Flip down</button>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={() => api.breakApart(ids)}>Split pieces</button>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={() => api.fillHoles(ids)} title="Remove the holes, so a shape on top sits on a solid base">Fill holes</button>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={() => api.duplicate(ids)}>Duplicate</button>
          <button type="button" className="kb-btn kb-btn--ghost kb-btn--danger" onClick={() => api.removeObjects(ids)}>Delete</button>
        </div>
      </Group>
    </>
  );
}

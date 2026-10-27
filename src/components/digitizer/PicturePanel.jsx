/**
 * The Picture step's side panel: the picture the design is made from (its size, crop and fading), and how it is turned into
 * shapes (how many colours, how much detail, whether the background is left out), with the colours it found.
 */
import { Group, Row, NumberField, Slider, Segmented, Toggle, ColorField } from "./Controls";

const COLOR_CHOICES = [
  { value: "auto", label: "Auto" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 6, label: "6" },
  { value: 8, label: "8" },
  { value: 10, label: "10" },
];

export default function PicturePanel({ api, pickFile }) {
  const { design, hasImage, settings, palette, converting, convertError, crop, dropped } = api;
  const ref = design.reference;

  if (!ref) {
    return (
      <div className="dz-first">
        <h3>Start from a picture</h3>
        <p>Choose the picture the client sent. A clear logo on a plain background works best. PNG, JPG and SVG are fine.</p>
        <button type="button" className="kb-btn kb-btn--primary" onClick={pickFile}>Choose a picture</button>
        <p className="dz-hint">You can also drop a picture onto the canvas.</p>
      </div>
    );
  }

  const widthMm = ref.crop.w * ref.mmPerPx;
  const heightMm = ref.crop.h * ref.mmPerPx;
  const colorValue = settings.colors === "auto" ? "auto" : settings.colors;

  return (
    <>
      <Group title="The picture">
        {!hasImage && <p className="dz-warn">The picture itself is not kept in a saved design. Choose it again to change how it is converted.</p>}
        <Row label="Width">
          <NumberField label="Picture width in millimetres" value={widthMm} min={5} max={1000} digits={1} step={1} unit="mm" disabled={!hasImage} onChange={(v) => api.setReferenceWidth(v)} />
        </Row>
        <p className="dz-hint">{widthMm.toFixed(1)} × {heightMm.toFixed(1)} mm. The shapes made from it change size with it.</p>
        <div className="dz-actions">
          <button type="button" className={`kb-btn ${crop ? "kb-btn--primary" : "kb-btn--ghost"}`} disabled={!hasImage} onClick={() => api.setCrop(!crop)}>{crop ? "Done cropping" : "Crop"}</button>
          <button
            type="button"
            className="kb-btn kb-btn--ghost"
            disabled={!hasImage || (ref.crop.w === ref.srcW && ref.crop.h === ref.srcH)}
            onClick={() => api.setReference({ crop: { x: 0, y: 0, w: ref.srcW, h: ref.srcH }, x: ref.x - ref.crop.x * ref.mmPerPx, y: ref.y - ref.crop.y * ref.mmPerPx }, "commit")}
          >
            Reset crop
          </button>
          <button type="button" className="kb-btn kb-btn--ghost" onClick={pickFile}>Change picture</button>
        </div>
        {crop && <p className="dz-hint">Drag the white handles on the canvas to cut away what you do not want, then press Done cropping.</p>}
        <Row label="Show">
          <Slider label="How strongly the picture shows" value={ref.opacity ?? 1} min={0.1} max={1} step={0.05} onChange={(v) => api.setReference({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </Row>
      </Group>

      <Group title="Turn it into shapes">
        <Row label="Colours" wide>
          <Segmented label="Number of colours" value={colorValue} onChange={(v) => api.changeSettings(v === "auto" ? { colors: "auto", maxColors: 6 } : { colors: v })} options={COLOR_CHOICES} size="wrap" />
        </Row>
        <Row label="Detail" hint="Simple drops small specks and thin lines. Detailed keeps more, but fine details may not sew well.">
          <Slider label="Level of detail" value={settings.detail} min={0} max={1} step={0.05} onChange={(v) => api.changeSettings({ detail: v })} format={(v) => (v < 0.34 ? "Simple" : v > 0.66 ? "Detailed" : "Balanced")} />
        </Row>
        <Row label="Cloth" hint="What colour is the garment? Colours in the picture that match it are not stitched: the cloth shows through.">
          <ColorField value={design.fabricColor} label="Cloth colour" onChange={(c) => api.setFabricColor(c)} />
        </Row>
        <Toggle checked={settings.background === "auto"} onChange={(v) => api.changeSettings({ background: v ? "auto" : "none" })}>Leave out the background</Toggle>
        <Toggle checked={settings.snap} onChange={(v) => api.changeSettings({ snap: v })}>Use the nearest thread colours</Toggle>
        <div className="dz-actions">
          <button type="button" className="kb-btn kb-btn--primary" disabled={!hasImage || converting} onClick={() => api.runConvert({})}>{converting ? "Working…" : "Convert again"}</button>
        </div>
        <p className="dz-hint">Converting again replaces the shapes made from the picture, including any changes you made to them.</p>
        {convertError && <p className="dz-warn" role="alert">{convertError}</p>}
        {api.design.objects.filter((o) => o.source === "image").length > 120 && (
          <p className="dz-warn">This picture has a lot of small shapes, which usually means a photo or a gradient. Embroidery works best with logos in flat colours: try fewer colours or a simpler picture.</p>
        )}
        {dropped >= 4 && !convertError && (
          <p className="dz-note-inline">About {Math.round(dropped)} mm² of the picture was too fine to sew (small text, thin lines) and was left out. A bigger picture keeps more of it; Detailed keeps the most.</p>
        )}
      </Group>

      {palette.length > 0 && (
        <Group title="Colours found">
          <ul className="dz-pal">
            {palette.map((p) => (
              <li key={p.index} className={p.background ? "is-bg" : ""}>
                <span className="dz-dot dz-dot--lg" style={{ background: p.hex }} />
                <span className="dz-pal-n">{p.name}{p.background ? " · background" : p.enclosed ? " · inside the design" : ""}{p.sameAsCloth ? " · like the cloth" : ""}</span>
                <span className="dz-pal-p">{Math.round(p.fraction * 100)}%</span>
                <Toggle checked={!p.skipped} disabled={p.background} onChange={() => api.toggleSkip(p.index)}>
                  <span className="dz-sr">Stitch {p.name}{p.enclosed ? " inside the design" : ""}</span>
                </Toggle>
              </li>
            ))}
          </ul>
          {palette.some((p) => p.sameAsCloth && p.skipped) && (
            <p className="dz-note-inline">
              {palette.filter((p) => p.sameAsCloth && p.skipped).map((p) => p.name).join(", ")} looks like the cloth, so it is not stitched. Tick it to stitch it, or change the cloth colour above to the real garment colour.
            </p>
          )}
          <p className="dz-hint">Untick a colour to leave it out; tick one to stitch it. A colour like the cloth starts unticked.</p>
        </Group>
      )}
    </>
  );
}

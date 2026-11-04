/**
 * The Picture step's side panel: the picture the design is made from (its size, crop and fading), and how it is turned into
 * shapes (how many colours, how much detail, whether the background is left out), with the colours it found.
 */
import { Group, Row, NumberField, Slider, Segmented, Toggle, ColorField } from "./Controls";
import { followsPicture } from "../../lib/digitizer/model";

const COLOR_CHOICES = [
  { value: "auto", label: "Auto" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 6, label: "6" },
  { value: 8, label: "8" },
  { value: 10, label: "10" },
  { value: 12, label: "12" },
];

const KIND_CHOICES = [
  { value: "auto", label: "Auto", title: "Look at the picture and choose" },
  { value: "logo", label: "Logo", title: "A few flat colours" },
  { value: "art", label: "Artwork", title: "Drawn or painted, with soft shading" },
  { value: "photo", label: "Photo", title: "Gradients and many colours: made into paint-like patches" },
];
const KIND_NAME = { logo: "a logo (flat colours)", art: "artwork (soft shading)", photo: "a photo (gradients)" };
/** Lettering shorter than this (mm) cannot be sewn so that it reads: a satin letter needs a stroke of about a millimetre, and room round it. */
const SMALL_LETTER_MM = 3.5; // small lettering is sewn as single lines of stitches: 3.9 mm tall was legible in tests, 2.2 mm was not

const n = (v) => Number(v).toLocaleString("en-GB");

export default function PicturePanel({ api, pickFile }) {
  const { design, hasImage, settings, palette, converting, convertError, crop, dropped, traceInfo } = api;
  const ref = design.reference;

  if (!ref) {
    return (
      <div className="dz-first">
        <h3>Start from a picture</h3>
        <p>Choose the picture the client sent. A clear logo on a plain background works best. PNG, JPG and SVG are fine.</p>
        <button type="button" className="kb-btn kb-btn--primary" onClick={pickFile}>Choose a picture</button>
        <p className="dz-hint">You can also drop a picture onto the canvas, or copy one and paste it here with Ctrl+V.</p>
      </div>
    );
  }

  const widthMm = ref.crop.w * ref.mmPerPx;
  const heightMm = ref.crop.h * ref.mmPerPx;
  // How tall the smallest lettering is NOW: it was measured when the picture was converted, and grows with the picture.
  const smallLetterMm = traceInfo && traceInfo.kind !== "photo" && traceInfo.letters >= 4 && traceInfo.letterMm > 0 && traceInfo.widthMm > 0 ? traceInfo.letterMm * (widthMm / traceInfo.widthMm) : 0;
  const colorValue = settings.colors === "auto" ? "auto" : settings.colors;
  const shapeCount = design.objects.filter(followsPicture).length; // made from the picture or traced over it
  // The fine lines and dots the design has NOW (undo, a deleted object or a new conversion changes them; the reading's count would go stale)
  const fineNow = design.objects.filter((o) => o.layer === "detail" && o.source === "image");
  const linesNow = fineNow.filter((o) => o.open).reduce((t, o) => t + o.rings.length, 0);
  const dotsNow = fineNow.filter((o) => !o.open).reduce((t, o) => t + o.rings.length, 0);

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
        <div className="dz-actions">
          <button type="button" className="kb-btn kb-btn--ghost kb-btn--danger" onClick={() => api.removeReference(false)} title={shapeCount ? "Take the picture away. The shapes made from it stay." : "Take the picture away"}>Delete picture</button>
          {shapeCount > 0 && (
            <button type="button" className="kb-btn kb-btn--ghost kb-btn--danger" onClick={() => api.removeReference(true)} title="Take the picture away, and the shapes made from it or traced over it">Delete picture and shapes</button>
          )}
        </div>
        <Row label="Show">
          <Slider label="How strongly the picture shows" value={ref.opacity ?? 1} min={0.1} max={1} step={0.05} onChange={(v) => api.setReference({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </Row>
      </Group>

      <Group title="Turn it into shapes">
        <Row label="Picture type" wide hint={settings.kind === "auto" && traceInfo ? `Looks like ${KIND_NAME[traceInfo.kind] || "a logo"}: the colours and detail are chosen for that.` : "A photo is smoothed into patches of colour; a logo keeps its flat colours exactly. An old print or an engraving works best as Photo."}>
          <Segmented label="Kind of picture" value={settings.kind || "auto"} onChange={(v) => api.changeSettings({ kind: v })} options={KIND_CHOICES} size="wrap" />
        </Row>
        <Row label="Colours" wide hint="Up to 12 is what a machine head can hold. Auto uses only as many as the picture needs.">
          <Segmented label="Number of colours" value={colorValue} onChange={(v) => api.changeSettings(v === "auto" ? { colors: "auto", maxColors: 12 } : { colors: v })} options={COLOR_CHOICES} size="wrap" />
        </Row>
        <Row label="Detail" hint="Simple leaves out small specks and fine detail. Finest keeps pieces down to 0.3 mm², the smallest a needle can sew, but means more stitches, trims and time. Faces, leaves and lettering keep more detail when the design is bigger: try making it 1.5 times bigger.">
          <Slider label="Level of detail" value={settings.detail} min={0} max={1} step={0.05} onChange={(v) => api.changeSettings({ detail: v })} format={(v) => (v < 0.34 ? "Simple" : v < 0.67 ? "Balanced" : v < 0.95 ? "Detailed" : "Finest")} />
        </Row>
        <Toggle checked={settings.angles !== "plain"} onChange={(v) => api.changeSettings({ angles: v ? "auto" : "plain" })}>Stitch rows follow the shape</Toggle>
        <Toggle checked={settings.edges !== "none"} onChange={(v) => api.changeSettings({ edges: v ? "auto" : "none" })}>Sharper edges</Toggle>
        <p className="dz-hint">Rows run the long way of hair, limbs and leaves, and shapes that touch are sewn at different angles. Sharper edges lay a thin line just inside the edge of big flat shapes in a logo or artwork, so the stitched shape matches the drawing more closely, for about 3% more stitches.</p>
        <Row label="Cloth" hint="What colour is the garment? Colours in the picture that match it are not stitched: the cloth shows through.">
          <ColorField value={design.fabricColor} label="Cloth colour" onChange={(c) => api.setFabricColor(c)} />
        </Row>
        <Toggle checked={settings.background === "auto"} onChange={(v) => api.changeSettings({ background: v ? "auto" : "none" })}>Leave out the background</Toggle>
        <Toggle checked={settings.people !== false} disabled={settings.background !== "auto"} onChange={(v) => api.changeSettings({ people: v })}>Find the person in a photo</Toggle>
        <p className="dz-hint">In a photo of a person the background is left out, and the hair, face, body and clothes each get colours of their own, so the face keeps its detail. The first time, the browser loads a small picture model (about 30 MB) and keeps it.</p>
        <Toggle checked={settings.snap} onChange={(v) => api.changeSettings({ snap: v })}>Use the nearest thread colours</Toggle>
        <Toggle checked={settings.details !== false} onChange={(v) => api.changeSettings({ details: v })}>Fine details on top</Toggle>
        <p className="dz-hint">Thin lines and tiny dots, such as leaf veins, twigs, eyelids, lashes and small dark spots, are found in the picture itself and sewn on top, last. For photos and artwork; a flat logo has none.</p>
        {settings.details !== false && (
          <Toggle checked={!!settings.detailThick} onChange={(v) => api.changeSettings({ detailThick: v })}>Thicker fine lines (hold up better on dense fills)</Toggle>
        )}
        <div className="dz-actions">
          <button type="button" className="kb-btn kb-btn--primary" disabled={!hasImage || converting} onClick={() => api.runConvert({})}>{converting ? "Working…" : "Convert again"}</button>
        </div>
        <p className="dz-hint">Converting again replaces the shapes made from the picture, including any changes you made to them.</p>
        {convertError && <p className="dz-warn" role="alert">{convertError}</p>}
        {api.design.objects.filter((o) => o.source === "image").length > (traceInfo && traceInfo.kind !== "logo" ? 4000 : 500) && (
          <p className="dz-warn">This picture has a lot of small shapes. Fewer colours, or Simple detail, gives a cleaner design that sews faster.</p>
        )}
        {settings.details !== false && traceInfo && !convertError && (
          traceInfo.kind === "logo"
            ? <p className="dz-note-inline">This picture is read as a logo (flat colours), so it has no fine details on top.</p>
            : traceInfo.details
              ? (linesNow + dotsNow > 0
                ? <p className="dz-note-inline">The design has {linesNow} fine {linesNow === 1 ? "line" : "lines"}{dotsNow ? ` and ${dotsNow} ${dotsNow === 1 ? "dot" : "dots"}` : ""} on top{linesNow === traceInfo.details.lines && dotsNow === traceInfo.details.dots ? ` (about ${n(traceInfo.details.stitchesEst)} stitches)` : ""}. Untick "Fine details on top" to leave them out.</p>
                : null)
              : <p className="dz-note-inline">No fine lines or dots were worth adding to this picture.</p>
        )}
        {traceInfo && traceInfo.person > 0 && settings.people !== false && !convertError && (
          <p className="dz-note-inline">A person was found ({Math.round(traceInfo.person * 100)}% of the picture). The background is left out, and the hair, skin and clothes were given colours of their own. Untick "Find the person in a photo" to keep the whole picture.</p>
        )}
        {traceInfo && traceInfo.widenedMm2 >= 1 && !convertError && (
          <p className="dz-note-inline">Very thin lines and lettering were made about half a millimetre wide, the thinnest a line of thread can be, and are sewn as one line of stitches. If letters run together, make the picture bigger.</p>
        )}
        {smallLetterMm > 0 && smallLetterMm < SMALL_LETTER_MM && !convertError && (
          <p className="dz-warn">
            The smallest lettering is only about {smallLetterMm.toFixed(1)} mm tall. Letters under {SMALL_LETTER_MM} mm do not sew clearly: make the whole design about {(SMALL_LETTER_MM / smallLetterMm).toFixed(1)} times bigger (it needs a bigger hoop), or leave the lettering out.
          </p>
        )}
        {/* Only for logos: in a photo or artwork most of this figure is the tiny pieces where two colours meet, not lost text or lines. */}
        {dropped >= 4 && traceInfo?.kind === "logo" && !convertError && (
          <p className="dz-note-inline">About {Math.round(dropped)} mm² of the picture was too fine to sew (small text, thin lines) and was left out. A bigger picture keeps more of it; Finest keeps the most.</p>
        )}
      </Group>

      <Group title="Trace by hand">
        <p className="dz-hint">Draw the shapes yourself: click round the edge of each part of the picture. The shape takes the colour the picture has under it. Good for small details the automatic conversion leaves out.</p>
        <div className="dz-actions">
          <button type="button" className="kb-btn kb-btn--ghost" disabled={!hasImage} onClick={api.startTracing}>Trace by hand</button>
        </div>
      </Group>

      {palette.length > 0 && (
        <Group title="Colours found">
          <ul className="dz-pal">
            {palette.map((p) => (
              <li key={p.index} className={p.background ? "is-bg" : ""}>
                <span className="dz-dot dz-dot--lg" style={{ background: p.hex }} />
                <span className="dz-pal-n">{p.name}{p.background ? " · background" : p.enclosed ? " · inside the design" : ""}{p.fineOnly ? " · fine parts only" : p.sameAsCloth ? " · like the cloth" : ""}</span>
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
          {palette.some((p) => p.fineOnly) && (
            <p className="dz-note-inline">
              {palette.filter((p) => p.fineOnly).map((p) => p.name).join(", ")} looks like the cloth, so only its fine lines and lettering are stitched; its larger areas show the cloth. Untick it to leave all of it out, or change the cloth colour above to the real garment colour.
            </p>
          )}
          <p className="dz-hint">Untick a colour to leave it out; tick one to stitch it. A colour like the cloth starts with only its fine parts stitched.</p>
        </Group>
      )}
    </>
  );
}

/**
 * The Picture step's side panel: the picture the design is made from (its size, crop and fading), the threads the person has, and how
 * the picture is turned into shapes (how many colours, how much detail, whether the background is left out), with the colours it found.
 * Only what is about THIS picture is written out (what was found, what to watch for); how each control works is in the tour and the
 * help (Tour.jsx, Help.jsx), not under every button.
 */
import { Group, Row, NumberField, Slider, Segmented, Toggle, ColorField } from "./Controls";
import HoopFit from "./HoopFit";
import ThreadsGroup from "./Threads";
import { followsPicture } from "../../lib/digitizer/model";
import { FACE_EYE_MIN_MM } from "../../lib/digitizer/faces";
import { letteringAdvice, adviceText } from "../../lib/digitizer/legible";

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
      <>
        <div className="dz-first">
          <h3>Start from a picture</h3>
          <button type="button" className="kb-btn kb-btn--primary" onClick={pickFile}>Choose a picture</button>
        </div>
        <ThreadsGroup api={api} />
      </>
    );
  }

  const widthMm = ref.crop.w * ref.mmPerPx;
  const heightMm = ref.crop.h * ref.mmPerPx;
  // How tall the smallest lettering is NOW: it was measured when the picture was converted, and grows with the picture.
  const smallLetterMm = traceInfo && traceInfo.kind !== "photo" && traceInfo.letters >= 4 && traceInfo.letterMm > 0 && traceInfo.widthMm > 0 ? traceInfo.letterMm * (widthMm / traceInfo.widthMm) : 0;
  // The lettering the converter found (runs of letters, trace/lettering.js), as big as it is NOW: sewn as one text, and how well it can be read at this size.
  const grow = traceInfo && traceInfo.widthMm > 0 ? widthMm / traceInfo.widthMm : 1;
  const found = traceInfo && traceInfo.lettering ? { ...traceInfo.lettering, capMm: traceInfo.lettering.capMm * grow, strokeMm: traceInfo.lettering.strokeMm * grow } : null;
  const foundAdvice = found ? letteringAdvice({ capMm: found.capMm, strokeMm: found.strokeMm, hair: found.hair || 0 }) : null;
  const colorValue = settings.colors === "auto" ? "auto" : settings.colors;
  const shapeCount = design.objects.filter(followsPicture).length; // made from the picture or traced over it
  // The fine lines and dots the design has NOW (undo, a deleted object or a new conversion changes them; the reading's count would go stale)
  const fineNow = design.objects.filter((o) => o.layer === "detail" && o.source === "image");
  const linesNow = fineNow.filter((o) => o.open).reduce((t, o) => t + o.rings.length, 0);
  const dotsNow = fineNow.filter((o) => !o.open).reduce((t, o) => t + o.rings.length, 0);

  const mine = api.settings.threads && api.settings.threads.length > 0 && api.settings.useThreads !== false; // the picture is made in the person's own threads

  return (
    <>
      <Group title="The picture">
        {!hasImage && <p className="dz-warn">The picture itself is not kept in a saved design. Choose it again to change how it is converted.</p>}
        <Row label="Width">
          <NumberField label="Picture width in millimetres" value={widthMm} min={5} max={1000} digits={1} step={1} unit="mm" disabled={!hasImage} onChange={(v) => api.setReferenceWidth(v)} />
        </Row>
        <p className="dz-hint">{widthMm.toFixed(1)} × {heightMm.toFixed(1)} mm</p>
        <HoopFit api={api} />
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
        {crop && <p className="dz-hint">Drag the white handles on the canvas, then press Done cropping.</p>}
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

      <ThreadsGroup api={api} />

      <Group title="Turn it into shapes">
        <Row label="Picture type" wide hint={settings.kind === "auto" && traceInfo ? `Looks like ${KIND_NAME[traceInfo.kind] || "a logo"}.` : undefined}>
          <Segmented label="Kind of picture" value={settings.kind || "auto"} onChange={(v) => api.changeSettings({ kind: v })} options={KIND_CHOICES} size="wrap" />
        </Row>
        <Row label="Colours" wide>
          <Segmented label="Number of colours" value={colorValue} onChange={(v) => api.changeSettings(v === "auto" ? { colors: "auto", maxColors: 12 } : { colors: v })} options={COLOR_CHOICES} size="wrap" />
        </Row>
        <Row label="Detail">
          <Slider label="Level of detail" value={settings.detail} min={0} max={1} step={0.05} onChange={(v) => api.changeSettings({ detail: v })} format={(v) => (v < 0.34 ? "Simple" : v < 0.67 ? "Balanced" : v < 0.95 ? "Detailed" : "Finest")} />
        </Row>
        <Toggle checked={settings.angles !== "plain"} onChange={(v) => api.changeSettings({ angles: v ? "auto" : "plain" })}>Stitch rows follow the shape</Toggle>
        <Toggle checked={settings.edges !== "none"} onChange={(v) => api.changeSettings({ edges: v ? "auto" : "none" })}>Sharper edges</Toggle>
        <Row label="Cloth">
          <ColorField value={design.fabricColor} label="Cloth colour" onChange={(c) => api.setFabricColor(c)} />
        </Row>
        <Toggle checked={settings.background === "auto"} onChange={(v) => api.changeSettings({ background: v ? "auto" : "none" })}>Leave out the background</Toggle>
        {settings.background === "none" && <p className="dz-hint">Off: the whole picture is stitched, the background too.</p>}
        <Toggle checked={settings.people !== false} disabled={settings.background !== "auto"} onChange={(v) => api.changeSettings({ people: v })} title="In a photo of a person the background is left out and the hair, face, body and clothes get colours of their own. The first time, the browser downloads two small picture models (about 35 MB in all) and keeps them.">Find the person in a photo</Toggle>
        <Toggle checked={settings.snap} disabled={mine} onChange={(v) => api.changeSettings({ snap: v })} title={mine ? "Not needed: the picture is made in your own threads" : "Move each colour to the nearest thread of the chart"}>Use the nearest thread colours</Toggle>
        <Toggle checked={settings.details !== false} onChange={(v) => api.changeSettings({ details: v })}>Fine details on top</Toggle>
        {settings.details !== false && (
          <Toggle checked={!!settings.detailThick} onChange={(v) => api.changeSettings({ detailThick: v })}>Thicker fine lines (hold up better on dense fills)</Toggle>
        )}
        <div className="dz-actions">
          <button type="button" className="kb-btn kb-btn--primary" disabled={!hasImage || converting} onClick={() => api.runConvert({})} title="Replaces the shapes made from the picture, including any changes you made to them. Undo brings them back.">{converting ? "Working…" : "Convert again"}</button>
        </div>
        {convertError && <p className="dz-warn" role="alert">{convertError}</p>}
        {api.design.objects.filter((o) => o.source === "image").length > (traceInfo && traceInfo.kind !== "logo" ? 4000 : 500) && (
          <p className="dz-warn">This picture has a lot of small shapes. Fewer colours, or Simple detail, gives a cleaner design that sews faster.</p>
        )}
        {settings.details !== false && traceInfo && !convertError && (
          traceInfo.kind === "logo"
            ? <p className="dz-note-inline">Read as a logo (flat colours): no fine details on top.</p>
            : traceInfo.details
              ? (linesNow + dotsNow > 0
                ? <p className="dz-note-inline">The design has {linesNow} fine {linesNow === 1 ? "line" : "lines"}{dotsNow ? ` and ${dotsNow} ${dotsNow === 1 ? "dot" : "dots"}` : ""} on top{linesNow === traceInfo.details.lines && dotsNow === traceInfo.details.dots ? ` (about ${n(traceInfo.details.stitchesEst)} stitches)` : ""}.</p>
                : null)
              : <p className="dz-note-inline">No fine lines or dots were worth adding to this picture.</p>
        )}
        {traceInfo && traceInfo.person > 0 && settings.people !== false && !convertError && (
          <p className="dz-note-inline">A person was found ({Math.round(traceInfo.person * 100)}% of the picture): the background is left out, and the hair, skin and clothes have colours of their own.</p>
        )}
        {traceInfo && traceInfo.face && settings.people !== false && !convertError && (() => {
          // found in the picture's own pixels, so it is true for the picture as it is now (bigger, smaller, cropped, after an undo)
          const faceMm = traceInfo.face.facePx * ref.mmPerPx;
          const eyeMm = traceInfo.face.eyePx * ref.mmPerPx;
          return eyeMm < FACE_EYE_MIN_MM
            ? <p className="dz-warn">The face is only about {faceMm.toFixed(0)} mm wide, so each eye is about {eyeMm.toFixed(1)} mm. Eyes that small sew as dark marks, not as eyes. {traceInfo.faceCrop ? "Crop to the face, or make the picture bigger." : "Make the picture bigger."}</p>
            : <p className="dz-note-inline">The face is about {faceMm.toFixed(0)} mm wide, so each eye is about {eyeMm.toFixed(1)} mm.</p>;
        })()}
        {traceInfo && traceInfo.faceCrop && settings.people !== false && !convertError && (
          <div className="dz-actions">
            <button type="button" className="kb-btn kb-btn--ghost" disabled={!hasImage || converting} onClick={api.cropToFace} title="Cut away what is round the head and shoulders, then make the result fill the hoop">Crop to the face</button>
          </div>
        )}
        {traceInfo && traceInfo.widenedMm2 >= 1 && !convertError && (
          <p className="dz-note-inline">Very thin lines and lettering were made about half a millimetre wide, the thinnest a thread can be. If letters run together, make the picture bigger.</p>
        )}
        {found && !convertError && (
          <p className={foundAdvice.level === "good" ? "dz-note-inline" : "dz-warn"}>
            Lettering found: {n(found.letters)} {found.letters === 1 ? "letter" : "letters"} in {found.blocks} {found.blocks === 1 ? "line" : "lines"}, the smallest about {found.capMm.toFixed(1)} mm tall.
            {foundAdvice.level !== "good" && ` ${adviceText(foundAdvice, { capMm: found.capMm, font: "this lettering" })} (Make the whole design about ${(foundAdvice.goodMm / found.capMm).toFixed(1)} times bigger; it needs a bigger hoop.)`}
          </p>
        )}
        {!found && smallLetterMm > 0 && smallLetterMm < SMALL_LETTER_MM && !convertError && (
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
        <div className="dz-actions">
          <button type="button" className="kb-btn kb-btn--ghost" disabled={!hasImage} onClick={api.startTracing} title="Draw the shapes yourself: click round the edge of each part of the picture">Trace by hand</button>
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
                <Toggle checked={!p.skipped} disabled={p.background} onChange={() => api.toggleSkip(p.index)} title="Stitch this colour">
                  <span className="dz-sr">Stitch {p.name}{p.enclosed ? " inside the design" : ""}</span>
                </Toggle>
              </li>
            ))}
          </ul>
        </Group>
      )}
    </>
  );
}

/**
 * The Stitches step's side panel: what the design comes to (stitches, colours, size, time), anything that will not sew well,
 * the threads in the order they are loaded, the machine's settings, and the buttons that save the file.
 */
import { Group, Row, NumberField, Toggle } from "./Controls";
import { FORMAT_CHOICES } from "../../lib/digitizer/formatsInfo";
import { HOOPS } from "../../lib/digitizer/model";
import { formatMinutes } from "../../lib/digitizer/stats";
import { rgbToHex, threadName } from "../../lib/embroidery/thread/chart";

const n = (v) => Number(v).toLocaleString("en-GB");

export default function StitchPanel({ api }) {
  const { design, summary, stitches, generating, genError, stale, exporting } = api;
  const settings = design.settings || {};
  const trimOver = settings.trimOver ?? 3;
  const lock = settings.lock ?? true;
  const centre = settings.centre ?? true;
  const setSettings = (patch) => api.setDesign({ settings: { ...settings, ...patch } }, "coalesce");

  if (!api.design.objects.some((o) => o.visible) && !stitches) {
    return <div className="dz-first"><h3>Nothing to stitch yet</h3><p>Add a picture, some text or a shape, then come back here to see the stitches and save the file.</p></div>;
  }

  const hoop = design.hoop;
  const tooBig = summary && (summary.widthMm > hoop.w + 0.05 || summary.heightMm > hoop.h + 0.05);
  const ready = !!stitches && !stale && !generating && !!summary?.stitches;
  const warnings = stitches?.warnings || [];

  return (
    <>
      <Group title="This design" action={generating ? <span className="dz-busy">Working…</span> : stale && !genError ? <span className="dz-busy">Updating…</span> : null}>
        {genError && <p className="dz-warn" role="alert">{genError}{stale ? " The numbers and threads below are from before this change, and saving is off until it is fixed." : ""}</p>}
        {summary ? (
          <dl className="dz-facts">
            <div><dt>Stitches</dt><dd>{n(summary.stitches)}</dd></div>
            <div><dt>Colours</dt><dd>{summary.blocks.length}</dd></div>
            <div><dt>Size</dt><dd>{summary.widthMm.toFixed(1)} × {summary.heightMm.toFixed(1)} mm</dd></div>
            <div><dt>Time</dt><dd>{formatMinutes(summary.minutes)}</dd></div>
            <div><dt>Trims</dt><dd>{summary.trims}</dd></div>
            <div><dt>Thread</dt><dd>~{summary.threadMetres.toFixed(1)} m</dd></div>
          </dl>
        ) : <p className="dz-hint">{generating ? "Making the stitches…" : "No stitches yet."}</p>}
        {tooBig && (
          <div className="dz-warn">
            <p>The design is bigger than the {hoop.w} × {hoop.h} mm hoop. Make it smaller, or use a bigger hoop.</p>
            <button type="button" className="kb-btn kb-btn--ghost" onClick={() => {
              const fit = HOOPS.filter((h) => h.w >= summary.widthMm + 4 && h.h >= summary.heightMm + 4).sort((a, b) => a.w * a.h - b.w * b.h)[0];
              api.setHoop(fit ? fit.w : Math.ceil(summary.widthMm + 6), fit ? fit.h : Math.ceil(summary.heightMm + 6));
            }}>Use the smallest hoop that fits</button>
          </div>
        )}
        {warnings.map((w, i) => <p key={i} className="dz-warn">{w.message}</p>)}
        <p className="dz-hint">Time is a guess for one machine head at {n(700)} stitches a minute.</p>
      </Group>

      {summary && (
        <Group title="Threads, in the order they are loaded">
          <ol className="dz-threads">
            {summary.blocks.map((b, i) => {
              const hex = b.thread ? rgbToHex(b.thread.r, b.thread.g, b.thread.b) : "#cccccc";
              return (
                <li key={i}>
                  <span className="dz-onum">{i + 1}</span>
                  <span className="dz-dot dz-dot--lg" style={{ background: hex }} />
                  <span className="dz-pal-n">{threadName(hex)}<small>{hex}</small></span>
                  <span className="dz-pal-p">{n(b.stitches)}</span>
                </li>
              );
            })}
          </ol>
        </Group>
      )}

      <Group title="Machine settings">
        <Row label="Cut thread on jumps over" hint="A jump longer than this is trimmed. Shorter ones are not.">
          <NumberField label="Trim distance in millimetres" value={trimOver} min={0.5} max={30} digits={1} step={0.5} unit="mm" onChange={(v) => setSettings({ trimOver: v })} />
        </Row>
        <Toggle checked={lock} onChange={(v) => setSettings({ lock: v })}>Add tie stitches at every start and cut</Toggle>
        <Toggle checked={centre} onChange={(v) => setSettings({ centre: v })}>Put the middle of the design at the middle of the hoop in the file</Toggle>
      </Group>

      <Group title="Save the file">
        <div className="dz-formats">
          {FORMAT_CHOICES.map((f) => (
            <button key={f.id} type="button" className={`dz-format${f.main ? " is-main" : ""}`} disabled={!ready || exporting} onClick={() => api.exportFormats([f.id])} title={`Save as ${f.label}`}>
              <strong>{f.label}</strong>
              <span>{f.who}</span>
            </button>
          ))}
        </div>
        <div className="dz-actions">
          <button type="button" className="kb-btn kb-btn--ghost" disabled={!ready || exporting} onClick={() => api.exportFormats(FORMAT_CHOICES.map((f) => f.id))}>Save all six</button>
          <button type="button" className="kb-btn kb-btn--ghost" disabled={!ready} onClick={() => api.exportPreview()}>Save a picture</button>
          <button type="button" className="kb-btn kb-btn--ghost" disabled={!ready} onClick={() => api.printProduction(["DST"])}>Print the sheet</button>
        </div>
        <p className="dz-hint">{centre ? "The file has the design centred on the middle of the hoop." : "The file keeps the design where you placed it in the hoop."} Wings XP and most machines open DST and PES.</p>
      </Group>
    </>
  );
}

/**
 * Embroidery Digitizer: a picture or some lettering in, a machine embroidery file out.
 *
 * One screen in the app's frosted-glass look: the objects of the design on the left (in the order they are sewn), the canvas
 * in the middle (the hoop, the shapes, the stitches), and what you can change on the right. Three steps along the top of the
 * canvas: Picture (its size, crop and colours, and how it is turned into shapes), Design (move, resize, recolour, add text and
 * shapes, choose how each is stitched) and Stitches (see them, save DST / PES / EXP / JEF / VP3 / XXX).
 *
 * It runs entirely in the browser and keeps nothing in the database: the picture is read on this computer, the stitches are
 * made by the engine in src/lib/embroidery (in a Web Worker), and the last design is remembered on this computer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BentoGrid, BentoPage } from "../components/bento/Bento";
import { Icons } from "../components/ui";
import Modal from "../components/Modal";
import StageCanvas from "../components/digitizer/StageCanvas";
import Toolbar from "../components/digitizer/Toolbar";
import ObjectsPane from "../components/digitizer/ObjectsPane";
import PicturePanel from "../components/digitizer/PicturePanel";
import InspectorPanel from "../components/digitizer/InspectorPanel";
import StitchPanel from "../components/digitizer/StitchPanel";
import { useDigitizer } from "../components/digitizer/useDigitizer";
import { PICTURE_TYPES } from "../lib/digitizer/image";
import { formatMinutes } from "../lib/digitizer/stats";
import "../components/digitizer/digitizer.css";

/** Machine embroidery files the page can open to look at and convert. */
const STITCH_FILE = /\.(dst|pes|pec|exp|jef|vp3|xxx|u01)$/i;

const isTyping = (e) => {
  const t = e.target;
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
};

export default function Digitizer() {
  const api = useDigitizer();
  const stageRef = useRef(null);
  const fileInput = useRef(null);
  const designInput = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const { design, mode, selection } = api;

  const pickFile = useCallback(() => fileInput.current?.click(), []);

  const onFiles = useCallback((files) => {
    const file = files && files[0];
    if (!file) return;
    if (/\.json$/i.test(file.name) || file.type === "application/json") api.openDesignFile(file);
    else if (STITCH_FILE.test(file.name)) api.openStitchFile(file);
    else api.loadPictureFile(file);
  }, [api]);

  // A picture or machine file dropped anywhere on the page is opened here: left alone, the browser would open it in this tab and
  // the work would be gone. (The canvas has its own drop handler, which marks the event as dealt with.)
  const filesRef = useRef(onFiles);
  filesRef.current = onFiles;
  useEffect(() => {
    const hasFiles = (e) => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
    const over = (e) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (!e.__dzHandled && e.dataTransfer.files?.length) filesRef.current(e.dataTransfer.files);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragover", over); window.removeEventListener("drop", drop); };
  }, []);

  /* ── keyboard ─────────────────────────────────────────────────────── */
  const latest = useRef(api);
  latest.current = api;
  useEffect(() => {
    const onKey = (e) => {
      const a = latest.current;
      if (isTyping(e) || e.altKey) return;
      if (document.querySelector(".kmodal-overlay")) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") { e.preventDefault(); if (e.shiftKey) a.redo(); else a.undo(); return; }
      if (mod && key === "y") { e.preventDefault(); a.redo(); return; }
      if (mod && key === "s") { e.preventDefault(); a.saveDesignFile(); return; }
      if (mod && key === "a") { e.preventDefault(); a.setSelection(a.design.objects.filter((o) => !o.locked).map((o) => o.id)); return; }
      if (mod && key === "d") { e.preventDefault(); if (a.selection.length) a.duplicate(a.selection); return; }
      if (mod) return;
      if (a.mode === "picture") { if (e.key === "Escape" && a.crop) a.setCrop(false); if (key === "f") stageRef.current?.fitDesign(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { if (a.selection.length) { e.preventDefault(); a.removeObjects(a.selection); } return; }
      if (e.key === "Escape") { a.setSelection([]); a.setTool("select"); a.stopSim(); return; }
      const ae = document.activeElement;
      const free = !ae || ae === document.body || ae.tagName === "CANVAS" || !!ae.closest?.(".dz-toolbar"); // not on some other button, which Enter must press
      if (e.key === "Enter" && free && (a.tool === "text" || a.tool === "rect" || a.tool === "ellipse")) {
        // Without a pointer: the shape or the words go in the middle of the hoop.
        e.preventDefault();
        if (a.tool === "text") a.stageHooks.onCreateText(0, 0); else a.stageHooks.onCreateShape(a.tool, null, [0, 0]);
        return;
      }
      if (key === "v") a.setTool("select");
      else if (key === "h") a.setTool("hand");
      else if (key === "r") a.setTool("rect");
      else if (key === "o") a.setTool("ellipse");
      else if (key === "t") a.setTool("text");
      else if (key === "f") stageRef.current?.fitHoop();
      else if (e.key === "[") { if (a.selection.length) a.stepOrder(a.selection, -1); }
      else if (e.key === "]") { if (a.selection.length) a.stepOrder(a.selection, 1); }
      else if (e.key.startsWith("Arrow") && a.selection.length) {
        e.preventDefault();
        const d = e.shiftKey ? 1 : 0.1;
        a.nudge(a.selection, e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0, e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const empty = !design.objects.length && !design.reference && !api.stitches;
  const s = api.summary;
  const total = api.stitches ? api.stitches.flat.length / 3 : 0;
  // The slider moves one step per record (a jump or a cut is a step too), but people count stitches: show the stitch number.
  const stitchesBefore = useMemo(() => {
    const flat = api.stitches?.flat;
    if (!flat) return null;
    const count = new Uint32Array(flat.length / 3 + 1);
    for (let i = 0; i < flat.length / 3; i++) count[i + 1] = count[i] + (flat[i * 3 + 2] === 0 ? 1 : 0);
    return count;
  }, [api.stitches]);
  const sewnNo = stitchesBefore ? stitchesBefore[Math.min(total, Math.max(0, Math.round(api.sim.pos ?? total)))] : 0;
  const panelTitle = mode === "picture" ? "Picture" : mode === "stitches" ? "Stitches" : api.selected.length ? "Properties" : "Design";

  return (
    <BentoPage className="dz-page">
      <header className="kb-head kb-head--stack">
        <div className="kb-head-l">
          <h1>Embroidery Digitizer</h1>
          <p className="kb-head-sub">
            {s ? (
              <>
                <span>{s.stitches.toLocaleString("en-GB")} stitches</span>
                <span>{s.blocks.length} colour{s.blocks.length === 1 ? "" : "s"}</span>
                <span>{s.widthMm.toFixed(1)} × {s.heightMm.toFixed(1)} mm</span>
                <span>{formatMinutes(s.minutes)}</span>
              </>
            ) : <span>A logo or lettering in, a machine stitch file out</span>}
          </p>
        </div>
        <div className="kb-head-r dz-headbtns">
          <button type="button" className="kb-pillbtn" onClick={api.undo} disabled={!api.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)"><Icons.Reply size={14} sw={1.9} aria-hidden="true" /> Undo</button>
          <button type="button" className="kb-pillbtn" onClick={api.redo} disabled={!api.canRedo} aria-label="Redo" title="Redo (Ctrl+Y)">Redo</button>
          <button type="button" className="kb-pillbtn" onClick={() => designInput.current?.click()} title="Open a design saved from this page, or a machine file (DST, PES, EXP, JEF, VP3, XXX) to look at it or save it as another type">Open</button>
          <button type="button" className="kb-pillbtn" onClick={api.saveDesignFile} disabled={!design.objects.length} title="Save the design to edit later (Ctrl+S)">Save design</button>
          <button type="button" className="kb-pillbtn" onClick={api.newFile} disabled={empty}>New</button>
          <button type="button" className="kb-btn kb-btn--primary" onClick={pickFile}>Choose picture</button>
        </div>
      </header>

      {api.notice && (
        <div className={`dz-note dz-note--${api.notice.kind}`} role="status">
          <span>{api.notice.text}</span>
          <button type="button" aria-label="Dismiss" onClick={api.dismissNotice}>×</button>
        </div>
      )}

      <BentoGrid layout="digitizer">
        <section className="kb-tile dz-tile dz-left" aria-label="Objects">
          <div className="kb-hd"><h2 className="kb-ttl">Objects</h2><span className="kb-note">{design.objects.length}</span></div>
          <ObjectsPane api={api} />
        </section>

        <section
          className={`kb-tile dz-tile dz-stage${dragOver ? " is-drop" : ""}`}
          aria-label="Canvas"
          onDragOver={(e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
          onDrop={(e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); e.nativeEvent.__dzHandled = true; setDragOver(false); onFiles(e.dataTransfer.files); } }}
        >
          <Toolbar
            api={api}
            zoomPct={(api.view.k / 3.7795) * 100}
            onZoom={(f) => stageRef.current?.zoomAt(f, stageRef.current.size.w / 2, stageRef.current.size.h / 2)}
            onFit={() => (mode === "picture" ? stageRef.current?.fitDesign() : stageRef.current?.fitHoop())}
          />
          <div className="dz-canvas-wrap">
            <StageCanvas api={api} stageRef={stageRef} />
            {empty && api.tool !== "select" && (
              <div className="dz-hint-chip" role="status">
                {api.tool === "text" ? "Click on the hoop where the words should go, or press Enter for the middle." : "Click or drag on the hoop to draw the shape, or press Enter for one in the middle."}
                <button type="button" onClick={() => api.setTool("select")}>Cancel</button>
              </div>
            )}
            {empty && api.tool === "select" && (
              <div className="dz-empty-stage">
                <div className="dz-card">
                  <span className="dz-card-chip" aria-hidden="true"><Icons.Needle size={22} sw={1.7} /></span>
                  <h2>Start with a picture</h2>
                  <p>Drop the client&apos;s logo here, or choose a file.</p>
                  <ol className="dz-steps">
                    <li><b>Picture</b> It is turned into shapes, one for each colour.</li>
                    <li><b>Design</b> Move, resize and recolour them, and add text.</li>
                    <li><b>Stitches</b> Watch it being sewn, then save the file for the machine.</li>
                  </ol>
                  <div className="dz-actions dz-actions--center">
                    <button type="button" className="kb-btn kb-btn--primary" onClick={pickFile}>Choose a picture</button>
                    <button type="button" className="kb-btn kb-btn--ghost" onClick={() => api.setTool("text")}>Start with text</button>
                    {api.restorable && <button type="button" className="kb-btn kb-btn--ghost" onClick={api.restore}>Open my last design</button>}
                  </div>
                  <p className="dz-hint">Click with the Text tool anywhere on the hoop to add words.</p>
                </div>
              </div>
            )}
            {api.converting && <div className="dz-busy-bar" role="status">Reading the picture…</div>}
            {dragOver && <div className="dz-drop" aria-hidden="true">Drop to open</div>}
          </div>
          {mode === "stitches" && api.stitches && (
            <div className="dz-sim" role="group" aria-label="Stitch preview">
              <button type="button" className="dz-tool" aria-label={api.sim.playing ? "Pause" : "Play the stitching"} title={api.sim.playing ? "Pause" : "Watch it being sewn"} onClick={api.sim.playing ? api.pauseSim : api.playSim}>
                {api.sim.playing ? <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg> : <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>}
              </button>
              <button type="button" className="dz-tool" aria-label="Show all stitches" title="Show all stitches" onClick={api.stopSim} disabled={api.sim.pos == null}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
              </button>
              <input type="range" aria-label="How far through the stitching" min={0} max={total} step={1} value={api.sim.pos ?? total} onChange={(e) => api.seekSim(Number(e.target.value))} />
              <output title="Stitch number">{sewnNo.toLocaleString("en-GB")} / {(stitchesBefore ? stitchesBefore[total] : 0).toLocaleString("en-GB")}</output>
              <label className="dz-speed">Speed
                <select value={api.sim.speed} onChange={(e) => api.setSimSpeed(Number(e.target.value))} aria-label="Playback speed">
                  <option value={800}>Slow</option>
                  <option value={3000}>Normal</option>
                  <option value={12000}>Fast</option>
                  <option value={40000}>Very fast</option>
                </select>
              </label>
              <label className="dz-chk"><input type="checkbox" checked={api.prefs.showJumps} onChange={(e) => api.setPrefs({ showJumps: e.target.checked })} /> Show jumps</label>
              {api.stitches.checks?.piledCount > 0 && (
                <label className="dz-chk"><input type="checkbox" checked={!!api.prefs.showProblems} onChange={(e) => api.setPrefs({ showProblems: e.target.checked })} /> Show crowded spots</label>
              )}
            </div>
          )}
        </section>

        <section className="kb-tile dz-tile dz-right" aria-label={panelTitle}>
          <div className="kb-hd"><h2 className="kb-ttl">{panelTitle}</h2>{selection.length > 0 && mode === "design" && <span className="kb-note">{selection.length} selected</span>}</div>
          <div className="dz-panel">
            {mode === "picture" && <PicturePanel api={api} pickFile={pickFile} />}
            {mode === "design" && <InspectorPanel api={api} />}
            {mode === "stitches" && <StitchPanel api={api} />}
          </div>
        </section>
      </BentoGrid>

      <input ref={fileInput} type="file" accept={PICTURE_TYPES} hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      <input ref={designInput} type="file" accept=".json,application/json,.dst,.pes,.pec,.exp,.jef,.vp3,.xxx,.u01" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />

      {api.replacing && (
        <Modal
          title="Replace your current design?"
          size="sm"
          glass
          onClose={api.cancelReplace}
          footer={(
            <>
              <button type="button" className="ghost-button" onClick={api.cancelReplace}>Keep working</button>
              <button type="button" className="primary-button" onClick={api.confirmReplace}>Replace it</button>
            </>
          )}
        >
          <p>You have changes that are not saved. If you {api.replacing.what}, they are gone. Press Save design first if you want to keep them.</p>
        </Modal>
      )}
    </BentoPage>
  );
}

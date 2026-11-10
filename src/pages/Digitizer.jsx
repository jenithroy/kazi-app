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
import Select from "../components/Select";
import { Toggle } from "../components/digitizer/Controls";
import StageCanvas from "../components/digitizer/StageCanvas";
import Toolbar from "../components/digitizer/Toolbar";
import TraceBar from "../components/digitizer/TraceBar";
import CanvasMenu from "../components/digitizer/CanvasMenu";
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

/** How fast the stitch preview plays (stitches a second). */
const SPEEDS = [
  { value: 800, label: "Slow" },
  { value: 3000, label: "Normal" },
  { value: 12000, label: "Fast" },
  { value: 40000, label: "Very fast" },
];

// A dropdown (the shared Select is a button, not a <select>) keeps its own keys: a letter typed on it must not pick a tool, nor Delete remove the shapes.
const isTyping = (e) => {
  const t = e.target;
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable || !!t.closest?.(".ksel"));
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

  // A picture copied anywhere (a screenshot, a picture from a web page, a file copied in the file manager) is opened by Ctrl+V.
  useEffect(() => {
    const onPaste = (e) => {
      if (document.querySelector(".kmodal-overlay")) return;
      const data = e.clipboardData;
      if (!data) return;
      const files = [...(data.files || [])];
      if (!files.length) for (const item of data.items || []) { const f = item.kind === "file" ? item.getAsFile() : null; if (f) files.push(f); }
      const file = files.find((f) => /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|svg|json)$/i.test(f.name) || STITCH_FILE.test(f.name));
      if (!file) return;
      if (isTyping(e) && [...(data.types || [])].includes("text/plain")) return; // words pasted into a box stay words
      e.preventDefault();
      // A screenshot arrives called "image.png": give it a name that means something (it names the design).
      const ext = { "image/jpeg": "jpg", "image/svg+xml": "svg" }[file.type] || file.type.split("/")[1] || "png";
      filesRef.current([/^image\.\w+$/i.test(file.name) ? new File([file], `Pasted picture.${ext}`, { type: file.type }) : file]);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
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
      const tracing = a.tool === "trace" && !!a.trace; // a shape is half drawn: its keys come first
      if (mod && key === "z") { e.preventDefault(); if (tracing && !e.shiftKey) a.traceBack(); else if (e.shiftKey) a.redo(); else a.undo(); return; }
      if (mod && key === "y") { e.preventDefault(); a.redo(); return; }
      if (mod && key === "s") { e.preventDefault(); a.saveDesignFile(); return; }
      if (mod && key === "a") { e.preventDefault(); a.setSelection(a.design.objects.filter((o) => !o.locked).map((o) => o.id)); return; }
      if (mod && key === "d") { e.preventDefault(); if (a.selection.length) a.duplicate(a.selection); return; }
      if (mod) return;
      if (a.mode === "picture") { if (e.key === "Escape" && a.crop) a.setCrop(false); if (key === "f") stageRef.current?.fitDesign(); return; }
      const ae = document.activeElement;
      const free = !ae || ae === document.body || ae.tagName === "CANVAS" || !!ae.closest?.(".dz-toolbar"); // not on some other button, which Enter must press
      if (tracing) {
        if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); a.traceBack(); return; }
        if (e.key === "Escape") { a.traceCancel(); return; }
        if (e.key === "Enter" && free) { e.preventDefault(); a.traceFinish(); return; }
        // Half a shape is not thrown away by a tool key pressed by mistake (H, to move around, is the usual one): Space or a right-drag moves the view.
        if (["v", "h", "r", "o", "t", "p"].includes(key)) return;
      }
      // With the trace tool the selected shape has no handles on screen, so keys that would act on it do nothing.
      if (a.tool === "trace" && (e.key === "Delete" || e.key === "Backspace" || e.key.startsWith("Arrow") || e.key === "[" || e.key === "]")) return;
      if (e.key === "Delete" || e.key === "Backspace") { if (a.selection.length) { e.preventDefault(); a.removeObjects(a.selection); } return; }
      if (e.key === "Escape") { a.setSelection([]); a.setTool("select"); a.stopSim(); return; }
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
      else if (key === "p") a.setTool("trace");
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
  // The machine file can be saved as soon as the stitches are made and match the design (not while they are being remade).
  const ready = !!api.stitches && !api.stale && !api.generating && !!s?.stitches;
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
  // "Make it fill the hoop" changes the design's size: afterwards show all of it, or most of the bigger design is out of view.
  const panelApi = {
    ...api,
    fitToHoop: async () => {
      await api.fitToHoop();
      setTimeout(() => (mode === "picture" ? stageRef.current?.fitDesign() : stageRef.current?.fitHoop()), 80);
    },
  };

  return (
    <BentoPage className="dz-page">
      <header className="kb-head kb-head--stack">
        <div className="kb-head-l">
          <h1>Embroidery Digitizer</h1>
          <p className="kb-head-sub">
            {s ? (
              <>
                <span>{s.stitches.toLocaleString("en-GB")} stitches</span>
                <span>{s.colours ?? s.blocks.length} colour{(s.colours ?? s.blocks.length) === 1 ? "" : "s"}</span>
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
          {ready && (
            <button type="button" className="kb-btn kb-btn--primary" onClick={() => api.exportFormats(["dst"])} disabled={api.exporting} title="Download the stitch file for the machine: DST, which Tajima, Barudan, ZSK, SWF and most industrial machines read. Other types (PES, EXP, JEF, VP3, XXX) are in the Stitches step.">
              Download DST
            </button>
          )}
          <button type="button" className={ready ? "kb-pillbtn" : "kb-btn kb-btn--primary"} onClick={pickFile}>Choose picture</button>
        </div>
      </header>

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
          <div className={`dz-canvas-wrap${mode === "design" && api.tool === "trace" ? " is-tracing" : ""}`}>
            <StageCanvas api={api} stageRef={stageRef} />
            {mode === "design" && api.tool === "trace" && <TraceBar api={api} />}
            {empty && api.tool !== "select" && api.tool !== "trace" && (
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
                  <p>Drop the client&apos;s logo here, paste it with Ctrl+V, or choose a file.</p>
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
            {/* Over the canvas, not above the page: a banner in the page pushed the canvas down while it showed, and a point clicked then landed off target. */}
            {api.notice && (
              <div className={`dz-note dz-note--${api.notice.kind}`} role="status">
                <span>{api.notice.text}</span>
                <button type="button" aria-label="Dismiss" onClick={api.dismissNotice}>×</button>
              </div>
            )}
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
              <span className="dz-speed">
                <span>Speed</span>
                <Select variant="pill" on={false} searchable={false} label="Playback speed" value={api.sim.speed} options={SPEEDS} minWidth={130} onChange={(v) => api.setSimSpeed(Number(v))} />
              </span>
              <Toggle checked={!!api.prefs.showJumps} onChange={(v) => api.setPrefs({ showJumps: v })}>Show jumps</Toggle>
              {api.stitches.checks?.piledCount > 0 && (
                <Toggle checked={!!api.prefs.showProblems} onChange={(v) => api.setPrefs({ showProblems: v })}>Show crowded spots</Toggle>
              )}
            </div>
          )}
        </section>

        <section className="kb-tile dz-tile dz-right" aria-label={panelTitle}>
          <div className="kb-hd"><h2 className="kb-ttl">{panelTitle}</h2>{selection.length > 0 && mode === "design" && <span className="kb-note">{selection.length} selected</span>}</div>
          <div className="dz-panel">
            {mode === "picture" && <PicturePanel api={panelApi} pickFile={pickFile} />}
            {mode === "design" && <InspectorPanel api={panelApi} />}
            {mode === "stitches" && <StitchPanel api={api} />}
          </div>
        </section>
      </BentoGrid>

      <input ref={fileInput} type="file" accept={PICTURE_TYPES} hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      <input ref={designInput} type="file" accept=".json,application/json,.dst,.pes,.pec,.exp,.jef,.vp3,.xxx,.u01" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />

      {api.menu && <CanvasMenu api={api} />}

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

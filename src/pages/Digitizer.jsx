/**
 * Embroidery Digitizer: a picture or some lettering in, a machine embroidery file out.
 *
 * A full-screen workspace, laid out as on the Kazi website's digitizer: the canvas fills the page (the hoop, the shapes, the stitches) and
 * the controls are small and float over its edges, in this app's frosted-glass look. On the left a slim rail holds the tools, undo and
 * redo and the file buttons, with the Objects of the design (in the order they are sewn) beside it; on the right one panel holds what you
 * can change. Three steps: Picture (its size, crop and colours, the threads you have, and how it is turned into shapes), Design (move,
 * resize, recolour, add text and shapes, choose how each is stitched) and Stitches (see them, save DST / PES / EXP / JEF / VP3 / XXX).
 * The "?" opens the help, and the first visit takes the tour.
 *
 * It runs entirely in the browser and keeps nothing in the database: the picture is read on this computer, the stitches are made by the
 * engine in src/lib/embroidery (in a Web Worker), and the last design is remembered on this computer.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "../components/ui";
import Modal from "../components/Modal";
import Select from "../components/Select";
import { Needle, Question, X } from "../components/digitizer/icons";
import { Toggle, Segmented } from "../components/digitizer/Controls";
import StageCanvas from "../components/digitizer/StageCanvas";
import ToolRail, { ZoomBar } from "../components/digitizer/Toolbar";
import TraceBar from "../components/digitizer/TraceBar";
import CanvasMenu from "../components/digitizer/CanvasMenu";
import ObjectsPane from "../components/digitizer/ObjectsPane";
import PicturePanel from "../components/digitizer/PicturePanel";
import InspectorPanel from "../components/digitizer/InspectorPanel";
import StitchPanel from "../components/digitizer/StitchPanel";
import Help from "../components/digitizer/Help";
import { warmHelp } from "../components/digitizer/helpClips"; // (the first clip is fetched while the pointer is on the "?", so the help opens on a moving picture)
import Tour, { tourSeen } from "../components/digitizer/Tour";
import { useDigitizer } from "../components/digitizer/useDigitizer";
import { PICTURE_TYPES } from "../lib/digitizer/image";
import { formatMinutes } from "../lib/digitizer/stats";
import "../components/digitizer/digitizer.css";

/** Machine embroidery files the page can open to look at and convert. */
const STITCH_FILE = /\.(dst|pes|pec|exp|jef|vp3|xxx|u01)$/i;

/** The picture the "try it" button opens, so a visitor can see the whole thing work without finding a logo of their own. */
const EXAMPLE_PICTURE = { url: "/kazi-logo-trimmed.png", name: "Kazi logo.png" };

/** How fast the stitch preview plays (stitches a second). */
const SPEEDS = [
  { value: 800, label: "Slow" },
  { value: 3000, label: "Normal" },
  { value: 12000, label: "Fast" },
  { value: 40000, label: "Very fast" },
];

// A dropdown keeps its own keys: a letter typed on it must not pick a tool, nor Delete remove the shapes.
const isTyping = (e) => {
  const t = e.target;
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable || !!t.closest?.(".ksel"));
};

export default function Digitizer() {
  const api = useDigitizer();
  const stageRef = useRef(null);
  const pageRef = useRef(null);
  const panelRef = useRef(null); // the right-hand panel's scrolling body
  const overRef = useRef(false); // the pointer is over the editor
  const fileInput = useRef(null);
  const designInput = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const { design, mode, selection } = api;

  // The help ("?": every feature with a video) and the tour of the screen. The tour starts by itself only for someone who has never seen it.
  const [helpOpen, setHelpOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const helpToggle = useRef(null);
  helpToggle.current = () => setHelpOpen((o) => !o);
  useEffect(() => {
    // Not in a browser driven by a script (a test, a crawler): a tour over the page would take its clicks.
    if (tourSeen() || navigator.webdriver) return undefined;
    let t = 0;
    const go = () => { t = setTimeout(() => setTourOpen(true), 900); };
    t = setTimeout(go, 1200); // once the page has settled
    return () => clearTimeout(t);
  }, []);

  // A different step, or shapes picked or let go, is a different panel: it starts at its top, not where the last one was scrolled to.
  // (Scrolled, not remounted: the panels keep their own state, and the text box takes the keyboard only when it is asked to.)
  const somethingSelected = selection.length > 0;
  useEffect(() => { panelRef.current?.scrollTo({ top: 0 }); }, [mode, somethingSelected]);

  // The Objects list starts closed, so the canvas is clear; the button on the rail (with the number of objects) opens it. What the person
  // chooses is remembered.
  const objectsOpen = !!api.prefs.objectsOpen;
  const toggleObjects = () => api.setPrefs({ objectsOpen: !objectsOpen });

  // How much of the canvas's left and right edges the floating columns cover, and of its bottom the zoom chip and the player (px), so the
  // hoop is fitted to the room between them. All zero when they are stacked around the canvas (a phone). They announce themselves with
  // data-dz-float. (The chip is always there, so the hoop does not change size when the player comes and goes.)
  const [insets, setInsets] = useState({ l: 0, r: 0, b: 0 });
  const hasStitches = !!api.stitches; // (with the Stitches step, the player is on show: it has to be found and watched)
  useLayoutEffect(() => {
    const root = pageRef.current;
    if (!root) return undefined;
    const measure = () => {
      const wrap = root.querySelector(".dz-canvas-wrap");
      if (!wrap) return;
      const w = wrap.getBoundingClientRect();
      let l = 0, r = 0, bottom = 0;
      for (const el of root.querySelectorAll("[data-dz-float]")) {
        if (getComputedStyle(el).position !== "absolute") continue;
        const b = el.getBoundingClientRect();
        const side = el.dataset.dzFloat;
        if (side === "left") l = Math.max(l, Math.ceil(b.right - w.left));
        else if (side === "right") r = Math.max(r, Math.ceil(w.right - b.left));
        else bottom = Math.max(bottom, Math.ceil(w.bottom - b.top));
      }
      setInsets((prev) => (prev.l === l && prev.r === r && prev.b === bottom ? prev : { l, r, b: bottom }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    root.querySelectorAll("[data-dz-float]").forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [objectsOpen, mode, hasStitches]);

  const pickFile = useCallback(() => fileInput.current?.click(), []);

  const onFiles = useCallback((files) => {
    const file = files && files[0];
    if (!file) return;
    if (/\.json$/i.test(file.name) || file.type === "application/json") api.openDesignFile(file);
    else if (STITCH_FILE.test(file.name)) api.openStitchFile(file);
    else api.loadPictureFile(file);
  }, [api]);

  const tryExample = useCallback(async () => {
    try {
      const res = await fetch(EXAMPLE_PICTURE.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      api.loadPictureFile(new File([blob], EXAMPLE_PICTURE.name, { type: blob.type || "image/png" }));
    } catch {
      api.notify("The example picture could not be loaded. Choose a picture of your own instead.", "error");
    }
  }, [api]);

  // A picture or machine file dropped anywhere on the page is opened here: left alone, the browser would open it in this tab and
  // the work would be gone. (The canvas has its own drop handler, which marks the event as dealt with.)
  const filesRef = useRef(onFiles);
  useEffect(() => { filesRef.current = onFiles; });
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
      if (document.querySelector(".kmodal-overlay, .dz-tour")) return;
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
  useEffect(() => { latest.current = api; });
  useEffect(() => {
    const onKey = (e) => {
      const a = latest.current;
      // These keys belong to the editor, not to the whole page: Ctrl+A, Ctrl+D (bookmark) and the plain letters are the browser's
      // everywhere else on it. They act only while the keyboard focus is in the editor or the pointer is over it.
      const root = pageRef.current;
      if (!root || !(root.contains(document.activeElement) || overRef.current)) return;
      if (isTyping(e) || e.altKey) return;
      if (document.querySelector(".kmodal-overlay, .dz-tour")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "?" && !mod) { e.preventDefault(); helpToggle.current?.(); return; }
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
  const colourCount = s ? (s.colours ?? s.blocks.length) : 0;
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
  const player = mode === "stitches" && !!api.stitches;

  return (
    // The whole page is a drop target for a picture or a machine file. (`kb`: the app's page frame, see bento.css.)
    <div
      ref={pageRef}
      className={cn("kb dz-page", objectsOpen && "has-objects", player && "has-player", dragOver && "is-drop")}
      style={{ "--dz-inset-l": `${insets.l}px`, "--dz-inset-r": `${insets.r}px` }}
      onPointerEnter={() => { overRef.current = true; }}
      onPointerLeave={() => { overRef.current = false; }}
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
      onDrop={(e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); e.nativeEvent.__dzHandled = true; setDragOver(false); onFiles(e.dataTransfer.files); } }}
    >
      <h1 className="dz-sr">Embroidery Digitizer</h1>
      {/* The canvas fills the page; everything else floats over it. */}
      <section className={`dz-canvas-wrap${mode === "design" && api.tool === "trace" ? " is-tracing" : ""}`} aria-label="Canvas">
        <StageCanvas api={api} stageRef={stageRef} insets={insets} />
        {mode === "design" && api.tool === "trace" && <TraceBar api={api} />}
        {empty && api.tool !== "select" && api.tool !== "trace" && (
          <div className="dz-hint-chip" role="status">
            {api.tool === "text" ? "Click on the hoop where the words should go, or press Enter for the middle." : "Click or drag on the hoop to draw the shape, or press Enter for one in the middle."}
            <button type="button" onClick={() => api.setTool("select")}>Cancel</button>
          </div>
        )}
        {empty && api.tool === "select" && (
          <div className="dz-empty-stage">
            <div className="dz-card-empty">
              <span className="dz-card-chip" aria-hidden="true"><Needle size={22} /></span>
              <h2>Start with a picture</h2>
              <p>Drop the client&rsquo;s logo here, paste it with Ctrl+V, or choose a file.</p>
              <div className="dz-actions dz-actions--center">
                <button type="button" className="kb-btn kb-btn--primary" onClick={pickFile}>Choose a picture</button>
                <button type="button" className="kb-btn kb-btn--ghost" onClick={tryExample}>Try the Kazi logo</button>
                <button type="button" className="kb-btn kb-btn--ghost" onClick={() => api.setTool("text")}>Start with text</button>
                {api.restorable && <button type="button" className="kb-btn kb-btn--ghost" onClick={api.restore}>Open my last design</button>}
              </div>
              <p className="dz-hint">Everything runs in this browser: pictures and designs are not uploaded, and nothing is kept in the database. The last design is remembered on this computer only.</p>
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
        <button type="button" className={`dz-help-btn${helpOpen ? " is-on" : ""}`} aria-label="Help and tutorials" aria-expanded={helpOpen} title="Help: a video of every feature (?)" onPointerEnter={warmHelp} onFocus={warmHelp} onClick={() => setHelpOpen((o) => !o)}>
          <Question size={16} weight="bold" aria-hidden="true" />
        </button>
      </section>

      {helpOpen && <Help onClose={() => setHelpOpen(false)} onTour={() => { setHelpOpen(false); setTourOpen(true); }} />}
      {tourOpen && <Tour api={api} onClose={() => setTourOpen(false)} />}

      {/* Left: the tools, and the Objects of the design beside them. */}
      <div className="dz-left" data-dz-float="left">
        <ToolRail api={api} objectsOpen={objectsOpen} onToggleObjects={toggleObjects} onOpenFile={() => designInput.current?.click()} />
        {objectsOpen && (
          <section className="dz-card dz-objects-card" aria-label="Objects">
            <div className="dz-card-hd">
              <h2>Objects</h2>
              <span className="dz-card-note">{design.objects.length}</span>
              <button type="button" className="dz-card-x" aria-label="Close the Objects list" title="Close" onClick={toggleObjects}><X size={14} aria-hidden="true" /></button>
            </div>
            <ObjectsPane api={api} />
          </section>
        )}
      </div>

      <ZoomBar
        api={api}
        zoomPct={(api.view.k / 3.7795) * 100}
        onZoom={(f) => stageRef.current?.zoomAt(f, stageRef.current.size.w / 2, stageRef.current.size.h / 2)}
        onFit={() => (mode === "picture" ? stageRef.current?.fitDesign() : stageRef.current?.fitHoop())}
      />

      {/* Bottom: the player, only while the stitches are on show. */}
      {player && (
        <div className="dz-sim" data-dz-float="bottom">
          <div className="dz-sim-in" role="group" aria-label="Stitch preview">
            <button type="button" className="dz-tool" aria-label={api.sim.playing ? "Pause" : "Play the stitching"} title={api.sim.playing ? "Pause" : "Watch it being sewn"} onClick={api.sim.playing ? api.pauseSim : api.playSim}>
              {api.sim.playing ? <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg> : <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>}
            </button>
            <button type="button" className="dz-tool" aria-label="Show all stitches" title="Show all stitches" onClick={api.stopSim} disabled={api.sim.pos == null}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
            </button>
            <input type="range" aria-label="How far through the stitching" min={0} max={total} step={1} value={api.sim.pos ?? total} style={{ "--p": `${total ? (Math.min(total, Math.max(0, api.sim.pos ?? total)) / total) * 100 : 100}%` }} onChange={(e) => api.seekSim(Number(e.target.value))} />
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
        </div>
      )}

      {/* Right: the three steps and what can be changed in each. */}
      <aside className="dz-right dz-card" data-dz-float="right" aria-label={panelTitle}>
        <div className="dz-steps-hd">
          <Segmented
            label="Step"
            value={mode}
            onChange={api.setMode}
            options={[
              { value: "picture", label: "Picture", title: "The picture, its size, crop and colours" },
              { value: "design", label: "Design", title: "Move, resize and recolour shapes" },
              { value: "stitches", label: "Stitches", title: "See the stitches and save the file" },
            ]}
            size="step"
          />
        </div>
        {/* (The Stitches step shows these figures, and more, in its own panel.) */}
        {mode !== "stitches" && <p className={`dz-stats${s ? "" : " is-empty"}`}>
          {s ? (
            <>
              <span><b>{s.stitches.toLocaleString("en-GB")}</b> stitches</span>
              <span><b>{colourCount}</b> colour{colourCount === 1 ? "" : "s"}</span>
              <span><b>{s.widthMm.toFixed(1)} × {s.heightMm.toFixed(1)}</b> mm</span>
              <span><b>{formatMinutes(s.minutes)}</b></span>
            </>
          ) : <span>Logo or lettering in, stitch file out</span>}
        </p>}
        <div className="dz-panel" ref={panelRef}>
          {mode === "picture" && <PicturePanel api={panelApi} pickFile={pickFile} />}
          {mode === "design" && <InspectorPanel api={panelApi} />}
          {mode === "stitches" && <StitchPanel api={api} />}
        </div>
        <div className="dz-card-ft">
          {empty ? (
            <button type="button" className="kb-btn kb-btn--primary" onClick={pickFile}>Choose picture</button>
          ) : (
            <>
              <button type="button" className="kb-btn" onClick={pickFile}>Choose picture</button>
              <button type="button" className="kb-btn kb-btn--primary" onClick={() => api.exportFormats(["dst"])} disabled={!ready || api.exporting} title="Download the stitch file for the machine: DST, which Tajima, Barudan, ZSK, SWF and most industrial machines read. Other types (PES, EXP, JEF, VP3, XXX) are in the Stitches step.">
                Download DST
              </button>
            </>
          )}
        </div>
      </aside>

      <input ref={fileInput} type="file" accept={PICTURE_TYPES} hidden aria-label="Choose a picture" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      <input ref={designInput} type="file" accept=".json,application/json,.dst,.pes,.pec,.exp,.jef,.vp3,.xxx,.u01" hidden aria-label="Open a saved design or a machine file" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />

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
    </div>
  );
}

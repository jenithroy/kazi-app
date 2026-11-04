/**
 * Everything the Digitizer page DOES, in one hook: the design and its undo history, what is selected, the picture and its
 * conversion into shapes, lettering, the stitch engine (run in a worker, a moment after the design stops changing), and the
 * files that come out. The page and its panels only draw this and call it.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createHistory } from "../../lib/digitizer/history";
import { createEngine } from "../../lib/digitizer/engineClient";
import { findPerson, disposePersonFinder } from "../../lib/digitizer/segmentClient";
import {
  newDesign, makeObject, boxOfObjects, objectBox, objectCorners, moveObject, setObjectSize, setObjectCentre, withTransform, scaleObjectAbout, flipObject,
  breakApart, fillHoles, cloneObjects, engineDesign, serializeDesign, parseDesign, DEFAULT_FILL, DEFAULT_CLOTH, newId, centreRings, followsPicture,
} from "../../lib/digitizer/model";
import { traceRing, tracePolyline, crossesItself, nextTraceName, sampleRingColour } from "../../lib/digitizer/trace";
import { loadPicture, extractImage, downloadBlob, fileSafe } from "../../lib/digitizer/image";
import { mergeTraceObjects, CONVERT_DEFAULTS, traceOptions, clothFromTrace, contentBox, fillScale } from "../../lib/digitizer/convert";
import { drawText, textRings, DEFAULT_TEXT } from "../../lib/digitizer/text";
import { summarize } from "../../lib/digitizer/stats";
import { buildFile, buildPreview, productionSheetHtml, printSheet, loadFormats, centreStitches } from "../../lib/digitizer/exporter";
import { flatten } from "../../lib/digitizer/flat";
import { checkStitches, checkMessages } from "../../lib/embroidery/stitch/checks";
import { FABRICS } from "../../lib/embroidery/stitch/presets";
import { threadName, nearestThread, hexToRgb } from "../../lib/embroidery/thread/chart";

const AUTOSAVE_KEY = "kazi.digitizer.autosave";
const SETTINGS_KEY = "kazi.digitizer.settings";
/** How many of the pictures opened in one visit are kept for undo (a big picture is tens of megabytes). */
const KEEP_PICTURES = 4;
/** How long the cloth colour must rest before the picture's colours are looked at again for it (a drag through the colour chart passes many). */
const FABRIC_REST_MS = 120;

export { CONVERT_DEFAULTS };

/** The shapes that follow the picture (made from it, or traced over it), moved and scaled as the picture goes from `old` to `next`. One rule wherever the picture is placed. */
const placeShapes = (objects, old, next) => {
  const s = next.mmPerPx / old.mmPerPx;
  if (s === 1 && next.x === old.x && next.y === old.y) return objects;
  return objects.map((o) => (followsPicture(o) ? moveObject(scaleObjectAbout(o, s, s, old.x, old.y), next.x - old.x, next.y - old.y) : o));
};

/** Where the traced copy of the picture lies in the hoop now: its top-left corner and the millimetres one of its pixels covers. The picture may have been moved, resized or cropped since it was converted. */
const placementOf = (ref, lt) => ({ x: ref.x + (lt.crop.x - ref.crop.x) * ref.mmPerPx, y: ref.y + (lt.crop.y - ref.crop.y) * ref.mmPerPx, mmPerPx: ref.mmPerPx / lt.scale });

/** Is this still the picture placement a conversion began with (size, place, crop)? */
const sameReference = (a, b) => !!a && !!b && a.mmPerPx === b.mmPerPx && a.x === b.x && a.y === b.y && a.crop.x === b.crop.x && a.crop.y === b.crop.y && a.crop.w === b.crop.w && a.crop.h === b.crop.h;

/**
 * What the picture's shapes in a design were made for: the tracer's answer (`token`), the colour list they match (`palette`), the colours
 * switched off and on (`skip`, `include`) and the cloth (`fabric`). It goes with the design through every change (a Symbol key is copied by
 * `{ ...design }`, and is neither saved nor sent to the stitch engine), so undo and redo can put the colour list back as it was, and can see
 * that the cloth was changed after the shapes were made.
 */
const MADE_FOR = Symbol.for("kazi.digitizer.shapesMadeFor");
const madeFor = (d) => (d ? d[MADE_FOR] : undefined);
const stampMadeFor = (d, made) => { const next = { ...d }; next[MADE_FOR] = made; return next; };
/** The colour list's flags and the colours switched, as one string to compare. */
const colourKey = (palette, skip, include) => `${palette.map((p) => (p.skipped ? "S" : "-") + (p.sameAsCloth ? "C" : "-")).join("")}|${[...skip].sort((a, b) => a - b)}|${[...include].sort((a, b) => a - b)}`;

const read = (key, fallback) => {
  try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v ?? fallback; } catch { return fallback; }
};
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } };

/** What identifies a crop of the picture for the person finder: what it found stays valid until the crop changes. */
const personKey = (crop) => [crop.x, crop.y, crop.w, crop.h].map(Math.round).join(",");

export function useDigitizer() {
  const hist = useRef(null);
  if (!hist.current) hist.current = createHistory(newDesign());
  const [, force] = useReducer((n) => n + 1, 0);
  const design = hist.current.present;
  const dragging = hist.current.dragging;

  const [selection, setSelectionState] = useState([]);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [tool, setTool] = useState("select"); // select | hand | rect | ellipse | text | trace
  const [mode, setMode] = useState("design"); // picture | design | stitches
  const [crop, setCrop] = useState(false);
  const [view, setView] = useState({ k: 4, ox: 0, oy: 0 });
  const [prefs, setPrefsState] = useState(() => ({ showGrid: true, showJumps: false, ...read(SETTINGS_KEY, {}) }));
  const [notice, setNotice] = useState(null);
  const [menu, setMenu] = useState(null); // { x, y, kind: "picture" | "object", ids? } while the right-click menu is open (x, y: window pixels)
  const [trace, setTrace] = useState(null); // { pts: [[x, y, smooth], ...] } while a shape is being traced by hand
  const traceRef = useRef(null);
  const setTraceNow = useCallback((next) => { traceRef.current = next; setTrace(next); }, []);

  const refImage = useRef(null); // { canvas, name }: the picture on the table
  // Every picture opened in this visit, by the id the design's reference carries (`reference.pic`), so that undo and redo bring
  // back the picture that went with a step and not only the place it sat.
  const pictures = useRef(new Map());
  const [hasImage, setHasImage] = useState(false);
  const [settings, setSettings] = useState(CONVERT_DEFAULTS);
  const [palette, setPalette] = useState([]);
  const [skip, setSkip] = useState(() => new Set());
  const [include, setInclude] = useState(() => new Set()); // colours that match the cloth but the person wants stitched
  const [dropped, setDropped] = useState(0); // mm2 of the picture too fine to sew, left out by the last conversion
  const [converting, setConverting] = useState(false);
  const convertingRef = useRef(false);
  const busy = useCallback((on) => { convertingRef.current = on; setConverting(on); }, []);
  const [convertError, setConvertError] = useState(null);
  // What is known of the last conversion: { token, scale, crop, recipe }. The tracer's answer itself stays in the engine's worker
  // under `token` (it is tens of thousands of points); `recipe` is how to make it again if the worker has lost it.
  const lastTrace = useRef(null);
  const [traceInfo, setTraceInfo] = useState(null); // what the last conversion found out about the picture: { kind, widenedMm2 }
  const convertToken = useRef(0); // changes with every conversion, and when the picture is gone or another: work begun before is dropped
  const tokens = useRef(new Set()); // the tokens of the tracer's answers the worker may be keeping for this visit's pictures
  const clothPick = useRef(null); // the design the newest cloth pick made: shapes made for that pick belong in the same undo step
  const shapesBusy = useRef(0); // requests for shapes (a colour switched, the cloth changed) that the worker is still making
  const paletteRef = useRef([]); // the palette the shapes now in the design were made for, for code that must compare it with the next one
  const showPalette = useCallback((pal) => { paletteRef.current = pal; setPalette(pal); }, []);
  const chosenRef = useRef({ skip: new Set(), include: new Set() }); // `skip` and `include` as the design has them now
  const wantRef = useRef({ skip: new Set(), include: new Set() }); // the same as the person has just changed them: the shapes follow a moment later
  const chooseColours = useCallback((skipSet, includeSet) => {
    chosenRef.current = wantRef.current = { skip: skipSet, include: includeSet };
    setSkip(skipSet);
    setInclude(includeSet);
  }, []);
  const shapesSeq = useRef(0); // the newest request for shapes: the answer to an older one is dropped
  const fabricTimer = useRef(0);
  const syncShapesRef = useRef(null);
  /** Make the shapes agree with the cloth once it has rested on a colour for a moment (a drag through the colour chart passes many). */
  const syncSoon = useCallback(() => {
    clearTimeout(fabricTimer.current);
    fabricTimer.current = setTimeout(() => syncShapesRef.current(), FABRIC_REST_MS);
  }, []);
  const convertTimer = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Drop whatever picture work is still on its way (a new, opened or restored design must not get an old picture's shapes).
  const cancelConversion = useCallback(() => {
    clearTimeout(convertTimer.current);
    clearTimeout(fabricTimer.current);
    convertToken.current++;
    lastTrace.current = null;
    setTraceInfo(null);
    showPalette([]);
    chooseColours(new Set(), new Set());
    busy(false);
    setConvertError(null);
  }, [showPalette, chooseColours, busy]);
  useEffect(() => () => { clearTimeout(convertTimer.current); clearTimeout(fabricTimer.current); }, []);

  const [stitches, setStitches] = useState(null); // { flat, threads, warnings, ms, for: design, imported? }
  const importedRef = useRef(false); // the stitches came from a machine file the person opened, not from the design's shapes
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const [sim, setSim] = useState({ playing: false, pos: null, speed: 3000 });

  const engine = useRef(null);
  if (!engine.current) engine.current = createEngine();
  useEffect(() => () => { engine.current?.dispose(); disposePersonFinder(); }, []);
  /** Let the worker forget tracer answers nobody can ask for any more. */
  const releaseTokens = useCallback((list) => {
    if (!list.length) return;
    for (const t of list) tokens.current.delete(t);
    engine.current.release(list);
  }, []);

  const notify = useCallback((text, kind = "info") => setNotice({ text, kind, id: Date.now() }), []);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), notice.kind === "error" ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const setPrefs = useCallback((patch) => setPrefsState((p) => { const next = { ...p, ...patch }; write(SETTINGS_KEY, next); return next; }), []);

  /* ── history ──────────────────────────────────────────────────────── */

  const sanitize = useCallback(() => {
    const ids = new Set(hist.current.present.objects.map((o) => o.id));
    setSelectionState((sel) => { const next = sel.filter((id) => ids.has(id)); return next.length === sel.length ? sel : next; });
  }, []);

  const commit = useCallback((next) => { if (hist.current.commit(next)) force(); }, []);
  const begin = useCallback(() => hist.current.begin(), []);
  const live = useCallback((next) => { hist.current.live(next); force(); }, []);
  const end = useCallback(() => { hist.current.end(); force(); }, []);

  // A burst of inspector edits (typing, a slider) is ONE undo step: the drag closes a moment after the last change.
  const coalesceTimer = useRef(0);
  const flush = useCallback(() => { clearTimeout(coalesceTimer.current); if (hist.current.dragging) { hist.current.end(); force(); } }, []);
  const coalesced = useCallback((next) => {
    hist.current.begin();
    hist.current.live(next);
    force();
    clearTimeout(coalesceTimer.current);
    coalesceTimer.current = setTimeout(() => { hist.current.end(); force(); }, 500);
  }, []);
  useEffect(() => () => clearTimeout(coalesceTimer.current), []);

  // After undo or redo: show the picture that belongs to the design now on screen (none when it has none).
  const syncPicture = useCallback(() => {
    const ref = hist.current.present.reference;
    const want = (ref && ref.pic && pictures.current.get(ref.pic)) || null;
    if (want) { pictures.current.delete(ref.pic); pictures.current.set(ref.pic, want); } // in use: the last to be let go
    if (refImage.current === want) return;
    refImage.current = want;
    setHasImage(!!want);
    cancelConversion(); // the colours and shapes the last conversion kept belong to the other picture
    // A picture put back by undo gets the colour list it had when it was taken away (if its shapes are there too).
    const kept = want && want.kept;
    if (kept && hist.current.present.objects.some((o) => o.source === "image")) {
      lastTrace.current = kept.trace;
      showPalette(kept.palette);
      chooseColours(kept.skip, kept.include);
      setTraceInfo(kept.info);
      setDropped(kept.dropped);
    }
    if (ref && ref.pic && !want) notify("The picture that went with that step is no longer kept (only the last few are). Choose it again to use it.");
  }, [cancelConversion, showPalette, chooseColours, notify]);

  /**
   * After undo or redo: shapes still being made were for the design as it was, so they are dropped; the colour list and the colours
   * switched off follow the shapes the design now on screen has; and shapes made for another cloth than this design's are made again.
   */
  const syncColours = useCallback(() => {
    clearTimeout(fabricTimer.current);
    if (!convertingRef.current) shapesSeq.current++; // (a conversion on its way still lands, as it would without the undo)
    const d = hist.current.present;
    if (!d.reference) return;
    const made = madeFor(d);
    // Back past the conversion (or the picture) and forward again: the picture still knows its last reading, and gives it back when these are its shapes.
    const kept = refImage.current && refImage.current.kept;
    if (made && kept && kept.trace && kept.trace.token === made.token && !(lastTrace.current && lastTrace.current.token === made.token)) {
      lastTrace.current = kept.trace;
      setTraceInfo(kept.info);
      setDropped(kept.dropped);
    }
    const lt = lastTrace.current;
    if (!lt) return;
    if (made && made.token === lt.token) {
      const now = chosenRef.current;
      if (colourKey(paletteRef.current, now.skip, now.include) !== made.key) { showPalette(made.palette); chooseColours(made.skip, made.include); }
      else if (wantRef.current !== now) { wantRef.current = now; setPalette(paletteRef.current); } // a colour switched a moment ago, not in the design yet
      if (made.fabric !== d.fabricColor) syncSoon();
    } else if (paletteRef.current.length) {
      showPalette([]); // the shapes there now are not from the last reading of the picture (or there are none): there is no colour list for them
      chooseColours(new Set(), new Set());
    }
  }, [showPalette, chooseColours, syncSoon]);

  /** A colour was switched a moment ago and its shapes are still being made: it is not a step of the history yet. */
  const switchPending = useCallback(() => shapesBusy.current > 0 && wantRef.current !== chosenRef.current, []);

  const undo = useCallback(() => {
    flush();
    if (switchPending()) {
      // Ctrl+Z takes that switch back, as it would once the shapes were made: the answer is dropped and the box is ticked as it was.
      shapesSeq.current++;
      wantRef.current = chosenRef.current;
      setPalette(paletteRef.current);
      return;
    }
    if (hist.current.undo()) { sanitize(); syncPicture(); syncColours(); force(); }
  }, [flush, switchPending, sanitize, syncPicture, syncColours]);
  const redo = useCallback(() => {
    flush();
    if (switchPending()) return; // the switch will be a step of its own, and a step clears what could be redone
    if (hist.current.redo()) { sanitize(); syncPicture(); syncColours(); force(); }
  }, [flush, switchPending, sanitize, syncPicture, syncColours]);

  // New, Open and Restore do not throw away work that is not saved without asking first.
  const savedRef = useRef(hist.current.present); // the design as it was when last saved, opened or started
  const [replacing, setReplacing] = useState(null); // { what } while the question is on screen
  const replaceRun = useRef(null);
  const markSaved = useCallback(() => { savedRef.current = hist.current.present; }, []);
  const ask = useCallback((what, run) => {
    const d = hist.current.present;
    if (d !== savedRef.current && d.objects.length) { replaceRun.current = run; setReplacing({ what }); } else run();
  }, []);
  const confirmReplace = useCallback(() => { const run = replaceRun.current; replaceRun.current = null; setReplacing(null); if (run) run(); }, []);
  const cancelReplace = useCallback(() => { replaceRun.current = null; setReplacing(null); }, []);

  const setSelection = useCallback((ids) => setSelectionState(ids), []);
  const selected = useMemo(() => design.objects.filter((o) => selection.includes(o.id)), [design.objects, selection]);

  /** The ids that may be changed: a locked object is left alone (it is unlocked from the list first). */
  const movable = useCallback((ids) => {
    const locked = new Set(hist.current.present.objects.filter((o) => o.locked).map((o) => o.id));
    return ids.filter((id) => !locked.has(id));
  }, []);

  /* ── editing objects ──────────────────────────────────────────────── */

  const mapObjects = useCallback((ids, fn, how = "commit") => {
    const set = new Set(ids);
    const apply = (d) => ({ ...d, objects: d.objects.map((o) => (set.has(o.id) ? fn(o) : o)) });
    (how === "coalesce" ? coalesced : commit)(apply);
  }, [coalesced, commit]);

  const patchFill = useCallback((ids, patch, how = "coalesce") => mapObjects(ids, (o) => ({ ...o, fill: { ...o.fill, ...patch } }), how), [mapObjects]);
  const patchStroke = useCallback((ids, patch, how = "coalesce") => mapObjects(ids, (o) => ({ ...o, stroke: { ...o.stroke, ...patch } }), how), [mapObjects]);
  /** Change satin settings, keeping every selected object's own other satin settings (not the first one's for all). */
  const patchSatin = useCallback((ids, patch, how = "coalesce") => mapObjects(ids, (o) => ({ ...o, fill: { ...o.fill, satin: { ...(o.fill.satin || {}), ...patch } } }), how), [mapObjects]);
  const patchObject = useCallback((ids, patch, how = "coalesce") => mapObjects(ids, (o) => ({ ...o, ...patch }), how), [mapObjects]);

  const addObjects = useCallback((objs, { select = true } = {}) => {
    commit((d) => ({ ...d, objects: [...d.objects, ...objs] }));
    if (select) setSelectionState(objs.map((o) => o.id));
  }, [commit]);

  const removeObjects = useCallback((all) => {
    const ids = movable(all);
    if (!ids.length) { if (all.length) notify("That one is locked. Unlock it in the list first.", "info"); return; }
    const set = new Set(ids);
    commit((d) => ({ ...d, objects: d.objects.filter((o) => !set.has(o.id)) }));
    setSelectionState((s) => s.filter((id) => !set.has(id)));
  }, [commit, movable, notify]);

  const duplicate = useCallback((ids) => {
    const objs = hist.current.present.objects.filter((o) => ids.includes(o.id));
    const copies = cloneObjects(objs);
    addObjects(copies);
  }, [addObjects]);

  const reorder = useCallback((id, toIndex) => {
    commit((d) => {
      const from = d.objects.findIndex((o) => o.id === id);
      if (from < 0 || from === toIndex) return d;
      const list = d.objects.slice();
      const [o] = list.splice(from, 1);
      list.splice(Math.max(0, Math.min(list.length, toIndex)), 0, o);
      return { ...d, objects: list };
    });
  }, [commit]);

  const stepOrder = useCallback((ids, delta) => {
    commit((d) => {
      const list = d.objects.slice();
      const idx = ids.map((id) => list.findIndex((o) => o.id === id)).filter((i) => i >= 0).sort((a, b) => (delta > 0 ? b - a : a - b));
      let moved = false;
      for (const i of idx) {
        const j = i + delta;
        if (j < 0 || j >= list.length || ids.includes(list[j].id)) continue;
        [list[i], list[j]] = [list[j], list[i]];
        moved = true;
      }
      return moved ? { ...d, objects: list } : d; // already first (or last): nothing changes, so it is no step of the history
    });
  }, [commit]);

  const doBreakApart = useCallback((all) => {
    const ids = movable(all);
    const cur = hist.current.present.objects;
    const made = [];
    commit((d) => ({
      ...d,
      objects: d.objects.flatMap((o) => {
        if (!ids.includes(o.id)) return [o];
        const parts = breakApart(o);
        if (parts.length > 1) made.push(...parts);
        return parts;
      }),
    }));
    if (made.length) { setSelectionState(made.map((o) => o.id)); notify(`Split into ${made.length} pieces. Each one can be moved on its own now.`); }
    else notify("That is already one piece.");
    void cur;
  }, [commit, notify, movable]);

  const doFillHoles = useCallback((ids) => mapObjects(movable(ids), fillHoles, "commit"), [mapObjects, movable]);

  // One object is mirrored about its own middle; several are mirrored about the middle of the group, so they swap sides too.
  const flip = useCallback((all, axis) => {
    const ids = movable(all);
    const objs = hist.current.present.objects.filter((o) => ids.includes(o.id));
    if (!objs.length) return;
    const box = boxOfObjects(objs);
    const mid = axis === "h" ? (box[0] + box[2]) / 2 : (box[1] + box[3]) / 2;
    commit((d) => ({
      ...d,
      objects: d.objects.map((o) => {
        if (!ids.includes(o.id)) return o;
        const f = flipObject(o, axis);
        if (objs.length < 2) return f;
        const c = objectCorners(f).centre;
        return axis === "h" ? moveObject(f, 2 * (mid - c[0]), 0) : moveObject(f, 0, 2 * (mid - c[1]));
      }),
    }));
  }, [commit, movable]);

  const setSize = useCallback((ids, w, h, keepAspect) => mapObjects(movable(ids), (o) => setObjectSize(o, w, h, keepAspect), "coalesce"), [mapObjects, movable]);
  const setCentre = useCallback((all, x, y) => {
    const ids = movable(all);
    const objs = hist.current.present.objects.filter((o) => ids.includes(o.id));
    if (objs.length === 1) { mapObjects(ids, (o) => setObjectCentre(o, x ?? objectCorners(o).centre[0], y ?? objectCorners(o).centre[1]), "coalesce"); return; }
    const b = boxOfObjects(objs);
    const dx = x == null ? 0 : x - (b[0] + b[2]) / 2, dy = y == null ? 0 : y - (b[1] + b[3]) / 2;
    mapObjects(ids, (o) => moveObject(o, dx, dy), "coalesce");
  }, [mapObjects, movable]);
  const setRotation = useCallback((ids, deg) => mapObjects(movable(ids), (o) => withTransform(o, { rot: deg }), "coalesce"), [mapObjects, movable]);

  /** Put the selection's box on the hoop's centre line(s), or line the objects up with each other. */
  const align = useCallback((all, how) => {
    const ids = movable(all);
    const objs = hist.current.present.objects.filter((o) => ids.includes(o.id));
    if (!objs.length) return;
    const hoop = hist.current.present.hoop;
    const group = boxOfObjects(objs);
    const frame = objs.length === 1 ? [-hoop.w / 2, -hoop.h / 2, hoop.w / 2, hoop.h / 2] : group;
    commit((d) => ({
      ...d,
      objects: d.objects.map((o) => {
        if (!ids.includes(o.id)) return o;
        const b = objectBox(o);
        let dx = 0, dy = 0;
        if (how === "left") dx = frame[0] - b[0];
        if (how === "right") dx = frame[2] - b[2];
        if (how === "centerX") dx = (frame[0] + frame[2]) / 2 - (b[0] + b[2]) / 2;
        if (how === "top") dy = frame[1] - b[1];
        if (how === "bottom") dy = frame[3] - b[3];
        if (how === "centerY") dy = (frame[1] + frame[3]) / 2 - (b[1] + b[3]) / 2;
        return dx || dy ? moveObject(o, dx, dy) : o;
      }),
    }));
  }, [commit, movable]);

  const nudge = useCallback((ids, dx, dy) => mapObjects(movable(ids), (o) => moveObject(o, dx, dy), "coalesce"), [mapObjects, movable]);

  const recolor = useCallback((from, to) => {
    commit((d) => ({ ...d, objects: d.objects.map((o) => ({ ...o, fill: o.fill.color === from ? { ...o.fill, color: to } : o.fill, stroke: o.stroke.color === from ? { ...o.stroke, color: to } : o.stroke })) }));
  }, [commit]);

  const setDesign = useCallback((patch, how = "commit") => (how === "coalesce" ? coalesced : commit)((d) => ({ ...d, ...patch })), [coalesced, commit]);
  const setHoop = useCallback((w, h) => commit((d) => (d.hoop.w === w && d.hoop.h === h ? d : { ...d, hoop: { w, h } })), [commit]);

  // A new, opened or restored design starts with no picture and no unfinished trace: its history is gone, so are the pictures kept for undo.
  const dropPictures = useCallback(() => {
    refImage.current = null; pictures.current.clear(); setHasImage(false); setTraceNow(null);
    releaseTokens([...tokens.current]); // the history those pictures' answers belonged to is gone, and with it the way back to them
  }, [setTraceNow, releaseTokens]);

  const newFileNow = useCallback(() => {
    flush();
    cancelConversion();
    hist.current.reset(newDesign());
    dropPictures();
    setSelectionState([]);
    importedRef.current = false;
    setStitches(null);
    setMode("design");
    setCrop(false);
    markSaved();
    force();
  }, [flush, cancelConversion, markSaved, dropPictures]);
  const newFile = useCallback(() => ask("start a new design", newFileNow), [ask, newFileNow]);

  /* ── shapes and text ──────────────────────────────────────────────── */

  const ellipseRings = (w, h) => Array.from({ length: 72 }, (_, i) => [(w / 2) * Math.cos((i / 72) * 2 * Math.PI), (h / 2) * Math.sin((i / 72) * 2 * Math.PI)]);
  const lastColor = useRef(DEFAULT_FILL.color);

  const createShape = useCallback((tool2, rect, point) => {
    let w, h, cx, cy;
    if (rect) { w = rect[2] - rect[0]; h = rect[3] - rect[1]; cx = (rect[0] + rect[2]) / 2; cy = (rect[1] + rect[3]) / 2; }
    else { w = h = 20; cx = point?.[0] ?? 0; cy = point?.[1] ?? 0; }
    const rings = tool2 === "ellipse" ? ellipseRings(w, h) : [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    const o = makeObject({ name: tool2 === "ellipse" ? "Ellipse" : "Rectangle", kind: tool2 === "ellipse" ? "ellipse" : "rect", rings: [rings.map((p) => [p[0] + cx, p[1] + cy])], fill: { color: lastColor.current } });
    addObjects([o]);
    setTool("select");
  }, [addObjects]);

  const textToken = useRef(new Map());
  /** Draw and trace an object's text again, then swap the new letters in (keeping where the object is and how it is turned). */
  const retext = useCallback(async (id) => {
    const o = hist.current.present.objects.find((x) => x.id === id);
    if (!o || !o.text) return;
    const used = JSON.stringify(o.text); // the letters drawn below are for exactly these text settings
    const token = (textToken.current.get(id) || 0) + 1;
    textToken.current.set(id, token);
    try {
      const drawn = await drawText(o.text, 14);
      const ctx = drawn.canvas.getContext("2d");
      const img = ctx.getImageData(0, 0, drawn.width, drawn.height);
      const traced = await engine.current.trace({ width: drawn.width, height: drawn.height, data: img.data }, { colors: 2, mmPerPx: 1 / drawn.pxPerMm, background: "auto", minFeatureMm: 0.15, minAreaMm2: 0.05, simplifyMm: 0.03 }, `text-${id}`);
      if (textToken.current.get(id) !== token) return;
      const rings = textRings(traced, drawn.pxPerMm);
      if (!rings.length) { notify("There is nothing to stitch in that text.", "error"); return; }
      const { rings: centred } = centreRings(rings);
      // The letters belong to every state of the history that has these same text settings, so undo and redo never show
      // some words with other words' letters, and drawing them is not an undo step of its own.
      hist.current.patchAll((d) => {
        let hit = false;
        const objects = d.objects.map((x) => {
          if (x.id !== id || !x.text || JSON.stringify(x.text) !== used) return x;
          hit = true;
          return { ...x, rings: centred };
        });
        return hit ? { ...d, objects } : d;
      });
      force();
    } catch (e) {
      if (!e.stale) notify(`The text could not be drawn: ${e.message}`, "error");
    }
  }, [notify]);

  const createText = useCallback(async (x, y) => {
    const text = { ...DEFAULT_TEXT };
    const o = makeObject({ name: "Text", kind: "text", rings: [[[-5, -3], [5, -3], [5, 3], [-5, 3]]], text, fill: { color: lastColor.current, type: "auto" }, transform: { x, y, sx: 1, sy: 1, rot: 0 } });
    addObjects([o]);
    setTool("select");
    await retext(o.id);
  }, [addObjects, retext]);

  const editText = useCallback((id, patch) => {
    mapObjects([id], (o) => ({ ...o, text: { ...o.text, ...patch }, name: patch.value != null ? (String(patch.value).split("\n")[0].slice(0, 24) || "Text") : o.name }), "coalesce");
    clearTimeout(editText.timer);
    editText.timer = setTimeout(() => retext(id), 250);
  }, [mapObjects, retext]);

  /* ── tracing by hand ──────────────────────────────────────────────── */

  const traceAdd = useCallback((pt) => setTraceNow({ pts: [...(traceRef.current?.pts || []), pt] }), [setTraceNow]);
  const traceBack = useCallback(() => {
    const pts = traceRef.current?.pts || [];
    setTraceNow(pts.length > 1 ? { pts: pts.slice(0, -1) } : null);
  }, [setTraceNow]);
  const traceCancel = useCallback(() => setTraceNow(null), [setTraceNow]);

  /** Close the shape being traced and make it a shape of the design, in the colour the picture has under it. */
  const traceFinish = useCallback(() => {
    const pts = traceRef.current?.pts || [];
    const ring = traceRing(pts);
    if (!ring) {
      // A line that crosses itself into equal halves (a figure of eight) has nothing inside it, however big it is.
      const crossed = pts.length >= 3 && crossesItself(tracePolyline(pts, true));
      notify(pts.length < 3 ? "Put at least three points round the shape first." : crossed ? "That outline crosses over itself, so it has no inside. Click round the edge without crossing over." : "That shape is too small to stitch. Zoom in, or make the picture bigger.");
      return false;
    }
    const d = hist.current.present;
    const seen = d.reference && refImage.current ? sampleRingColour(refImage.current.canvas, d.reference, ring) : null;
    const rgb = seen ? hexToRgb(seen) : null;
    const color = rgb ? (settings.snap ? nearestThread(rgb.r, rgb.g, rgb.b).hex : seen) : lastColor.current;
    addObjects([makeObject({ name: nextTraceName(d.objects), kind: "shape", rings: [ring], fill: { color }, source: d.reference ? "hand" : undefined })]);
    setTraceNow(null);
    return true;
  }, [notify, addObjects, settings.snap, setTraceNow]);

  // Leaving the tool, or the Design step, throws away a shape that was not finished.
  useEffect(() => { if (tool !== "trace" || mode !== "design") setTraceNow(null); }, [tool, mode, setTraceNow]);

  /** From the Picture step: draw the shapes yourself over the picture. */
  const startTracing = useCallback(() => { setCrop(false); setMode("design"); setTool("trace"); }, []);

  /* ── the right-click menu ─────────────────────────────────────────── */

  const openMenu = useCallback((info) => {
    if (info.kind === "object") {
      const cur = selectionRef.current;
      const ids = cur.includes(info.id) ? cur : [info.id];
      if (ids !== cur) setSelectionState(ids);
      setMenu({ x: info.x, y: info.y, kind: "object", ids });
    } else setMenu({ x: info.x, y: info.y, kind: "picture" });
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);
  // The menu is about the design as it was when it opened: a change, or another step or tool, closes it.
  useEffect(() => { setMenu(null); }, [design, mode, tool]);

  /* ── the picture and its conversion ───────────────────────────────── */

  /**
   * The worker has lost the tracer's answer for the picture (it was restarted after a crash, or made room for newer ones): trace the
   * picture again the way it was traced. The tracer gives the same answer for the same picture and options. True when it is back.
   */
  const remaking = useRef(null); // { token, promise } while that answer is being made again
  const remakeTrace = useCallback((lt, epoch) => {
    if (epoch !== convertToken.current) return Promise.resolve(false); // the picture went away, or another came, while the worker's answer was on its way
    if (remaking.current && remaking.current.token === lt.token) return remaking.current.promise;
    const img = refImage.current;
    if (!img || img !== lt.holder || !lt.recipe) return Promise.reject(new Error("The colours of this picture cannot be changed any more. Press Convert again."));
    const wasBusy = convertingRef.current;
    if (!wasBusy) busy(true); // the bar says the picture is being read again
    const promise = (async () => {
      try {
        const again = extractImage(img.canvas, lt.recipe.crop, 1600);
        await engine.current.trace(again.image, lt.recipe.options, "remake", lt.token);
        return epoch === convertToken.current;
      } finally {
        remaking.current = null;
        if (!wasBusy && epoch === convertToken.current) busy(false);
      }
    })();
    remaking.current = { token: lt.token, promise };
    return promise;
  }, [busy]);

  /**
   * The shapes of a trace for these colour choices, made in the worker (it holds the tracer's answer; the page holds only where it came
   * from, `lt`: the last conversion's unless another is given). Resolves to the palette to show and `change(design)`, which puts the
   * shapes into a design: all of them for a fresh conversion, otherwise only the colours that were turned on or off (so the person's
   * edits to the other shapes, and the order everything is sewn in, are left alone). Resolves to null when nothing is to be put in: no
   * trace, or a newer request, another conversion or another picture came first, so this answer is old.
   */
  const traceUpdate = useCallback(async (skipSet, includeSet, snap, fabric, fresh, lt = lastTrace.current, amend = false) => {
    const ref = hist.current.present.reference;
    if (!lt || !ref) return null;
    const epoch = convertToken.current;
    const seq = ++shapesSeq.current;
    // The shapes go where the picture is NOW: it may have been moved, resized or cropped since it was converted.
    const at = placementOf(ref, lt);
    const before = paletteRef.current;
    const job = { token: lt.token, skip: [...skipSet], include: [...includeSet], snap, fabric, originX: at.x, originY: at.y, mmPerPx: at.mmPerPx, before: fresh ? null : before, fresh, maxColors: lt.maxColors, detailThick: !!lt.thick };
    let out;
    try {
      out = await engine.current.shapes(job);
      if (out.gone) {
        if (!(await remakeTrace(lt, epoch)) || seq !== shapesSeq.current) return null;
        out = await engine.current.shapes(job);
        if (out.gone) throw new Error("The colours of the picture could not be read again. Press Convert again.");
      }
    } catch (e) {
      if (e.stale) return null;
      throw e;
    }
    if (seq !== shapesSeq.current || epoch !== convertToken.current) return null;
    // Not in the middle of a drag (a shape being moved, a number being typed): putting the shapes in now would cut it into two steps of the history.
    // Shapes made for the cloth that is still being chosen (`amend`) are no step of their own: they go into that drag.
    const ownDrag = () => amend && hist.current.present === clothPick.current;
    for (let waited = 0; hist.current.dragging && !ownDrag() && waited < 600; waited++) {
      await new Promise((r) => setTimeout(r, 60));
      if (seq !== shapesSeq.current || epoch !== convertToken.current) return null;
    }
    const made = out.objects, rank = new Map(out.rank), pal = out.palette;
    const stamp = { token: lt.token, fabric, skip: skipSet, include: includeSet, palette: pal, key: colourKey(pal, skipSet, includeSet) };
    return {
      palette: pal,
      fabric,
      details: out.details || null, // the fine lines and dots that went in with these shapes, counted (null: none)
      change: (d) => {
        if (!d.reference) return d;
        // The picture may have been moved or resized while the shapes were made: they go where it is by now (as the shapes already there did).
        const now = placementOf(d.reference, lt);
        const objects = now.x === at.x && now.y === at.y && now.mmPerPx === at.mmPerPx ? made : placeShapes(made, at, now);
        const list = mergeTraceObjects(d.objects, objects, { fresh, before, after: pal, rank });
        let next = list === d.objects ? d : { ...d, objects: list };
        // A new conversion takes the cloth from the picture (a white logo on black is for a black shirt), unless the person chose the cloth.
        if (fresh && fabric && d.fabricAuto !== false && fabric !== next.fabricColor) next = { ...next, fabricColor: fabric };
        const was = madeFor(next);
        return was && was.token === stamp.token && was.fabric === stamp.fabric && was.key === stamp.key ? next : stampMadeFor(next, stamp);
      },
    };
  }, [remakeTrace]);

  /**
   * `onLand` runs when the shapes are in the design, in the same step, with everything else the conversion found out. Resolves to whether they were put in.
   * `amend`: the shapes are for the cloth alone, so they are no step of their own: they go into the design as it is (with the cloth change that
   * asked for them), and one undo takes back both. Otherwise they are a step.
   */
  const applyTrace = useCallback(async (skipSet, includeSet, snap, fabric, fresh = false, lt = lastTrace.current, onLand = null, amend = false) => {
    const u = await traceUpdate(skipSet, includeSet, snap, fabric, fresh, lt, amend);
    if (!u) return false;
    // The cloth was changed while these shapes were made: they are for the old one. Make them again for the new one.
    if (!fresh && hist.current.present.fabricColor !== u.fabric) { syncSoon(); return false; }
    if (fresh) {
      const old = lastTrace.current;
      lastTrace.current = lt;
      if (old && old.token !== lt.token) releaseTokens([old.token]); // the reading this one replaces is no use to anything now
    }
    showPalette(u.palette);
    chooseColours(skipSet, includeSet);
    if (amend) live(u.change); else commit(u.change);
    if (fresh) setSelectionState([]); else sanitize();
    if (onLand) onLand(u);
    return true;
  }, [traceUpdate, showPalette, chooseColours, live, commit, sanitize, syncSoon, releaseTokens]);

  /** Make the shapes in the design agree with the colour choices and the cloth as they are now (a colour was switched, the cloth was changed). */
  const syncShapes = useCallback(async () => {
    const d = hist.current.present, lt = lastTrace.current;
    if (convertingRef.current || !lt || !d.reference) return; // a conversion on its way brings its own shapes
    const made = madeFor(d);
    if (!made || made.token !== lt.token) { // shapes that are not from the last reading of the picture: its colours cannot be changed on them
      wantRef.current = chosenRef.current;
      setPalette(paletteRef.current);
      return;
    }
    const want = wantRef.current;
    // Only the cloth changed: the shapes made for it complete that step. A colour switched on or off is a step of its own.
    const amend = want === chosenRef.current;
    shapesBusy.current++;
    try {
      await applyTrace(want.skip, want.include, settingsRef.current.snap, d.fabricColor, false, lt, null, amend);
    } catch (e) {
      // The shapes could not be made: show the colour list as the design really is.
      wantRef.current = chosenRef.current;
      setPalette(paletteRef.current);
      notify(e.message || "The colours could not be changed.", "error");
    } finally {
      shapesBusy.current--;
    }
  }, [applyTrace, notify]);
  syncShapesRef.current = syncShapes;

  /** `fit`: a picture that has just been placed is made as big as the hoop allows (what is stitched, not the picture's margins), then converted again at that size. */
  const runConvert = useCallback(async (override = {}, fit = false) => {
    const d = hist.current.present;
    const ref0 = d.reference;
    const img = refImage.current;
    if (!ref0 || !img) return;
    const s = { ...settings, ...override };
    const token = ++convertToken.current;
    clearTimeout(fabricTimer.current); // the shapes about to be made are for the cloth as it is when they land
    busy(true);
    setConvertError(null);
    // The tracer's answers stay in the worker, each under a token the page makes up: the one this conversion uses is kept, the others let go.
    const made = [];
    const newToken = () => { const t = newId(); made.push(t); tokens.current.add(t); return t; };
    let landed = false, used = null, cloth = null;
    try {
      let ref = ref0;
      const first = extractImage(img.canvas, ref0.crop, 1600);
      const scale = first.scale;
      let mmPerPx = ref.mmPerPx / scale;
      // A person found in a photograph (this crop of it) is cut out of its background, and its hair, skin and clothes get colours of their own: the tracer
      // is given the region map the finder made. What was found is kept with the picture, so a slider moved later does not look again.
      const seekKey = personKey(ref0.crop);
      const lookForPerson = s.people !== false && s.background !== "none" && (s.kind === "auto" || s.kind === "photo");
      const withPerson = (o) => (lookForPerson && img.person && img.person.key === seekKey && img.person.regions ? { ...o, regions: img.person.regions } : o);
      let opts = withPerson(traceOptions(s, mmPerPx));
      let tok = newToken();
      let res = await engine.current.trace(first.image, opts, "picture", tok);
      if (token !== convertToken.current) return;
      // The first look at a photograph: is there a person in it? If so it is read again with the person cut out (a few seconds more, once for this picture).
      if (lookForPerson && res.stats?.kind === "photo" && !(img.person && img.person.key === seekKey)) {
        const found = await findPerson(extractImage(img.canvas, ref0.crop, 1600).image);
        if (token !== convertToken.current) return;
        img.person = { key: seekKey, regions: found ? found.regions : null };
        if (found) {
          const again = extractImage(img.canvas, ref0.crop, 1600);
          opts = withPerson(traceOptions(s, mmPerPx));
          tok = newToken();
          res = await engine.current.trace(again.image, opts, "picture", tok);
          if (token !== convertToken.current) return;
        }
      }
      // the cloth the picture was made for: a dark or coloured background means that garment, unless the person chose the cloth
      const now0 = hist.current.present;
      const clothOf = (r) => (now0.fabricAuto === false ? now0.fabricColor : clothFromTrace(r) || DEFAULT_CLOTH);
      if (fit) {
        const box = contentBox(res, { originX: ref0.x, originY: ref0.y, mmPerPx, fabric: clothOf(res) });
        const k = fillScale(box, now0.hoop);
        if (k > 1) {
          // bigger, with what is stitched in the middle of the hoop; then look at the picture again at that size (thin lines and
          // small lettering keep more of themselves in a bigger design, so the shapes are made afresh, not stretched)
          const cx = (box.x0 + box.x1) / 2 - ref0.x, cy = (box.y0 + box.y1) / 2 - ref0.y;
          const next = { ...ref0, mmPerPx: ref0.mmPerPx * k, x: -cx * k, y: -cy * k };
          const again = extractImage(img.canvas, ref0.crop, 1600); // the first copy went to the worker (its memory moved over): take another
          const mm2 = next.mmPerPx / again.scale;
          const opts2 = withPerson(traceOptions(s, mm2));
          const tok2 = newToken();
          const res2 = await engine.current.trace(again.image, opts2, "picture", tok2);
          if (token !== convertToken.current) return;
          // a bigger picture can keep fine strokes the smaller one dropped, so the stitched part may now reach a little further than
          // measured: if it does not fit, scale the picture down a touch (no new trace is needed for that) and put it in the middle
          let fitted = next;
          const box2 = contentBox(res2, { originX: next.x, originY: next.y, mmPerPx: mm2, fabric: clothOf(res2) });
          if (box2) {
            const k2 = Math.min(1, (now0.hoop.w * 0.94) / (box2.x1 - box2.x0), (now0.hoop.h * 0.94) / (box2.y1 - box2.y0));
            const mx = next.x + ((box2.x0 + box2.x1) / 2 - next.x) * k2, my = next.y + ((box2.y0 + box2.y1) / 2 - next.y) * k2;
            fitted = { ...next, mmPerPx: next.mmPerPx * k2, x: next.x - mx, y: next.y - my };
          }
          // only when the person has not changed the picture (crop, move, size) while it was being looked at: theirs wins
          if (sameReference(hist.current.present.reference, ref0)) {
            commit((dd) => ({ ...dd, reference: fitted, objects: placeShapes(dd.objects, ref0, fitted) })); // a shape traced by hand meanwhile goes with the picture
            if (traceRef.current) {
              // ...and so do the points of one that is not finished yet
              const sc = fitted.mmPerPx / ref0.mmPerPx;
              setTraceNow({ ...traceRef.current, pts: traceRef.current.pts.map((p) => [fitted.x + (p[0] - ref0.x) * sc, fitted.y + (p[1] - ref0.y) * sc, ...p.slice(2)]) });
            }
            ref = fitted;
            res = res2;
            opts = opts2;
            tok = tok2;
            mmPerPx = fitted.mmPerPx / again.scale;
          }
        }
      }
      used = tok;
      const lt = { token: tok, scale, crop: { x: Math.round(ref.crop.x), y: Math.round(ref.crop.y) }, holder: img, maxColors: typeof s.colors === "number" ? Math.min(s.colors, s.maxColors) : s.maxColors, thick: !!s.detailThick, recipe: { crop: { x: ref0.crop.x, y: ref0.crop.y, w: ref0.crop.w, h: ref0.crop.h }, options: opts } };
      const perWorkPx = mmPerPx * (res.stats?.scale || 1); // millimetres a pixel of the tracer's own (maybe shrunk) copy is
      const droppedMm2 = ((res.stats?.removedSliverPixels || 0) + (res.stats?.removedSpeckPixels || 0)) * perWorkPx * perWorkPx;
      const info = { kind: res.stats?.kind || "logo", person: res.stats?.person ?? null, widenedMm2: (res.stats?.widenedPixels || 0) * perWorkPx * perWorkPx, letters: res.stats?.strokeCount || 0, letterMm: res.stats?.strokeMedianMm || 0, widthMm: ref.crop.w * ref.mmPerPx };
      const nextSkip = new Set(), nextInclude = new Set();
      cloth = clothOf(res);
      // The shapes are made in the worker. What was found out, the colour list and the shapes land together, in one step.
      landed = await applyTrace(nextSkip, nextInclude, s.snap, cloth, true, lt, (u) => {
        const done = { ...info, details: (u && u.details) || null }; // (what the fine lines and dots came to once they were checked against the colours)
        setDropped(droppedMm2);
        setTraceInfo(done);
        // The picture remembers its last reading, so that undo and redo past the conversion (or past the picture) can give the colour tools back.
        img.kept = { trace: lt, palette: paletteRef.current, skip: nextSkip, include: nextInclude, info: done, dropped: droppedMm2 };
      });
    } catch (e) {
      if (!e.stale) setConvertError(e.message || "The picture could not be converted.");
    } finally {
      const dead = landed ? made.filter((t) => t !== used) : made;
      releaseTokens(dead);
      if (token === convertToken.current) {
        busy(false);
        if (landed && hist.current.present.fabricColor !== cloth) syncSoon(); // the person picked another cloth while the shapes were made
      }
    }
  }, [settings, applyTrace, busy, syncSoon, commit, setTraceNow, releaseTokens]);

  const changeSettings = useCallback((patch, convertNow = true) => {
    setSettings((s) => ({ ...s, ...patch }));
    if (convertNow && refImage.current) {
      // A slider sends many values as it moves: convert once it has rested a moment, not for each one.
      clearTimeout(convertTimer.current);
      convertTimer.current = setTimeout(() => runConvertRef.current({ ...patch }), 150);
    }
  }, []);
  const runConvertRef = useRef(runConvert);
  runConvertRef.current = runConvert;

  // Turn a colour of the picture on or off. A colour that matches the cloth starts off; turning it on is remembered in `include`.
  const toggleSkip = useCallback((index) => {
    if (convertingRef.current) return; // the picture is being read: the colours it has are not known until it is done
    const entry = palette.find((p) => p.index === index);
    if (!entry || entry.background) return;
    const nextSkip = new Set(wantRef.current.skip), nextInclude = new Set(wantRef.current.include);
    if (entry.skipped) { nextSkip.delete(index); if (entry.sameAsCloth) nextInclude.add(index); }
    else { nextSkip.add(index); nextInclude.delete(index); }
    wantRef.current = { skip: nextSkip, include: nextInclude };
    // The switch answers at once; the shapes follow when the worker has made them (a quick run of switches is made once, for the last).
    setPalette((pal) => pal.map((p) => (p.index === index ? { ...p, skipped: !entry.skipped } : p)));
    syncShapes();
  }, [palette, syncShapes]);

  /** Change the colour of the cloth: it is how the design is shown, and picture colours that match it are not stitched. */
  const setFabricColor = useCallback((hex) => {
    // The cloth changes on screen at once. Dragging through the colours is one undo step, not one for every colour passed.
    coalesced((d) => ({ ...d, fabricColor: hex, fabricAuto: false }));
    clothPick.current = hist.current.present;
    // Which colours of the picture are left out follows once the cloth has rested on a colour for a moment (only the newest answer is used).
    if (lastTrace.current) syncSoon();
  }, [coalesced, syncSoon]);

  const loadPictureFile = useCallback(async (file) => {
    try {
      const pic = await loadPicture(file);
      const holder = { canvas: pic.canvas, name: pic.name };
      const picId = newId();
      const inUse = hist.current.present.reference?.pic;
      const inUseHolder = inUse && pictures.current.get(inUse);
      if (inUseHolder) { pictures.current.delete(inUse); pictures.current.set(inUse, inUseHolder); } // the picture on the table is the last to be let go
      pictures.current.set(picId, holder);
      while (pictures.current.size > KEEP_PICTURES) pictures.current.delete(pictures.current.keys().next().value); // the oldest goes first
      refImage.current = holder;
      setHasImage(true);
      const d = hist.current.present;
      // About 80% of the hoop's width, never wider than 160 mm to start with.
      const aspect = pic.width / pic.height;
      const maxW = Math.min(160, d.hoop.w * 0.8), maxH = d.hoop.h * 0.8;
      const wMm = Math.min(maxW, maxH * aspect);
      const mmPerPx = wMm / pic.width;
      const reference = {
        name: pic.name, srcW: pic.width, srcH: pic.height, mmPerPx, crop: { x: 0, y: 0, w: pic.width, h: pic.height },
        x: -wMm / 2, y: -(pic.height * mmPerPx) / 2, opacity: 1, visible: true, pic: picId,
      };
      flush();
      cancelConversion(); // a conversion of the picture that was here must not land on this one
      // The old picture's own shapes go; what was traced over it by hand stays, as shapes of their own (they belong to no picture now).
      commit((dd) => ({
        ...dd,
        name: dd.name === "Untitled design" ? fileSafe(pic.name, "Untitled design") : dd.name,
        objects: dd.objects.filter((o) => o.source !== "image").map((o) => (o.source === "hand" ? { ...o, source: undefined } : o)),
        reference,
      }));
      setMode("picture");
      setCrop(false);
      setTimeout(() => runConvertRef.current({}, true), 0);
    } catch (e) {
      notify(e.message || "That file could not be opened.", "error");
    }
  }, [commit, flush, notify, cancelConversion]);

  /** Move or scale the picture; the shapes made from it go with it. */
  const placeReference = useCallback((next) => {
    live((d) => {
      const old = d.reference;
      if (!old) return d;
      return { ...d, reference: next, objects: placeShapes(d.objects, old, next) };
    });
  }, [live]);

  const cropReference = useCallback((next) => live((d) => ({ ...d, reference: next })), [live]);

  const setReference = useCallback((patch, how = "coalesce") => {
    const apply = (d) => {
      if (!d.reference) return d;
      const next = { ...d.reference, ...patch };
      return { ...d, reference: next };
    };
    (how === "coalesce" ? coalesced : commit)(apply);
  }, [coalesced, commit]);

  /** Set the picture's width in millimetres (the shapes made from it follow), keeping its centre. */
  const setReferenceWidth = useCallback((wMm) => {
    coalesced((d) => {
      const old = d.reference;
      if (!old || !(wMm > 1)) return d;
      const curW = old.crop.w * old.mmPerPx;
      const s = wMm / curW;
      const mmPerPx = old.mmPerPx * s;
      const cx = old.x + curW / 2, cy = old.y + (old.crop.h * old.mmPerPx) / 2;
      const next = { ...old, mmPerPx, x: cx - (old.crop.w * mmPerPx) / 2, y: cy - (old.crop.h * mmPerPx) / 2 };
      return {
        ...d,
        reference: next,
        objects: d.objects.map((o) => (followsPicture(o) ? moveObject(scaleObjectAbout(o, s, s, cx, cy), 0, 0) : o)),
      };
    });
  }, [coalesced]);

  /**
   * Take the picture off the table. The shapes made from it and traced over it stay, as shapes of their own (they no longer follow
   * a picture), unless `withShapes`, which deletes them too. One step of the history: undo brings the picture back (it is still in
   * `pictures`), and its shapes with it.
   */
  const removeReference = useCallback((withShapes = false) => {
    if (!hist.current.present.reference) return;
    flush();
    // What the conversion found (its colour list) goes with the picture, so undo can give it back.
    if (refImage.current) refImage.current.kept = { trace: lastTrace.current, palette: paletteRef.current, skip, include, info: traceInfo, dropped };
    cancelConversion();
    refImage.current = null;
    setHasImage(false);
    commit((d) => ({
      ...d,
      reference: null,
      objects: withShapes ? d.objects.filter((o) => !followsPicture(o)) : d.objects.map((o) => (followsPicture(o) ? { ...o, source: undefined } : o)),
    }));
    sanitize();
    setMode("design");
    setCrop(false);
    notify(withShapes ? "Picture and its shapes deleted. Ctrl+Z brings them back." : "Picture deleted. Its shapes are still here. Ctrl+Z brings it back.");
  }, [commit, flush, cancelConversion, sanitize, notify, skip, include, traceInfo, dropped]);

  /* ── the stitch engine ────────────────────────────────────────────── */

  const wantStitches = design.objects.some((o) => o.visible);
  useEffect(() => {
    if (dragging) return undefined;
    if (!wantStitches) { if (!importedRef.current) setStitches(null); setGenError(null); return undefined; }
    importedRef.current = false; // the design has shapes now: its own stitches replace an opened file's
    let cancelled = false;
    const t = setTimeout(async () => {
      setGenerating(true);
      try {
        const res = await engine.current.generate(engineDesign(design), {});
        if (cancelled) return;
        setStitches({ ...res, for: design });
        setGenError(null);
      } catch (e) {
        if (!cancelled && !e.stale) setGenError(e.message || "The stitches could not be made.");
      } finally {
        if (!cancelled) setGenerating(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [design, dragging, wantStitches]);

  const summary = useMemo(() => (stitches ? summarize(stitches.flat, stitches.threads, { standIn: !!stitches.standIn }) : null), [stitches]);
  const stale = !!stitches && !stitches.imported && stitches.for !== design;

  /* ── simulation ───────────────────────────────────────────────────── */

  const simRef = useRef(sim);
  simRef.current = sim;
  useEffect(() => {
    if (!sim.playing || !stitches) return undefined;
    let raf = 0;
    let last = performance.now();
    const total = stitches.flat.length / 3;
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const cur = simRef.current;
      const pos = Math.min(total, (cur.pos ?? 0) + cur.speed * dt);
      if (pos >= total) { setSim({ ...cur, pos: null, playing: false }); return; }
      setSim({ ...cur, pos });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sim.playing, stitches]); // eslint-disable-line react-hooks/exhaustive-deps

  const playSim = useCallback(() => setSim((s) => ({ ...s, playing: true, pos: s.pos == null || s.pos >= (stitches?.flat.length || 0) / 3 ? 0 : s.pos })), [stitches]);
  const pauseSim = useCallback(() => setSim((s) => ({ ...s, playing: false })), []);
  const stopSim = useCallback(() => setSim((s) => ({ ...s, playing: false, pos: null })), []);
  const seekSim = useCallback((pos) => setSim((s) => ({ ...s, playing: false, pos })), []);
  const setSimSpeed = useCallback((speed) => setSim((s) => ({ ...s, speed })), []);

  /* ── files ────────────────────────────────────────────────────────── */

  // Files and sheets are made from the stitches centred on the hoop's middle, unless the person turned that off.
  const forFile = useCallback((st) => (hist.current.present.settings?.centre === false ? st : centreStitches(st)), []);

  const exportFormats = useCallback(async (formatIds, options = {}) => {
    if (!stitches || !summary?.stitches) { notify("There are no stitches to save yet.", "error"); return false; }
    setExporting(true);
    const names = [];
    try {
      const out = forFile(stitches);
      for (const id of formatIds) {
        const f = await buildFile(id, hist.current.present, out, options);
        downloadBlob(f.blob, f.filename);
        names.push(f.filename);
        await new Promise((r) => setTimeout(r, 250)); // browsers ask before more than one download in a burst
      }
      notify(names.length === 1 ? `Saved ${names[0]}.` : `Saved ${names.length} files.`);
      return names;
    } catch (e) {
      notify(`Could not make the file: ${e.message}`, "error");
      return false;
    } finally {
      setExporting(false);
    }
  }, [stitches, summary, notify, forFile]);

  const exportPreview = useCallback(async () => {
    if (!stitches) return;
    try {
      const p = await buildPreview(hist.current.present, forFile(stitches), { fabricColor: hist.current.present.fabricColor });
      downloadBlob(p.blob, p.filename);
    } catch (e) { notify(`Could not make the picture: ${e.message}`, "error"); }
  }, [stitches, notify, forFile]);

  const printProduction = useCallback(async (fileNames = []) => {
    if (!stitches || !summary) return;
    try {
      const p = await buildPreview(hist.current.present, forFile(stitches), { fabricColor: "#ffffff", pxPerMm: 8 });
      const url = p.canvas.toDataURL("image/png");
      const html = productionSheetHtml(hist.current.present, summary, url, { fabricLabel: (FABRICS[hist.current.present.fabric] || {}).label, fileNames, centred: hist.current.present.settings?.centre !== false });
      if (!printSheet(html)) notify("Your browser blocked the print window. Allow pop-ups for this site and try again.", "error");
    } catch (e) { notify(`Could not make the sheet: ${e.message}`, "error"); }
  }, [stitches, summary, notify, forFile]);

  const saveDesignFile = useCallback(() => {
    const d = hist.current.present;
    downloadBlob(new Blob([serializeDesign(d)], { type: "application/json" }), `${fileSafe(d.name)}.kazi-design.json`);
    savedRef.current = d;
  }, []);

  /** Open a machine embroidery file (DST, PES, ...) to look at it, see its numbers, or save it as another type. */
  const openStitchFileNow = useCallback(async (file) => {
    try {
      const { readPattern, formatForFilename } = await loadFormats();
      const id = formatForFilename(file.name);
      if (!id) throw new Error("That kind of file cannot be opened here.");
      const pattern = readPattern(id, new Uint8Array(await file.arrayBuffer()));
      if (!pattern.stitches.some((st) => st[2] === 0)) throw new Error("There are no stitches in that file.");
      const flat = flatten(pattern.stitches);
      // Centre it on the hoop's middle, where a machine expects a design, and make the hoop big enough to show all of it.
      const probe = summarize(flat, pattern.threads);
      const [x0, y0, x1, y1] = probe.bounds || [0, 0, 0, 0];
      const shiftX = -Math.round(((x0 + x1) / 2) * 10), shiftY = -Math.round(((y0 + y1) / 2) * 10);
      for (let i = 0; i < flat.length; i += 3) { flat[i] += shiftX; flat[i + 1] += shiftY; }
      const w = Math.max(40, Math.ceil(probe.widthMm + 12)), h = Math.max(40, Math.ceil(probe.heightMm + 12));
      flush();
      cancelConversion();
      const name = fileSafe(file.name.replace(/\.[^.]+$/, ""), "Opened file");
      hist.current.reset(newDesign({ name, hoop: { w, h } }));
      dropPictures();
      setSelectionState([]);
      importedRef.current = true;
      const checks = checkStitches(flat);
      const warnings = [{ kind: "opened", message: pattern.colorsFromFile === false ? `${file.name} does not store thread colours, so stand-in colours are shown. The stitches are exactly as in the file, moved to the middle of the hoop.` : `${file.name} opened. The stitches are exactly as in the file, moved to the middle of the hoop.` }, ...checkMessages(checks)];
      setStitches({ flat, threads: pattern.threads, warnings, checks, imported: true, standIn: pattern.colorsFromFile === false, for: hist.current.present });
      setMode("stitches");
      setCrop(false);
      markSaved();
      force();
    } catch (e) {
      notify(e.message || "That file could not be opened.", "error");
    }
  }, [flush, notify, cancelConversion, markSaved, dropPictures]);
  const openStitchFile = useCallback((file) => ask("open that file", () => openStitchFileNow(file)), [ask, openStitchFileNow]);

  const openDesignFileNow = useCallback(async (file) => {
    try {
      const d = parseDesign(await file.text());
      flush();
      cancelConversion();
      hist.current.reset(d);
      dropPictures();
      setSelectionState([]);
      setMode("design");
      markSaved();
      force();
      notify("Design opened. The picture it was made from is not stored in the file.");
    } catch (e) {
      notify(e.message || "That file could not be opened.", "error");
    }
  }, [flush, notify, cancelConversion, markSaved, dropPictures]);
  const openDesignFile = useCallback((file) => ask("open that file", () => openDesignFileNow(file)), [ask, openDesignFileNow]);

  // Keep the last design on this computer so a closed tab does not lose the work.
  const [restorable, setRestorable] = useState(() => { try { return !!localStorage.getItem(AUTOSAVE_KEY); } catch { return false; } });
  const autosaveWarned = useRef(false);
  useEffect(() => {
    if (dragging || !design.objects.length) return undefined;
    const t = setTimeout(() => {
      try { localStorage.setItem(AUTOSAVE_KEY, serializeDesign(design)); setRestorable(true); } catch {
        // Storage is full or blocked. An older copy left there would come back as "your last design", so it goes, and the person is told.
        try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* blocked as well */ }
        setRestorable(false);
        if (!autosaveWarned.current) {
          autosaveWarned.current = true;
          notify("This browser could not keep a copy of your design (its storage is full or blocked), so the design cannot be brought back if the tab closes. Press Save design to keep your work.", "error");
        }
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [design, dragging, notify]);
  const restoreNow = useCallback(() => {
    try {
      const d = parseDesign(localStorage.getItem(AUTOSAVE_KEY));
      flush();
      cancelConversion();
      hist.current.reset(d);
      dropPictures();
      setSelectionState([]);
      markSaved();
      force();
      notify("Your last design is back.");
    } catch { notify("The saved design could not be read.", "error"); }
  }, [notify, flush, cancelConversion, markSaved, dropPictures]);
  const restore = useCallback(() => ask("open your last design", restoreNow), [ask, restoreNow]);

  /* ── the stage's hooks ────────────────────────────────────────────── */

  const stageHooks = useMemo(() => ({
    begin: () => hist.current.begin(),
    live: (fn) => { hist.current.live(fn); force(); },
    end: () => { hist.current.end(); force(); },
    cancel: () => { hist.current.cancel(); force(); },
    onSelect: (ids) => setSelectionState(ids),
    onView: (v) => setView(v),
    onOpen: (id) => { setSelectionState([id]); setOpenRequest((n) => n + 1); },
    onCreateShape: (t, rect, point) => createShapeRef.current(t, rect, point),
    onCreateText: (x, y) => createTextRef.current(x, y),
    onRefStart: () => hist.current.begin(),
    onRefLive: (ref) => placeRefRef.current(ref),
    onRefEnd: () => { hist.current.end(); force(); },
    onCropStart: () => hist.current.begin(),
    onCropLive: (ref) => cropRefRef.current(ref),
    onCropEnd: () => { hist.current.end(); force(); },
    onTraceAdd: (pt) => traceAdd(pt),
    onTraceFinish: () => traceFinishRef.current(),
    onMenu: (info) => openMenu(info),
  }), [traceAdd, openMenu]);
  const [openRequest, setOpenRequest] = useState(0);
  const createShapeRef = useRef(createShape); createShapeRef.current = createShape;
  const createTextRef = useRef(createText); createTextRef.current = createText;
  const placeRefRef = useRef(placeReference); placeRefRef.current = placeReference;
  const cropRefRef = useRef(cropReference); cropRefRef.current = cropReference;
  const traceFinishRef = useRef(traceFinish); traceFinishRef.current = traceFinish;

  // The last colour used is the next shape's colour.
  useEffect(() => { if (selected.length) lastColor.current = selected[0].fill.color; }, [selected]);

  return {
    design, selection, selected, tool, mode, crop, view, prefs, notice, hasImage, refImage, settings, palette, skip, converting, convertError, dropped, traceInfo,
    stitches, generating, genError, exporting, summary, stale, sim, restorable, openRequest, stageHooks,
    canUndo: hist.current.canUndo, canRedo: hist.current.canRedo, dragging,
    setTool, setMode, setCrop, setPrefs, setSelection, notify, dismissNotice: () => setNotice(null),
    undo, redo, commit, coalesced, begin, live, end, flush, setFabricColor, include,
    patchFill, patchStroke, patchSatin, patchObject, addObjects, removeObjects, duplicate, reorder, stepOrder, breakApart: doBreakApart, fillHoles: doFillHoles,
    flip, setSize, setCentre, setRotation, align, nudge, recolor, setDesign, setHoop, newFile, editText, retext,
    runConvert, changeSettings, toggleSkip, loadPictureFile, setReference, setReferenceWidth, removeReference, replacing, confirmReplace, cancelReplace,
    trace, traceBack, traceCancel, traceFinish, startTracing, menu, openMenu, closeMenu,
    playSim, pauseSim, stopSim, seekSim, setSimSpeed,
    exportFormats, exportPreview, printProduction, saveDesignFile, openDesignFile, openStitchFile, restore,
    newId, threadName,
  };
}

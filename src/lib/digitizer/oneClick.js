/**
 * A logo to stitches with no editor on the screen: the engine behind /create ("Create by design").
 *
 * It is the Digitizer page's own conversion (components/Digitizer/useDigitizer.js: runConvert, traceUpdate, the stitch generation and the file
 * export) run once, with the editor's defaults (CONVERT_DEFAULTS), on a picture placed in the middle of the "left chest" hoop:
 *
 *   loadPicture -> extractImage -> engine.trace -> contentBox / fillScale-style sizing (what is STITCHED fills the width asked for, not the
 *   picture's margins) -> trace again at that size -> engine.shapes (fresh) -> mergeTraceObjects -> newDesign -> engine.generate ->
 *   centreStitches -> DST (buildFile) and a picture of the thread (rasterizePattern, transparent background)
 *
 * Two choices that differ from the editor, on purpose:
 *   - people: false. A face on a garment is not what "your logo" means; the person finder (a 30 MB model) is never loaded.
 *   - the cloth is the garment the customer picked and never changes with the picture. A logo whose colour matches the garment is left
 *     out by the engine (white thread on white cloth shows nothing); when that leaves nothing, `empty` is true and `notes` say why.
 *
 * Nothing here is "sewn": the numbers come from the engine and the engine's README is clear that it has not been run on a real machine.
 * Browser only (canvas, Worker). Resolves to an object; throws only when the picture cannot be read at all.
 */
import { createEngine } from "./engineClient.js";
import { loadPicture, extractImage, canvasToBlob, fileSafe } from "./image.js";
import { CONVERT_DEFAULTS, traceOptions, contentBox, mergeTraceObjects } from "./convert.js";
import { newDesign, engineDesign, DEFAULT_CLOTH, newId } from "./model.js";
import { summarize } from "./stats.js";
import { buildFile, centreStitches, toPattern } from "./exporter.js";
import { rasterizePattern } from "../embroidery/stitch/raster.js";
import { threadName, hexToRgb, rgbToHex } from "../embroidery/thread/chart.js";

/** The hoop a logo for the chest is made in: the editor's "Left chest" (100 x 100 mm). */
export const CHEST_HOOP = Object.freeze({ w: 100, h: 100 });
/** How much of the hoop a stitched logo may fill (the editor's fillScale keeps 8 % clear all round; a little less here for the border of a hoop). */
const HOOP_FILL = 0.94;
/** A picture smaller than this on its shorter side has too few pixels to make thin lines from. */
export const SMALL_PICTURE_PX = 200;
/** A design with fewer stitches than this is a speck, or the logo was mostly left out. */
export const FEW_STITCHES = 300;

export class DigitizeError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "DigitizeError";
    this.code = code; // "unreadable" | "too_slow" | "aborted" | "engine"
    Object.assign(this, extra);
  }
}

const aborted = () => Object.assign(new Error("Cancelled"), { name: "AbortError", code: "aborted" });

/** Rotate a thread chart name into a short, plain list for the customer: ["Navy", "White"]. */
function colourList(summary) {
  const seen = new Map();
  for (const b of summary.blocks) {
    if (!b.thread || !b.stitches) continue;
    const hex = rgbToHex(b.thread.r, b.thread.g, b.thread.b);
    if (!seen.has(hex)) seen.set(hex, { hex, name: threadName(hex).replace(/ \(close\)$/, "") });
  }
  return [...seen.values()];
}

/** Pixels to a millimetre in the picture of the thread the page lays on the garment (so its real width is canvas.width / THREAD_PX_PER_MM). */
export const THREAD_PX_PER_MM = 12;
/** The air round the stitching in that picture, in mm. */
export const THREAD_MARGIN_MM = 1;

/** A canvas of the stitched thread on a transparent background (the edge pixels carry the cloth colour so there is no pale or dark fringe on that cloth). */
export function threadCanvas(pattern, clothHex, { pxPerMm = THREAD_PX_PER_MM, marginMm = THREAD_MARGIN_MM, opaque = false } = {}) {
  const { r, g, b } = hexToRgb(clothHex);
  const img = rasterizePattern(pattern, { pxPerMm, marginMm, background: [r, g, b, opaque ? 255 : 0] });
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d").putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  return canvas;
}

/** The preview file the dashboard keeps: the thread on the garment's colour as WebP (PNG where WebP cannot be written), at most `maxBytes`. */
async function previewFile(pattern, clothHex, maxBytes = 150 * 1024) {
  for (const [pxPerMm, quality] of [[8, 0.82], [8, 0.68], [6, 0.7], [5, 0.6], [4, 0.55]]) {
    const canvas = threadCanvas(pattern, clothHex, { pxPerMm, marginMm: 2, opaque: true });
    let blob = await canvasToBlob(canvas, "image/webp", quality);
    if (blob.type !== "image/webp") blob = await canvasToBlob(canvas, "image/png"); // Safari before 14 cannot write WebP
    if (blob.size <= maxBytes) return blob;
    if (blob.type === "image/png" && pxPerMm <= 4) return blob;
  }
  const canvas = threadCanvas(pattern, clothHex, { pxPerMm: 3, marginMm: 2, opaque: true });
  return canvasToBlob(canvas, "image/webp", 0.5).then((b) => (b.type === "image/webp" ? b : canvasToBlob(canvas, "image/png")));
}

/**
 * @param {Blob|File} source  the logo (png, jpeg, webp, gif, svg)
 * @param {object} o
 *   widthMm   how wide the stitched logo should be (garment chest width: 90 on a tee or hoodie, 70 on sweatpants); it is made smaller when
 *             that would not fit the hoop's height or width
 *   hoop      { w, h } in mm (default CHEST_HOOP)
 *   cloth     the garment colour, "#rrggbb"
 *   fabric    a key of lib/embroidery/stitch/presets.js FABRICS ("knit", "towel", "woven"...), default "knit"
 *   name      the design's name (and so the file's)
 *   onStep    ("reading" | "digitizing" | "placing") => void
 *   signal    AbortSignal: stops the work (the engine is shut down)
 * @returns {Promise<{
 *   empty: boolean, kind: "logo"|"art"|"photo"|null, quality: "good"|"low", qualityReason: string|null, notes: string[],
 *   design, stitches: {flat: Int32Array, threads: object[]}, summary, colours: {hex, name}[], widthMm: number, heightMm: number,
 *   dst: Uint8Array|null, dstName: string|null, overlayCanvas: HTMLCanvasElement|null, preview: Blob|null,
 *   source: { width: number, height: number, vector: boolean }
 * }>}
 */
export async function digitizeLogo(source, o = {}) {
  const { widthMm = 90, hoop = CHEST_HOOP, cloth = DEFAULT_CLOTH, fabric = "knit", name = "logo", onStep, signal } = o;
  if (signal?.aborted) throw aborted();
  const engine = createEngine();
  const tokens = [];
  const stop = () => engine.dispose();
  signal?.addEventListener("abort", stop, { once: true });
  const live = () => { if (signal?.aborted) throw aborted(); };
  const newToken = () => { const t = newId(); tokens.push(t); return t; };
  const clothHex = /^#[0-9a-f]{6}$/i.test(cloth) ? cloth.toLowerCase() : DEFAULT_CLOTH;

  try {
    onStep?.("reading");
    const file = typeof File !== "undefined" && source instanceof File ? source : new File([source], `${name}.${(source.type || "image/png").split("/")[1]?.split("+")[0] || "png"}`, { type: source.type || "image/png" });
    let pic;
    try {
      pic = await loadPicture(file);
    } catch (e) {
      throw new DigitizeError("unreadable", e.message || "This file could not be read as a picture.");
    }
    live();
    const vector = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    const crop = { x: 0, y: 0, w: pic.width, h: pic.height };
    const settings = { ...CONVERT_DEFAULTS, people: false };

    // The whole picture is `widthMm` wide to begin with, in the middle of the hoop (the editor starts a new picture at about 80 % of the hoop).
    let ref = { mmPerPx: widthMm / pic.width, x: -widthMm / 2, y: -((pic.height * widthMm) / pic.width) / 2 };
    const first = extractImage(pic.canvas, crop, 1600);
    const scale = first.scale;
    const tok1 = newToken();
    let res = await engine.trace(first.image, traceOptions(settings, ref.mmPerPx / scale), "picture", tok1);
    live();
    let tok = tok1;
    const kind = res.stats?.kind || "logo";

    // What is stitched (not the picture's margins) is made to fill `widthMm`, or the hoop if that is smaller, then the picture is read again at that
    // size: thin lines and small lettering keep more of themselves in a bigger design, so the shapes are made afresh and not stretched.
    const box = contentBox(res, { originX: ref.x, originY: ref.y, mmPerPx: ref.mmPerPx / scale, fabric: clothHex });
    const nothing = (why) => ({
      empty: true, kind, quality: "low", qualityReason: "empty", notes: [why],
      design: null, stitches: null, summary: null, colours: [], widthMm: 0, heightMm: 0,
      dst: null, dstName: null, overlayCanvas: null, preview: null, source: { width: pic.width, height: pic.height, vector },
    });
    if (!box) return nothing("Nothing in this picture can be stitched on this colour of garment: it is the same colour as the cloth, or it is empty. Try another garment colour.");

    const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    const k = Math.min(10, widthMm / bw, (hoop.w * HOOP_FILL) / bw, (hoop.h * HOOP_FILL) / bh);
    if (Math.abs(k - 1) >= 0.03) {
      const cx = (box.x0 + box.x1) / 2 - ref.x, cy = (box.y0 + box.y1) / 2 - ref.y;
      const next = { mmPerPx: ref.mmPerPx * k, x: -cx * k, y: -cy * k };
      const again = extractImage(pic.canvas, crop, 1600); // the first copy went to the worker (its memory moved over): take another
      const mm2 = next.mmPerPx / again.scale;
      const tok2 = newToken();
      const res2 = await engine.trace(again.image, traceOptions(settings, mm2), "picture", tok2);
      live();
      // a bigger picture can keep fine strokes the smaller one dropped, so the stitched part may reach a little further than measured: if it
      // does not fit, scale the picture down a touch (no new trace is needed for that) and put it in the middle
      let fitted = next;
      const box2 = contentBox(res2, { originX: next.x, originY: next.y, mmPerPx: mm2, fabric: clothHex });
      if (box2) {
        const k2 = Math.min(1, (hoop.w * HOOP_FILL) / (box2.x1 - box2.x0), (hoop.h * HOOP_FILL) / (box2.y1 - box2.y0));
        const mx = next.x + ((box2.x0 + box2.x1) / 2 - next.x) * k2, my = next.y + ((box2.y0 + box2.y1) / 2 - next.y) * k2;
        fitted = { mmPerPx: next.mmPerPx * k2, x: next.x - mx, y: next.y - my };
      }
      ref = fitted;
      res = res2;
      tok = tok2;
    }

    onStep?.("digitizing");
    const job = { token: tok, skip: [], include: [], snap: false, fabric: clothHex, originX: ref.x, originY: ref.y, mmPerPx: ref.mmPerPx / scale, before: null, fresh: true, maxColors: settings.maxColors, detailThick: false };
    let made = await engine.shapes(job);
    live();
    if (made.gone) throw new DigitizeError("engine", "The picture could not be read. Please try again.");
    const objects = mergeTraceObjects([], made.objects, { fresh: true, before: null, after: made.palette, rank: new Map(made.rank) });
    if (!objects.length) return nothing("Nothing in this picture can be stitched on this colour of garment: it is the same colour as the cloth. Try another garment colour.");

    const design = newDesign({ name: fileSafe(name, "logo"), hoop: { w: hoop.w, h: hoop.h }, fabric, fabricColor: clothHex, fabricAuto: false, objects });
    const gen = await engine.generate(engineDesign(design), {});
    live();
    const centred = centreStitches({ flat: gen.flat, threads: gen.threads });
    const summary = summarize(centred.flat, centred.threads);
    if (!summary.stitches) return nothing("The logo is too fine to stitch at this size. Try a larger or simpler picture.");

    onStep?.("placing");
    const pattern = toPattern(design, centred);
    const file2 = await buildFile("dst", design, centred);
    const dst = new Uint8Array(await file2.blob.arrayBuffer());
    const overlayCanvas = threadCanvas(pattern, clothHex);
    const preview = await previewFile(pattern, clothHex);
    live();

    const notes = [];
    const reasons = [];
    const smallSide = Math.min(pic.width, pic.height);
    if (!vector && smallSide < SMALL_PICTURE_PX) { reasons.push("small"); notes.push(`This picture is small (${pic.width} × ${pic.height} px). Sending a larger one will sew better.`); }
    if (summary.stitches < FEW_STITCHES) { reasons.push("few"); notes.push("Only a few stitches came out of this picture, so most of it was too fine or too faint to sew. A larger, bolder version will sew better."); }
    if (kind === "photo") { reasons.push("photo"); notes.push("This looks like a photograph, not a logo. A photograph turns into a poster-like patch of stitching; a flat-colour logo sews much better."); }
    const warn = (gen.warnings || []).filter(Boolean);
    return {
      empty: false, kind, quality: reasons.length ? "low" : "good", qualityReason: reasons[0] || null, notes,
      design, stitches: centred, summary, colours: colourList(summary),
      widthMm: Math.round(summary.widthMm * 10) / 10, heightMm: Math.round(summary.heightMm * 10) / 10,
      dst, dstName: file2.filename, overlayCanvas, preview, warnings: warn,
      source: { width: pic.width, height: pic.height, vector },
    };
  } catch (e) {
    if (e instanceof DigitizeError || e?.name === "AbortError") throw e;
    if (/too long/i.test(e?.message || "")) throw new DigitizeError("too_slow", "That picture took too long to read. Try a simpler or smaller logo.");
    if (signal?.aborted) throw aborted();
    throw new DigitizeError("engine", e?.message || "The logo could not be digitized.");
  } finally {
    signal?.removeEventListener("abort", stop);
    try { engine.release(tokens); } catch { /* the engine is already gone */ }
    engine.dispose();
  }
}

/**
 * Picture to clean vector regions (the "tracer" of the embroidery engine).
 *
 *   traceImage(image, opts)  -> { width, height, palette, shapes, order, stats }
 *   renderTrace(result, scale)  paint a result back to RGBA pixels (how tests compare it with the source)
 *   quantize(image, opts)    -> { palette, labels, width, height, ... } fast colour preview on a small grid
 *   detectBackground(image | quantizeResult, opts)
 *
 * UNITS AND CONVENTIONS (read this before using the result)
 *  - Coordinates are in pixels of the ORIGINAL picture, floats, origin at the top-left corner of the picture,
 *    +x right, +y DOWN. Pixel (i, j) covers [i, i + 1) x [j, j + 1), so a shape that fills the whole picture has the
 *    corners (0, 0), (width, 0), (width, height), (0, height).
 *  - A shape is one connected piece of one colour. shape.contours[0] is its outer boundary, the rest are its holes.
 *    WINDING: the outer boundary runs CLOCKWISE on the screen (y down), which is a POSITIVE signed area by the shoelace
 *    formula sum(x[i] * y[i+1] - x[i+1] * y[i]) / 2 in these coordinates. Holes run COUNTER-CLOCKWISE (negative area).
 *    Contours are closed without repeating the first point. Fill rule: a point is inside when it is inside the outer
 *    contour and outside every hole (even-odd and non-zero give the same answer, there is no overlap).
 *    An island inside a hole is its own shape.
 *  - Two regions of different colours that touch share exactly the same boundary points (the points of the shared
 *    line are identical numbers in both contours, one traversed backwards), so there are no gaps and no overlaps.
 *  - The background colour is in the palette (background: true) but is never returned as a shape.
 *  - Everything physical (minFeatureMm, minAreaMm2, simplifyMm) is converted with mmPerPx, the size of one pixel of
 *    the ORIGINAL picture once stitched.
 *
 * BACKGROUND RULE ("auto")
 *  - If the picture has real transparency (at least 0.05 % of the pixels have alpha under 40 %), the see-through pixels
 *    are the background and nothing else is: a colour patch inside the transparent area is stitched.
 *  - Otherwise the palette colour (with colours within backgroundTolerance of it) that covers at least 55 % of the
 *    picture's outer ring of pixels is the background. If no colour does, nothing is background (everything is stitched).
 *    So a logo on a coloured square patch keeps the patch as a shape when the patch does not touch the picture edge
 *    (the margin colour is the background), and loses the patch when it fills the picture (it IS the border colour).
 *  - background: [r, g, b] names the background colour yourself; background: "none" stitches everything.
 *  - Background is only the part of that colour that is CONNECTED to the picture edge (flood fill from the edge over
 *    background-coloured pixels; every fully see-through pixel counts as background too, wherever it is). Pixels of the
 *    same colour that other colours enclose (white letters inside a navy disc on a white page; the counter of an O) are
 *    NOT background: they come back as ordinary shapes. Their colour is a second palette entry with the same r, g, b,
 *    background: false and enclosedBackground: true, and shape.color is that entry's index, so palette[shape.color] is
 *    always the colour to sew. A page that does not want to sew them can switch that colour off like any other.
 *
 * Pure ES module: no DOM, no Node-only calls. Everything is deterministic (same input and options, same output).
 */
import { prepare, denoise, ALPHA_CUT } from "./prep.js";
import { buildPalette, classifyPixels, flatMask, softMembership, clusterMeans, transitionalEntries, HARD_MAX_COLORS } from "./quantize.js";
import { cleanLabels, connectedComponents, OUT } from "./labels.js";
import { buildChains, chainRawPoints, traceLoops } from "./contours.js";
import { processChains } from "./simplify.js";
import { findCrossing, pullBack } from "./repair.js";
import { renderTrace } from "./render.js";
import { rgbToLab, rgbFloatToLab, toHex, now } from "./color.js";

export { renderTrace };

/** Internal: the first half of tracing (labels, palette, background). Exposed only so tests can look inside. */
export const _internals = { analyse: (image, opts, maxSide) => analyse(image, normalizeOptions(opts), maxSide || normalizeOptions(opts).maxSide) };

/** The defaults of every option (see the README of this folder for what they mean). */
export const DEFAULT_OPTIONS = Object.freeze({
  colors: "auto",
  maxColors: 8,
  mmPerPx: 0.1,
  background: "auto",
  backgroundTolerance: 12,
  minFeatureMm: 0.5,
  minAreaMm2: 0.5,
  smooth: 0.5,
  simplifyMm: 0.04,
  cornerAngleDeg: 40,
  seed: 1,
  maxSide: 1600,
});

const num = (v, d, lo, hi) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** Fill in defaults and clamp every option to a sane range. */
export function normalizeOptions(opts = {}) {
  const maxColors = Math.round(num(opts.maxColors, DEFAULT_OPTIONS.maxColors, 1, HARD_MAX_COLORS));
  const colors =
    opts.colors === undefined || opts.colors === null || opts.colors === "auto"
      ? maxColors
      : Math.round(num(opts.colors, maxColors, 1, HARD_MAX_COLORS));
  let background = "auto";
  if (opts.background === "none") background = "none";
  else if (Array.isArray(opts.background) && opts.background.length >= 3) {
    background = [0, 1, 2].map((i) => Math.round(num(opts.background[i], 0, 0, 255)));
  }
  return {
    colors,
    maxColors,
    mmPerPx: num(opts.mmPerPx, DEFAULT_OPTIONS.mmPerPx, 1e-4, 100),
    background,
    backgroundTolerance: num(opts.backgroundTolerance, DEFAULT_OPTIONS.backgroundTolerance, 0, 60),
    minFeatureMm: num(opts.minFeatureMm, DEFAULT_OPTIONS.minFeatureMm, 0, 100),
    minAreaMm2: num(opts.minAreaMm2, DEFAULT_OPTIONS.minAreaMm2, 0, 1e6),
    smooth: num(opts.smooth, DEFAULT_OPTIONS.smooth, 0, 1),
    simplifyMm: num(opts.simplifyMm, DEFAULT_OPTIONS.simplifyMm, 0, 100),
    cornerAngleDeg: num(opts.cornerAngleDeg, DEFAULT_OPTIONS.cornerAngleDeg, 10, 170),
    seed: Math.round(num(opts.seed, DEFAULT_OPTIONS.seed, 0, 2147483647)),
    maxSide: Math.round(num(opts.maxSide, DEFAULT_OPTIONS.maxSide, 64, 8192)),
  };
}

function checkImage(image) {
  if (!image || !Number.isFinite(image.width) || !Number.isFinite(image.height) || !image.data) {
    throw new TypeError("traceImage needs { width, height, data } with RGBA bytes");
  }
  if (image.width < 1 || image.height < 1 || image.data.length < image.width * image.height * 4) {
    throw new TypeError("the picture data is smaller than width x height x 4");
  }
}

/**
 * The shared first half of tracing and previewing: working copy, denoise, palette, one label per pixel, cleaning,
 * background. Returns everything the second half needs.
 */
function analyse(image, o, maxSide) {
  const stages = {};
  let t = now();
  const wk = prepare(image, maxSide);
  const { w, h, hasAlpha, cov } = wk;
  const N = w * h;
  stages.prepare = now() - t;
  t = now();
  const dn = denoise(wk.rgb, w, h);
  const rgbD = dn.rgb;
  stages.denoise = now() - t;
  t = now();
  const scale = Math.sqrt(wk.sx * wk.sy);
  const minFeaturePx = o.minFeatureMm / o.mmPerPx / scale;
  const minAreaPx = o.minAreaMm2 / (o.mmPerPx * o.mmPerPx) / (scale * scale);
  const cut = Math.round(255 * ALPHA_CUT);
  const bgColor = Array.isArray(o.background) ? o.background : null;

  // palette of the picture's own colours
  let skip = null;
  if (hasAlpha) {
    skip = new Uint8Array(N);
    for (let i = 0; i < N; i++) skip[i] = cov[i] < cut ? 1 : 0;
  }
  const excludeLab = bgColor ? new Float64Array(3) : null;
  if (bgColor) rgbToLab(bgColor[0], bgColor[1], bgColor[2], excludeLab, 0);
  const maxFg = Math.max(1, o.colors - (hasAlpha ? 1 : 0) - (bgColor ? 1 : 0));
  const pal = buildPalette(rgbD, w, h, {
    maxColors: maxFg,
    seed: o.seed,
    mergeDE: 11,
    minFeaturePx,
    noiseTol: dn.tol,
    excludeLab,
    excludeDist: o.backgroundTolerance,
    skip,
  });
  let Kfg = pal.n;
  let fgRgb = Array.from(pal.rgb);
  // colours that are only the soft edge between two others (anti-aliasing, JPEG halos) are not colours of their own
  let preLabels = null;
  if (Kfg >= 3) {
    const pre = classifyPixels(rgbD, N, pal.lab, Kfg);
    const drop = transitionalEntries(pre, w, h, pal.rgb, Kfg);
    let dropped = 0;
    for (let k = 0; k < Kfg; k++) dropped += drop[k];
    if (dropped) {
      const rgbKeep = [];
      for (let k = 0; k < Kfg; k++) if (!drop[k]) rgbKeep.push(fgRgb[k * 3], fgRgb[k * 3 + 1], fgRgb[k * 3 + 2]);
      fgRgb = rgbKeep;
      Kfg -= dropped;
    } else preLabels = pre;
  }
  if (Kfg === 0) {
    // nothing flat to learn from (a one-pixel-wide picture, say): use the mean colour
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < N; i++) { r += rgbD[i * 3]; g += rgbD[i * 3 + 1]; b += rgbD[i * 3 + 2]; }
    fgRgb.push(r / N, g / N, b / N);
    Kfg = 1;
  }
  const bgColorIndex = bgColor ? Kfg : -1;
  if (bgColor) fgRgb.push(bgColor[0], bgColor[1], bgColor[2]);
  const Kc = Kfg + (bgColor ? 1 : 0); // entries that are real colours
  const transIndex = hasAlpha ? Kc : -1;
  const K = Kc + (hasAlpha ? 1 : 0);
  const palRgb = new Float64Array(K * 3);
  const palLab = new Float64Array(K * 3);
  for (let k = 0; k < Kc; k++) {
    for (let j = 0; j < 3; j++) palRgb[k * 3 + j] = fgRgb[k * 3 + j];
    rgbFloatToLab(palRgb[k * 3], palRgb[k * 3 + 1], palRgb[k * 3 + 2], palLab, k * 3);
  }
  if (hasAlpha) {
    palRgb[transIndex * 3] = palRgb[transIndex * 3 + 1] = palRgb[transIndex * 3 + 2] = 255;
    palLab[transIndex * 3] = 50;
  }
  stages.palette = now() - t;
  t = now();

  // one label per pixel, with how much of each colour an edge pixel holds
  const labels0 = preLabels && !bgColor ? preLabels : classifyPixels(rgbD, N, palLab, Kc);
  const flat = flatMask(rgbD, w, h, pal.tFlat);
  const sm = softMembership(rgbD, w, h, labels0, flat, palRgb, Kc);
  const labels = sm.labels;
  const lab2 = sm.lab2;
  const soft = sm.soft;
  stages.classify = now() - t;
  t = now();
  if (hasAlpha) applyAlpha(labels, lab2, soft, cov, w, h, cut, transIndex);
  const cleaned = cleanLabels(labels, w, h, { rgb: rgbD, palLab, K, soft, lab2 }, minAreaPx, minFeaturePx);
  stages.clean = now() - t;
  t = now();

  // which entries are the background colours
  const bg = new Uint8Array(256);
  const bgInfo = decideBackground(labels, w, h, K, palLab, o, hasAlpha, transIndex, bgColorIndex);
  for (const k of bgInfo.indices) bg[k] = 1;
  // "background" is only the part connected to the picture edge (or to see-through pixels): pixels of a background
  // colour that are enclosed by other colours (white letters inside a navy disc on a white page) become a new palette
  // entry with the same colour and background: false, so they come back as ordinary shapes
  const parent = new Uint8Array(256);
  for (let k = 0; k < 256; k++) parent[k] = k;
  const Kn = splitEnclosedBackground(labels, w, h, bg, K, transIndex, parent);
  const palRgbN = new Float64Array(Kn * 3);
  const palLabN = new Float64Array(Kn * 3);
  palRgbN.set(palRgb);
  palLabN.set(palLab);
  for (let k = K; k < Kn; k++) {
    for (let j = 0; j < 3; j++) { palRgbN[k * 3 + j] = palRgb[parent[k] * 3 + j]; palLabN[k * 3 + j] = palLab[parent[k] * 3 + j]; }
  }
  stages.background = now() - t;

  // drop entries that no pixel uses any more, and renumber
  const count = new Float64Array(Kn);
  for (let i = 0; i < N; i++) count[labels[i]]++;
  const remap = new Int16Array(256).fill(-1);
  let K2 = 0;
  for (let k = 0; k < Kn; k++) if (count[k] > 0) remap[k] = K2++;
  if (K2 === 0) { remap[0] = 0; K2 = 1; count[0] = N; }
  if (K2 !== Kn) {
    for (let i = 0; i < N; i++) {
      labels[i] = remap[labels[i]];
      if (lab2[i] !== 255) lab2[i] = remap[lab2[i]] < 0 ? 255 : remap[lab2[i]];
    }
  }
  const pal2 = {
    rgb: new Float64Array(K2 * 3),
    lab: new Float64Array(K2 * 3),
    count: new Float64Array(K2),
    bg: new Uint8Array(K2),
    transparent: new Uint8Array(K2),
    enclosed: new Uint8Array(K2),
  };
  // colour class of every entry: an enclosed copy of a background colour and its parent are the same colour
  const cls = new Uint8Array(256);
  for (let k = 0; k < 256; k++) cls[k] = k;
  for (let k = 0; k < Kn; k++) {
    const m = remap[k];
    if (m < 0) continue;
    for (let j = 0; j < 3; j++) { pal2.rgb[m * 3 + j] = palRgbN[k * 3 + j]; pal2.lab[m * 3 + j] = palLabN[k * 3 + j]; }
    pal2.count[m] = count[k];
    pal2.bg[m] = bg[k];
    pal2.transparent[m] = k === transIndex ? 1 : 0;
    if (k >= K) {
      pal2.enclosed[m] = 1;
      if (remap[parent[k]] >= 0) cls[m] = remap[parent[k]];
    }
  }
  // the real colours: mean of the pixels deep inside each region (the explicit background colour stays as given)
  const transNew = hasAlpha ? remap[transIndex] : -1;
  const means = clusterMeans(wk.rgb, w, h, labels, soft, K2, pal2.rgb, transNew);
  for (let k = 0; k < K2; k++) {
    if (k === transNew) continue;
    const fixedBg = bgColor && pal2.bg[k] && Math.abs(pal2.rgb[k * 3] - bgColor[0]) + Math.abs(pal2.rgb[k * 3 + 1] - bgColor[1]) + Math.abs(pal2.rgb[k * 3 + 2] - bgColor[2]) < 1e-6;
    if (fixedBg) continue;
    for (let j = 0; j < 3; j++) pal2.rgb[k * 3 + j] = means[k * 3 + j];
  }
  // an enclosed copy has exactly the colour of the background entry it came from
  for (let k = 0; k < K2; k++) {
    if (cls[k] !== k) for (let j = 0; j < 3; j++) pal2.rgb[k * 3 + j] = pal2.rgb[cls[k] * 3 + j];
  }
  for (let k = 0; k < K2; k++) rgbFloatToLab(pal2.rgb[k * 3], pal2.rgb[k * 3 + 1], pal2.rgb[k * 3 + 2], pal2.lab, k * 3);
  return { wk, w, h, N, labels, lab2, soft, cls, pal: pal2, K: K2, scale, minFeaturePx, minAreaPx, noise: dn, cleaned, stages, bgInfo };
}

/**
 * Keep as background only the pixels of background colours that are connected (4 neighbours) to the picture edge or to
 * see-through pixels. The other pixels of those colours (enclosed by other colours) get a new label, one per background
 * colour that has such pixels, appended after the `K` existing ones; `parent[new]` says which colour it copies.
 * Returns the number of labels now in use. `labels` is changed in place.
 */
function splitEnclosedBackground(labels, w, h, bg, K, transIndex, parent) {
  let any = false;
  for (let k = 0; k < K; k++) if (bg[k]) any = true;
  if (!any) return K;
  const N = w * h;
  const outside = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;
  const push = (i) => {
    if (!outside[i] && bg[labels[i]]) {
      outside[i] = 1;
      stack[sp++] = i;
    }
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  if (transIndex >= 0) for (let i = 0; i < N; i++) if (labels[i] === transIndex) push(i);
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < N - w) push(i + w);
  }
  const added = new Int16Array(256).fill(-1);
  let next = K;
  for (let i = 0; i < N; i++) {
    const l = labels[i];
    if (!bg[l] || outside[i]) continue;
    if (added[l] < 0) {
      added[l] = next;
      parent[next] = l;
      next++;
    }
    labels[i] = added[l];
  }
  return next;
}

/** Pixels that are see-through become the transparent label; edge pixels get their share from the alpha. */
function applyAlpha(labels, lab2, soft, cov, w, h, cut, transIndex) {
  const n = w * h;
  const full = cut * 2;
  const isClear = (i) => cov[i] < cut;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const clear = isClear(i);
      let edge = false;
      if (x > 0 && isClear(i - 1) !== clear) edge = true;
      else if (x < w - 1 && isClear(i + 1) !== clear) edge = true;
      else if (y > 0 && isClear(i - w) !== clear) edge = true;
      else if (y < h - 1 && isClear(i + w) !== clear) edge = true;
      if (clear) {
        const colorLabel = labels[i];
        labels[i] = transIndex;
        if (edge && cov[i] > 0) {
          const m = cov[i] / full; // share of the colour, under one half
          lab2[i] = colorLabel;
          soft[i] = Math.max(128, Math.min(254, Math.round(255 * (1 - m))));
        } else {
          lab2[i] = 255;
          soft[i] = 255;
        }
      } else if (edge && cov[i] < full) {
        const m = cov[i] / full; // one half or more
        lab2[i] = transIndex;
        soft[i] = Math.max(128, Math.min(254, Math.round(255 * m)));
      }
    }
  }
  void n;
}

/**
 * Decide which palette entries are the background. Returns { type: "transparent" | "color" | "none", indices, share }.
 */
function decideBackground(labels, w, h, K, palLab, o, hasAlpha, transIndex, bgColorIndex) {
  const indices = [];
  const near = (a, tol) => {
    const out = [];
    for (let k = 0; k < K; k++) {
      if (k === transIndex) continue;
      const dl = palLab[k * 3] - palLab[a * 3];
      const da = palLab[k * 3 + 1] - palLab[a * 3 + 1];
      const db = palLab[k * 3 + 2] - palLab[a * 3 + 2];
      if (Math.sqrt(dl * dl + da * da + db * db) <= tol) out.push(k);
    }
    return out;
  };
  if (o.background === "none") return { type: "none", indices, share: 0 };
  if (hasAlpha) {
    indices.push(transIndex);
    if (bgColorIndex >= 0) for (const k of near(bgColorIndex, o.backgroundTolerance)) indices.push(k);
    return { type: "transparent", indices, share: 1 };
  }
  if (bgColorIndex >= 0) {
    for (const k of near(bgColorIndex, o.backgroundTolerance)) indices.push(k);
    return { type: "color", indices, share: 1 };
  }
  // auto: the colour that covers most of the picture's outer ring
  const counts = new Float64Array(K);
  let ring = 0;
  const tally = (i) => { counts[labels[i]]++; ring++; };
  for (let x = 0; x < w; x++) tally(x);
  if (h > 1) for (let x = 0; x < w; x++) tally((h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) { tally(y * w); if (w > 1) tally(y * w + w - 1); }
  let top = 0;
  for (let k = 1; k < K; k++) if (counts[k] > counts[top]) top = k;
  const group = near(top, o.backgroundTolerance);
  let share = 0;
  for (const k of group) share += counts[k];
  share /= ring;
  if (share >= 0.55 && group.length < K) {
    for (const k of group) indices.push(k);
    return { type: "color", indices, share };
  }
  return { type: "none", indices, share };
}

/** Palette entries as the public objects. */
function publicPalette(a, srcPixels) {
  const out = [];
  for (let k = 0; k < a.K; k++) {
    const r = Math.max(0, Math.min(255, Math.round(a.pal.rgb[k * 3])));
    const g = Math.max(0, Math.min(255, Math.round(a.pal.rgb[k * 3 + 1])));
    const b = Math.max(0, Math.min(255, Math.round(a.pal.rgb[k * 3 + 2])));
    const e = {
      r, g, b,
      hex: toHex(r, g, b),
      pixels: Math.round((a.pal.count[k] / a.N) * srcPixels),
      fraction: a.pal.count[k] / a.N,
      background: !!a.pal.bg[k],
    };
    if (a.pal.transparent[k]) e.transparent = true;
    if (a.pal.enclosed[k]) e.enclosedBackground = true;
    out.push(e);
  }
  return out;
}

/**
 * Fast colour preview for the screen: the picture is shrunk to `opts.previewSide` (default 480) pixels on the long side
 * and reduced to its palette. Returns { palette, labels, width, height, scaleX, scaleY, background } where labels hold
 * one palette index per pixel of the small grid (background colours included) and palette entries look like the ones
 * traceImage returns.
 */
export function quantize(image, opts = {}) {
  checkImage(image);
  const o = normalizeOptions(opts);
  const side = Math.round(num(opts.previewSide, 480, 32, o.maxSide));
  const a = analyse(image, o, side);
  return {
    palette: publicPalette(a, image.width * image.height),
    labels: a.labels,
    width: a.w,
    height: a.h,
    scaleX: a.wk.sx,
    scaleY: a.wk.sy,
    background: { type: a.bgInfo.type, indices: Array.from(a.pal.bg).map((v, k) => (v ? k : -1)).filter((k) => k >= 0), share: a.bgInfo.share },
  };
}

/**
 * Which colour is the background? Takes a picture, or the result of quantize(). Returns
 * { type: "transparent" | "color" | "none", index (palette index or -1), color ([r, g, b] or null), share }.
 */
export function detectBackground(imageOrQuantized, opts = {}) {
  const q = imageOrQuantized && imageOrQuantized.labels && imageOrQuantized.palette ? imageOrQuantized : quantize(imageOrQuantized, { ...opts, previewSide: 256 });
  const idx = q.palette.findIndex((p) => p.background);
  if (idx < 0) return { type: "none", index: -1, color: null, share: q.background ? q.background.share : 0 };
  const p = q.palette[idx];
  const type = p.transparent ? "transparent" : "color";
  return { type, index: idx, color: type === "color" ? [p.r, p.g, p.b] : null, share: q.background ? q.background.share : 1 };
}

/**
 * Make sure no outline crosses itself: look at every loop and, where two of its segments cross, pull the sharpest
 * point that is not a junction back until they do not (see repair.js). Changes the shared chain points, so both
 * regions that use a line still agree. Returns how many points were moved.
 */
function repairCrossings(loops, chains, pts) {
  let moved = 0;
  // every chain end that sits on a junction, by junction: moving a junction means moving all of them
  let nodeRefs = null;
  const nodes = () => {
    if (nodeRefs) return nodeRefs;
    nodeRefs = new Map();
    for (let c = 0; c < chains.length; c++) {
      const p = pts[c];
      if (!p || chains[c].closed) continue;
      const add = (v, idx) => {
        let a = nodeRefs.get(v);
        if (!a) { a = []; nodeRefs.set(v, a); }
        a.push([c, idx]);
      };
      add(chains[c].v0, 0);
      add(chains[c].vEnd, p.length / 2 - 1);
    }
    return nodeRefs;
  };
  for (let pass = 0; pass < 4; pass++) {
    const before = moved;
    for (const lp of loops) {
      // the points of the loop in order: [chain, index in chain]
      const refC = [];
      const refI = [];
      for (const hc of lp.halves) {
        const c = hc >> 1;
        const rev = hc & 1;
        const p = pts[c];
        if (!p) continue;
        const n = p.length / 2;
        if (chains[c].closed) {
          if (!rev) for (let i = 0; i < n; i++) { refC.push(c); refI.push(i); }
          else for (let i = n - 1; i >= 0; i--) { refC.push(c); refI.push(i); }
        } else if (!rev) {
          for (let i = 0; i < n - 1; i++) { refC.push(c); refI.push(i); }
        } else {
          for (let i = n - 1; i >= 1; i--) { refC.push(c); refI.push(i); }
        }
      }
      const n = refC.length;
      if (n < 4) continue;
      const xy = new Float64Array(n * 2);
      for (let k = 0; k < n; k++) { xy[k * 2] = pts[refC[k]][refI[k] * 2]; xy[k * 2 + 1] = pts[refC[k]][refI[k] * 2 + 1]; }
      const isNode = (k) => !chains[refC[k]].closed && (refI[k] === 0 || refI[k] === pts[refC[k]].length / 2 - 1);
      for (let round = 0; round < 16; round++) {
        const cr = findCrossing(xy, n);
        if (!cr) break;
        // first try points that are not junctions, then junctions too
        let k = pullBack(xy, n, cr[0], cr[1], isNode);
        if (k < 0) k = pullBack(xy, n, cr[0], cr[1], () => false);
        if (k < 0) break;
        if (isNode(k)) {
          const c = refC[k];
          const v = refI[k] === 0 ? chains[c].v0 : chains[c].vEnd;
          for (const [cc, idx] of nodes().get(v) || []) { pts[cc][idx * 2] = xy[k * 2]; pts[cc][idx * 2 + 1] = xy[k * 2 + 1]; }
          // the same junction may appear again in this loop
          for (let m = 0; m < n; m++) {
            if (m !== k && isNode(m) && (refI[m] === 0 ? chains[refC[m]].v0 : chains[refC[m]].vEnd) === v) { xy[m * 2] = xy[k * 2]; xy[m * 2 + 1] = xy[k * 2 + 1]; }
          }
        } else {
          pts[refC[k]][refI[k] * 2] = xy[k * 2];
          pts[refC[k]][refI[k] * 2 + 1] = xy[k * 2 + 1];
        }
        moved++;
      }
    }
    if (moved === before) break; // a move can undo the repair of another loop that shares the point: go round again
  }
  return moved;
}

/**
 * Trace a picture into clean vector regions. See the top of this file for the result and the conventions.
 * image = { width, height, data: Uint8ClampedArray RGBA (straight alpha) }. All options are optional.
 */
export function traceImage(image, opts = {}) {
  const tStart = now();
  checkImage(image);
  const o = normalizeOptions(opts);
  const a = analyse(image, o, o.maxSide);
  const { w, h, labels, lab2, soft, K } = a;
  let t = now();

  // outlines
  const graph = buildChains(labels, w, h);
  const isShape = (l) => l < K && !a.pal.bg[l];
  const loops = traceLoops(graph, labels, w, h, isShape);
  const chains = graph.chains;
  const usedChain = new Uint8Array(chains.length);
  for (const lp of loops) for (const hc of lp.halves) usedChain[hc >> 1] = 1;
  for (let c = 0; c < chains.length; c++) chains[c].skip = !usedChain[c];
  a.stages.chains = now() - t;
  t = now();
  const simplifyPx = o.simplifyMm / o.mmPerPx / a.scale;
  // a noisy source (JPEG) cannot be trusted to better than a fraction of a pixel: a piece of outline that stays within
  // that of a straight line is drawn as one, instead of following the block wobble
  const straightPx = simplifyPx + Math.min(1, a.noise.noise.fraction / 0.15) * 0.3;
  const pts = processChains(
    chains,
    (c) => chainRawPoints(chains[c], graph.W1, labels, lab2, soft, w, h, a.cls),
    graph.W1,
    w,
    h,
    {
      smooth: o.smooth,
      cornerRad: (o.cornerAngleDeg * Math.PI) / 180,
      epsR: Math.max(0.02, simplifyPx),
      epsF: Math.max(0.02, simplifyPx / 5),
      epsStraight: Math.max(0.02, straightPx),
    },
  );
  a.stages.curves = now() - t;
  t = now();
  const repairs = repairCrossings(loops, chains, pts);
  a.stages.repair = now() - t;
  t = now();

  // loops -> contours in the original pixel grid
  const sx = a.wk.sx;
  const sy = a.wk.sy;
  const W0 = image.width;
  const H0 = image.height;
  const loopContour = (lp) => {
    const out = [];
    for (const hc of lp.halves) {
      const c = hc >> 1;
      const rev = hc & 1;
      const p = pts[c];
      if (!p) continue;
      const n = p.length / 2;
      if (chains[c].closed) {
        if (!rev) for (let i = 0; i < n; i++) out.push(p[i * 2], p[i * 2 + 1]);
        else for (let i = n - 1; i >= 0; i--) out.push(p[i * 2], p[i * 2 + 1]);
      } else if (!rev) {
        for (let i = 0; i < n - 1; i++) out.push(p[i * 2], p[i * 2 + 1]);
      } else {
        for (let i = n - 1; i >= 1; i--) out.push(p[i * 2], p[i * 2 + 1]);
      }
    }
    const poly = [];
    for (let i = 0; i < out.length; i += 2) {
      let x = out[i] * sx;
      let y = out[i + 1] * sy;
      if (x < 0) x = 0; else if (x > W0) x = W0;
      if (y < 0) y = 0; else if (y > H0) y = H0;
      const last = poly[poly.length - 1];
      if (last && Math.abs(last[0] - x) < 1e-9 && Math.abs(last[1] - y) < 1e-9) continue;
      poly.push([x, y]);
    }
    if (poly.length > 1) {
      const f = poly[0];
      const l = poly[poly.length - 1];
      if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) poly.pop();
    }
    return poly;
  };
  const areaOf = (poly) => {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      s += p[0] * q[1] - q[0] * p[1];
    }
    return s / 2;
  };
  const cc = connectedComponents(labels, w, h);
  const byComp = new Map();
  for (const lp of loops) {
    const comp = lp.pix >= 0 ? cc.comp[lp.pix] : -1;
    if (comp < 0) continue;
    let e = byComp.get(comp);
    if (!e) { e = { outer: null, holes: [] }; byComp.set(comp, e); }
    if (lp.area2 > 0) e.outer = lp;
    else e.holes.push(lp);
  }
  const shapes = [];
  const minArea = 1e-6;
  const comps = [...byComp.keys()].sort((p, q) => p - q);
  let vertices = 0;
  for (const comp of comps) {
    const e = byComp.get(comp);
    if (!e.outer) continue;
    const outer = loopContour(e.outer);
    if (outer.length < 3) continue;
    const outerArea = areaOf(outer);
    if (Math.abs(outerArea) < minArea) continue;
    const contours = [outer];
    let area = Math.abs(outerArea);
    for (const hl of e.holes) {
      const hole = loopContour(hl);
      if (hole.length < 3) continue;
      const ha = areaOf(hole);
      if (Math.abs(ha) < minArea) continue;
      contours.push(hole);
      area -= Math.abs(ha);
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of outer) {
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[1] > y1) y1 = p[1];
    }
    for (const c of contours) vertices += c.length;
    shapes.push({ id: shapes.length, color: cc.label[comp], contours, area, bbox: [x0, y0, x1, y1] });
  }
  a.stages.assemble = now() - t;

  const palette = publicPalette(a, W0 * H0);
  // sewing order, bottom to top: the biggest colour first, small detail colours last
  const areaByColor = new Float64Array(K);
  for (const s of shapes) areaByColor[s.color] += s.area;
  const order = [];
  for (let k = 0; k < K; k++) if (areaByColor[k] > 0) order.push(k);
  order.sort((p, q) => areaByColor[q] - areaByColor[p] || p - q);

  return {
    width: W0,
    height: H0,
    palette,
    shapes,
    order,
    stats: {
      ms: now() - tStart,
      colors: palette.filter((p) => !p.background).length,
      shapes: shapes.length,
      vertices,
      work: [w, h],
      scale: a.scale,
      background: a.bgInfo.type,
      noise: { fraction: a.noise.noise.fraction, mean: a.noise.noise.mean, passes: a.noise.passes },
      repairs,
      removedSpeckPixels: a.cleaned.specks,
      removedSliverPixels: a.cleaned.slivers,
      stages: a.stages,
    },
  };
}

/**
 * A palette found region by region, and the labelling that keeps every region to its own colours: the picture is split into layers (hair, skin,
 * clothes ...) before it is traced, instead of all of it fighting over one shared palette. See regions.js for the region map.
 *
 *   buildRegionalPalette   each region gets as many colours as it earns: they are shared out by how much error one more colour takes away
 *                          there, weighted by how much the region matters (the face over the clothes), so a face of many tones gets many and a
 *                          plain jacket few. Colours of different regions that are alike are one thread.
 *   classifyByRegion       a pixel takes the nearest colour among its own region's, and, within a few tenths of a millimetre of another region
 *                          (where the map is only as good as a guess), among that region's too: so the border follows the real edge in the picture
 *                          but grey hair is never given a skin colour from the middle of a face, nor a cheek a grey of the hair.
 */
import { makeRng, rgbToLab, rgbFloatToLab } from "./color.js";
import { sampleFlatness, binFlatSamples, seedCentres, lloyd, paletteFromBins } from "./quantize.js";
import { DEFAULT_REGION_WEIGHTS, REGION_COUNT, ZONE_PARENT as ZONE_OF } from "./regions.js";

/** A class with less than this share of the person has no colours of its own: its pixels take the nearest colour of any region. */
const MIN_SHARE = 0.01;
/** The eyes and lips (classes 6 and 7), the white of the eye and the open mouth (8 and 9) have colours of their own from this many pixels of the work grid. */
const FEATURE_MIN_PX = 60;
/** The most colours one region can be given. */
const MAX_PER_REGION = 8;
/**
 * How the colours are shared out. Error is counted in pixels, so a huge plain region (a white suit, a helmet, a wall of clothes) always showed a bigger error to
 * fix than a small face, whatever the face weighed: the astronaut got 5 colours for his suit and ONE for his face (a flat patch with no eyes). A person is read by
 * the face first, so (1) the gain of one more colour counts by the region's size to this power (1 = the old, plain pixel count; 0 = every region alike), and
 * (2) the face (class 3) and, when the face finder found one, its eyes (class 6) are given a few colours before anything is shared by gain, as far as the palette
 * and the region itself allow.
 *
 * Measured on 19 portraits (16 of a set of 55 Wikimedia pictures, split in tuning and held-out halves, and 3 older ones) against the shares by pixel count, by the
 * person's own colour error and the face's: a face minimum of 3 (not 4) and no minimum for hair and body skin cost the whole person nothing (+0.1 dE) and kept
 * the shirt of a portrait its colour, where minimums of 4, 2 and 2 took +0.2 to +0.5 dE from the clothes for a few more tones in a face; the exponent mattered
 * little once the minimums were there (0.5, 0.7 and 1 gave the same faces); fewer colours for the eyes or the eyes' extras lost the astronaut his eyes.
 */
export const REGION_AREA_POWER = 0.7;
export const REGION_MIN_COLORS = Object.freeze({ 3: 3, 6: 2, 9: 2 }); // (9: the opening of a mouth has the white of the teeth and the dark behind them)
/** Colours the eyes and lips may add on top of the palette (classes 6 and 7: only when the landmarker found a face), most of which merge with the face's and hair's. */
export const REGION_FEATURE_EXTRA = 3;
/** Only a palette this big can spare colours for minimums: a small palette is the person's own choice. */
const MIN_COLORS_FROM = 8;

/** Pixel-weighted squared colour error of the bins clustered into k colours (k-means in Lab). */
function errorWithK(bins, k, rng) {
  const { pts, wts, cnts, m } = bins;
  const seeds = seedCentres(pts, wts, m, k, rng);
  const kk = seeds.length / 3;
  const res = lloyd(pts, wts, m, seeds, kk, 20);
  let sse = 0;
  for (let i = 0; i < m; i++) {
    const c = res.assign[i];
    const dl = pts[i * 3] - res.centres[c * 3], da = pts[i * 3 + 1] - res.centres[c * 3 + 1], db = pts[i * 3 + 2] - res.centres[c * 3 + 2];
    sse += (dl * dl + da * da + db * db) * cnts[i];
  }
  return sse;
}

/**
 * @param {Uint8ClampedArray} rgb  the work picture (3 bytes a pixel)
 * @param {Uint8Array} classes  one class per pixel of the work grid (regions.js)
 * @param {object} opts  maxColors (all regions together), seed, mergeDE, crumbs, noiseTol, weightPower, weights (by class), skip (pixels to leave out), anchors
 *   (colours measured on the picture that the palette must have: [{ rgb: [r, g, b], classes: [6] }], see the comment at `anchored` below)
 * @returns {null | { n, rgb, lab, weight, classMask, tFlat, flatSamples }}  classMask[k]: the classes colour k may be used in (bit c = class c); null when there is no region to speak of
 */
export function buildRegionalPalette(rgb, w, h, classes, opts) {
  const n = w * h;
  const skip = opts.skip || null;
  const weights = opts.weights || DEFAULT_REGION_WEIGHTS;
  const counts = new Float64Array(REGION_COUNT);
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (skip && skip[i]) continue;
    const c = classes[i];
    if (c > 0 && c < REGION_COUNT) { counts[c]++; total++; }
  }
  // The white of the eye and the open mouth (8, 9) are ZONES, not regions: they have no palette of their own. The palette is found exactly as if they were the eyes (6) and
  // the lips (7) they lie in (their flat patches, their colours, their share of the palette); a zone only says where a measured white (opts.anchors) may be used, and the
  // anchor of a zone with enough pixels to see is added below. Without an anchor the zone changes nothing at all.
  let cl = classes;
  const zonePx = new Float64Array(REGION_COUNT);
  if (Object.keys(ZONE_OF).some((z) => counts[z] > 0)) {
    cl = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const c = classes[i]; cl[i] = ZONE_OF[c] !== undefined ? ZONE_OF[c] : c; }
    for (const z of Object.keys(ZONE_OF).map(Number)) { zonePx[z] = counts[z]; counts[ZONE_OF[z]] += counts[z]; counts[z] = 0; }
  }
  const live = [];
  // (the eyes and lips are small next to a person but are what is read first: they count from a few dozen pixels, not from a hundredth of the person)
  for (let c = 1; c < REGION_COUNT; c++) if (counts[c] >= (c >= 6 ? FEATURE_MIN_PX : Math.max(300, MIN_SHARE * total))) live.push(c);
  if (!live.length) return null;
  // the zones that have a measured colour to keep where they are, and are big enough to see
  const zonesLive = [];
  for (const z of Object.keys(ZONE_OF).map(Number)) {
    if (zonePx[z] >= FEATURE_MIN_PX && live.includes(ZONE_OF[z]) && (opts.anchors || []).some((a) => a && Array.isArray(a.classes) && a.classes.includes(z))) zonesLive.push(z);
  }
  const stride = Math.max(1, Math.ceil(Math.sqrt(n / 600000)));
  const tFlat = Math.max(6, Math.min(20, Math.round((opts.noiseTol || 6) * 0.8)));
  const power = opts.weightPower ?? 0.5;
  const rng = makeRng(opts.seed);
  const minColors = opts.maxColors >= MIN_COLORS_FROM ? opts.minColors || REGION_MIN_COLORS : {};
  // each region: its histogram, and how its error falls as it is given more colours
  const per = [];
  for (const c of live) {
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) mask[i] = cl[i] === c && !(skip && skip[i]) ? 0 : 1;
    const smp = sampleFlatness(rgb, w, h, stride, mask, true);
    let bins = binFlatSamples(rgb, smp, tFlat, 2, null, 0, power, null);
    if (bins.m > 15000) bins = binFlatSamples(rgb, smp, tFlat, 3, null, 0, power, null);
    if (bins.m === 0) continue;
    const Kmax = Math.min(MAX_PER_REGION, bins.m);
    const sse = [0, 0];
    for (let k = 1; k <= Kmax; k++) sse[k] = k === 1 ? errorWithK(bins, 1, rng) : Math.min(sse[k - 1], errorWithK(bins, k, rng)); // (never worse with more colours)
    per.push({ c, bins, sse, K: 1, Kmax, n: counts[c] });
  }
  if (!per.length) return null;
  // every region has one colour; the regions a viewer reads first then get their few (opts.minColors), and the rest go where one more takes away the most weighted error
  const featureRegions = per.filter((p) => p.c >= 6).length;
  // the colours the caller measured (a face's whites) are paid for here, out of the shares, where the region's weight decides what goes: found afterwards they would cost the
  // palette its closest pair of colours, whichever region they were in (a lip's pink, a cheek's shade)
  const anchorList = (opts.anchors || []).filter((a) => a && Array.isArray(a.rgb) && a.rgb.length >= 3 && a.rgb.slice(0, 3).every(Number.isFinite) && Array.isArray(a.classes) && a.classes.some((c) => live.includes(c) || zonesLive.includes(c)));
  let budget = Math.max(0, opts.maxColors + (featureRegions ? opts.featureExtra ?? REGION_FEATURE_EXTRA : 0) - per.length - anchorList.length);
  const areaPower = opts.areaPower ?? REGION_AREA_POWER;
  for (const p of [...per].sort((a, b) => (weights[b.c] ?? 1) - (weights[a.c] ?? 1))) {
    const want = Math.min(minColors[p.c] ?? 1, p.Kmax);
    while (p.K < want && budget > 0) { p.K++; budget--; }
  }
  while (budget > 0) {
    let best = -1, gain = 0;
    for (let j = 0; j < per.length; j++) {
      const p = per[j];
      if (p.K >= p.Kmax) continue;
      const g = (weights[p.c] ?? 1) * (p.sse[p.K] - p.sse[p.K + 1]) * Math.pow(Math.max(1, p.n), areaPower - 1);
      if (g > gain) { gain = g; best = j; }
    }
    if (best < 0) break;
    per[best].K++;
    budget--;
  }
  // each region's own palette, then the colours that are alike across regions made one
  let entries = [];
  // (the eyes and lips are classes of their own only on a face the landmarker found: their dark and their white are the same thread as the hair's and the sclera's more often than not)
  for (const p of per) {
    const pal = paletteFromBins(p.bins, p.K, { seed: opts.seed, mergeDE: opts.mergeDE, crumbs: opts.crumbs });
    for (let i = 0; i < pal.n; i++) {
      entries.push({ lab: [pal.lab[i * 3], pal.lab[i * 3 + 1], pal.lab[i * 3 + 2]], rgb: [pal.rgb[i * 3], pal.rgb[i * 3 + 1], pal.rgb[i * 3 + 2]], px: pal.weight[i] * counts[p.c], mask: 1 << p.c });
    }
  }
  // Colours the caller measured on the picture and wants kept (the white of the eyes and of the teeth, see digitizer/faces.js): flat patches never give a small white a
  // colour of its own. Each belongs to the classes it names (and only a class that has colours of its own here: no eyes found in the work grid, no eye white). An anchor
  // keeps its colour exactly when it is merged with a colour that is alike (it is what was measured, not an average), and is never the one merged away to save a needle.
  let anchored = 0;
  for (const a of anchorList) {
    let mask = 0, share = 0;
    for (const c of a.classes) if (live.includes(c) || zonesLive.includes(c)) { mask |= 1 << c; share += counts[c] || zonePx[c]; }
    if (!mask) continue;
    const lab = new Float64Array(3);
    rgbFloatToLab(a.rgb[0], a.rgb[1], a.rgb[2], lab, 0);
    entries.push({ lab: [lab[0], lab[1], lab[2]], rgb: a.rgb.slice(0, 3), px: Math.max(1, 0.3 * share), mask, anchor: true });
    anchored++;
  }
  const dist = (a, b) => Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]);
  const mergePair = (a, b) => {
    const px = a.px + b.px, mask = a.mask | b.mask;
    if (a.anchor !== b.anchor) return { ...(a.anchor ? a : b), px, mask };
    return { lab: a.lab.map((v, k) => (v * a.px + b.lab[k] * b.px) / px), rgb: a.rgb.map((v, k) => (v * a.px + b.rgb[k] * b.px) / px), px, mask, anchor: a.anchor };
  };
  for (;;) {
    let bi = -1, bj = -1, bd = opts.mergeDE;
    for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) { const d = dist(entries[i], entries[j]); if (d < bd) { bd = d; bi = i; bj = j; } }
    if (bi < 0) break;
    entries[bi] = mergePair(entries[bi], entries[bj]);
    entries.splice(bj, 1);
  }
  // the regions were given up to `featureExtra` colours more than the machine has needles (the eyes and lips add theirs; much of it merges above): never more than it holds.
  // The pair merged is the closest one in which no anchor is given up (the white that was measured must survive), unless only anchors are left.
  while (entries.length > opts.maxColors && entries.length > 1) {
    let bi = -1, bj = -1, bd = Infinity;
    for (const skipAnchors of [true, false]) {
      for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
        if (skipAnchors && (entries[i].anchor || entries[j].anchor)) continue;
        const d = dist(entries[i], entries[j]);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
      if (bi >= 0) break;
    }
    entries[bi] = mergePair(entries[bi], entries[bj]);
    entries.splice(bj, 1);
  }
  entries.sort((a, b) => b.px - a.px);
  const K = entries.length;
  const out = { n: K, rgb: new Float64Array(K * 3), lab: new Float64Array(K * 3), weight: new Float64Array(K), classMask: new Uint16Array(K), anchor: new Uint8Array(K), tFlat, flatSamples: total };
  entries.forEach((e, k) => {
    for (let j = 0; j < 3; j++) { out.rgb[k * 3 + j] = e.rgb[j]; out.lab[k * 3 + j] = e.lab[j]; }
    out.weight[k] = e.px / total;
    out.classMask[k] = e.mask;
    out.anchor[k] = e.anchor ? 1 : 0; // 1: a colour measured by the caller, which the tracer keeps as it was measured (it does not average it with the pixels it ends up covering)
  });
  out.live = [...live, ...zonesLive];
  out.alloc = per.map((p) => [p.c, p.K]); // colours asked for, by class (a region may end with fewer: close colours are merged)
  out.anchored = anchored; // measured colours handed over by the caller and used (some merge with a colour that is alike)
  return out;
}

/** `mask` (0/1 per pixel) grown by `r` pixels in a square: two passes with running sums, quick whatever r is. */
function dilate(mask, w, h, r) {
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  const sum = new Int32Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++) {
    sum[0] = 0;
    for (let x = 0; x < w; x++) sum[x + 1] = sum[x] + mask[y * w + x];
    for (let x = 0; x < w; x++) tmp[y * w + x] = sum[Math.min(w, x + r + 1)] - sum[Math.max(0, x - r)] > 0 ? 1 : 0;
  }
  for (let x = 0; x < w; x++) {
    sum[0] = 0;
    for (let y = 0; y < h; y++) sum[y + 1] = sum[y] + tmp[y * w + x];
    for (let y = 0; y < h; y++) out[y * w + x] = sum[Math.min(h, y + r + 1)] - sum[Math.max(0, y - r)] > 0 ? 1 : 0;
  }
  return out;
}

/**
 * Give every pixel its nearest colour among those its region may use (see the top of the file).
 * @param {Float64Array} palLab  the palette in Lab (3 numbers each), `K` entries
 * @param {{ classMask: Uint16Array, live: number[] }} pal  from buildRegionalPalette
 * @param {number} r  how many pixels from another region a pixel may also take that region's colours
 */
export function classifyByRegion(rgb, n, w, h, palLab, K, classes, pal, r) {
  const labels = new Uint8Array(n);
  const all = (1 << Math.min(K, 15)) - 1;
  // colours a class may use, as a bit set over the palette (the classes with no colours of their own, and none for the see-through background)
  const entriesOf = new Array(REGION_COUNT).fill(all);
  entriesOf[0] = 0;
  for (const c of pal.live) { let m = 0; for (let k = 0; k < K && k < 15; k++) if (pal.classMask[k] & (1 << c)) m |= 1 << k; entriesOf[c] = m; }
  // A zone (the white of the eye, the open mouth) may use the colours of the eyes and the lips it lies in, and, when a white was measured for it, that white too
  for (const z of Object.keys(ZONE_OF).map(Number)) entriesOf[z] = (pal.live.includes(z) ? entriesOf[z] : 0) | entriesOf[ZONE_OF[z]];
  // which classes lie within r pixels of each pixel
  const near = new Uint16Array(n);
  for (let c = 0; c < REGION_COUNT; c++) {
    const m = new Uint8Array(n);
    let any = false;
    for (let i = 0; i < n; i++) if (classes[i] === c) { m[i] = 1; any = true; }
    if (!any) continue;
    const g = dilate(m, w, h, r);
    for (let i = 0; i < n; i++) if (g[i]) near[i] |= 1 << c;
  }
  const candOf = new Int32Array(1 << REGION_COUNT);
  for (let nb = 0; nb < candOf.length; nb++) { let m = 0; for (let c = 0; c < REGION_COUNT; c++) if (nb & (1 << c)) m |= entriesOf[c]; candOf[nb] = m; }
  const luts = new Map(); // candidate set -> table over 6-bit colour cells (filled as colours turn up)
  const lab = new Float64Array(3);
  for (let i = 0, p = 0; i < n; i++, p += 3) {
    const cand = candOf[near[i]] || all;
    let lut = luts.get(cand);
    if (!lut) { lut = new Uint8Array(1 << 18).fill(255); luts.set(cand, lut); }
    const R = rgb[p], G = rgb[p + 1], B = rgb[p + 2];
    const key = ((R >> 2) << 12) | ((G >> 2) << 6) | (B >> 2);
    let v = lut[key];
    if (v === 255) {
      rgbToLabCell(R, G, B, lab);
      let bd = Infinity;
      v = 0;
      for (let k = 0; k < K; k++) {
        if (k < 15 && !(cand & (1 << k))) continue;
        const dl = lab[0] - palLab[k * 3], da = lab[1] - palLab[k * 3 + 1], db = lab[2] - palLab[k * 3 + 2];
        const d = dl * dl + da * da + db * db;
        if (d < bd) { bd = d; v = k; }
      }
      lut[key] = v;
    }
    labels[i] = v;
  }
  return labels;
}

/** The Lab of the middle of a 6-bit colour cell (what classifyPixels does). */
function rgbToLabCell(r, g, b, out) { rgbToLab((r & 252) + 2, (g & 252) + 2, (b & 252) + 2, out, 0); }

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
import { makeRng, rgbToLab } from "./color.js";
import { sampleFlatness, binFlatSamples, seedCentres, lloyd, paletteFromBins } from "./quantize.js";
import { DEFAULT_REGION_WEIGHTS } from "./regions.js";

/** A class with less than this share of the person has no colours of its own: its pixels take the nearest colour of any region. */
const MIN_SHARE = 0.01;
/** The most colours one region can be given. */
const MAX_PER_REGION = 8;

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
 * @param {object} opts  maxColors (all regions together), seed, mergeDE, crumbs, noiseTol, weightPower, weights (by class), skip (pixels to leave out)
 * @returns {null | { n, rgb, lab, weight, classMask, tFlat, flatSamples }}  classMask[k]: the classes colour k may be used in (bit c = class c); null when there is no region to speak of
 */
export function buildRegionalPalette(rgb, w, h, classes, opts) {
  const n = w * h;
  const skip = opts.skip || null;
  const weights = opts.weights || DEFAULT_REGION_WEIGHTS;
  const counts = new Float64Array(8);
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (skip && skip[i]) continue;
    const c = classes[i];
    if (c > 0 && c < 8) { counts[c]++; total++; }
  }
  const live = [];
  for (let c = 1; c < 8; c++) if (counts[c] >= Math.max(300, MIN_SHARE * total)) live.push(c);
  if (!live.length) return null;
  const stride = Math.max(1, Math.ceil(Math.sqrt(n / 600000)));
  const tFlat = Math.max(6, Math.min(20, Math.round((opts.noiseTol || 6) * 0.8)));
  const power = opts.weightPower ?? 0.5;
  const rng = makeRng(opts.seed);
  // each region: its histogram, and how its error falls as it is given more colours
  const per = [];
  for (const c of live) {
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) mask[i] = classes[i] === c && !(skip && skip[i]) ? 0 : 1;
    const smp = sampleFlatness(rgb, w, h, stride, mask, true);
    let bins = binFlatSamples(rgb, smp, tFlat, 2, null, 0, power, null);
    if (bins.m > 15000) bins = binFlatSamples(rgb, smp, tFlat, 3, null, 0, power, null);
    if (bins.m === 0) continue;
    const Kmax = Math.min(MAX_PER_REGION, bins.m);
    const sse = [0, 0];
    for (let k = 1; k <= Kmax; k++) sse[k] = k === 1 ? errorWithK(bins, 1, rng) : Math.min(sse[k - 1], errorWithK(bins, k, rng)); // (never worse with more colours)
    per.push({ c, bins, sse, K: 1, Kmax });
  }
  if (!per.length) return null;
  // every region has one colour; the rest go where one more takes away the most weighted error
  let budget = Math.max(0, opts.maxColors - per.length);
  while (budget > 0) {
    let best = -1, gain = 0;
    for (let j = 0; j < per.length; j++) {
      const p = per[j];
      if (p.K >= p.Kmax) continue;
      const g = (weights[p.c] ?? 1) * (p.sse[p.K] - p.sse[p.K + 1]);
      if (g > gain) { gain = g; best = j; }
    }
    if (best < 0) break;
    per[best].K++;
    budget--;
  }
  // each region's own palette, then the colours that are alike across regions made one
  let entries = [];
  for (const p of per) {
    const pal = paletteFromBins(p.bins, p.K, { seed: opts.seed, mergeDE: opts.mergeDE, crumbs: opts.crumbs });
    for (let i = 0; i < pal.n; i++) {
      entries.push({ lab: [pal.lab[i * 3], pal.lab[i * 3 + 1], pal.lab[i * 3 + 2]], rgb: [pal.rgb[i * 3], pal.rgb[i * 3 + 1], pal.rgb[i * 3 + 2]], px: pal.weight[i] * counts[p.c], mask: 1 << p.c });
    }
  }
  const dist = (a, b) => Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]);
  for (;;) {
    let bi = -1, bj = -1, bd = opts.mergeDE;
    for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) { const d = dist(entries[i], entries[j]); if (d < bd) { bd = d; bi = i; bj = j; } }
    if (bi < 0) break;
    const a = entries[bi], b = entries[bj], px = a.px + b.px;
    entries[bi] = { lab: a.lab.map((v, k) => (v * a.px + b.lab[k] * b.px) / px), rgb: a.rgb.map((v, k) => (v * a.px + b.rgb[k] * b.px) / px), px, mask: a.mask | b.mask };
    entries.splice(bj, 1);
  }
  entries.sort((a, b) => b.px - a.px);
  const K = entries.length;
  const out = { n: K, rgb: new Float64Array(K * 3), lab: new Float64Array(K * 3), weight: new Float64Array(K), classMask: new Uint16Array(K), tFlat, flatSamples: total };
  entries.forEach((e, k) => {
    for (let j = 0; j < 3; j++) { out.rgb[k * 3 + j] = e.rgb[j]; out.lab[k * 3 + j] = e.lab[j]; }
    out.weight[k] = e.px / total;
    out.classMask[k] = e.mask;
  });
  out.live = live;
  out.alloc = per.map((p) => [p.c, p.K]); // colours asked for, by class (a region may end with fewer: close colours are merged)
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
  const entriesOf = new Array(8).fill(all);
  entriesOf[0] = 0;
  for (const c of pal.live) { let m = 0; for (let k = 0; k < K && k < 15; k++) if (pal.classMask[k] & (1 << c)) m |= 1 << k; entriesOf[c] = m; }
  // which classes lie within r pixels of each pixel
  const near = new Uint8Array(n);
  for (let c = 0; c < 8; c++) {
    const m = new Uint8Array(n);
    let any = false;
    for (let i = 0; i < n; i++) if (classes[i] === c) { m[i] = 1; any = true; }
    if (!any) continue;
    const g = dilate(m, w, h, r);
    for (let i = 0; i < n; i++) if (g[i]) near[i] |= 1 << c;
  }
  const candOf = new Int32Array(256);
  for (let nb = 0; nb < 256; nb++) { let m = 0; for (let c = 0; c < 8; c++) if (nb & (1 << c)) m |= entriesOf[c]; candOf[nb] = m; }
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

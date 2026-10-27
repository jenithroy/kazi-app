/**
 * Finding the colours of a picture and giving every pixel one of them.
 *
 * The palette is found from the FLAT pixels only (pixels whose neighbours are the same colour), so the soft edge
 * pixels of anti-aliasing and the ringing of JPEG never become colours of their own. K-means runs in CIELAB on a
 * small histogram of those pixels, then colours closer than about delta-E 11 are merged.
 *
 * Every pixel is then labelled with its nearest palette colour. A pixel on an edge is a mix of two colours: for those
 * we work out how much of each colour it holds ("soft membership"), which later lets the outline sit between the two
 * pixel centres where the real edge is, instead of on a pixel staircase.
 */
import { rgbToLab, rgbFloatToLab, makeRng, labDist } from "./color.js";
import { PAINTED } from "./labels.js";

/** Biggest palette the tracer will ever make (labels are bytes and 255 is kept for "outside"). */
export const HARD_MAX_COLORS = 15;

/** The luminous summary the later stages need about a palette. */
function makePalette(n) {
  return { n, rgb: new Float64Array(n * 3), lab: new Float64Array(n * 3), weight: new Float64Array(n) };
}

/**
 * One value per sample pixel (a lattice of pixels `stride` apart): how flat its neighbourhood is, as the largest
 * channel difference to its four neighbours. Returns { idx (pixel numbers), val (0..255), m (count) }.
 */
function sampleFlatness(rgb, w, h, stride, skip, all = false) {
  const maxCount = Math.ceil((h - 2) / stride) * Math.ceil((w - 2) / stride) + 1;
  const idx = new Int32Array(maxCount);
  const val = new Uint8Array(maxCount);
  let m = 0;
  const row = w * 3;
  for (let y = 1; y < h - 1; y += stride) {
    for (let x = 1; x < w - 1; x += stride) {
      if (skip && skip[y * w + x]) continue;
      if (all) { idx[m] = y * w + x; val[m] = 0; m++; continue; } // a photograph: every pixel is a sample, flat or not
      const p = y * row + x * 3;
      const r = rgb[p];
      const g = rgb[p + 1];
      const b = rgb[p + 2];
      let worst = 0;
      for (let k = 0; k < 4; k++) {
        const o = k === 0 ? p - 3 : k === 1 ? p + 3 : k === 2 ? p - row : p + row;
        let d = rgb[o] - r;
        if (d < 0) d = -d;
        let t = rgb[o + 1] - g;
        if (t < 0) t = -t;
        if (t > d) d = t;
        t = rgb[o + 2] - b;
        if (t < 0) t = -t;
        if (t > d) d = t;
        if (d > worst) worst = d;
      }
      idx[m] = y * w + x;
      val[m] = worst;
      m++;
    }
  }
  return { idx, val, m };
}

/**
 * Histogram of the flat samples (flatness value up to tFlat): a cell is 2^shift levels wide in each of R, G, B. Returns
 * the cells that are not empty with their mean colour (RGB and Lab) and how many pixels fell in them.
 */
function binFlatSamples(rgb, smp, tFlat, shift, excludeLab, excludeDist, weightPower = 1) {
  const bits = 8 - shift;
  const slot = new Int32Array(1 << (3 * bits)).fill(-1);
  let cap = 2048;
  let sr = new Float64Array(cap);
  let sg = new Float64Array(cap);
  let sb = new Float64Array(cap);
  let cn = new Float64Array(cap);
  let nb = 0;
  let total = 0;
  const lab = new Float64Array(3);
  for (let k = 0; k < smp.m; k++) {
    if (smp.val[k] > tFlat) continue;
    const p = smp.idx[k] * 3;
    const r = rgb[p];
    const g = rgb[p + 1];
    const b = rgb[p + 2];
    if (excludeLab) {
      rgbToLab(r, g, b, lab, 0);
      if (labDist(lab, 0, excludeLab, 0) <= excludeDist) continue;
    }
    total++;
    const key = ((r >> shift) << (2 * bits)) | ((g >> shift) << bits) | (b >> shift);
    let s = slot[key];
    if (s < 0) {
      if (nb === cap) {
        cap *= 2;
        const grow = (a) => { const n = new Float64Array(cap); n.set(a); return n; };
        sr = grow(sr); sg = grow(sg); sb = grow(sb); cn = grow(cn);
      }
      s = nb++;
      slot[key] = s;
    }
    sr[s] += r; sg[s] += g; sb[s] += b; cn[s] += 1;
  }
  const pts = new Float64Array(nb * 3);
  const rgbm = new Float64Array(nb * 3);
  const wts = new Float64Array(nb);
  const cnts = new Float64Array(nb);
  for (let i = 0; i < nb; i++) {
    const c = cn[i];
    rgbm[i * 3] = sr[i] / c;
    rgbm[i * 3 + 1] = sg[i] / c;
    rgbm[i * 3 + 2] = sb[i] / c;
    rgbFloatToLab(rgbm[i * 3], rgbm[i * 3 + 1], rgbm[i * 3 + 2], pts, i * 3);
    // how much a colour pulls on the clusters: with a power under 1 a big smooth area (a sky) does not take every colour
    wts[i] = weightPower === 1 ? c : Math.pow(c, weightPower);
    cnts[i] = c;
  }
  return { m: nb, pts, rgb: rgbm, wts, cnts, total };
}

/** k-means++ seeding on weighted points. Returns up to K centres (fewer if there are not K distinct points). */
function seedCentres(pts, wts, m, K, rng) {
  const centres = [];
  const d2 = new Float64Array(m).fill(Infinity);
  let totalW = 0;
  for (let i = 0; i < m; i++) totalW += wts[i];
  let target = rng() * totalW;
  let first = m - 1;
  for (let i = 0; i < m; i++) {
    target -= wts[i];
    if (target <= 0) { first = i; break; }
  }
  centres.push(first);
  for (let c = 1; c < K; c++) {
    const last = centres[c - 1];
    let sum = 0;
    for (let i = 0; i < m; i++) {
      const dl = pts[i * 3] - pts[last * 3];
      const da = pts[i * 3 + 1] - pts[last * 3 + 1];
      const db = pts[i * 3 + 2] - pts[last * 3 + 2];
      const d = dl * dl + da * da + db * db;
      if (d < d2[i]) d2[i] = d;
      sum += d2[i] * wts[i];
    }
    if (sum <= 1e-9) break;
    let t = rng() * sum;
    let pick = m - 1;
    for (let i = 0; i < m; i++) {
      t -= d2[i] * wts[i];
      if (t <= 0) { pick = i; break; }
    }
    centres.push(pick);
  }
  const out = new Float64Array(centres.length * 3);
  for (let i = 0; i < centres.length; i++) {
    out[i * 3] = pts[centres[i] * 3];
    out[i * 3 + 1] = pts[centres[i] * 3 + 1];
    out[i * 3 + 2] = pts[centres[i] * 3 + 2];
  }
  return out;
}

/** Lloyd's iterations on weighted points. Returns { centres, assign, sse }. */
function lloyd(pts, wts, m, centres, K, maxIter) {
  const assign = new Int32Array(m).fill(-1);
  const sums = new Float64Array(K * 3);
  const sw = new Float64Array(K);
  let sse = 0;
  for (let it = 0; it < maxIter; it++) {
    let changed = 0;
    sums.fill(0);
    sw.fill(0);
    sse = 0;
    for (let i = 0; i < m; i++) {
      const l = pts[i * 3];
      const a = pts[i * 3 + 1];
      const b = pts[i * 3 + 2];
      let best = 0;
      let bd = Infinity;
      for (let k = 0; k < K; k++) {
        const dl = l - centres[k * 3];
        const da = a - centres[k * 3 + 1];
        const db = b - centres[k * 3 + 2];
        const d = dl * dl + da * da + db * db;
        if (d < bd) { bd = d; best = k; }
      }
      if (assign[i] !== best) { assign[i] = best; changed++; }
      const w = wts[i];
      sums[best * 3] += l * w;
      sums[best * 3 + 1] += a * w;
      sums[best * 3 + 2] += b * w;
      sw[best] += w;
      sse += bd * w;
    }
    for (let k = 0; k < K; k++) {
      if (sw[k] > 0) {
        centres[k * 3] = sums[k * 3] / sw[k];
        centres[k * 3 + 1] = sums[k * 3 + 1] / sw[k];
        centres[k * 3 + 2] = sums[k * 3 + 2] / sw[k];
      }
    }
    if (changed === 0) break;
  }
  return { centres, assign, sse };
}

/**
 * Turn the histogram into a palette: k-means with the cap on colours, then merge close colours and drop crumbs.
 * `maxColors` counts the colours of the picture only (the caller already reserved a slot for a see-through background).
 */
function paletteFromBins(bins, maxColors, opts) {
  const { m, pts, rgb, wts } = bins;
  const cnts = bins.cnts || wts;
  if (m === 0) return makePalette(0);
  const rng = makeRng(opts.seed);
  const K = Math.max(1, Math.min(maxColors, m));
  let best = null;
  const restarts = m > 20000 ? 2 : 4;
  for (let r = 0; r < restarts; r++) {
    const seeds = seedCentres(pts, wts, m, K, rng);
    const Kc = seeds.length / 3;
    const res = lloyd(pts, wts, m, seeds, Kc, 40);
    if (!best || res.sse < best.sse) best = { ...res, K: Kc };
  }
  const K2 = best.K;
  // cluster summaries (Lab and RGB weighted means)
  let cl = [];
  for (let k = 0; k < K2; k++) cl.push({ w: 0, n: 0, lab: [0, 0, 0], rgb: [0, 0, 0] });
  for (let i = 0; i < m; i++) {
    const c = cl[best.assign[i]];
    const w = wts[i];
    c.w += w;
    c.n += cnts[i];
    for (let j = 0; j < 3; j++) { c.lab[j] += pts[i * 3 + j] * w; c.rgb[j] += rgb[i * 3 + j] * w; }
  }
  cl = cl.filter((c) => c.w > 0);
  for (const c of cl) for (let j = 0; j < 3; j++) { c.lab[j] /= c.w; c.rgb[j] /= c.w; }
  const dist = (a, b) => Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]);
  const fuse = (a, b) => {
    const w = a.w + b.w;
    const out = { w, n: a.n + b.n, lab: [0, 0, 0], rgb: [0, 0, 0] };
    for (let j = 0; j < 3; j++) {
      out.lab[j] = (a.lab[j] * a.w + b.lab[j] * b.w) / w;
      out.rgb[j] = (a.rgb[j] * a.w + b.rgb[j] * b.w) / w;
    }
    return out;
  };
  const totalW = cl.reduce((s, c) => s + c.n, 0); // pixels (not weights): shares below are shares of the picture
  // merge close colours (smallest distance first), heaviest keeps the position
  for (;;) {
    let bi = -1;
    let bj = -1;
    let bd = opts.mergeDE;
    for (let i = 0; i < cl.length; i++) {
      for (let j = i + 1; j < cl.length; j++) {
        const d = dist(cl[i], cl[j]);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    if (bi < 0) break;
    cl[bi] = fuse(cl[bi], cl[bj]);
    cl.splice(bj, 1);
  }
  // crumbs: a colour with few pixels that is not clearly different from the others goes to its nearest colour. "Few" is
  // judged against the pixels that are not the one dominant colour (the page), so a small logo on a big white page does
  // not make every logo colour look small.
  for (;;) {
    let victim = -1;
    let near = -1;
    let vd = 0;
    let top = 0;
    for (const c of cl) if (c.n > top) top = c.n;
    const rest = top > 0.6 * totalW ? totalW - top : totalW;
    for (let i = 0; i < cl.length && cl.length > 1; i++) {
      const frac = cl[i].n / totalW;
      const rel = cl[i].n / rest;
      let nd = Infinity;
      let nj = -1;
      for (let j = 0; j < cl.length; j++) {
        if (j === i) continue;
        const d = dist(cl[i], cl[j]);
        if (d < nd) { nd = d; nj = j; }
      }
      const tiny = frac < (opts.crumbs === "strict" ? 0.0008 : 0.0003);
      // artwork and photographs keep their small colours (a highlight, a flower) unless they are almost the same as another
      const small = opts.crumbs === "strict" ? (rel < 0.006 && nd < 14) || (rel < 0.02 && nd < 8) : (rel < 0.03 && nd < 22) || (rel < 0.08 && nd < 14);
      if ((tiny || small) && (victim < 0 || frac < vd)) { victim = i; near = nj; vd = frac; }
    }
    if (victim < 0) break;
    cl[near] = fuse(cl[near], cl[victim]);
    cl.splice(victim, 1);
  }
  cl.sort((a, b) => b.w - a.w);
  const pal = makePalette(cl.length);
  for (let i = 0; i < cl.length; i++) {
    for (let j = 0; j < 3; j++) { pal.lab[i * 3 + j] = cl[i].lab[j]; pal.rgb[i * 3 + j] = cl[i].rgb[j]; }
    pal.weight[i] = cl[i].n / totalW;
  }
  return pal;
}

/**
 * Find the palette of a working picture.
 * opts: { maxColors, seed, mergeDE, minFeaturePx, noiseTol, excludeLab, excludeDist, allPixels (every pixel is a sample, for photographs),
 *   weightPower (1: a colour pulls by its pixel count; 0.5: by the square root, so a big smooth area does not take every cluster),
 *   crumbs ("strict": keep small colours that differ from the rest) }
 */
export function buildPalette(rgb, w, h, opts) {
  const n = w * h;
  const stride = Math.max(1, Math.min(2, Math.floor((opts.minFeaturePx || 4) / 2)), Math.ceil(Math.sqrt(n / 600000)));
  // a picture under 3 pixels wide or high has no pixel with four neighbours: every pixel counts as flat
  let smp;
  if (w < 3 || h < 3) {
    smp = { idx: new Int32Array(n), val: new Uint8Array(n), m: 0 };
    for (let i = 0; i < n; i++) if (!opts.skip || !opts.skip[i]) smp.idx[smp.m++] = i;
  } else smp = sampleFlatness(rgb, w, h, stride, opts.skip, !!opts.allPixels);
  const hist = new Float64Array(256);
  for (let k = 0; k < smp.m; k++) hist[smp.val[k]]++;
  // the flatness limit: the noise level, raised until at least 3 % of the samples count as flat (photos have few)
  let tFlat = Math.max(6, Math.min(20, Math.round((opts.noiseTol || 6) * 0.8)));
  const enough = Math.max(200, smp.m * 0.03);
  for (;;) {
    let cum = 0;
    for (let v = 0; v <= tFlat && v < 256; v++) cum += hist[v];
    if (cum >= enough || tFlat >= 255) break;
    tFlat = Math.min(255, tFlat * 2);
  }
  const power = opts.weightPower ?? 1;
  let bins = binFlatSamples(rgb, smp, tFlat, 2, opts.excludeLab, opts.excludeDist, power);
  if (bins.m > 15000) bins = binFlatSamples(rgb, smp, tFlat, 3, opts.excludeLab, opts.excludeDist, power);
  const pal = paletteFromBins(bins, opts.maxColors, opts);
  pal.flatSamples = bins.total;
  pal.tFlat = tFlat;
  return pal;
}

/**
 * Colours the flat-pixel palette missed. Ink that is only thin lines (three pixels wide, anti-aliased) has no flat pixel at all,
 * so it never makes a cluster and the picture would come out as the page alone. Looks for pixels that neither a palette colour
 * nor a mix of two of them explains (an edge between two colours is a mix, so it is explained); the farthest of those, away from
 * every palette colour, are the missing colour. `palRgb` holds `K` colours (3 numbers each); returns up to `most` new [r, g, b].
 */
export function missingColours(rgb, w, h, palRgb, K, { skip = null, most = 2, minPixels = 20, tol = 45 } = {}) {
  const n = w * h;
  const cols = [];
  for (let k = 0; k < K; k++) cols.push([palRgb[k * 3], palRgb[k * 3 + 1], palRgb[k * 3 + 2]]);
  const out = [];
  const near = new Float32Array(n);
  const own = new Uint8Array(n); // the palette colour a pixel is (within noise), or 255
  const cand = []; // pixels no colour and no mix explains
  const lab3 = new Float64Array(3);
  const R = 3;
  for (let round = 0; round < most; round++) {
    const C = cols.length;
    const pairs = [];
    for (let a = 0; a < C; a++) {
      for (let b = a + 1; b < C; b++) {
        const v = [cols[b][0] - cols[a][0], cols[b][1] - cols[a][1], cols[b][2] - cols[a][2]];
        const vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
        if (vv > 1) pairs.push({ a, b, v, vv });
      }
    }
    const colsLab = cols.map((c) => { rgbFloatToLab(c[0], c[1], c[2], lab3, 0); return [lab3[0], lab3[1], lab3[2]]; });
    const hist = new Float64Array(450);
    let unexplained = 0;
    own.fill(255);
    for (let i = 0; i < n; i++) {
      near[i] = -1;
      if (skip && skip[i]) continue;
      const px = rgb[i * 3], py = rgb[i * 3 + 1], pz = rgb[i * 3 + 2];
      let nearest = Infinity, nearestA = 0;
      for (let a = 0; a < C; a++) {
        const dx = px - cols[a][0], dy = py - cols[a][1], dz = pz - cols[a][2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < nearest) { nearest = d; nearestA = a; }
      }
      if (nearest <= tol) { own[i] = nearestA; continue; } // one of the colours (within noise)
      let explained = false;
      for (let p = 0; p < pairs.length && !explained; p++) {
        const { a, v, vv } = pairs[p];
        let t = ((px - cols[a][0]) * v[0] + (py - cols[a][1]) * v[1] + (pz - cols[a][2]) * v[2]) / vv;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - (cols[a][0] + t * v[0]), ey = py - (cols[a][1] + t * v[1]), ez = pz - (cols[a][2] + t * v[2]);
        if (ex * ex + ey * ey + ez * ez <= tol * tol) explained = true; // a mix of two colours: an anti-aliased edge
      }
      if (explained) continue;
      // JPEG blurs colour more than brightness, so a pixel of a thin stroke can sit well off the straight line between two colours
      // in RGB and still be a mix of them to the eye: look again in CIELAB
      rgbFloatToLab(px, py, pz, lab3, 0);
      let near2 = false;
      for (let a = 0; a < C && !near2; a++) near2 = Math.hypot(lab3[0] - colsLab[a][0], lab3[1] - colsLab[a][1], lab3[2] - colsLab[a][2]) <= 18;
      for (let p = 0; p < pairs.length && !near2; p++) {
        const a = pairs[p].a, b = pairs[p].b;
        const vx = colsLab[b][0] - colsLab[a][0], vy = colsLab[b][1] - colsLab[a][1], vz = colsLab[b][2] - colsLab[a][2];
        const vv = vx * vx + vy * vy + vz * vz;
        if (vv < 1) continue;
        let t = ((lab3[0] - colsLab[a][0]) * vx + (lab3[1] - colsLab[a][1]) * vy + (lab3[2] - colsLab[a][2]) * vz) / vv;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        if (Math.hypot(lab3[0] - (colsLab[a][0] + t * vx), lab3[1] - (colsLab[a][1] + t * vy), lab3[2] - (colsLab[a][2] + t * vz)) <= 30) near2 = true;
      }
      if (near2) continue;
      near[i] = nearest;
      cand.push(i);
    }
    // A line on a plain page has ONE colour beside it. Pixels beside two colours are the dark or pale halo that JPEG leaves where two
    // regions meet (or chroma bleeding at an edge): not ink of their own.
    const seenAt = new Int16Array(C);
    for (const i of cand) {
      const x = i % w, y = (i - x) / w;
      seenAt.fill(0);
      let colours = 0;
      for (let yy = Math.max(0, y - R); yy <= Math.min(h - 1, y + R) && colours < 2; yy++) {
        for (let xx = Math.max(0, x - R); xx <= Math.min(w - 1, x + R); xx++) {
          const o = own[yy * w + xx];
          if (o === 255) continue;
          if (++seenAt[o] === 3 && ++colours >= 2) break;
        }
      }
      if (colours >= 2) { near[i] = -1; continue; }
      hist[Math.min(449, Math.round(near[i]))]++;
      unexplained++;
    }
    cand.length = 0;
    if (unexplained < minPixels) break;
    // the far end of what is unexplained (the 15 % farthest from every colour we have) is the ink
    let acc = 0, cut = 449;
    for (; cut > 0; cut--) { acc += hist[cut]; if (acc >= 0.15 * unexplained) break; }
    let r = 0, g = 0, b = 0, m = 0;
    for (let i = 0; i < n; i++) {
      if (near[i] < 0 || Math.round(near[i]) < cut) continue;
      r += rgb[i * 3]; g += rgb[i * 3 + 1]; b += rgb[i * 3 + 2]; m++;
    }
    if (!m) break;
    const c = [r / m, g / m, b / m];
    if (cols.some((o) => Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) < 28)) break; // that is a colour we have
    cols.push(c);
    out.push(c);
  }
  return out;
}

/**
 * Which pixels are "flat": all four neighbours are within `tFlat` of the pixel in every channel. Flat pixels are the
 * ones whose colour is certainly one palette colour and not a mix at an edge.
 */
export function flatMask(rgb, w, h, tFlat) {
  const flat = new Uint8Array(w * h);
  const row = w * 3;
  for (let y = 1; y < h - 1; y++) {
    let p = y * row + 3;
    for (let x = 1; x < w - 1; x++, p += 3) {
      const r = rgb[p];
      const g = rgb[p + 1];
      const b = rgb[p + 2];
      let d = rgb[p - 3] - r;
      if (d < 0) d = -d;
      if (d > tFlat) continue;
      d = rgb[p + 3] - r;
      if (d < 0) d = -d;
      if (d > tFlat) continue;
      d = rgb[p - row] - r;
      if (d < 0) d = -d;
      if (d > tFlat) continue;
      d = rgb[p + row] - r;
      if (d < 0) d = -d;
      if (d > tFlat) continue;
      d = rgb[p - 2] - g;
      if (d < 0) d = -d;
      if (d > tFlat) continue;
      d = rgb[p + 4] - g;
      if (d < 0) d = -d;
      if (d > tFlat) continue;
      d = rgb[p - row + 1] - g;
      if (d < 0) d = -d;
      if (d > tFlat) continue;
      d = rgb[p + row + 1] - g;
      if (d < 0) d = -d;
      if (d > tFlat) continue;
      d = rgb[p - 1] - b;
      if (d < 0) d = -d;
      if (d > tFlat) continue;
      d = rgb[p + 5] - b;
      if (d < 0) d = -d;
      if (d > tFlat) continue;
      d = rgb[p - row + 2] - b;
      if (d < 0) d = -d;
      if (d > tFlat) continue;
      d = rgb[p + row + 2] - b;
      if (d < 0) d = -d;
      if (d > tFlat) continue;
      flat[y * w + x] = 1;
    }
  }
  return flat;
}

/**
 * Palette entries that are only the soft edge between two other colours (the grey that anti-aliasing or JPEG leaves
 * between black and white, the dark halo between gold and navy). An entry is dropped when BOTH hold:
 *  - its colour lies near the straight line (in RGB) between two other entries, between the two ends, and
 *  - most of its pixels (60 % or more) have both of those colours within 3 pixels, i.e. they sit on the border
 *    between the two.
 * A real colour that merely happens to lie between two others (an orange region next to red and yellow) has pixels deep
 * inside its own region, far from one of them, so it stays. Entries covering more than 15 % of the picture stay.
 * `labels` is the nearest-colour label map, `rgb` the palette colours (3 per entry), `K` the entry count, `keep` an
 * optional list of entries that may never be dropped. Returns a Uint8Array with 1 for the entries to drop.
 */
export function transitionalEntries(labels, w, h, rgb, K, keep = []) {
  const drop = new Uint8Array(K);
  if (K < 3) return drop;
  const pairA = new Int16Array(K).fill(-1);
  const pairB = new Int16Array(K).fill(-1);
  for (let c = 0; c < K; c++) {
    if (keep.includes(c)) continue;
    let best = Infinity;
    for (let a = 0; a < K; a++) {
      if (a === c) continue;
      for (let b = a + 1; b < K; b++) {
        if (b === c) continue;
        const vx = rgb[b * 3] - rgb[a * 3];
        const vy = rgb[b * 3 + 1] - rgb[a * 3 + 1];
        const vz = rgb[b * 3 + 2] - rgb[a * 3 + 2];
        const vv = vx * vx + vy * vy + vz * vz;
        if (vv < 1) continue;
        const t = ((rgb[c * 3] - rgb[a * 3]) * vx + (rgb[c * 3 + 1] - rgb[a * 3 + 1]) * vy + (rgb[c * 3 + 2] - rgb[a * 3 + 2]) * vz) / vv;
        if (t < 0.04 || t > 0.96) continue;
        const ex = rgb[c * 3] - (rgb[a * 3] + t * vx);
        const ey = rgb[c * 3 + 1] - (rgb[a * 3 + 1] + t * vy);
        const ez = rgb[c * 3 + 2] - (rgb[a * 3 + 2] + t * vz);
        const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (d <= 18 + 0.05 * Math.sqrt(vv) && d < best) { best = d; pairA[c] = a; pairB[c] = b; }
      }
    }
  }
  let any = false;
  for (let c = 0; c < K; c++) if (pairA[c] >= 0) any = true;
  if (!any) return drop;
  const n = w * h;
  const total = new Float64Array(K);
  const both = new Float64Array(K);
  const R = 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = labels[y * w + x];
      total[c]++;
      const a = pairA[c];
      if (a < 0) continue;
      const b = pairB[c];
      let seenA = false;
      let seenB = false;
      const y0 = y - R < 0 ? 0 : y - R;
      const y1 = y + R >= h ? h - 1 : y + R;
      const x0 = x - R < 0 ? 0 : x - R;
      const x1 = x + R >= w ? w - 1 : x + R;
      for (let yy = y0; yy <= y1 && !(seenA && seenB); yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const l = labels[yy * w + xx];
          if (l === a) seenA = true;
          else if (l === b) seenB = true;
        }
      }
      if (seenA && seenB) both[c]++;
    }
  }
  for (let c = 0; c < K; c++) {
    if (pairA[c] < 0 || total[c] === 0) continue;
    if (total[c] > 0.15 * n) continue;
    if (both[c] / total[c] >= 0.6) drop[c] = 1;
  }
  // never drop everything
  let left = 0;
  for (let c = 0; c < K; c++) if (!drop[c]) left++;
  if (left < 2) drop.fill(0);
  return drop;
}

/**
 * Give every pixel its nearest palette colour (in Lab). Uses a lazily filled table over 6-bit colour cells, so a flat
 * logo costs almost nothing and a photo only pays for the cells it really uses.
 */
export function classifyPixels(rgb, n, palLab, K) {
  const labels = new Uint8Array(n);
  if (K <= 1) return labels;
  const lut = new Uint8Array(1 << 18).fill(255);
  const lab = new Float64Array(3);
  for (let i = 0, p = 0; i < n; i++, p += 3) {
    const r = rgb[p];
    const g = rgb[p + 1];
    const b = rgb[p + 2];
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let v = lut[key];
    if (v === 255) {
      rgbToLab((r & 252) + 2, (g & 252) + 2, (b & 252) + 2, lab, 0);
      let bd = Infinity;
      v = 0;
      for (let k = 0; k < K; k++) {
        const dl = lab[0] - palLab[k * 3];
        const da = lab[1] - palLab[k * 3 + 1];
        const db = lab[2] - palLab[k * 3 + 2];
        const d = dl * dl + da * da + db * db;
        if (d < bd) { bd = d; v = k; }
      }
      lut[key] = v;
    }
    labels[i] = v;
  }
  return labels;
}

/**
 * Work out how much of each colour an edge pixel holds.
 *
 * Flat pixels are certain: they hold their one colour. Every other pixel (an edge, a blend, noise) looks at the flat
 * pixels around it (radius 3) to learn which colours are really present there, then asks: is it one of those colours
 * (within noise), or a mix of two of them (the straight line between the two colours in RGB, which is how
 * anti-aliasing mixes)? A mix gets a share t of the second colour and belongs to the colour that holds more of it.
 * Anything that neither fits falls back to its nearest palette colour. This is what stops the in-between colour of
 * an edge from being given to some unrelated palette colour that happens to lie near the mix.
 *
 * Returns { labels, lab2, soft }: the (possibly changed) label, the second colour or 255, and the share of the first
 * colour in 1..255 (255 = pure).
 */
export function softMembership(rgb, w, h, labels0, flat, palRgb, K, opts = {}) {
  const n = w * h;
  const labels = new Uint8Array(labels0);
  const lab2 = new Uint8Array(n).fill(255);
  const soft = new Uint8Array(n).fill(255);
  const R = opts.radius || 3;
  const tolPure = opts.tolPure || 10;
  const resMax = opts.resMax || 14;
  const resRel = opts.resRel || 0.06;
  const cand = new Int16Array(8);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (flat[i]) continue;
      // colours really present nearby
      let nc = 0;
      const y0 = y - R < 0 ? 0 : y - R;
      const y1 = y + R >= h ? h - 1 : y + R;
      const x0 = x - R < 0 ? 0 : x - R;
      const x1 = x + R >= w ? w - 1 : x + R;
      for (let yy = y0; yy <= y1; yy++) {
        const base = yy * w;
        for (let xx = x0; xx <= x1; xx++) {
          if (!flat[base + xx]) continue;
          const l = labels0[base + xx];
          let k = 0;
          while (k < nc && cand[k] !== l) k++;
          if (k === nc && nc < 8) cand[nc++] = l;
        }
      }
      if (nc === 0) {
        // no flat pixel near: use the labels of the pixel and its four neighbours
        const own = labels0[i];
        cand[nc++] = own;
        for (let k = 0; k < 4; k++) {
          let l;
          if (k === 0) l = x > 0 ? labels0[i - 1] : own;
          else if (k === 1) l = x < w - 1 ? labels0[i + 1] : own;
          else if (k === 2) l = y > 0 ? labels0[i - w] : own;
          else l = y < h - 1 ? labels0[i + w] : own;
          let j = 0;
          while (j < nc && cand[j] !== l) j++;
          if (j === nc) cand[nc++] = l;
        }
      }
      // keep the candidates in label order so the result does not depend on scan order
      for (let p = 1; p < nc; p++) {
        const v = cand[p];
        let q = p - 1;
        while (q >= 0 && cand[q] > v) { cand[q + 1] = cand[q]; q--; }
        cand[q + 1] = v;
      }
      const px = rgb[i * 3];
      const py = rgb[i * 3 + 1];
      const pz = rgb[i * 3 + 2];
      let bestPure = -1;
      let bestPureD = Infinity;
      for (let k = 0; k < nc; k++) {
        const c = cand[k];
        const dx = px - palRgb[c * 3];
        const dy = py - palRgb[c * 3 + 1];
        const dz = pz - palRgb[c * 3 + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < bestPureD) { bestPureD = d; bestPure = c; }
      }
      if (bestPureD <= tolPure) { labels[i] = bestPure; continue; }
      let bestRes = Infinity;
      let bestA = -1;
      let bestB = -1;
      let bestT = 0;
      for (let ka = 0; ka < nc; ka++) {
        const a = cand[ka];
        const ax = palRgb[a * 3];
        const ay = palRgb[a * 3 + 1];
        const az = palRgb[a * 3 + 2];
        for (let kb = ka + 1; kb < nc; kb++) {
          const b = cand[kb];
          const vx = palRgb[b * 3] - ax;
          const vy = palRgb[b * 3 + 1] - ay;
          const vz = palRgb[b * 3 + 2] - az;
          const vv = vx * vx + vy * vy + vz * vz;
          if (vv < 1) continue;
          let t = ((px - ax) * vx + (py - ay) * vy + (pz - az) * vz) / vv;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
          const ex = px - (ax + t * vx);
          const ey = py - (ay + t * vy);
          const ez = pz - (az + t * vz);
          const res = Math.sqrt(ex * ex + ey * ey + ez * ez);
          if (res <= resMax + resRel * Math.sqrt(vv) && res < bestRes) { bestRes = res; bestA = a; bestB = b; bestT = t; }
        }
      }
      if (bestA < 0) continue; // nothing explains it: keep the nearest palette colour
      let prim;
      let sec;
      let share;
      if (bestT >= 0.5) { prim = bestB; sec = bestA; share = bestT; } else { prim = bestA; sec = bestB; share = 1 - bestT; }
      labels[i] = prim;
      if (share >= 0.985) continue;
      lab2[i] = sec;
      soft[i] = Math.max(128, Math.min(254, Math.round(share * 255)));
    }
  }
  return { labels, lab2, soft };
}

/**
 * The colour of every palette entry from the pixels that finally belong to it: the mean of the pixels deep inside a
 * region (all four neighbours the same label and no edge mixing), in plain sRGB. Entries that have no such pixel use
 * all their pixels. A colour that is a grey within rounding becomes an exact grey. `skipLabel` is an entry that is not
 * a colour (the see-through background): it keeps its fallback value.
 *
 * A colour that is only thin strokes (a pencil line, small lettering) has no pixel that is not partly its neighbour: the mean
 * of its pixels is a washed-out version of the ink (a black line on white comes out mid-grey). For such an entry (fewer than
 * 40 % of its pixels deep inside) the colour is the mean of its 12 % of pixels that are furthest from the colour it borders.
 */
export function clusterMeans(rgb, w, h, labels, soft, K, fallbackRgb, skipLabel = -1) {
  const sum = new Float64Array(K * 3);
  const cnt = new Float64Array(K);
  const sumAll = new Float64Array(K * 3);
  const cntAll = new Float64Array(K);
  const nb = new Float64Array(K * K); // nb[a * K + b]: how often a pixel of a has a pixel of b beside it
  const side = (a, j) => { const b = labels[j]; if (b !== a && b < K && b !== skipLabel) nb[a * K + b]++; };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = labels[i];
      if (a >= K || a === skipLabel) continue;
      if (soft[i] === PAINTED) continue; // a pixel that was made part of a stroke (widened): the picture's own colour there is not the stroke's
      const p = i * 3;
      sumAll[a * 3] += rgb[p]; sumAll[a * 3 + 1] += rgb[p + 1]; sumAll[a * 3 + 2] += rgb[p + 2];
      cntAll[a]++;
      if (x > 0) side(a, i - 1);
      if (x < w - 1) side(a, i + 1);
      if (y > 0) side(a, i - w);
      if (y < h - 1) side(a, i + w);
      if (soft[i] !== 255) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
      if (labels[i - 1] !== a || labels[i + 1] !== a || labels[i - w] !== a || labels[i + w] !== a) continue;
      sum[a * 3] += rgb[p]; sum[a * 3 + 1] += rgb[p + 1]; sum[a * 3 + 2] += rgb[p + 2];
      cnt[a]++;
    }
  }
  // thin entries: the colour of the ink is the far end of what they hold, measured from the colour beside them
  const core = new Float64Array(K * 3).fill(-1);
  const refOf = new Int16Array(K).fill(-1);
  let anyThin = false;
  for (let k = 0; k < K; k++) {
    if (cntAll[k] < 20 || cnt[k] >= 0.4 * cntAll[k]) continue;
    let best = -1, bc = 0;
    for (let b = 0; b < K; b++) if (nb[k * K + b] > bc) { bc = nb[k * K + b]; best = b; }
    if (best >= 0) { refOf[k] = best; anyThin = true; }
  }
  if (anyThin) {
    const BINS = 444;
    const hist = new Float64Array(K * BINS);
    const dist = (p, ref) => {
      const dx = rgb[p] - fallbackRgb[ref * 3], dy = rgb[p + 1] - fallbackRgb[ref * 3 + 1], dz = rgb[p + 2] - fallbackRgb[ref * 3 + 2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };
    for (let i = 0; i < w * h; i++) {
      const a = labels[i];
      if (a >= K || refOf[a] < 0 || soft[i] === PAINTED) continue;
      hist[a * BINS + Math.min(BINS - 1, Math.round(dist(i * 3, refOf[a])))]++;
    }
    const cut = new Float64Array(K).fill(-1);
    for (let k = 0; k < K; k++) {
      if (refOf[k] < 0) continue;
      let acc = 0, t = BINS - 1;
      for (; t > 0; t--) { acc += hist[k * BINS + t]; if (acc >= 0.12 * cntAll[k]) break; }
      cut[k] = t;
    }
    const s2 = new Float64Array(K * 3), c2 = new Float64Array(K);
    for (let i = 0; i < w * h; i++) {
      const a = labels[i];
      if (a >= K || refOf[a] < 0 || soft[i] === PAINTED) continue;
      const p = i * 3;
      if (Math.round(dist(p, refOf[a])) < cut[a]) continue;
      s2[a * 3] += rgb[p]; s2[a * 3 + 1] += rgb[p + 1]; s2[a * 3 + 2] += rgb[p + 2]; c2[a]++;
    }
    for (let k = 0; k < K; k++) if (c2[k] > 0) { core[k * 3] = s2[k * 3] / c2[k]; core[k * 3 + 1] = s2[k * 3 + 1] / c2[k]; core[k * 3 + 2] = s2[k * 3 + 2] / c2[k]; }
  }
  const out = new Float64Array(K * 3);
  const lab = new Float64Array(3);
  for (let k = 0; k < K; k++) {
    let r, g, b;
    if (core[k * 3] >= 0) { r = core[k * 3]; g = core[k * 3 + 1]; b = core[k * 3 + 2]; }
    else if (cnt[k] > 0) { r = sum[k * 3] / cnt[k]; g = sum[k * 3 + 1] / cnt[k]; b = sum[k * 3 + 2] / cnt[k]; }
    else if (cntAll[k] > 0) { r = sumAll[k * 3] / cntAll[k]; g = sumAll[k * 3 + 1] / cntAll[k]; b = sumAll[k * 3 + 2] / cntAll[k]; }
    else { r = fallbackRgb[k * 3]; g = fallbackRgb[k * 3 + 1]; b = fallbackRgb[k * 3 + 2]; }
    rgbFloatToLab(r, g, b, lab, 0);
    if (Math.hypot(lab[1], lab[2]) < 3) {
      const m = (r + g + b) / 3;
      r = g = b = m;
    }
    out[k * 3] = r; out[k * 3 + 1] = g; out[k * 3 + 2] = b;
  }
  return out;
}

/**
 * details.js: the fine lines and the small spots of a picture, found from its own structure (no palette, no flat regions).
 *
 * WHY. A picture turned into flat colour patches loses what is thinner or smaller than a patch: leaf veins, twigs against the sky, the lid
 * and lashes of an eye, hair, thin strokes of lettering, a pupil, a flower's centre. Those are found here directly and handed over as
 *   - lines: centre lines (one thread wide, 0.4-0.5 mm: bean or run stitch) and
 *   - spots: small closed shapes (a little fill),
 * to be sewn ON TOP of the colour layer, last. `mask` says which pixels of the picture belong to them, so the base layer can fill them with
 * the colour round them and stop carving thin pieces out of itself.
 *
 * HOW (ideas from the literature, written from scratch).
 *   Lines: multi-scale Gaussian second derivatives of the lightness (Hessian) give, at each pixel, the direction across a ridge, its strength
 *   and (from the first derivative) the sub-pixel position of its centre; only pixels whose centre lies inside the pixel are kept (the same
 *   "unbiased" idea as Steger 1998), so a step edge, whose second derivative has two lobes beside it, is not mistaken for a line.
 *   Candidates are thresholded against the noise of the picture AND against how busy the neighbourhood is (so JPEG noise, marble, hatching
 *   and foliage texture are not turned into hair), linked into polylines (strong seeds first, weak points only continue a line), smoothed,
 *   simplified, measured (CIELAB distance of the line's centre from both of its sides, edge-likeness, continuity) and chosen by contrast and
 *   length within a stitch budget; lines that run too close to a stronger one are trimmed so the result is never a dense net.
 *   Spots: scale-normalised Laplacian of Gaussian extrema, each outlined by marching rays out to the half-way level between its centre and
 *   its surround.
 *
 * Units. Everything physical is in millimetres (`mmPerPx` is the size of one input pixel), so one picture gives the same details at any size.
 * Coordinates out are in input pixels, x right, y down, the CORNER of the top left pixel at (0, 0) (the centre of pixel (i, j) is (i + 0.5, j + 0.5)).
 * Pure JS, typed arrays, no DOM, deterministic.
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/* ------------------------------------------------------------------------------------------------------------------ parameters */

/**
 * Everything the detector is tuned by, for a kind of picture and the Detail slider (0 = Simple ... 1 = Finest).
 * Contrasts are CIELAB distances (dE76) of a line's centre from its two sides; lengths are millimetres.
 */
export function detailParams(kind = "photo", detail = 0.75, override = null) {
  const d = clamp(detail, 0, 1);
  const art = kind === "art";
  const k = art ? 1.5 : 1; // artwork has crisp shapes, lettering and brush strokes the colour layer already keeps: be much stricter
  const p = {
    kind,
    detail: d,
    gridMm: 0.12, // the detection grid is never finer than this (a thread is 0.4 mm wide)
    maxPixels: 0.9e6, // ... and has at most this many pixels
    scalesMm: [0.2, 0.32, 0.5], // Gaussian sigmas for lines: a 0.45 mm line is best seen at 0.2, a 1 mm one at 0.5
    lineRatio: 0.65, // the other Hessian eigenvalue must be this much smaller (a line, not a blob or a saddle)
    contrastHigh: lerp(18, 8.5, d) * k, // a line must have a stretch this strong to start ...
    contrastLow: lerp(9, 4.5, d) * k, // ... and goes on through points this strong
    contrastMin: lerp(14, 7.5, d) * k, // median contrast along a whole line (the strong tier)
    weakFactor: 0.62, // a weak tier: median contrast of at least this share of contrastMin ...
    weakLenFactor: 3, // ... but then the line must be this many times longer than minLenMm ...
    maxTurnDegPerMm: 55, // ... and no wigglier than this (noise and texture wiggle; veins, twigs and lashes bend gently)
    minLenMm: lerp(3.4, 1.8, d), // shortest line kept (strong lines may be shorter: see lengthNeeded)
    lineMmPerCm2: lerp(2, 12, d) * (art ? 0.5 : 1), // stitch budget: millimetres of line per square centimetre of picture ...
    linesPerCm2: lerp(0.2, 1.6, d) * (art ? 0.5 : 1), // ... and number of lines (each one is a run, perhaps a trim)
    occupyMm: [0.42, 0.75, 1.1], // clearance round a stronger line for a strong, a middling and a weak line: parallel lines are 0.84 mm apart at least
    allSeeds: true, // every ridge point may start a line (a faint midrib has no strong point to start from); length and contrast decide later
    lenExp: 0.5, // rank by contrast x length^this: a long steady line is worth more than a short strong fragment
    edgeMax: 99, // (asymmetry of the two sides over the contrast: kept as information only; the contrast is now that of the weaker side)
    solidMin: 0.5, // at least this share of a line must be at 55% of its median contrast
    noiseK: 3, // thresholds are at least this many noise sigmas
    localK: 0, // (optional) and this many times the mean strength of the ridge candidates round it
    localMm: 1.5, // radius of "round it"
    gapMm: 0.55, // gaps in a line this long are bridged while it grows
    bridgeMm: 1.6, // line ends this near, pointing at each other, are joined
    snapMm: 0.7, // the end of a line is joined to a stronger line this near
    smoothMm: 0.22, // smoothing of the centre line (sigma, along it)
    simplifyMm: 0.06, // tolerance of the simplified polyline
    maxWidthMm: 1.3, // a ridge wider than this (full width at half height, as it looks in the picture) is a stroke, not a thread: the colour layer sews it
    // spots
    spotScalesMm: [0.26, 0.42, 0.66, 1.05, 1.5],
    spotMinMm2: 0.45,
    spotMaxMm2: 8, // a bigger blob is a patch of colour the colour layer keeps itself (a pupil, a hollow)
    spotContrast: lerp(42, 22, d) * k,
    spotsPerCm2: art ? 0 : lerp(0.05, 0.6, d), // (no spots in artwork: its blobs are letters and shapes)
    spotElongation: 2.4,
    spotSaliency: 3, // a blob must respond this many times more than the mean blob response round it
  };
  if (override) {
    // (for tuning: scales of the contrasts, the stitch budget and the shortest line, or any single value by its name)
    const { contrastScale = 1, budgetScale = 1, lenScale = 1, ...rest } = override;
    for (const k of ["contrastHigh", "contrastLow", "contrastMin", "spotContrast"]) p[k] *= contrastScale;
    for (const k of ["lineMmPerCm2", "linesPerCm2", "spotsPerCm2"]) p[k] *= budgetScale;
    p.minLenMm *= lenScale;
    Object.assign(p, rest);
  }
  return p;
}


/* ------------------------------------------------------------------------------------------------------------------ colour */

const SRGB_LIN = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  return t;
})();
const labF = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** sRGB bytes (3 a pixel) to CIELAB (D65) in three float arrays. */
function rgbToLab(rgb, n, L, A, B) {
  for (let i = 0; i < n; i++) {
    const r = SRGB_LIN[rgb[i * 3]], g = SRGB_LIN[rgb[i * 3 + 1]], b = SRGB_LIN[rgb[i * 3 + 2]];
    const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
    const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
    const fx = labF(x), fy = labF(y), fz = labF(z);
    L[i] = 116 * fy - 16; A[i] = 500 * (fx - fy); B[i] = 200 * (fy - fz);
  }
}

/** Area average of an RGB picture down to ow x oh. */
function boxDown(rgb, w, h, ow, oh) {
  const out = new Uint8ClampedArray(ow * oh * 3);
  const fx = w / ow, fy = h / oh;
  for (let oy = 0; oy < oh; oy++) {
    const y0 = Math.floor(oy * fy), y1 = Math.max(y0 + 1, Math.min(h, Math.round((oy + 1) * fy)));
    for (let ox = 0; ox < ow; ox++) {
      const x0 = Math.floor(ox * fx), x1 = Math.max(x0 + 1, Math.min(w, Math.round((ox + 1) * fx)));
      let r = 0, g = 0, b = 0, c = 0;
      for (let y = y0; y < y1; y++) {
        let i = (y * w + x0) * 3;
        for (let x = x0; x < x1; x++, i += 3) { r += rgb[i]; g += rgb[i + 1]; b += rgb[i + 2]; c++; }
      }
      const o = (oy * ow + ox) * 3;
      out[o] = r / c; out[o + 1] = g / c; out[o + 2] = b / c;
    }
  }
  return out;
}

/** Area average of one float plane. */
function boxDownPlane(src, w, h, ow, oh) {
  const out = new Float32Array(ow * oh);
  const fx = w / ow, fy = h / oh;
  for (let oy = 0; oy < oh; oy++) {
    const y0 = Math.floor(oy * fy), y1 = Math.max(y0 + 1, Math.min(h, Math.round((oy + 1) * fy)));
    for (let ox = 0; ox < ow; ox++) {
      const x0 = Math.floor(ox * fx), x1 = Math.max(x0 + 1, Math.min(w, Math.round((ox + 1) * fx)));
      let s = 0, c = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += src[y * w + x]; c++; }
      out[oy * ow + ox] = s / c;
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------------------------ Gaussian derivatives */

/** Sampled Gaussian and its first and second derivative, normalised so a ramp gives 1, x*x/2 gives 1 and a constant gives 0. */
function gaussKernels(sigma) {
  const r = Math.max(2, Math.ceil(3.3 * sigma)), n = 2 * r + 1;
  const g0 = new Float32Array(n), g1 = new Float32Array(n), g2 = new Float32Array(n);
  let s0 = 0;
  for (let i = -r; i <= r; i++) { const e = Math.exp(-(i * i) / (2 * sigma * sigma)); g0[i + r] = e; s0 += e; }
  for (let i = 0; i < n; i++) g0[i] /= s0;
  const s2 = sigma * sigma;
  let sum2 = 0;
  for (let i = -r; i <= r; i++) { g1[i + r] = (i / s2) * g0[i + r]; g2[i + r] = ((i * i) / (s2 * s2) - 1 / s2) * g0[i + r]; sum2 += g2[i + r]; }
  for (let i = 0; i < n; i++) g2[i] -= sum2 * g0[i]; // no response to a constant
  let m1 = 0, m2 = 0;
  for (let i = -r; i <= r; i++) { m1 += g1[i + r] * i; m2 += g2[i + r] * i * i; }
  for (let i = 0; i < n; i++) { g1[i] /= m1; g2[i] *= 2 / m2; }
  return { r, g0, g1, g2 };
}

function rowConv(src, w, h, k, r, dst) {
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      if (x >= r && x < w - r) { const o = base + x - r; for (let i = 0; i < n; i++) s += k[i] * src[o + i]; }
      else for (let i = 0; i < n; i++) { let xx = x + i - r; xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx; s += k[i] * src[base + xx]; }
      dst[base + x] = s;
    }
  }
}

function colConv(src, w, h, k, r, dst) {
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const orow = y * w;
    for (let x = 0; x < w; x++) dst[orow + x] = 0;
    for (let i = 0; i < n; i++) {
      let yy = y + i - r; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy;
      const c = k[i], srow = yy * w;
      for (let x = 0; x < w; x++) dst[orow + x] += c * src[srow + x];
    }
  }
}

/** Mean of a plane over a (2r+1) square, by running sums. */
function boxMean(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const b = y * w;
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[b + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[b + x] = s / (2 * r + 1);
      s += src[b + clamp(x + r + 1, 0, w - 1)] - src[b + clamp(x - r, 0, w - 1)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / (2 * r + 1);
      s += tmp[clamp(y + r + 1, 0, h - 1) * w + x] - tmp[clamp(y - r, 0, h - 1) * w + x];
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------------------------ ridges */

/** In-place-ish Gaussian blur of a plane (separable), result in `dst`; `tmp` is scratch. */
function gaussBlur(src, w, h, sigma, tmp, dst) {
  const K = gaussKernels(sigma);
  rowConv(src, w, h, K.g0, K.r, tmp);
  colConv(tmp, w, h, K.g0, K.r, dst);
}

/**
 * Per pixel: how strong a ridge of the lightness runs through it (best of the scales), whether it is dark (+1) or light (-1), the unit
 * normal across it, the offset of its centre along that normal (pixels) and the scale that won. The scales are made by blurring the
 * picture a little more each time; first and second derivatives are 3-tap differences of the blurred picture (fast, and good for sigma >= 1).
 */
function ridgeMaps(L, w, h, sigmasPx, ratio, minS) {
  const N = w * h;
  const S = new Float32Array(N), POL = new Int8Array(N), NX = new Float32Array(N), NY = new Float32Array(N), TT = new Float32Array(N), SIG = new Uint8Array(N);
  let cur = new Float32Array(L), nxt = new Float32Array(N);
  const tmp = new Float32Array(N);
  let prev = 0.5;
  const lapSample = [];
  for (let si = 0; si < sigmasPx.length; si++) {
    const sg = sigmasPx[si];
    const inc = Math.sqrt(Math.max(0, sg * sg - prev * prev));
    if (inc > 0.3) { gaussBlur(cur, w, h, inc, tmp, nxt); const t = cur; cur = nxt; nxt = t; }
    prev = Math.max(prev, sg);
    const s2 = sg * sg;
    for (let y = 0; y < h; y++) {
      const ym = y > 0 ? y - 1 : 0, yp = y < h - 1 ? y + 1 : h - 1, rowM = ym * w, rowC = y * w, rowP = yp * w, dy = yp - ym;
      for (let x = 0; x < w; x++) {
        const xm = x > 0 ? x - 1 : 0, xp = x < w - 1 ? x + 1 : w - 1, dx = xp - xm;
        const c = cur[rowC + x], l = cur[rowC + xm], r = cur[rowC + xp], u = cur[rowM + x], d = cur[rowP + x];
        const lx = (r - l) / dx, ly = (d - u) / dy;
        const sxx = r - 2 * c + l, syy = d - 2 * c + u;
        const sxy = (cur[rowP + xp] - cur[rowP + xm] - cur[rowM + xp] + cur[rowM + xm]) / (dx * dy);
        const p = rowC + x;
        const tr = sxx + syy, dif = sxx - syy;
        const root = Math.sqrt(dif * dif * 0.25 + sxy * sxy);
        const l1 = tr * 0.5 + root, l2 = tr * 0.5 - root; // l1 >= l2
        if (si === 0 && (p % 7) === 0) lapSample.push(Math.abs(tr) * s2);
        if ((sxx * sxx + syy * syy + 2 * sxy * sxy) * s2 * s2 < minS * minS) continue; // too flat to hold a ridge of the weakest strength wanted
        let lam = 0, pol = 0;
        if (l1 > 0 && Math.abs(l2) <= ratio * l1) { lam = l1; pol = 1; }
        else if (l2 < 0 && Math.abs(l1) <= ratio * -l2) { lam = l2; pol = -1; }
        if (!pol) continue;
        const S0 = s2 * Math.abs(lam);
        if (S0 <= S[p]) continue;
        let vx = sxy, vy = lam - sxx;
        let nrm = Math.hypot(vx, vy);
        if (nrm < 1e-9) { vx = lam - syy; vy = sxy; nrm = Math.hypot(vx, vy); }
        if (nrm < 1e-9) continue;
        vx /= nrm; vy /= nrm;
        S[p] = S0; POL[p] = pol; NX[p] = vx; NY[p] = vy; TT[p] = -(lx * vx + ly * vy) / lam; SIG[p] = si;
      }
    }
  }
  lapSample.sort((a, b) => a - b);
  const noise = (lapSample.length ? lapSample[Math.floor(lapSample.length * 0.2)] : 0) / 0.2533; // the quiet fifth of the picture sets the noise
  return { S, POL, NX, NY, TT, SIG, noise };
}

/* ------------------------------------------------------------------------------------------------------------------ polylines */

const polyLen = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };

/** Gaussian smoothing along a polyline (sigma in the same unit as the points); ends are pulled in no more than the one-sided kernel allows. */
function smoothPoly(pts, sigma) {
  const n = pts.length;
  if (n < 3 || sigma <= 0) return pts;
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const out = new Array(n);
  const reach = 2.5 * sigma;
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === n - 1) { out[i] = pts[i].slice(0, 2); continue; }
    let sx = 0, sy = 0, sw = 0;
    for (let j = i; j >= 0 && s[i] - s[j] <= reach; j--) { const d = s[i] - s[j], wt = Math.exp(-(d * d) / (2 * sigma * sigma)); sx += wt * pts[j][0]; sy += wt * pts[j][1]; sw += wt; }
    for (let j = i + 1; j < n && s[j] - s[i] <= reach; j++) { const d = s[j] - s[i], wt = Math.exp(-(d * d) / (2 * sigma * sigma)); sx += wt * pts[j][0]; sy += wt * pts[j][1]; sw += wt; }
    out[i] = [sx / sw, sy / sw];
  }
  return out;
}

/** Douglas-Peucker, iterative. */
function rdp(pts, tol) {
  const n = pts.length;
  if (n < 3) return pts;
  const keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let dmax = 0, im = -1;
    const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      let d;
      if (L2 < 1e-12) d = Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
      else { const tt = clamp(((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / L2, 0, 1); d = Math.hypot(pts[i][0] - (ax + tt * dx), pts[i][1] - (ay + tt * dy)); }
      if (d > dmax) { dmax = d; im = i; }
    }
    if (dmax > tol && im > 0) { keep[im] = 1; stack.push([a, im], [im, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/* ------------------------------------------------------------------------------------------------------------------ sampling */

function bil(a, w, h, x, y) {
  x = clamp(x, 0, w - 1.001); y = clamp(y, 0, h - 1.001);
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return a[i] * (1 - fx) * (1 - fy) + a[i + 1] * fx * (1 - fy) + a[i + w] * (1 - fx) * fy + a[i + w + 1] * fx * fy;
}

const median = (arr) => { if (!arr.length) return 0; const s = Float64Array.from(arr).sort(); return s[s.length >> 1]; };

/* ------------------------------------------------------------------------------------------------------------------ lines */

/**
 * Candidate points -> polylines (indices into the candidate list). Strong seeds first; a line grows both ways through weaker candidates.
 */
function linkLines(C, w, h, gapPx, seedMin) {
  const n = C.n;
  const grid = new Int32Array(w * h).fill(-1);
  for (let k = 0; k < n; k++) grid[C.pix[k]] = k;
  const used = new Uint8Array(n);
  const order = [];
  for (let k = 0; k < n; k++) if (C.S[k] >= C.seedT[k]) order.push(k);
  order.sort((a, b) => C.S[b] - C.S[a]);
  const markDup = (j) => {
    const px = C.pix[j] % w, py = (C.pix[j] / w) | 0;
    for (let yy = py - 1; yy <= py + 1; yy++) for (let xx = px - 1; xx <= px + 1; xx++) {
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const m = grid[yy * w + xx];
      if (m < 0 || m === j || used[m]) continue;
      const vx = C.x[m] - C.x[j], vy = C.y[m] - C.y[j];
      const along = Math.abs(vx * C.tx[j] + vy * C.ty[j]), perp = Math.abs(-vx * C.ty[j] + vy * C.tx[j]);
      if (along < 0.65 && perp < 1.8) used[m] = 1;
    }
  };
  const grow = (k0, sign) => {
    const out = [];
    let cur = k0, dx = sign * C.tx[k0], dy = sign * C.ty[k0];
    for (;;) {
      const cx = C.x[cur], cy = C.y[cur], px = C.pix[cur] % w, py = (C.pix[cur] / w) | 0;
      let best = -1, bestCost = 1e9;
      for (let pass = 0; pass < 2 && best < 0; pass++) {
        const R = pass === 0 ? 2 : Math.max(3, gapPx);
        const cosMin = pass === 0 ? 0.45 : 0.86, tMin = pass === 0 ? 0.7 : 0.88;
        for (let yy = py - R; yy <= py + R; yy++) for (let xx = px - R; xx <= px + R; xx++) {
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = grid[yy * w + xx];
          if (j < 0 || used[j] || j === cur) continue;
          const vx = C.x[j] - cx, vy = C.y[j] - cy, d = Math.hypot(vx, vy);
          if (d < 1e-6) continue;
          const cosv = (vx * dx + vy * dy) / d;
          if (cosv < cosMin) continue;
          const td = Math.abs(C.tx[j] * dx + C.ty[j] * dy);
          if (td < tMin) continue;
          const cost = d + 1.5 * (1 - td) + 1.5 * (1 - cosv);
          if (cost < bestCost) { bestCost = cost; best = j; }
        }
      }
      if (best < 0) break;
      let ntx = C.tx[best], nty = C.ty[best];
      if (ntx * dx + nty * dy < 0) { ntx = -ntx; nty = -nty; }
      used[best] = 1; markDup(best);
      out.push(best);
      dx = 0.6 * dx + 0.4 * ntx; dy = 0.6 * dy + 0.4 * nty;
      const nn = Math.hypot(dx, dy) || 1; dx /= nn; dy /= nn;
      cur = best;
    }
    return out;
  };
  const lines = [];
  for (const k0 of order) {
    if (used[k0]) continue;
    used[k0] = 1; markDup(k0);
    const fwd = grow(k0, +1), bwd = grow(k0, -1);
    lines.push([...bwd.reverse(), k0, ...fwd]);
  }
  return lines;
}

/* ------------------------------------------------------------------------------------------------------------------ line helpers */

/** Total absolute turning of a polyline in degrees per millimetre, measured on a 0.4 mm resampling (noise wiggles, veins and twigs do not). */
function turning(pts, g) {
  const step = 0.4 / g;
  const out = [pts[0]];
  let need = step;
  for (let i = 1; i < pts.length; i++) {
    let ax = pts[i - 1][0], ay = pts[i - 1][1];
    const bx = pts[i][0], by = pts[i][1];
    let seg = Math.hypot(bx - ax, by - ay);
    while (seg >= need) {
      const t = need / seg;
      ax += (bx - ax) * t; ay += (by - ay) * t;
      out.push([ax, ay]);
      seg -= need; need = step;
    }
    need -= seg;
  }
  if (out.length < 3) return 0;
  let sum = 0;
  for (let j = 1; j < out.length - 1; j++) {
    const a1 = Math.atan2(out[j][1] - out[j - 1][1], out[j][0] - out[j - 1][0]), a2 = Math.atan2(out[j + 1][1] - out[j][1], out[j + 1][0] - out[j][0]);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    sum += Math.abs(d);
  }
  return ((sum * 180) / Math.PI) / ((out.length - 1) * 0.4);
}

/** Join line ends that are close and point at each other (a vein whose contrast dips for a millimetre is still one vein). */
function bridgeLines(polys, g, P) {
  const maxGap = P.bridgeMm / g;
  let list = polys.slice();
  const endInfo = (pts, atStart) => {
    const n = pts.length, e = atStart ? pts[0] : pts[n - 1];
    let k = atStart ? 1 : n - 2;
    while (k > 0 && k < n - 1 && Math.hypot(e[0] - pts[k][0], e[1] - pts[k][1]) * g < 0.6) k += atStart ? 1 : -1;
    k = clamp(k, 0, n - 1);
    const q = pts[k];
    const dx = e[0] - q[0], dy = e[1] - q[1];
    const nn = Math.hypot(dx, dy) || 1;
    return { e, dir: [dx / nn, dy / nn] };
  };
  for (let round = 0; round < 3; round++) {
    const ends = [];
    list.forEach((it, i) => { ends.push({ i, start: true, ...endInfo(it.pts, true) }); ends.push({ i, start: false, ...endInfo(it.pts, false) }); });
    const pairs = [];
    const cell = Math.max(1, maxGap);
    const buckets = new Map();
    ends.forEach((E, k) => { const key = Math.floor(E.e[0] / cell) * 100003 + Math.floor(E.e[1] / cell); const l = buckets.get(key); if (l) l.push(k); else buckets.set(key, [k]); });
    for (let a = 0; a < ends.length; a++) {
      const A = ends[a], cx = Math.floor(A.e[0] / cell), cy = Math.floor(A.e[1] / cell);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const l = buckets.get((cx + ox) * 100003 + (cy + oy));
        if (!l) continue;
        for (const b of l) {
          if (b <= a) continue;
          const B = ends[b];
          if (A.i === B.i || list[A.i].pol !== list[B.i].pol) continue;
          const d = Math.hypot(B.e[0] - A.e[0], B.e[1] - A.e[1]);
          if (d > maxGap || d < 1e-6) continue;
          const vx = (B.e[0] - A.e[0]) / d, vy = (B.e[1] - A.e[1]) / d;
          if (A.dir[0] * vx + A.dir[1] * vy < 0.82 || -(B.dir[0] * vx + B.dir[1] * vy) < 0.82) continue; // each end points at the other (within about 35 degrees)
          if (-(A.dir[0] * B.dir[0] + A.dir[1] * B.dir[1]) < 0.7) continue; // and the two lines run the same way
          pairs.push({ a, b, d });
        }
      }
    }
    if (!pairs.length) break;
    pairs.sort((p, q) => p.d - q.d);
    const gone = new Set(), made = [];
    for (const { a, b } of pairs) {
      const A = ends[a], B = ends[b];
      if (gone.has(A.i) || gone.has(B.i)) continue;
      const la = list[A.i], lb = list[B.i];
      const pa = A.start ? la.pts.slice().reverse() : la.pts.slice(); // ends at A end
      const pb = B.start ? lb.pts.slice() : lb.pts.slice().reverse(); // starts at B end
      made.push({ pts: [...pa, ...pb], pol: la.pol, sig: Math.max(la.sig, lb.sig), S: Math.max(la.S, lb.S) });
      gone.add(A.i); gone.add(B.i);
    }
    list = [...list.filter((_, i) => !gone.has(i)), ...made];
    if (!made.length) break;
  }
  return list;
}

/* ------------------------------------------------------------------------------------------------------------------ the extractor */

/**
 * @param {object} input
 *   w, h, rgb       the picture (rgb: 3 bytes a pixel). Give the picture itself, not a copy already reduced to the colour layer grid: lines
 *                   are 0.3 to 1 mm wide, and the grid the colour layer works on (0.15 to 0.25 mm a pixel) is too coarse to see them
 *   mmPerPx         size of one input pixel in millimetres
 *   kind            "photo" | "art" | "logo" (a logo gets nothing: the tracer keeps its flat colours and strokes exactly)
 *   detail          the Detail slider, 0..1
 *   cov             optional coverage (0..255 per pixel; under 128 = not part of the picture, e.g. transparent)
 *   params          optional overrides of detailParams
 *   mask            false: do not make the mask (the page does not need it: the details are added on top of the colour layer, which is left as it is)
 *   debug           true: also return the intermediate maps
 * @returns {{ lines, spots, mask, stats }}
 *   lines  [{ pts: [[x, y], ...], widthMm, rgb, strength (dE), lengthMm, dark }]  centre lines, in input pixels
 *   spots  [{ ring: [[x, y], ...], areaMm2, rgb, strength, dark, centre }]        closed outlines, in input pixels
 *   mask   Uint8Array(w * h), 1 where a chosen line or spot lies (a little wider than it): fill these pixels from what is round them in the colour layer
 *          (lineMask and spotMask are its two halves, for a caller that wants to remove only one sort)
 */
export function extractDetails(input) {
  const T0 = now();
  const { w, h, rgb, mmPerPx } = input;
  const kind = input.kind || "photo";
  const P = detailParams(kind, input.detail == null ? 0.75 : input.detail, input.params || null);
  const stats = { kind, detail: P.detail, ms: {} };
  const wantMask = input.mask !== false;
  const mask = wantMask ? new Uint8Array(w * h) : null;
  const empty = (reason) => ({ lines: [], spots: [], mask, stats: { ...stats, reason, lines: 0, spots: 0, lengthMm: 0, stitchesEst: 0 } });
  if (kind === "logo") return empty("logo");
  if (!(w > 8 && h > 8 && mmPerPx > 0)) return empty("tiny");

  /* 1. the detection grid: never finer than P.gridMm, never more than P.maxPixels */
  const f = Math.max(1, P.gridMm / mmPerPx);
  let dw = Math.max(8, Math.round(w / f)), dh = Math.max(8, Math.round(h / f));
  if (dw * dh > P.maxPixels) { const k = Math.sqrt((dw * dh) / P.maxPixels); dw = Math.round(dw / k); dh = Math.round(dh / k); }
  const fx = w / dw, fy = h / dh; // input pixels per detection pixel
  const g = Math.sqrt(mmPerPx * fx * mmPerPx * fy); // mm per detection pixel
  const drgb = dw === w && dh === h ? rgb : boxDown(rgb, w, h, dw, dh);
  const N = dw * dh;
  const L = new Float32Array(N), La = new Float32Array(N), Lb = new Float32Array(N);
  rgbToLab(drgb, N, L, La, Lb);
  stats.det = { w: dw, h: dh, mmPerPx: +g.toFixed(4) };
  stats.ms.prep = now() - T0;

  /* a coverage mask on the detection grid (outside the picture nothing is looked for) */
  let outside = null;
  if (input.cov) {
    outside = new Uint8Array(N);
    let any = false;
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const sx = Math.min(w - 1, Math.floor((x + 0.5) * fx)), sy = Math.min(h - 1, Math.floor((y + 0.5) * fy));
      if (input.cov[sy * w + sx] < 128) { outside[y * dw + x] = 1; any = true; }
    }
    if (any) {
      const grown = new Uint8Array(N), r = Math.max(2, Math.round(0.45 / g));
      for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
        if (!outside[y * dw + x]) continue;
        for (let yy = Math.max(0, y - r); yy <= Math.min(dh - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(dw - 1, x + r); xx++) grown[yy * dw + xx] = 1;
      }
      outside = grown;
    } else outside = null;
  }

  /* 2. ridges */
  const T1 = now();
  const sigmasPx = P.scalesMm.map((s) => Math.max(0.8, s / g));
  const R = ridgeMaps(L, dw, dh, sigmasPx, P.lineRatio, 0.35 * P.contrastLow);
  stats.ms.ridges = now() - T1;
  stats.noise = +R.noise.toFixed(3);

  /* 3. thresholds: absolute (from the contrast wanted) and against the noise (and, if asked, against the ridges round it) */
  const T2 = now();
  const toS = 0.35; // a line of contrast A has a scale-normalised response of about 0.35 A
  const Slow = toS * P.contrastLow, Shigh = toS * P.contrastHigh;
  const floorS = Math.max(Slow, P.noiseK * R.noise);
  const Sc = new Float32Array(N);
  let nGeom = 0;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const p = y * dw + x;
      if (!R.POL[p]) continue;
      const s = R.S[p];
      if (s < floorS) continue;
      const t = R.TT[p], nx = R.NX[p], ny = R.NY[p];
      if (Math.abs(t * nx) > 0.55 || Math.abs(t * ny) > 0.55) continue;
      if (outside && outside[p]) continue;
      Sc[p] = s; nGeom++;
    }
  }
  const dens = P.localK > 0 ? boxMean(Sc, dw, dh, Math.max(2, Math.round(P.localMm / g))) : null;
  const C = { n: 0, x: [], y: [], tx: [], ty: [], S: [], pix: [], seedT: [], pol: [], sig: [] };
  for (let p = 0; p < N; p++) {
    const s = Sc[p];
    if (!s) continue;
    const lowT = dens ? Math.max(floorS, P.localK * dens[p]) : floorS;
    if (s < lowT) continue;
    const x = p % dw, y = (p / dw) | 0, nx = R.NX[p], ny = R.NY[p], t = R.TT[p];
    C.x.push(x + t * nx); C.y.push(y + t * ny); C.tx.push(-ny); C.ty.push(nx); C.S.push(s); C.pix.push(p);
    C.seedT.push(P.allSeeds ? lowT : Math.max(Shigh, 1.6 * lowT)); C.pol.push(R.POL[p]); C.sig.push(R.SIG[p]);
  }
  C.n = C.x.length;
  stats.candidates = C.n; stats.geomCandidates = nGeom;
  stats.ms.threshold = now() - T2;

  /* 4. link */
  const T3 = now();
  const gapPx = Math.max(3, Math.round(P.gapMm / g));
  const linked = linkLines(C, dw, dh, gapPx);
  stats.rawLines = linked.length;
  stats.ms.link = now() - T3;

  /* 5. polylines, bridged, measured; a strong tier and a weak-but-long-and-smooth tier */
  const T4 = now();
  const smoothPx = P.smoothMm / g;
  let polys = [];
  for (const idx of linked) {
    if (idx.length < 3) continue;
    let pts = idx.map((k) => [C.x[k], C.y[k]]);
    if (polyLen(pts) * g < P.minLenMm * 0.3) continue;
    pts = smoothPoly(pts, smoothPx);
    pts = rdp(pts, P.simplifyMm / g);
    let dark = 0; const sigs = [], ss = [];
    for (const k of idx) { dark += C.pol[k]; sigs.push(C.sig[k]); ss.push(C.S[k]); }
    polys.push({ pts, pol: dark >= 0 ? 1 : -1, sig: median(sigs) | 0, S: median(ss) });
  }
  polys = bridgeLines(polys, g, P);
  const items = [];
  for (const pl of polys) {
    const pts = pl.pts;
    const lenMm = polyLen(pts) * g;
    if (lenMm < P.minLenMm * 0.5) continue;
    const halfMm = 0.83 * P.scalesMm[clamp(pl.sig, 0, P.scalesMm.length - 1)];
    const m = measureLine(pts, L, La, Lb, dw, dh, g, pl.pol, halfMm);
    if (!m) continue;
    items.push({ pts, lenMm, pol: pl.pol, widthMm: clamp(2 * halfMm, 0.25, 2), dE: m.dE, edge: m.edge, solid: m.solid, turn: turning(pts, g), S: pl.S });
  }
  const kept = [];
  for (const it of items) {
    if (it.edge > P.edgeMax || it.solid < P.solidMin) continue;
    const strong = it.dE >= P.contrastMin;
    const weak = !strong && it.dE >= P.weakFactor * P.contrastMin;
    if (!strong && !weak) continue;
    const need = P.minLenMm * (it.dE >= 2.6 * P.contrastMin ? 0.55 : it.dE >= 1.8 * P.contrastMin ? 0.8 : 1) * (strong ? 1 : P.weakLenFactor);
    if (it.lenMm < need) continue;
    if (it.turn > P.maxTurnDegPerMm) continue;
    it.widthMm = profileWidthMm(it.pts, L, dw, dh, g, it.pol, it.widthMm); // as it looks in the picture
    if (it.widthMm > P.maxWidthMm) continue; // a stroke, not a thread: the colour layer sews it
    it.tier = it.dE >= 2.2 * P.contrastMin ? 0 : it.dE >= 1.3 * P.contrastMin ? 1 : 2;
    it.weak = weak;
    kept.push(it);
  }
  // A line has a pale or dark HALO either side of it when the picture was sharpened or compressed: a ridge of the opposite sort that runs along a stronger
  // line, within half a millimetre, for most of its length is that halo, not a line of its own.
  {
    const idMap = [new Int32Array(N).fill(-1), new Int32Array(N).fill(-1)]; // [dark, light]: the strongest line covering each pixel
    const strength = kept.map((it) => it.dE);
    const haloR = 0.55 / g;
    const order = kept.map((_, i) => i).sort((p, q) => strength[p] - strength[q]); // weakest first, so the strongest ends on top
    for (const i of order) {
      const it = kept[i], map = idMap[it.pol > 0 ? 0 : 1];
      for (let j = 0; j < it.pts.length - 1; j++) {
        const p = it.pts[j], q = it.pts[j + 1], steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.8));
        for (let t = 0; t <= steps; t++) {
          const x = p[0] + (q[0] - p[0]) * (t / steps), y = p[1] + (q[1] - p[1]) * (t / steps);
          const x0 = Math.max(0, Math.floor(x - haloR)), x1 = Math.min(dw - 1, Math.ceil(x + haloR)), y0 = Math.max(0, Math.floor(y - haloR)), y1 = Math.min(dh - 1, Math.ceil(y + haloR));
          for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if ((xx - x) * (xx - x) + (yy - y) * (yy - y) <= haloR * haloR) map[yy * dw + xx] = i;
        }
      }
    }
    const drop = new Uint8Array(kept.length);
    for (let i = 0; i < kept.length; i++) {
      const it = kept[i], other = idMap[it.pol > 0 ? 1 : 0];
      let n = 0, hit = 0;
      for (let j = 0; j < it.pts.length; j++) {
        const x = Math.round(it.pts[j][0]), y = Math.round(it.pts[j][1]);
        if (x < 0 || y < 0 || x >= dw || y >= dh) continue;
        n++;
        const o = other[y * dw + x];
        if (o >= 0 && kept[o].dE >= 0.8 * it.dE) hit++;
      }
      if (n >= 3 && hit / n >= 0.5) drop[i] = 1;
    }
    let dropped = 0;
    for (let i = kept.length - 1; i >= 0; i--) if (drop[i]) { kept.splice(i, 1); dropped++; }
    stats.haloDropped = dropped;
  }
  stats.measured = items.length; stats.keptByContrast = kept.length;
  const score = (it) => it.dE * Math.pow(Math.min(it.lenMm, 30), P.lenExp);
  kept.sort((a, b) => score(b) - score(a));

  /* 6. budget and spacing: a stronger line keeps its neighbours at a distance (a weaker neighbour further than a strong one) */
  const areaCm2 = (w * mmPerPx) * (h * mmPerPx) / 100;
  const budgetMm = Math.max(30, P.lineMmPerCm2 * areaCm2);
  const maxLines = Math.max(4, Math.round(P.linesPerCm2 * areaCm2));
  const occR = P.occupyMm.map((mm) => mm / g);
  const occ = occR.map(() => new Uint8Array(N));
  const stamp = (pts, map, rad) => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)];
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(0.7, rad * 0.5)));
      for (let s = 0; s < steps; s++) {
        const x = a[0] + (b[0] - a[0]) * (s / steps), y = a[1] + (b[1] - a[1]) * (s / steps);
        const x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(dw - 1, Math.ceil(x + rad)), y0 = Math.max(0, Math.floor(y - rad)), y1 = Math.min(dh - 1, Math.ceil(y + rad));
        for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if ((xx - x) * (xx - x) + (yy - y) * (yy - y) <= rad * rad) map[yy * dw + xx] = 1;
      }
    }
  };
  const accepted = [];
  let total = 0;
  for (const it of kept) {
    if (total >= budgetMm || accepted.length >= maxLines) break;
    // walk the line; the part that lies inside an already accepted line band (except near its two ends, where it joins) is cut away
    const pts = it.pts;
    const dense = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(d / (0.2 / g)));
      for (let s = 0; s < steps; s++) dense.push([a[0] + (b[0] - a[0]) * (s / steps), a[1] + (b[1] - a[1]) * (s / steps)]);
    }
    dense.push(pts[pts.length - 1]);
    const endMm = 0.9;
    const cum = [0];
    for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]) * g);
    const tot = cum[cum.length - 1];
    const map = occ[it.tier];
    const bad = dense.map((p, i) => {
      if (cum[i] < endMm || tot - cum[i] < endMm) return false;
      const x = Math.round(p[0]), y = Math.round(p[1]);
      return x >= 0 && y >= 0 && x < dw && y < dh && map[y * dw + x] === 1;
    });
    const runs = [];
    let start = -1;
    for (let i = 0; i <= dense.length; i++) {
      const ok = i < dense.length && !bad[i];
      if (ok && start < 0) start = i;
      if (!ok && start >= 0) { runs.push([start, i - 1]); start = -1; }
    }
    const need = P.minLenMm * (it.dE >= 2.6 * P.contrastMin ? 0.55 : it.dE >= 1.8 * P.contrastMin ? 0.8 : 1) * (it.weak ? P.weakLenFactor : 1);
    for (const [a, b] of runs) {
      const part = dense.slice(a, b + 1);
      const lenMm = polyLen(part) * g;
      if (lenMm < need) continue;
      const simp = rdp(part, P.simplifyMm / g);
      accepted.push({ ...it, pts: simp, lenMm });
      for (let t = 0; t < occ.length; t++) stamp(simp, occ[t], occR[t]);
      total += lenMm;
      if (total >= budgetMm || accepted.length >= maxLines) break;
    }
  }
  stats.ms.measure = now() - T4;
  stats.budgetMm = +budgetMm.toFixed(0); stats.maxLines = maxLines;

  /* 7. snap the ends of lines to the stronger lines they stop at (a branch of a vein joins its midrib) */
  const snapPx = P.snapMm / g;
  for (let i = 0; i < accepted.length; i++) {
    const ln = accepted[i];
    for (const endIdx of [0, ln.pts.length - 1]) {
      const e = ln.pts[endIdx], e2 = ln.pts[endIdx === 0 ? 1 : ln.pts.length - 2];
      if (!e2) continue;
      let ux = e[0] - e2[0], uy = e[1] - e2[1]; const un = Math.hypot(ux, uy) || 1; ux /= un; uy /= un;
      let best = null, bd = snapPx;
      for (let j = 0; j < accepted.length; j++) {
        if (j === i) continue;
        const o = accepted[j].pts;
        for (let q = 0; q < o.length - 1; q++) {
          const a = o[q], b = o[q + 1];
          const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
          const tt = clamp(((e[0] - a[0]) * dx + (e[1] - a[1]) * dy) / L2, 0, 1);
          const px = a[0] + tt * dx, py = a[1] + tt * dy, d = Math.hypot(px - e[0], py - e[1]);
          if (d < bd && d > 0.05) { const cosA = ((px - e[0]) * ux + (py - e[1]) * uy) / d; if (cosA > 0.64) { bd = d; best = [px, py]; } }
        }
      }
      if (best) { if (endIdx === 0) ln.pts.unshift(best); else ln.pts.push(best); ln.lenMm += bd * g; }
    }
  }

  /* 8. spots */
  const T5 = now();
  const spots = findSpots(L, La, Lb, dw, dh, g, P, accepted, outside, areaCm2);
  stats.ms.spots = now() - T5;

  /* 9. out: coordinates in input pixels; colour from the ORIGINAL picture */
  const toX = (x) => (x + 0.5) * fx, toY = (y) => (y + 0.5) * fy;
  const outLines = accepted.map((ln) => {
    const pts = ln.pts.map((p) => [toX(p[0]), toY(p[1])]);
    return { pts, widthMm: +ln.widthMm.toFixed(2), rgb: lineColour(pts, rgb, w, h, ln.pol), strength: +ln.dE.toFixed(1), lengthMm: +ln.lenMm.toFixed(2), dark: ln.pol > 0, edge: +ln.edge.toFixed(2), weak: !!ln.weak };
  });
  const outSpots = spots.map((sp) => {
    const ring = sp.ring.map((p) => [toX(p[0]), toY(p[1])]);
    return { ring, areaMm2: +sp.areaMm2.toFixed(2), rgb: spotColour(ring, rgb, w, h), strength: +sp.dE.toFixed(1), dark: sp.pol > 0, centre: [toX(sp.cx), toY(sp.cy)] };
  });

  /* 10. the mask on the input grid: a band round every line, the inside of every spot and a pixel more */
  let lineMask = null, spotMask = null;
  if (wantMask) {
    lineMask = new Uint8Array(w * h); spotMask = new Uint8Array(w * h);
    for (const ln of outLines) stampLine(lineMask, w, h, ln.pts, (0.5 * Math.max(ln.widthMm, 0.5) + 0.18) / mmPerPx + 0.5);
    for (const sp of outSpots) fillRing(spotMask, w, h, sp.ring, 1.2);
    for (let i = 0; i < mask.length; i++) mask[i] = lineMask[i] | spotMask[i];
  }

  let lengthMm = 0;
  for (const ln of outLines) lengthMm += ln.lengthMm;
  let spotArea = 0;
  for (const sp of outSpots) spotArea += sp.areaMm2;
  stats.lines = outLines.length; stats.spots = outSpots.length; stats.lengthMm = +lengthMm.toFixed(0);
  stats.stitchesEst = Math.round(lengthMm * 1.5 + spotArea * 1.0 + outSpots.length * 12 + outLines.length * 8);
  stats.ms.total = now() - T0;
  const out = { lines: outLines, spots: outSpots, mask, lineMask, spotMask, stats };
  if (input.debug) out.debug = { det: { w: dw, h: dh, g, fx, fy }, R, L, dens, Sc, C, items, kept, accepted, P };
  return out;
}


/* ------------------------------------------------------------------------------------------------------------------ line measures */

/** Contrast (dE of the centre from both sides), edge-likeness and continuity along a polyline (pixels of the detection grid). */
function measureLine(pts, L, A, B, w, h, g, pol, halfMm) {
  const step = 0.3 / g, dist = (halfMm + 0.3) / g;
  const dens = [];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  if (total < 2) return null;
  let seg = 0;
  const dEs = [], edges = [];
  for (let s = 0; s <= total; s += step) {
    while (seg < pts.length - 2 && cum[seg + 1] < s) seg++;
    const a = pts[seg], b = pts[seg + 1];
    const d = cum[seg + 1] - cum[seg] || 1e-9;
    const t = clamp((s - cum[seg]) / d, 0, 1);
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tn = Math.hypot(tx, ty) || 1; tx /= tn; ty /= tn;
    const nx = -ty, ny = tx;
    // the centre colour: the most line-like of three samples across the line
    let cx = x, cy = y, cL = bil(L, w, h, x, y);
    for (const o of [-0.6, 0.6]) {
      const xx = x + nx * o, yy = y + ny * o, v = bil(L, w, h, xx, yy);
      if (pol > 0 ? v < cL : v > cL) { cL = v; cx = xx; cy = yy; }
    }
    const ca = bil(A, w, h, cx, cy), cb = bil(B, w, h, cx, cy);
    const l1 = bil(L, w, h, x + nx * dist, y + ny * dist), l2 = bil(L, w, h, x - nx * dist, y - ny * dist);
    const a1 = bil(A, w, h, x + nx * dist, y + ny * dist), a2 = bil(A, w, h, x - nx * dist, y - ny * dist);
    const b1 = bil(B, w, h, x + nx * dist, y + ny * dist), b2 = bil(B, w, h, x - nx * dist, y - ny * dist);
    const sL = (l1 + l2) / 2, sA = (a1 + a2) / 2, sB = (b1 + b2) / 2;
    const d1 = Math.hypot(cL - l1, ca - a1, cb - b1), d2 = Math.hypot(cL - l2, ca - a2, cb - b2);
    const lineLike = pol > 0 ? Math.min(l1, l2) - cL : cL - Math.max(l1, l2); // a dark line is darker than BOTH sides
    dEs.push(lineLike > 0 ? Math.min(d1, d2) : 0);
    edges.push(Math.abs(l1 - l2) / Math.max(1e-3, Math.abs(cL - sL)));
  }
  if (!dEs.length) return null;
  const dE = median(dEs), edge = median(edges);
  let solid = 0;
  for (const v of dEs) if (v >= 0.55 * dE) solid++;
  return { dE, edge, solid: solid / dEs.length };
}

/**
 * The width of a line as it looks in the picture (full width at half height of its cross profile), median along it: samples across the line
 * from -1.3 to +1.3 mm, the centre value against the median of the outer parts on both sides. A blurred 0.3 mm line reads about 0.45 mm.
 */
function profileWidthMm(pts, L, w, h, g, pol, fallback) {
  const widths = [];
  const stepPx = 0.5 / g, span = 1.3 / g, dt = 0.06 / g;
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const tx = (b[0] - a[0]) / len, ty = (b[1] - a[1]) / len, nx = -ty, ny = tx;
    for (let s = carry; s < len; s += stepPx) {
      const x = a[0] + tx * s, y = a[1] + ty * s;
      const n = Math.round((2 * span) / dt);
      const v = new Float32Array(n + 1);
      for (let k = 0; k <= n; k++) { const o = -span + k * dt; v[k] = bil(L, w, h, x + nx * o, y + ny * o); }
      // centre value: the most line-like sample within 0.25 mm of the middle
      const mid = n >> 1, r = Math.round(0.25 / g / dt);
      let ci = mid;
      for (let k = Math.max(0, mid - r); k <= Math.min(n, mid + r); k++) if (pol > 0 ? v[k] < v[ci] : v[k] > v[ci]) ci = k;
      const outer = (from, to) => { const arr = []; for (let k = from; k <= to; k++) arr.push(v[k]); arr.sort((p, q) => p - q); return arr[arr.length >> 1]; };
      const edge = Math.round(0.28 * n);
      const base = (outer(0, edge) + outer(n - edge, n)) / 2;
      const half = (v[ci] + base) / 2;
      const inside = (val) => (pol > 0 ? val <= half : val >= half);
      let lo = ci, hi = ci;
      while (lo > 0 && inside(v[lo - 1])) lo--;
      while (hi < n && inside(v[hi + 1])) hi++;
      const widthPx = (hi - lo + 1) * dt;
      if (lo > 0 && hi < n) widths.push(widthPx * g);
      else widths.push(Math.min(2.6, widthPx * g));
    }
    carry = ((carry + Math.ceil((len - carry) / stepPx) * stepPx) - len);
  }
  if (!widths.length) return fallback;
  widths.sort((p, q) => p - q);
  return clamp(widths[widths.length >> 1], 0.2, 2.6);
}

/** The colour of a line in the original picture: for each point the most line-like pixel of the 3 x 3 round it, then the median. */
function lineColour(pts, rgb, w, h, pol) {
  const rs = [], gs = [], bs = [];
  const stepN = Math.max(1, Math.floor(pts.length / 60));
  for (let i = 0; i < pts.length; i += stepN) {
    const px = clamp(Math.floor(pts[i][0]), 0, w - 1), py = clamp(Math.floor(pts[i][1]), 0, h - 1);
    let best = -1, bv = pol > 0 ? 1e9 : -1e9;
    for (let yy = Math.max(0, py - 1); yy <= Math.min(h - 1, py + 1); yy++) for (let xx = Math.max(0, px - 1); xx <= Math.min(w - 1, px + 1); xx++) {
      const o = (yy * w + xx) * 3, v = 0.299 * rgb[o] + 0.587 * rgb[o + 1] + 0.114 * rgb[o + 2];
      if (pol > 0 ? v < bv : v > bv) { bv = v; best = o; }
    }
    if (best >= 0) { rs.push(rgb[best]); gs.push(rgb[best + 1]); bs.push(rgb[best + 2]); }
  }
  return [median(rs) | 0, median(gs) | 0, median(bs) | 0];
}

function spotColour(ring, rgb, w, h) {
  let cx = 0, cy = 0;
  for (const p of ring) { cx += p[0]; cy += p[1]; }
  cx /= ring.length; cy /= ring.length;
  const rs = [], gs = [], bs = [];
  for (const f of [0, 0.35, 0.6]) {
    for (let a = 0; a < 8; a++) {
      const p = ring[Math.floor((a / 8) * ring.length)];
      const x = clamp(Math.floor(cx + (p[0] - cx) * f), 0, w - 1), y = clamp(Math.floor(cy + (p[1] - cy) * f), 0, h - 1), o = (y * w + x) * 3;
      rs.push(rgb[o]); gs.push(rgb[o + 1]); bs.push(rgb[o + 2]);
    }
    if (f === 0) { const x = clamp(Math.floor(cx), 0, w - 1), y = clamp(Math.floor(cy), 0, h - 1), o = (y * w + x) * 3; rs.push(rgb[o]); gs.push(rgb[o + 1]); bs.push(rgb[o + 2]); }
  }
  return [median(rs) | 0, median(gs) | 0, median(bs) | 0];
}

/* ------------------------------------------------------------------------------------------------------------------ spots */

/**
 * Small compact blobs, darker or lighter than what is round them: scale-space extrema of the Laplacian, outlined by rays.
 */
function findSpots(L, A, B, w, h, g, P, lines, outside, areaCm2) {
  if (!(P.spotsPerCm2 > 0)) return [];
  const gB = Math.max(0.24, g, Math.sqrt((areaCm2 * 100) / 350000)); // mm per pixel of the blob grid: at most about 350k pixels
  const fb = gB / g;
  const bw = Math.max(8, Math.round(w / fb)), bh = Math.max(8, Math.round(h / fb));
  const Lb = fb > 1.05 ? boxDownPlane(L, w, h, bw, bh) : L;
  const cw = fb > 1.05 ? bw : w, ch = fb > 1.05 ? bh : h;
  const gb = g * (w / cw);
  const sig = P.spotScalesMm.map((s) => Math.max(0.9, s / gb));
  const n = cw * ch;
  const T = new Float32Array(n);
  let cur = new Float32Array(Lb), nxt = new Float32Array(n);
  let prev = 0.5;
  const resp = [];
  for (let si = 0; si < sig.length; si++) {
    const inc = Math.sqrt(Math.max(0, sig[si] * sig[si] - prev * prev));
    if (inc > 0.3) { gaussBlur(cur, cw, ch, inc, T, nxt); const t = cur; cur = nxt; nxt = t; }
    prev = Math.max(prev, sig[si]);
    const R = new Float32Array(n), s2 = sig[si] * sig[si];
    for (let y = 0; y < ch; y++) {
      const ym = y > 0 ? y - 1 : 0, yp = y < ch - 1 ? y + 1 : ch - 1;
      for (let x = 0; x < cw; x++) {
        const xm = x > 0 ? x - 1 : 0, xp = x < cw - 1 ? x + 1 : cw - 1, c = cur[y * cw + x];
        R[y * cw + x] = s2 * (cur[y * cw + xm] + cur[y * cw + xp] + cur[ym * cw + x] + cur[yp * cw + x] - 4 * c); // > 0: darker than round it
      }
    }
    resp.push(R);
  }
  // how busy the neighbourhood is at each scale: a blob has to stand out from the blobs round it
  const rAct = Math.max(2, Math.round(3 / gb));
  const act = resp.map((R) => { const a = new Float32Array(n); for (let p = 0; p < n; p++) a[p] = Math.abs(R[p]); return boxMean(a, cw, ch, rAct); });
  // extrema in space and scale
  const cands = [];
  const thr = 0.5 * P.spotContrast * 0.55;
  for (let si = 0; si < sig.length; si++) {
    const R = resp[si];
    for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
      const p = y * cw + x, v = R[p], av = Math.abs(v);
      if (av < thr) continue;
      if (av < P.spotSaliency * act[si][p] && av < 0.55 * P.spotContrast) continue; // (a very strong blob needs no such test: a pupil in a busy iris)
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const u = R[p + dy * cw + dx];
        if ((v > 0 ? u : -u) >= (v > 0 ? v : -v)) { ok = false; break; }
      }
      if (!ok) continue;
      if (si > 0 && Math.abs(resp[si - 1][p]) > av) continue;
      if (si < sig.length - 1 && Math.abs(resp[si + 1][p]) > av) continue;
      cands.push({ x: (x + 0.5) * (w / cw) - 0.5, y: (y + 0.5) * (h / ch) - 0.5, s: si, v, av });
    }
  }
  cands.sort((a, b) => b.av - a.av);
  const spots = [];
  const maxSpots = P.spotsPerCm2 > 0 ? Math.max(3, Math.round(P.spotsPerCm2 * areaCm2)) : 0;
  const nR = 36;
  for (const c of cands.slice(0, 1500)) {
    if (spots.length >= maxSpots) break;
    const pol = c.v > 0 ? 1 : -1; // 1: darker blob
    const rpx = (P.spotScalesMm[c.s] * Math.SQRT2) / g;
    if (outside && outside[Math.round(c.y) * w + Math.round(c.x)]) continue;
    // centre and surround levels
    const cLv = [], sLv = [];
    const rin = Math.max(1, 0.6 * rpx);
    for (let a = 0; a < 12; a++) {
      const th = (a / 12) * Math.PI * 2;
      for (const k of [0, 0.5]) cLv.push(bil(L, w, h, c.x + Math.cos(th) * rin * k, c.y + Math.sin(th) * rin * k));
      for (const k of [1.9, 2.3]) sLv.push(bil(L, w, h, c.x + Math.cos(th) * rpx * k, c.y + Math.sin(th) * rpx * k));
    }
    cLv.sort((a, b) => a - b); sLv.sort((a, b) => a - b);
    const centreL = pol > 0 ? cLv[Math.floor(cLv.length * 0.15)] : cLv[Math.floor(cLv.length * 0.85)];
    const surL = sLv[sLv.length >> 1];
    if (pol > 0 ? !(centreL < surL) : !(centreL > surL)) continue;
    const level = (centreL + surL) / 2;
    // rays out from the centre to the half-way level
    const radii = new Float32Array(nR);
    let bad = false;
    // start on the darkest/lightest sample near the centre
    let sx = c.x, sy = c.y, sv = bil(L, w, h, sx, sy);
    for (let dy = -rin; dy <= rin; dy += 0.5) for (let dx = -rin; dx <= rin; dx += 0.5) {
      const v = bil(L, w, h, c.x + dx, c.y + dy);
      if (pol > 0 ? v < sv : v > sv) { sv = v; sx = c.x + dx; sy = c.y + dy; }
    }
    const rMax = 3.2 * rpx + 2;
    for (let a = 0; a < nR; a++) {
      const th = (a / nR) * Math.PI * 2, ux = Math.cos(th), uy = Math.sin(th);
      let r = 0, found = false;
      for (let t = 0.5; t <= rMax; t += 0.25) {
        const v = bil(L, w, h, sx + ux * t, sy + uy * t);
        if (pol > 0 ? v > level : v < level) { r = t - 0.125; found = true; break; }
      }
      if (!found) { bad = true; break; }
      radii[a] = r;
    }
    if (bad) continue;
    // smooth the radii, keep neighbours within a factor
    const sm = new Float32Array(nR);
    for (let a = 0; a < nR; a++) sm[a] = (radii[(a + nR - 1) % nR] + 2 * radii[a] + radii[(a + 1) % nR]) / 4;
    const ring = [];
    for (let a = 0; a < nR; a++) { const th = (a / nR) * Math.PI * 2; ring.push([sx + Math.cos(th) * sm[a], sy + Math.sin(th) * sm[a]]); }
    let area2 = 0;
    for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; area2 += p[0] * q[1] - q[0] * p[1]; }
    const areaMm2 = Math.abs(area2) / 2 * g * g;
    if (areaMm2 < P.spotMinMm2 || areaMm2 > P.spotMaxMm2) continue;
    // elongation from the second moments of the outline
    let mx = 0, my = 0;
    for (const p of ring) { mx += p[0]; my += p[1]; }
    mx /= ring.length; my /= ring.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of ring) { sxx += (p[0] - mx) ** 2; syy += (p[1] - my) ** 2; sxy += (p[0] - mx) * (p[1] - my); }
    const tr = sxx + syy, dt = Math.sqrt(Math.max(0, (sxx - syy) ** 2 / 4 + sxy * sxy));
    const e1 = tr / 2 + dt, e2 = Math.max(1e-9, tr / 2 - dt);
    if (Math.sqrt(e1 / e2) > P.spotElongation) continue;
    // contrast in colour: inside (half radius) against a ring just outside
    let iL = 0, iA = 0, iB = 0, oL = 0, oA = 0, oB = 0, cnt = 0;
    for (let a = 0; a < nR; a += 3) {
      const th = (a / nR) * Math.PI * 2, ux = Math.cos(th), uy = Math.sin(th);
      const ri = 0.5 * sm[a], ro = 1.5 * sm[a] + 0.3 / g;
      iL += bil(L, w, h, sx + ux * ri, sy + uy * ri); iA += bil(A, w, h, sx + ux * ri, sy + uy * ri); iB += bil(B, w, h, sx + ux * ri, sy + uy * ri);
      oL += bil(L, w, h, sx + ux * ro, sy + uy * ro); oA += bil(A, w, h, sx + ux * ro, sy + uy * ro); oB += bil(B, w, h, sx + ux * ro, sy + uy * ro);
      cnt++;
    }
    const dE = Math.hypot((iL - oL) / cnt, (iA - oA) / cnt, (iB - oB) / cnt);
    if (dE < P.spotContrast) continue;
    // not on top of a line, not inside a spot of the same sort
    let clash = false;
    for (const ln of lines) {
      const pts = ln.pts;
      for (let i = 0; i < pts.length - 1 && !clash; i++) {
        const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
        const tt = clamp(((sx - a[0]) * dx + (sy - a[1]) * dy) / L2, 0, 1);
        if (Math.hypot(sx - (a[0] + tt * dx), sy - (a[1] + tt * dy)) < 0.4 / g) clash = true;
      }
      if (clash) break;
    }
    if (clash) continue;
    for (const o of spots) {
      if (o.pol !== pol) continue;
      if (Math.hypot(o.cx - sx, o.cy - sy) < 0.7 * Math.max(Math.sqrt(areaMm2 / Math.PI) / g, Math.sqrt(o.areaMm2 / Math.PI) / g)) { clash = true; break; }
    }
    if (clash) continue;
    spots.push({ ring, areaMm2, dE, pol, cx: sx, cy: sy });
  }
  return spots;
}

/* ------------------------------------------------------------------------------------------------------------------ mask and fill */

function stampLine(mask, w, h, pts, rad) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(0.5, rad * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const x = a[0] + (b[0] - a[0]) * (s / steps), y = a[1] + (b[1] - a[1]) * (s / steps);
      const x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(w - 1, Math.ceil(x + rad)), y0 = Math.max(0, Math.floor(y - rad)), y1 = Math.min(h - 1, Math.ceil(y + rad));
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) { const dx = xx + 0.5 - x, dy = yy + 0.5 - y; if (dx * dx + dy * dy <= rad * rad) mask[yy * w + xx] = 1; }
    }
  }
}

/** Even-odd fill of a ring, grown by `grow` pixels. */
function fillRing(mask, w, h, ring, grow) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of ring) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const ys = Math.max(0, Math.floor(y0 - grow)), ye = Math.min(h - 1, Math.ceil(y1 + grow));
  for (let y = ys; y <= ye; y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.floor(xs[k] - grow)), xb = Math.min(w - 1, Math.ceil(xs[k + 1] + grow));
      for (let x = xa; x <= xb; x++) mask[y * w + x] = 1;
    }
  }
  // the outline itself, so a thin ring is covered too
  stampLine(mask, w, h, [...ring, ring[0]], grow);
}

/**
 * The picture with the masked pixels filled from what is round them (what the colour layer should see): working inward from the unmasked
 * pixels, breadth first, each masked pixel takes the mean of the neighbours (8 round it) that are already known. Smooth, no mosaic, and a
 * thin line closes with the colour on both sides of it.
 */
export function fillMask(rgb, w, h, mask) {
  const out = new Uint8ClampedArray(rgb);
  const known = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qh = 0, qt = 0, left = 0;
  for (let i = 0; i < w * h; i++) known[i] = mask[i] ? 0 : 1;
  for (let i = 0; i < w * h; i++) if (!known[i]) left++;
  if (left === w * h) return out; // everything masked: nothing to learn from
  const seen = new Uint8Array(w * h);
  const push = (p) => { if (!seen[p] && !known[p]) { seen[p] = 1; queue[qt++] = p; } };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (!known[p]) continue;
    if ((x > 0 && !known[p - 1]) || (x < w - 1 && !known[p + 1]) || (y > 0 && !known[p - w]) || (y < h - 1 && !known[p + w])) {
      if (x > 0) push(p - 1); if (x < w - 1) push(p + 1); if (y > 0) push(p - w); if (y < h - 1) push(p + w);
    }
  }
  while (qh < qt) {
    const p = queue[qh++], x = p % w, y = (p / w) | 0;
    let r = 0, g = 0, b = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const q = yy * w + xx;
      if (known[q]) { const o = q * 3; r += out[o]; g += out[o + 1]; b += out[o + 2]; c++; }
    }
    if (c) { const o = p * 3; out[o] = r / c; out[o + 1] = g / c; out[o + 2] = b / c; }
    known[p] = 1;
    if (x > 0) push(p - 1); if (x < w - 1) push(p + 1); if (y > 0) push(p - w); if (y < h - 1) push(p + w);
  }
  return out;
}

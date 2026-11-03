/**
 * Helpers for pictures that are not flat-colour logos: telling the kinds of picture apart, and flattening a photo into
 * paint-like patches before its colours are found.
 *
 *   detectKind(rgb, w, h)   -> { kind: "logo" | "art" | "photo", err4, err8 }
 *   kuwahara(rgb, w, h, r)  -> a copy in which every pixel takes the average of the calmest of the four squares around it
 *
 * All pictures are the tracer's working copy: 3 bytes per pixel (Uint8ClampedArray), row after row.
 */
import { rgbToLab } from "./color.js";

/**
 * How well do a few flat colours describe the picture? Takes up to `maxPx` pixels, finds K colours in CIELAB (farthest
 * point seeding, then Lloyd) and reports the average distance (delta-E) of the pixels to their nearest colour. A logo
 * has a handful of exact colours (error near 0); artwork with soft shading a little more; a photograph is made of
 * gradients and no few colours describe it.
 */
function quantError(rgb, w, h, K, maxPx, flatTol = -1) {
  const n = w * h;
  const stride = Math.max(1, Math.round(Math.sqrt(n / maxPx)));
  const pts = [];
  const lab = new Float64Array(3);
  let seen = 0;
  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      const p = (y * w + x) * 3;
      seen++;
      if (flatTol >= 0) {
        // only flat pixels (all four neighbours within flatTol in every channel): the soft edges of anti-aliasing and the noise
        // of JPEG round a flat colour must not count as "more than a few colours"
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
        let flat = true;
        for (const q of [p - 3, p + 3, p - w * 3, p + w * 3]) {
          if (Math.abs(rgb[q] - rgb[p]) > flatTol || Math.abs(rgb[q + 1] - rgb[p + 1]) > flatTol || Math.abs(rgb[q + 2] - rgb[p + 2]) > flatTol) { flat = false; break; }
        }
        if (!flat) continue;
      }
      rgbToLab(rgb[p], rgb[p + 1], rgb[p + 2], lab, 0);
      pts.push(lab[0], lab[1], lab[2]);
    }
  }
  const m = pts.length / 3;
  quantError.last = { m, share: seen ? m / seen : 0 };
  if (m === 0) return 0;
  const cen = new Float64Array(K * 3);
  const d2 = new Float64Array(m).fill(Infinity);
  let k0 = 0;
  cen[0] = pts[0]; cen[1] = pts[1]; cen[2] = pts[2];
  let have = 1;
  while (have < K) {
    let bi = 0;
    let bd = -1;
    const lx = cen[(have - 1) * 3], ly = cen[(have - 1) * 3 + 1], lz = cen[(have - 1) * 3 + 2];
    for (let i = 0; i < m; i++) {
      const d = (pts[i * 3] - lx) ** 2 + (pts[i * 3 + 1] - ly) ** 2 + (pts[i * 3 + 2] - lz) ** 2;
      if (d < d2[i]) d2[i] = d;
      if (d2[i] > bd) { bd = d2[i]; bi = i; }
    }
    if (bd <= 1e-9) break;
    cen[have * 3] = pts[bi * 3]; cen[have * 3 + 1] = pts[bi * 3 + 1]; cen[have * 3 + 2] = pts[bi * 3 + 2];
    have++;
  }
  void k0;
  const sums = new Float64Array(have * 4);
  for (let it = 0; it < 10; it++) {
    sums.fill(0);
    for (let i = 0; i < m; i++) {
      let bk = 0;
      let bd = Infinity;
      for (let k = 0; k < have; k++) {
        const d = (pts[i * 3] - cen[k * 3]) ** 2 + (pts[i * 3 + 1] - cen[k * 3 + 1]) ** 2 + (pts[i * 3 + 2] - cen[k * 3 + 2]) ** 2;
        if (d < bd) { bd = d; bk = k; }
      }
      sums[bk * 4] += pts[i * 3]; sums[bk * 4 + 1] += pts[i * 3 + 1]; sums[bk * 4 + 2] += pts[i * 3 + 2]; sums[bk * 4 + 3]++;
    }
    for (let k = 0; k < have; k++) if (sums[k * 4 + 3] > 0) { cen[k * 3] = sums[k * 4] / sums[k * 4 + 3]; cen[k * 3 + 1] = sums[k * 4 + 1] / sums[k * 4 + 3]; cen[k * 3 + 2] = sums[k * 4 + 2] / sums[k * 4 + 3]; }
  }
  let total = 0;
  for (let i = 0; i < m; i++) {
    let bd = Infinity;
    for (let k = 0; k < have; k++) {
      const d = (pts[i * 3] - cen[k * 3]) ** 2 + (pts[i * 3 + 1] - cen[k * 3 + 1]) ** 2 + (pts[i * 3 + 2] - cen[k * 3 + 2]) ** 2;
      if (d < bd) bd = d;
    }
    total += Math.sqrt(bd);
  }
  return total / m;
}

/**
 * Which kind of picture is this? How well do 16 colours describe the picture's FLAT pixels (edges left out, so lettering and
 * JPEG noise do not count, and so a flat picture of a dozen colours is still flat): "logo" under 0.9 (flat colours, however many
 * up to 16, however noisy a JPEG); "art" under 1.5 (drawn or painted with soft shading); "photo" above (gradients, texture, a
 * smooth sky). A picture with too few flat pixels to judge (noise everywhere, or tiny) is judged by how well 8 colours describe
 * all of it (1.5 and 3.5).
 */
export function detectKind(rgb, w, h) {
  const err4 = quantError(rgb, w, h, 4, 30000);
  const err8 = quantError(rgb, w, h, 8, 30000);
  // The flat pixels of a lightly blurred copy: the noise of a JPEG is different from pixel to pixel and a 3 x 3 blur takes most
  // of it away, a gradient is not touched by it.
  const flat16 = quantError(boxBlur3(rgb, w, h), w, h, 16, 20000, 8);
  const { m, share } = quantError.last;
  const judged = m >= 200 && share >= 0.03;
  const kind = judged ? (flat16 < 0.9 ? "logo" : flat16 < 1.5 ? "art" : "photo") : err8 < 1.5 ? "logo" : err8 < 3.5 ? "art" : "photo";
  return { kind, err4, err8, flat16: judged ? flat16 : null };
}

/** A 3 x 3 box blur of a working picture (the picture edge counts only the pixels there are). */
function boxBlur3(rgb, w, h) {
  const out = new Uint8ClampedArray(rgb.length);
  for (let y = 0; y < h; y++) {
    const y0 = y > 0 ? y - 1 : 0, y1 = y < h - 1 ? y + 1 : h - 1;
    for (let x = 0; x < w; x++) {
      const x0 = x > 0 ? x - 1 : 0, x1 = x < w - 1 ? x + 1 : w - 1;
      const n = (y1 - y0 + 1) * (x1 - x0 + 1);
      let r = 0, g = 0, b = 0;
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) { const p = (yy * w + xx) * 3; r += rgb[p]; g += rgb[p + 1]; b += rgb[p + 2]; }
      const o = (y * w + x) * 3;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  return out;
}

/**
 * Put back what the Kuwahara filter took away. It paints every pixel with the average of the calmest square round it, which erases a line a pixel or
 * two wide (a lash, a hair, a twig, a whisker): such a pixel is far from the smoothed picture. Where the original and the smoothed picture differ by more than
 * `tau` (luminance, 0 to 255) the original pixel is kept. The label cleaning then decides which of these pixels are lines worth keeping.
 */
export function restoreThin(orig, smooth, w, h, tau, maxShare = 0.035) {
  const out = new Uint8ClampedArray(smooth);
  const n = w * h;
  const diff = new Uint8Array(n);
  const hist = new Float64Array(256);
  for (let i = 0; i < n; i++) {
    const p = i * 3;
    const signed = 0.299 * (orig[p] - smooth[p]) + 0.587 * (orig[p + 1] - smooth[p + 1]) + 0.114 * (orig[p + 2] - smooth[p + 2]);
    // a dark line on anything (lash, hair, twig) counts; a light line only on a dark ground (a whisker on black fur): the glints on skin are noise
    const luma = 0.299 * smooth[p] + 0.587 * smooth[p + 1] + 0.114 * smooth[p + 2];
    const d = signed < 0 || luma < 110 ? Math.min(255, Math.round(Math.abs(signed))) : 0;
    diff[i] = d;
    hist[d]++;
  }
  // a picture that is all lines and texture (a twig network, bark, fur) would be given back whole: only the strongest few per cent are restored
  let cut = Math.round(tau);
  let above = 0;
  for (let v = 255; v > cut; v--) above += hist[v];
  while (cut < 255 && above > maxShare * n) { cut++; above -= hist[cut]; }
  for (let i = 0; i < n; i++) {
    if (diff[i] > cut) { const p = i * 3; out[p] = orig[p]; out[p + 1] = orig[p + 1]; out[p + 2] = orig[p + 2]; }
  }
  return out;
}

/**
 * Thin lines in a picture (a lash, a hair, a whisker, a twig, a crease) found straight from the luminance, not from the colour patches: a dark line is
 * what a closing of the luminance (the smallest square of `2 * r + 1` pixels that is wider than the line, dilated and eroded) fills in, a light line is
 * what an opening takes away. A pixel counts when it differs from that by more than `tau` (0 to 255); light lines only count on a dark ground (a whisker on
 * black fur: the glints on skin are noise). Pieces of 8-connected pixels are kept when they are long and thin (`minExtent` pixels, `minAspect` =
 * extent squared over pixel count) and the whole is held to the strongest `maxShare` of the picture.
 * Returns { dark, bright } as Uint8Array(w * h) of 0 / 1 plus `pieces`: [{ pixels: Int32Array, bright: boolean, count, extent }].
 */
export function thinLines(rgb, w, h, r, tau, minExtent, minAspect = 2.2, maxShare = 0.05, skip = null) {
  const n = w * h;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
  const pass = (src, isMax) => {
    const t = new Float32Array(n);
    const o = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let v = isMax ? -1e9 : 1e9;
        const a = x - r < 0 ? 0 : x - r, b = x + r >= w ? w - 1 : x + r;
        for (let k = a; k <= b; k++) { const q = src[row + k]; if (isMax ? q > v : q < v) v = q; }
        t[row + x] = v;
      }
    }
    for (let y = 0; y < h; y++) {
      const a = y - r < 0 ? 0 : y - r, b = y + r >= h ? h - 1 : y + r;
      for (let x = 0; x < w; x++) {
        let v = isMax ? -1e9 : 1e9;
        for (let k = a; k <= b; k++) { const q = t[k * w + x]; if (isMax ? q > v : q < v) v = q; }
        o[y * w + x] = v;
      }
    }
    return o;
  };
  const closing = pass(pass(L, true), false);
  const opening = pass(pass(L, false), true);
  const dk = new Float32Array(n), br = new Float32Array(n);
  const hist = new Float64Array(256);
  for (let i = 0; i < n; i++) {
    dk[i] = closing[i] - L[i];
    br[i] = opening[i] < 110 ? L[i] - opening[i] : 0;
    if (skip && skip[i]) { dk[i] = 0; br[i] = 0; } // (the see-through part of a picture has only copied colours: no lines there)
    const v = Math.min(255, Math.round(Math.max(dk[i], br[i])));
    hist[v]++;
  }
  // only the strongest few per cent of a picture that is all lines and texture (bark, fur)
  let cut = Math.round(tau);
  let above = 0;
  for (let v = 255; v > cut; v--) above += hist[v];
  while (cut < 255 && above > maxShare * n) { cut++; above -= hist[cut]; }
  const mask = new Uint8Array(n); // 1 dark line pixel, 2 light line pixel
  for (let i = 0; i < n; i++) mask[i] = dk[i] > cut ? 1 : br[i] > cut ? 2 : 0;
  // 8-connected pieces of one kind
  const parent = new Int32Array(n + 1);
  const comp = new Int32Array(n);
  let next = 1;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) { if (a < b) parent[b] = a; else parent[a] = b; } };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const m = mask[i];
      if (!m) continue;
      let c = 0;
      const tryN = (j) => { if (mask[j] === m && comp[j]) { if (!c) c = comp[j]; else join(c, comp[j]); } };
      if (x > 0) tryN(i - 1);
      if (y > 0) { tryN(i - w); if (x > 0) tryN(i - w - 1); if (x < w - 1) tryN(i - w + 1); }
      if (!c) { parent[next] = next; c = next++; }
      comp[i] = c;
    }
  }
  const info = new Map();
  for (let i = 0; i < n; i++) {
    if (!comp[i]) continue;
    const c = find(comp[i]);
    let e = info.get(c);
    const x = i % w, y = (i - x) / w;
    if (!e) { e = { x0: x, x1: x, y0: y, y1: y, count: 0, bright: mask[i] === 2, first: [] }; info.set(c, e); }
    e.count++;
    if (x < e.x0) e.x0 = x; if (x > e.x1) e.x1 = x; if (y < e.y0) e.y0 = y; if (y > e.y1) e.y1 = y;
    e.first.push(i);
  }
  const pieces = [];
  for (const e of info.values()) {
    const ext = Math.max(e.x1 - e.x0 + 1, e.y1 - e.y0 + 1);
    if (ext < minExtent || (ext * ext) / e.count < minAspect) continue;
    pieces.push({ pixels: Int32Array.from(e.first), bright: e.bright, count: e.count, extent: ext });
  }
  return { pieces, cut };
}

/**
 * Kuwahara filter: the picture painted in flat patches that keep their edges. Around each pixel are four overlapping
 * squares (r + 1 pixels a side) that all contain it; the pixel takes the average colour of the square whose brightness
 * varies least, so it never averages across an edge. Uses sums over squares (integral images), so the cost does not grow
 * with r. The picture edge is extended by repeating the outermost pixels.
 */
export function kuwahara(rgb, w, h, r) {
  if (r < 1) return rgb;
  const pw = w + 2 * r;
  const ph = h + 2 * r;
  const W = pw + 1; // integral images have one extra row and column of zeros
  const sr = new Float64Array(W * (ph + 1));
  const sg = new Float64Array(W * (ph + 1));
  const sb = new Float64Array(W * (ph + 1));
  const sl = new Float64Array(W * (ph + 1));
  const sq = new Float64Array(W * (ph + 1));
  for (let y = 0; y < ph; y++) {
    const yy = Math.min(h - 1, Math.max(0, y - r));
    let rr = 0, gg = 0, bb = 0, ll = 0, qq = 0;
    for (let x = 0; x < pw; x++) {
      const xx = Math.min(w - 1, Math.max(0, x - r));
      const p = (yy * w + xx) * 3;
      const R = rgb[p], G = rgb[p + 1], B = rgb[p + 2];
      const L = 0.299 * R + 0.587 * G + 0.114 * B;
      rr += R; gg += G; bb += B; ll += L; qq += L * L;
      const i = (y + 1) * W + (x + 1);
      const up = y * W + (x + 1);
      sr[i] = sr[up] + rr; sg[i] = sg[up] + gg; sb[i] = sb[up] + bb; sl[i] = sl[up] + ll; sq[i] = sq[up] + qq;
    }
  }
  const out = new Uint8ClampedArray(rgb.length);
  const side = r + 1;
  const area = side * side;
  // square with top-left (x0, y0) in padded coordinates, `side` pixels a side
  const box = (a, x0, y0) => a[(y0 + side) * W + (x0 + side)] - a[y0 * W + (x0 + side)] - a[(y0 + side) * W + x0] + a[y0 * W + x0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // padded position of this pixel is (x + r, y + r); the four squares have it as a corner
      const cx = x + r, cy = y + r;
      let bestVar = Infinity, br = 0, bg = 0, bbv = 0;
      for (let q = 0; q < 4; q++) {
        const x0 = q & 1 ? cx : cx - r;
        const y0 = q & 2 ? cy : cy - r;
        const ml = box(sl, x0, y0) / area;
        const v = box(sq, x0, y0) / area - ml * ml;
        if (v < bestVar) { bestVar = v; br = box(sr, x0, y0) / area; bg = box(sg, x0, y0) / area; bbv = box(sb, x0, y0) / area; }
      }
      const p = (y * w + x) * 3;
      out[p] = br; out[p + 1] = bg; out[p + 2] = bbv;
    }
  }
  return out;
}

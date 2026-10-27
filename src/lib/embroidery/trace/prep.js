/**
 * Preparing the picture for tracing: shrink very large pictures, turn transparency into a mask plus honest colours,
 * and take the noise (JPEG blocks, grain) out without softening real edges.
 *
 * Pixel (i, j) covers the square [i, i + 1) x [j, j + 1); its centre is (i + 0.5, j + 0.5).
 */

/** A pixel with alpha under this share of 255 counts as "not there" (the 40 % rule of the brief). */
export const ALPHA_CUT = 0.4;

/**
 * Area-average a picture down to `dw` x `dh` (premultiplied, so see-through pixels do not tint their neighbours).
 * `src` is RGBA bytes. Returns RGBA bytes.
 */
export function boxDownscale(src, sw, sh, dw, dh) {
  const out = new Uint8ClampedArray(dw * dh * 4);
  const fx = sw / dw;
  const fy = sh / dh;
  const x0 = new Int32Array(dw);
  const x1 = new Int32Array(dw);
  const wxs = [];
  for (let dx = 0; dx < dw; dx++) {
    const a = dx * fx;
    const b = (dx + 1) * fx;
    const i0 = Math.floor(a);
    const i1 = Math.min(sw - 1, Math.ceil(b) - 1);
    x0[dx] = i0;
    x1[dx] = i1;
    const w = new Float32Array(i1 - i0 + 1);
    for (let i = i0; i <= i1; i++) w[i - i0] = Math.min(b, i + 1) - Math.max(a, i);
    wxs.push(w);
  }
  const rowR = new Float64Array(dw);
  const rowG = new Float64Array(dw);
  const rowB = new Float64Array(dw);
  const rowA = new Float64Array(dw);
  const rowW = new Float64Array(dw);
  for (let dy = 0; dy < dh; dy++) {
    const a = dy * fy;
    const b = (dy + 1) * fy;
    const j0 = Math.floor(a);
    const j1 = Math.min(sh - 1, Math.ceil(b) - 1);
    rowR.fill(0); rowG.fill(0); rowB.fill(0); rowA.fill(0); rowW.fill(0);
    for (let j = j0; j <= j1; j++) {
      const wy = Math.min(b, j + 1) - Math.max(a, j);
      const base = j * sw * 4;
      for (let dx = 0; dx < dw; dx++) {
        const w = wxs[dx];
        const i0 = x0[dx];
        let sr = 0, sg = 0, sb = 0, sa = 0, sww = 0;
        for (let k = 0; k < w.length; k++) {
          const p = base + (i0 + k) * 4;
          const al = src[p + 3];
          const ww = w[k];
          sww += ww;
          sa += al * ww;
          const wa = al * ww;
          sr += src[p] * wa;
          sg += src[p + 1] * wa;
          sb += src[p + 2] * wa;
        }
        rowR[dx] += sr * wy;
        rowG[dx] += sg * wy;
        rowB[dx] += sb * wy;
        rowA[dx] += sa * wy;
        rowW[dx] += sww * wy;
      }
    }
    for (let dx = 0; dx < dw; dx++) {
      const o = (dy * dw + dx) * 4;
      const aSum = rowA[dx];
      if (aSum > 0) {
        out[o] = rowR[dx] / aSum;
        out[o + 1] = rowG[dx] / aSum;
        out[o + 2] = rowB[dx] / aSum;
      }
      out[o + 3] = aSum / rowW[dx];
    }
  }
  return out;
}

/**
 * Take an RGBA picture (maybe shrunk to `maxSide` on its long side) and return the working copy:
 *  - `rgb`: 3 bytes per pixel. When the picture has real transparency, see-through pixels take the colour of the nearest
 *    solid pixel and half-see-through ones are blended over that neighbour (never over black or white).
 *  - `cov`: alpha bytes when the picture has real transparency, else null.
 */
export function prepare(image, maxSide) {
  const srcW = image.width;
  const srcH = image.height;
  let w = srcW;
  let h = srcH;
  let rgba = image.data;
  const longSide = Math.max(srcW, srcH);
  if (longSide > maxSide) {
    const k = maxSide / longSide;
    w = Math.max(1, Math.round(srcW * k));
    h = Math.max(1, Math.round(srcH * k));
    rgba = boxDownscale(image.data, srcW, srcH, w, h);
  }
  const n = w * h;
  const rgb = new Uint8ClampedArray(n * 3);
  const cutByte = Math.round(255 * ALPHA_CUT);
  let clear = 0;
  for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] < cutByte) clear++;
  const hasAlpha = clear >= Math.max(1, n * 0.0005);
  let cov = null;
  if (!hasAlpha) {
    for (let i = 0, p = 0, q = 0; i < n; i++, p += 4, q += 3) {
      rgb[q] = rgba[p];
      rgb[q + 1] = rgba[p + 1];
      rgb[q + 2] = rgba[p + 2];
    }
  } else {
    cov = new Uint8Array(n);
    for (let i = 0; i < n; i++) cov[i] = rgba[i * 4 + 3];
    const near = new Int32Array(n).fill(-1);
    const queue = new Int32Array(n);
    let qh = 0;
    let qt = 0;
    let remaining = 0;
    for (let i = 0; i < n; i++) {
      if (cov[i] >= 250) {
        near[i] = i;
        queue[qt++] = i;
      } else remaining++;
    }
    if (qt === 0) {
      // nothing is solid: use the straight colours as they are
      for (let i = 0, p = 0, q = 0; i < n; i++, p += 4, q += 3) {
        rgb[q] = rgba[p];
        rgb[q + 1] = rgba[p + 1];
        rgb[q + 2] = rgba[p + 2];
      }
    } else {
      while (qh < qt && remaining > 0) {
        const p = queue[qh++];
        const x = p % w;
        const y = (p - x) / w;
        const src = near[p];
        if (x > 0 && near[p - 1] < 0) { near[p - 1] = src; queue[qt++] = p - 1; remaining--; }
        if (x < w - 1 && near[p + 1] < 0) { near[p + 1] = src; queue[qt++] = p + 1; remaining--; }
        if (y > 0 && near[p - w] < 0) { near[p - w] = src; queue[qt++] = p - w; remaining--; }
        if (y < h - 1 && near[p + w] < 0) { near[p + w] = src; queue[qt++] = p + w; remaining--; }
      }
      for (let i = 0, q = 0; i < n; i++, q += 3) {
        const a = cov[i];
        const s = near[i];
        if (a >= 250) {
          rgb[q] = rgba[i * 4];
          rgb[q + 1] = rgba[i * 4 + 1];
          rgb[q + 2] = rgba[i * 4 + 2];
        } else if (a < cutByte) {
          rgb[q] = rgba[s * 4];
          rgb[q + 1] = rgba[s * 4 + 1];
          rgb[q + 2] = rgba[s * 4 + 2];
        } else {
          const k = a / 255;
          rgb[q] = rgba[i * 4] * k + rgba[s * 4] * (1 - k);
          rgb[q + 1] = rgba[i * 4 + 1] * k + rgba[s * 4 + 1] * (1 - k);
          rgb[q + 2] = rgba[i * 4 + 2] * k + rgba[s * 4 + 2] * (1 - k);
        }
      }
    }
  }
  return { w, h, srcW, srcH, sx: srcW / w, sy: srcH / h, rgb, cov, hasAlpha };
}

/**
 * How noisy is the picture? Looks at neighbouring pixel pairs: in a clean picture nearly all of them are exactly equal
 * and the rest are real edges (big differences). Noise shows as many pairs that differ by a little (1 to 12 levels).
 * Returns { fraction, mean }: the share of pairs that differ by 1..12 and their average difference.
 */
export function estimateNoise(rgb, w, h) {
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 150000)));
  let pairs = 0;
  let small = 0;
  let sum = 0;
  const row = w * 3;
  for (let y = 0; y < h - 1; y += step) {
    for (let x = 0; x < w - 1; x += step) {
      const p = y * row + x * 3;
      for (let k = 0; k < 2; k++) {
        const q = k === 0 ? p + 3 : p + row;
        let d = rgb[p] - rgb[q];
        if (d < 0) d = -d;
        let t = rgb[p + 1] - rgb[q + 1];
        if (t < 0) t = -t;
        if (t > d) d = t;
        t = rgb[p + 2] - rgb[q + 2];
        if (t < 0) t = -t;
        if (t > d) d = t;
        pairs++;
        if (d > 0 && d <= 12) { small++; sum += d; }
      }
    }
  }
  if (pairs === 0) return { fraction: 0, mean: 0 };
  return { fraction: small / pairs, mean: small ? sum / small : 0 };
}

/**
 * Edge-preserving smoothing (a "sigma filter"): every pixel becomes the average of the neighbours in its 3 x 3 square
 * that are within `tol` (largest channel difference) of it. Noise inside flat colour is averaged away, while a real
 * edge or an anti-aliasing ramp keeps its shape, because the pixels on the other side are too different to join in.
 * Returns a new array; `src` is not changed.
 */
export function sigmaFilter(src, w, h, tol) {
  const out = new Uint8ClampedArray(src.length);
  const row = w * 3;
  const inv = new Float64Array(10);
  for (let i = 1; i < 10; i++) inv[i] = 1 / i;
  const clamped = (p, x, y) => {
    const cr = src[p];
    const cg = src[p + 1];
    const cb = src[p + 2];
    let sr = cr, sg = cg, sb = cb, cnt = 1;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if ((dx === 0 && dy === 0) || xx < 0 || xx >= w) continue;
        const o = yy * row + xx * 3;
        const r = src[o], g = src[o + 1], b = src[o + 2];
        if (Math.abs(r - cr) <= tol && Math.abs(g - cg) <= tol && Math.abs(b - cb) <= tol) { sr += r; sg += g; sb += b; cnt++; }
      }
    }
    out[p] = sr / cnt;
    out[p + 1] = sg / cnt;
    out[p + 2] = sb / cnt;
  };
  for (let x = 0; x < w; x++) { clamped(x * 3, x, 0); if (h > 1) clamped((h - 1) * row + x * 3, x, h - 1); }
  for (let y = 1; y < h - 1; y++) { clamped(y * row, 0, y); if (w > 1) clamped(y * row + (w - 1) * 3, w - 1, y); }
  let o = 0, r = 0, g = 0, b = 0, d = 0;
  for (let y = 1; y < h - 1; y++) {
    let p = y * row + 3;
    for (let x = 1; x < w - 1; x++, p += 3) {
      const cr = src[p];
      const cg = src[p + 1];
      const cb = src[p + 2];
      let sr = cr, sg = cg, sb = cb, cnt = 1;
      o = p + (-row - 3);
      r = src[o]; d = r - cr; if (d < 0) d = -d;
      if (d <= tol) {
        g = src[o + 1]; d = g - cg; if (d < 0) d = -d;
        if (d <= tol) {
          b = src[o + 2]; d = b - cb; if (d < 0) d = -d;
          if (d <= tol) { sr += r; sg += g; sb += b; cnt++; }
        }
      }
      o = p + (-row);
      r = src[o]; d = r - cr; if (d < 0) d = -d;
      if (d <= tol) {
        g = src[o + 1]; d = g - cg; if (d < 0) d = -d;
        if (d <= tol) {
          b = src[o + 2]; d = b - cb; if (d < 0) d = -d;
          if (d <= tol) { sr += r; sg += g; sb += b; cnt++; }
        }
      }
      o = p + (-row + 3);
      r = src[o]; d = r - cr; if (d < 0) d = -d;
      if (d <= tol) {
        g = src[o + 1]; d = g - cg; if (d < 0) d = -d;
        if (d <= tol) {
          b = src[o + 2]; d = b - cb; if (d < 0) d = -d;
          if (d <= tol) { sr += r; sg += g; sb += b; cnt++; }
        }
      }
      o = p + (-3);
      r = src[o]; d = r - cr; if (d < 0) d = -d;
      if (d <= tol) {
        g = src[o + 1]; d = g - cg; if (d < 0) d = -d;
        if (d <= tol) {
          b = src[o + 2]; d = b - cb; if (d < 0) d = -d;
          if (d <= tol) { sr += r; sg += g; sb += b; cnt++; }
        }
      }
      o = p + (3);
      r = src[o]; d = r - cr; if (d < 0) d = -d;
      if (d <= tol) {
        g = src[o + 1]; d = g - cg; if (d < 0) d = -d;
        if (d <= tol) {
          b = src[o + 2]; d = b - cb; if (d < 0) d = -d;
          if (d <= tol) { sr += r; sg += g; sb += b; cnt++; }
        }
      }
      o = p + (row - 3);
      r = src[o]; d = r - cr; if (d < 0) d = -d;
      if (d <= tol) {
        g = src[o + 1]; d = g - cg; if (d < 0) d = -d;
        if (d <= tol) {
          b = src[o + 2]; d = b - cb; if (d < 0) d = -d;
          if (d <= tol) { sr += r; sg += g; sb += b; cnt++; }
        }
      }
      o = p + (row);
      r = src[o]; d = r - cr; if (d < 0) d = -d;
      if (d <= tol) {
        g = src[o + 1]; d = g - cg; if (d < 0) d = -d;
        if (d <= tol) {
          b = src[o + 2]; d = b - cb; if (d < 0) d = -d;
          if (d <= tol) { sr += r; sg += g; sb += b; cnt++; }
        }
      }
      o = p + (row + 3);
      r = src[o]; d = r - cr; if (d < 0) d = -d;
      if (d <= tol) {
        g = src[o + 1]; d = g - cg; if (d < 0) d = -d;
        if (d <= tol) {
          b = src[o + 2]; d = b - cb; if (d < 0) d = -d;
          if (d <= tol) { sr += r; sg += g; sb += b; cnt++; }
        }
      }
      const k = inv[cnt];
      out[p] = sr * k;
      out[p + 1] = sg * k;
      out[p + 2] = sb * k;
    }
  }
  return out;
}

/**
 * Denoise the working picture when it needs it. A clean picture is returned untouched (same array).
 * Returns { rgb, noise, passes, tol }.
 */
export function denoise(rgb, w, h) {
  const noise = estimateNoise(rgb, w, h);
  if (noise.fraction < 0.02) return { rgb, noise, passes: 0, tol: 0 };
  const tol = Math.max(8, Math.min(24, Math.round(6 + 2.5 * noise.mean)));
  let cur = sigmaFilter(rgb, w, h, tol);
  let passes = 1;
  if (noise.fraction > 0.08) {
    cur = sigmaFilter(cur, w, h, tol);
    passes = 2;
  }
  return { rgb: cur, noise, passes, tol };
}

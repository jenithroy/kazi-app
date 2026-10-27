/**
 * Painting a trace back into pixels: how the tests (and a quick preview) compare the vector result with the source.
 * Shapes are painted in the sewing order, one flat palette colour each, on a transparent picture. A pixel is painted
 * when its centre is inside the shape (outer contour minus holes), so edges are crisp (not anti-aliased).
 */

/**
 * result: what traceImage returns. scale: output pixels per source pixel (default 1).
 * Returns { width, height, data } with `data` a Uint8ClampedArray of RGBA.
 */
export function renderTrace(result, scale = 1) {
  const W = Math.max(1, Math.round(result.width * scale));
  const H = Math.max(1, Math.round(result.height * scale));
  const data = new Uint8ClampedArray(W * H * 4);
  const order = result.order && result.order.length ? result.order : result.palette.map((_, i) => i);
  for (const ci of order) {
    const col = result.palette[ci];
    if (!col) continue;
    for (const shape of result.shapes) {
      if (shape.color !== ci) continue;
      fillShape(data, W, H, shape.contours, scale, col.r, col.g, col.b);
    }
  }
  return { width: W, height: H, data };
}

/** Even-odd scanline fill of a set of closed contours (outer + holes) with a flat colour. */
function fillShape(data, W, H, contours, scale, r, g, b) {
  // edges as [x0, y0, x1, y1] with y0 < y1 (horizontal edges are skipped)
  let count = 0;
  for (const c of contours) count += c.length;
  const ex0 = new Float64Array(count);
  const ey0 = new Float64Array(count);
  const ex1 = new Float64Array(count);
  const ey1 = new Float64Array(count);
  let ne = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of contours) {
    const n = c.length;
    for (let i = 0; i < n; i++) {
      const a = c[i];
      const bb = c[(i + 1) % n];
      let x0 = a[0] * scale, y0 = a[1] * scale, x1 = bb[0] * scale, y1 = bb[1] * scale;
      if (y0 === y1) continue;
      if (y0 > y1) { const tx = x0, ty = y0; x0 = x1; y0 = y1; x1 = tx; y1 = ty; }
      ex0[ne] = x0; ey0[ne] = y0; ex1[ne] = x1; ey1[ne] = y1; ne++;
      if (y0 < minY) minY = y0;
      if (y1 > maxY) maxY = y1;
    }
  }
  if (ne === 0) return;
  const rowStart = Math.max(0, Math.ceil(minY - 0.5));
  const rowEnd = Math.min(H - 1, Math.ceil(maxY - 0.5) - 1);
  // bucket edges by the first row they cross
  const first = new Int32Array(ne);
  const bucketCount = new Int32Array(rowEnd - rowStart + 2);
  for (let e = 0; e < ne; e++) {
    let row = Math.ceil(ey0[e] - 0.5);
    if (row < rowStart) row = rowStart;
    first[e] = row;
    if (row <= rowEnd) bucketCount[row - rowStart + 1]++;
  }
  for (let i = 1; i < bucketCount.length; i++) bucketCount[i] += bucketCount[i - 1];
  const byRow = new Int32Array(ne);
  const fillPos = bucketCount.slice();
  for (let e = 0; e < ne; e++) {
    if (first[e] > rowEnd) continue;
    byRow[fillPos[first[e] - rowStart]++] = e;
  }
  let active = [];
  const xs = [];
  for (let row = rowStart; row <= rowEnd; row++) {
    const yc = row + 0.5;
    for (let k = bucketCount[row - rowStart]; k < bucketCount[row - rowStart + 1]; k++) active.push(byRow[k]);
    xs.length = 0;
    const next = [];
    for (const e of active) {
      if (ey1[e] <= yc) continue;
      next.push(e);
      if (ey0[e] <= yc) xs.push(ex0[e] + ((yc - ey0[e]) * (ex1[e] - ex0[e])) / (ey1[e] - ey0[e]));
    }
    active = next;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
      const xb = Math.min(W - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
      for (let x = xa; x <= xb; x++) {
        const o = (row * W + x) * 4;
        data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
      }
    }
  }
}

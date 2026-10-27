/**
 * Turning the raw line of a chain (middles of pixel cracks) into a clean outline:
 *
 *   1. resample evenly, find the corners (sharp turns that happen within a pixel or two),
 *   2. smooth the stretches between corners with a filter that does not shrink curves (Taubin),
 *   3. put each corner exactly where the two straight-ish sides on either side of it meet, and each junction where the
 *      lines of all its chains meet (this is what keeps square corners square),
 *   4. drop points that do not matter (Ramer-Douglas-Peucker), then draw a smooth cubic curve through the points that
 *      are left and write it out as a polyline that is within a small tolerance of the curve.
 *
 * Straight sides come out as two points, circles as a modest number of points, and every corner is a point.
 * All numbers are image pixels of the working grid. Points are stored as flat Float64Array [x0, y0, x1, y1, ...].
 */

const H_STEP = 0.8; // spacing of the resampled points (pixels)

/** Resample a polyline at an even spacing. Open lines keep both end points; closed lines have no repeated point. */
export function resample(xy, n, closed, step = H_STEP) {
  let total = 0;
  const segs = closed ? n : n - 1;
  const cum = new Float64Array(segs + 1);
  for (let i = 0; i < segs; i++) {
    const j = closed && i === n - 1 ? 0 : i + 1;
    total += Math.hypot(xy[j * 2] - xy[i * 2], xy[j * 2 + 1] - xy[i * 2 + 1]);
    cum[i + 1] = total;
  }
  if (total < 1e-9) {
    const o = new Float64Array(closed ? 6 : 4);
    for (let k = 0; k < o.length / 2; k++) { o[k * 2] = xy[0]; o[k * 2 + 1] = xy[1]; }
    return { xy: o, n: o.length / 2 };
  }
  const count = closed ? Math.max(8, Math.round(total / step)) : Math.max(1, Math.round(total / step));
  const m = closed ? count : count + 1;
  const out = new Float64Array(m * 2);
  let seg = 0;
  for (let k = 0; k < m; k++) {
    const s = (k * total) / count;
    while (seg < segs - 1 && cum[seg + 1] < s) seg++;
    const j = closed && seg === n - 1 ? 0 : seg + 1;
    const len = cum[seg + 1] - cum[seg];
    const t = len > 1e-12 ? (s - cum[seg]) / len : 0;
    out[k * 2] = xy[seg * 2] + (xy[j * 2] - xy[seg * 2]) * t;
    out[k * 2 + 1] = xy[seg * 2 + 1] + (xy[j * 2 + 1] - xy[seg * 2 + 1]) * t;
  }
  if (!closed) {
    out[(m - 1) * 2] = xy[(n - 1) * 2];
    out[(m - 1) * 2 + 1] = xy[(n - 1) * 2 + 1];
  }
  return { xy: out, n: m };
}

/**
 * Taubin smoothing: alternate a shrinking and an inflating Laplacian step, so noise goes away and curves keep their
 * size. Open lines keep their end points, unless `freeEnds` is set: then the ends are smoothed too (mirrored neighbours),
 * which stops a slightly wrong end point (the rounded pixel corner) from dragging the points next to it. Works in place.
 */
export function taubin(xy, n, closed, passes, lam = 0.5, mu = -0.5263, freeEnds = false) {
  if (n < 3 || passes <= 0) return;
  const tmp = new Float64Array(xy.length);
  const step = (src, dst, k) => {
    const first = closed || freeEnds ? 0 : 1;
    const last = closed || freeEnds ? n - 1 : n - 2;
    for (let i = first; i <= last; i++) {
      const a = i === 0 ? (closed ? n - 1 : 1) : i - 1;
      const b = i === n - 1 ? (closed ? 0 : n - 2) : i + 1;
      dst[i * 2] = src[i * 2] + k * (0.5 * (src[a * 2] + src[b * 2]) - src[i * 2]);
      dst[i * 2 + 1] = src[i * 2 + 1] + k * (0.5 * (src[a * 2 + 1] + src[b * 2 + 1]) - src[i * 2 + 1]);
    }
    if (!closed && !freeEnds) {
      dst[0] = src[0]; dst[1] = src[1];
      dst[(n - 1) * 2] = src[(n - 1) * 2]; dst[(n - 1) * 2 + 1] = src[(n - 1) * 2 + 1];
    }
  };
  for (let p = 0; p < passes; p++) {
    step(xy, tmp, lam);
    step(tmp, xy, mu);
  }
}

/** Signed turn (radians) at sample i between the chords back k samples and forward k samples. */
function turn(xy, n, closed, i, k) {
  let a = i - k;
  let b = i + k;
  if (closed) {
    a = ((a % n) + n) % n;
    b = b % n;
  } else {
    a = Math.max(0, a);
    b = Math.min(n - 1, b);
  }
  const ux = xy[i * 2] - xy[a * 2];
  const uy = xy[i * 2 + 1] - xy[a * 2 + 1];
  const vx = xy[b * 2] - xy[i * 2];
  const vy = xy[b * 2 + 1] - xy[i * 2 + 1];
  if (ux * ux + uy * uy < 1e-12 || vx * vx + vy * vy < 1e-12) return 0;
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}

/**
 * Gaussian smoothing of a polyline with `sigma` samples. Open lines are extended past their ends by point reflection
 * (so a straight line stays straight right up to its end). Returns a new array.
 */
export function gaussianSmooth(xy, n, closed, sigma) {
  const R = Math.min(Math.ceil(3 * sigma), closed ? Math.floor(n / 2) : n - 1);
  const wts = new Float64Array(2 * R + 1);
  let total = 0;
  for (let j = -R; j <= R; j++) { wts[j + R] = Math.exp(-(j * j) / (2 * sigma * sigma)); total += wts[j + R]; }
  for (let k = 0; k < wts.length; k++) wts[k] /= total;
  const out = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    let sx = 0;
    let sy = 0;
    for (let j = -R; j <= R; j++) {
      let k = i + j;
      let px;
      let py;
      if (closed) {
        k = ((k % n) + n) % n;
        px = xy[k * 2];
        py = xy[k * 2 + 1];
      } else if (k < 0) {
        px = 2 * xy[0] - xy[-k * 2];
        py = 2 * xy[1] - xy[-k * 2 + 1];
      } else if (k > n - 1) {
        const m = 2 * (n - 1) - k;
        px = 2 * xy[(n - 1) * 2] - xy[m * 2];
        py = 2 * xy[(n - 1) * 2 + 1] - xy[m * 2 + 1];
      } else {
        px = xy[k * 2];
        py = xy[k * 2 + 1];
      }
      const wj = wts[j + R];
      sx += px * wj;
      sy += py * wj;
    }
    out[i * 2] = sx;
    out[i * 2 + 1] = sy;
  }
  return out;
}

/**
 * Smooth harder where the line is nearly straight: blend `xy` (in place) toward a strongly smoothed copy by a weight
 * that is 1 where the strongly smoothed line turns by under about 3 degrees over 6 pixels either side and falls to 0
 * at about 11 degrees. This removes the slow wobble that JPEG blocks leave on straight and gently curved edges while
 * tight curves and small features keep the light smoothing. Not applied near the ends of an open piece.
 */
export function straightenWobble(xy, n, closed, step = H_STEP) {
  if (n < 10) return;
  const heavy = gaussianSmooth(xy, n, closed, 3);
  // what smoothing changes slowly along the line is a systematic shrink of curves, not wobble: leave that out
  const diff = new Float64Array(n * 2);
  for (let i = 0; i < n * 2; i++) diff[i] = heavy[i] - xy[i];
  const shrink = gaussianSmooth(diff, n, closed, 8);
  const kk = Math.max(2, Math.round(6 / step));
  const lo = 0.06;
  const hi = 0.2;
  for (let i = 0; i < n; i++) {
    let k = kk;
    if (!closed) k = Math.max(1, Math.min(kk, i, n - 1 - i));
    // near an open end take the straightness of the nearest sample that has a full window
    let c = i;
    if (!closed) c = Math.max(Math.min(kk, n - 1), Math.min(i, n - 1 - kk));
    if (!closed && n - 1 < 2 * kk) { c = i; }
    const kc = closed ? kk : Math.max(1, Math.min(kk, c, n - 1 - c));
    void k;
    const a = Math.abs(turn(heavy, n, closed, c, kc));
    let w = a <= lo ? 1 : a >= hi ? 0 : (hi - a) / (hi - lo);
    // not near the ends of an open piece: there the data is the rounded pixel corner, and the corner fit needs it as it is
    if (!closed) w *= Math.max(0, Math.min(1, (Math.min(i, n - 1 - i) - 5) / 6));
    if (w > 0) {
      xy[i * 2] += w * (diff[i * 2] - shrink[i * 2]);
      xy[i * 2 + 1] += w * (diff[i * 2 + 1] - shrink[i * 2 + 1]);
    }
  }
}

/**
 * Straight line through the points of a polyline that lie between arc lengths d1 and d2 away from sample i, going
 * forward (dir = 1) or backward (dir = -1). Returns { cx, cy, ux, uy } with (ux, uy) the direction of TRAVEL (increasing
 * sample index) along the line, or null when fewer than two samples fall in the window.
 */
function sideLine(xy, n, closed, i, dir, d1, d2) {
  const idx = [];
  let s = 0;
  let prev = i;
  for (let k = 1; k < n; k++) {
    let j = i + dir * k;
    if (closed) j = ((j % n) + n) % n;
    else if (j < 0 || j >= n) break;
    s += Math.hypot(xy[j * 2] - xy[prev * 2], xy[j * 2 + 1] - xy[prev * 2 + 1]);
    prev = j;
    if (s > d2) break;
    if (s >= d1) idx.push(j);
  }
  if (idx.length < 2) return null;
  let cx = 0, cy = 0;
  for (const j of idx) { cx += xy[j * 2]; cy += xy[j * 2 + 1]; }
  cx /= idx.length; cy /= idx.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const j of idx) {
    const dx = xy[j * 2] - cx;
    const dy = xy[j * 2 + 1] - cy;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let ux = Math.cos(th);
  let uy = Math.sin(th);
  // point the direction the way the sample index runs
  const first = idx[0];
  const last = idx[idx.length - 1];
  let ax = xy[last * 2] - xy[first * 2];
  let ay = xy[last * 2 + 1] - xy[first * 2 + 1];
  if (dir < 0) { ax = -ax; ay = -ay; }
  if (ux * ax + uy * ay < 0) { ux = -ux; uy = -uy; }
  return { cx, cy, ux, uy };
}

/**
 * Indices of corners: places where the outline changes direction by at least `minTurn` radians within a pixel or two.
 *
 * Candidates are found loosely (half of minTurn, measured between chords 1.6 pixels either side, which a rounded pixel
 * corner understates). Each candidate is then checked on the straight lines fitted to the 1.5 to 4.8 pixels before and
 * after it: the angle between those two lines is the real turn. A zigzag of pixel steps or a gentle curve fails the
 * check; a 45 degree corner passes it even though its pixels are rounded.
 * `xy` should be lightly smoothed already. For open lines the two ends are never reported (they are anchors anyway).
 */
export function findCorners(xy, n, closed, minTurn, step = H_STEP) {
  const k1 = Math.max(1, Math.round(1.6 / step));
  if (n < 2 * k1 + 2) return [];
  const loose = 0.5 * minTurn;
  const score = new Float64Array(n);
  const lo = closed ? 0 : k1;
  const hi = closed ? n - 1 : n - 1 - k1;
  for (let i = lo; i <= hi; i++) {
    const a1 = turn(xy, n, closed, i, k1);
    if (Math.abs(a1) >= loose) score[i] = Math.abs(a1);
  }
  // the sharpest sample of each run of candidates
  const peaks = [];
  for (let i = lo; i <= hi; i++) {
    if (score[i] === 0) continue;
    let best = true;
    for (let d = 1; d <= k1 && best; d++) {
      const a = closed ? (i - d + n) % n : i - d;
      const b = closed ? (i + d) % n : i + d;
      if (a >= 0 && (score[a] > score[i] || (score[a] === score[i] && a < i))) best = false;
      else if (b < n && score[b] > score[i]) best = false;
    }
    if (best) peaks.push(i);
  }
  // check every candidate on the lines either side of it
  const out = [];
  const turnOf = new Float64Array(n);
  for (const i of peaks) {
    const left = sideLine(xy, n, closed, i, -1, 1.5, 4.8);
    const right = sideLine(xy, n, closed, i, 1, 1.5, 4.8);
    let angle;
    if (left && right) angle = Math.abs(Math.atan2(left.ux * right.uy - left.uy * right.ux, left.ux * right.ux + left.uy * right.uy));
    else angle = score[i]; // too close to an end to fit lines: the chord angle has to be big by itself
    if (angle >= minTurn) { out.push(i); turnOf[i] = angle; }
  }
  // two corners closer than about 1.2 pixels are one corner: keep the sharper
  const gap = Math.round(1.2 / step) + 1;
  const merged = [];
  for (const i of out) {
    const last = merged[merged.length - 1];
    if (last !== undefined && i - last < gap) {
      if (turnOf[i] > turnOf[last]) merged[merged.length - 1] = i;
    } else merged.push(i);
  }
  if (closed && merged.length > 1) {
    const first = merged[0];
    const last = merged[merged.length - 1];
    if (first + n - last < gap) {
      if (turnOf[first] > turnOf[last]) merged.pop();
      else merged.shift();
    }
  }
  return merged;
}

/** Length of an open polyline. */
function pathLength(xy, n) {
  let s = 0;
  for (let i = 1; i < n; i++) s += Math.hypot(xy[i * 2] - xy[i * 2 - 2], xy[i * 2 + 1] - xy[i * 2 - 1]);
  return s;
}

/**
 * Straight line through the points of an open polyline that lie between arc lengths d1 and d2 from its first point
 * (or from its last point when atStart is false). Returns { cx, cy, ux, uy } with u pointing away from that end into
 * the line, or null when there are not enough points.
 */
export function fitEndLine(xy, n, atStart, d1, d2) {
  const idx = [];
  let s = 0;
  for (let k = 0; k < n; k++) {
    const i = atStart ? k : n - 1 - k;
    if (k > 0) {
      const j = atStart ? i - 1 : i + 1;
      s += Math.hypot(xy[i * 2] - xy[j * 2], xy[i * 2 + 1] - xy[j * 2 + 1]);
    }
    if (s > d2) break;
    if (s >= d1) idx.push(i);
  }
  if (idx.length < 2) return null;
  let cx = 0, cy = 0;
  for (const i of idx) { cx += xy[i * 2]; cy += xy[i * 2 + 1]; }
  cx /= idx.length; cy /= idx.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const i of idx) {
    const dx = xy[i * 2] - cx;
    const dy = xy[i * 2 + 1] - cy;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let ux = Math.cos(th);
  let uy = Math.sin(th);
  const far = idx[idx.length - 1];
  const near = idx[0];
  if ((xy[far * 2] - xy[near * 2]) * ux + (xy[far * 2 + 1] - xy[near * 2 + 1]) * uy < 0) { ux = -ux; uy = -uy; }
  return { cx, cy, ux, uy };
}

/** Where two fitted lines cross, or null when they are nearly parallel. */
export function intersectLines(a, b) {
  const den = a.ux * b.uy - a.uy * b.ux;
  if (Math.abs(den) < 0.3) return null;
  const t = ((b.cx - a.cx) * b.uy - (b.cy - a.cy) * b.ux) / den;
  return [a.cx + a.ux * t, a.cy + a.uy * t];
}

/**
 * Best single point for several lines (least squares), pulled gently toward `prior` so that nearly parallel lines
 * still give a sensible answer. Returns [x, y].
 */
export function meetPoint(lines, prior) {
  let a00 = 0.02, a01 = 0, a11 = 0.02, b0 = 0.02 * prior[0], b1 = 0.02 * prior[1];
  for (const l of lines) {
    const nx = -l.uy;
    const ny = l.ux;
    const d = nx * l.cx + ny * l.cy;
    a00 += nx * nx; a01 += nx * ny; a11 += ny * ny;
    b0 += nx * d; b1 += ny * d;
  }
  const det = a00 * a11 - a01 * a01;
  if (Math.abs(det) < 1e-9) return [prior[0], prior[1]];
  return [(b0 * a11 - b1 * a01) / det, (a00 * b1 - a01 * b0) / det];
}

/** Ramer-Douglas-Peucker on the open range [i0, i1] of a polyline: pushes the indices that stay, in order. */
function rdpRange(xy, i0, i1, eps, keep) {
  const stack = [i0, i1];
  const marks = new Uint8Array(xy.length / 2);
  marks[i0] = 1;
  marks[i1] = 1;
  while (stack.length) {
    const b = stack.pop();
    const a = stack.pop();
    if (b - a < 2) continue;
    const ax = xy[a * 2], ay = xy[a * 2 + 1];
    const dx = xy[b * 2] - ax, dy = xy[b * 2 + 1] - ay;
    const len = Math.hypot(dx, dy);
    let bestD = -1;
    let bestI = -1;
    for (let i = a + 1; i < b; i++) {
      const px = xy[i * 2] - ax, py = xy[i * 2 + 1] - ay;
      const d = len > 1e-12 ? Math.abs(px * dy - py * dx) / len : Math.hypot(px, py);
      if (d > bestD) { bestD = d; bestI = i; }
    }
    if (bestD > eps) {
      marks[bestI] = 1;
      stack.push(a, bestI, bestI, b);
    }
  }
  for (let i = i0; i <= i1; i++) if (marks[i]) keep.push(i);
}

/** Cubic Bezier flattened to points (not including the first point), written into `out`. */
function flattenBezier(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, eps, out, depth) {
  const dx = p3x - p0x;
  const dy = p3y - p0y;
  const len = Math.hypot(dx, dy);
  let d1, d2;
  if (len < 1e-12) {
    d1 = Math.hypot(p1x - p0x, p1y - p0y);
    d2 = Math.hypot(p2x - p0x, p2y - p0y);
  } else {
    d1 = Math.abs((p1x - p0x) * dy - (p1y - p0y) * dx) / len;
    d2 = Math.abs((p2x - p0x) * dy - (p2y - p0y) * dx) / len;
  }
  if (depth >= 12 || 0.75 * Math.max(d1, d2) <= eps) {
    out.push(p3x, p3y);
    return;
  }
  const m01x = (p0x + p1x) / 2, m01y = (p0y + p1y) / 2;
  const m12x = (p1x + p2x) / 2, m12y = (p1y + p2y) / 2;
  const m23x = (p2x + p3x) / 2, m23y = (p2y + p3y) / 2;
  const q0x = (m01x + m12x) / 2, q0y = (m01y + m12y) / 2;
  const q1x = (m12x + m23x) / 2, q1y = (m12y + m23y) / 2;
  const cx = (q0x + q1x) / 2, cy = (q0y + q1y) / 2;
  flattenBezier(p0x, p0y, m01x, m01y, q0x, q0y, cx, cy, eps, out, depth + 1);
  flattenBezier(cx, cy, q1x, q1y, m23x, m23y, p3x, p3y, eps, out, depth + 1);
}

/**
 * Draw a smooth curve through the m points `q` and return it as a polyline that is within `eps` of the curve.
 * Open: the first and last points are the ends. Closed: the points form a loop (no repeated first point).
 * Straight runs stay straight (no extra points). A point where the line turns sharply while its neighbours hardly turn
 * (a corner that was not detected) is not smoothed over: the curve keeps the corner instead of overshooting it.
 * `maxOffset` limits how far a control point of the curve may sit from its chord (a real arc between simplified points
 * needs about the simplify tolerance; more means the tangent is wrong, for example next to a short stub).
 */
export function smoothThrough(q, m, closed, eps, maxOffset = Infinity) {
  const out = [q[0], q[1]];
  if (m < 2) return out;
  const tx = new Float64Array(m);
  const ty = new Float64Array(m);
  const ux = new Float64Array(m); // unit chord from point i to point i + 1
  const uy = new Float64Array(m);
  const segs = closed ? m : m - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % m;
    const dx = q[j * 2] - q[i * 2];
    const dy = q[j * 2 + 1] - q[i * 2 + 1];
    const l = Math.hypot(dx, dy) || 1;
    ux[i] = dx / l;
    uy[i] = dy / l;
  }
  // turn at every point with two chords, and which of them are isolated sharp bends
  const turnAt = new Float64Array(m);
  const inner = (i) => closed || (i > 0 && i < m - 1);
  for (let i = 0; i < m; i++) {
    if (!inner(i)) continue;
    const p = (i - 1 + m) % m;
    turnAt[i] = Math.abs(Math.atan2(ux[p] * uy[i] - uy[p] * ux[i], ux[p] * ux[i] + uy[p] * uy[i]));
  }
  const sharp = new Uint8Array(m);
  for (let i = 0; i < m; i++) {
    if (!inner(i) || turnAt[i] < 0.62) continue;
    const a = closed || i > 1 ? turnAt[(i - 1 + m) % m] : 0;
    const b = closed || i < m - 2 ? turnAt[(i + 1) % m] : 0;
    if (a < 0.5 * turnAt[i] && b < 0.5 * turnAt[i]) sharp[i] = 1;
  }
  for (let i = 0; i < m; i++) {
    if (!inner(i)) continue;
    const p = (i - 1 + m) % m;
    let sx = ux[p] + ux[i];
    let sy = uy[p] + uy[i];
    const l = Math.hypot(sx, sy);
    if (l < 1e-9) { sx = ux[i]; sy = uy[i]; } else { sx /= l; sy /= l; }
    tx[i] = sx;
    ty[i] = sy;
  }
  if (!closed) {
    if (m >= 3 && !sharp[1]) {
      // the tangent of the circle through the end chord that matches the next tangent (mirror across the chord)
      const d = tx[1] * ux[0] + ty[1] * uy[0];
      tx[0] = 2 * d * ux[0] - tx[1];
      ty[0] = 2 * d * uy[0] - ty[1];
    } else { tx[0] = ux[0]; ty[0] = uy[0]; }
    if (m >= 3 && !sharp[m - 2]) {
      const d = tx[m - 2] * ux[m - 2] + ty[m - 2] * uy[m - 2];
      tx[m - 1] = 2 * d * ux[m - 2] - tx[m - 2];
      ty[m - 1] = 2 * d * uy[m - 2] - ty[m - 2];
    } else { tx[m - 1] = ux[m - 2]; ty[m - 1] = uy[m - 2]; }
  }
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % m;
    const p0x = q[i * 2], p0y = q[i * 2 + 1];
    const p3x = q[j * 2], p3y = q[j * 2 + 1];
    const c = Math.hypot(p3x - p0x, p3y - p0y);
    let ax = tx[i], ay = ty[i], bx = tx[j], by = ty[j];
    // a tangent that points far away from the chord would make a loop, and a sharp bend gets no smoothing: use the chord
    if (sharp[i] || ax * ux[i] + ay * uy[i] < 0.5) { ax = ux[i]; ay = uy[i]; }
    if (sharp[j] || bx * ux[i] + by * uy[i] < 0.5) { bx = ux[i]; by = uy[i]; }
    const hh = c / 3;
    if (hh > 0 && maxOffset < Infinity) {
      const lim = Math.min(0.99, maxOffset / hh);
      const nx = -uy[i];
      const ny = ux[i];
      let sa = ax * nx + ay * ny;
      if (Math.abs(sa) > lim) { sa = sa < 0 ? -lim : lim; const ca = Math.sqrt(1 - lim * lim); ax = ux[i] * ca + nx * sa; ay = uy[i] * ca + ny * sa; }
      let sb = bx * nx + by * ny;
      if (Math.abs(sb) > lim) { sb = sb < 0 ? -lim : lim; const cb = Math.sqrt(1 - lim * lim); bx = ux[i] * cb + nx * sb; by = uy[i] * cb + ny * sb; }
    }
    flattenBezier(p0x, p0y, p0x + ax * hh, p0y + ay * hh, p3x - bx * hh, p3y - by * hh, p3x, p3y, eps, out, 0);
  }
  if (closed) { out.pop(); out.pop(); }
  return out;
}

/** RDP for a closed loop: returns kept vertex indices (sorted, at least 3 when the loop has 3 or more points). */
function rdpClosed(xy, n, eps) {
  let far = 0;
  let fd = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(xy[i * 2] - xy[0], xy[i * 2 + 1] - xy[1]);
    if (d > fd) { fd = d; far = i; }
  }
  const ext = new Float64Array((n + 1) * 2);
  ext.set(xy.subarray(0, n * 2));
  ext[n * 2] = xy[0];
  ext[n * 2 + 1] = xy[1];
  const keep = [];
  rdpRange(ext, 0, far, eps, keep);
  const second = [];
  rdpRange(ext, far, n, eps, second);
  for (const i of second) if (i !== far && i !== n) keep.push(i);
  keep.sort((a, b) => a - b);
  if (keep.length < 3 && n >= 3) {
    const set = new Set(keep);
    for (const i of [Math.floor(n / 3), Math.floor((2 * n) / 3)]) set.add(i);
    return [...set].sort((a, b) => a - b);
  }
  return keep;
}

/** Cumulative arc length at every point of an open polyline. */
function arcLengths(xy, n) {
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(xy[i * 2] - xy[i * 2 - 2], xy[i * 2 + 1] - xy[i * 2 - 1]);
  return s;
}

/**
 * Finish one open piece: move its two ends to the wanted places (the neighbourhood follows, fading out over about
 * 2 pixels), remove points that do not matter, and draw the smooth curve. Returns a plain array [x, y, ...] with both
 * ends included.
 */
function finishPiece(xy, n, startAt, endAt, epsR, epsF, epsStraight) {
  if (n < 3) return [startAt[0], startAt[1], endAt[0], endAt[1]];
  const s = arcLengths(xy, n);
  const L = s[n - 1];
  if (L < 0.6) return [startAt[0], startAt[1], endAt[0], endAt[1]];
  const dsx = startAt[0] - xy[0];
  const dsy = startAt[1] - xy[1];
  const dex = endAt[0] - xy[(n - 1) * 2];
  const dey = endAt[1] - xy[(n - 1) * 2 + 1];
  const taper = Math.min(2.0, 0.45 * L);
  const pts = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, 1 - s[i] / taper);
    const b = Math.max(0, 1 - (L - s[i]) / taper);
    pts[i * 2] = xy[i * 2] + dsx * a + dex * b;
    pts[i * 2 + 1] = xy[i * 2 + 1] + dsy * a + dey * b;
  }
  pts[0] = startAt[0]; pts[1] = startAt[1];
  pts[(n - 1) * 2] = endAt[0]; pts[(n - 1) * 2 + 1] = endAt[1];
  // a piece that never leaves a thin strip around its chord is a straight line
  {
    const cx = pts[(n - 1) * 2] - pts[0];
    const cy = pts[(n - 1) * 2 + 1] - pts[1];
    const cl = Math.hypot(cx, cy);
    let worst = 0;
    if (cl > 1e-9) {
      for (let i = 1; i < n - 1; i++) {
        const d = Math.abs((pts[i * 2] - pts[0]) * cy - (pts[i * 2 + 1] - pts[1]) * cx) / cl;
        if (d > worst) worst = d;
      }
      if (worst <= epsStraight) return [pts[0], pts[1], pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]];
    }
  }
  const keep = [];
  rdpRange(pts, 0, n - 1, epsR, keep);
  const q = new Float64Array(keep.length * 2);
  for (let k = 0; k < keep.length; k++) { q[k * 2] = pts[keep[k] * 2]; q[k * 2 + 1] = pts[keep[k] * 2 + 1]; }
  return smoothThrough(q, keep.length, false, epsF, 2 * epsR);
}

/** Finish a closed loop with no corners. Returns [x, y, ...] without a repeated first point. */
function finishLoop(xy, n, epsR, epsF) {
  const keep = rdpClosed(xy, n, epsR);
  const q = new Float64Array(keep.length * 2);
  for (let k = 0; k < keep.length; k++) { q[k * 2] = xy[keep[k] * 2]; q[k * 2 + 1] = xy[keep[k] * 2 + 1]; }
  if (keep.length < 3) return Array.from(q);
  return smoothThrough(q, keep.length, true, epsF, 2 * epsR);
}

/**
 * Process every chain into its final polyline.
 *   rawOf(c) -> { xy, n } raw points of chain c (see contours.chainRawPoints)
 *   chains: the chain records; W1 = picture width + 1 (lattice row length); w, h: picture size
 *   p: { smooth (0..1), cornerRad (radians), epsR, epsF }
 * Returns an array (one entry per chain) of Float64Array [x, y, ...]: open chains include both junction points,
 * closed chains have no repeated point.
 */
export function processChains(chains, rawOf, W1, w, h, p) {
  const passes = Math.round(2 + 18 * p.smooth);
  const nc = chains.length;
  const works = new Array(nc);
  const nodeLines = new Map();
  const addLine = (v, line) => {
    if (!line) return;
    let a = nodeLines.get(v);
    if (!a) { a = []; nodeLines.set(v, a); }
    a.push(line);
  };
  // phase 1: resample, corners, smoothing of each piece, lines at the piece ends
  for (let c = 0; c < nc; c++) {
    const ch = chains[c];
    const closed = ch.closed;
    const work = { closed, tiny: false, skip: false, pieces: [] };
    works[c] = work;
    if (ch.skip) { work.skip = true; continue; }
    const raw = rawOf(c);
    if (!closed && (raw.n <= 3 || pathLength(raw.xy, raw.n) < 2.2)) { work.tiny = true; continue; }
    const rs = resample(raw.xy, raw.n, closed);
    if (rs.n < 3) { work.tiny = true; continue; }
    const light = Float64Array.from(rs.xy);
    taubin(light, rs.n, closed, 3);
    const corners = findCorners(light, rs.n, closed, p.cornerRad);
    const n = rs.n;
    if (closed && corners.length === 0) {
      taubin(rs.xy, n, true, passes);
      straightenWobble(rs.xy, n, true);
      work.pieces.push({ xy: rs.xy, n, cyclic: true });
      continue;
    }
    const breaks = closed ? corners : [0, ...corners, n - 1];
    const np = closed ? corners.length : breaks.length - 1;
    for (let k = 0; k < np; k++) {
      const a = breaks[k];
      const b = closed ? breaks[(k + 1) % breaks.length] : breaks[k + 1];
      const idx = [];
      if (!closed || b > a) {
        for (let i = a; i <= b; i++) idx.push(i);
      } else {
        for (let i = a; i < n; i++) idx.push(i);
        for (let i = 0; i <= b; i++) idx.push(i);
      }
      const m = idx.length;
      const xy = new Float64Array(m * 2);
      for (let i = 0; i < m; i++) { xy[i * 2] = rs.xy[idx[i] * 2]; xy[i * 2 + 1] = rs.xy[idx[i] * 2 + 1]; }
      if (m >= 5) taubin(xy, m, false, passes, 0.5, -0.5263, true);
      straightenWobble(xy, m, false);
      const len = pathLength(xy, m);
      const d1 = Math.min(1.0, 0.25 * len);
      const d2 = Math.min(4.0, 0.9 * len);
      work.pieces.push({
        xy, n: m, len,
        startLine: fitEndLine(xy, m, true, d1, d2),
        endLine: fitEndLine(xy, m, false, d1, d2),
      });
    }
    if (!closed) {
      addLine(ch.v0, work.pieces[0].startLine);
      addLine(ch.vEnd, work.pieces[work.pieces.length - 1].endLine);
    }
  }
  // phase 2: where each junction really is
  const nodePos = new Map();
  const nodeAt = (v) => {
    let pos = nodePos.get(v);
    if (pos) return pos;
    const x = v % W1;
    const y = (v - x) / W1;
    const lines = nodeLines.get(v);
    pos = [x, y];
    if (lines && lines.length) {
      const m = meetPoint(lines, [x, y]);
      let dx = m[0] - x;
      let dy = m[1] - y;
      const d = Math.hypot(dx, dy);
      if (d > 1) { dx /= d; dy /= d; }
      const k = Math.min(d, 1);
      pos = [x + dx * k, y + dy * k];
    }
    // a junction on the picture edge stays on the edge
    if (x === 0 || x === w) pos[0] = x;
    if (y === 0 || y === h) pos[1] = y;
    nodePos.set(v, pos);
    return pos;
  };
  // phase 3: corners, ends, final curves
  const result = new Array(nc);
  for (let c = 0; c < nc; c++) {
    const ch = chains[c];
    const work = works[c];
    if (work.skip) { result[c] = null; continue; }
    if (work.tiny) {
      const a = nodeAt(ch.v0);
      const b = nodeAt(ch.vEnd);
      result[c] = Float64Array.from([a[0], a[1], b[0], b[1]]);
      continue;
    }
    const pieces = work.pieces;
    if (pieces.length === 1 && pieces[0].cyclic) {
      result[c] = Float64Array.from(finishLoop(pieces[0].xy, pieces[0].n, p.epsR, p.epsF));
      continue;
    }
    const P = pieces.length;
    const corner = (prev, next) => {
      const ex = prev.xy[(prev.n - 1) * 2];
      const ey = prev.xy[(prev.n - 1) * 2 + 1];
      const mx = (ex + next.xy[0]) / 2;
      const my = (ey + next.xy[1]) / 2;
      if (prev.endLine && next.startLine) {
        const q = intersectLines(prev.endLine, next.startLine);
        if (q && Math.hypot(q[0] - mx, q[1] - my) <= 2.0) return q;
      }
      return [mx, my];
    };
    const anchors = [];
    if (!ch.closed) {
      anchors.push(nodeAt(ch.v0));
      for (let k = 1; k < P; k++) anchors.push(corner(pieces[k - 1], pieces[k]));
      anchors.push(nodeAt(ch.vEnd));
    } else {
      for (let k = 0; k < P; k++) anchors.push(corner(pieces[(k - 1 + P) % P], pieces[k]));
      anchors.push(anchors[0]);
    }
    const out = [];
    for (let k = 0; k < P; k++) {
      const pc = pieces[k];
      const pts = finishPiece(pc.xy, pc.n, anchors[k], anchors[k + 1], p.epsR, p.epsF, p.epsStraight || p.epsR);
      for (let i = k === 0 ? 0 : 2; i < pts.length; i++) out.push(pts[i]);
    }
    if (ch.closed) { out.pop(); out.pop(); }
    result[c] = Float64Array.from(out);
  }
  return result;
}

/**
 * Plain polygon helpers for the embroidery engine. A "ring" is a closed polyline [[x, y], ...] (the last point is NOT
 * repeated). A shape is a list of rings read with the even-odd rule: a point is inside when it is inside an odd number
 * of rings, so a ring inside a ring is a hole. Everything is in the same units the caller uses (millimetres in the engine).
 */

/** Signed area by the shoelace formula (positive when the ring runs counter-clockwise in a y-up picture). */
export function signedArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export const ringArea = (ring) => Math.abs(signedArea(ring));

export function ringPerimeter(ring) {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    s += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return s;
}

/** [minX, minY, maxX, maxY] of every ring, or null when there is no point. */
export function bboxOf(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[1] > y1) y1 = p[1];
    }
  }
  return x0 === Infinity ? null : [x0, y0, x1, y1];
}

/** Is the point inside this one ring (crossing-number test)? */
export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the shape (even-odd over all rings)? */
export function pointInRings(x, y, rings) {
  let inside = false;
  for (const ring of rings) if (pointInRing(x, y, ring)) inside = !inside;
  return inside;
}

/** Apply a 2D affine [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f (the canvas matrix order). */
export function transformRings(rings, m) {
  const [a, b, c, d, e, f] = m;
  return rings.map((ring) => ring.map((p) => [a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f]));
}

/** The matrix for scale, then rotation (degrees, clockwise on a y-down screen), then translation. */
export function composeMatrix({ x = 0, y = 0, sx = 1, sy = 1, rot = 0 } = {}) {
  const r = (rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c * sx, s * sx, -s * sy, c * sy, x, y];
}

/** Multiply two affines: the result applies `n` first, then `m`. */
export function multiplyMatrix(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function invertMatrix(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return null;
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

/**
 * Group the rings of a shape into islands. Every ring is tested against the others: the rings that sit inside an even
 * number of others are outer boundaries, the ones inside an odd number are holes of the nearest outer ring around them.
 * Returns [{ outer, holes: [...] }] with the outer ring wound with positive signed area and the holes negative, which is
 * what the offsetting and the scan-line fill both expect.
 */
export function islandsOf(rings) {
  const live = rings.filter((r) => r.length >= 3 && ringArea(r) > 1e-9);
  const info = live.map((ring) => ({ ring, area: ringArea(ring), depth: 0, parent: -1 }));
  // Largest first, so the first ring that contains a ring is the one around it.
  const order = info.map((_, i) => i).sort((a, b) => info[b].area - info[a].area);
  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi];
    const probe = interiorPoint(info[i].ring);
    let best = -1;
    for (let oj = 0; oj < oi; oj++) {
      const j = order[oj];
      if (info[j].area <= info[i].area) continue;
      if (pointInRing(probe[0], probe[1], info[j].ring)) best = j; // the later (smaller) container wins
    }
    info[i].parent = best;
    info[i].depth = best < 0 ? 0 : info[best].depth + 1;
  }
  const islands = new Map();
  info.forEach((it, i) => { if (it.depth % 2 === 0) islands.set(i, { outer: orient(it.ring, true), holes: [] }); });
  info.forEach((it) => {
    if (it.depth % 2 === 1) {
      const owner = islands.get(it.parent);
      if (owner) owner.holes.push(orient(it.ring, false));
    }
  });
  return [...islands.values()];
}

/** A ring wound the wanted way (positive signed area when `positive`). */
export function orient(ring, positive) {
  return (signedArea(ring) > 0) === positive ? ring : ring.slice().reverse();
}

/** A point that is certainly inside the ring's own area (not on an edge), used to ask "which ring is around this one". */
export function interiorPoint(ring) {
  // Scan the ring's middle height and take the middle of the widest crossing.
  const box = bboxOf([ring]);
  const tries = [0.5, 0.37, 0.63, 0.25, 0.75, 0.13, 0.87];
  for (const t of tries) {
    const y = box[1] + (box[3] - box[1]) * t;
    const xs = [];
    for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
      const yi = ring[i][1], yj = ring[j][1];
      if ((yi > y) !== (yj > y)) xs.push(ring[i][0] + ((ring[j][0] - ring[i][0]) * (y - yi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    let bestW = -1, bx = 0;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      if (xs[k + 1] - xs[k] > bestW) { bestW = xs[k + 1] - xs[k]; bx = (xs[k] + xs[k + 1]) / 2; }
    }
    if (bestW > 0) return [bx, y];
  }
  return ring[0];
}

/** Ramer-Douglas-Peucker on an open polyline. `keep` marks indices that must survive. */
export function simplifyPolyline(pts, eps) {
  const n = pts.length;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let dmax = 0, idx = -1;
    const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay;
    const len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      let d;
      if (len2 === 0) d = Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
      else {
        const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / len2));
        d = Math.hypot(pts[i][0] - (ax + t * dx), pts[i][1] - (ay + t * dy));
      }
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (idx >= 0 && dmax > eps) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** The same for a closed ring: cut it at its two furthest-apart points first so no corner is lost. */
export function simplifyRing(ring, eps) {
  if (ring.length <= 4) return ring.slice();
  let i0 = 0, i1 = 0, best = -1;
  // A cheap pair of far points: the first point, then the point furthest from it, then the furthest from that.
  let far = 0, fd = -1;
  for (let i = 0; i < ring.length; i++) {
    const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2;
    if (d > fd) { fd = d; far = i; }
  }
  i0 = far;
  for (let i = 0; i < ring.length; i++) {
    const d = (ring[i][0] - ring[i0][0]) ** 2 + (ring[i][1] - ring[i0][1]) ** 2;
    if (d > best) { best = d; i1 = i; }
  }
  const [lo, hi] = i0 < i1 ? [i0, i1] : [i1, i0];
  const a = simplifyPolyline(ring.slice(lo, hi + 1), eps);
  const b = simplifyPolyline([...ring.slice(hi), ...ring.slice(0, lo + 1)], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Points along a closed ring, `step` apart (the last gap is shortened to close the loop). Corners are kept as points. */
export function resampleRing(ring, step) {
  const out = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const k = Math.max(1, Math.round(d / step));
    for (let s = 0; s < k; s++) out.push([p[0] + ((q[0] - p[0]) * s) / k, p[1] + ((q[1] - p[1]) * s) / k]);
  }
  return out;
}

/** Cumulative length along an open polyline: [0, d1, d1 + d2, ...]. */
export function cumulativeLength(pts) {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return out;
}

/** The point `s` along an open polyline whose cumulative lengths are `cum` (clamped to the ends), with the heading there. */
export function pointAlong(pts, cum, s) {
  const n = pts.length;
  if (s <= 0) return { x: pts[0][0], y: pts[0][1], i: 0, t: 0 };
  if (s >= cum[n - 1]) return { x: pts[n - 1][0], y: pts[n - 1][1], i: n - 2, t: 1 };
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (s - cum[lo]) / seg;
  return { x: pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, y: pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t, i: lo, t };
}

/** Do the open segments p1-p2 and p3-p4 cross (properly, not just touch)? */
export function segmentsCross(p1, p2, p3, p4) {
  const d1x = p2[0] - p1[0], d1y = p2[1] - p1[1], d2x = p4[0] - p3[0], d2y = p4[1] - p3[1];
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / den;
  const u = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
}

/** Does the straight line a-b stay inside the shape (crosses no ring, and its middle is inside)? */
export function segmentInside(a, b, rings) {
  for (const ring of rings) {
    for (let i = 0, n = ring.length; i < n; i++) {
      if (segmentsCross(a, b, ring[i], ring[(i + 1) % n])) return false;
    }
  }
  return pointInRings((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, rings);
}

/** The nearest point of a ring to (x, y): { d, s (distance along the ring from its first point), i (edge), x, y }. */
export function nearestOnRing(x, y, ring) {
  let best = { d: Infinity, s: 0, i: 0, x: 0, y: 0 };
  let run = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const l = Math.hypot(dx, dy);
    const l2 = l * l;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / l2));
    const px = p[0] + t * dx, py = p[1] + t * dy;
    const d = Math.hypot(x - px, y - py);
    if (d < best.d) best = { d, s: run + t * l, i, x: px, y: py };
    run += l;
  }
  return best;
}

/**
 * The way along a ring from the point nearest `a` to the point nearest `b`, the shorter of the two ways round, as points
 * (first and last are those nearest points). `length` is how long that way is; `da` and `db` are how far a and b are from the ring.
 */
export function walkRing(ring, a, b) {
  const n = ring.length;
  const na = nearestOnRing(a[0], a[1], ring), nb = nearestOnRing(b[0], b[1], ring);
  const cum = [0];
  for (let i = 0; i < n; i++) cum.push(cum[i] + Math.hypot(ring[(i + 1) % n][0] - ring[i][0], ring[(i + 1) % n][1] - ring[i][1]));
  const total = cum[n];
  const fwd = (nb.s - na.s + total) % total;
  const back = total - fwd;
  const pts = [[na.x, na.y]];
  if (fwd <= back) {
    // Forward: the vertices after a's edge, up to b.
    for (let step = 1; step <= n; step++) {
      const k = (na.i + step) % n;
      const pos = k > na.i ? cum[k] : cum[k] + total;
      if (pos >= na.s + fwd - 1e-9) break;
      pts.push([ring[k][0], ring[k][1]]);
    }
  } else {
    // Backward: the start vertex of a's own edge, then the ones before it.
    for (let step = 0; step < n; step++) {
      const k = (na.i - step + n) % n;
      const pos = k <= na.i ? cum[k] : cum[k] - total;
      if (na.s - pos >= back - 1e-9) break;
      pts.push([ring[k][0], ring[k][1]]);
    }
  }
  pts.push([nb.x, nb.y]);
  return { points: pts, length: Math.min(fwd, back), da: na.d, db: nb.d };
}

/** The shortest distance from a point to the rings' edges. */
export function distanceToRings(x, y, rings) {
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0, n = ring.length; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n];
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / l2));
      const d = Math.hypot(x - (p[0] + t * dx), y - (p[1] + t * dy));
      if (d < best) best = d;
    }
  }
  return best;
}

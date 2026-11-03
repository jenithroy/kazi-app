/**
 * Tatami fill: cover one island (an outer ring and its holes) with parallel rows of stitches.
 *
 * The rows run along `angle`, `spacing` mm apart, and each row is cut into stitches of about `stitchLen` mm whose
 * needle holes are staggered from row to row (the weave that gives "tatami" its name; a plain grid of holes would show as
 * lines). Where a row is interrupted by a hole or a notch it becomes two or more row pieces. The pieces are walked in an
 * order that keeps the needle moving through the shape: neighbouring rows are joined by a short stitch at the edge, and
 * where the next piece is far away the needle runs along the inside of the outline to get there (hidden by the border or
 * the edge of the fill) instead of cutting the thread, as long as that run is short enough to be worth it.
 *
 * The result is a list of PATHS, each a run of points to sew without lifting the needle; a new path means a jump
 * (the caller decides whether that is a trim). All numbers are millimetres.
 */
import { bboxOf, islandsOf, segmentInside, walkRing } from "../geometry/poly.js";
import { offsetRings } from "../geometry/clip.js";
import { runAlong } from "./path.js";

export const FILL_DEFAULTS = {
  angle: 45,
  spacing: 0.4,
  stitchLen: 3.5,
  stagger: 4, // how many different shifts the rows cycle through (0 = a steady scatter instead)
  pullComp: 0.2, // total mm added to each row (half at each end): stitches pull the cloth together along their length
  inset: 0, // mm to pull the fill in from the edge before stitching (when a border will cover the edge)
  grow: 0, // mm the top stitches reach past the shape's edge on every side; used by the engine (a thread is already 0.4 mm wide, and the traced shapes bleed under each other)
  minRow: 0.3, // row pieces shorter than this are dropped
  minPiece: 0.9, // never leave a first/last stitch shorter than this (the needle hole is dropped instead)
  travelMax: 2.5, // a direct join between row pieces longer than this is not made
  travelRun: 14, // a run along the outline to reach the next piece is made when it is no longer than this (mm), else a jump
  runStep: 2.2, // stitch length of that run
};

/**
 * walkRing (geometry/poly.js) for one big ring, made fast: the ring's edges are put in a grid once, so the nearest point of the ring asks only the
 * cells round a point and not every edge. Gives the same answer as walkRing whenever both ends are within `reach` mm of the ring, and null when
 * one is further (the caller does not want that way). For a field cut by hundreds of holes the plain walk looked at tens of thousands of edges per join.
 */
function ringWalker(ring, reach) {
  const n = ring.length;
  const cum = [0];
  for (let i = 0; i < n; i++) cum.push(cum[i] + Math.hypot(ring[(i + 1) % n][0] - ring[i][0], ring[(i + 1) % n][1] - ring[i][1]));
  const total = cum[n];
  let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
  for (const p of ring) { if (p[0] < gx0) gx0 = p[0]; if (p[0] > gx1) gx1 = p[0]; if (p[1] < gy0) gy0 = p[1]; if (p[1] > gy1) gy1 = p[1]; }
  const cell = reach + 0.1;
  const nx = Math.floor((gx1 - gx0) / cell) + 1, ny = Math.floor((gy1 - gy0) / cell) + 1;
  const cellOf = (v, lo, m) => Math.max(0, Math.min(m - 1, Math.floor((v - lo) / cell)));
  const count = new Int32Array(nx * ny + 1);
  const span = (i) => { const p = ring[i], q = ring[(i + 1) % n]; return [cellOf(Math.min(p[0], q[0]), gx0, nx), cellOf(Math.max(p[0], q[0]), gx0, nx), cellOf(Math.min(p[1], q[1]), gy0, ny), cellOf(Math.max(p[1], q[1]), gy0, ny)]; };
  for (let i = 0; i < n; i++) { const [a, b, c, d] = span(i); for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) count[y * nx + x + 1]++; }
  for (let i = 1; i < count.length; i++) count[i] += count[i - 1];
  const fillAt = count.slice();
  const list = new Int32Array(count[nx * ny]);
  for (let i = 0; i < n; i++) { const [a, b, c, d] = span(i); for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) list[fillAt[y * nx + x]++] = i; }
  const nearest = (x, y) => {
    if (x < gx0 - reach || x > gx1 + reach || y < gy0 - reach || y > gy1 + reach) return null;
    const cx = cellOf(x, gx0, nx), cy = cellOf(y, gy0, ny);
    let best = null;
    for (let yy = Math.max(0, cy - 1); yy <= Math.min(ny - 1, cy + 1); yy++) {
      for (let xx = Math.max(0, cx - 1); xx <= Math.min(nx - 1, cx + 1); xx++) {
        const at = yy * nx + xx;
        for (let k = count[at]; k < count[at + 1]; k++) {
          const i = list[k];
          const p = ring[i], q = ring[(i + 1) % n];
          const dx = q[0] - p[0], dy = q[1] - p[1];
          const l = Math.hypot(dx, dy), l2 = l * l;
          const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / l2));
          const px = p[0] + t * dx, py = p[1] + t * dy;
          const d = Math.hypot(x - px, y - py);
          if (!best || d < best.d || (d === best.d && i < best.i)) best = { d, s: cum[i] + t * l, i, x: px, y: py };
        }
      }
    }
    return best && best.d <= reach ? best : null;
  };
  return (a, b) => {
    const na = nearest(a[0], a[1]);
    if (!na) return null;
    const nb = nearest(b[0], b[1]);
    if (!nb) return null;
    const fwd = (nb.s - na.s + total) % total;
    const back = total - fwd;
    const pts = [[na.x, na.y]];
    if (fwd <= back) {
      for (let step = 1; step <= n; step++) {
        const k = (na.i + step) % n;
        const pos = k > na.i ? cum[k] : cum[k] + total;
        if (pos >= na.s + fwd - 1e-9) break;
        pts.push([ring[k][0], ring[k][1]]);
      }
    } else {
      for (let step = 0; step < n; step++) {
        const k = (na.i - step + n) % n;
        const pos = k <= na.i ? cum[k] : cum[k] - total;
        if (na.s - pos >= back - 1e-9) break;
        pts.push([ring[k][0], ring[k][1]]);
      }
    }
    pts.push([nb.x, nb.y]);
    return { points: pts, length: Math.min(fwd, back), da: na.d, db: nb.d };
  };
}

/** A steady scatter for rows when no regular shift is wanted: the same input always gives the same shift. */
function scatter(k) {
  const x = Math.sin(k * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * @param {number[][][]} rings  the island's rings (outer + holes, even-odd)
 * @param {object} o  see FILL_DEFAULTS, plus start: [x, y] where the needle is now (the fill begins at the nearest end of its first or last row)
 * @returns {{ paths: number[][][], rows: number }}  paths of [x, y] points, in the original (unrotated) frame
 */
export function tatamiFill(rings, o = {}) {
  const opt = { ...FILL_DEFAULTS, ...o };
  let work = rings;
  if (opt.inset > 0 && !opt.lite) work = offsetRings(rings, -opt.inset, { join: "miter" });
  if (!work.length) work = rings; // a piece thinner than the inset is sewn as it is, not left out
  if (!work.length) return { paths: [], rows: 0 };

  // Rotate so the rows are horizontal.
  const th = (opt.angle * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
  const fwd = (p) => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];
  const back = (x, y) => [x * c - y * s, x * s + y * c];
  const rot = work.map((r) => r.map(fwd));
  const box = bboxOf(rot);
  if (!box) return { paths: [], rows: 0 };
  const height = box[3] - box[1];
  if (height < 1e-6) return { paths: [], rows: 0 };

  // Rows sit at the middle of equal strips so the edges are covered evenly.
  const n = Math.max(1, Math.round(height / opt.spacing));
  const rowStep = height / n;
  const yOf = (k) => box[1] + (k + 0.5) * rowStep;

  // Where every ring crosses every row.
  const xs = Array.from({ length: n }, () => []);
  for (const ring of rot) {
    for (let i = 0, m = ring.length; i < m; i++) {
      const p = ring[i], q = ring[(i + 1) % m];
      if (p[1] === q[1]) continue;
      const [lo, hi] = p[1] < q[1] ? [p, q] : [q, p];
      const k0 = Math.max(0, Math.floor((lo[1] - box[1]) / rowStep - 0.5) - 1);
      const k1 = Math.min(n - 1, Math.ceil((hi[1] - box[1]) / rowStep - 0.5) + 1);
      for (let k = k0; k <= k1; k++) {
        const y = yOf(k);
        // Half-open test, the same for both edges that share a corner, so a corner is never counted twice.
        if ((p[1] <= y) !== (q[1] <= y)) xs[k].push(p[0] + ((q[0] - p[0]) * (y - p[1])) / (q[1] - p[1]));
      }
    }
  }

  // Row pieces, each with the needle holes between its two ends.
  const segs = [];
  const byRow = Array.from({ length: n }, () => []);
  const ext = opt.pullComp / 2;
  const phases = Math.max(0, Math.round(opt.stagger));
  for (let k = 0; k < n; k++) {
    const row = xs[k].sort((a, b) => a - b);
    for (let i = 0; i + 1 < row.length; i += 2) {
      let a = row[i], b = row[i + 1];
      if (b - a < opt.minRow) continue;
      // Pull compensation: lengthen the row, but never into the next piece.
      const gapL = i >= 2 ? (a - row[i - 1]) / 2 : Infinity;
      const gapR = i + 2 < row.length ? (row[i + 2] - b) / 2 : Infinity;
      a -= Math.min(ext, Math.max(0, gapL - 0.02));
      b += Math.min(ext, Math.max(0, gapR - 0.02));
      const seg = { k, y: yOf(k), a, b, used: false, inner: [] };
      const shift = phases ? ((k % phases) / phases) * opt.stitchLen : scatter(k) * opt.stitchLen;
      const first = Math.floor((a + opt.minPiece - shift) / opt.stitchLen) + 1;
      for (let j = first; ; j++) {
        const x = shift + j * opt.stitchLen;
        if (x >= b - opt.minPiece) break;
        if (x > a + opt.minPiece - 1e-9) seg.inner.push(x);
      }
      segs.push(seg);
      byRow[k].push(seg);
    }
  }
  if (!segs.length) return { paths: [], rows: n };

  // Row ends were lengthened by the pull compensation, so a direct join is judged against the shape a touch grown;
  // a run along the outline uses the outline pulled a touch in.
  // (both are only worked out when a join needs them: most small shapes never do, and each is a polygon offset)
  let joinMemo = null, edgeMemo = null;
  // (`lite`, for a field cut by hundreds of holes, uses the shape itself for both: each offset of such a shape took seconds)
  const joinRingsOf = () => joinMemo || (joinMemo = (ext > 0 && !opt.lite ? offsetRings(work, ext + 0.05, { join: "miter" }) : work).map((r) => r.map(fwd)));
  const edgeRingsOf = () => edgeMemo || (edgeMemo = (opt.lite ? work : offsetRings(work, -0.25, { join: "miter" })).map((r) => r.map(fwd)));

  const overlaps = (s1, s2) => Math.min(s1.b, s2.b) - Math.max(s1.a, s2.a) > opt.minRow;
  const endsOf = (sg) => [[sg.a, sg.y], [sg.b, sg.y]];
  const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;

  const nearestEnd = (list, from) => {
    let best = null;
    for (const sg of list) {
      const e = endsOf(sg);
      for (let side = 0; side < 2; side++) {
        const d = d2(e[side], from);
        if (!best || d < best.d) best = { seg: sg, side, d };
      }
    }
    return best;
  };

  const walk = (seg, side) => {
    // side 0 = enter at the left end (a), 1 = enter at the right end (b)
    const pts = [[side === 0 ? seg.a : seg.b, seg.y]];
    for (const x of side === 0 ? seg.inner : seg.inner.slice().reverse()) pts.push([x, seg.y]);
    pts.push([side === 0 ? seg.b : seg.a, seg.y]);
    seg.used = true;
    return pts;
  };

  /** Points to run along the outline from `from` to `to`, or null when there is no short enough way. */
  let edgeBoxes = null, edgeWalkers = null;
  const route = (from, to) => {
    let best = null;
    const edgeRings = edgeRingsOf();
    if (!edgeBoxes) edgeBoxes = edgeRings.map((r) => bboxOf([r]));
    for (let ri = 0; ri < edgeRings.length; ri++) {
      // a ring whose box is further than 1.2 mm from either end cannot be the way (a shape with hundreds of holes was walked ring by ring)
      const bx = edgeBoxes[ri];
      if (!bx || from[0] < bx[0] - 1.2 || from[0] > bx[2] + 1.2 || from[1] < bx[1] - 1.2 || from[1] > bx[3] + 1.2 || to[0] < bx[0] - 1.2 || to[0] > bx[2] + 1.2 || to[1] < bx[1] - 1.2 || to[1] > bx[3] + 1.2) continue;
      const ring = edgeRings[ri];
      let w;
      if (ring.length >= 200) {
        // a big ring (the outline of a field, a ring of hundreds of points): the fast walk, which also says no at once when an end is far from it
        if (!edgeWalkers) edgeWalkers = new Array(edgeRings.length).fill(null);
        const walk = edgeWalkers[ri] || (edgeWalkers[ri] = ringWalker(ring, 1.2));
        w = walk(from, to);
        if (!w) continue;
      } else w = walkRing(ring, from, to);
      if (w.da > 1.2 || w.db > 1.2) continue;
      const cost = w.length + w.da + w.db;
      if (!best || cost < best.cost) best = { cost, w };
    }
    if (!best || best.w.length > opt.travelRun) return null;
    // Needle holes `runStep` apart along the way (a run round a tiny curve has hundreds of closely spaced vertices: only the
    // sharp corners are kept as holes of their own).
    // (The walk's first and last point are the points of the ring nearest the two ends, about a quarter of a millimetre away. The holes are made along the whole
    // way, ends included, and the ends then taken off again: no hole goes within half a millimetre of another, so the quarter millimetre hop onto the ring, which a
    // thread only piles up in, is not made unless the ring has a real corner there.)
    const holes = runAlong([from, ...best.w.points, to], { len: opt.runStep, closed: false, cornerDeg: 35 });
    return holes.slice(1, -1);
  };

  // Begin at the end of the first or last row that is nearest the needle, then sweep the other way.
  const firstK = segs[0].k, lastK = segs[segs.length - 1].k;
  const startAt = opt.start ? fwd(opt.start) : [box[0], box[1]];
  const edgeRows = segs.filter((sg) => sg.k === firstK || sg.k === lastK);
  let pick = nearestEnd(edgeRows, startAt);
  let sweep = pick.seg.k === firstK ? 1 : -1;

  const paths = [];
  let path = null;
  let remaining = segs.length;
  while (pick) {
    const pts = walk(pick.seg, pick.side);
    remaining--;
    if (!path) { path = []; paths.push(path); }
    for (const p of pts) path.push(p);
    const cur = pts[pts.length - 1];
    const seg = pick.seg;
    if (remaining === 0) break;

    // Next: a neighbour in the next row of the sweep, else one in the other direction, else the nearest piece anywhere.
    let next = null;
    for (const dir of [sweep, -sweep]) {
      const kk = seg.k + dir;
      if (kk < 0 || kk >= n) continue;
      const cand = byRow[kk].filter((t) => !t.used && overlaps(seg, t));
      if (cand.length) { next = nearestEnd(cand, cur); sweep = dir; break; }
    }
    if (!next) {
      next = nearestEnd(segs.filter((t) => !t.used), cur);
      const sg = next.seg;
      const hasDown = sg.k + 1 < n && byRow[sg.k + 1].some((t) => !t.used && overlaps(sg, t));
      const hasUp = sg.k - 1 >= 0 && byRow[sg.k - 1].some((t) => !t.used && overlaps(sg, t));
      if (hasDown && !hasUp) sweep = 1;
      else if (hasUp && !hasDown) sweep = -1;
      else sweep = sg.k <= (n - 1) / 2 ? 1 : -1;
    }

    // Join to it: a short stitch, a run along the outline, or a jump (a new path).
    const target = endsOf(next.seg)[next.side];
    const gap = Math.sqrt(d2(cur, target));
    if (gap <= opt.travelMax && (gap < 0.5 || segmentInside(cur, target, joinRingsOf()))) {
      // direct
    } else {
      const via = route(cur, target);
      if (via) for (const p of via) path.push(p);
      else path = null;
    }
    pick = next;
  }

  const out = paths
    .map((p) => p.filter((q, i) => i === 0 || d2(q, p[i - 1]) > 1e-8))
    .filter((p) => p.length >= 2)
    .map((p) => p.map((q) => back(q[0], q[1])));
  return { paths: out, rows: n };
}

/** Fill every island of a shape (several letters, a letter and its dot) one after another, nearest island first. */
export function tatamiFillShape(rings, o = {}) {
  const islands = islandsOf(rings);
  const todo = islands.map((is) => {
    const c = bboxOf([is.outer]);
    return { is, mid: [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2] };
  });
  const paths = [];
  let at = o.start || null;
  while (todo.length) {
    let bi = 0;
    if (at) {
      let bd = Infinity;
      todo.forEach((t, i) => { const d = (t.mid[0] - at[0]) ** 2 + (t.mid[1] - at[1]) ** 2; if (d < bd) { bd = d; bi = i; } });
    }
    const [t] = todo.splice(bi, 1);
    const res = tatamiFill([t.is.outer, ...t.is.holes], { ...o, start: at });
    for (const p of res.paths) paths.push(p);
    if (res.paths.length) at = res.paths[res.paths.length - 1].slice(-1)[0];
  }
  return { paths };
}

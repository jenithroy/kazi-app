/**
 * Satin stitching for strokes: letters, thin shapes, lines. The shape's skeleton gives the centre line of each stroke; the
 * column of stitches follows it, crossing from edge to edge, as wide as the stroke is at that point (measured by shooting a
 * ray to each edge, so a stroke that is not symmetric about its centre is still covered edge to edge).
 *
 * Where strokes meet, the two halves of a straight stroke run through as one column and the third stroke ends on it. A free
 * end is run on to the very tip of the shape. Each column gets an underlay (a running stitch down the middle for a thin one,
 * a run along both edges for a wider one) that is sewn first, so the satin on top lies flat and the edges stay crisp.
 */
import { strokeCenterlines, findCorners } from "../geometry/skeleton.js";
import { cumulativeLength, bboxOf, islandsOf, ringArea } from "../geometry/poly.js";
import { offsetRings } from "../geometry/clip.js";
import { satinAlong, runAlong, beanAlong, dedupe } from "./path.js";

export const SATIN_DEFAULTS = {
  spacing: 0.3, // mm between stitches along the column (the holes on one edge are twice this apart: any more and cloth shows between them)
  pullComp: 0.25, // mm added to the width in total (half each side): thread pulls the stroke narrower
  maxWidth: 7, // full width above which a stroke is not stitched as satin
  minWidth: 0.5, // below this a stroke gets a running stitch instead
  underlay: "auto", // "auto" | "none" | "center" | "edge" | "center+edge"
  underlayLen: 2.5, // stitch length of the underlay
  inset: 0.35, // how far the edge underlay sits inside the edge
  throughDeg: 150, // two strokes meeting at a junction run through as one when they are at least this far from folding back
  minStroke: 0.4, // parts of a shape thinner than this (mm) are left out of the column layout (a hairline is made about 0.5 mm wide by the tracer, and is kept)
};

/** Distance along a ray from (px, py) to the nearest edge of the rings, or `maxD` if there is none that near. */
function makeRay(rings) {
  const edges = [];
  for (const r of rings) for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; edges.push(p[0], p[1], q[0], q[1]); }
  const E = Float64Array.from(edges);
  const m = E.length / 4;
  const hit = (k, px, py, dx, dy, best) => {
    const ax = E[k], ay = E[k + 1], ex = E[k + 2] - ax, ey = E[k + 3] - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) return best;
    const t = ((ax - px) * ey - (ay - py) * ex) / den;
    if (t <= 1e-6 || t >= best) return best;
    const u = ((ax - px) * dy - (ay - py) * dx) / den;
    return u >= 0 && u <= 1 ? t : best;
  };
  if (m < 64) {
    return (px, py, dx, dy, maxD) => {
      let best = maxD;
      for (let k = 0; k < E.length; k += 4) best = hit(k, px, py, dx, dy, best);
      return best;
    };
  }
  // A shape of thousands of edges (an engraving's leaf, a lettered badge) was tested edge by edge for every stitch of its column: put the
  // edges in a grid and let a ray look only at the cells it passes through, nearest first. The answer is the same.
  let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
  for (let k = 0; k < E.length; k += 4) {
    gx0 = Math.min(gx0, E[k], E[k + 2]); gx1 = Math.max(gx1, E[k], E[k + 2]);
    gy0 = Math.min(gy0, E[k + 1], E[k + 3]); gy1 = Math.max(gy1, E[k + 1], E[k + 3]);
  }
  const cell = Math.max(0.25, Math.sqrt(Math.max(1e-9, (gx1 - gx0) * (gy1 - gy0)) / m) * 2);
  const nx = Math.max(1, Math.floor((gx1 - gx0) / cell) + 1), ny = Math.max(1, Math.floor((gy1 - gy0) / cell) + 1);
  const cellOf = (v, lo, n) => Math.max(0, Math.min(n - 1, Math.floor((v - lo) / cell)));
  const count = new Int32Array(nx * ny + 1);
  const span = (k) => [cellOf(Math.min(E[k], E[k + 2]), gx0, nx), cellOf(Math.max(E[k], E[k + 2]), gx0, nx), cellOf(Math.min(E[k + 1], E[k + 3]), gy0, ny), cellOf(Math.max(E[k + 1], E[k + 3]), gy0, ny)];
  for (let k = 0; k < E.length; k += 4) { const [a, b, c, d] = span(k); for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) count[y * nx + x + 1]++; }
  for (let i = 1; i < count.length; i++) count[i] += count[i - 1];
  const fillAt = count.slice();
  const list = new Int32Array(count[nx * ny]);
  for (let k = 0; k < E.length; k += 4) { const [a, b, c, d] = span(k); for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) list[fillAt[y * nx + x]++] = k; }
  const seen = new Int32Array(m);
  let stamp = 0;
  return (px, py, dx, dy, maxD) => {
    let best = maxD;
    // enter the grid's box (the ray may start outside it)
    let t0 = 0;
    if (px < gx0 || px > gx1 || py < gy0 || py > gy1) {
      let lo = 0, hi = Infinity;
      for (const [p, d, a, b] of [[px, dx, gx0, gx1], [py, dy, gy0, gy1]]) {
        if (Math.abs(d) < 1e-12) { if (p < a || p > b) return best; continue; }
        let s = (a - p) / d, e = (b - p) / d;
        if (s > e) { const q = s; s = e; e = q; }
        lo = Math.max(lo, s); hi = Math.min(hi, e);
      }
      if (lo > hi || lo >= best) return best;
      t0 = Math.max(0, lo);
    }
    let cx = cellOf(px + t0 * dx, gx0, nx), cy = cellOf(py + t0 * dy, gy0, ny);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    const tdx = Math.abs(dx) < 1e-12 ? Infinity : cell / Math.abs(dx), tdy = Math.abs(dy) < 1e-12 ? Infinity : cell / Math.abs(dy);
    let tmx = tdx === Infinity ? Infinity : ((dx > 0 ? gx0 + (cx + 1) * cell : gx0 + cx * cell) - px) / dx;
    let tmy = tdy === Infinity ? Infinity : ((dy > 0 ? gy0 + (cy + 1) * cell : gy0 + cy * cell) - py) / dy;
    stamp++;
    for (;;) {
      const at = cy * nx + cx;
      for (let i = count[at]; i < count[at + 1]; i++) {
        const k = list[i];
        if (seen[k / 4] === stamp) continue;
        seen[k / 4] = stamp;
        best = hit(k, px, py, dx, dy, best);
      }
      let next;
      if (tmx < tmy) { next = tmx; cx += sx; tmx += tdx; } else { next = tmy; cy += sy; tmy += tdy; }
      if (next >= best || cx < 0 || cx >= nx || cy < 0 || cy >= ny || next === Infinity) break;
    }
    return best;
  };
}

function reversed(c) {
  return { ...c, pts: c.pts.slice().reverse(), half: c.half.slice().reverse(), a: c.b, b: c.a };
}

/** Which chain ends meet at each node. */
function incidence(chains) {
  const inc = new Map();
  const add = (node, ci, end) => { if (!inc.has(node)) inc.set(node, []); inc.get(node).push({ ci, end }); };
  chains.forEach((c, ci) => {
    if (c.dead) return;
    add(c.a, ci, 0);
    if (!c.closed) add(c.b, ci, 1);
  });
  return inc;
}

/** The direction pointing away from the node along a chain end (a unit vector), taken `reach` mm along the chain. */
function outward(c, end, reach) {
  const pts = end === 0 ? c.pts : c.pts.slice().reverse();
  if (pts.length < 2) return [1, 0]; // a chain of one point has no direction (a hairline lettering at full detail made one and stopped the whole job)
  let acc = 0, k = 1;
  while (k < pts.length - 1 && acc < reach) { acc += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); k++; }
  const dx = pts[k][0] - pts[0][0], dy = pts[k][1] - pts[0][1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

/**
 * Join strokes that run straight through a junction into one chain (a T becomes a bar and a stem; a + becomes two bars).
 * Returns the chains and, for each junction something ran through, how wide that stroke is there (`throughHalf`), so the
 * strokes that end on it can stop at its edge.
 */
function mergeThrough(chains, throughDeg) {
  const items = chains.map((c) => ({ ...c, pts: c.pts.slice(), half: c.half.slice(), dead: false }));
  const throughHalf = new Map();
  const limit = Math.cos((throughDeg * Math.PI) / 180);
  let changed = true;
  while (changed) {
    changed = false;
    const inc = incidence(items);
    for (const [node, ends] of inc) {
      if (ends.length < 3) continue;
      let best = null;
      for (let i = 0; i < ends.length; i++) {
        for (let j = i + 1; j < ends.length; j++) {
          if (ends[i].ci === ends[j].ci) continue;
          const ci = items[ends[i].ci], cj = items[ends[j].ci];
          const reach = Math.max(1, 1.2 * (ci.half[ends[i].end === 0 ? 0 : ci.half.length - 1] || 1));
          const d1 = outward(ci, ends[i].end, reach), d2 = outward(cj, ends[j].end, reach);
          const dot = d1[0] * d2[0] + d1[1] * d2[1];
          if (dot <= limit && (!best || dot < best.dot)) best = { dot, i, j };
        }
      }
      if (!best) continue;
      const ea = ends[best.i], eb = ends[best.j];
      let c1 = items[ea.ci], c2 = items[eb.ci];
      c1 = ea.end === 1 ? c1 : reversed(c1); // node at the end of c1
      c2 = eb.end === 0 ? c2 : reversed(c2); // node at the start of c2
      const merged = {
        pts: [...c1.pts, ...c2.pts.slice(1)],
        half: [...c1.half, ...c2.half.slice(1)],
        a: c1.a,
        b: c2.b,
        closed: false,
        dead: false,
      };
      if (merged.a === merged.b && merged.pts.length > 3) { merged.closed = true; merged.pts.pop(); merged.half.pop(); }
      const at = c1.half.length - 1;
      throughHalf.set(node, Math.max(throughHalf.get(node) || 0, (c1.half[at] + c2.half[0]) / 2));
      items[ea.ci].dead = true;
      items[eb.ci].dead = true;
      items.push(merged);
      changed = true;
      break;
    }
  }
  return { chains: items.filter((c) => !c.dead), throughHalf };
}

/** Cut `trim` mm off one end of a chain (end 0 = the start); a chain too short to lose it is left alone. */
function trimEnd(c, end, trim) {
  if (trim <= 0) return;
  const pts = end === 0 ? c.pts.slice().reverse() : c.pts.slice();
  const half = end === 0 ? c.half.slice().reverse() : c.half.slice();
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (len < trim + 0.8) return;
  let acc = 0, k = pts.length - 1;
  while (k > 0) {
    const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    if (acc + d >= trim) break;
    acc += d; k--;
  }
  if (k === 0) return;
  const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]) || 1;
  const t = (trim - acc) / d;
  const q = [pts[k][0] + (pts[k - 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k - 1][1] - pts[k][1]) * t];
  const np = [...pts.slice(0, k), q];
  const nh = [...half.slice(0, k), half[k - 1]];
  c.pts = end === 0 ? np.reverse() : np;
  c.half = end === 0 ? nh.reverse() : nh;
}

/** A stroke that ends on another stops at that stroke's edge (a little inside it, so no seam shows). */
function trimJunctionEnds(chains, throughHalf, overlap = 0.3) {
  const inc = incidence(chains);
  for (const [node, ends] of inc) {
    const h = throughHalf.get(node);
    if (!h || ends.length < 1) continue;
    for (const e of ends) trimEnd(chains[e.ci], e.end, Math.max(0, h - overlap));
  }
}

/**
 * Cut chains where they turn sharply (a V, the bend of a K), so each side is its own column, and run each cut end on past the
 * corner far enough that the two columns overlap there and cover the outside of the corner.
 */
function splitCorners(chains, ray, cornerDeg = 50) {
  const out = [];
  for (const c of chains) {
    const meanH = c.half.reduce((s, v) => s + v, 0) / c.half.length;
    const corners = findCorners(c.pts, { closed: c.closed, arc: Math.max(1.0, 0.9 * meanH), cornerDeg });
    if (!corners.length) { out.push(c); continue; }
    const n = c.pts.length;
    // Rotate a closed chain to begin at its first corner, so every piece runs from one corner to the next.
    let pts = c.pts, half = c.half, cs = corners;
    if (c.closed) {
      const r = corners[0].i;
      pts = [...c.pts.slice(r), ...c.pts.slice(0, r)];
      half = [...c.half.slice(r), ...c.half.slice(0, r)];
      cs = corners.map((k) => ({ i: (k.i - r + n) % n, turn: k.turn })).sort((a, b) => a.i - b.i);
      pts = [...pts, pts[0]]; half = [...half, half[0]]; // close the loop so the last piece ends at the first corner
    }
    const cuts = [0, ...cs.map((k) => k.i), pts.length - 1];
    const turnAt = new Map(cs.map((k) => [k.i, k.turn]));
    const dirAt = (idx, side) => {
      // The direction the line travels near a corner, `side` -1 = arriving, +1 = leaving.
      const reach = Math.max(0.8, 0.8 * meanH);
      let acc = 0, j = idx;
      while (acc < reach && j + side >= 0 && j + side < pts.length) { acc += Math.hypot(pts[j + side][0] - pts[j][0], pts[j + side][1] - pts[j][1]); j += side; }
      const dx = side < 0 ? pts[idx][0] - pts[j][0] : pts[j][0] - pts[idx][0], dy = side < 0 ? pts[idx][1] - pts[j][1] : pts[j][1] - pts[idx][1];
      const l = Math.hypot(dx, dy) || 1;
      return [dx / l, dy / l];
    };
    for (let q = 0; q + 1 < cuts.length; q++) {
      const a = cuts[q], b = cuts[q + 1];
      if (b <= a) continue;
      const piece = { pts: pts.slice(a, b + 1).map((p) => p.slice()), half: half.slice(a, b + 1), closed: false, a: c.a, b: c.b };
      if (turnAt.has(a)) {
        const d = dirAt(a, +1), h = half[a] || meanH;
        let ext = Math.min(h * Math.tan((turnAt.get(a) * Math.PI) / 360), 1.3 * h);
        ext = Math.min(ext, ray(pts[a][0], pts[a][1], -d[0], -d[1], ext + 0.2) - 0.1);
        if (ext > 0.05) { piece.pts.unshift([pts[a][0] - d[0] * ext, pts[a][1] - d[1] * ext]); piece.half.unshift(h); }
      }
      if (turnAt.has(b)) {
        const d = dirAt(b, -1), h = half[b] || meanH;
        let ext = Math.min(h * Math.tan((turnAt.get(b) * Math.PI) / 360), 1.3 * h);
        ext = Math.min(ext, ray(pts[b][0], pts[b][1], d[0], d[1], ext + 0.2) - 0.1);
        if (ext > 0.05) { piece.pts.push([pts[b][0] + d[0] * ext, pts[b][1] + d[1] * ext]); piece.half.push(h); }
      }
      out.push(piece);
    }
  }
  return out;
}

/** Stretch the free ends of a chain on to the tip of the shape. */
function extendTips(chains, ray, throughHalf) {
  const inc = incidence(chains);
  for (const c of chains) {
    if (c.closed) continue;
    for (const end of [0, 1]) {
      const node = end === 0 ? c.a : c.b;
      // A node something runs through is a junction, not a tip, even when only one piece is left ending there.
      if ((inc.get(node) || []).length !== 1 || throughHalf.has(node)) continue;
      const hEnd = c.half[end === 0 ? 0 : c.half.length - 1] || 1;
      const out = outward(c, end, Math.max(0.8, hEnd));
      const p = end === 0 ? c.pts[0] : c.pts[c.pts.length - 1];
      const dx = -out[0], dy = -out[1]; // away from the chain
      const d = ray(p[0], p[1], dx, dy, 2.5 * hEnd + 0.5);
      const go = Math.max(0, d - 0.05);
      if (go < 0.05) continue;
      const q = [p[0] + dx * go, p[1] + dy * go];
      if (end === 0) { c.pts.unshift(q); c.half.unshift(hEnd); } else { c.pts.push(q); c.half.push(hEnd); }
    }
  }
}

/** A moving average of a list of numbers over `r` neighbours each side (the ends use what they have). */
function smoothed(values, r) {
  return values.map((_, i) => {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(values.length - 1, i + r); j++) { s += values[j]; n++; }
    return s / n;
  });
}

/**
 * The shape with everything thinner than `2 * r` taken off (grown in, then grown back out). Falls back to the shape itself
 * if that would take away most of it.
 */
function openShape(rings, r) {
  if (!(r > 0)) return rings;
  const area = (rs) => islandsOf(rs).reduce((s, is) => s + ringArea(is.outer) - is.holes.reduce((q, h) => q + ringArea(h), 0), 0);
  const inner = offsetRings(rings, -r, { join: "round", arcTolerance: 0.02 });
  if (!inner.length) return rings;
  const opened = offsetRings(inner, r, { join: "round", arcTolerance: 0.02 });
  return opened.length && area(opened) >= 0.6 * area(rings) ? opened : rings;
}

/** Half width along a chain, by distance along it. */
function halfFn(line, half) {
  const cum = cumulativeLength(line);
  return (s) => {
    if (s <= 0) return half[0];
    if (s >= cum[cum.length - 1]) return half[half.length - 1];
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const t = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
    return half[lo] + (half[hi] - half[lo]) * t;
  };
}

/** The edge rails of a column for the underlay: points on the left and right, `inset` inside the edge, every `step` mm. */
function rails(line, closed, step, widthAt, inset) {
  const pts = dedupe(closed ? [...line, line[0]] : line);
  const cum = cumulativeLength(pts);
  const total = cum[cum.length - 1];
  const n = Math.max(2, Math.round(total / step));
  const left = [], right = [];
  let seg = 0;
  for (let k = 0; k <= n; k++) {
    const s = (total * k) / n;
    while (seg < pts.length - 2 && cum[seg + 1] < s) seg++;
    const a = pts[seg], b = pts[seg + 1];
    const l = cum[seg + 1] - cum[seg] || 1;
    const t = (s - cum[seg]) / l;
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    const dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1;
    const nx = dy / dl, ny = -dx / dl;
    const [wl, wr] = widthAt(s, { x, y }, nx, ny, false);
    const lw = Math.max(0, wl - inset), rw = Math.max(0, wr - inset);
    left.push([x + nx * lw, y + ny * lw]);
    right.push([x - nx * rw, y - ny * rw]);
  }
  if (closed) { left.pop(); right.pop(); }
  return { left, right };
}

/**
 * Stitch an island as satin columns.
 *
 * @param {number[][][]} rings  one island (outer ring and its holes)
 * @param {object} o  see SATIN_DEFAULTS, plus start: [x, y] where the needle is
 * @returns {null | { paths: number[][][], tops: number[][][], topLength: number, columns: number, maxWidth: number, meanWidth: number, length: number }}
 *   `paths` is everything sewn (underlay and top), `tops` only the top stitches, `topLength` their total length
 *   null when the shape has no stroke to follow (a dot, a blob)
 */
export function satinIsland(rings, o = {}) {
  const opt = { ...SATIN_DEFAULTS, ...o };
  // Parts thinner than a thread can be sewn (hairline serifs, spiky tips) are dropped before the columns are laid out: they
  // would only make stitches fly out sideways. The coverage check still looks at the shape as it was.
  const core = openShape(rings, opt.minStroke / 2);
  const sk = strokeCenterlines(core);
  if (!sk.chains.length) return null;
  const ray = makeRay(core);

  let chains = sk.chains.map((c) => ({ ...c, pts: c.pts, half: c.half, dead: false }));
  const merged = mergeThrough(chains, opt.throughDeg);
  chains = merged.chains;
  trimJunctionEnds(chains, merged.throughHalf);
  extendTips(chains, ray, merged.throughHalf);
  chains = splitCorners(chains, ray);

  const columns = [];
  let widthSum = 0, widthN = 0, widest = 0, lengthSum = 0;
  for (const c of chains) {
    const line = dedupe(c.pts);
    if (line.length < 2) continue;
    const cum = cumulativeLength(line);
    const total = cum[cum.length - 1];
    if (total < 0.5) continue;
    const halfAt = halfFn(c.pts, smoothed(c.half, 5));
    // Each side is measured to the edge by a ray, but kept within reach of the stroke's own half width there, so a notch or a
    // junction cannot send a stitch far out (or in).
    const widthAt = (s, base, nx, ny) => {
      const h = halfAt(s);
      const hi = Math.min(opt.maxWidth / 2 + 0.6, 1.3 * h + 0.15), lo = 0.6 * h;
      const wl = ray(base.x, base.y, nx, ny, hi), wr = ray(base.x, base.y, -nx, -ny, hi);
      return [Math.max(lo, wl), Math.max(lo, wr)];
    };
    let mean = 0;
    for (const v of c.half) mean += v;
    mean = (2 * mean) / c.half.length; // mean full width
    widthSum += mean * total; widthN += total; lengthSum += total;
    for (const v of c.half) if (2 * v > widest) widest = 2 * v;
    columns.push({ line, closed: c.closed, halfAt, widthAt, mean, total });
  }
  if (!columns.length) return null;

  // Underlay plan for a column from its width.
  const plan = (col) => {
    if (opt.underlay === "none") return [];
    if (opt.underlay === "center") return ["center"];
    if (opt.underlay === "edge") return ["edge"];
    if (opt.underlay === "center+edge") return ["center", "edge"];
    if (col.mean < 1.0) return [];
    if (col.mean < 3.2) return ["center"];
    if (col.mean < 5.5) return ["edge"];
    return ["center", "edge"];
  };

  /** All the stitches of one column when it is begun at its start (or, with `flip`, at its far end). */
  const build = (col, flip, rot = 0) => {
    let line = col.line;
    if (col.closed && rot) line = [...line.slice(rot), ...line.slice(0, rot)];
    if (flip) line = line.slice().reverse();
    const closed = col.closed;
    const under = [];
    let atStart = true;
    for (const u of plan(col)) {
      if (u === "center") {
        const run = runAlong(atStart ? line : line.slice().reverse(), { len: opt.underlayLen, closed });
        for (const p of run) under.push(p);
        if (!closed) atStart = !atStart;
      } else if (u === "edge") {
        const { left, right } = rails(line, closed, opt.underlayLen, col.widthAt, opt.inset);
        const L = runAlong(left, { len: opt.underlayLen, closed }), Rr = runAlong(right, { len: opt.underlayLen, closed });
        if (closed) {
          for (const p of atStart ? [...L, L[0], ...Rr, Rr[0]] : [...Rr, Rr[0], ...L, L[0]]) under.push(p);
        } else if (atStart) {
          for (const p of L) under.push(p);
          for (const p of Rr.slice().reverse()) under.push(p);
        } else {
          // Begun at the far end: back along the right rail, then forward along the left, so it ends where it began.
          for (const p of Rr.slice().reverse()) under.push(p);
          for (const p of L) under.push(p);
        }
      }
    }
    const top = satinAlong(atStart ? line : line.slice().reverse(), { spacing: opt.spacing, closed, widthAt: col.widthAt, pullComp: opt.pullComp, start: atStart ? "left" : "right" });
    return { under, top };
  };

  // Order the columns: always the nearest start to the needle, starting from either end.
  const paths = [];
  const tops = []; // the visible satin of each column, without its underlay (the coverage check looks at these)
  const todo = columns.slice();
  let needle = o.start || null;
  if (!needle) {
    const box = bboxOf(rings);
    needle = [box[0], box[1]];
  }
  while (todo.length) {
    let best = null;
    todo.forEach((col, i) => {
      const options = col.closed
        ? Array.from({ length: Math.min(col.line.length, 12) }, (_, k) => ({ flip: false, rot: Math.floor((k * col.line.length) / Math.min(col.line.length, 12)) }))
        : [{ flip: false, rot: 0 }, { flip: true, rot: 0 }];
      for (const op of options) {
        const first = op.flip ? col.line[col.line.length - 1] : col.line[op.rot || 0];
        const d = Math.hypot(first[0] - needle[0], first[1] - needle[1]);
        if (!best || d < best.d) best = { d, i, ...op };
      }
    });
    const [col] = todo.splice(best.i, 1);
    const { under, top } = build(col, best.flip, best.rot);
    const pts = [...under, ...top];
    const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);
    paths.push(clean);
    tops.push(top);
    needle = clean[clean.length - 1];
  }
  let topLength = 0;
  for (const t of tops) for (let i = 1; i < t.length; i++) topLength += Math.hypot(t[i][0] - t[i - 1][0], t[i][1] - t[i - 1][1]);
  return { paths, tops, topLength, columns: columns.length, maxWidth: widest, meanWidth: widthN ? widthSum / widthN : 0, length: lengthSum, skeleton: sk };
}

/**
 * A thin island (hairline calligraphy, small lettering, the lines of line art) as lines of bean stitch along its centre lines.
 * A satin column cannot be narrower than about a millimetre (it bunches, and it closes up the holes of small letters), and a fill
 * cannot leave a gap that small, but one line of thread can be as thin as 0.4 mm and follows the drawing exactly. The centre
 * lines are the skeleton's: strokes that run straight through a junction are one line, free ends are run on to the tip.
 *
 * @param {number[][][]} rings  one island (outer ring and its holes)
 * @param {object} o  meanWidth (mm, the strokes' average width may not be more; default 0.7), maxWidth (mm, the usual width of its widest 10%; default 1.1),
 *   minLength (mm of centre line in all; default 1), len (longest stretch of one stitch, default 2), dev (how far a stitch may cut
 *   across a curve, default 0.07), throughDeg, start: [x, y] where the needle is
 * @returns {null | { paths: number[][][], lines: number, meanWidth: number, maxWidth: number, length: number }}
 *   `paths` are the lines in sewing order; null when the island is not a thin stroke (a dot, a blob, anything wider)
 */
export function lineIsland(rings, o = {}) {
  const opt = { meanWidth: 0.7, maxWidth: 1.1, minLength: 1, len: 2, dev: 0.07, throughDeg: SATIN_DEFAULTS.throughDeg, ...o };
  const sk = strokeCenterlines(rings, o.res ? { res: o.res } : {});
  if (!sk.chains.length) return null;
  // Where lines cross or letters touch there is a small blob wider than the strokes: judge the island by its usual width (the
  // 90th percentile of the widths along its lines), not by its single widest point.
  const halves = [];
  for (const c of sk.chains) for (const v of c.half) halves.push(v);
  halves.sort((a, b) => a - b);
  const meanWidth = 2 * sk.meanHalf, maxWidth = 2 * sk.maxHalf;
  const usualWidth = 2 * (halves[Math.min(halves.length - 1, Math.floor(halves.length * 0.9))] || 0);
  if (meanWidth > opt.meanWidth || usualWidth > opt.maxWidth || sk.length < opt.minLength) return null;
  const ray = makeRay(rings);
  const merged = mergeThrough(sk.chains.map((c) => ({ ...c, pts: c.pts, half: c.half, dead: false })), opt.throughDeg);
  const chains = merged.chains;
  extendTips(chains, ray, merged.throughHalf);

  // Always on to the nearest end of the nearest line, so the needle does not cross the island to reach the next one.
  const todo = chains.map((c) => ({ pts: dedupe(c.pts), closed: c.closed })).filter((c) => c.pts.length >= 2);
  if (!todo.length) return null;
  let needle = opt.start || null;
  if (!needle) { const box = bboxOf(rings); needle = [box[0], box[1]]; }
  const paths = [];
  while (todo.length) {
    let best = null;
    todo.forEach((c, i) => {
      const n = c.pts.length;
      // a loop may be begun at any of a dozen points; an open line at either end
      const options = c.closed ? Array.from({ length: Math.min(n, 12) }, (_, k) => ({ flip: false, rot: Math.floor((k * n) / Math.min(n, 12)) })) : [{ flip: false, rot: 0 }, { flip: true, rot: 0 }];
      for (const op of options) {
        const first = op.flip ? c.pts[n - 1] : c.pts[op.rot];
        const d = Math.hypot(first[0] - needle[0], first[1] - needle[1]);
        if (!best || d < best.d) best = { d, i, ...op };
      }
    });
    const [c] = todo.splice(best.i, 1);
    let line = c.pts;
    if (c.closed && best.rot) line = [...line.slice(best.rot), ...line.slice(0, best.rot)];
    if (best.flip) line = line.slice().reverse();
    const pts = beanAlong(line, { len: opt.len, dev: opt.dev, closed: c.closed });
    if (pts.length < 2) continue;
    paths.push(pts);
    needle = pts[pts.length - 1];
  }
  if (!paths.length) return null;
  return { paths, lines: paths.length, meanWidth, maxWidth, length: sk.length };
}

import { pointInRings, distanceToRings } from "./poly.js";

/**
 * Centre lines of strokes: the "skeleton" of a shape. A satin column needs the line down the middle of a stroke and how
 * wide the stroke is at every point of it, and a polygon does not say either, so the shape is drawn on a fine grid, thinned
 * to a one-pixel line, and the line is turned back into smooth polylines in millimetres.
 *
 * Steps: draw the rings on a grid (even-odd), measure every pixel's distance to the edge, thin the shape to a line, follow the
 * line into pieces between junctions and ends, drop the little spurs that bumpy edges grow, smooth what is left.
 */

/** Draw the rings into a 0/1 grid. `res` pixels per mm; `pad` empty pixels all round. */
export function rasterizeRings(rings, res, pad = 3) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const ox = x0 - pad / res, oy = y0 - pad / res;
  const w = Math.ceil((x1 - x0) * res) + 2 * pad + 1, h = Math.ceil((y1 - y0) * res) + 2 * pad + 1;
  const mask = new Uint8Array(w * h);
  const rows = Array.from({ length: h }, () => []);
  for (const ring of rings) {
    for (let i = 0, n = ring.length; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n];
      if (p[1] === q[1]) continue;
      const [lo, hi] = p[1] < q[1] ? [p, q] : [q, p];
      const j0 = Math.max(0, Math.floor((lo[1] - oy) * res - 0.5) - 1), j1 = Math.min(h - 1, Math.ceil((hi[1] - oy) * res - 0.5) + 1);
      for (let j = j0; j <= j1; j++) {
        const y = oy + (j + 0.5) / res;
        if ((p[1] <= y) !== (q[1] <= y)) rows[j].push(p[0] + ((q[0] - p[0]) * (y - p[1])) / (q[1] - p[1]));
      }
    }
  }
  for (let j = 0; j < h; j++) {
    const xs = rows[j].sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - ox) * res - 0.5)), i1 = Math.min(w - 1, Math.ceil((xs[k + 1] - ox) * res - 0.5) - 1);
      for (let i = i0; i <= i1; i++) mask[j * w + i] = 1;
    }
  }
  return { w, h, ox, oy, res, mask };
}

/** Distance (in pixels) from every filled pixel to the nearest empty one (Felzenszwalb-Huttenlocher, exact). */
export function distanceTransform(mask, w, h) {
  const INF = 1e20;
  const f = new Float32Array(w * h);
  for (let i = 0; i < f.length; i++) f[i] = mask[i] ? INF : 0;
  const n = Math.max(w, h);
  const d = new Float32Array(n), v = new Int32Array(n), z = new Float32Array(n + 1);
  const pass = (get, set, len) => {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s;
      for (;;) {
        const p = v[k];
        s = ((get(q) + q * q) - (get(p) + p * p)) / (2 * q - 2 * p);
        if (s <= z[k] && k > 0) k--; else break;
      }
      k++;
      v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const p = v[k];
      d[q] = (q - p) * (q - p) + get(p);
    }
    for (let q = 0; q < len; q++) set(q, d[q]);
  };
  for (let x = 0; x < w; x++) pass((q) => f[q * w + x], (q, val) => { f[q * w + x] = val; }, h);
  for (let y = 0; y < h; y++) pass((q) => f[y * w + q], (q, val) => { f[y * w + q] = val; }, w);
  for (let i = 0; i < f.length; i++) f[i] = Math.sqrt(f[i]);
  return f;
}

/** Zhang-Suen thinning, then a pass that removes pixels the line does not need. Returns a new 0/1 grid. */
export function thin(maskIn, w, h) {
  const img = Uint8Array.from(maskIn);
  const del = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!img[i]) continue;
          const p2 = img[i - w], p3 = img[i - w + 1], p4 = img[i + 1], p5 = img[i + w + 1], p6 = img[i + w], p7 = img[i + w - 1], p8 = img[i - 1], p9 = img[i - w - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
          if (A !== 1) continue;
          if (pass === 0) { if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue; } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          del.push(i);
        }
      }
      for (const i of del) img[i] = 0;
      if (del.length) changed = true;
    }
  }
  // Remove pixels whose neighbours are already joined without them (keeps ends and junctions).
  let again = true;
  while (again) {
    again = false;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!img[i]) continue;
        const p2 = img[i - w], p3 = img[i - w + 1], p4 = img[i + 1], p5 = img[i + w + 1], p6 = img[i + w], p7 = img[i + w - 1], p8 = img[i - 1], p9 = img[i - w - 1];
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2) continue;
        const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
        if (A === 1 && B >= 3) { img[i] = 0; again = true; }
        else if (B === 2 && A === 2) {
          // A staircase corner: its two neighbours touch each other diagonally, so the corner itself is not needed.
          if ((p2 && p4 && !p3) || (p4 && p6 && !p5) || (p6 && p8 && !p7) || (p8 && p2 && !p9)) { img[i] = 0; again = true; }
        }
      }
    }
  }
  return img;
}

const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/**
 * Follow a thin line into a graph. Pixels with one neighbour are ends, with three or more are junctions (touching junction
 * pixels are one node), the rest belong to the pieces between nodes.
 * @returns {{ nodes: {id, x, y, edges: number[]}[], chains: {a, b, px: number[][]}[] }}  (chain.px are [x, y] pixel positions, a and b node ids, a === b for a loop)
 */
export function skeletonGraph(skel, w, h) {
  const idx = (x, y) => y * w + x;
  const deg = new Uint8Array(w * h);
  const list = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!skel[idx(x, y)]) continue;
      let c = 0;
      for (const [dx, dy] of N8) if (skel[idx(x + dx, y + dy)]) c++;
      deg[idx(x, y)] = c;
      list.push([x, y]);
    }
  }
  const isNode = (i) => deg[i] !== 2 && deg[i] !== 0;
  // Group junction pixels that touch.
  const nodeOf = new Int32Array(w * h).fill(-1);
  const nodes = [];
  for (const [x, y] of list) {
    const i = idx(x, y);
    if (!isNode(i) || nodeOf[i] >= 0) continue;
    const id = nodes.length;
    const members = [[x, y]];
    nodeOf[i] = id;
    for (let k = 0; k < members.length; k++) {
      const [mx, my] = members[k];
      for (const [dx, dy] of N8) {
        const nx = mx + dx, ny = my + dy, ni = idx(nx, ny);
        if (skel[ni] && isNode(ni) && nodeOf[ni] < 0) { nodeOf[ni] = id; members.push([nx, ny]); }
      }
    }
    let sx = 0, sy = 0;
    for (const m of members) { sx += m[0]; sy += m[1]; }
    nodes.push({ id, x: sx / members.length, y: sy / members.length, members, edges: [] });
  }
  const visited = new Uint8Array(w * h);
  const chains = [];
  const addChain = (a, b, px) => {
    const id = chains.length;
    chains.push({ a, b, px });
    nodes[a]?.edges.push(id);
    if (b !== a) nodes[b]?.edges.push(id);
    else nodes[a]?.edges.push(id);
  };
  const walk = (startNode, sx, sy, fx, fy) => {
    // from a pixel of the node (sx, sy) step to the path pixel (fx, fy) and follow it
    const px = [[sx, sy], [fx, fy]];
    let px0 = sx, py0 = sy, cx = fx, cy = fy;
    visited[idx(cx, cy)] = 1;
    let endNode = -1;
    for (;;) {
      let nx = -1, ny = -1, hit = -1;
      for (const [dx, dy] of N8) {
        const x = cx + dx, y = cy + dy, i = idx(x, y);
        if (!skel[i] || (x === px0 && y === py0)) continue;
        if (isNode(i)) { hit = nodeOf[i]; nx = x; ny = y; break; }
        if (!visited[i]) { nx = x; ny = y; }
      }
      if (nx < 0) { endNode = -2; break; }
      px.push([nx, ny]);
      if (hit >= 0) { endNode = hit; break; }
      visited[idx(nx, ny)] = 1;
      px0 = cx; py0 = cy; cx = nx; cy = ny;
    }
    if (endNode >= 0) addChain(startNode, endNode, px);
    else addChain(startNode, startNode, px); // a dead end that is not a node cannot happen; keep it as a loop piece
  };
  for (const node of nodes) {
    for (const [mx, my] of node.members) {
      for (const [dx, dy] of N8) {
        const x = mx + dx, y = my + dy, i = idx(x, y);
        if (!skel[i] || isNode(i) || visited[i]) continue;
        walk(node.id, mx, my, x, y);
      }
    }
  }
  // Pieces made of a single step between two nodes (touching, but not the same node) are not chains of pixels; they merge nodes already.
  // Loops with no node at all.
  for (const [x, y] of list) {
    const i = idx(x, y);
    if (visited[i] || isNode(i)) continue;
    // Make this pixel a node so the loop has an anchor.
    const id = nodes.length;
    nodes.push({ id, x, y, members: [[x, y]], edges: [] });
    nodeOf[i] = id;
    deg[i] = 3; // act as a node for the walk
    visited[i] = 1;
    let first = null;
    for (const [dx, dy] of N8) { const nx = x + dx, ny = y + dy; if (skel[idx(nx, ny)] && !visited[idx(nx, ny)]) { first = [nx, ny]; break; } }
    if (!first) { continue; }
    walk(id, x, y, first[0], first[1]);
  }
  return { nodes, chains };
}

/** Smooth a polyline with a moving average over `win` points (the ends stay put). */
export function smoothLine(pts, win, closed = false) {
  const n = pts.length;
  if (n < 3 || win < 1) return pts.map((p) => p.slice());
  const out = pts.map((p) => p.slice());
  const half = Math.max(1, win | 0);
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    let sx = 0, sy = 0, c = 0;
    const reach = closed ? half : Math.min(half, i, n - 1 - i);
    for (let k = -reach; k <= reach; k++) {
      const j = closed ? (i + k + n) % n : i + k;
      sx += pts[j][0]; sy += pts[j][1]; c++;
    }
    out[i] = [sx / c, sy / c];
  }
  return out;
}

/**
 * The vertices of a polyline where it turns by more than `cornerDeg` between the directions `arc` mm before and after.
 * Returns [{ i, turn (degrees) }] in order along the line (for an open line the two ends are never corners).
 */
export function findCorners(pts, { closed = false, arc = 1.0, cornerDeg = 50 } = {}) {
  const n = pts.length;
  const out = [];
  if (n < 3) return out;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[n - 1] + (closed ? Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) : 0);
  const pointAt = (s) => {
    // The point `s` mm along the line (wrapping for a closed one).
    if (closed) s = ((s % total) + total) % total;
    else s = Math.max(0, Math.min(cum[n - 1], s));
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    if (closed && s >= cum[n - 1]) {
      const t = (s - cum[n - 1]) / ((total - cum[n - 1]) || 1);
      return [pts[n - 1][0] + (pts[0][0] - pts[n - 1][0]) * t, pts[n - 1][1] + (pts[0][1] - pts[n - 1][1]) * t];
    }
    const t = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
    return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
  };
  const turns = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const s = cum[i];
    if (!closed && (s < 0.3 || total - s < 0.3)) continue;
    const reachB = closed ? arc : Math.min(arc, s), reachF = closed ? arc : Math.min(arc, cum[n - 1] - s);
    const a = pointAt(s - reachB), b = pts[i], c = pointAt(s + reachF);
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < 1e-9 || lv < 1e-9) continue;
    turns[i] = (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))) * 180) / Math.PI;
  }
  for (let i = 0; i < n; i++) {
    if (turns[i] < cornerDeg) continue;
    // Only the sharpest vertex of a run of sharp ones.
    let best = true;
    for (let j = i - 1; j >= 0 && cum[i] - cum[j] < arc; j--) if (turns[j] > turns[i]) { best = false; break; }
    for (let j = i + 1; j < n && cum[j] - cum[i] < arc && best; j++) if (turns[j] >= turns[i]) { best = false; break; }
    if (best) out.push({ i, turn: turns[i] });
  }
  return out;
}

/** Points `step` apart along an open or closed polyline (the first point is kept; for a closed one the last gap closes the loop). */
export function resampleLine(pts, step, closed = false) {
  const src = closed ? [...pts, pts[0]] : pts;
  const out = [src[0]];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let pos = step - carry;
    while (pos < d - 1e-9) { out.push([a[0] + ((b[0] - a[0]) * pos) / d, a[1] + ((b[1] - a[1]) * pos) / d]); pos += step; }
    carry = d - (pos - step);
  }
  const last = src[src.length - 1];
  const tail = out[out.length - 1];
  if (closed) { if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) < step * 0.5 && out.length > 1) out.pop(); }
  else if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 1e-6) out.push(last);
  return out;
}

/**
 * Make a thinned line a clean curve: even spacing, a gentle Gaussian smoothing, but real corners (a V, the bend of a K) kept
 * sharp. A corner is a turn of more than `cornerDeg` between the directions `arc` mm before and after it; the line is
 * smoothed on each side of it separately and the two sides are run on until they meet, which puts the corner back where the
 * stroke's centre really bends (thinning rounds it off).
 */
export function refineLine(pts, { closed = false, step = 0.2, sigma = 0.5, arc = 1.4, cornerDeg = 42, cornerNear = 0.8, inside = null } = {}) {
  let line = resampleLine(pts, step, closed);
  const n = line.length;
  if (n < 5) return { pts: line, corners: [] };
  const k = Math.max(2, Math.round(arc / step));
  // Turning angle at each point from the chords k steps either side.
  const turn = new Float32Array(n);
  const at = (i) => (closed ? line[((i % n) + n) % n] : line[Math.max(0, Math.min(n - 1, i))]);
  for (let i = 0; i < n; i++) {
    if (!closed && (i < k || i > n - 1 - k)) continue;
    const a = at(i - k), b = line[i], c = at(i + k);
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < 1e-9 || lv < 1e-9) continue;
    turn[i] = (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))) * 180) / Math.PI;
  }
  const corners = [];
  for (let i = 0; i < n; i++) {
    if (turn[i] < cornerDeg) continue;
    let isMax = true;
    for (let j = -k; j <= k && isMax; j++) {
      const m = closed ? ((i + j) % n + n) % n : i + j;
      if (m < 0 || m >= n || m === i) continue;
      if (turn[m] > turn[i] || (turn[m] === turn[i] && m < i)) isMax = false;
    }
    if (isMax) corners.push(i);
  }
  // Smooth between the pinned points (corners and, for an open line, both ends).
  const pins = [...(closed ? [] : [0, n - 1]), ...corners].sort((a, b) => a - b);
  const w = Math.max(1, Math.round((sigma * 2.5) / step));
  const gauss = Array.from({ length: 2 * w + 1 }, (_, j) => Math.exp(-0.5 * ((j - w) * step / sigma) ** 2));
  const smooth = (lo, hi, wrap) => {
    // Smooth indices lo..hi (inclusive, in unwrapped numbers) with lo and hi fixed.
    const src = [];
    for (let i = lo; i <= hi; i++) src.push(wrap ? line[((i % n) + n) % n] : line[i]);
    const m = src.length;
    const res = src.map((p) => p.slice());
    for (let i = 1; i < m - 1; i++) {
      const reach = Math.min(w, i, m - 1 - i);
      let sx = 0, sy = 0, sw = 0;
      for (let j = -reach; j <= reach; j++) { const g = gauss[j + w]; sx += src[i + j][0] * g; sy += src[i + j][1] * g; sw += g; }
      res[i] = [sx / sw, sy / sw];
    }
    return res;
  };
  let out;
  if (!pins.length) {
    // A closed line with no corner: smooth all the way round by repeating it.
    const ext = [];
    for (let r = -1; r <= 1; r++) for (let i = 0; i < n; i++) ext.push(line[i]);
    const ex = ext.map((p) => p.slice());
    for (let i = w; i < ext.length - w; i++) {
      let sx = 0, sy = 0, sw = 0;
      for (let j = -w; j <= w; j++) { const g = gauss[j + w]; sx += ext[i + j][0] * g; sy += ext[i + j][1] * g; sw += g; }
      ex[i] = [sx / sw, sy / sw];
    }
    out = ex.slice(n, 2 * n);
  } else {
    out = line.map((p) => p.slice());
    const m = pins.length;
    const pairs = closed ? m : m - 1;
    for (let q = 0; q < pairs; q++) {
      const lo = pins[q];
      let hi = pins[(q + 1) % m];
      if (hi <= lo) hi += n;
      const piece = smooth(lo, hi, closed);
      for (let i = lo; i <= hi; i++) out[((i % n) + n) % n] = piece[i - lo];
    }
  }
  // Put each corner back where the two smoothed sides meet.
  const finalCorners = [];
  for (const c of corners) {
    const back = [], fwd = [];
    const near = Math.max(2, Math.round(cornerNear / step)), far = near + Math.max(4, Math.round(1.2 / step));
    const idx = (i) => ((i % n) + n) % n;
    const haveBack = closed || c - far >= 0, haveFwd = closed || c + far < n;
    if (haveBack && haveFwd) {
      // The two sides, each a line fitted from `far` to `near` steps away from the corner, then run on until they meet.
      const b1 = out[idx(c - far)], b2 = out[idx(c - near)], f1 = out[idx(c + near)], f2 = out[idx(c + far)];
      const d1 = [b2[0] - b1[0], b2[1] - b1[1]], d2 = [f2[0] - f1[0], f2[1] - f1[1]];
      const den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) > 1e-6) {
        const t = ((f1[0] - b2[0]) * d2[1] - (f1[1] - b2[1]) * d2[0]) / den;
        const x = b2[0] + d1[0] * t, y = b2[1] + d1[1] * t;
        const reach = Math.hypot(x - out[c][0], y - out[c][1]);
        if (reach < arc * 1.5 && t > 0) {
          // The corner must stay inside the shape: where the two centre lines meet beyond the edge (the top of an M), pull it
          // back toward where thinning put it until it is inside.
          let px = x, py = y;
          if (inside) {
            const ox = out[c][0], oy = out[c][1];
            for (let f = 1; f >= 0 && !inside(px, py); f -= 0.1) { px = ox + (x - ox) * f; py = oy + (y - oy) * f; }
          }
          // Straight runs into the new corner point from either side.
          for (let j = 1; j < near; j++) {
            const u = j / near; // 0 at the corner, 1 at `near` steps away
            out[idx(c - j)] = [px + (b2[0] - px) * u, py + (b2[1] - py) * u];
            out[idx(c + j)] = [px + (f1[0] - px) * u, py + (f1[1] - py) * u];
          }
          out[c] = [px, py];
        }
      }
    }
    finalCorners.push(c);
  }
  return { pts: out, corners: finalCorners };
}

/**
 * The centre lines of a shape's strokes.
 *
 * @param {number[][][]} rings  the island's rings (even-odd), millimetres
 * @param {object} o  res (pixels per mm; default chosen so the grid stays near a million pixels), pruneRatio (a spur shorter than this
 *   times the stroke's half width is dropped, default 1.6), smooth (moving-average half window in mm, default 0.35)
 * @returns {{ chains: {pts: number[][], half: number[], closed: boolean, a: number, b: number}[], nodes, maxHalf: number, meanHalf: number, length: number, res: number }}
 *   pts in mm, half = half width of the stroke at each point (mm, to the nearest edge), a/b the node ids at each end
 */
export function strokeCenterlines(rings, o = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const area = Math.max(1, (x1 - x0) * (y1 - y0));
  const res = o.res || Math.max(3, Math.min(10, Math.sqrt(1.2e6 / area)));
  const grid = rasterizeRings(rings, res);
  const { w, h, mask, ox, oy } = grid;
  const dt = distanceTransform(mask, w, h);
  const skel = thin(mask, w, h);
  const g = skeletonGraph(skel, w, h);
  const pruneRatio = o.pruneRatio ?? 1.6;

  // Work on a mutable copy: chains by id, nodes by id.
  const chains = g.chains.map((c, id) => ({ id, a: c.a, b: c.b, px: c.px, dead: false }));
  const nodes = g.nodes.map((nd) => ({ ...nd, edges: new Set() }));
  chains.forEach((c) => { nodes[c.a].edges.add(c.id); nodes[c.b].edges.add(c.id); });
  const dtAt = (x, y) => dt[Math.round(y) * w + Math.round(x)];
  const lengthPx = (px) => { let s = 0; for (let i = 1; i < px.length; i++) s += Math.hypot(px[i][0] - px[i - 1][0], px[i][1] - px[i - 1][1]); return s; };
  const degreeOf = (nd) => { let c = 0; for (const id of nd.edges) c += chains[id].a === chains[id].b ? 2 : 1; return c; };

  // Prune spurs: a short piece that ends in nothing and starts at a junction.
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of chains) {
      if (c.dead || c.a === c.b) continue;
      const na = nodes[c.a], nb = nodes[c.b];
      const da = degreeOf(na), db = degreeOf(nb);
      let spurEnd = -1, freeEnd = -1;
      if (da === 1 && db >= 3) { spurEnd = c.b; freeEnd = c.a; }
      else if (db === 1 && da >= 3) { spurEnd = c.a; freeEnd = c.b; }
      if (spurEnd < 0) continue;
      const j = nodes[spurEnd];
      const r = dtAt(j.x, j.y);
      // A spur is short for the stroke it sits on AND ends where the shape is thin (a bump on an edge). A short branch that ends
      // as wide as the stroke it leaves (the foot of an A below its crossbar) is a real stroke, not a spur.
      const len = lengthPx(c.px);
      const endR = dtAt(nodes[freeEnd].x, nodes[freeEnd].y);
      if (len < 0.8 * r + 1.5 || (len < pruneRatio * r + 1.5 && endR < 0.65 * r)) {
        c.dead = true; changed = true;
        nodes[c.a].edges.delete(c.id); nodes[c.b].edges.delete(c.id);
      }
    }
    // A junction left with two pieces is just a bend: join them.
    for (const nd of nodes) {
      if (degreeOf(nd) !== 2 || nd.edges.size !== 2) continue;
      const [i1, i2] = [...nd.edges];
      const c1 = chains[i1], c2 = chains[i2];
      if (c1.dead || c2.dead || c1.a === c1.b || c2.a === c2.b) continue;
      // Orient c1 to end at nd and c2 to start at nd, then concatenate.
      const px1 = c1.b === nd.id ? c1.px : c1.px.slice().reverse();
      const a1 = c1.b === nd.id ? c1.a : c1.b;
      const px2 = c2.a === nd.id ? c2.px : c2.px.slice().reverse();
      const b2 = c2.a === nd.id ? c2.b : c2.a;
      const merged = { id: chains.length, a: a1, b: b2, px: [...px1.slice(0, -1), ...px2], dead: false };
      chains.push(merged);
      c1.dead = c2.dead = true;
      nodes[a1].edges.delete(c1.id); nodes[b2].edges.delete(c2.id); nd.edges.clear();
      nodes[a1].edges.add(merged.id); nodes[b2].edges.add(merged.id);
      changed = true;
    }
  }

  const smoothMm = o.smooth ?? 0.35;
  const insideShape = (x, y) => pointInRings(x, y, rings) && distanceToRings(x, y, rings) > 0.2;
  const dtAtMm = (x, y) => {
    const i = Math.max(0, Math.min(w - 1, Math.round((x - ox) * res - 0.5))), j = Math.max(0, Math.min(h - 1, Math.round((y - oy) * res - 0.5)));
    return dt[j * w + i] / res;
  };
  const out = [];
  let sumHalf = 0, cnt = 0, maxHalf = 0, total = 0;
  for (const c of chains) {
    if (c.dead) continue;
    const mm = c.px.map(([x, y]) => [ox + (x + 0.5) / res, oy + (y + 0.5) / res]);
    // The ends sit on node centres, which can be a little off the line: use the node's own centre.
    const na = nodes[c.a], nb = nodes[c.b];
    mm[0] = [ox + (na.x + 0.5) / res, oy + (na.y + 0.5) / res];
    mm[mm.length - 1] = [ox + (nb.x + 0.5) / res, oy + (nb.y + 0.5) / res];
    const closed = c.a === c.b && degreeOf(na) === 2;
    let hs = 0;
    for (const [x, y] of c.px) hs += dt[y * w + x] / res;
    const meanH = hs / c.px.length;
    const ref = refineLine(mm, { closed, step: 0.2, sigma: Math.max(smoothMm, 0.45 * meanH), arc: Math.max(1.0, 1.2 * meanH), cornerNear: Math.max(0.6, meanH), inside: insideShape });
    const pts = ref.pts;
    const half = pts.map(([x, y]) => dtAtMm(x, y));
    for (const v of half) { sumHalf += v; cnt++; if (v > maxHalf) maxHalf = v; }
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    total += len;
    out.push({ pts, half, closed, a: c.a, b: c.b });
  }
  return { chains: out, nodes: nodes.map((nd) => ({ id: nd.id, x: ox + (nd.x + 0.5) / res, y: oy + (nd.y + 0.5) / res, degree: degreeOf(nd) })), maxHalf, meanHalf: cnt ? sumHalf / cnt : 0, length: total, res };
}

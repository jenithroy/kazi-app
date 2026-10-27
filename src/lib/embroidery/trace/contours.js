/**
 * Outlines between regions of a label map, drawn so that two regions that touch share exactly the same line.
 *
 * Think of the pixel corners as a grid of points ("lattice vertices") and of the line between two pixels with
 * different labels as a "crack" (a unit step between two lattice vertices). Cracks join up into:
 *   - chains: runs of cracks between two junctions (a junction is a vertex where 3 or 4 cracks meet), or a closed loop
 *     with no junction at all. A chain has one region on each side and is smoothed ONCE, so both regions use the very
 *     same points.
 *   - loops: the boundary of one region, made of chains. Outer boundaries run clockwise on the screen (y down, region
 *     on the right of the direction of travel), holes counter-clockwise.
 *
 * The line of a chain goes through the middle of its cracks, nudged along the pixel pair to where the real edge is (the
 * "soft" shares of an anti-aliased pixel say where). That nudging is what removes the pixel staircase.
 */
import { OUT } from "./labels.js";

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const POPC = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/**
 * Build the chains of a label map.
 * labels: Uint8Array w*h (OUT = 255 is what lies outside the picture).
 * Returns { W1, chains, startMap }.
 *  chain = { v0, dir0, vEnd, dirEnd, closed, right, left, rightPix, leftPix, vs (Int32Array of lattice vertex ids,
 *            first and last equal when closed), area2 (twice the signed lattice area, for the forward direction) }
 */
export function buildChains(labels, w, h) {
  const W1 = w + 1;
  const V = W1 * (h + 1);
  const vmask = new Uint8Array(V);
  // horizontal cracks: between the pixel above and the pixel below, on lattice row y
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x < w; x++) {
      const a = y > 0 ? labels[(y - 1) * w + x] : OUT;
      const b = y < h ? labels[y * w + x] : OUT;
      if (a !== b) {
        vmask[y * W1 + x] |= 1; // E leaves (x, y)
        vmask[y * W1 + x + 1] |= 4; // W leaves (x + 1, y)
      }
    }
  }
  // vertical cracks: between the pixel on the left and the one on the right, on lattice column x
  for (let y = 0; y < h; y++) {
    for (let x = 0; x <= w; x++) {
      const a = x > 0 ? labels[y * w + x - 1] : OUT;
      const b = x < w ? labels[y * w + x] : OUT;
      if (a !== b) {
        vmask[y * W1 + x] |= 2; // S leaves (x, y)
        vmask[(y + 1) * W1 + x] |= 8; // N leaves (x, y + 1)
      }
    }
  }
  const used = new Uint8Array(V);
  const chains = [];
  const startMap = new Map();

  const flank = (x, y, d) => {
    // returns pixel coordinates of [left, right] of the crack leaving (x, y) in direction d
    switch (d) {
      case 0: return [x, y - 1, x, y];
      case 1: return [x, y, x - 1, y];
      case 2: return [x - 1, y, x - 1, y - 1];
      default: return [x - 1, y - 1, x, y - 1];
    }
  };
  const labelAt = (px, py) => (px >= 0 && px < w && py >= 0 && py < h ? labels[py * w + px] : OUT);

  const walk = (v0, d0) => {
    const vs = [v0];
    let x = v0 % W1;
    let y = (v0 - x) / W1;
    const x0 = x;
    const y0 = y;
    let area2 = 0;
    let d = d0;
    let closed = false;
    for (;;) {
      used[y * W1 + x] |= 1 << d;
      const nx = x + DX[d];
      const ny = y + DY[d];
      const nv = ny * W1 + nx;
      used[nv] |= 1 << ((d + 2) & 3);
      area2 += x * ny - nx * y;
      vs.push(nv);
      const m = vmask[nv];
      if (POPC[m] !== 2) { x = nx; y = ny; break; }
      if (nx === x0 && ny === y0) { closed = true; x = nx; y = ny; break; }
      const rest = m & ~(1 << ((d + 2) & 3));
      d = rest === 1 ? 0 : rest === 2 ? 1 : rest === 4 ? 2 : 3;
      x = nx;
      y = ny;
    }
    const f = flank(x0, y0, d0);
    const left = labelAt(f[0], f[1]);
    const right = labelAt(f[2], f[3]);
    const rightPix = f[2] >= 0 && f[2] < w && f[3] >= 0 && f[3] < h ? f[3] * w + f[2] : -1;
    const leftPix = f[0] >= 0 && f[0] < w && f[1] >= 0 && f[1] < h ? f[1] * w + f[0] : -1;
    return { v0, dir0: d0, vEnd: vs[vs.length - 1], dirEnd: d, closed, right, left, rightPix, leftPix, vs: Int32Array.from(vs), area2 };
  };

  // chains that start at a junction
  for (let v = 0; v < V; v++) {
    const m = vmask[v];
    if (POPC[m] < 3) continue;
    for (let d = 0; d < 4; d++) {
      if (!(m & (1 << d)) || (used[v] & (1 << d))) continue;
      const c = walk(v, d);
      const id = chains.length;
      chains.push(c);
      startMap.set(c.v0 * 4 + c.dir0, id * 2);
      startMap.set(c.vEnd * 4 + ((c.dirEnd + 2) & 3), id * 2 + 1);
    }
  }
  // what is left are closed loops without a junction
  for (let v = 0; v < V; v++) {
    const m = vmask[v];
    if (m === 0) continue;
    for (let d = 0; d < 4; d++) {
      if (!(m & (1 << d)) || (used[v] & (1 << d))) continue;
      chains.push(walk(v, d));
    }
  }
  return { W1, chains, startMap };
}

/**
 * The line of one chain through the middle of its cracks, each middle moved along the pixel pair to the place where
 * the two colours are equally strong. Cracks on the picture's edge stay exactly in the middle.
 * Returns { xy: Float64Array, n } (closed chains have no repeated first point; open chains include both junction ends).
 */
export function chainRawPoints(ch, W1, labels, lab2, soft, w, h, cls) {
  const vs = ch.vs;
  const m = vs.length - 1;
  const closed = ch.closed;
  const n = closed ? m : m + 2;
  const xy = new Float64Array(n * 2);
  let o = 0;
  const vx = (v) => v % W1;
  if (!closed) {
    const x = vx(vs[0]);
    xy[o++] = x;
    xy[o++] = (vs[0] - x) / W1;
  }
  // share of colour c in pixel i; `cls` maps a label to its colour class (two palette entries with the same colour, an
  // outside and an enclosed background, count as one colour here)
  const mem = (i, c) => (labels[i] === c ? soft[i] / 255 : lab2[i] !== 255 && (cls ? cls[lab2[i]] === cls[c] : lab2[i] === c) ? 1 - soft[i] / 255 : 0);
  for (let k = 0; k < m; k++) {
    const x = vx(vs[k]);
    const y = (vs[k] - x) / W1;
    const x2 = vx(vs[k + 1]);
    const y2 = (vs[k + 1] - x2) / W1;
    const dx = x2 - x;
    const dy = y2 - y;
    const d = dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3;
    let lx, ly, rx, ry;
    switch (d) {
      case 0: lx = x; ly = y - 1; rx = x; ry = y; break;
      case 1: lx = x; ly = y; rx = x - 1; ry = y; break;
      case 2: lx = x - 1; ly = y; rx = x - 1; ry = y - 1; break;
      default: lx = x - 1; ly = y - 1; rx = x; ry = y - 1;
    }
    let px;
    let py;
    if (lx < 0 || lx >= w || ly < 0 || ly >= h || rx < 0 || rx >= w || ry < 0 || ry >= h) {
      px = x + dx * 0.5;
      py = y + dy * 0.5;
    } else {
      const li = ly * w + lx;
      const ri = ry * w + rx;
      // where along the line from the left pixel centre to the right one the edge is, as a fraction t of the way.
      // (1) When the soft ramp of the edge fits in a short window along that line (the pair plus up to 3 more pixels
      //     each side that still carry the same two colours, the outer ones pure), the amount of the left colour in the
      //     window is the distance from the window start to the edge: exact for a straight edge whatever the blur is.
      // (2) When the ramp is wider than the window (a shallow edge seen along its long side), the two shares are
      //     interpolated linearly, which is exact for a linear ramp.
      const la = labels[li];
      const lb = labels[ri];
      const sx = rx - lx;
      const sy = ry - ly;
      const shareL = mem(li, la);
      const shareR = mem(ri, la);
      let sum = shareL + shareR;
      let extraLeft = 0;
      let outerLeft = shareL;
      let outerRight = shareR;
      for (let k = 1; k <= 3; k++) {
        const qx = lx - sx * k;
        const qy = ly - sy * k;
        if (qx < 0 || qx >= w || qy < 0 || qy >= h) { outerLeft = 1; break; }
        const qi = qy * w + qx;
        if (labels[qi] !== la) { outerLeft = 1; break; }
        outerLeft = mem(qi, la);
        sum += outerLeft;
        extraLeft++;
      }
      for (let k = 1; k <= 3; k++) {
        const qx = rx + sx * k;
        const qy = ry + sy * k;
        if (qx < 0 || qx >= w || qy < 0 || qy >= h) { outerRight = 0; break; }
        const qi = qy * w + qx;
        if (labels[qi] !== lb) { outerRight = 0; break; }
        outerRight = mem(qi, la);
        sum += outerRight;
      }
      let t;
      if (outerLeft >= 0.97 && outerRight <= 0.03) t = sum - extraLeft - 0.5;
      else {
        const gl = shareL - mem(li, lb);
        const gr = shareR - mem(ri, lb);
        const den = gl - gr;
        t = den > 1e-9 ? gl / den : 0.5;
      }
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      px = lx + 0.5 + t * (rx - lx);
      py = ly + 0.5 + t * (ry - ly);
    }
    xy[o++] = px;
    xy[o++] = py;
  }
  if (!closed) {
    const x = vx(vs[m]);
    xy[o++] = x;
    xy[o++] = (vs[m] - x) / W1;
  }
  return { xy, n };
}

/**
 * Join chains into the boundary loops of the regions that are shapes.
 * isShape(label) says which labels become shapes. Each loop = { label, halves: [half-chain ids], area2, pix }
 * where half-chain id = chainIndex * 2 + (0 forward, 1 reversed) and pix is a pixel of the region (for finding which
 * piece of the label the loop belongs to).
 */
export function traceLoops(graph, labels, w, h, isShape) {
  const { chains, startMap } = graph;
  const W1 = graph.W1;
  const visited = new Uint8Array(chains.length * 2);
  const loops = [];
  const labelAt = (px, py) => (px >= 0 && px < w && py >= 0 && py < h ? labels[py * w + px] : OUT);
  for (let c = 0; c < chains.length; c++) {
    for (let o = 0; o < 2; o++) {
      const hc = c * 2 + o;
      if (visited[hc]) continue;
      const ch = chains[c];
      const label = o === 0 ? ch.right : ch.left;
      if (label === OUT || !isShape(label)) { visited[hc] = 1; continue; }
      const halves = [];
      let area2 = 0;
      let cur = hc;
      let guard = chains.length * 2 + 4;
      do {
        visited[cur] = 1;
        halves.push(cur);
        const cc = chains[cur >> 1];
        const rev = cur & 1;
        area2 += rev ? -cc.area2 : cc.area2;
        if (cc.closed) break;
        const endV = rev ? cc.v0 : cc.vEnd;
        const heading = rev ? (cc.dir0 + 2) & 3 : cc.dirEnd;
        const x = endV % W1;
        const y = (endV - x) / W1;
        // pixels around the vertex, clockwise from the north-west one
        const p0 = labelAt(x - 1, y - 1);
        const p1 = labelAt(x, y - 1);
        const p2 = labelAt(x, y);
        const p3 = labelAt(x - 1, y);
        const around = [p0, p1, p2, p3];
        const ar = around[(2 + heading) & 3];
        const al = around[(1 + heading) & 3];
        const nextHeading = ar !== label ? (heading + 1) & 3 : al !== label ? heading : (heading + 3) & 3;
        const nxt = startMap.get(endV * 4 + nextHeading);
        if (nxt === undefined) break;
        cur = nxt;
      } while (cur !== hc && --guard > 0);
      const first = chains[hc >> 1];
      const pix = (hc & 1) === 0 ? first.rightPix : first.leftPix;
      loops.push({ label, halves, area2, pix });
    }
  }
  return loops;
}

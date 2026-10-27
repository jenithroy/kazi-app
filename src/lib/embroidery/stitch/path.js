/**
 * Stitches that follow a line: a running stitch, a bean (triple) stitch, and the satin column, the dense zigzag that
 * crosses a stroke from edge to edge. Everything works on one polyline (open, or closed when `closed` is set) in
 * millimetres and returns points to sew in order.
 */
import { cumulativeLength, pointAlong } from "../geometry/poly.js";

/** The unit tangent of a polyline at each vertex (the average of the two sides, so a corner points along its bisector). */
function tangents(pts, closed) {
  const n = pts.length;
  const t = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
    const q = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const l = Math.hypot(dx, dy) || 1;
    t[i] = [dx / l, dy / l];
  }
  return t;
}

/** Remove points that repeat (closer than `tol`). */
export function dedupe(pts, tol = 1e-6) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > tol) out.push(p);
  }
  return out;
}

/**
 * A running stitch along a polyline: needle holes `len` mm apart, and always one at every corner sharper than `cornerDeg`
 * (so a square stays square). Closed lines end where they began.
 */
export function runAlong(line, { len = 2.5, closed = false, cornerDeg = 25 } = {}) {
  const pts = dedupe(closed ? [...line, line[0]] : line);
  if (pts.length < 2) return pts;
  const out = [pts[0]];
  const keep = Math.cos((cornerDeg * Math.PI) / 180);
  let carry = 0; // distance already used up since the last needle hole
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let pos = len - carry; // distance along this segment to the next hole
    while (pos < d - 1e-9) {
      out.push([a[0] + ((b[0] - a[0]) * pos) / d, a[1] + ((b[1] - a[1]) * pos) / d]);
      pos += len;
    }
    carry = d - (pos - len);
    // A hole at a real corner, so the stitch does not cut across it.
    if (i < pts.length - 1) {
      const c = pts[i + 1];
      const ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d;
      const dd = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
      const vx = (c[0] - b[0]) / dd, vy = (c[1] - b[1]) / dd;
      if (ux * vx + uy * vy < keep) { out.push(b); carry = 0; }
    }
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 1e-6) out.push(last);
  return out;
}

/**
 * A bean stitch: every stretch is sewn forward, back and forward again, a bold line that looks like a single heavy thread.
 * `len` is the length of one stretch.
 */
export function beanAlong(line, { len = 2.0, closed = false } = {}) {
  const pts = runAlong(line, { len, closed });
  if (pts.length < 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) out.push(pts[i], pts[i - 1], pts[i]);
  return out;
}

/**
 * A satin column along a centre line.
 *
 * At each station along the line (`spacing` mm apart) the column has a left edge and a right edge, `left[i]` and `right[i]`
 * mm away from the line on either side (the widths may differ: a stroke is rarely symmetric about its centre). The stitches
 * zigzag between the edges, alternating sides station by station. At a corner of the line an extra station is added with
 * the corner's own miter, so the edge of the column turns the corner cleanly instead of fanning.
 *
 * @param {number[][]} line  centre line points
 * @param {object} o  spacing (mm between stitches along the line), closed (the line is a loop), widthAt(s, base, nx, ny, corner) -> [left, right]
 *   (s = mm along the line, base = {x, y} the station, (nx, ny) the unit vector pointing left; or pass `half` for a constant half width
 *   on both sides), pullComp (mm added to the whole width,
 *   half each side), maxMiter (a corner's miter is at most this times the half width), start ("left" | "right", the side the first
 *   stitch begins on), densityJitter (0..0.3: spread the stations by up to this fraction so a long column is not a perfect comb)
 * @returns {number[][]} the needle points, alternating between the two edges
 */
export function satinAlong(line, o = {}) {
  const spacing = o.spacing || 0.4;
  const closed = !!o.closed;
  const pts = dedupe(closed ? [...line, line[0]] : line);
  if (pts.length < 2) return [];
  const cum = cumulativeLength(pts);
  const total = cum[cum.length - 1];
  if (total < 1e-6) return [];
  const widthAt = o.widthAt || (() => [o.half ?? 1, o.half ?? 1]);
  const pull = (o.pullComp ?? 0) / 2;
  const maxMiter = o.maxMiter ?? 2.5;

  // Stations: even steps along the line, plus one at each real corner.
  const cornerCos = Math.cos((30 * Math.PI) / 180);
  const stations = [];
  const nSteps = Math.max(1, Math.round(total / spacing));
  for (let k = 0; k <= nSteps; k++) stations.push({ s: (total * k) / nSteps, corner: -1 });
  const jitter = o.densityJitter || 0;
  if (jitter > 0) {
    for (let k = 1; k < nSteps; k++) stations[k].s += (Math.sin(k * 12.9898) * 43758.5453 % 1) * jitter * (total / nSteps) * 0.5;
    stations.sort((a, b) => a.s - b.s);
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const ux = pts[i][0] - pts[i - 1][0], uy = pts[i][1] - pts[i - 1][1];
    const vx = pts[i + 1][0] - pts[i][0], vy = pts[i + 1][1] - pts[i][1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < 1e-9 || lv < 1e-9) continue;
    if ((ux * vx + uy * vy) / (lu * lv) < cornerCos) stations.push({ s: cum[i], corner: i });
  }
  stations.sort((a, b) => a.s - b.s || b.corner - a.corner);

  const out = [];
  let side = o.start === "right" ? 1 : 0;
  let lastS = -1;
  for (const st of stations) {
    // Two stations at (nearly) the same place: keep the corner one.
    if (st.s - lastS < spacing * 0.15 && st.corner < 0) continue;
    let nx, ny, scale = 1;
    if (st.corner >= 0) {
      const i = st.corner;
      const ux = pts[i][0] - pts[i - 1][0], uy = pts[i][1] - pts[i - 1][1];
      const vx = pts[i + 1][0] - pts[i][0], vy = pts[i + 1][1] - pts[i][1];
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      // Left normals of the two sides (y is down, so "left" is the side the left hand would be on facing along the line).
      const n1 = [uy / lu, -ux / lu], n2 = [vy / lv, -vx / lv];
      const mx = n1[0] + n2[0], my = n1[1] + n2[1];
      const ml = Math.hypot(mx, my);
      if (ml < 1e-6) { nx = n1[0]; ny = n1[1]; }
      else {
        nx = mx / ml; ny = my / ml;
        scale = Math.min(maxMiter, 1 / Math.max(0.2, (n1[0] * nx + n1[1] * ny)));
      }
    } else {
      const p = pointAlong(pts, cum, st.s);
      const a = pts[Math.min(p.i, pts.length - 2)], b = pts[Math.min(p.i + 1, pts.length - 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      nx = dy / l; ny = -dx / l;
    }
    const base = st.corner >= 0 ? { x: pts[st.corner][0], y: pts[st.corner][1] } : pointAlong(pts, cum, st.s);
    // widthAt may measure the stroke itself: it is told where the station is and which way "left" points.
    const [wl, wr] = widthAt(st.s, base, nx, ny, st.corner >= 0);
    const lw = Math.max(0.05, wl + pull) * scale, rw = Math.max(0.05, wr + pull) * scale;
    const left = [base.x + nx * lw, base.y + ny * lw];
    const right = [base.x - nx * rw, base.y - ny * rw];
    out.push(side === 0 ? left : right);
    side ^= 1;
    lastS = st.s;
  }
  return out;
}

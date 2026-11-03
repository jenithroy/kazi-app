/**
 * Tracing by hand: the points a person puts round a shape in the picture, and the closed outline they make.
 *
 * A point is [x, y, smooth] in millimetres (the hoop's frame). `smooth` 0 is a corner (the outline turns there), 1 is a curve
 * point (the outline runs smoothly through it). Between two corners the outline is a straight line; any other piece is a
 * cubic curve whose handles run along the line from the point before to the point after, a third of the piece long, so a
 * curve never swings out wider than the points that hold it. No screen in here: the canvas draws the very line the shape is
 * made from, and the phone app's engine page uses the same file.
 */
import { ringArea, pointInRing, segmentsCross } from "../embroidery/geometry/poly.js";

/** A traced shape smaller than this (mm2) is a slip of the finger, not a shape. */
export const MIN_TRACE_AREA_MM2 = 0.2;

/** A flattened curve has a point at least this often (mm). */
const STEP_MM = 0.35;

/** The picture's own colour under a shape is read from a grid of at most this many pixels on a side. */
const SAMPLE_SIDE = 96;

/**
 * The line through the points as a list of [x, y]. `closed` joins the last point back to the first (the last point is NOT
 * repeated); open, it is the line drawn so far.
 */
export function tracePolyline(points, closed = false) {
  const n = points.length;
  if (n < 2) return n ? [[points[0][0], points[0][1]]] : [];
  // Which way the line runs through each point (used only where the point is smooth).
  const dir = points.map((p, i) => {
    const a = closed ? points[(i + n - 1) % n] : points[Math.max(0, i - 1)];
    const b = closed ? points[(i + 1) % n] : points[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    return l > 1e-9 ? [dx / l, dy / l] : [0, 0];
  });
  const out = [[points[0][0], points[0][1]]];
  const pieces = closed ? n : n - 1;
  for (let i = 0; i < pieces; i++) {
    const j = (i + 1) % n;
    const p = points[i], q = points[j];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 1e-9) continue;
    if (!p[2] && !q[2]) { out.push([q[0], q[1]]); continue; }
    const h = len / 3;
    const c1 = p[2] ? [p[0] + dir[i][0] * h, p[1] + dir[i][1] * h] : [p[0], p[1]];
    const c2 = q[2] ? [q[0] - dir[j][0] * h, q[1] - dir[j][1] * h] : [q[0], q[1]];
    const steps = Math.max(4, Math.min(80, Math.ceil(len / STEP_MM)));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, u = 1 - t;
      const b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
      out.push([b0 * p[0] + b1 * c1[0] + b2 * c2[0] + b3 * q[0], b0 * p[1] + b1 * c1[1] + b2 * c2[1] + b3 * q[1]]);
    }
  }
  // Going round, the line ends where it began: that point is the ring's first, not a second one.
  if (closed && out.length > 1 && Math.hypot(out[out.length - 1][0] - out[0][0], out[out.length - 1][1] - out[0][1]) < 1e-9) out.pop();
  return out;
}

/** The closed outline of the points as a ring, or null when there are too few points or the shape is too small to be one. */
export function traceRing(points) {
  if (points.length < 3) return null;
  const ring = tracePolyline(points, true);
  if (ring.length < 3 || ringArea(ring) < MIN_TRACE_AREA_MM2) return null;
  return ring;
}

/** Does the outline cross over itself (a figure of eight)? Two halves of equal size then have no inside between them. */
export function crossesItself(ring) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // the last piece meets the first at a corner
      if (segmentsCross(a, b, ring[j], ring[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** "Traced 3" for the third shape drawn by hand: one more than the highest number already in the design. */
export function nextTraceName(objects) {
  let n = 0;
  for (const o of objects) {
    const m = /^Traced (\d+)$/.exec(o.name || "");
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `Traced ${n + 1}`;
}

const hex2 = (v) => v.toString(16).padStart(2, "0");
const median = (values) => {
  values.sort((a, b) => a - b);
  return values[values.length >> 1];
};

/**
 * The colour the picture has under a ring: the middle value of each of red, green and blue over the picture's pixels inside
 * the ring (the middle, not the average, so the soft edge of a shape does not tint it). Pixels that are see-through are left
 * out. Returns "#rrggbb", or null when the ring is not over the picture (or only over see-through parts).
 *
 * @param canvas  the picture, whole, as a canvas
 * @param ref     where the picture sits: { x, y, mmPerPx, crop: { x, y, w, h } }. The crop's top-left corner is at (x, y) in
 *                the hoop and one picture pixel is `mmPerPx` millimetres.
 * @param ring    the shape in the hoop's frame, [[x, y], ...]
 */
export function sampleRingColour(canvas, ref, ring) {
  if (!canvas || !ref || !ring || ring.length < 3) return null;
  const { crop, mmPerPx } = ref;
  const toPx = (x, y) => [crop.x + (x - ref.x) / mmPerPx, crop.y + (y - ref.y) / mmPerPx];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of ring) {
    const [px, py] = toPx(p[0], p[1]);
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
  }
  // Only the part of the picture that shows (inside the crop) counts.
  x0 = Math.max(x0, crop.x); y0 = Math.max(y0, crop.y);
  x1 = Math.min(x1, crop.x + crop.w); y1 = Math.min(y1, crop.y + crop.h);
  if (!(x1 > x0 && y1 > y0)) return null;
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  const k = Math.min(1, SAMPLE_SIDE / Math.max(bw, bh));
  const tw = Math.max(1, Math.round(bw * k)), th = Math.max(1, Math.round(bh * k));
  const tmp = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(tw, th) : Object.assign(document.createElement("canvas"), { width: tw, height: th });
  const ctx = tmp.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, x0, y0, bw, bh, 0, 0, tw, th);
  const data = ctx.getImageData(0, 0, tw, th).data;
  const rs = [], gs = [], bs = [];
  for (let j = 0; j < th; j++) {
    for (let i = 0; i < tw; i++) {
      const o = (j * tw + i) * 4;
      if (data[o + 3] < 128) continue;
      // The middle of this sample, back in the hoop: is it inside the shape?
      const wx = ref.x + (x0 + ((i + 0.5) / tw) * bw - crop.x) * mmPerPx;
      const wy = ref.y + (y0 + ((j + 0.5) / th) * bh - crop.y) * mmPerPx;
      if (!pointInRing(wx, wy, ring)) continue;
      rs.push(data[o]); gs.push(data[o + 1]); bs.push(data[o + 2]);
    }
  }
  if (!rs.length) return null;
  return `#${hex2(median(rs))}${hex2(median(gs))}${hex2(median(bs))}`;
}

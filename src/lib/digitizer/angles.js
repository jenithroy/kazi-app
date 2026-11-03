/**
 * Which way the rows of a fill run, shape by shape. Every area of a converted picture used to be sewn at 45 degrees, so two touching
 * areas of nearly the same tone melted into one texture, and a leaf, a limb or a lock of hair was sewn across the grain of the thing it is.
 * Pure and deterministic: the same shapes always get the same angles (a conversion made again, or a colour switched on and off, must not
 * shuffle the angles of the shapes that stay).
 *
 *   assignAngles(shapes, o) -> [angle in degrees, or null for "leave it at the engine's default"], one per shape
 *
 * `shapes` are the tracer's shapes ({ contours: [[x, y], ...][], area }, in picture pixels; `mmPerPx` turns them into millimetres).
 * Two things decide an angle, the first the stronger:
 *   1. the shape's own long axis, when it is clearly longer than wide (a lock of hair, a limb, a leaf blade, a stem): the rows run along it;
 *   2. otherwise the angle that sets it apart from the shapes it touches (so two neighbours are never sewn the same way).
 * (The grain of the picture under a shape was tried as a third, strongest guide, and did not visibly help: see the engine README.)
 */
import { ringArea } from "../embroidery/geometry/poly.js";

/** The angles a shape without a grain or a long axis may take, in the order they are tried (the first is the engine's own 45). */
export const ANGLE_SLOTS = [45, 135, 90, 0, 67.5, 112.5, 22.5, 157.5];

const norm180 = (a) => ((a % 180) + 180) % 180;
/** The angle between two row directions (they have no arrow, so 0 to 90 degrees). */
export const angleGap = (a, b) => {
  const d = Math.abs(norm180(a) - norm180(b));
  return Math.min(d, 180 - d);
};

/**
 * The long direction of a ring (degrees, y down) and how many times longer than wide it is, from its area moments; null for a flat ring.
 * (The same measure the stitch engine uses for small pieces, kept here because it is private there.)
 */
export function elongationOf(ring) {
  let a = 0, cx = 0, cy = 0, ix = 0, iy = 0, ixy = 0;
  const n = ring.length;
  if (n < 3) return null;
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    const c = p[0] * q[1] - q[0] * p[1];
    a += c;
    cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c;
    ix += (p[1] * p[1] + p[1] * q[1] + q[1] * q[1]) * c;
    iy += (p[0] * p[0] + p[0] * q[0] + q[0] * q[0]) * c;
    ixy += (p[0] * q[1] + 2 * p[0] * p[1] + 2 * q[0] * q[1] + q[0] * p[1]) * c;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) return null;
  cx /= 6 * a; cy /= 6 * a;
  const sxx = iy / 12 - a * cx * cx, syy = ix / 12 - a * cy * cy, sxy = ixy / 24 - a * cx * cy;
  const m = (sxx + syy) / 2, d = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
  const l1 = Math.abs(m + d), l2 = Math.abs(m - d);
  if (l2 < 1e-12) return null;
  return { ratio: Math.sqrt(l1 / l2), deg: (0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI };
}

/**
 * Which shapes touch which, and how much: touching shapes of a trace share exactly the same boundary points, so two shapes that have a
 * point in common are neighbours and the number of points they share says how long their common edge is. Returns, for each shape, a Map
 * of neighbour index -> shared points.
 */
export function touching(shapes) {
  const owners = new Map();
  shapes.forEach((s, i) => {
    for (const ring of s.contours) {
      for (const p of ring) {
        const key = `${p[0]},${p[1]}`;
        const list = owners.get(key);
        if (!list) owners.set(key, [i]); else if (list[list.length - 1] !== i) list.push(i);
      }
    }
  });
  const adj = shapes.map(() => new Map());
  for (const list of owners.values()) {
    if (list.length < 2) continue;
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      adj[list[a]].set(list[b], (adj[list[a]].get(list[b]) || 0) + 1);
      adj[list[b]].set(list[a], (adj[list[b]].get(list[a]) || 0) + 1);
    }
  }
  return adj;
}

export const ANGLE_DEFAULTS = {
  mode: "combo", // "contrast" (neighbours only) | "shape" (long axis only) | "combo" (both: the long axis first)
  across: false, // a long shape: rows along its length (false) or across the short way, like a satin (true)
  minRatio: 1.6, // a shape counts as long when it is this many times longer than wide (the engine's own limit for small pieces)
  minMm2: 1.2, // a shape smaller than this keeps the engine's default (nobody sees its rows)
  gapDeg: 40, // two touching shapes must differ by at least this many degrees (more costs nothing)
  slots: ANGLE_SLOTS,
};

/**
 * One angle per shape.
 * @param {object[]} shapes  the tracer's shapes
 * @param {object} o  { mmPerPx, ...ANGLE_DEFAULTS overrides }
 * @returns {(number|null)[]}
 */
export function assignAngles(shapes, o = {}) {
  const P = { ...ANGLE_DEFAULTS, ...o };
  const mm2 = (o.mmPerPx || 0.1) ** 2;
  const n = shapes.length;
  const out = new Array(n).fill(null);
  const useShape = P.mode === "shape" || P.mode === "combo";
  const useContrast = P.mode === "contrast" || P.mode === "combo";
  const adj = useContrast ? touching(shapes) : null;
  // the big ones first, so they get the plain angles and the small ones set themselves apart from them
  const order = shapes.map((_, i) => i).sort((a, b) => shapes[b].area - shapes[a].area || a - b);
  for (const i of order) {
    const s = shapes[i];
    const area = s.area * mm2;
    if (area < P.minMm2) continue;
    let pref = null;
    if (useShape) {
      const e = elongationOf(s.contours[0]);
      if (e && e.ratio >= P.minRatio) pref = e.deg + (P.across ? 90 : 0);
    }
    if (pref != null) { out[i] = chosen(pref); continue; }
    if (!useContrast) continue;
    let best = P.slots[0], bestPen = Infinity;
    for (const slot of P.slots) {
      let pen = 0;
      for (const [j, w] of adj[i]) {
        const aj = out[j];
        if (aj == null) continue; // a neighbour with no angle yet (smaller, still to come) or one that keeps the default
        pen += w * Math.max(0, P.gapDeg - angleGap(slot, aj)) / P.gapDeg;
      }
      if (pen < bestPen - 1e-9) { bestPen = pen; best = slot; }
    }
    out[i] = best;
  }
  return out;
}

/**
 * An angle picked for a shape because of its grain or its long axis, as the engine wants it. The engine reads exactly 45 as "not chosen" and
 * turns a long small piece across its length, so a chosen 45 is nudged by a hair (invisible) to stay as chosen.
 */
function chosen(deg) {
  const a = Math.round(norm180(deg) * 100) / 100;
  return a === 45 ? 45.05 : a;
}

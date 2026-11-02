/**
 * Growing, shrinking and combining shapes, through clipper-lib (an exact integer polygon engine). The rest of the engine
 * thinks in millimetres, so every ring is scaled to micrometres on the way in and back on the way out.
 */
import ClipperLib from "clipper-lib";
import { islandsOf, ringArea } from "./poly.js";

const SCALE = 1000; // 1 unit = 1 micrometre

function toPaths(rings) {
  // Wind outer boundaries one way and holes the other, which is what Clipper reads as "inside" and "hole".
  const paths = new ClipperLib.Paths();
  for (const { outer, holes } of islandsOf(rings)) {
    for (const r of [outer, ...holes]) {
      paths.push(r.map((p) => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })));
    }
  }
  return paths;
}

function fromPaths(paths) {
  return paths.map((path) => path.map((p) => [p.X / SCALE, p.Y / SCALE])).filter((r) => r.length >= 3);
}

/**
 * Grow (delta > 0) or shrink (delta < 0) a shape by `delta` millimetres, holes included (a grown shape's holes get
 * smaller). `join` is "round" (smooth corners), "miter" (sharp corners, cut at `miterLimit` times the distance) or
 * "square". Returns rings again, outer and holes wound as in islandsOf.
 */
export function offsetRings(rings, delta, { join = "round", miterLimit = 2.5, arcTolerance = 0.015 } = {}) {
  if (!rings.length) return [];
  if (delta === 0) return rings.map((r) => r.slice());
  const jt = join === "miter" ? ClipperLib.JoinType.jtMiter : join === "square" ? ClipperLib.JoinType.jtSquare : ClipperLib.JoinType.jtRound;
  const co = new ClipperLib.ClipperOffset(miterLimit, arcTolerance * SCALE);
  co.AddPaths(toPaths(rings), jt, ClipperLib.EndType.etClosedPolygon);
  const out = new ClipperLib.Paths();
  co.Execute(out, delta * SCALE);
  return fromPaths(out);
}

function boolean(type, subject, clip) {
  const c = new ClipperLib.Clipper();
  c.AddPaths(toPaths(subject), ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(toPaths(clip), ClipperLib.PolyType.ptClip, true);
  const out = new ClipperLib.Paths();
  c.Execute(type, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return fromPaths(out);
}

export const unionRings = (a, b = []) => boolean(ClipperLib.ClipType.ctUnion, a, b);

/**
 * Merge several shapes into one. Each item of `shapes` is a shape (a list of rings read even-odd, so it may have holes);
 * overlapping shapes are added together, unlike unionRings, which reads all the rings it is given as ONE shape.
 */
export function unionShapes(shapes) {
  const c = new ClipperLib.Clipper();
  for (const rings of shapes) c.AddPaths(toPaths(rings), ClipperLib.PolyType.ptSubject, true);
  const out = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctUnion, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return fromPaths(out);
}
/**
 * A shape made ready for many boolean operations: its rings are sorted into outer boundaries and holes once, here, and not again
 * for every operation (for a shape with hundreds of holes that is most of the cost of one), and the box round each ring is kept.
 */
export function prepareShape(rings) {
  const paths = toPaths(rings).map((pts) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { if (p.X < x0) x0 = p.X; if (p.X > x1) x1 = p.X; if (p.Y < y0) y0 = p.Y; if (p.Y > y1) y1 = p.Y; }
    return { pts, box: [x0, y0, x1, y1] };
  });
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { box: b } of paths) { box[0] = Math.min(box[0], b[0]); box[1] = Math.min(box[1], b[1]); box[2] = Math.max(box[2], b[2]); box[3] = Math.max(box[3], b[3]); }
  return { paths, box };
}

/** A closed path cut to a box (Sutherland-Hodgman): what lies inside it, as a path, or [] when nothing does. Corners are rounded to whole units. */
function cutToBox(path, x0, y0, x1, y1) {
  let pts = path;
  const passes = [
    [(p) => p.X >= x0, (a, b) => ({ X: x0, Y: Math.round(a.Y + ((b.Y - a.Y) * (x0 - a.X)) / (b.X - a.X)) })],
    [(p) => p.X <= x1, (a, b) => ({ X: x1, Y: Math.round(a.Y + ((b.Y - a.Y) * (x1 - a.X)) / (b.X - a.X)) })],
    [(p) => p.Y >= y0, (a, b) => ({ X: Math.round(a.X + ((b.X - a.X) * (y0 - a.Y)) / (b.Y - a.Y)), Y: y0 })],
    [(p) => p.Y <= y1, (a, b) => ({ X: Math.round(a.X + ((b.X - a.X) * (y1 - a.Y)) / (b.Y - a.Y)), Y: y1 })],
  ];
  for (const [inside, cut] of passes) {
    const out = [];
    for (let i = 0, n = pts.length; i < n; i++) {
      const a = pts[(i + n - 1) % n], b = pts[i];
      const ia = inside(a), ib = inside(b);
      if (ib) { if (!ia) out.push(cut(a, b)); out.push(b); } else if (ia) out.push(cut(a, b));
    }
    pts = out;
    if (pts.length < 3) return [];
  }
  return pts;
}

/**
 * The part of one prepared shape (see prepareShape) that lies inside another; rings. Both are cut to the box they share first, so a
 * big shape against a small one costs what the small one costs (the exact boolean operation only sees the little that can meet).
 */
export function intersectPrepared(a, b) {
  const x0 = Math.max(a.box[0], b.box[0]), y0 = Math.max(a.box[1], b.box[1]), x1 = Math.min(a.box[2], b.box[2]), y1 = Math.min(a.box[3], b.box[3]);
  if (!(x1 > x0 && y1 > y0)) return [];
  const cutAll = (shape) => {
    const out = new ClipperLib.Paths();
    for (const { pts, box } of shape.paths) {
      if (box[2] < x0 || box[0] > x1 || box[3] < y0 || box[1] > y1) continue; // outside the box
      if (box[0] >= x0 && box[2] <= x1 && box[1] >= y0 && box[3] <= y1) out.push(pts); // all inside
      else { const cut = cutToBox(pts, x0, y0, x1, y1); if (cut.length >= 3) out.push(cut); }
    }
    return out;
  };
  const c = new ClipperLib.Clipper();
  c.AddPaths(cutAll(a), ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(cutAll(b), ClipperLib.PolyType.ptClip, true);
  const out = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctIntersection, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return fromPaths(out);
}
export const differenceRings = (a, b) => boolean(ClipperLib.ClipType.ctDifference, a, b);
export const intersectRings = (a, b) => boolean(ClipperLib.ClipType.ctIntersection, a, b);

/** Merge overlapping or touching rings of one shape into clean islands (removes self-overlaps). */
export function cleanRings(rings, minArea = 1e-4) {
  return unionRings(rings).filter((r) => ringArea(r) >= minArea);
}

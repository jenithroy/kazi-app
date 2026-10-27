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
export const differenceRings = (a, b) => boolean(ClipperLib.ClipType.ctDifference, a, b);
export const intersectRings = (a, b) => boolean(ClipperLib.ClipType.ctIntersection, a, b);

/** Merge overlapping or touching rings of one shape into clean islands (removes self-overlaps). */
export function cleanRings(rings, minArea = 1e-4) {
  return unionRings(rings).filter((r) => ringArea(r) >= minArea);
}

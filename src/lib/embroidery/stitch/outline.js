/**
 * Outlines: a line of stitching along the edge of a shape. A running stitch (one thin line), a bean stitch (each stretch sewn
 * three times, a bolder line) or a satin border of a chosen width, sitting on the edge, inside it or outside it.
 */
import { islandsOf, ringArea } from "../geometry/poly.js";
import { offsetRings } from "../geometry/clip.js";
import { runAlong, beanAlong, satinAlong } from "./path.js";

/** The ring rotated to begin at the vertex nearest `from`. */
function startNear(ring, from) {
  if (!from) return ring;
  let best = 0, bd = Infinity;
  ring.forEach((p, i) => { const d = (p[0] - from[0]) ** 2 + (p[1] - from[1]) ** 2; if (d < bd) { bd = d; best = i; } });
  return [...ring.slice(best), ...ring.slice(0, best)];
}

export const OUTLINE_DEFAULTS = {
  type: "run", // "run" | "bean" | "satin"
  width: 1.5, // satin width, mm
  len: 2.5, // running stitch length, mm
  position: "center", // satin: "center" | "inside" | "outside"
  spacing: 0.3, // satin: as for a satin fill, the holes on one edge are twice this apart
  pullComp: 0.25,
  underlay: true,
};

/**
 * @param {number[][][]} rings  the shape (even-odd)
 * @param {object} s  see OUTLINE_DEFAULTS, plus start: [x, y] the needle
 * @returns {number[][][]} runs of points in sewing order (a closed loop ends where it began)
 */
export function outlineRuns(rings, s = {}) {
  const o = { ...OUTLINE_DEFAULTS, ...s };
  const runs = [];
  let at = o.start || null;
  for (const { outer, holes } of islandsOf(rings)) {
    let shape = [outer, ...holes];
    if (o.type === "satin") {
      if (o.position === "inside") shape = offsetRings(shape, -o.width / 2, { join: "miter" });
      else if (o.position === "outside") shape = offsetRings(shape, o.width / 2, { join: "miter" });
    }
    for (const ring0 of shape) {
      if (ring0.length < 3 || ringArea(ring0) < 0.2) continue;
      const ring = startNear(ring0, at);
      let pts;
      if (o.type === "bean") pts = beanAlong(ring, { len: o.len, closed: true }).concat([ring[0]]);
      else if (o.type === "satin") {
        const under = o.underlay && o.width >= 1.2 ? runAlong(ring, { len: 2.5, closed: true }).concat([ring[0]]) : [];
        const sat = satinAlong(ring, { spacing: o.spacing, closed: true, half: o.width / 2, pullComp: o.pullComp });
        pts = [...under, ...sat];
      } else pts = runAlong(ring, { len: o.len, closed: true }).concat([ring[0]]);
      if (pts.length >= 2) { runs.push(pts); at = pts[pts.length - 1]; }
    }
  }
  return runs;
}

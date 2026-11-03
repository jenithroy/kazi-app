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

/** A ring with no two neighbouring points closer than `gap` (the first point stays; a ring that would be left with fewer than three points is returned as it was). */
function thinRing(ring, gap) {
  const out = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const p = ring[i], q = out[out.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= gap) out.push(p);
  }
  // the last point must not sit on top of the first (the loop closes by itself)
  while (out.length > 3 && Math.hypot(out[out.length - 1][0] - out[0][0], out[out.length - 1][1] - out[0][1]) < gap) out.pop();
  return out.length >= 3 ? out : ring;
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
  // A running or bean line may sit a little inside the edge (`inset`, mm: half a thread puts the line's outer side on the edge itself).
  const inset = o.type !== "satin" && Number.isFinite(o.inset) ? Math.min(2, Math.max(0, o.inset)) : 0;
  for (const { outer, holes } of islandsOf(rings)) {
    let shape = [outer, ...holes];
    if (o.type === "satin") {
      if (o.position === "inside") shape = offsetRings(shape, -o.width / 2, { join: "miter" });
      else if (o.position === "outside") shape = offsetRings(shape, o.width / 2, { join: "miter" });
    } else if (inset > 0) {
      const moved = offsetRings(shape, -inset, { join: "miter" });
      // (a piece thinner than the inset keeps its own edge). The offset of a sharp tip leaves a crowd of points a hair apart: a needle hole for each would pile
      // thread up in one spot, so the line keeps points no closer than 0.35 mm (a line of 0.4 mm thread cannot show a corner finer than that anyway).
      if (moved.length) shape = moved.map((r) => thinRing(r, 0.35));
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

/**
 * Underlay for a fill: stitches sewn first, under the visible ones. They hold the fabric flat and give the top stitches
 * something to sit on, which is the difference between a crisp shape and one that sinks into a knit or ripples. Two kinds:
 * a run just inside the edge (it also gives the edge a firm line), and a loose tatami laid across the top stitches' direction.
 */
import { islandsOf, ringArea } from "../geometry/poly.js";
import { offsetRings } from "../geometry/clip.js";
import { tatamiFill } from "./fill.js";
import { runAlong } from "./path.js";

/** Which underlay a fill of this size wants when it is left on "auto". */
export function autoFillUnderlay(areaMm2, fabric = "woven") {
  if (areaMm2 < 6) return "none";
  const heavy = fabric === "knit" || fabric === "cap" || fabric === "towel";
  if (areaMm2 < 40 && !heavy) return "edge";
  return "edge+tatami";
}

/** A loop of running stitch, starting at the point of the ring nearest `from` and coming back to it. */
function loop(ring, from, len) {
  let best = 0, bd = Infinity;
  if (from) ring.forEach((p, i) => { const d = (p[0] - from[0]) ** 2 + (p[1] - from[1]) ** 2; if (d < bd) { bd = d; best = i; } });
  const r = [...ring.slice(best), ...ring.slice(0, best)];
  return runAlong(r, { len, closed: true }).concat([r[0]]);
}

/**
 * The underlay runs for one island.
 * @param {number[][][]} island  [outer, ...holes]
 * @param {object} o  type ("none" | "edge" | "tatami" | "edge+tatami"), angle (the top fill's angle), start ([x, y] needle), len (running stitch length), inset
 * @returns {number[][][]} runs of points, in sewing order
 */
export function fillUnderlayRuns(island, o = {}) {
  const type = o.type || "edge+tatami";
  if (type === "none") return [];
  const inset = o.inset ?? 0.45;
  const len = o.len ?? 2.5;
  const runs = [];
  let at = o.start || null;
  const inner = offsetRings(island, -inset, { join: "miter" });
  if (!inner.length) return [];
  if (type.includes("edge")) {
    for (const { outer, holes } of islandsOf(inner)) {
      for (const ring of [outer, ...holes]) {
        if (ringArea(ring) < 0.5) continue;
        const l = loop(ring, at, len);
        runs.push(l);
        at = l[l.length - 1];
      }
    }
  }
  if (type.includes("tatami")) {
    const res = tatamiFill(offsetRings(island, -(inset + 0.2), { join: "miter" }), {
      angle: (o.angle ?? 45) + 90, spacing: 1.7, stitchLen: 3.8, pullComp: 0, stagger: 3, minPiece: 1.4, travelMax: 4, travelRun: 8, start: at,
    });
    for (const p of res.paths) runs.push(p);
  }
  return runs;
}

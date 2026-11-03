/**
 * Sharper edges: a thin line of stitching just inside the edge of a hard-edged flat shape, in the shape's own colour. A fill's rows end at
 * the edge, and a row end is round and 0.4 mm wide, so a straight edge sewn at 45 degrees comes out as a row of little teeth (a third of a
 * millimetre deep). One line of thread laid along the edge, on top of the fill, covers the row ends and gives the edge back as a smooth line.
 *
 *   edgeLook(shape, ctx, o) -> { stroke, fillInset } for the object (its edge line, and how far its rows stop short of the edge), or null
 *
 * Only flat, hard-edged shapes (a logo, artwork) that are wide enough to be filled: thin shapes are already one line of thread, a picture of
 * a photograph is thousands of soft boundaries that nobody can see the teeth of, and each border is more stitches and more thread to cut.
 */
import { elongationOf } from "./angles.js";

export const EDGE_DEFAULTS = {
  type: "run", // "run" (one line) | "bean" (each stretch three times, a bolder line)
  width: 0.4, // the line of thread, mm
  inset: 0.2, // how far inside the true edge the middle of the line runs (half the thread, so its outer side is the edge)
  len: 3, // mm, the stitch length of the line (2 mm gave a little more, for 1.7 % more stitches)
  kinds: ["logo", "art"], // the kinds of picture that get it
  minWidthMm: 3, // a shape whose mean width is less than this has short edges and little to gain (and under 1.5 mm it is a line of thread already)
  minAreaMm2: 10, // and one this small has no teeth worth the trouble: measured, the big shapes get most of the gain for half the cost
  maxRatio: 3.5, // a shape this many times longer than wide may be sewn as satin (smooth already): no border
  fillInset: 0.3, // mm: the fill's rows stop this far short of the edge, under the line (its row ends are round and 0.4 mm wide, and would stick out past it)
};

/**
 * @param {object} shape  the tracer's shape ({ contours, area }, picture pixels)
 * @param {object} ctx  { kind, mmPerPx, color (hex), widthMm (the shape's mean width) }
 * @param {object} o  overrides of EDGE_DEFAULTS
 */
export function edgeLook(shape, ctx, o = {}) {
  const P = { ...EDGE_DEFAULTS, ...o };
  if (!P.kinds.includes(ctx.kind)) return null;
  if (ctx.widthMm < P.minWidthMm) return null;
  if (shape.area * ctx.mmPerPx * ctx.mmPerPx < P.minAreaMm2) return null;
  const e = elongationOf(shape.contours[0]);
  if (e && e.ratio >= P.maxRatio && ctx.widthMm < 5) return null; // a stroke the engine may sew as satin
  return { stroke: { type: P.type, color: ctx.color, width: P.width, len: P.len, position: "center", inset: P.inset }, fillInset: P.fillInset };
}

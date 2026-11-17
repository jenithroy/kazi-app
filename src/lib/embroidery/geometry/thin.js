/**
 * Thin strips of a shape widened to a width a needle can follow. Lettering at small sizes is made of strokes that are thicker and thinner than anything a needle sews:
 * the hairlines and serifs of a Times or Georgia at 4 mm caps are 0.15 to 0.3 mm wide (a thread is 0.4), so they were dropped (a letter in two bars and a slash) or
 * came out as a ragged smear. A needle can follow a line about half a millimetre wide (a bean line), so every strip of the shape thinner than that is made as wide
 * as that and the rest of the shape is left exactly as it is: the stems keep their weight, the hairlines get one, and a serif face reads as a serif face.
 *
 * How the strips are found: the shape opened by the width (shrunk by half of it, grown again) loses what is thinner than the width; what the opening took off is
 * the thin part. Each piece of it that is long and narrow (not a crumb off a sharp corner, which the opening also takes) is grown by what it lacks and put back.
 */
import { offsetRings, differenceRings, unionRings, intersectRings } from "./clip.js";
import { islandsOf, ringArea, ringPerimeter } from "./poly.js";

/** The width (mm) a strip is widened to, unless the caller says otherwise: the stitch engine leaves out of a satin layout what is thinner than 0.4 (ENGINE_DEFAULTS.satinMinStroke). */
export const THIN_MIN_WIDTH = 0.4;

/** The area (mm2) of a shape: its outer rings less its holes. */
function shapeArea(rings) {
  let a = 0;
  for (const is of islandsOf(rings)) a += ringArea(is.outer) - is.holes.reduce((s, h) => s + ringArea(h), 0);
  return a;
}

/**
 * How wide the strokes of a shape are, typically (mm): the width of every island (twice its area over its outline's length) averaged by area, so the stems of a
 * letter count for more than its hairlines. 0 for a shape with nothing in it. Islands smaller than `minArea` mm2 (the dot of an i at 3 mm) are not counted.
 */
export function meanStrokeWidth(rings, minArea = 0.3) {
  let a = 0, w = 0;
  for (const is of islandsOf(rings)) {
    const shape = [is.outer, ...is.holes];
    const area = ringArea(is.outer) - is.holes.reduce((s, h) => s + ringArea(h), 0);
    const per = shape.reduce((s, r) => s + ringPerimeter(r), 0);
    if (!(area >= minArea) || !(per > 0)) continue;
    a += area;
    w += area * ((2 * area) / per);
  }
  return a > 0 ? w / a : 0;
}

/**
 * The share of a shape's area that lies in strips thinner than `w` mm: the hairlines and serifs of a high-contrast face (a Times, a Didone, a script), where a sans or a
 * slab face has none. The shape opened by `w` (shrunk by half of it and grown again) loses what is thinner, and what it lost is the share.
 */
export function thinShare(rings, w) {
  if (!(w > 0)) return 0;
  // letter by letter: the cost of an offset grows faster than the number of points, and a text is many small shapes
  let total = 0, strips = 0;
  try {
    for (const is of islandsOf(rings)) {
      const shape = [is.outer, ...is.holes];
      total += shapeArea(shape);
      const opened = offsetRings(offsetRings(shape, -w / 2, { join: "round" }), w / 2, { join: "round" });
      for (const t of islandsOf(differenceRings(shape, opened))) {
        const piece = [t.outer, ...t.holes];
        const a = ringArea(t.outer) - t.holes.reduce((s, h) => s + ringArea(h), 0);
        const per = piece.reduce((s, r) => s + ringPerimeter(r), 0);
        if (!(a > 0) || !(per > 0)) continue;
        const width = (2 * a) / per;
        if (per / 2 - width >= 3 * width) strips += a; // a strip, not a crumb the opening took off a sharp corner
      }
    }
  } catch (e) { return 0; }
  return total > 0 ? Math.min(1, strips / total) : 0;
}

/**
 * About how tall the letters of a shape are (mm): the median height of its pieces that are no wider than they are tall twice over (a letter, not a word whose letters
 * touch), or of all its pieces when there are none. The height of a letter is a capital's, give or take the small letters and the tails.
 */
export function letterHeight(rings, minArea = 0.3) {
  const hs = [], all = [];
  for (const is of islandsOf(rings)) {
    const area = ringArea(is.outer) - is.holes.reduce((s, h) => s + ringArea(h), 0);
    if (!(area >= minArea)) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of is.outer) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    const w = x1 - x0, h = y1 - y0;
    all.push(h);
    if (w <= 2 * h) hs.push(h);
  }
  const list = hs.length ? hs : all;
  if (!list.length) return 0;
  list.sort((a, b) => a - b);
  return list[list.length >> 1];
}

/**
 * Heavy letters made a little lighter: every letter shrunk by `e` on all sides, corners kept sharp. A stitched letter comes out bolder than its drawing (thread has body: a column
 * swells, an end is rounded), and in a heavy face at a small size that fills in the holes of an a, e or o and the gaps between letters. For lettering whose every stroke is
 * thick (no hairlines, which this would take away: see thinShare); worked letter by letter, as the cost of an offset grows faster than the number of points.
 * @returns the rings (the very array handed in when nothing was changed)
 */
export function lightenHeavy(rings, e) {
  if (!(e > 0) || !Array.isArray(rings) || !rings.length) return rings;
  const out = [];
  try {
    for (const is of islandsOf(rings)) {
      const shape = [is.outer, ...is.holes];
      const lighter = offsetRings(shape, -e, { join: "miter", miterLimit: 2 });
      if (lighter.length) out.push(...lighter); else out.push(...shape); // (a letter too thin to be made lighter stays as it is)
    }
  } catch (err) { return rings; }
  return out.length ? out : rings;
}

/**
 * The region the rows of a dense fill are laid in: the shape with each THICK stroke taken in on both sides, a thin one left as it is. A thread is 0.45 mm wide, so a fill whose rows reach
 * the edge comes out about 0.45 mm wider than the drawing, which is half as heavy again at 4 mm caps and nearly twice at 3 mm; rows that stop `step` to `max` short of the edge bring a
 * thick stroke back to the drawn weight. How far is local: a stroke is taken in by `step` on each side as long as it stays at least `core` wide (a row region narrower than that is crossed by
 * rows too short to sew, and the stroke falls apart into dots), at most `max` in all, so a 0.4 mm stroke gives up 0.05, a 0.6 mm one 0.15 and a heavy stem 0.2, and a hairline nothing.
 * Done `step` at a time: the shape opened by (core / 2 + step) is what is thick enough, it is shrunk by `step`, and what the opening took off (the thin strips, not the crumbs off a corner) is
 * put back, tied to it. Letter by letter, as the cost of an offset grows faster than the number of points.
 * @returns the rings (the very array handed in when nothing was changed)
 */
export function lightenThick(rings, { step = 0.05, core = 0.25, max = 0.2 } = {}) {
  if (!(step > 0) || !(max >= step) || !Array.isArray(rings) || !rings.length) return rings;
  const n = Math.max(1, Math.round(max / step));
  const r = core / 2 + step;
  const out = [];
  try {
    for (const is of islandsOf(rings)) {
      let shape = [is.outer, ...is.holes];
      for (let k = 0; k < n; k++) {
        const opened = offsetRings(offsetRings(shape, -r, { join: "round" }), r, { join: "round" });
        if (!opened.length) break;
        const eroded = offsetRings(opened, -step, { join: "miter", miterLimit: 2 });
        if (!eroded.length) break;
        const grown = [];
        for (const t of islandsOf(differenceRings(shape, opened))) {
          const piece = [t.outer, ...t.holes];
          const a = ringArea(t.outer) - t.holes.reduce((s, h) => s + ringArea(h), 0);
          const per = piece.reduce((s, q) => s + ringPerimeter(q), 0);
          if (!(a >= 0.04) || !(per > 0)) continue;
          const w = (2 * a) / per;
          if (!(per / 2 - w >= 3 * w)) continue; // a strip, not a crumb off a sharp corner
          grown.push(...offsetRings(piece, step, { join: "round" }));
        }
        const bridge = grown.length ? intersectRings(grown, shape) : [];
        shape = bridge.length ? unionRings(eroded, bridge) : eroded;
      }
      out.push(...shape);
    }
  } catch (err) { return rings; }
  return out.length ? out : rings;
}

/**
 * @param {number[][][]} rings  one shape (outer rings and holes, read even-odd, as islandsOf reads them), in millimetres
 * @param {number} minW  strips narrower than this are widened to it (mm); 0 or less changes nothing
 * @param {{ minRatio?: number, minArea?: number, minThick?: number }} o  a strip must be at least `minRatio` times longer than wide (a crumb off a corner is not a strip) and
 *   `minArea` mm2 big; and at least `minThick` of the shape's area must be wider than `minW` (a face whose every stroke is as thin as the hairlines has no hairlines: it is
 *   sewn as lines, one thread wide whatever the drawing's width, and widening all of it only made it heavy)
 * @returns {{ rings: number[][][], widened: number, strips: number }}  the shape with its thin strips widened; `rings` is the very array handed in when there was nothing to widen
 */
export function widenThin(rings, minW = THIN_MIN_WIDTH, { minRatio = 3, minArea = 0.04, minThick = 0.2 } = {}) {
  const none = { rings, widened: 0, strips: 0 };
  if (!(minW > 0) || !Array.isArray(rings) || !rings.length) return none;
  let opened;
  try {
    opened = offsetRings(offsetRings(rings, -minW / 2, { join: "round" }), minW / 2, { join: "round" });
    if (!(shapeArea(opened) >= minThick * shapeArea(rings))) return none;
  } catch (e) { return none; }
  let thin;
  try { thin = differenceRings(rings, opened); } catch (e) { return none; }
  if (!thin.length) return none;
  const grown = [];
  let strips = 0;
  for (const is of islandsOf(thin)) {
    const shape = [is.outer, ...is.holes];
    const area = ringArea(is.outer) - is.holes.reduce((s, h) => s + ringArea(h), 0);
    const per = shape.reduce((s, r) => s + ringPerimeter(r), 0);
    if (!(area >= minArea) || !(per > 0)) continue;
    const w = (2 * area) / per; // the mean width of a strip: twice its area over its outline
    if (!(w < minW * 0.95)) continue;
    const len = per / 2 - w; // a strip's outline is two long sides and two short ends
    if (!(len >= minRatio * w)) continue;
    const d = (minW - w) / 2;
    const out = offsetRings(shape, d, { join: "round" });
    if (out.length) { grown.push(...out); strips++; }
  }
  if (!grown.length) return none;
  return { rings: unionRings(rings, grown), widened: grown.length, strips };
}

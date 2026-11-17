/**
 * Can lettering of this size be read once it is stitched? Thread is 0.4 mm wide and a stitch cannot be shorter than about a millimetre, so a letter has to be big
 * enough for the strokes it is made of: a plain sans of one weight can be sewn quite small, a face with hairlines and serifs (Times, a script) cannot.
 * The numbers are from reading the stitched letters back with a text reader (OCR) for 27 fonts, 3 to 6 mm tall, sewn by the dense rule of the engine (`denseLetters`): the share of
 * characters it got wrong, by height and by kind of face (see docs/digitizer.md, "Lettering"). Pure functions, used by the notes in the text tool and in the picture panel.
 */
import { meanStrokeWidth, thinShare } from "../embroidery/geometry/thin.js";

/** A face with this much of its ink in strips thinner than half its typical stroke has hairlines and serifs (Georgia bold 0.08, Times bold 0.09, a sans 0.01). */
export const HAIRLINE_SHARE = 0.045;

/** A run of lettering found in a picture whose typical stroke is thinner than this (mm) is sewn as one line of stitches from end to end; the engine's `pictureLineBelow` (a test checks they are the same number). */
export const THIN_RUN_MM = 0.55;

/** Lettering up to this tall (mm) is sewn dense (a close fill, rows to the edge of each letter), and the letters of a picture only when their stroke is at least `DENSE_STROKE_MM`: the engine's `denseCap` and `denseMinStroke` (a test checks they are the same numbers). */
export const DENSE_CAP_MM = 8;
export const DENSE_STROKE_MM = 0.35;

/** Letter heights (mm) from which each kind of lettering is read well (`good`), and under which it is not worth sewing (`least`). */
export const LEGIBLE_CAP = Object.freeze({
  plain: { good: 3, least: 2.5 }, // strokes of one weight, sewn dense and weight-matched (3 mm: 4 % of the characters read wrong, 4 mm: 2 %; before the dense fill 16 % and 8 %)
  hairline: { good: 4, least: 3 }, // hairlines and serifs: a needle cannot follow a stroke thinner than the thread, so they are widened and the letters look heavier (3 mm: 16 %, 4 mm: 8 %, 5 mm: 0 %; before 12 to 19 % up to 5 mm)
  heavy: { good: 5, least: 3.5 }, // strokes over 1.2 mm at a small size: the counters (the holes of a, e, o) and the gaps between letters close up (3 mm: 40 %, 4 mm: 12 %, 5 mm: 1 %)
});

/**
 * The advice for a typed text object as it is NOW: its letters (the rings it holds, which are not scaled) made as big as its transform makes them.
 * @returns {{ kind, level, goodMm, leastMm, capMm, strokeMm, hair }}  `adviceLetters` plus what it was worked out from
 */
export function adviceForTextObject(obj) {
  const t = obj.transform || {};
  const k = Math.sqrt(Math.abs((t.sx ?? 1) * (t.sy ?? 1))) || 1;
  const rings = k === 1 ? obj.rings : obj.rings.map((r) => r.map((p) => [p[0] * k, p[1] * k]));
  const strokeMm = meanStrokeWidth(rings);
  const hair = thinShare(rings, 0.5 * strokeMm);
  const capMm = (obj.text && obj.text.size > 0 ? obj.text.size : 0) * k;
  return { ...letteringAdvice({ capMm, strokeMm, hair }), capMm, strokeMm, hair };
}

/**
 * @param {{ capMm: number, strokeMm?: number, hair?: number }} o  the letters' height, their typical stroke (mm) and the share of their ink in hairlines
 * @returns {{ kind: "plain"|"hairline"|"heavy", level: "good"|"tight"|"small", goodMm: number, leastMm: number }}  `tight`: it can be read but not well; `small`: too small to read
 */
export function letteringAdvice({ capMm, strokeMm = 0, hair = 0 }) {
  const kind = hair >= HAIRLINE_SHARE ? "hairline" : strokeMm >= 1.2 && capMm < 6 ? "heavy" : "plain";
  const { good, least } = LEGIBLE_CAP[kind];
  return { kind, level: capMm >= good ? "good" : capMm >= least ? "tight" : "small", goodMm: good, leastMm: least };
}

/** The sentence for a text that is `tight` or `small` (null when it is fine). `font` is the font's label ("Times"), `sans` whether it is the plain sans already. */
export function adviceText(advice, { capMm, font = "this font", sans = false }) {
  if (advice.level === "good") return null;
  const h = capMm.toFixed(1);
  if (advice.kind === "hairline") {
    return advice.level === "small"
      ? `At ${h} mm the thin strokes and serifs of ${font} cannot be stitched: the letters will not read. Make them at least ${advice.goodMm} mm tall, or use a plain sans.`
      : `At ${h} mm the thin strokes of ${font} are stitched heavier than drawn, so the letters look rough. ${advice.goodMm} mm or taller is clean, or use a plain sans.`;
  }
  if (advice.kind === "heavy") {
    return `At ${h} mm a heavy face closes up the holes of letters like a, e and o. ${advice.goodMm} mm or taller keeps them open, or choose a lighter font.`;
  }
  return advice.level === "small"
    ? `Letters ${h} mm tall are too small for thread to read. Make them at least ${advice.goodMm} mm tall.`
    : `Letters ${h} mm tall can be read, but ${advice.goodMm} mm or taller is cleaner.`;
}

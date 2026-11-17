/**
 * Lettering is traced a second time, finer.
 *
 * Why. The tracer cleans a picture for a needle: a part of a colour thinner than `minFeatureMm` (0.55 mm at the Detail setting a page starts on) is given to its neighbour or, for the
 * long thin pieces of an accent colour, widened to that width, and a piece smaller than `minAreaMm2` (0.78 mm2) is dropped. That is right for a logo's graphics and wrong for small print:
 * the gap between two letters of 3 mm caps is 0.2 to 0.4 mm, so it is "a part of the ground thinner than 0.55 mm" and is filled in, the letters run together ("Hamburgolonle"), the
 * hairlines and serifs of a Times come out as blobs, a thin outline is widened, and a letter's thin stroke is lost. Measured on 143 drawn pictures of lettering (10 px to the millimetre),
 * the traced shapes of lettering at 3 mm caps missed the drawing's edge by 0.079 mm on average (a thread is 0.45 mm wide: the edge looked rough), kept 9.8 of its 11.2 pieces and weighed
 * 1.17 times the drawing's ink; traced with the limits at 0.12 mm and 0.03 mm2 they missed it by 0.012 mm, kept 11.4 of 11.2 pieces and weighed 1.01. The stitch engine then sews them as it sews
 * typed lettering, which is not traced at all but comes from the font's own outline.
 *
 * How. The picture is traced as before, and `findLettering` (lettering.js) says where the lettering is (for a simple logo it looks on a finer tracing as well, `relaxEverything`: the first
 * one fills in the gaps of small letters, so a short word or a tight line is two blobs in it). If there is some (a run of 5 letters or more, 3 in a plain logo, at most 8 mm tall), the picture is traced
 * again with the cleaning relaxed for the colour of that lettering inside its box (`relaxLettering`): there the raw classification of each pixel is put back and cleaned with the small limits
 * above, and nothing is widened, and wherever the lettering's colour is in either version of a pixel the second one is taken. Everything else is cleaned exactly as before, so a picture without
 * lettering, and every part of one that is not lettering, comes out the same, and the shapes of the colours that meet at a letter's edge still share their boundary points (one label map, one set
 * of outlines). A block of lettering keeps its second tracing only when the finder finds at least four fifths of its letters again (`confirmedBoxes`): a run that was no lettering (the outline of a
 * crown) is not, and is left as the first tracing made it (by tracing a third time without it, when others are confirmed).
 *
 * Pure functions: no DOM. Sizes are millimetres, boxes and coordinates the picture's pixels.
 */
import { cleanLabels } from "./labels.js";
import { rgbToLab } from "./color.js";

export const REFINE = Object.freeze({
  maxCapMm: 8, // lettering taller than this is made of strokes the tracer follows well enough (and the engine sews it as before)
  minLetters: 3, // a run shorter than this is not worth a second tracing (the finder has already refused the runs that are not lettering, and short words only in a picture that is almost nothing but them)
  minFeatureMm: 0.12, // inside the lettering: nothing thinner than this is cleaned away or widened (the 1 to 2 pixels of anti-aliasing are)
  minAreaMm2: 0.03, // ... and no piece smaller than this (the dot of an i at 3 mm is 0.15)
  padMm: 1.2, // the box is the lettering's own, this much bigger on every side ...
  padCap: 0.8, // ... or this share of its letters' height, whichever is more (a letter the first tracing lost lies just beyond the last it found)
  keep: 0.8, // a block is kept when the second tracing finds at least this share of its letters again ...
  groundShare: 0.15, // a colour is the lettering's ground when it covers at least this share of the box's pixels that are not the lettering's colour
  growth: 3, // ... and its colour has at most this many pieces in the box for each of them, and `growthBase` more (the second tracing of a crown or of a noisy picture is hundreds)
  growthBase: 15,
});

const lettersOf = (b) => (Number.isFinite(b.letters) ? b.letters : b.count);

/**
 * What to refine: for each block of lettering found by `findLettering` that is worth it, the box (picture pixels) and the colour (the palette entry the tracer started from, see `origin`).
 * @param {{ letters: number, count: number, capMm: number, box: number[], colors: number[] }[]} blocks  `letters` is how many letters the finder reckons the block holds (a word whose letters touch counts as the letters it has room for), `count` its pieces
 * @param {{ mmPerPx: number, width: number, height: number, origin: ArrayLike<number>, options?: object }} o  `origin[k]`: the palette entry the final entry `k` came from
 * @returns {{ box: number[], color: number, block: number }[]} empty when there is nothing to refine
 */
export function refineBoxes(blocks, { mmPerPx, width, height, origin, options = null }) {
  const O = { ...REFINE, ...(options || {}) };
  const out = [];
  if (!Array.isArray(blocks) || !(mmPerPx > 0) || !origin) return out;
  blocks.forEach((b, i) => {
    if (!b || !Array.isArray(b.box) || !Array.isArray(b.colors) || !(lettersOf(b) >= O.minLetters) || !(b.capMm > 0) || !(b.capMm <= O.maxCapMm)) return;
    const color = origin[b.colors[0]];
    if (!Number.isInteger(color) || color < 0) return;
    const pad = Math.max(O.padMm, O.padCap * b.capMm) / mmPerPx;
    out.push({ box: [Math.max(0, b.box[0] - pad), Math.max(0, b.box[1] - pad), Math.min(width, b.box[2] + pad), Math.min(height, b.box[3] + pad)], color, block: i });
  });
  return out;
}

/**
 * Inside each box put back the label map as it was before any cleaning and clean it again with the small limits of lettering and nothing widened; the box's colour is then taken from that:
 * a pixel that is the colour in the new version becomes it, and a pixel that was it in the first cleaning and is not now goes back to what the new version says it is (the ground in a gap
 * between letters, in the counter of an e) provided that is one of the GROUND colours of the letters: the colours that cover the box (not a thin outline that runs past the lettering). A halo is not
 * (the anti-aliased edge of a blue letter on gold is green or black for a pixel or two, and a crest came out with 288 more specks of its black): such a pixel takes the ground colour nearest to
 * its own. A pixel that is not the lettering's colour in either version keeps the label of the first cleaning.
 * `labels`, `soft` and `lab2` (the full label map and its edge arrays) are changed in place; `pre` holds copies of them from before the first cleaning.
 * @param {object} ctx  { rgb, palLab, K } as `cleanLabels` takes them
 * @param {{ box: number[], color: number }[]} boxes
 * @param {number} sx  source pixels to a work pixel, `sy` likewise (the work grid is not the picture's)
 * @param {number} minAreaPx  the area (work pixels) below which a piece is a speck, `minFeaturePx` the width (work pixels) below which a part is a sliver
 * @returns {number} how many pixels changed their label
 */
export function relaxLettering(labels, soft, lab2, pre, w, h, ctx, boxes, sx, sy, minAreaPx, minFeaturePx, groundShare = REFINE.groundShare) {
  let changed = 0;
  const lab = new Float64Array(3);
  for (const { box: b, color } of boxes) {
    const x0 = Math.max(0, Math.floor(b[0] / sx)), y0 = Math.max(0, Math.floor(b[1] / sy));
    const x1 = Math.min(w, Math.ceil(b[2] / sx)), y1 = Math.min(h, Math.ceil(b[3] / sy));
    const cw = x1 - x0, ch = y1 - y0;
    if (cw < 3 || ch < 3) continue;
    const n = cw * ch;
    const cl = new Uint8Array(n), cs = new Uint8Array(n), c2 = new Uint8Array(n), fl = new Uint8Array(n);
    const crgb = new ctx.rgb.constructor(n * 3);
    for (let y = 0; y < ch; y++) {
      const s = (y0 + y) * w + x0, d = y * cw;
      cl.set(pre.labels.subarray(s, s + cw), d);
      cs.set(pre.soft.subarray(s, s + cw), d);
      c2.set(pre.lab2.subarray(s, s + cw), d);
      fl.set(labels.subarray(s, s + cw), d);
      crgb.set(ctx.rgb.subarray(s * 3, (s + cw) * 3), d * 3);
    }
    cleanLabels(cl, cw, ch, { rgb: crgb, palLab: ctx.palLab, K: ctx.K, soft: cs, lab2: c2 }, minAreaPx, minFeaturePx, null);
    // the ground colours: the colours (other than the lettering's) that cover at least `groundShare` of what is not lettering in the box. A thin outline of the picture that runs past the lettering,
    // or a halo, covers a few per cent of it and is not ground.
    const count = new Float64Array(256);
    let rest = 0;
    for (let i = 0; i < n; i++) if (fl[i] < ctx.K && fl[i] !== color) { count[fl[i]]++; rest++; }
    const ground = [];
    let top = -1;
    for (let k = 0; k < ctx.K; k++) {
      if (k === color || !(count[k] > 0)) continue;
      if (top < 0 || count[k] > count[top]) top = k;
      if (count[k] >= groundShare * rest) ground.push(k);
    }
    if (!ground.length && top >= 0) ground.push(top);
    if (!ground.length) continue; // no ground colour found: nothing to put the lettering's gaps back to
    const isGround = new Uint8Array(256);
    for (const k of ground) isGround[k] = 1;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = (y0 + y) * w + (x0 + x), j = y * cw + x;
        if (cl[j] === color) {
          if (labels[i] !== color || soft[i] !== cs[j] || lab2[i] !== c2[j]) {
            if (labels[i] !== color) changed++;
            labels[i] = color; soft[i] = cs[j]; lab2[i] = c2[j];
          }
        } else if (labels[i] === color) {
          // no longer the lettering's colour: what the new version says, when that is a ground colour, else the ground colour nearest to the pixel's own
          let to = cl[j];
          if (!isGround[to]) {
            rgbToLab(ctx.rgb[i * 3], ctx.rgb[i * 3 + 1], ctx.rgb[i * 3 + 2], lab, 0);
            let bd = Infinity;
            for (const k of ground) {
              const d = (lab[0] - ctx.palLab[k * 3]) ** 2 + (lab[1] - ctx.palLab[k * 3 + 1]) ** 2 + (lab[2] - ctx.palLab[k * 3 + 2]) ** 2;
              if (d < bd) { bd = d; to = k; }
            }
            labels[i] = to; soft[i] = 255; lab2[i] = 255;
          } else {
            labels[i] = to; soft[i] = cs[j]; lab2[i] = c2[j];
          }
          changed++;
        }
      }
    }
  }
  return changed;
}

/**
 * The whole label map put back as it was before any cleaning and cleaned again with the small limits of lettering, nothing widened: a finer tracing of the whole picture, made only to LOOK for
 * lettering on (the first tracing fills in the gap between small letters, so a word of three or four letters, or a line of tightly set serif letters, is two or three blobs in it and the finder
 * cannot see the word). Nothing of it is kept: the shapes that are kept come from `relaxLettering`, which touches the lettering's own colour in the lettering's own box and nothing else.
 * `labels`, `soft` and `lab2` are overwritten; `pre` holds copies of them from before the first cleaning.
 */
export function relaxEverything(labels, soft, lab2, pre, w, h, ctx, minAreaPx, minFeaturePx) {
  const L = pre.labels.slice(), S = pre.soft.slice(), L2 = pre.lab2.slice();
  cleanLabels(L, w, h, { rgb: ctx.rgb, palLab: ctx.palLab, K: ctx.K, soft: S, lab2: L2 }, minAreaPx, minFeaturePx, null);
  labels.set(L); soft.set(S); lab2.set(L2);
}

/**
 * Which of the boxes' blocks does the second tracing confirm? A block is confirmed when
 *  - the finder finds, round the place where it was, at least `keep` of the letters it found before, and
 *  - the lettering's colour has not turned into a crowd of pieces in its box: at most `growth` times its letters and `growthBase` more (lettering of a clean picture comes out as letters and the
 *    dots of its i's; a crown's arches that were taken for lettering, or a noisy picture where the small limits keep the noise too, come out as hundreds).
 * @param {{ blocks: object[] }} first  the first tracing's `lettering`, `second` the second's
 * @param {{ shapes: { color: number, bbox: number[] }[], _origin?: ArrayLike<number> }} secondTraced  the second tracing (its shapes, and which palette entry each of its colours came from)
 * @param {{ box: number[], color: number, block: number }[]} boxes  what `refineBoxes` answered
 * @returns {boolean[]} one answer for each box
 */
export function confirmedBoxes(first, secondTraced, boxes, { mmPerPx, options = null }) {
  const O = { ...REFINE, ...(options || {}) };
  const second = secondTraced.lettering;
  const origin = secondTraced._origin || null;
  return boxes.map(({ block, box, color }) => {
    const a = first.blocks[block];
    const slack = Math.max(0.5, 0.25 * a.capMm) / mmPerPx;
    const x0 = a.box[0] - slack, y0 = a.box[1] - slack, x1 = a.box[2] + slack, y1 = a.box[3] + slack;
    let n = 0;
    for (const k of second.blocks) {
      const cx = (k.box[0] + k.box[2]) / 2, cy = (k.box[1] + k.box[3]) / 2;
      if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) n += lettersOf(k);
    }
    if (n < O.keep * lettersOf(a)) return false;
    if (origin) {
      let pieces = 0;
      for (const sh of secondTraced.shapes) {
        if (origin[sh.color] !== color) continue;
        const cx = (sh.bbox[0] + sh.bbox[2]) / 2, cy = (sh.bbox[1] + sh.bbox[3]) / 2;
        if (cx >= box[0] && cx <= box[2] && cy >= box[1] && cy <= box[3]) pieces++;
      }
      if (pieces > O.growth * lettersOf(a) + O.growthBase) return false;
    }
    return true;
  });
}

/**
 * The engine: a design (objects with shapes, colours and stitch settings) in, a pattern (what the machine reads) out.
 *
 * An object is a shape (rings, millimetres, in the hoop's frame) with a FILL and an optional OUTLINE:
 *   fill   { type: "auto" | "tatami" | "satin" | "none", color, angle, spacing, stitchLen, stagger, pullComp, inset, underlay }
 *   stroke { type: "none" | "run" | "bean" | "satin", color, width, len, position, spacing, pullComp }
 * "auto" looks at each island of the shape and uses satin where it is a stroke the column can follow (a letter, a line, a
 * thin shape) and tatami where it is an area. Satin is checked before it is kept: if the column would leave gaps or spill
 * past the edge the island is filled instead, and a warning says so.
 *
 * Objects are sewn in order, and the order is only changed to save colour changes where that cannot change what is on top
 * of what (objects that overlap keep their order). Within a colour the nearest object goes next.
 */
import { CMD } from "../pattern.js";
import { islandsOf, ringArea, ringPerimeter, bboxOf, transformRings, composeMatrix } from "../geometry/poly.js";
import { intersectRings, offsetRings, differenceRings, unionRings, unionShapes } from "../geometry/clip.js";
import { tatamiFill, FILL_DEFAULTS } from "./fill.js";
import { unsewnPatches } from "./rescue.js";
import { satinIsland, lineIsland, SATIN_DEFAULTS } from "./satin.js";
import { strokeCenterlines } from "../geometry/skeleton.js";
import { beanAlong, runAlong, satinAlong, curveRun, densify } from "./path.js";
import { outlineRuns, OUTLINE_DEFAULTS } from "./outline.js";
import { fillUnderlayRuns, autoFillUnderlay } from "./underlay.js";
import { coverageOf } from "./quality.js";
import { overlappingPairs } from "./overlap.js";
import { widenThin, meanStrokeWidth, letterHeight, lightenHeavy, lightenThick, thinShare } from "../geometry/thin.js";
import { createPlan, PLAN_DEFAULTS } from "./plan.js";
import { FABRICS, DEFAULT_FABRIC } from "./presets.js";

export const ENGINE_DEFAULTS = {
  ...PLAN_DEFAULTS,
  fabric: DEFAULT_FABRIC,
  optimizeColors: true, // reorder objects to save colour changes where nothing overlaps
  hiddenTravel: true, // a move to the next run that would lie under what is sewn after it is stitched, not jumped and cut (fewer trims, a few hidden stitches more)
  maxSatinWidth: 7, // full width, mm: a wider stroke is filled (when satin is asked for by hand)
  autoSatinWidth: 5, // for "auto": a stroke wider than this is filled (a satin stitch longer than about 5 mm sags, and wide curves fan out)
  autoSatinRatio: 3.5, // for "auto": the stroke must be this many times longer than it is wide, so a blob is never a fan of satin
  autoSatinSteady: 2.2, // for "auto": its widest part may be this many times its average width
  satinGap: 1.3, // mm: the stitches of one edge of a satin column are never further apart than this (a bend fans them out, and cloth shows)
  autoSatinGap: 0.8, // ... and for "auto" (the engine's own choice, not the person's): the holes of one edge are 0.6 apart on a straight strip, so a column whose edge spreads past 0.8 is a fan with cloth showing between its stitches, and a fill covers that shape better (129 pictures at 100 mm: at 1.3 the colour error rose 0.19 and the error in the fine detail 0.38, and 4.6 times as many islands went to satin)
  textSatinGap: 2, // ... except typed lettering (an object of kind "text"): its letters are strokes of a font, where satin is the right stitch and a fill makes the edges ragged: 1.3 sent the bold letters K, Z and I (1.3 to 1.5 at their bends, with every other check passed) to a ragged fill
  minIsland: 0.3, // mm2: a smaller piece is dropped (a needle cannot sew a speck under about 0.6 mm across)
  lineMaxWidth: 0.7, // mm: a long piece thinner than this is one line of bean stitches along its middle (a lash, a hair, a vein, a twig), not a filled strip (0.58 until the merge with upstream's thickening fix in trace/labels.js, which draws a script's hairlines 0.6 to 0.7 mm wide: 0.58 sent them to tatami and broke the strokes into pieces; 0.7 on 51 real pictures: stitches +0.35 %, fine-detail error +0.07, a script's lettering 0.91 better and legible)
  textLineBelow: 0.8, // mm: typed lettering (an object of kind "text") whose strokes are this wide or less, typically (area weighted, see meanStrokeWidth), is sewn all as LINES, and heavier lettering as satin or a fill (below): decided letter by letter it flipped inside a word (AVE as thin lines and MARIA as fat satin, because the strokes of one letter are 0.57 mm wide and of the next 0.6). Read back with a text reader (OCR; the share of characters it gets wrong) on 96 texts of nine fonts, caps 3 to 6 mm: letter by letter 0.230, lines or satin at 0.7 mm 0.169, this and the fill below 0.098; on 144 texts of eighteen fonts that were not used to choose any of it 0.338, 0.224, 0.125 (0.7 against 0.8: 0.116 against 0.103 on the nine, 0.152 against 0.128 on the eighteen). 0 = letter by letter, as before
  textLineBelowHair: 0.7, // mm: ... for a face with hairlines and serifs (more than textFillHair of its ink in strips thinner than half its stroke) the lines stop at 0.7: a line is one thread wide whatever the drawing, which loses the contrast of a Times or a Georgia (0.205 against 0.175 characters wrong at 0.8)
  textLineMax: 1.0, // mm: ... and in a text sewn as lines a letter is a line up to this wide (the limit of a single letter of typed lettering is handLineMaxWidth, 0.58 mm)
  textMinStroke: 0.4, // mm: heavy lettering (above textLineBelow) with thick and thin strokes has the strips thinner than this widened to it before it is sewn: the hairlines and serifs of a small Times or Georgia (0.15 to 0.3 mm at 4 mm caps) were dropped (a satin layout leaves out what is under satinMinStroke), and a letter came out as two bars and a slash; 0 = as drawn
  textFillStroke: 0.8, // mm: heavy lettering whose strokes are this thick or more and whose letters are at most textFillCap tall is FILLED (plain rows), not made of satin columns: a satin column round a letter that thick at a small size fans out into fur and the holes of an a, e, o close (Impact at 6 mm was unreadable; letter by letter to now, characters wrong: Archivo Black 0.64 to 0.04, Anton 0.62 to 0.10, Arial Black 0.31 to 0.04). 0 = satin where it can
  textFillCap: 8, // mm
  textFillHair: 0.045, // ... when at most this share of the letters lies in hairlines and serifs (strips thinner than half the typical stroke, see thinShare: a sans 0.01, Georgia bold 0.08, Times bold 0.09, Playfair 0.07): thin strokes are sewn better as satin than as a fill
  textLighten: 0.06, // mm: typed lettering that is filled this way, at most textLightenCap tall, is made this much lighter on every side (corners kept): stitched letters come out bolder than drawn and the holes of an a, e, o fill in. 0 = as drawn
  textLightenCap: 8, // mm
  denseLetters: 1, // 1: typed lettering at most denseCap tall is sewn the way the free tool DADE sews every letter (a plain fill, no satin, no lines, no underlay, rows 0.2 mm apart that reach the edge of every thin stroke) instead of by the rules above: a needle follows a hairline or a serif only if rows cross it, and the old rules (single lines for light text, a row inset from the edge) left thin strokes out. Read back with a text reader (the share of characters it gets wrong) on 96 texts of nine fonts, caps 3 to 6 mm: the rules above 0.098, DADE 0.068, this 0.018 (with denseWeight); on 144 texts of eighteen fonts that were not used to choose any of it 0.126, 0.069, about 0.03. 0 = the rules above only
  denseCap: 8, // mm
  denseWeight: 1, // 1: the rows of dense letters stop short of the edge of a thick stroke (lightenThick in geometry/thin.js). A thread is 0.45 mm wide, so rows that reach the edge came out 1.55 times as heavy as the drawn letters (stitched ink area against the glyph's, caps 3 to 6 mm: 3 mm 1.85, 4 mm 1.59, 5 mm 1.43, 6 mm 1.30; DADE 1.69) and the old rules 0.95: lettering that was thick and weighted. A stroke is taken in by denseStep on each side while it stays denseCore wide, at most denseTrim: 1.22 (3 mm 1.42, 4 mm 1.21, 5 mm 1.12, 6 mm 1.10), and the text reader got fewer characters wrong, 0.030 to 0.018 (the counters of an a, e, o stay open). A 0.4 mm stroke gives up 0.05 on each side, a 0.6 mm one 0.15, a heavy stem 0.2, a hairline nothing. 0 = the rows reach the edge everywhere (and typed letters are made textLighten lighter)
  denseCore: 0.2, // mm: the narrowest row region left in a stroke (rows crossing less are too short to sew, and the stroke falls apart into dots). 0.15: weight 1.16, characters wrong 0.029; 0.2: 1.22, 0.018; 0.25: 1.27, 0.024; 0.3: 1.33, 0.025
  denseTrim: 0.2, // mm: the most taken in on each side (about half a thread: the stitched stroke comes out as wide as the drawn one). 0.25 took the weight to 1.14 and the reader to 0.037
  denseStep: 0.05, // mm: taken in a step at a time (0.1: weight 1.30, same reader score, half the geometry work)
  denseInPictures: 1, // 1: the letters found in a picture (object.letters, trace/lettering.js) that are at most denseCap tall are sewn dense as well ...
  denseMinLetters: 5, // ... when their block (a line or word the finder found) has at least this many letters (letters that touch are one piece, so AVE MARIA of a serif face at 3 mm counts three and stays as it was) ...
  denseMinLettersRefined: 3, // ... or, for a block the second tracing of lettering confirmed (`letters.refined`, trace/refine.js), this many: a short word is 3 or 4 letters (KAZI, Open, BMW), and letters that touch are one object, so the finder's own count of the block's letters (`letters.n`) is read as well ...
  denseMinStroke: 0.35, // ... and their typical stroke is at least this thick (mm): the finder sometimes takes the thin black outlines of a crown (strokes 0.31 and 0.32 mm) for letters, and a fill makes a line that thin visibly heavier; a stroke thinner than this is a line, as before
  denseSpacing: 0.2, // mm between the rows (a normal fill is 0.4; DADE sews 0.2). Characters wrong, caps 3 to 6 mm, nine fonts / eighteen other fonts: 0.2 mm 0.030 / 0.036, 0.25 mm 0.034 / 0.044, 0.3 mm 0.045 / -. Twice the usual density: if a sew-out shows the letters stiff, 0.25 is the next step
  denseStitchLen: 3, // mm
  denseMinRow: 0.15, // mm: a row piece shorter than this is dropped (a normal fill keeps 0.3): thin strokes are crossed by short pieces. DADE keeps every piece however short (two thirds of its stitches in 3 mm text are under 0.4 mm); with 0.15 and denseMinPiece the shortest stitch stays 0.3 mm
  denseMinPiece: 0.3, // mm: never leave a first or last stitch of a row shorter than this (a normal fill keeps 0.9)
  densePhases: 1, // 1: the rows of a dense letter are also tried shifted by a fraction of a row step (fill.js rowPhases), and the shift that puts rows across most of the letter is kept. Rows in the middle of equal strips fall symmetrically, and with denseWeight the stem of an I, l or T is taken in to 0.2 mm, the row spacing: it sat exactly between two rows and was not sewn at all (bench of 2026-11-16: the I of a 3 mm typewriter MARIA lost its whole stem). 0 = rows in the middle of their strips, as before
  densePhaseMissed: 0.5, // ... but only when at least this many mm of strokes (counted at the lines half way between two rows) are missed by the rows in the middle, and the shift taken misses at most half as much: a letter with no such stroke keeps its rows
  denseRescue: 1, // 1: after the rows of a dense letter are laid, any part of the DRAWN letter that no thread reaches (rescue.js: the shape's interior, 0.08 mm in from its edge, further than denseRescueHalf from every stitch, in a piece of at least denseRescueArea) gets the drawn shape put back round it and the rows are laid again: a thin neck or a junction that denseWeight took in to nothing left a notch in the letter (3 mm and 6 mm lettering, bench of 2026-11-16: bare pieces of 0.5 to 0.75 mm). The same rows, so no extra thread, tie stitch or jump. 0 = as before
  denseRescueLetters: 1, // 1: the same for a letter found in a picture that is not sewn dense (a connected script is one piece, so it never has five letters to its block): its thin necks were left bare by the plain fill's 0.3 mm shortest row piece. 0 = dense letters only
  denseRescueHalf: 0.2, // mm: how far a thread is taken to reach either side of its stitch (it is about 0.45 mm wide)
  denseRescueCompare: 0.125, // mm: ... and two sewings of the letter are compared by how much of it lies further than this from every stitch (the rim and hairlines included)
  denseRescueArea: 0.06, // mm2: smaller bare pieces are left alone
  denseRescueGrow: 0.06, // mm: a bare piece is made this much bigger (inside the drawn shape) before it is put back, so the rows (0.2 mm apart) cross it (0.12 put back more of the letter and made it heavier: extra ink 3.00 % against 2.92 %)
  denseInsetStroke: 0.8, // mm: (only with denseWeight 0) lettering whose strokes are this thick or more ...
  denseInset: 0.1, // ... has its rows stop this far inside the edge, so the holes of an a, e, o stay open (Impact, caps 3 to 6 mm: 0.389 characters wrong with the rows at the edge, 0.151 with this); thinner lettering is filled right up to the edge
  pictureLineBelow: 0.55, // mm: the letters of a run of lettering found in a picture (object.letters, trace/lettering.js) are sewn like typed lettering, as lines from end to end, when the run's typical stroke is thinner than this: the crest's AVE MARIA went from 0.75 to 0.12 of its characters read wrong, and nothing else among 134 drawn pictures and 7 real ones changed for the worse. A heavier run is sewn letter by letter as before: the typed rules for it (satin, a fill) made it worse in the same test, 0.167 to 0.207 and 0.169 to 0.197 (the traced letters are less exact than a typed font's)
  pictureLettering: 1, // 0 turns the picture's half off: each letter on its own, as before
  handLineMaxWidth: 0.58, // mm: ... but only for the shapes made from a picture (object.source === "image": the tracer draws a script's hairlines 0.6 to 0.7 mm wide); typed lettering and shapes drawn by hand keep the limit they always had
  lineRatio: 2.5, // ... when it is at least this many times longer than wide
  lineHoles: 999, // ... with at most this many holes (the loops of an a, an e, an o, or a network of thin lines: what counts is the width of its middle lines, see lineWide) ...
  lineWide: 1.2, // ... and the middle lines of a piece with holes must be no wider than this times lineMaxWidth on average (the black of an engraving, a mass full of tiny holes, is not a network of lines)
  lineLen: 1.4, // mm, the length of one stretch of that bean line
  lineDev: 0.07, // mm: how far a stretch of a thin line (the bean lines of lettering, the fine lines of a picture) may cut across a curve: the needle holes come closer on a tight curve, so a small ring stays round (a fixed 1.4 to 2 mm made a pearl's outline a decagon); 0 = a fixed length, as before
  lineImpl: "runs", // how the line is laid: "runs" (the skeleton's chains as they are) or "island" (satin.js lineIsland: strokes that run straight through a junction are one line, ends run on to the tip, stitches follow a curve)
  thinArms: 1, // a thin stroke that grows out of a bigger piece of the same colour (a smile that touches a nose, a hairline serif) is cut away from the fill and sewn as a line; 0 = never
  thinArmMin: 1.8, // ... when it is at least this long (mm)
  thinArmsRatio: 40, // ... in a piece whose perimeter squared is at least this many times its area (a compact piece has none)
  thinArmsVerts: 500, // ... and which has at most this many points (cutting a big ragged piece costs as much time as the rest of the picture)
  satinCoverage: 0.85, // a satin attempt must cover this much of its island (thread drawn 1.5 x the spacing wide) ...
  satinMinStroke: 0.4, // mm: parts of a shape thinner than this are left out of a satin layout (0.6 broke the thin strokes of small lettering into dashes; an object's own satin.minStroke wins)
  satinSpill: 0.15, // ... and put no more than this share of the island's area outside it
  satinExcess: 1.7, // ... and lay no more than this many times the thread the shape needs
  satinDense: 0.2, // ... and pile four or more threads on no more than this share of the shape
  joinWithinIsland: 4.0, // a gap up to this inside one island is joined with a plain stitch (underlay to top)
  joinColumns: 1.5, // satin columns of one island closer than this are joined
  maxStitches: 1500000, // a design that would need more than this is refused before any work is done (a typo of 6000 mm for 60)
  maxCoord: 5000, // mm: a shape with a point further than this from the hoop's centre is not a shape for any machine
};

export function parseColor(c) {
  if (!c) return { r: 20, g: 20, b: 20 };
  if (typeof c === "object") return { r: c.r | 0, g: c.g | 0, b: c.b | 0, name: c.name, code: c.code, brand: c.brand };
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
  if (!m) return { r: 20, g: 20, b: 20 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** The object's rings in the hoop's frame: its own shape moved by its transform ({ x, y, sx, sy, rot }). */
export function bakeObject(obj) {
  if (!Array.isArray(obj.rings)) return [];
  const t = obj.transform;
  if (!t) return obj.rings;
  return transformRings(obj.rings, composeMatrix(t));
}

const bboxIntersects = (a, b, pad = 0.2) => a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad;

/** Do two objects lie on top of each other (more than touching)? */
function overlaps(a, b) {
  if (!bboxIntersects(a.box, b.box)) return false;
  const cut = intersectRings(a.rings, b.rings);
  let area = 0;
  for (const r of cut) area += ringArea(r);
  return area > OVERLAP_MM2;
}

/** From this many parts of objects on, the order is worked out without testing every pair for overlap (a traced photograph has thousands). */
const MANY_ITEMS = 200;
/** Two parts lie over each other when they overlap by more than this (mm²): a touch along an edge does not count. */
const OVERLAP_MM2 = 0.4;

/**
 * Which pairs of objects lie on each other by more than 0.4 mm2? Cutting every pair of shapes against each other with the polygon
 * engine took minutes for a picture of a few thousand shapes (a big shape is cut again for every small one beside it), so the objects
 * are drawn into one grid of 0.1 mm cells and the cells two objects share are counted. Returns a Set of keys (lower object index
 * * 1000003 + higher one), or null when the design is too wide for a fine grid (the caller then cuts the pairs one by one).
 */
function overlapPairs(items, minArea = 0.4) {
  const objs = new Map();
  for (const it of items) if (!objs.has(it.objIndex)) objs.set(it.objIndex, it);
  const list = [...objs.values()];
  const out = new Set();
  if (list.length < 2) return out;
  const boxes = list.map((it) => bboxOf(it.rings));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) { if (b[0] < x0) x0 = b[0]; if (b[1] < y0) y0 = b[1]; if (b[2] > x1) x1 = b[2]; if (b[3] > y1) y1 = b[3]; }
  const cell = Math.max(0.1, Math.sqrt(((x1 - x0) * (y1 - y0)) / 4e6));
  if (cell > 0.4) return null;
  const W = Math.floor((x1 - x0) / cell) + 2, H = Math.floor((y1 - y0) / cell) + 2;
  const own1 = new Int32Array(W * H).fill(-1), own2 = new Int32Array(W * H).fill(-1);
  const more = new Map(); // a cell that three or more objects cover keeps the others here
  const multi = [];
  list.forEach((it, k) => {
    // even-odd scan lines through the cell centres
    const edges = [];
    let ymin = Infinity, ymax = -Infinity;
    for (const r of it.rings) {
      for (let i = 0, m = r.length; i < m; i++) {
        let ax = (r[i][0] - x0) / cell, ay = (r[i][1] - y0) / cell, bx = (r[(i + 1) % m][0] - x0) / cell, by = (r[(i + 1) % m][1] - y0) / cell;
        if (ay === by) continue;
        if (ay > by) { const tx = ax, ty = ay; ax = bx; ay = by; bx = tx; by = ty; }
        edges.push([ax, ay, bx, by]);
        if (ay < ymin) ymin = ay;
        if (by > ymax) ymax = by;
      }
    }
    if (!edges.length) return;
    const r0 = Math.max(0, Math.ceil(ymin - 0.5)), r1 = Math.min(H - 1, Math.ceil(ymax - 0.5) - 1);
    const start = new Map();
    for (const e of edges) { const row = Math.max(r0, Math.ceil(e[1] - 0.5)); if (!start.has(row)) start.set(row, []); start.get(row).push(e); }
    let active = [];
    for (let row = r0; row <= r1; row++) {
      const add = start.get(row);
      if (add) for (const e of add) active.push(e);
      const yc = row + 0.5;
      active = active.filter((e) => e[3] > yc);
      const xs = [];
      for (const e of active) if (e[1] <= yc) xs.push(e[0] + ((yc - e[1]) * (e[2] - e[0])) / (e[3] - e[1]));
      xs.sort((p, q) => p - q);
      for (let j = 0; j + 1 < xs.length; j += 2) {
        const xa = Math.max(0, Math.ceil(xs[j] - 0.5)), xb = Math.min(W - 1, Math.ceil(xs[j + 1] - 0.5) - 1);
        for (let x = xa; x <= xb; x++) {
          const c = row * W + x;
          if (own1[c] < 0) own1[c] = k;
          else if (own2[c] < 0) { own2[c] = k; multi.push(c); }
          else { const o = more.get(c); if (o) o.push(k); else more.set(c, [k]); }
        }
      }
    }
  });
  const counts = new Map();
  const bump = (a, b) => { const key = a * list.length + b; counts.set(key, (counts.get(key) || 0) + 1); };
  for (const c of multi) {
    const owners = [own1[c], own2[c], ...(more.get(c) || [])];
    for (let a = 0; a < owners.length; a++) for (let b = a + 1; b < owners.length; b++) bump(Math.min(owners[a], owners[b]), Math.max(owners[a], owners[b]));
  }
  const need = minArea / (cell * cell);
  for (const [key, cnt] of counts) {
    if (cnt <= need) continue;
    const a = Math.floor(key / list.length), b = key - a * list.length;
    const oa = list[a].objIndex, ob = list[b].objIndex;
    out.add(Math.min(oa, ob) * 1000003 + Math.max(oa, ob));
  }
  return out;
}

/**
 * Where thread would be seen: for every point of the design, which item of the sewing order covers it last. Every fill is drawn into a coarse grid (a cell is a
 * quarter of a millimetre or more) in sewing order, so a cell keeps the position of the last item that covers it, and `hidden(a, b, k, colour)` says whether a
 * thread laid straight from a to b while item k is sewn would lie under what is sewn after it (or on a patch of its own colour), cell by cell with the cells next
 * to it too. Returns null when there is nothing to look at.
 */
function buildCover(items, order, colourOf) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const fills = [];
  for (let k = 0; k < order.length; k++) {
    const it = items[order[k]];
    if (it.part !== "fill") continue;
    const b = it.box;
    if (b[0] < x0) x0 = b[0];
    if (b[1] < y0) y0 = b[1];
    if (b[2] > x1) x1 = b[2];
    if (b[3] > y1) y1 = b[3];
    fills.push(k);
  }
  if (!fills.length) return null;
  const cell = Math.max(0.25, Math.sqrt(((x1 - x0) * (y1 - y0)) / 4e6));
  const W = Math.floor((x1 - x0) / cell) + 3, H = Math.floor((y1 - y0) / cell) + 3;
  const last = new Int32Array(W * H).fill(-1);
  for (const k of fills) {
    const it = items[order[k]];
    const edges = [];
    let ymin = Infinity, ymax = -Infinity;
    for (const r of it.rings) {
      for (let i = 0, m = r.length; i < m; i++) {
        let ax = (r[i][0] - x0) / cell + 1, ay = (r[i][1] - y0) / cell + 1, bx = (r[(i + 1) % m][0] - x0) / cell + 1, by = (r[(i + 1) % m][1] - y0) / cell + 1;
        if (ay === by) continue;
        if (ay > by) { const tx = ax, ty = ay; ax = bx; ay = by; bx = tx; by = ty; }
        edges.push([ax, ay, bx, by]);
        if (ay < ymin) ymin = ay;
        if (by > ymax) ymax = by;
      }
    }
    if (!edges.length) continue;
    const r0 = Math.max(0, Math.ceil(ymin - 0.5)), r1 = Math.min(H - 1, Math.ceil(ymax - 0.5) - 1);
    const start = new Map();
    for (const e of edges) { const row = Math.max(r0, Math.ceil(e[1] - 0.5)); if (!start.has(row)) start.set(row, []); start.get(row).push(e); }
    let active = [];
    for (let row = r0; row <= r1; row++) {
      const add = start.get(row);
      if (add) for (const e of add) active.push(e);
      const yc = row + 0.5;
      active = active.filter((e) => e[3] > yc);
      const xs = [];
      for (const e of active) if (e[1] <= yc) xs.push(e[0] + ((yc - e[1]) * (e[2] - e[0])) / (e[3] - e[1]));
      xs.sort((p, q) => p - q);
      for (let j = 0; j + 1 < xs.length; j += 2) {
        const xa = Math.max(0, Math.ceil(xs[j] - 0.5)), xb = Math.min(W - 1, Math.ceil(xs[j + 1] - 0.5) - 1);
        for (let x = xa; x <= xb; x++) last[row * W + x] = k;
      }
    }
  }
  const seen = (cx, cy, k, colour) => {
    if (cx < 1 || cy < 1 || cx >= W - 1 || cy >= H - 1) return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const v = last[(cy + dy) * W + cx + dx];
        // thread shows on bare cloth, and on whatever was sewn last there before it, unless that is its own colour
        if (v < 0 || (v <= k && colourOf[v] !== colour)) return false;
      }
    }
    return true;
  };
  return {
    hidden(a, b, k, colour) {
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(2, Math.ceil(d / (cell * 1.5)));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        if (!seen(Math.floor((a[0] + (b[0] - a[0]) * t - x0) / cell) + 1, Math.floor((a[1] + (b[1] - a[1]) * t - y0) / cell) + 1, k, colour)) return false;
      }
      return true;
    },
  };
}

/**
 * The order to sew in. An item is one part of one object (its fill, or its outline). The design's own order is kept, except
 * that items are pulled forward to join their colour when nothing they overlap would then be sewn in the wrong order: an
 * object's outline comes after its fill, and an object that lies on another comes after it.
 */
function scheduleOrder(items, optimize) {
  if (!optimize || items.length < 3) return items.map((_, i) => i);
  const n = items.length;
  const before = Array.from({ length: n }, () => []); // before[j] = indexes that must come first
  const fast = overlapPairs(items);
  if (fast) {
    // an object's own fill before its outline, then every pair of objects that lie on each other
    const byObj = new Map();
    items.forEach((it, i) => { if (!byObj.has(it.objIndex)) byObj.set(it.objIndex, []); byObj.get(it.objIndex).push(i); });
    for (const list of byObj.values()) for (let a = 1; a < list.length; a++) for (let b = 0; b < a; b++) before[list[a]].push(list[b]);
    for (const key of fast) {
      const lo = Math.floor(key / 1000003), hi = key - lo * 1000003; // object indexes, lo < hi
      for (const j of byObj.get(hi) || []) for (const i of byObj.get(lo) || []) before[j].push(i);
    }
    for (const b of before) b.sort((p, q) => p - q); // the order the pairwise loop would have made
  } else if (n >= MANY_ITEMS) {
    // a design too wide for the fine grid above and of thousands of parts: the overlapping pairs are found on the shapes' own grid (stitch/overlap.js), not by clipping every pair
    const seen = new Set();
    const add = (i, j) => { const k = i * n + j; if (!seen.has(k)) { seen.add(k); before[j].push(i); } };
    for (const [i, j] of overlappingPairs(items.map((it) => it.rings), OVERLAP_MM2)) if (items[i].objIndex !== items[j].objIndex) add(i, j);
    const byObject = new Map();
    items.forEach((it, i) => { if (byObject.has(it.objIndex)) add(byObject.get(it.objIndex), i); else byObject.set(it.objIndex, i); }); // its own fill before its outline
  } else {
    const cache = new Map();
    const over = (i, j) => {
      const key = i.objIndex * 100000 + j.objIndex;
      if (!cache.has(key)) cache.set(key, overlaps(i, j));
      return cache.get(key);
    };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (items[i].objIndex === items[j].objIndex) before[j].push(i); // its own fill before its outline
        else if (over(items[i], items[j])) before[j].push(i);
      }
    }
  }
  // The detail layer (the fine lines and dots found on the picture) is sewn after everything that comes before it in the design. Saving colour
  // changes could otherwise hoist a thread ahead of shapes it does not overlap, but should lie on top of.
  const details = [];
  items.forEach((it, i) => { if (it.detail) details.push(i); });
  const waiting = new Map(details.map((j) => [j, 0]));
  for (let i = 0; i < n && details.length; i++) {
    if (items[i].detail) continue;
    for (const j of details) if (items[i].objIndex < items[j].objIndex) waiting.set(j, waiting.get(j) + 1);
  }
  const done = new Array(n).fill(false);
  const order = [];
  let colour = null;
  let at = null;
  while (order.length < n) {
    const ready = [];
    for (let i = 0; i < n; i++) if (!done[i] && !(items[i].detail && waiting.get(i) > 0) && before[i].every((k) => done[k])) ready.push(i);
    // Stay in the colour being sewn while anything of it can be sewn now; otherwise change to the colour of the earliest thing
    // in the design's own order (so the colours go in the order the design stacks them: backgrounds first, details last).
    let pick = ready.filter((i) => items[i].colorKey === colour);
    if (!pick.length) pick = ready.filter((i) => items[i].colorKey === items[ready[0]].colorKey);
    // The nearest of those to where the needle is.
    let chosen = pick[0];
    if (at) {
      let bd = Infinity;
      for (const i of pick) {
        const b = items[i].box;
        const d = Math.hypot((b[0] + b[2]) / 2 - at[0], (b[1] + b[3]) / 2 - at[1]);
        if (d < bd) { bd = d; chosen = i; }
      }
    }
    done[chosen] = true;
    order.push(chosen);
    if (!items[chosen].detail) for (const j of details) if (items[chosen].objIndex < items[j].objIndex) waiting.set(j, waiting.get(j) - 1);
    colour = items[chosen].colorKey;
    const b = items[chosen].box;
    at = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  }
  return order;
}

const finite = (v) => typeof v === "number" && Number.isFinite(v);
/** A number held inside [lo, hi]; the fallback when it is not a number at all. */
const within = (v, lo, hi, fallback) => (finite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/**
 * The stitch settings of an object's fill with the fabric's defaults under them. Every number is held to a range the engine
 * can work with (a damaged file with a stitch length of 0 must not be able to make it loop for ever).
 */
function fillSettings(obj, fabric) {
  const f = obj.fill || {};
  const base = (FABRICS[fabric] || FABRICS[DEFAULT_FABRIC]).fill;
  const s = { ...FILL_DEFAULTS, ...base, ...f };
  const d = (k) => (base[k] !== undefined ? base[k] : FILL_DEFAULTS[k]);
  s.spacing = within(f.spacing, 0.1, 3, d("spacing"));
  s.stitchLen = within(f.stitchLen, 0.8, 12, d("stitchLen"));
  s.pullComp = within(f.pullComp, 0, 2, d("pullComp"));
  s.angle = finite(f.angle) ? f.angle : d("angle");
  s.grow = within(f.grow, 0, 1, FILL_DEFAULTS.grow);
  s.inset = within(f.inset, 0, 5, FILL_DEFAULTS.inset);
  s.stagger = Math.round(within(f.stagger, 0, 16, FILL_DEFAULTS.stagger));
  return s;
}
function satinSettings(obj, fabric, S) {
  const f = obj.fill || {};
  const base = (FABRICS[fabric] || FABRICS[DEFAULT_FABRIC]).satin;
  const raw = f.satin || {};
  const s = { ...SATIN_DEFAULTS, ...base, maxWidth: S.maxSatinWidth, ...raw };
  const d = (k) => (base[k] !== undefined ? base[k] : SATIN_DEFAULTS[k]);
  s.spacing = within(raw.spacing, 0.1, 2, d("spacing"));
  s.pullComp = within(raw.pullComp, 0, 1.5, d("pullComp"));
  s.maxWidth = within(raw.maxWidth, 1, 12, S.maxSatinWidth);
  s.minStroke = within(raw.minStroke != null ? raw.minStroke : S.satinMinStroke, 0.2, 3, SATIN_DEFAULTS.minStroke);
  s.underlayLen = within(raw.underlayLen, 0.8, 8, SATIN_DEFAULTS.underlayLen);
  s.inset = within(raw.inset, 0, 2, SATIN_DEFAULTS.inset);
  // An "Auto" shape that turns out to be a stroke is sewn as satin: the underlay chosen for its fill carries over to the satin.
  if (raw.underlay == null && (f.type || "auto") === "auto") {
    const carried = { none: "none", edge: "edge", "edge+tatami": "center+edge" }[f.underlay];
    if (carried) s.underlay = carried;
  }
  return s;
}
/**
 * A thin closed shape round an open line (the two sides of the line, `half` mm either way), so the engine can ask where the line lies over
 * other shapes (order, hidden travel) with the same tools it uses for every shape. The stitches themselves follow the line, not this shape.
 */
function footprint(line, half) {
  const n = line.length, left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)], p = line[i];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const d = Math.hypot(tx, ty) || 1;
    tx /= d; ty /= d;
    left.push([p[0] - ty * half, p[1] + tx * half]);
    right.push([p[0] + ty * half, p[1] - tx * half]);
  }
  return [...left, ...right.reverse()];
}

/**
 * The order to sew separate open lines in, and which way round each goes: from the end nearest the needle, always on to the nearest end
 * (a line may be sewn from either end), then untangled with 2-opt moves so a long hop is not left for the end. A hop under the trim distance
 * is a jump the thread is not cut for; a longer one is a trim, so a good order means fewer cuts. Returns the lines, turned the way they are sewn.
 */
function orderLines(lines, from) {
  const n = lines.length;
  if (n < 2) return lines.map((l) => l.slice());
  const ends = lines.map((l) => [l[0], l[l.length - 1]]);
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  // greedy: from the needle (or the first line's start), to the nearest end of what is left
  const used = new Array(n).fill(false);
  const seq = []; // { i, rev }
  let cur = from || ends[0][0];
  for (let k = 0; k < n; k++) {
    let best = -1, bRev = false, bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const d0 = d(cur, ends[i][0]), d1 = d(cur, ends[i][1]);
      if (d0 < bd) { bd = d0; best = i; bRev = false; }
      if (d1 < bd) { bd = d1; best = i; bRev = true; }
    }
    used[best] = true;
    seq.push({ i: best, rev: bRev });
    cur = ends[best][bRev ? 0 : 1];
  }
  const head = (s) => ends[s.i][s.rev ? 1 : 0], tail = (s) => ends[s.i][s.rev ? 0 : 1];
  // 2-opt: reverse a stretch of the sequence (and turn every line in it round) when that shortens the hops
  for (let pass = 0; pass < 6; pass++) {
    let improved = false;
    for (let a = 0; a < n - 1; a++) {
      for (let b = a + 1; b < n; b++) {
        const before = a > 0 ? tail(seq[a - 1]) : from;
        const after = b < n - 1 ? head(seq[b + 1]) : null;
        const oldCost = (before ? d(before, head(seq[a])) : 0) + (after ? d(tail(seq[b]), after) : 0);
        const newCost = (before ? d(before, tail(seq[b])) : 0) + (after ? d(head(seq[a]), after) : 0);
        if (newCost < oldCost - 1e-9) {
          const piece = seq.slice(a, b + 1).reverse().map((s) => ({ i: s.i, rev: !s.rev }));
          seq.splice(a, b - a + 1, ...piece);
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return seq.map((s) => (s.rev ? lines[s.i].slice().reverse() : lines[s.i].slice()));
}

function strokeSettings(stroke) {
  return {
    ...stroke,
    width: within(stroke.width, 0.3, 12, OUTLINE_DEFAULTS.width),
    len: within(stroke.len, 0.5, 10, OUTLINE_DEFAULTS.len),
    spacing: within(stroke.spacing, 0.1, 2, OUTLINE_DEFAULTS.spacing),
    pullComp: within(stroke.pullComp, 0, 1.5, OUTLINE_DEFAULTS.pullComp),
  };
}

/** The widest gap, in mm, between neighbouring stitches along one edge of a satin column (needle points two apart in the list). */
function satinEdgeGap(paths) {
  let worst = 0;
  for (const p of paths) {
    for (let k = 0; k + 2 < p.length; k++) {
      const d = Math.hypot(p[k][0] - p[k + 2][0], p[k][1] - p[k + 2][1]);
      if (d > worst) worst = d;
    }
  }
  return worst;
}

/** About how many stitches the items come to, so a design that is far too big is turned down before the engine works on it. */
function estimateStitches(items, S) {
  let n = 0;
  for (const it of items) {
    if (it.part === "fill") {
      const fs = fillSettings(it.obj, S.fabric);
      let area = 0;
      for (const is of islandsOf(it.rings)) area += ringArea(is.outer) - is.holes.reduce((a, h) => a + ringArea(h), 0);
      n += (area / (fs.spacing * fs.stitchLen)) * 1.6; // the top, and an allowance for underlay
    } else if (it.part === "line") {
      const st = strokeSettings(it.obj.stroke);
      let per = 0;
      for (const l of it.lines) for (let k = 1; k < l.length; k++) per += Math.hypot(l[k][0] - l[k - 1][0], l[k][1] - l[k - 1][1]);
      n += st.type === "satin" ? (per / st.spacing) * 1.3 : (per / st.len) * (st.type === "bean" ? 3 : 1);
    } else {
      const st = strokeSettings(it.obj.stroke);
      const per = it.rings.reduce((a, r) => a + ringPerimeter(r), 0);
      n += st.type === "satin" ? (per / st.spacing) * 1.3 : (per / st.len) * (st.type === "bean" ? 3 : 1);
    }
  }
  return n;
}

/**
 * The order to sew separate pieces (the letters of a word, the islands of a shape) in: from the piece nearest the needle, or the
 * top left one when there is no needle yet, always on to a near one, then untangled (2-opt) so a long hop is not left for the end.
 * Works on the pieces' centres. Returns the pieces in sewing order.
 */
function planIslands(pieces, from) {
  const n = pieces.length;
  if (n < 2) return pieces;
  const c = pieces.map((t) => { const b = bboxOf([t.is.outer]); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; });
  const dist = (i, j) => Math.hypot(c[i][0] - c[j][0], c[i][1] - c[j][1]);
  let first = 0;
  if (from) { let bd = Infinity; for (let i = 0; i < n; i++) { const d = Math.hypot(c[i][0] - from[0], c[i][1] - from[1]); if (d < bd) { bd = d; first = i; } } }
  else { let bk = Infinity; for (let i = 0; i < n; i++) { const k = c[i][0] + 2 * c[i][1]; if (k < bk) { bk = k; first = i; } } }
  const path = [first];
  const left = new Set(Array.from({ length: n }, (_, i) => i));
  left.delete(first);
  while (left.size) {
    const last = path[path.length - 1];
    let best = -1, bd = Infinity;
    for (const j of left) { const d = dist(last, j); if (d < bd) { bd = d; best = j; } }
    path.push(best);
    left.delete(best);
  }
  if (n >= 4 && n <= 400) {
    // the first piece stays first; the path is open at its far end
    for (let pass = 0; pass < 8; pass++) {
      let changed = false;
      for (let i = 1; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = path[i - 1], b = path[i], d = path[j], e = j + 1 < n ? path[j + 1] : -1;
          const gain = dist(a, b) + (e >= 0 ? dist(d, e) : 0) - dist(a, d) - (e >= 0 ? dist(b, e) : 0);
          if (gain > 1e-6) { for (let lo = i, hi = j; lo < hi; lo++, hi--) { const t = path[lo]; path[lo] = path[hi]; path[hi] = t; } changed = true; }
        }
      }
      if (!changed) break;
    }
  }
  return path.map((i) => pieces[i]);
}

/** Points a millimetre for the skeleton of a thin piece: 10 is plenty for a line; a big shape with thin bars all over it gets a coarser grid so its skeleton stays quick. */
function lineGridRes(shape) {
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const r of shape) for (const p of r) { if (p[0] < bx0) bx0 = p[0]; if (p[0] > bx1) bx1 = p[0]; if (p[1] < by0) by0 = p[1]; if (p[1] > by1) by1 = p[1]; }
  return Math.max(4, Math.min(10, Math.sqrt(1.5e6 / Math.max(1, (bx1 - bx0) * (by1 - by0)))));
}

/**
 * A thin piece as a line, laid the way `S.lineImpl` says: "runs" (`lineRuns`, the skeleton's chains as they are) or "island" (`lineIsland` in satin.js:
 * strokes that run straight through a junction are one line, the ends run on to the tip, the stitches follow a curve). Either way a piece is sewn by
 * this alone: the caller never also tries satin or tatami on what it returns. Returns [{ pts, join }] or null.
 */
function thinLine(shape, start, S) {
  if (S.lineImpl !== "island") return lineRuns(shape, start, S);
  let line = null;
  try { line = lineIsland(shape, { meanWidth: Infinity, maxWidth: Infinity, minLength: 0.4, len: S.lineLen, dev: 0.07, res: lineGridRes(shape), start }); } catch (e) { return null; }
  if (!line || (shape.length > 1 && line.meanWidth > S.lineMaxWidth * S.lineWide)) return null; // (a mass with holes in it, not a network of lines)
  let at = start || null;
  return line.paths.map((p) => {
    const join = !!at && Math.hypot(p[0][0] - at[0], p[0][1] - at[1]) <= 0.8;
    at = p[p.length - 1];
    return { pts: p, join };
  });
}

/**
 * A thin piece as a line: its middle line from the skeleton, each stretch sewn forward, back and forward again (a bean stitch: one bold thread, about
 * half a millimetre wide), the pieces of a branching shape nearest first and joined where they meet. Returns [{ pts, join }] or null when the shape
 * has no middle line to follow.
 */
function lineRuns(shape, start, S) {
  let sk;
  try { sk = strokeCenterlines(shape, { res: lineGridRes(shape) }); } catch (e) { return null; }
  if (!sk || !sk.chains.length) return null;
  if (shape.length > 1 && sk.meanHalf * 2 > S.lineMaxWidth * S.lineWide) return null; // a mass with holes in it, not a network of lines
  const todo = [];
  for (const c of sk.chains) {
    if (c.pts.length < 2) continue;
    let len = 0;
    for (let i = 1; i < c.pts.length; i++) len += Math.hypot(c.pts[i][0] - c.pts[i - 1][0], c.pts[i][1] - c.pts[i - 1][1]);
    if (len < 0.4) continue;
    let pts = c.pts.map((p) => [p[0], p[1]]);
    if (!c.closed) {
      // the middle line stops about half a width short of the tip of the shape: run on to it
      const grow = (a, b) => {
        const dx = a[0] - b[0], dy = a[1] - b[1], d = Math.hypot(dx, dy) || 1;
        return [a[0] + (dx / d) * 0.2, a[1] + (dy / d) * 0.2];
      };
      pts = [grow(pts[0], pts[1]), ...pts, grow(pts[pts.length - 1], pts[pts.length - 2])];
    }
    todo.push({ pts, closed: c.closed });
  }
  if (!todo.length) return null;
  const out = [];
  let at = start || null;
  while (todo.length) {
    let bi = 0, bd = Infinity, flip = false;
    if (at) {
      todo.forEach((t, i) => {
        const a = t.pts[0], b = t.pts[t.pts.length - 1];
        const da = Math.hypot(a[0] - at[0], a[1] - at[1]), db = Math.hypot(b[0] - at[0], b[1] - at[1]);
        if (da < bd) { bd = da; bi = i; flip = false; }
        if (!t.closed && db < bd) { bd = db; bi = i; flip = true; }
      });
    }
    const [t] = todo.splice(bi, 1);
    const line = flip ? t.pts.slice().reverse() : t.pts;
    const pts = beanAlong(line, { len: S.lineLen, closed: t.closed, dev: S.lineDev > 0 ? S.lineDev : 0 });
    if (pts.length >= 2) {
      out.push({ pts, join: !!at && bd <= 0.8 });
      at = pts[pts.length - 1];
    }
  }
  return out.length ? out : null;
}

/**
 * A thin stroke that grows out of a bigger piece of the same colour (the smile that touches a panda's nose, the hairline of a serif, a whisker on a nose) is lost
 * when the piece is filled: the rows of a fill do not fit in it. What a disc of the line's width cannot enter (the shape opened by half `lineMaxWidth`) is cut away
 * and its long thin parts are returned to be sewn as lines; `body` is the shape without them. Null when there is no such stroke.
 */
function thinArms(shape, area, S) {
  if (!(S.thinArms > 0)) return null;
  const per = shape.reduce((s, r) => s + ringPerimeter(r), 0);
  if (per * per < S.thinArmsRatio * area) return null; // a compact piece has none
  if (shape.reduce((s, r) => s + r.length, 0) > S.thinArmsVerts) return null;
  const r = S.lineMaxWidth / 2;
  const core = offsetRings(offsetRings(shape, -r, { join: "round" }), r, { join: "round" });
  if (!core.length) return null;
  const rest = differenceRings(shape, core);
  if (!rest.length) return null;
  const arms = [];
  let grown = null;
  for (const is of islandsOf(rest)) {
    const a = ringArea(is.outer) - is.holes.reduce((s, h) => s + ringArea(h), 0);
    if (a < 0.3) continue;
    const p = ringPerimeter(is.outer) + is.holes.reduce((s, h) => s + ringPerimeter(h), 0);
    const w = (2 * a) / Math.max(1e-6, p);
    const len = a / Math.max(1e-6, w);
    // (a sliver along an edge, left by the rounding of the cut, is far narrower than any stroke; the sharp tip of a leaf is short)
    if (!(w >= 0.15 && w < S.lineMaxWidth && len >= S.thinArmMin && len >= 3 * w)) continue;
    // A stroke grows OUT of the piece: it meets it at its root, about its own width. A sliver that lies along the piece's edge (the teeth of a ragged outline) meets it all along its length.
    if (!grown) grown = offsetRings(core, 0.05);
    let touch = 0;
    for (const t of islandsOf(intersectRings([is.outer, ...is.holes], grown))) touch += ringArea(t.outer) - t.holes.reduce((s, h) => s + ringArea(h), 0);
    if (touch / 0.05 > 2.5 * w + 0.3) continue;
    arms.push([is.outer, ...is.holes]);
  }
  if (!arms.length) return null;
  const body = differenceRings(shape, arms.flat());
  if (!body.length) return null;
  return { body, arms };
}

/** How much of the usual pull allowance a piece of this mean width (mm) gets: all of it from 3 mm, down to under half for a hairline. */
const narrowScale = (w) => Math.max(0.45, Math.min(1, 0.4 + 0.2 * w));

/**
 * The fill settings of a letter of small typed lettering (S.denseLetters), the way the free tool DADE sews every letter, with what the person set by hand left as it is: rows
 * denseSpacing apart, no pull allowance, no underlay, and the rows run right up to the edge of the letter, so a hairline or a serif that a row crosses is sewn. In heavy lettering
 * (strokes of denseInsetStroke or more) they stop denseInset short of the edge, so the holes of an a, e, o stay open. A row piece and a stitch as short as 0.15 and 0.3 mm are kept.
 */
function denseFill(fx, f, S, stroke) {
  const out = { ...fx, minRow: S.denseMinRow, minPiece: S.denseMinPiece };
  if (f.spacing == null) out.spacing = S.denseSpacing;
  if (f.stitchLen == null) out.stitchLen = S.denseStitchLen;
  if (f.pullComp == null) out.pullComp = 0;
  if (f.inset == null) out.inset = S.denseWeight > 0 ? 0 : stroke >= S.denseInsetStroke ? S.denseInset : 0;
  if (f.grow == null) out.grow = 0;
  if (S.densePhases > 0) { out.rowPhases = [0.25, 0.75, 0.125, 0.375, 0.625, 0.875]; out.phaseMissed = S.densePhaseMissed; }
  return out;
}

/** The long direction of a ring (degrees, y down) and how many times longer than wide it is, from its area moments; null for a flat ring. */
function elongation(ring) {
  let a = 0, cx = 0, cy = 0, ix = 0, iy = 0, ixy = 0;
  const n = ring.length;
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
 * The fill settings for one island. A small piece (a leaf, a petal, an eye) is sewn closer to its drawn size: the allowance that makes a
 * row longer than its shape shrinks with the piece's width, and a narrow piece has its rows run across it (the short way, as a satin
 * would) unless the person chose an angle. Numbers the person set by hand are left as they are.
 */
function smallFill(fs, f, outer, area, meanW) {
  const out = { ...fs };
  if (f.pullComp == null) out.pullComp = fs.pullComp * narrowScale(meanW);
  // The thread is 0.4 mm wide and its end is rounded, so a row that stops AT the edge looks 0.2 mm past it: the rows stop a little inside, and a leaf's
  // lobes and the gaps between two leaves are still there when it is sewn (a big piece cares less).
  if (f.inset == null) out.inset = Math.max(0.07, Math.min(0.15, 0.17 - 0.02 * meanW));
  if (area < 40 && (f.angle == null || f.angle === 45)) {
    const e = elongation(outer);
    if (e && e.ratio >= 1.6) out.angle = e.deg + 90;
  }
  return out;
}

/**
 * Is this object a letter that may be sewn dense (S.denseLetters): typed (kind "text"), or, with S.denseInPictures, a letter found in a picture (`obj.letters`)? Whether it is
 * small enough (denseCap) is decided where its size is known.
 */
function isDenseLetter(obj, S, blocks) {
  if (!(S.denseLetters > 0)) return false;
  if (obj.kind === "text") return true;
  if (!(S.denseInPictures > 0) || S.pictureLettering === 0 || !obj.letters || !(obj.letters.stroke > 0)) return false;
  // (the objects in the block, five or more; a block the second tracing of lettering confirmed may be shorter, three or more, and its letters are counted as the finder reckons them: letters that touch are one
  // object, and a zip or the arches of a crown taken for a word are not confirmed)
  const inBlock = blocks ? blocks.get(obj.letters.block) || 0 : 0;
  if (obj.letters.refined ? Math.max(inBlock, Number(obj.letters.n) || 0) < S.denseMinLettersRefined : inBlock < S.denseMinLetters) return false;
  const t = obj.transform;
  const k = t ? Math.sqrt(Math.abs((t.sx ?? 1) * (t.sy ?? 1))) || 1 : 1; // (made bigger or smaller since it was found: its numbers go with it)
  return obj.letters.stroke * k >= S.denseMinStroke;
}

/**
 * Is this object lettering: typed (kind "text"), or a letter of a run of lettering found in a picture (`obj.letters`, from convert.js / trace/lettering.js)?
 * Either is a stroke of a font and is sewn by the one rule for the whole text (S.textLineBelow ...). `S.pictureLettering` 0 turns the picture's half off.
 */
function isLettering(obj, S) {
  if (obj.kind === "text") return true;
  if (S.pictureLettering === 0 || !obj.letters || !(obj.letters.stroke > 0)) return false;
  // a letter found in a picture belongs to its run only while the run is as thin as `pictureLineBelow` (made bigger or smaller since it was found: its numbers go with it)
  const t = obj.transform;
  const k = t ? Math.sqrt(Math.abs((t.sx ?? 1) * (t.sy ?? 1))) || 1 : 1;
  return obj.letters.stroke * k < S.pictureLineBelow;
}

/**
 * The runs for one object: [{ pts, join, connectMax, kind, color }] in sewing order.
 * `needle` is where the previous run ended (a hint for where to begin). Warnings are pushed onto `warn`.
 */
function objectRuns(item, needle, S0, warn, info) {
  const obj = item.obj;
  let S = obj.source === "image" || !(S0.handLineMaxWidth < S0.lineMaxWidth) ? S0 : { ...S0, lineMaxWidth: S0.handLineMaxWidth }; // (a thin line is up to lineMaxWidth wide only for a shape made from a picture)
  // typed lettering with thin strokes is lines from end to end: a letter is a line up to textLineMax wide (see textLineBelow)
  if (item.textLines) S = { ...S, lineMaxWidth: Math.max(S.lineMaxWidth, S0.textLineMax) };
  const rings = item.rings;
  const runs = [];
  const fill = obj.fill || {};
  let fillType = fill.type || "auto";
  // heavy lettering at a small size (Impact at 6 mm: strokes 1.4 mm, counters 0.4): a satin column round a letter that thick fans out, and a fill is sewn in plain rows
  if (fillType === "auto" && item.textFill) fillType = "tatami";
  const fc = item.color;
  const stroke = obj.stroke && obj.stroke.type && obj.stroke.type !== "none" ? obj.stroke : null;
  let at = needle;

  if (item.part === "fill" && fillType !== "none") {
    const fs = fillSettings(obj, S.fabric);
    const ss = satinSettings(obj, S.fabric, S);
    // Islands in the order the needle meets them.
    const islands = planIslands(islandsOf(rings).map((is) => ({ is, shape: [is.outer, ...is.holes] })), at);
    for (const { is, shape } of islands) {
      const area = ringArea(is.outer) - is.holes.reduce((s, h) => s + ringArea(h), 0);
      if (area < S.minIsland) { warn.push({ kind: "tiny", objectId: obj.id, message: `A piece of "${obj.name || obj.id}" is too small to sew (${area.toFixed(2)} mm²) and was left out.` }); continue; }

      const meanW = (2 * area) / Math.max(1e-6, shape.reduce((s, r) => s + ringPerimeter(r), 0));
      // A hairline, small lettering, a lash, a hair, a vein, a twig or the lines of line art: one line of thread along the middle, as thin as the
      // drawing, not a filled strip. Each island is sewn by ONE of the ways below (a line here, satin, or tatami with its thin arms as lines).
      if (fillType === "auto" && meanW < S.lineMaxWidth && area / meanW >= S.lineRatio * meanW && is.holes.length <= S.lineHoles) {
        const ln = thinLine(shape, at, S);
        if (ln) {
          info.push({ objectId: obj.id, kind: "line", area, why: "thin line", satin: null });
          ln.forEach((r) => runs.push({ pts: r.pts, join: r.join, connectMax: 0.8, kind: "line", color: fc }));
          at = ln[ln.length - 1].pts[ln[ln.length - 1].pts.length - 1];
          continue;
        }
      }
      let kind = fillType;
      let satin = null;
      let why = kind === "tatami" ? "chosen" : kind === "satin" ? "" : "wide area";
      if (kind === "auto" || kind === "satin") {
        const limit = kind === "auto" ? S.autoSatinWidth : S.maxSatinWidth;
        // (a shape of thousands of points, a field cut by hundreds of holes, is no column: looking for strokes in it only costs minutes)
        const tryable = kind === "satin" || (meanW <= limit * 0.8 && shape.reduce((a, r) => a + r.length, 0) <= 4000);
        if (tryable) {
          // A shape the satin layout cannot make sense of is filled instead: one odd island must never stop the whole design.
          try { satin = satinIsland(shape, { ...ss, pullComp: (obj.fill && obj.fill.satin && obj.fill.satin.pullComp != null) ? ss.pullComp : ss.pullComp * narrowScale(meanW), start: at }); } catch (e) { satin = null; }
          why = satin ? "" : "no stroke to follow";
          if (satin) {
            const strokeLike = satin.maxWidth <= limit && satin.length >= (kind === "auto" ? S.autoSatinRatio : 2.2) * satin.meanWidth
              && (kind !== "auto" || satin.maxWidth <= S.autoSatinSteady * satin.meanWidth);
            const cov = coverageOf(satin.tops, shape, { threadMm: Math.max(0.45, ss.spacing * 1.25), res: 8 });
            const gap = satinEdgeGap(satin.tops);
            if (!strokeLike) why = `not stroke-like (${satin.maxWidth.toFixed(1)} mm wide, ${satin.length.toFixed(0)} mm long)`;
            else why = `satin check: covered ${cov.covered.toFixed(2)}, spill ${cov.spill.toFixed(2)}, dense ${cov.dense.toFixed(2)}, excess ${(satin.topLength / Math.max(1e-6, area / ss.spacing)).toFixed(2)}`;
            // The thread laid down against what the shape needs: well over means columns piled on each other or stitches flung sideways.
            const excess = satin.topLength / Math.max(1e-6, area / ss.spacing);
            // a narrow column needs more thread than its area says (the stitch is the column's width plus the pull allowance)
            const allowed = S.satinExcess + 1.0 / Math.max(0.8, satin.meanWidth);
            // (the engine's own choice, "auto", is held to a tighter edge than a satin the person asked for; typed lettering to a wider one)
            const gapLimit = kind === "auto" ? (isLettering(obj, S) ? S.textSatinGap : S.autoSatinGap) : S.satinGap;
            const refusals = [];
            if (cov.covered < S.satinCoverage) refusals.push(`covers only ${Math.round(cov.covered * 100)}%`);
            if (cov.spill > S.satinSpill) refusals.push(`${Math.round(cov.spill * 100)}% spills past the edge`);
            if (excess > allowed) refusals.push(`uses ${excess.toFixed(2)}x the thread it needs (up to ${allowed.toFixed(2)})`);
            if (cov.dense > S.satinDense) refusals.push(`${Math.round(cov.dense * 100)}% piled four threads deep`);
            if (gap > gapLimit) refusals.push(`needle holes ${gap.toFixed(1)} mm apart on an edge (up to ${gapLimit})`);
            const good = refusals.length === 0;
            if (strokeLike && !good) why = `satin refused: ${refusals.join("; ")}`;
            if (kind === "auto" && !(strokeLike && good)) satin = null;
            else if (kind === "satin" && !good) {
              warn.push({ kind: "satin-gaps", objectId: obj.id, message: `Satin on "${obj.name || obj.id}" would leave gaps here (${Math.round(cov.covered * 100)}% covered); it was filled instead.` });
              satin = null;
            } else if (satin.maxWidth > S.maxSatinWidth + 0.5) {
              warn.push({ kind: "satin-wide", objectId: obj.id, message: `"${obj.name || obj.id}" has a satin stroke ${satin.maxWidth.toFixed(1)} mm wide; over ${S.maxSatinWidth} mm the stitches can snag.` });
            }
          }
        }
      }
      info.push({ objectId: obj.id, kind: satin ? "satin" : kind === "none" ? "none" : "tatami", area, why: satin ? "" : why, satin: satin ? { columns: satin.columns, meanWidth: satin.meanWidth, maxWidth: satin.maxWidth, excess: satin.topLength / Math.max(1e-6, area / ss.spacing) } : null });
      if (satin) {
        satin.paths.forEach((p, i) => runs.push({ pts: p, join: i > 0, connectMax: S.joinColumns, kind: "satin", color: fc }));
        at = satin.paths[satin.paths.length - 1].slice(-1)[0];
      } else if (kind !== "none") {
        // Tatami: underlay, then the top.
        const fx0 = smallFill(fs, fill, is.outer, area, meanW); // a small piece is sewn closer to its drawn size
        const fx = item.textDense ? denseFill(fx0, fill, S, item.textStroke) : fx0; // (small typed lettering: see denseFill)
        const ul = fs.underlay === "auto" || fs.underlay == null ? (item.textDense ? "none" : autoFillUnderlay(area, S.fabric)) : fs.underlay;
        const giant = shape.reduce((a, r) => a + r.length, 0) > 5000; // a field cut by hundreds of holes (the paper of an engraving): cheap geometry only
        // thin strokes that grow out of the piece are cut away and sewn as lines after it
        let cut = null;
        try { cut = fillType === "auto" && !giant ? thinArms(shape, area, S) : null; } catch (e) { cut = null; } // (one odd island must never stop the whole design)
        const fillShape = cut ? cut.body : shape;
        const under = fillUnderlayRuns(fillShape, { type: giant && ul !== "none" ? "tatami" : ul, angle: fx.angle, start: at, lite: giant });
        under.forEach((p, i) => { runs.push({ pts: p, join: i > 0, connectMax: S.joinWithinIsland, kind: "underlay", color: fc }); at = p[p.length - 1]; });
        // The top stitches reach a touch past the edge, so a neighbouring colour sewn later overlaps them instead of leaving a line
        // of bare cloth between the two (and the thread's pull is allowed for).
        // (dense letters with denseWeight: the rows are laid in the shape with its thick strokes taken in, so the stitched letter is as heavy as the drawn one; the shape itself is not changed)
        const rowShape = item.textDense && S.denseWeight > 0 && !giant ? lightenThick(fillShape, { step: S.denseStep, core: S.denseCore, max: S.denseTrim }) : fillShape;
        const reach = fx.grow > 0 ? offsetRings(rowShape, fx.grow, { join: "miter", miterLimit: 2 }) : rowShape;
        const rowsIn = reach.length ? reach : fillShape;
        let top = tatamiFill(rowsIn, { ...fx, start: at, lite: giant });
        if ((item.textDense || (S.denseRescueLetters > 0 && obj.letters)) && S.denseRescue > 0 && !giant) {
          // (parts of the drawn letter no thread reaches: see rescue.js. The drawn shape is put back round them and the rows laid again; the new rows are kept only when they leave less
          // of the letter bare than the old ones (laying the rows again moves them all), and at most twice. A letter found in a picture that is not sewn dense (a connected script is one
          // piece) is looked at too, with the reach its wider rows need, and its second laying keeps the short row pieces of dense lettering)
          const reach2 = Math.max(S.denseRescueHalf, fx.spacing / 2 + 0.05);
          const ro = { half: reach2, minArea: S.denseRescueArea };
          const sens = { half: Math.max(S.denseRescueCompare, fx.spacing / 2 + 0.05), erode: 0, minArea: 0 }; // (to compare two sewings of the letter: everything bare, a rim and a hairline too, by a stricter reach)
          const bareArea = (paths) => unsewnPatches(fillShape, paths, sens).total;
          const again2 = item.textDense ? fx : { ...fx, minRow: Math.min(fx.minRow, S.denseMinRow), minPiece: Math.min(fx.minPiece, S.denseMinPiece) };
          let bare = unsewnPatches(fillShape, top.paths, ro), left = bareArea(top.paths);
          const put = [];
          for (let pass = 0; pass < 2 && bare.length; pass++) {
            try {
              put.push(...bare.flatMap((q) => q.rects.map((r2) => [r2])));
              const piece = offsetRings(unionShapes(put), S.denseRescueGrow, { join: "round" });
              const back = piece.length ? intersectRings(fillShape, piece) : [];
              const again = back.length ? unionRings(rowsIn, back) : null;
              if (!again || !again.length) break;
              const next = tatamiFill(again, { ...again2, start: at, lite: giant });
              const nextBare = unsewnPatches(fillShape, next.paths, ro);
              const nextLeft = bareArea(next.paths);
              if (!(nextLeft < left)) break;
              top = next; bare = nextBare; left = nextLeft;
            } catch (e) { break; }
          }
        }
        top.paths.forEach((p, i) => { runs.push({ pts: p, join: i === 0 && under.length > 0, connectMax: S.joinWithinIsland, kind: "fill", color: fc }); at = p[p.length - 1]; });
        if (cut) {
          for (const arm of cut.arms) {
            const ln = thinLine(arm, at, S);
            if (!ln) continue;
            info.push({ objectId: obj.id, kind: "line", area: arm.reduce((s, r2) => s + Math.abs(ringArea(r2)), 0), why: "thin stroke of a piece", satin: null });
            ln.forEach((r2) => runs.push({ pts: r2.pts, join: r2.join, connectMax: 0.8, kind: "line", color: fc }));
            at = ln[ln.length - 1].pts[ln[ln.length - 1].pts.length - 1];
          }
        }
      }
    }
  }

  if (item.part === "line" && stroke) {
    // Open lines (the fine lines of a picture): bean stitch (one thread sewn three times), a running stitch, or a narrow satin column, each line
    // in the order and the direction that leave the fewest long hops. A hop under the trim distance is a jump the thread is not cut for.
    const st = strokeSettings(stroke);
    const lines = orderLines(item.lines, at);
    let count = 0;
    for (const ln of lines) {
      let pts;
      if (st.type === "satin") pts = satinAlong(ln, { spacing: Math.min(st.spacing, 0.35), closed: false, half: st.width / 2, pullComp: 0.1 });
      else if (st.type === "run") pts = S.lineDev > 0 ? curveRun(densify(ln, 0.25, false), { len: st.len, dev: S.lineDev }) : runAlong(ln, { len: st.len });
      else pts = beanAlong(ln, { len: st.len, dev: S.lineDev > 0 ? S.lineDev : 0 });
      if (pts.length < 2) continue;
      runs.push({ pts, join: false, connectMax: 0, kind: "line", color: item.color });
      count++;
    }
    info.push({ objectId: obj.id, kind: "line", area: 0, why: "fine lines", lines: count, satin: null });
  }

  if (item.part === "stroke" && stroke) {
    const sruns = outlineRuns(rings, { ...strokeSettings(stroke), start: at });
    sruns.forEach((p) => runs.push({ pts: p, join: false, connectMax: 1, kind: "outline", color: item.color }));
  }
  return runs;
}

/**
 * Make the pattern.
 * @param {{ objects: object[], name?: string }} design
 * @param {object} options  see ENGINE_DEFAULTS
 * @returns {{ pattern, warnings: {kind, objectId, message}[], blocks, runs: number, ms: number }}
 */
export function generate(design, options = {}) {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const S = { ...ENGINE_DEFAULTS, ...(design.settings || {}), ...options };
  const warn = [];
  const info = [];
  const items = [];
  // A point is sane when it is a number within reach of any hoop (a NaN or a billion millimetres is not).
  const sane = (p) => Array.isArray(p) && Math.abs(p[0]) <= S.maxCoord && Math.abs(p[1]) <= S.maxCoord;
  // how many letters each block of lettering found in a picture has (a block is a line or a word the finder found: see denseMinLetters)
  const letterBlocks = new Map();
  if (S.denseLetters > 0 && S.denseInPictures > 0) for (const o of design.objects || []) if (o && o.letters && o.letters.stroke > 0) letterBlocks.set(o.letters.block, (letterBlocks.get(o.letters.block) || 0) + 1);
  (design.objects || []).forEach((obj, objIndex) => {
    if (!obj || obj.visible === false) return;
    const open = obj.open === true; // an object of open lines (no fill): its rings are polylines of two points or more
    const baked = bakeObject(obj).filter((r) => Array.isArray(r) && r.length >= (open ? 2 : 3));
    let rings = baked.filter((r) => r.every(sane));
    if (rings.length < baked.length) warn.push({ kind: "far", objectId: obj.id, message: `"${obj.name || obj.id}" has a part that is not a usable shape (or lies far outside the hoop) and was left out.` });
    if (!rings.length) return;
    // Typed lettering is sewn one way from end to end, by how wide its strokes are (S.textLineBelow). In heavy lettering the hairlines and serifs are widened to what a needle
    // can follow (see geometry/thin.js); the stored letters are not changed.
    let textStroke = 0, textCap = 0, textFill = false, textLines = false, textDense = false;
    if ((isLettering(obj, S) || isDenseLetter(obj, S, letterBlocks)) && !open) {
      // (a letter found in a picture carries the typical stroke of its run: the rule is the run's, not the letter's)
      // (and if the shape has been made bigger or smaller since it was found, its run's numbers go with it)
      const k = obj.kind === "text" || !obj.transform ? 1 : Math.sqrt(Math.abs((obj.transform.sx ?? 1) * (obj.transform.sy ?? 1))) || 1;
      textStroke = obj.kind === "text" ? meanStrokeWidth(rings) : obj.letters.stroke * k;
      const cap = obj.letters && obj.letters.cap > 0 ? obj.letters.cap * k : letterHeight(rings);
      textCap = cap;
      // small typed lettering is sewn dense whatever its weight (see denseLetters): no lines, no satin, a fill with its thin strokes widened to what a needle can follow
      textDense = isDenseLetter(obj, S, letterBlocks) && cap <= S.denseCap;
      // lines up to textLineBelow, but only up to the old limit for a face with hairlines and serifs: a line is one thread wide whatever the drawing, and in a Times or a Georgia that
      // loses the contrast between the stems and the hairlines (the serif faces were worse at the higher limit)
      let below = S.textLineBelow;
      if (textStroke >= S.textLineBelowHair && textStroke < below && thinShare(rings, 0.5 * textStroke) > S.textFillHair) below = S.textLineBelowHair;
      textLines = !textDense && isLettering(obj, S) && textStroke < below;
      if (!textLines && (textDense || isLettering(obj, S))) {
        // heavy letters of one weight (no hairlines and serifs) at a small size are filled, not made of satin columns (see textFillStroke)
        if (textDense || (S.textFillStroke > 0 && textStroke >= S.textFillStroke && cap <= S.textFillCap && thinShare(rings, 0.5 * textStroke) <= S.textFillHair)) textFill = true;
        if (S.textMinStroke > 0) rings = widenThin(rings, S.textMinStroke).rings;
        // (typed letters only: the pieces of a traced picture lie edge to edge and under each other, and making a letter lighter would open a gap between it and its outline; with denseWeight the rows of a dense letter stop short of the edge of a thick stroke instead, see lightenThick)
        if (textFill && obj.kind === "text" && S.textLighten > 0 && cap <= S.textLightenCap && !(textDense && S.denseWeight > 0)) rings = lightenHeavy(rings, S.textLighten);
      }
    }
    const fill = obj.fill || {};
    const stroke = obj.stroke && obj.stroke.type && obj.stroke.type !== "none" ? obj.stroke : null;
    const detail = obj.layer === "detail";
    if (open) {
      if (!stroke) return;
      const color = parseColor(stroke.color || fill.color);
      const half = (stroke.type === "satin" ? strokeSettings(stroke).width : 0.5) / 2 + 0.1;
      const foot = rings.map((r) => footprint(r, half));
      items.push({ obj, objIndex, part: "line", lines: rings, rings: foot, box: bboxOf(foot), color, colorKey: `${color.r},${color.g},${color.b}`, detail });
      return;
    }
    const box = bboxOf(rings);
    // An object is up to two items: its fill, and its outline (which has its own colour).
    if ((fill.type || "auto") !== "none") {
      const color = parseColor(fill.color);
      items.push({ obj, objIndex, part: "fill", rings, box, color, colorKey: `${color.r},${color.g},${color.b}`, detail, textStroke, textCap, textFill, textLines, textDense });
    }
    if (stroke) {
      const color = parseColor(stroke.color || fill.color);
      const pad = stroke.type === "satin" ? strokeSettings(stroke).width : 0.5;
      items.push({ obj, objIndex, part: "stroke", rings, box: [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad], color, colorKey: `${color.r},${color.g},${color.b}`, detail });
    }
  });
  const guess = estimateStitches(items, S);
  if (guess > S.maxStitches) {
    const millions = (guess / 1e6).toFixed(guess > 1e7 ? 0 : 1);
    throw new Error(`This design would need about ${millions} million stitches, far more than a machine can sew. Make the shapes smaller or open up the stitching (a bigger row spacing).`);
  }
  const order = scheduleOrder(items, S.optimizeColors);
  const plan = createPlan(S);
  // Moves from one run to the next that lie under what is sewn later are stitched, not jumped: a jump of more than 3 mm is a thread cut (a trim) on a machine.
  const cover = S.hiddenTravel && order.length > 1 ? buildCover(items, order, order.map((i) => items[i].colorKey)) : null;
  let needle = null;
  let runCount = 0;
  for (let k = 0; k < order.length; k++) {
    const item = items[order[k]];
    const runs = objectRuns(item, needle, S, warn, info);
    for (const r of runs) {
      plan.colour(r.color);
      const to = plan.needle();
      const travel = !!(cover && !r.join && plan.threaded() && to && Math.hypot(r.pts[0][0] - to[0], r.pts[0][1] - to[1]) > 0.15 && cover.hidden(to, r.pts[0], k, item.colorKey));
      plan.run(r.pts, { join: r.join, connectMax: r.connectMax, travel });
      runCount++;
    }
    if (runs.length) needle = plan.needle();
  }
  const pattern = plan.finish(design.name || "design");

  // A traced picture has many specks too small to sew: say so once, not once for each.
  const tiny = warn.filter((w) => w.kind === "tiny");
  if (tiny.length > 1) {
    const rest = warn.filter((w) => w.kind !== "tiny");
    warn.length = 0;
    warn.push(...rest, { kind: "tiny", objectId: tiny[0].objectId, count: tiny.length, message: `${tiny.length} specks smaller than ${S.minIsland} mm² were left out: a needle cannot sew them.` });
  }

  // Checks a person would want to hear about.
  let longest = 0;
  let px = null, py = null;
  for (const [x, y, c] of pattern.stitches) {
    if (c === CMD.STITCH && px !== null) longest = Math.max(longest, Math.hypot(x - px, y - py) / 10);
    px = c === CMD.STITCH || c === CMD.JUMP ? x : px; py = c === CMD.STITCH || c === CMD.JUMP ? y : py;
    if (c === CMD.JUMP) { px = null; py = null; }
  }
  if (longest > 9) warn.push({ kind: "long-stitch", message: `The longest stitch is ${longest.toFixed(1)} mm; stitches over about 9 mm snag and loop.` });
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { pattern, warnings: warn, info, runs: runCount, ms: t1 - t0 };
}





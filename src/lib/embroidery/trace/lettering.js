/**
 * Lettering: runs of letter-shaped pieces in a traced picture ("AVE MARIA" on a crest, the name under a logo, a line of small print).
 *
 * Why the stitch engine wants to know. A letter is a stroke of a font, and the engine decides how to sew a piece by looking at that piece alone: one letter
 * of a word comes out a thin line, the next a satin column, the next a fill, because their strokes are 0.69 and 0.71 mm wide. A word sewn that way looks
 * like several hands wrote it. Typed lettering (digitizer/text.js) already gets one rule for the whole text (engine.js, `textLineBelow`); this finds the same
 * thing in a picture, so that the letters of one run of text are sewn alike, and so that a note can say how big the lettering is on the cloth.
 *
 * What counts as lettering, using only the shapes the tracer found (no character recognition, no models, nothing to download):
 *   - a piece is letter-shaped when it is a STROKE: its mean width (twice its area over its outline's length) is well under half its longest side (a disc, a
 *     square or a blob is at a half; an Arial Black E at 0.13), and the widest disc that fits in it is not many times wider than that mean. A piece that is
 *     long, convoluted and as high as a letter is a WORD whose letters touch (the tracer cannot tell where one ends); it counts as the letters it has room for;
 *   - letters stand in a LINE, straight or a smooth arc (text on a badge): the pieces are joined nearest first, each to at most one piece on each side of it,
 *     and only when they are of the same colour, about the same height across the line and the same weight, and close (a gap up to about a letter's height:
 *     a space between two words is about a letter wide). A cloud of patches does not make a line; a chain that bends sharply is cut where it bends;
 *   - a line is lettering when it has at least `minLetters` letters, they are DIFFERENT from each other (a row of stars, a string of beads, the strands of a
 *     rope, the stripes of a bar code are copies of one piece, not text) and nearly all are of one height or two (capitals and small letters), whatever way
 *     the line runs.
 * Lines that lie together (two lines of a text) of the same weight and height are one block: they get one rule.
 * Nothing here is exact: a run that is not lettering and is sewn "as lettering" is sewn as a run of strokes of about one width, which does it little harm.
 *
 * Pure functions on the tracer's shapes: no DOM, they run in the worker and under node. Sizes are millimetres; `mmPerPx` turns the tracer's pixels into them.
 */
import { ringPerimeter } from "../geometry/poly.js";
import { rasterizeRings, distanceTransform } from "../geometry/skeleton.js";
import { thinShare } from "../geometry/thin.js";

export const LETTERING = Object.freeze({
  minSizeMm: 1.0, // a letter's longest side; a piece smaller than this is a speck or a dot, not a letter
  maxHeightMm: 14, // a letter's longest side, a word's height: bigger is not small print (a poster headline is made of strokes the stitches follow well enough)
  maxWordMm: 160, // the longest side of a word whose letters touch
  minAreaMm2: 0.2,
  maxStrokeMm: 3.5, // mean width of a letter's strokes (twice its area over its outline)
  maxStrokeRatio: 0.36, // ... as a share of its longest side (a letter) or its height (a word): a blob is at 0.5, an Arial Black E at 0.13, an O of a black face at 0.28
  maxSteady: 3.0, // twice the widest disc that fits in a piece, over its mean width: 1.0 for a bar, 1.2 to 2 for letters (a serif face at 4 mm: up to 2.9), a disc 2
  wordAspect: 2.6, // a piece this many times longer than it is high ...
  wordCompact: 120, // ... with an outline this convoluted (perimeter squared over area: a bar is 40 to 60, a word of four letters 150 and more) ...
  wordTurns: 3.6, // ... that has this much outline for each millimetre of its length (a bar or a smooth wire has 2 to 3, a word 4 to 7: every letter has its own turns) is a word whose letters touch
  gapRatio: 1.1, // letters are neighbours when the gap between their boxes is at most this times the smaller of their heights (a space is about 0.6)
  sizeRatio: 1.7, // ... and their heights (across the line they stand in) differ by at most this much (capitals and small letters differ by 1.3 to 1.6)
  strokeRatio: 2.0, // ... and their stroke widths by at most this much
  straightDeg: 125, // a line bends by at most 180 minus this at a letter (it is cut where it bends more)
  minLetters: 4,
  shortLetters: 99, // a short word of this many letters (3 for a logo: KAZI, Open, BMW) counts as lettering too, but only in a picture that has at most `shortMaxPieces` letter-shaped pieces in all; 99 = no short words (the tracer asks for 3 in a logo, never in artwork)
  shortMaxPieces: 24,
  shortMaxShapes: 60, // ... and at most this many shapes of any kind (a photograph taken for a logo has a hundred or more: the zip of a flight suit was a word of five letters)
  minDistinct: 3, // a line has at least this many different kinds of piece ...
  maxKinds: 8, // ... and at least half of its letters are a different kind from the others, up to this many (a long text repeats its letters)
  kindTol: 0.12, // two pieces are the same kind when they have as many holes and their outlines are this alike (log2 of the ratio of their compactness, and of their elongation)
  heightTol: 0.25, // letters of one height differ by at most this much across the line ...
  heightCover: 0.85, // ... and this share of a line's letters falls into at most three such heights
  blockGap: 2.0, // lines closer than this times their height, alike in height and weight, are one block
  blockRatio: 1.4, // ... when their stroke weights and heights differ by at most this much
  maxPieces: 4000, // a picture with more letter-shaped pieces than this is an engraving or a photograph, not a page of lettering
});

/** Area moments of a ring in the tracer's pixels (as the engine's `elongation` takes them): [area, centroid x, centroid y, sxx, syy, sxy] summed over the shape's rings (holes run the other way). */
function momentsOf(contours) {
  let a = 0, cx = 0, cy = 0, ix = 0, iy = 0, ixy = 0;
  for (const ring of contours) {
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
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) return null;
  cx /= 6 * a; cy /= 6 * a;
  return [a, cx, cy, iy / 12 - a * cx * cx, ix / 12 - a * cy * cy, ixy / 24 - a * cx * cy];
}

/** How elongated a shape is by its area moments (1 for a disc or a square, 5 for an I), and unchanged by turning or scaling it. */
function elongationOf(contours) {
  const m = momentsOf(contours);
  if (!m) return 1;
  const [, , , sxx, syy, sxy] = m;
  const mid = (sxx + syy) / 2, d = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
  const l1 = Math.abs(mid + d), l2 = Math.abs(mid - d);
  return l2 < 1e-12 ? 50 : Math.sqrt(l1 / l2);
}

/** The cheap numbers a piece is judged by. `s` is a tracer shape in pixels. */
function featuresOf(s, mmPerPx, O) {
  const [x0, y0, x1, y1] = s.bbox;
  const w = (x1 - x0) * mmPerPx, h = (y1 - y0) * mmPerPx;
  const long = Math.max(w, h), short = Math.min(w, h);
  const area = s.area * mmPerPx * mmPerPx;
  if (!(area >= O.minAreaMm2) || !(long >= O.minSizeMm) || !(short <= O.maxHeightMm)) return null;
  let per = 0;
  for (const c of s.contours) per += ringPerimeter(c);
  per *= mmPerPx;
  if (!(per > 0)) return null;
  const meanW = (2 * area) / per;
  const compact = (per * per) / area; // 4 pi for a disc, 16 for a square, more for anything with a tail, a hole or a corner
  const aspect = long / Math.max(short, 1e-6);
  const word = aspect >= O.wordAspect && compact >= O.wordCompact && per / long >= O.wordTurns;
  if (!(meanW <= O.maxStrokeMm)) return null;
  if (word) { if (!(long <= O.maxWordMm) || !(meanW <= O.maxStrokeRatio * short)) return null; }
  else if (!(long <= O.maxHeightMm) || !(meanW <= O.maxStrokeRatio * long)) return null;
  return {
    id: s.id, color: s.color, shape: s, x0: x0 * mmPerPx, y0: y0 * mmPerPx, x1: x1 * mmPerPx, y1: y1 * mmPerPx,
    cx: ((x0 + x1) / 2) * mmPerPx, cy: ((y0 + y1) / 2) * mmPerPx,
    w, h, size: long, short, area, meanW, holes: s.contours.length - 1, compact, aspect, word,
    weight: word ? Math.max(2, Math.min(14, Math.round(aspect / 0.95))) : 1, // letters it holds
    ecc: elongationOf(s.contours),
  };
}

/** Twice the widest disc that fits in the piece over its mean width: 1 for a bar of one width, 1.2 to 2 for a letter, 2 and more for a blob. */
function steadiness(f, mmPerPx) {
  const rings = f.shape.contours.map((c) => c.map((p) => [p[0] * mmPerPx, p[1] * mmPerPx]));
  const res = Math.max(4, Math.min(12, 90 / f.short)); // pixels per mm: about 90 pixels across the piece's height, never fewer than 4 to the millimetre
  const g = rasterizeRings(rings, res, 2);
  const dt = distanceTransform(g.mask, g.w, g.h);
  let m = 0;
  for (let i = 0; i < dt.length; i++) if (dt[i] > m) m = dt[i];
  return (2 * (m / res)) / f.meanW;
}

/**
 * What the finder makes of one shape: its numbers and, when it is not a letter-shaped piece, the first reason why not (for tests and for looking at a picture).
 * @returns {{ ok: boolean, why: string|null, word: boolean, sizeMm: number, areaMm2: number, strokeMm: number, steady: number|null, holes: number, compact: number, elongation: number }}
 */
export function describePiece(shape, mmPerPx, options = null) {
  const O = { ...LETTERING, ...(options || {}) };
  const [x0, y0, x1, y1] = shape.bbox;
  const long = Math.max(x1 - x0, y1 - y0) * mmPerPx, short = Math.min(x1 - x0, y1 - y0) * mmPerPx;
  const area = shape.area * mmPerPx * mmPerPx;
  let per = 0;
  for (const c of shape.contours) per += ringPerimeter(c);
  per *= mmPerPx;
  const out = { ok: false, why: null, word: false, sizeMm: long, areaMm2: area, strokeMm: per > 0 ? (2 * area) / per : 0, steady: null, holes: shape.contours.length - 1, compact: area > 0 ? (per * per) / area : 0, elongation: elongationOf(shape.contours) };
  const f = featuresOf(shape, mmPerPx, O);
  if (!f) {
    if (!(area >= O.minAreaMm2)) out.why = "speck";
    else if (!(long >= O.minSizeMm)) out.why = "too small";
    else if (!(short <= O.maxHeightMm)) out.why = "too big";
    else if (!(out.strokeMm <= O.maxStrokeMm)) out.why = "stroke too wide";
    else out.why = "blob (stroke / size)";
    return out;
  }
  out.word = f.word;
  out.steady = steadiness(f, mmPerPx);
  if (out.steady > O.maxSteady) out.why = "blob (widest disc)";
  else out.ok = true;
  return out;
}

const median = (xs) => {
  const a = xs.slice().sort((p, q) => p - q);
  const n = a.length;
  return n ? (n % 2 ? a[(n - 1) >> 1] : (a[n / 2 - 1] + a[n / 2]) / 2) : 0;
};

/**
 * How many kinds of piece there are in a line: pieces with as many holes and about the same outline (how convoluted, how elongated: neither changes when a piece
 * is turned or made bigger) are one kind. A word has several (an A has a hole and legs, an I is a bar, a V is open); the strands of a rope, the beads of a string,
 * the stars in a row, the oars of a ship (the same oval, smaller each time) have one. A word whose letters touch is several kinds by itself.
 */
function distinctKinds(list, tol) {
  const leaders = [];
  let extra = 0;
  for (const f of list) {
    if (f.word) { extra += Math.min(4, f.weight); continue; }
    const lc = Math.log2(f.compact), le = Math.log2(f.ecc);
    if (!leaders.some((k) => k.holes === Math.min(f.holes, 3) && Math.abs(k.lc - lc) < tol && Math.abs(k.le - le) < tol)) leaders.push({ holes: Math.min(f.holes, 3), lc, le });
  }
  return leaders.length + extra;
}

/** The extent (mm) of a piece's outline along the direction (dx, dy), a unit vector. */
function extentAlong(f, mmPerPx, dx, dy) {
  let lo = Infinity, hi = -Infinity;
  for (const p of f.shape.contours[0]) {
    const t = p[0] * mmPerPx * dx + p[1] * mmPerPx * dy;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  return hi - lo;
}

/**
 * The heights of the letters of a line fall into one or two (three at most) groups, each within `heightTol` of its own: capitals, small letters, the ones that
 * stand taller. Heights are measured ACROSS the line, whichever way it runs (up the side of a crest, round a seal). Returns the share the biggest three groups hold.
 */
function heightCover(heights, tol) {
  const hs = heights.slice().sort((p, q) => p - q);
  const groups = [];
  for (const h of hs) {
    const g = groups[groups.length - 1];
    if (g && h <= g.lo * (1 + tol)) g.n++; else groups.push({ lo: h, n: 1 });
  }
  groups.sort((p, q) => q.n - p.n);
  return groups.slice(0, 3).reduce((a, g) => a + g.n, 0) / hs.length;
}

/**
 * How much of a block's ink is hairline and serif (`thinShare` in geometry/thin.js: strips thinner than half the typical stroke), so its letters are sewn alike and its size
 * is judged by the kind of face. Worked out on up to two dozen of its letters, once: the answer is kept on the block.
 * @param {object} block  one entry of `findLettering`'s answer
 * @param {{ contours: number[][][] }[]} shapes  the tracer's shapes (pixels), `block.shapes` are indexes into it
 */
export function hairShareOf(block, shapes, mmPerPx) {
  if (block.hair == null) {
    const step = Math.max(1, Math.ceil(block.shapes.length / 24));
    const rings = [];
    for (let i = 0; i < block.shapes.length; i += step) for (const c of shapes[block.shapes[i]].contours) rings.push(c.map((p) => [p[0] * mmPerPx, p[1] * mmPerPx]));
    block.hair = +thinShare(rings, 0.5 * block.strokeMm).toFixed(3);
  }
  return block.hair;
}

/**
 * What a page needs of the blocks `findLettering` found: how many letters in how many blocks, and the smallest letters (their height, stroke and hairline share, mm).
 * `from` ({ shapes, mmPerPx }) is needed for the hairline share.
 */
export function summariseLettering(blocks, from = null) {
  let letters = 0, small = null;
  for (const b of blocks) {
    letters += b.letters ?? b.count;
    if (!small || b.capMm < small.capMm) small = b;
  }
  if (!small) return null;
  return { blocks: blocks.length, letters, capMm: +small.capMm.toFixed(2), strokeMm: +small.strokeMm.toFixed(2), ...(from ? { hair: hairShareOf(small, from.shapes, from.mmPerPx) } : {}) };
}

/**
 * Find the lettering in a trace.
 * @param {{ id: number, color: number, contours: number[][][], area: number, bbox: number[] }[]} shapes  the tracer's shapes (pixels)
 * @param {{ mmPerPx: number, options?: object, debug?: boolean }} o
 * @returns {{ id: number, shapes: number[], count: number, strokeMm: number, capMm: number, box: number[], colors: number[] }[]}
 *   one entry per block of lettering: the ids of its shapes, the typical stroke width (mm, weighted by area) and letter height (mm), and its box (pixels)
 */
export function findLettering(shapes, { mmPerPx, options = null, debug = false } = {}) {
  const O = { ...LETTERING, ...(options || {}) };
  if (!Array.isArray(shapes) || !shapes.length || !(mmPerPx > 0)) return [];
  let pieces = [];
  for (const s of shapes) {
    const f = featuresOf(s, mmPerPx, O);
    if (f) pieces.push(f);
    if (pieces.length > O.maxPieces) return [];
  }
  if (!pieces.length) return [];
  // a stroke, not a blob (the dearer test, so only for what passed the cheap ones)
  pieces = pieces.filter((f) => { f.steady = steadiness(f, mmPerPx); return f.steady <= O.maxSteady; });
  // A short word (KAZI, Open, BMW: 3 or 4 letters) is looked for too, but only in a picture that is almost nothing but such a word: it has at most `shortMaxPieces` letter-shaped pieces and `shortMaxShapes` shapes in all. A portrait, a
  // map or a drawing is full of patches that look like three or four letters by chance (a face taken for a logo had 172 letter-shaped pieces and five "words"); a logo with a word in it has 3 to 20.
  const needShort = Math.min(O.minLetters, O.shortLetters);
  const shortOk = pieces.length <= O.shortMaxPieces && shapes.length <= O.shortMaxShapes;
  const need = shortOk ? needShort : O.minLetters;
  if (!pieces.length || pieces.reduce((a, f) => a + f.weight, 0) < need) return [];

  // candidate pairs, by a grid of the pieces' boxes (a piece looks only at the cells its reach covers)
  const cell = Math.max(3, 2 * median(pieces.map((f) => f.short)));
  const grid = new Map();
  const key = (cx, cy) => cx * 100003 + cy;
  pieces.forEach((f, i) => {
    const cx0 = Math.floor(f.x0 / cell), cx1 = Math.floor(f.x1 / cell), cy0 = Math.floor(f.y0 / cell), cy1 = Math.floor(f.y1 / cell);
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) { const k = key(cx, cy); const l = grid.get(k); if (l) l.push(i); else grid.set(k, [i]); }
  });
  const edges = [];
  pieces.forEach((f, i) => {
    const reach = O.gapRatio * Math.max(f.short, 3);
    const cx0 = Math.floor((f.x0 - reach) / cell), cx1 = Math.floor((f.x1 + reach) / cell), cy0 = Math.floor((f.y0 - reach) / cell), cy1 = Math.floor((f.y1 + reach) / cell);
    const seen = new Set();
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const l = grid.get(key(cx, cy));
        if (!l) continue;
        for (const j of l) {
          if (j <= i || seen.has(j)) continue;
          seen.add(j);
          const g = pieces[j];
          if (g.color !== f.color) continue;
          // the letters of a line are alike in height ACROSS the line (a W is wider than an a, but not taller)
          const gx = Math.max(0, Math.max(f.x0, g.x0) - Math.min(f.x1, g.x1)), gy = Math.max(0, Math.max(f.y0, g.y0) - Math.min(f.y1, g.y1));
          const horizontal = gx >= gy;
          const af = horizontal ? f.h : f.w, ag = horizontal ? g.h : g.w;
          const lo = Math.min(af, ag), hi = Math.max(af, ag);
          if (hi > O.sizeRatio * lo) continue;
          const sl = Math.min(f.meanW, g.meanW), sh = Math.max(f.meanW, g.meanW);
          if (sh > O.strokeRatio * sl) continue;
          const gap = Math.hypot(gx, gy);
          if (gap > O.gapRatio * lo) continue;
          edges.push({ i, j, d: Math.hypot(f.cx - g.cx, f.cy - g.cy) / lo });
        }
      }
    }
  });

  // lines: shortest pairs first, each piece joined to at most two others, which must lie on opposite sides of it (the line may bend, not fold)
  edges.sort((p, q) => p.d - q.d);
  const cosMax = Math.cos((O.straightDeg * Math.PI) / 180);
  const nb = pieces.map(() => []);
  const parent = pieces.map((_, i) => i);
  const root = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const straightAt = (i, j) => {
    // would the new link i-j fold back on a link i already has?
    const f = pieces[i], g = pieces[j];
    const ax = g.cx - f.cx, ay = g.cy - f.cy, da = Math.hypot(ax, ay) || 1;
    for (const k of nb[i]) {
      const h = pieces[k];
      const bx = h.cx - f.cx, by = h.cy - f.cy, db = Math.hypot(bx, by) || 1;
      if ((ax * bx + ay * by) / (da * db) > cosMax) return false;
    }
    return true;
  };
  for (const e of edges) {
    if (nb[e.i].length >= 2 || nb[e.j].length >= 2) continue;
    if (root(e.i) === root(e.j)) continue;
    if (!straightAt(e.i, e.j) || !straightAt(e.j, e.i)) continue;
    nb[e.i].push(e.j); nb[e.j].push(e.i);
    parent[root(e.i)] = root(e.j);
  }
  // the chains in order, from an end (a piece with no neighbour is a chain of one: a word on its own)
  const lines = [];
  const used = new Uint8Array(pieces.length);
  for (let s = 0; s < pieces.length; s++) {
    if (used[s] || nb[s].length > 1) continue;
    const chain = [];
    let prev = -1, cur = s;
    while (cur >= 0 && !used[cur]) {
      used[cur] = 1;
      chain.push(pieces[cur]);
      const next = nb[cur].find((k) => k !== prev && !used[k]);
      prev = cur;
      cur = next === undefined ? -1 : next;
    }
    lines.push(chain);
  }

  const accepted = [];
  for (const line of lines) {
    const n = line.length;
    const letters = line.reduce((a, f) => a + f.weight, 0);
    if (letters < need) continue;
    // a word on its own has no line to test, only its own outline: it must be convoluted indeed
    if (n === 1 && !(line[0].holes >= 1 || line[0].compact >= 2 * O.wordCompact)) continue;
    // across the line: the height of each letter measured along the normal of the line where it stands
    const heights = line.map((f, k) => {
      if (n === 1) return f.short;
      const a = line[Math.max(0, k - 1)], b = line[Math.min(n - 1, k + 1)];
      let tx = b.cx - a.cx, ty = b.cy - a.cy;
      const d = Math.hypot(tx, ty) || 1;
      tx /= d; ty /= d;
      return extentAlong(f, mmPerPx, -ty, tx);
    });
    if (heightCover(heights, O.heightTol) < O.heightCover) continue;
    if (median(heights) > 1.3 * O.maxHeightMm) continue; // (a line of tall thin shapes side by side: spokes, reeds, a fence)
    const kinds = distinctKinds(line, O.kindTol);
    if (kinds < Math.max(O.minDistinct, Math.min(Math.ceil(letters / 2), O.maxKinds))) continue;
    accepted.push({ line, heights, kinds, letters });
  }

  // blocks: lines of one colour, alike in weight and height, that lie close together (two lines of a text; the letters and their outlines are of two colours and stay two)
  const blocks = accepted.map((a, i) => ({ id: i, lines: [a], pieces: a.line.slice() }));
  const strokeOf = (b) => { let ar = 0, ws = 0; for (const f of b.pieces) { ar += f.area; ws += f.area * f.meanW; } return ws / ar; };
  const heightOf = (b) => median(b.lines.flatMap((a) => a.heights));
  const boxOf = (b) => b.pieces.reduce((q, f) => [Math.min(q[0], f.x0), Math.min(q[1], f.y0), Math.max(q[2], f.x1), Math.max(q[3], f.y1)], [Infinity, Infinity, -Infinity, -Infinity]);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i], b = blocks[j];
        if (a.pieces[0].color !== b.pieces[0].color) continue;
        const sa = strokeOf(a), sb = strokeOf(b), ha = heightOf(a), hb = heightOf(b);
        if (Math.max(sa, sb) > O.blockRatio * Math.min(sa, sb) || Math.max(ha, hb) > O.blockRatio * Math.min(ha, hb)) continue;
        const A = boxOf(a), B = boxOf(b);
        const gx = Math.max(0, Math.max(A[0], B[0]) - Math.min(A[2], B[2])), gy = Math.max(0, Math.max(A[1], B[1]) - Math.min(A[3], B[3]));
        if (Math.hypot(gx, gy) > O.blockGap * Math.min(ha, hb)) continue;
        a.lines.push(...b.lines); a.pieces.push(...b.pieces);
        blocks.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }

  const out = blocks.map((b) => {
    let a = 0, ws = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of b.pieces) {
      a += f.area; ws += f.area * f.meanW;
      if (f.x0 < x0) x0 = f.x0; if (f.y0 < y0) y0 = f.y0; if (f.x1 > x1) x1 = f.x1; if (f.y1 > y1) y1 = f.y1;
    }
    return {
      id: 0,
      shapes: b.pieces.map((f) => f.id).sort((p, q) => p - q),
      count: b.pieces.length,
      letters: b.lines.reduce((s, l) => s + l.letters, 0),
      lines: b.lines.length,
      strokeMm: ws / a,
      capMm: median(b.lines.flatMap((l) => l.heights)),
      box: [x0 / mmPerPx, y0 / mmPerPx, x1 / mmPerPx, y1 / mmPerPx],
      colors: [b.pieces[0].color],
      ...(debug ? { kinds: Math.max(...b.lines.map((l) => l.kinds)), straight: 1, steadyMedian: median(b.pieces.map((f) => f.steady)) } : {}),
    };
  });
  out.sort((p, q) => q.letters - p.letters);
  out.forEach((r, i) => { r.id = i; });
  return out;
}


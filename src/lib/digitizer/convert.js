/**
 * From what the tracer found in a picture to the Digitizer's objects: one object per shape, coloured, named, in sewing order
 * (the tracer's order: big areas first, details last), placed where the picture is.
 */
import { makeObject, DEFAULT_CLOTH } from "./model.js";
import { nearestThread, rgbToHex, threadName, toLab, hexToRgb } from "../embroidery/thread/chart.js";
import { offsetRings, intersectRings, unionShapes, differenceRings } from "../embroidery/geometry/clip.js";
import { bboxOf, islandsOf, ringPerimeter } from "../embroidery/geometry/poly.js";
import { detailLimits } from "../embroidery/trace/detail.js";
import { applyLook, lookOptions } from "./look.js";

export { detailLimits };

/** How near (CIELAB distance) a picture colour must be to the cloth to count as "the cloth" and not be stitched. */
export const CLOTH_MATCH = 14;

/**
 * A photograph is different: nothing in it is the page, and its colours run into each other. The default cream cloth is only a guess, so against it nothing
 * of a photograph is "the cloth" (the white of hair or of a shirt is part of the picture: at 14 a portrait lost its hair and its collar). Against a cloth
 * that means something (the backdrop's own colour, or one the person chose) only a colour very near it is left unstitched (the blurred green round a flower),
 * and not the grey hair next to a grey wall, which is 10 away.
 */
export const CLOTH_MATCH_PHOTO = 7;

/** How near (CIELAB distance) a colour must be to the cloth `fabric` (a hex colour) to be left unstitched, for this kind of picture (0: never). */
export function clothMatch(kind, fabric = null) {
  if (kind !== "photo") return CLOTH_MATCH;
  return fabric && String(fabric).toLowerCase() === String(DEFAULT_CLOTH).toLowerCase() ? 0 : CLOTH_MATCH_PHOTO;
}

/**
 * A shape in a colour like the cloth is left unstitched (the cloth shows through) when it is wide: a gap in a fill can be kept clean
 * when it is about this wide, but not a narrow one (white lettering or a thin white ring inside a dark badge comes out ragged and
 * broken, because the rows of the fill around it cannot stop that close). A narrower shape than this (mean width in millimetres) is
 * stitched in its own colour, over the shape that surrounds it, but only where it is ink: see CLOTH_FIELD_MM.
 */
export const CLOTH_FINE_MM = 2.5;

/**
 * In a logo (and for the page's own colour in any picture), a narrow shape of the cloth's colour is ink (to be stitched) when it sits in a
 * hole of a shape this wide or wider (mean width, mm): white lettering on a navy badge, a thin white ring. In a hole of a narrower shape
 * it is the inside of a letter (its counter: the white in an a, e, B or D), which is a hole in the lettering, not a detail; and when it
 * sits in no shape's hole (a white outline round the whole design) it is the page, so the cloth. Both stay cloth. In a portrait or a
 * photograph a narrow patch of a tone near the cloth's is a detail of the picture (the folds of a dark coat on a dark cloth) and is stitched.
 */
export const CLOTH_FIELD_MM = 4;

/** The mean width of a traced shape in millimetres (twice its area over its outline's length). */
export function shapeWidthMm(shape, mmPerPx) {
  let per = 0;
  for (const c of shape.contours) per += ringPerimeter(c);
  return per > 0 ? (2 * shape.area * mmPerPx) / per : 0;
}

/**
 * What the picture is turned into shapes with, unless the person changes it. Up to 12 colours is the number of needles a
 * machine head has; "Auto" uses only as many as the picture needs. Colours are kept as the picture has them (the nearest
 * thread is only a name on the sheet), the kind of picture (logo, artwork, photo) is found by looking at it, and thin
 * lines and lettering are kept and widened to something a needle can follow. Detail 0.75 is the starting point: on 95 test pictures each step up the slider
 * (0.25, 0.5, 0.75, 1) kept more of the small things and made the stitched picture closer to the source, at a few per cent more stitches.
 */
export const CONVERT_DEFAULTS = { colors: "auto", maxColors: 12, detail: 0.75, background: "auto", snap: false, kind: "auto", details: true, detailThick: false, people: true };

/**
 * Whether a portrait, artwork or a photograph is read half a step further up the Detail slider than a logo (`trace/detail.js`: its small shapes are the
 * eyes, brows and wrinkles). OFF, because the default slider setting (0.75) was tuned for every kind alike. Measured on 129 real pictures at 100 mm
 * (all at 0.75), ON gives: small regions kept 55.7 -> 59.5 %, colour error 6.68 -> 6.52, error in the fine detail 8.16 -> 7.92, thin lines found
 * 0.63 -> 0.67, for 9.7 % more stitches, 20 % more thread cuts, 33 % more jumps and 15 % more time to make them (faces +7.3 points of regions kept
 * for 10 % more stitches, trees +4.9 for 13 %, animals +6.6 for 19 %, line art +7.9 for 22 %, logos unchanged). The slider already does the same for
 * a picture on request (Finest).
 */
export const KIND_AWARE_DETAIL = false;

/** The tracer's options for these settings; `mmPerPx` is the size of one pixel of the picture, in millimetres. */
export function traceOptions(settings, mmPerPx) {
  const s = { ...CONVERT_DEFAULTS, ...settings };
  return {
    colors: s.colors,
    maxColors: s.maxColors,
    mmPerPx,
    background: s.background === "none" ? "none" : "auto",
    mode: s.kind === "logo" || s.kind === "art" || s.kind === "photo" ? s.kind : "auto",
    thicken: true,
    ...detailLimits(s.detail), // what a logo gets
    details: s.details !== false, // photographs and artwork also get fine lines and dots on top (see fineObjects); a logo never does
    fineDetail: s.detail, // ... as many and as faint as the Detail slider says
    ...(s.fineParams ? { fineParams: s.fineParams } : {}),
    ...(KIND_AWARE_DETAIL ? { detail: s.detail } : {}), // with this the tracer knows the slider too, and gives a portrait or a photograph more once it has found the kind
    look: lookOptions(s), // how the shapes are sewn (rows' angles, edge lines); the tracer carries it to objectsFromTrace
  };
}

/**
 * The colour of the cloth a picture was made for: the picture's own background when it is dark or strongly coloured (a white
 * logo on black is for a black shirt; white thread on a cream cloth would show nothing). A light background says nothing
 * (the cloth is probably light), so null is returned and the cloth stays as it is.
 */
export function clothFromTrace(traced) {
  const bg = traced.palette.find((p) => p.background && !p.transparent);
  if (!bg) return null;
  const lab = toLab(bg.r, bg.g, bg.b);
  return lab[0] < 75 ? rgbToHex(bg.r, bg.g, bg.b) : null;
}

/** One side of a Sutherland-Hodgman cut of a ring against a box (side 0 left, 1 right, 2 top, 3 bottom). */
function clipSide(pts, side, box) {
  const inside = (p) => (side === 0 ? p[0] >= box[0] : side === 1 ? p[0] <= box[2] : side === 2 ? p[1] >= box[1] : p[1] <= box[3]);
  const cut = (a, b) => {
    if (side < 2) { const x = side === 0 ? box[0] : box[2]; const t = (x - a[0]) / (b[0] - a[0]); return [x, a[1] + t * (b[1] - a[1])]; }
    const y = side === 2 ? box[1] : box[3];
    const t = (y - a[1]) / (b[1] - a[1]);
    return [a[0] + t * (b[0] - a[0]), y];
  };
  const out = [];
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) out.push(cut(a, b));
  }
  return out;
}

/**
 * The part of a shape's rings inside a box: each ring cut by the four sides, a ring wholly inside kept as it is, one wholly outside dropped. The
 * cuts that run along the box's sides are only ever looked at far from them, so they do no harm. It makes a shape of tens of thousands of points
 * as cheap as the little piece of it that lies near the shape being worked on (the polygon engine cut the whole of it every time).
 */
function clipToBox(rings, box) {
  const out = [];
  // A ring that holds the whole box comes out of the cut as the box itself. A border has two of them (its outer edge and the edge of its hole): the box lies in the hole,
  // outside the shape, so the two copies must cancel; left in, they read as two islands that cover the box, and every shape inside the border grew by the bleed all round.
  const boxArea = (box[2] - box[0]) * (box[3] - box[1]);
  let holding = 0;
  for (const ring of rings) {
    const b = bboxOf([ring]);
    if (!b || b[0] > box[2] || b[2] < box[0] || b[1] > box[3] || b[3] < box[1]) continue;
    if (b[0] >= box[0] && b[2] <= box[2] && b[1] >= box[1] && b[3] <= box[3]) { out.push(ring); continue; }
    let pts = ring;
    for (let side = 0; side < 4 && pts.length; side++) pts = clipSide(pts, side, box);
    if (pts.length < 3) continue;
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
    if (boxArea > 0 && Math.abs(a) / 2 >= boxArea * 0.999999) holding++;
    else out.push(pts);
  }
  if (holding % 2) out.push([[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]]);
  return out;
}

/**
 * Let every shape reach a little under the shapes sewn after it, so a gap in the stitching of the top shape (or the edge
 * where two colours meet) shows the colour beneath and never the bare cloth. `list` has the shapes' rings (millimetres) in
 * sewing order; the result has the same shapes, each grown by `bleed` mm but only where a later shape lies over the growth:
 * its visible edge is untouched. `only` (optional, one flag per shape) limits the work to the shapes flagged: the others are
 * returned as they are.
 */
export function bleedUnder(list, bleed, only = null) {
  if (!(bleed > 0)) return list;
  const boxes = list.map((r) => bboxOf(r) || [0, 0, 0, 0]);
  const out = list.slice();
  for (let i = 0; i < list.length - 1; i++) {
    if (only && !only[i]) continue; // a shape the caller will not use (it is already in the design as it was)
    const bi = boxes[i];
    const near = [];
    for (let j = i + 1; j < list.length; j++) {
      const bj = boxes[j];
      if (bj[0] > bi[2] + bleed || bj[2] < bi[0] - bleed || bj[1] > bi[3] + bleed || bj[3] < bi[1] - bleed) continue;
      near.push(list[j]);
    }
    if (!near.length) continue;
    const points = list[i].reduce((s, r) => s + r.length, 0);
    // only what lies near this shape matters: the shapes beside it are cut to its box first (a neighbour of 30000 points was worked on whole for every small shape)
    const win = [bi[0] - bleed - 0.5, bi[1] - bleed - 0.5, bi[2] + bleed + 0.5, bi[3] + bleed + 0.5];
    if (!(points > 1500 && list[i].length > 12)) {
      const cutNear = near.map((r) => clipToBox(r, win)).filter((r) => r.length);
      if (!cutNear.length) continue;
      near.length = 0;
      near.push(...cutNear);
    }
    if (points > 1500 && list[i].length > 12) {
      // A big shape cut by many holes (the field of an engraving): cutting its whole grown outline against every shape beside it took
      // seconds. Its edge is worked ring by ring instead: the strip just outside each ring (on the material's far side) meets only the shapes that touch it.
      const extras = [];
      for (const { outer, holes } of islandsOf(list[i])) {
        const strips = [differenceRings(offsetRings([outer], bleed), [outer])];
        for (const hole of holes) strips.push(differenceRings([hole], offsetRings([hole], -bleed)));
        for (const strip of strips) {
          if (!strip.length) continue;
          const sb = bboxOf(strip);
          const sw = [sb[0] - 0.5, sb[1] - 0.5, sb[2] + 0.5, sb[3] + 0.5];
          const here = near.filter((r) => { const b = bboxOf(r); return !(b[0] > sw[2] || b[2] < sw[0] || b[1] > sw[3] || b[3] < sw[1]); }).map((r) => clipToBox(r, sw)).filter((r) => r.length);
          if (!here.length) continue;
          const cut = intersectRings(strip, here.length === 1 ? here[0] : unionShapes(here));
          if (cut.length) extras.push(cut);
        }
      }
      if (extras.length) out[i] = unionShapes([list[i], ...extras]);
      continue;
    }
    const later = near.length === 1 ? near[0] : unionShapes(near);
    const extra = intersectRings(offsetRings(list[i], bleed), later);
    if (extra.length) out[i] = unionShapes([list[i], extra]);
  }
  return out;
}

/**
 * The palette entries that changed between two palettes (the one `after` a colour was switched or the cloth was changed, and the one `before`): they went on or
 * off, or went from "only its fine parts" to all of it or back (the cloth colour was changed). Only the shapes of these colours are made again and put into the design.
 */
export function changedColours(after, before) {
  const changed = new Set();
  after.forEach((p, i) => { if (!!p.skipped !== !!before[i].skipped || !!p.fineOnly !== !!before[i].fineOnly) changed.add(i); });
  return changed;
}

/* ── the fine lines and dots on top ──────────────────────────────────────────────────────────────────────────────── */

/** A detail is sewn in the thread nearest its own colour, but only when that thread is this near it (CIELAB distance): a middling thread that is "good enough" for a dark lash and a pale vein alike would turn both into mush. */
export const DETAIL_MATCH_DE = 18;
/** A detail must differ at least this much (CIELAB) from what lies under it, or it would not show: a vein in the leaf's own colour is left out. */
export const DETAIL_VISIBLE_DE = 14;
/** Details no thread of the design is near may bring in up to this many new colours, if the machine has needles to spare. */
export const DETAIL_NEW_COLOURS = 2;
/** ... and a new colour only when the details it would serve add up to this much (millimetres of line, a dot counting for twice its area). */
const DETAIL_NEW_MIN = 25;
/** The stitches of all the details together stay under this share of what the colour layer comes to (about two stitches to a mm² of shape). */
export const DETAIL_STITCH_SHARE = 0.3;
/** The separate pieces of the details (a line or a dot: each may cost a thread cut) stay under this share of the colour layer's shapes, and never under DETAIL_MIN_PIECES. A design has about one cut to a shape, so this holds the cuts the details add to about a fifth. */
export const DETAIL_PIECES_PER_SHAPE = 0.2;
export const DETAIL_MIN_PIECES = 12;
/** The details are sewn in at most this many threads: every thread is a colour change at the end of the sew, and a picture needs a dark, a light and perhaps one more. */
export const DETAIL_THREADS = 3;
/** A further thread for the details is only worth its colour change when it serves this much more (millimetres of line, a dot counting for twice its area). */
const DETAIL_THREAD_MIN = 25;
/** Across the stroke (mm): one thread sewn three times (bean), or a narrow satin column when thicker lines are asked for (a line of one thread can sink into a dense fill). */
export const DETAIL_LINE_MM = 0.45;
export const DETAIL_THICK_MM = 0.7;

/**
 * How much a detail counts, by the region of a person it lies in (regions.js: background, hair, body skin, face skin, clothes, other): the lids and lashes of a face
 * come before the pattern on a tie when threads and stitches are shared out. Details of a picture without a region map count the same.
 */
export const DETAIL_REGION_WEIGHTS = Object.freeze([0, 2, 1.5, 4, 0.5, 1]);

/** The numbers above as one set, so a caller (a test, a sweep) can try others: `objectsFromTrace(..., { detailTune: { visibleDE: 8 } })`. */
export const DETAIL_TUNE = Object.freeze({
  matchDE: DETAIL_MATCH_DE,
  visibleDE: DETAIL_VISIBLE_DE,
  newColours: DETAIL_NEW_COLOURS,
  stitchShare: DETAIL_STITCH_SHARE,
  piecesPerShape: DETAIL_PIECES_PER_SHAPE,
  threads: DETAIL_THREADS,
});

/**
 * The objects for the fine lines and dots the tracer found on the picture (see trace/fine.js): one object of open lines for each thread
 * and one of small dots for each thread, after all the colour layer's shapes. They are sewn on top, last (the engine keeps them after
 * every object that comes before them in the design), dots first and then the lines, dark ones before light ones.
 *   colour:  each detail is sewn in the nearest thread the design already has when one is near; else in one of up to two new colours (when the
 *            machine has needles to spare); else in the nearest anyway. One that would not show (its thread is the colour under it) is left out.
 *   amount:  the strongest and longest first, until their stitches reach DETAIL_STITCH_SHARE of the colour layer's or their pieces DETAIL_PIECES_PER_SHAPE of its shapes.
 */
function fineObjects(traced, { palette, cloth, originX, originY, mmPerPx, snap, maxColors, thick, shapes, tune = null }) {
  const t = { ...DETAIL_TUNE, ...(tune || {}) };
  const det = traced.details;
  if (!det || (!det.lines.length && !det.spots.length)) return null;
  const dE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const labOfHex = (hex) => { const c = hexToRgb(hex); return toLab(c.r, c.g, c.b); };
  // the threads the colour layer really sews
  const sewn = [], seen = new Set();
  for (const p of palette) {
    if (p.skipped || seen.has(p.hex)) continue;
    seen.add(p.hex);
    sewn.push({ hex: p.hex, lab: labOfHex(p.hex) });
  }
  const items = [];
  const weightOf = (d) => (d.region ? DETAIL_REGION_WEIGHTS[d.region] ?? 1 : 1);
  for (const l of det.lines) items.push({ line: l, d: l, w: l.lengthMm * weightOf(l), lab: toLab(l.rgb[0], l.rgb[1], l.rgb[2]), cost: l.lengthMm * 1.5 + 8 });
  for (const s of det.spots) items.push({ spot: s, d: s, w: Math.max(2, s.areaMm2 * 2) * weightOf(s), lab: toLab(s.rgb[0], s.rgb[1], s.rgb[2]), cost: s.areaMm2 + 12 });
  const nearest = (lab, pool) => { let best = null, bd = Infinity; for (const c of pool) { const d = dE(lab, c.lab); if (d < bd) { bd = d; best = c; } } return { c: best, d: bd }; };
  for (const it of items) it.nearD = sewn.length ? nearest(it.lab, sewn).d : Infinity;
  // new colours for the details that no thread of the design is near: the biggest groups of alike ones
  const fresh = [];
  const room = Math.max(0, Math.min(t.newColours, (maxColors | 0) - sewn.length));
  if (room > 0) {
    const groups = [];
    for (const it of items.filter((x) => x.nearD > t.matchDE).sort((a, b) => b.w - a.w)) {
      let g = groups.find((q) => dE(it.lab, q.lab) <= 18);
      if (!g) { if (groups.length >= 8) continue; g = { lab: it.lab, w: 0, r: 0, g: 0, b: 0 }; groups.push(g); }
      g.w += it.w; g.r += it.w * it.d.rgb[0]; g.g += it.w * it.d.rgb[1]; g.b += it.w * it.d.rgb[2];
    }
    for (const g of groups.filter((q) => q.w >= DETAIL_NEW_MIN).sort((a, b) => b.w - a.w).slice(0, room)) {
      const r = Math.round(g.r / g.w), gg = Math.round(g.g / g.w), b = Math.round(g.b / g.w);
      const hex = snap ? nearestThread(r, gg, b).hex : rgbToHex(r, gg, b);
      if (!seen.has(hex)) { seen.add(hex); fresh.push({ hex, lab: labOfHex(hex) }); }
    }
  }
  const pool = [...sewn, ...fresh];
  if (!pool.length) return null;
  // Each detail is sewn in the thread of the pool nearest its own colour, if that is near enough to look like it (DETAIL_MATCH_DE) and shows on what lies
  // under it (DETAIL_VISIBLE_DE); else it is left out. Then only the few threads (DETAIL_THREADS at most) that serve the most of them are kept: the
  // details of the others go to a kept thread when one is near enough, or are left out.
  for (const it of items) it.under = it.d.under >= 0 && palette[it.d.under] && !palette[it.d.under].skipped ? labOfHex(palette[it.d.under].hex) : cloth;
  const stands = (it, c) => !!c && dE(it.lab, c.lab) <= t.matchDE && dE(c.lab, it.under) >= t.visibleDE;
  const assigned = items.map((it) => { const c = nearest(it.lab, pool).c; return stands(it, c) ? c : null; });
  const weight = new Map();
  items.forEach((it, i) => { if (assigned[i]) weight.set(assigned[i], (weight.get(assigned[i]) || 0) + it.w); });
  const kept3 = [...weight].sort((a, b) => b[1] - a[1]).filter((e, k) => k < t.threads && (k === 0 || e[1] >= DETAIL_THREAD_MIN)).map((e) => e[0]);
  let invisible = 0, over = 0;
  const shown = [];
  items.forEach((it, i) => {
    let c = assigned[i];
    if (c && !kept3.includes(c)) { const k = nearest(it.lab, kept3).c; c = stands(it, k) ? k : null; }
    if (!c) { invisible++; return; } // no thread of the design looks like it and shows on what lies under it
    it.hex = c.hex;
    shown.push(it);
  });
  // the strongest first, as many as the stitch budget and the cap on pieces allow
  let baseMm2 = 0;
  for (const s of shapes) baseMm2 += s.area * mmPerPx * mmPerPx;
  const budget = Math.max(150, t.stitchShare * 2 * baseMm2);
  shown.sort((a, b) => b.d.strength * Math.sqrt(b.w) - a.d.strength * Math.sqrt(a.w));
  const kept = [];
  let spent = 0;
  const maxPieces = Math.max(DETAIL_MIN_PIECES, Math.round(t.piecesPerShape * shapes.length));
  for (const it of shown) { // (strongest and longest first, so it is the weakest and shortest that are left out)
    if (kept.length >= maxPieces || spent + it.cost > budget) { over++; continue; }
    spent += it.cost;
    kept.push(it);
  }
  const toMm = (p) => [originX + p[0] * mmPerPx, originY + p[1] * mmPerPx];
  const group = (isSpot) => {
    const m = new Map();
    for (const it of kept) {
      if (!!it.spot !== isSpot) continue;
      const ring = isSpot ? it.spot.ring.map(toMm) : it.line.pts.map(toMm);
      if (ring.length < (isSpot ? 3 : 2)) continue;
      let e = m.get(it.hex);
      if (!e) { e = { hex: it.hex, rings: [], size: 0 }; m.set(it.hex, e); }
      e.rings.push(ring);
      e.size += it.w;
    }
    return [...m.values()];
  };
  const objects = [];
  const plain = (hex) => threadName(hex).replace(/ \(close\)$/, "");
  // dots first (the biggest sum first), then the lines, dark threads before light ones so a pale highlight is never sewn over
  for (const g of group(true).sort((a, b) => b.size - a.size)) {
    objects.push({ ...makeObject({ name: `Fine dots, ${plain(g.hex)}`, rings: g.rings, fill: { type: "auto", color: g.hex }, source: "image" }), layer: "detail" });
  }
  for (const g of group(false).sort((a, b) => labOfHex(a.hex)[0] - labOfHex(b.hex)[0])) {
    objects.push({
      ...makeObject({
        name: `Fine lines, ${plain(g.hex)}`,
        rings: g.rings,
        fill: { type: "none", color: g.hex },
        stroke: { type: thick ? "satin" : "bean", color: g.hex, width: thick ? DETAIL_THICK_MM : DETAIL_LINE_MM, len: 2, position: "center" },
        source: "image",
      }),
      open: true,
      layer: "detail",
    });
  }
  if (!objects.length) return null;
  const lines = kept.filter((it) => it.line).length, dots = kept.length - lines;
  return { objects, summary: { lines, dots, stitchesEst: Math.round(spent), colours: [...new Set(kept.map((it) => it.hex))], newColours: fresh.length, found: det.stats.found || null, left: { invisible, budget: over } } };
}

/**
 * @param {object} traced  the tracer's result (palette, shapes, order)
 * @param {object} o  originX, originY (hoop mm of the traced image's top-left corner), mmPerPx (mm per traced-image pixel),
 *   skip (Set of palette indexes the person turned off), include (Set of indexes turned ON although they match the cloth),
 *   fabric (the cloth's colour as hex: a picture colour close to it is the cloth showing through, so it is not stitched),
 *   snap (move each colour to the nearest thread of the chart)
 * @returns {{ objects: object[], palette: {index, hex, name, fraction, background, enclosed, skipped, sameAsCloth, fineOnly}[], rank: Map }}
 *   `enclosed` marks the page colour that sits inside the design (white letters in a navy disc, the hole of an O): it is its own entry.
 *   `fineOnly` marks a colour like the cloth of which only the fine shapes that are ink (narrower than CLOTH_FINE_MM and in a hole of a wide shape, see
 *   CLOTH_FIELD_MM) are stitched: they are not `skipped`.
 *   Every object carries `pal`, the palette entry it was made for, and `rank` says where each entry comes in the sewing order.
 */
export function objectsFromTrace(traced, { originX, originY, mmPerPx, skip = new Set(), include = new Set(), fabric = null, snap = false, bleed = 0.4, before = null, maxColors = 12, detailThick = false, detailTune = null }) {
  const cloth = fabric ? toLab(...Object.values(hexToRgb(fabric))) : null;
  const matchDE = clothMatch(traced.stats?.kind, fabric);
  // Which shapes have a hole that another shape sits in? Touching shapes share exactly the same boundary points, so a shape sits in the hole of
  // any shape whose hole outline has one of its own outline's points. Built (and widths measured) only when a colour like the cloth has narrow shapes.
  const indexOf = new Map(traced.shapes.map((sh, k) => [sh, k]));
  const widths = new Map();
  const widthOf = (k) => { if (!widths.has(k)) widths.set(k, shapeWidthMm(traced.shapes[k], mmPerPx)); return widths.get(k); };
  let holeOwners = null;
  const ownersOf = () => {
    if (holeOwners) return holeOwners;
    holeOwners = new Map();
    traced.shapes.forEach((sh, k) => {
      for (let c = 1; c < sh.contours.length; c++) {
        for (const p of sh.contours[c]) {
          const key = `${p[0]},${p[1]}`;
          const list = holeOwners.get(key);
          if (!list) holeOwners.set(key, [k]); else if (list[list.length - 1] !== k) list.push(k);
        }
      }
    });
    return holeOwners;
  };
  const fine = new Map();
  const isLogo = traced.stats?.kind === "logo";
  const isFine = (s) => {
    if (!fine.has(s)) {
      let ink = false;
      if (widthOf(indexOf.get(s)) < CLOTH_FINE_MM) {
        if (!isLogo && !traced.palette[s.color].enclosedBackground) ink = true; // a tone of a portrait or photograph that is near the cloth's
        else {
          const owners = ownersOf();
          for (const p of s.contours[0]) {
            const list = owners.get(`${p[0]},${p[1]}`);
            if (list && list.some((k) => widthOf(k) >= CLOTH_FIELD_MM)) { ink = true; break; }
          }
        }
      }
      fine.set(s, ink);
    }
    return fine.get(s);
  };
  const palette = traced.palette.map((p, index) => {
    const hex = snap ? nearestThread(p.r, p.g, p.b).hex : rgbToHex(p.r, p.g, p.b);
    const lab = toLab(p.r, p.g, p.b);
    const sameAsCloth = !p.background && !!cloth && matchDE > 0 && Math.hypot(lab[0] - cloth[0], lab[1] - cloth[1], lab[2] - cloth[2]) <= matchDE;
    // a colour like the cloth is not stitched, except for its fine shapes (lettering, thin lines) unless the person asked for none of it
    const clothOnly = sameAsCloth && !include.has(index);
    const fineOnly = clothOnly && !p.background && !skip.has(index) && traced.shapes.some((s) => s.color === index && isFine(s));
    const skipped = !!p.background || skip.has(index) || (clothOnly && !fineOnly);
    return { index, hex, name: threadName(hex), fraction: p.fraction ?? 0, background: !!p.background, enclosed: !!p.enclosedBackground, skipped, sameAsCloth, fineOnly };
  });
  const rank = new Map((traced.order || traced.palette.map((_, i) => i)).map((c, i) => [c, i]));
  const shapes = traced.shapes
    .filter((s) => !palette[s.color].skipped && (!palette[s.color].fineOnly || isFine(s)))
    .slice()
    .sort((a, b) => (rank.get(a.color) ?? 0) - (rank.get(b.color) ?? 0) || b.area - a.area);
  const counters = new Map();
  // each shape reaches a little under the ones sewn after it (they are all one picture: no bare cloth between two colours).
  // `before` is the palette as it was: when only some colours were turned on or off, only their shapes go into the design
  // (see mergeTraceObjects), so the overlap is worked out for those alone.
  let only = null;
  if (before && before.length === palette.length) {
    const changed = changedColours(palette, before);
    only = shapes.map((s) => changed.has(s.color));
  }
  const ringsOf = bleedUnder(shapes.map((s) => s.contours.map((c) => c.map((p) => [originX + p[0] * mmPerPx, originY + p[1] * mmPerPx]))), bleed, only);
  const objects = shapes.map((s, k) => {
    const n = (counters.get(s.color) || 0) + 1;
    counters.set(s.color, n);
    const rings = ringsOf[k];
    return {
      ...makeObject({
        name: `${palette[s.color].name.replace(/ \(close\)$/, "")} ${n}`,
        rings,
        fill: { type: "auto", color: palette[s.color].hex },
        source: "image",
      }),
      pal: s.color,
    };
  });
  // The fine lines and dots found on the picture itself go on top of everything the colour layer made (and of its angles and edge lines), last in the design.
  const onTop = traced.details ? fineObjects(traced, { palette, cloth: cloth || toLab(...Object.values(hexToRgb(DEFAULT_CLOTH))), originX, originY, mmPerPx, snap, maxColors, thick: detailThick, shapes, tune: detailTune }) : null;
  const looked = applyLook(objects, shapes, traced, mmPerPx); // (the colour layer's objects only: the look is worked out shape by shape)
  return { objects: onTop ? [...looked, ...onTop.objects] : looked, palette, rank, details: onTop ? onTop.summary : null };
}

/**
 * Where the stitched part of a traced picture lies, in the hoop's millimetres: { x0, y0, x1, y1 }. Only the shapes that would be
 * stitched count (not the background, nor colours like the cloth). Null when there is nothing to stitch.
 */
export function contentBox(traced, { originX, originY, mmPerPx, fabric = null }) {
  const cloth = fabric ? toLab(...Object.values(hexToRgb(fabric))) : null;
  const matchDE = clothMatch(traced.stats?.kind, fabric);
  const counts = traced.palette.map((p) => {
    if (p.background) return false;
    if (!cloth || matchDE <= 0) return true;
    const lab = toLab(p.r, p.g, p.b);
    return Math.hypot(lab[0] - cloth[0], lab[1] - cloth[1], lab[2] - cloth[2]) > matchDE;
  });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of traced.shapes) {
    if (!counts[s.color]) continue;
    const [a, b, c, d] = s.bbox;
    if (a < x0) x0 = a;
    if (b < y0) y0 = b;
    if (c > x1) x1 = c;
    if (d > y1) y1 = d;
  }
  if (!(x1 > x0 && y1 > y0)) return null;
  return { x0: originX + x0 * mmPerPx, y0: originY + y0 * mmPerPx, x1: originX + x1 * mmPerPx, y1: originY + y1 * mmPerPx };
}

/**
 * How much bigger the picture (and so the design) can be made so that what is stitched fills the hoop, with a little room round
 * it: 1 when it already does (or nearly), never more than `most`. `box` is contentBox's answer, `hoop` { w, h } in millimetres.
 */
export function fillScale(box, hoop, { margin = 0.92, most = 2.5, atLeast = 1.12 } = {}) {
  if (!box) return 1;
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  if (!(bw > 0 && bh > 0)) return 1;
  const k = Math.min((hoop.w * margin) / bw, (hoop.h * margin) / bh, most);
  return k >= atLeast ? k : 1;
}

/**
 * Put the objects made from a trace into the design's list.
 *   fresh: a new conversion. Every picture shape that is there now is replaced, at the place the old ones were (the end when
 *     there were none).
 *   otherwise only the colours that were turned on or off (compare `before` and `after`, the palettes) are touched: the shapes
 *     of a colour that went off leave, those of a colour that came on join where their colour belongs in the sewing order.
 *     Every other shape stays exactly as it is, edits and all, and so does everything that is not from the picture.
 */
export function mergeTraceObjects(current, made, { fresh = false, before = null, after = [], rank = new Map() } = {}) {
  const isPic = (o) => o.source === "image";
  if (fresh || !before || before.length !== after.length) {
    const first = current.findIndex(isPic);
    const rest = current.filter((o) => !isPic(o));
    const place = first < 0 ? rest.length : current.slice(0, first).filter((o) => !isPic(o)).length;
    // Shapes traced by hand over the picture (maybe while it was still being read) stay on top of the picture's own shapes.
    const head = rest.slice(0, place), hands = head.filter((o) => o.source === "hand");
    return [...head.filter((o) => o.source !== "hand"), ...made, ...hands, ...rest.slice(place)];
  }
  const changed = changedColours(after, before);
  if (!changed.size) return current;
  let list = current.filter((o) => !(isPic(o) && changed.has(o.pal)));
  const rankOf = (i) => (i == null ? Infinity : rank.get(i) ?? Infinity);
  const coming = [...changed].filter((i) => !after[i].skipped).sort((a, b) => rankOf(a) - rankOf(b));
  for (const i of coming) {
    const mine = made.filter((o) => o.pal === i);
    if (!mine.length) continue;
    // Placed by rank among the picture's colour shapes only: the fine lines and dots on top carry no palette entry (`pal`), and one that a person
    // moved earlier in the list must not drag the colour's shapes to the front with it.
    let at = list.findIndex((o) => isPic(o) && o.pal != null && rankOf(o.pal) > rankOf(i)); // before the first colour shape that is sewn later
    if (at < 0) {
      let last = -1;
      list.forEach((o, k) => { if (isPic(o) && o.pal != null) last = k; });
      if (last >= 0) at = last + 1;
      else { const first = list.findIndex(isPic); at = first < 0 ? list.length : first; } // no colour shape left: before the fine details, or at the end
    }
    list = [...list.slice(0, at), ...mine, ...list.slice(at)];
  }
  return list;
}

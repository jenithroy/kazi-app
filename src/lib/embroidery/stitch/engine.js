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
import { intersectRings, offsetRings } from "../geometry/clip.js";
import { tatamiFill, FILL_DEFAULTS } from "./fill.js";
import { satinIsland, SATIN_DEFAULTS } from "./satin.js";
import { outlineRuns, OUTLINE_DEFAULTS } from "./outline.js";
import { fillUnderlayRuns, autoFillUnderlay } from "./underlay.js";
import { coverageOf } from "./quality.js";
import { createPlan, PLAN_DEFAULTS } from "./plan.js";
import { FABRICS, DEFAULT_FABRIC } from "./presets.js";

export const ENGINE_DEFAULTS = {
  ...PLAN_DEFAULTS,
  fabric: DEFAULT_FABRIC,
  optimizeColors: true, // reorder objects to save colour changes where nothing overlaps
  maxSatinWidth: 7, // full width, mm: a wider stroke is filled (when satin is asked for by hand)
  autoSatinWidth: 5, // for "auto": a stroke wider than this is filled (a satin stitch longer than about 5 mm sags, and wide curves fan out)
  autoSatinRatio: 3.5, // for "auto": the stroke must be this many times longer than it is wide, so a blob is never a fan of satin
  autoSatinSteady: 2.2, // for "auto": its widest part may be this many times its average width
  satinGap: 1.3, // mm: the stitches of one edge of a satin column are never further apart than this (a bend fans them out, and cloth shows)
  minIsland: 0.6, // mm2: a smaller piece is dropped (it cannot be sewn)
  satinCoverage: 0.85, // a satin attempt must cover this much of its island (thread drawn 1.5 x the spacing wide) ...
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
  return area > 0.4;
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
  const done = new Array(n).fill(false);
  const order = [];
  let colour = null;
  let at = null;
  while (order.length < n) {
    const ready = [];
    for (let i = 0; i < n; i++) if (!done[i] && before[i].every((k) => done[k])) ready.push(i);
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
  s.minStroke = within(raw.minStroke, 0.2, 3, SATIN_DEFAULTS.minStroke);
  s.underlayLen = within(raw.underlayLen, 0.8, 8, SATIN_DEFAULTS.underlayLen);
  s.inset = within(raw.inset, 0, 2, SATIN_DEFAULTS.inset);
  // An "Auto" shape that turns out to be a stroke is sewn as satin: the underlay chosen for its fill carries over to the satin.
  if (raw.underlay == null && (f.type || "auto") === "auto") {
    const carried = { none: "none", edge: "edge", "edge+tatami": "center+edge" }[f.underlay];
    if (carried) s.underlay = carried;
  }
  return s;
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

/**
 * The runs for one object: [{ pts, join, connectMax, kind, color }] in sewing order.
 * `needle` is where the previous run ended (a hint for where to begin). Warnings are pushed onto `warn`.
 */
function objectRuns(item, needle, S, warn, info) {
  const obj = item.obj;
  const rings = item.rings;
  const runs = [];
  const fill = obj.fill || {};
  const fillType = fill.type || "auto";
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

      let kind = fillType;
      let satin = null;
      let why = kind === "tatami" ? "chosen" : kind === "satin" ? "" : "wide area";
      if (kind === "auto" || kind === "satin") {
        const meanW = (2 * area) / Math.max(1e-6, shape.reduce((s, r) => s + ringPerimeter(r), 0));
        const limit = kind === "auto" ? S.autoSatinWidth : S.maxSatinWidth;
        const tryable = kind === "satin" || meanW <= limit * 0.8;
        if (tryable) {
          satin = satinIsland(shape, { ...ss, start: at });
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
            const good = cov.covered >= S.satinCoverage && cov.spill <= S.satinSpill && excess <= allowed && cov.dense <= S.satinDense && gap <= S.satinGap;
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
        const ul = fs.underlay === "auto" || fs.underlay == null ? autoFillUnderlay(area, S.fabric) : fs.underlay;
        const under = fillUnderlayRuns(shape, { type: ul, angle: fs.angle, start: at });
        under.forEach((p, i) => { runs.push({ pts: p, join: i > 0, connectMax: S.joinWithinIsland, kind: "underlay", color: fc }); at = p[p.length - 1]; });
        // The top stitches reach a touch past the edge, so a neighbouring colour sewn later overlaps them instead of leaving a line
        // of bare cloth between the two (and the thread's pull is allowed for).
        const reach = fs.grow > 0 ? offsetRings(shape, fs.grow, { join: "miter", miterLimit: 2 }) : shape;
        const top = tatamiFill(reach.length ? reach : shape, { ...fs, start: at });
        top.paths.forEach((p, i) => { runs.push({ pts: p, join: i === 0 && under.length > 0, connectMax: S.joinWithinIsland, kind: "fill", color: fc }); at = p[p.length - 1]; });
      }
    }
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
  (design.objects || []).forEach((obj, objIndex) => {
    if (!obj || obj.visible === false) return;
    const baked = bakeObject(obj).filter((r) => Array.isArray(r) && r.length >= 3);
    const rings = baked.filter((r) => r.every(sane));
    if (rings.length < baked.length) warn.push({ kind: "far", objectId: obj.id, message: `"${obj.name || obj.id}" has a part that is not a usable shape (or lies far outside the hoop) and was left out.` });
    if (!rings.length) return;
    const fill = obj.fill || {};
    const stroke = obj.stroke && obj.stroke.type && obj.stroke.type !== "none" ? obj.stroke : null;
    const box = bboxOf(rings);
    // An object is up to two items: its fill, and its outline (which has its own colour).
    if ((fill.type || "auto") !== "none") {
      const color = parseColor(fill.color);
      items.push({ obj, objIndex, part: "fill", rings, box, color, colorKey: `${color.r},${color.g},${color.b}` });
    }
    if (stroke) {
      const color = parseColor(stroke.color || fill.color);
      const pad = stroke.type === "satin" ? strokeSettings(stroke).width : 0.5;
      items.push({ obj, objIndex, part: "stroke", rings, box: [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad], color, colorKey: `${color.r},${color.g},${color.b}` });
    }
  });
  const guess = estimateStitches(items, S);
  if (guess > S.maxStitches) {
    const millions = (guess / 1e6).toFixed(guess > 1e7 ? 0 : 1);
    throw new Error(`This design would need about ${millions} million stitches, far more than a machine can sew. Make the shapes smaller or open up the stitching (a bigger row spacing).`);
  }
  const order = scheduleOrder(items, S.optimizeColors);
  const plan = createPlan(S);
  let needle = null;
  let runCount = 0;
  for (const idx of order) {
    const item = items[idx];
    const runs = objectRuns(item, needle, S, warn, info);
    for (const r of runs) {
      plan.colour(r.color);
      plan.run(r.pts, { join: r.join, connectMax: r.connectMax });
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

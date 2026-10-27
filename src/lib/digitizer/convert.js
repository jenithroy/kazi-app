/**
 * From what the tracer found in a picture to the Digitizer's objects: one object per shape, coloured, named, in sewing order
 * (the tracer's order: big areas first, details last), placed where the picture is.
 */
import { makeObject } from "./model.js";
import { nearestThread, rgbToHex, threadName, toLab, hexToRgb } from "../embroidery/thread/chart.js";
import { offsetRings, intersectRings, unionShapes } from "../embroidery/geometry/clip.js";
import { bboxOf } from "../embroidery/geometry/poly.js";

/** How near (CIELAB distance) a picture colour must be to the cloth to count as "the cloth" and not be stitched. */
export const CLOTH_MATCH = 14;

/**
 * What the picture is turned into shapes with, unless the person changes it. Up to 12 colours is the number of needles a
 * machine head has; "Auto" uses only as many as the picture needs. Colours are kept as the picture has them (the nearest
 * thread is only a name on the sheet), the kind of picture (logo, artwork, photo) is found by looking at it, and thin
 * lines and lettering are kept and widened to something a needle can follow.
 */
export const CONVERT_DEFAULTS = { colors: "auto", maxColors: 12, detail: 0.5, background: "auto", snap: false, kind: "auto" };

/** The detail slider (0 simple ... 1 detailed) as the tracer's size limits. */
export function detailLimits(detail) {
  const d = Math.max(0, Math.min(1, detail));
  return { minFeatureMm: 1.3 - 1.0 * d, minAreaMm2: 2.2 - 1.9 * d, simplifyMm: 0.08 - 0.05 * d };
}

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
    ...detailLimits(s.detail),
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
    const later = near.length === 1 ? near[0] : unionShapes(near);
    const extra = intersectRings(offsetRings(list[i], bleed), later);
    if (extra.length) out[i] = unionShapes([list[i], extra]);
  }
  return out;
}

/**
 * @param {object} traced  the tracer's result (palette, shapes, order)
 * @param {object} o  originX, originY (hoop mm of the traced image's top-left corner), mmPerPx (mm per traced-image pixel),
 *   skip (Set of palette indexes the person turned off), include (Set of indexes turned ON although they match the cloth),
 *   fabric (the cloth's colour as hex: a picture colour close to it is the cloth showing through, so it is not stitched),
 *   snap (move each colour to the nearest thread of the chart)
 * @returns {{ objects: object[], palette: {index, hex, name, fraction, background, enclosed, skipped, sameAsCloth}[], rank: Map }}
 *   `enclosed` marks the page colour that sits inside the design (white letters in a navy disc, the hole of an O): it is its own entry.
 *   Every object carries `pal`, the palette entry it was made for, and `rank` says where each entry comes in the sewing order.
 */
export function objectsFromTrace(traced, { originX, originY, mmPerPx, skip = new Set(), include = new Set(), fabric = null, snap = false, bleed = 0.4, before = null }) {
  const cloth = fabric ? toLab(...Object.values(hexToRgb(fabric))) : null;
  const palette = traced.palette.map((p, index) => {
    const hex = snap ? nearestThread(p.r, p.g, p.b).hex : rgbToHex(p.r, p.g, p.b);
    const lab = toLab(p.r, p.g, p.b);
    const sameAsCloth = !p.background && !!cloth && Math.hypot(lab[0] - cloth[0], lab[1] - cloth[1], lab[2] - cloth[2]) <= CLOTH_MATCH;
    const skipped = !!p.background || skip.has(index) || (sameAsCloth && !include.has(index));
    return { index, hex, name: threadName(hex), fraction: p.fraction ?? 0, background: !!p.background, enclosed: !!p.enclosedBackground, skipped, sameAsCloth };
  });
  const rank = new Map((traced.order || traced.palette.map((_, i) => i)).map((c, i) => [c, i]));
  const shapes = traced.shapes
    .filter((s) => !palette[s.color].skipped)
    .slice()
    .sort((a, b) => (rank.get(a.color) ?? 0) - (rank.get(b.color) ?? 0) || b.area - a.area);
  const counters = new Map();
  // each shape reaches a little under the ones sewn after it (they are all one picture: no bare cloth between two colours).
  // `before` is the palette as it was: when only some colours were turned on or off, only their shapes go into the design
  // (see mergeTraceObjects), so the overlap is worked out for those alone.
  let only = null;
  if (before && before.length === palette.length) {
    const changed = new Set();
    palette.forEach((p, i) => { if (!!p.skipped !== !!before[i].skipped) changed.add(i); });
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
  return { objects, palette, rank };
}

/**
 * Where the stitched part of a traced picture lies, in the hoop's millimetres: { x0, y0, x1, y1 }. Only the shapes that would be
 * stitched count (not the background, nor colours like the cloth). Null when there is nothing to stitch.
 */
export function contentBox(traced, { originX, originY, mmPerPx, fabric = null }) {
  const cloth = fabric ? toLab(...Object.values(hexToRgb(fabric))) : null;
  const counts = traced.palette.map((p) => {
    if (p.background) return false;
    if (!cloth) return true;
    const lab = toLab(p.r, p.g, p.b);
    return Math.hypot(lab[0] - cloth[0], lab[1] - cloth[1], lab[2] - cloth[2]) > CLOTH_MATCH;
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
    return [...rest.slice(0, place), ...made, ...rest.slice(place)];
  }
  const changed = new Set();
  after.forEach((p, i) => { if (!!p.skipped !== !!before[i].skipped) changed.add(i); });
  if (!changed.size) return current;
  let list = current.filter((o) => !(isPic(o) && changed.has(o.pal)));
  const rankOf = (i) => (i == null ? Infinity : rank.get(i) ?? Infinity);
  const coming = [...changed].filter((i) => !after[i].skipped).sort((a, b) => rankOf(a) - rankOf(b));
  for (const i of coming) {
    const mine = made.filter((o) => o.pal === i);
    if (!mine.length) continue;
    let at = list.findIndex((o) => isPic(o) && rankOf(o.pal) > rankOf(i)); // before the first picture shape that is sewn later
    if (at < 0) {
      let last = -1;
      list.forEach((o, k) => { if (isPic(o)) last = k; });
      at = last < 0 ? list.length : last + 1;
    }
    list = [...list.slice(0, at), ...mine, ...list.slice(at)];
  }
  return list;
}

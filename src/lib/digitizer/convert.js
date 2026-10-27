/**
 * From what the tracer found in a picture to the Digitizer's objects: one object per shape, coloured, named, in sewing order
 * (the tracer's order: big areas first, details last), placed where the picture is.
 */
import { makeObject } from "./model.js";
import { nearestThread, rgbToHex, threadName, toLab, hexToRgb } from "../embroidery/thread/chart.js";

/** How near (CIELAB distance) a picture colour must be to the cloth to count as "the cloth" and not be stitched. */
export const CLOTH_MATCH = 14;

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
export function objectsFromTrace(traced, { originX, originY, mmPerPx, skip = new Set(), include = new Set(), fabric = null, snap = false }) {
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
  const objects = shapes.map((s) => {
    const n = (counters.get(s.color) || 0) + 1;
    counters.set(s.color, n);
    const rings = s.contours.map((c) => c.map((p) => [originX + p[0] * mmPerPx, originY + p[1] * mmPerPx]));
    return {
      ...makeObject({
        name: `${palette[s.color].name} ${n}`,
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

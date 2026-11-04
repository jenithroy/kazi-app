/**
 * Regions: a map of what each pixel of a picture is (the page finds it with a person segmenter, see src/lib/digitizer/segment.js), so a portrait
 * can be split into layers before it is traced. Pure functions on typed arrays: no DOM, they run in the worker and under node.
 *
 * A region map is `{ width, height, data }`, `data` a Uint8Array of one class per pixel:
 *   0 background  1 hair  2 body skin  3 face skin  4 clothes  5 other (glasses, a hat, a hand-held thing)
 * It need not be as big as the picture: it is read at the nearest pixel.
 *
 * What the tracer does with it:
 *   cut-out    the background (class 0) is made see-through, so it is left out like the transparent part of a logo: no colour of its own,
 *              nothing sewn on it, the garment shows, and nothing in it competes for the picture's few colours (a grey wall, a flag);
 *   importance every other class pulls on the palette by its weight, so the face gets more of the colours than the clothes (`importanceMap`).
 */

export const REGION = Object.freeze({ BACKGROUND: 0, HAIR: 1, BODY_SKIN: 2, FACE_SKIN: 3, CLOTHES: 4, OTHER: 5 });

/**
 * How hard each class pulls on the palette (by class number). The face is what a viewer reads first, then the hair; clothes are big and
 * plain and need few colours. 0 for the background: it is not in the palette at all.
 */
export const DEFAULT_REGION_WEIGHTS = Object.freeze([0, 1.6, 1.3, 2.4, 1, 0.8]);

/** A picture is cut out only when this share of it is person: a map that finds a few stray pixels in a flower is no portrait. */
export const MIN_PERSON_SHARE = 0.02;

/** Is this a usable region map? */
export function validRegions(r) {
  return !!r && Number.isFinite(r.width) && Number.isFinite(r.height) && r.width >= 1 && r.height >= 1 && !!r.data && r.data.length >= r.width * r.height;
}

/** The class of each pixel of a `w` x `h` grid that lies over the same picture as the map (nearest pixel). The map's own array when the sizes agree. */
export function resampleClasses(regions, w, h) {
  if (regions.width === w && regions.height === h) return regions.data;
  const out = new Uint8Array(w * h);
  const sx = regions.width / w, sy = regions.height / h;
  for (let y = 0; y < h; y++) {
    const ry = Math.min(regions.height - 1, Math.floor((y + 0.5) * sy)) * regions.width;
    for (let x = 0; x < w; x++) out[y * w + x] = regions.data[ry + Math.min(regions.width - 1, Math.floor((x + 0.5) * sx))];
  }
  return out;
}

/**
 * The picture with its background made see-through (alpha 0), and the classes on its pixel grid.
 * Returns null when there is no person to cut out (under MIN_PERSON_SHARE of the picture), so the picture is traced as it is.
 * @param {{ width, height, data }} image  RGBA
 * @param {{ width, height, data }} regions
 * @returns {null | { image: { width, height, data }, classes: Uint8Array, share: number }}
 */
export function cutOutPerson(image, regions, minShare = MIN_PERSON_SHARE) {
  if (!validRegions(regions)) return null;
  const W = image.width, H = image.height, n = W * H;
  const classes = resampleClasses(regions, W, H);
  let person = 0;
  for (let i = 0; i < n; i++) if (classes[i] !== REGION.BACKGROUND) person++;
  if (person < minShare * n) return null;
  const data = new Uint8ClampedArray(image.data.length);
  data.set(image.data);
  for (let i = 0; i < n; i++) if (classes[i] === REGION.BACKGROUND) data[i * 4 + 3] = 0;
  return { image: { width: W, height: H, data }, classes, share: person / n };
}

/** One weight per pixel from the classes (a Float32Array), `weights` by class number. */
export function importanceMap(classes, weights = DEFAULT_REGION_WEIGHTS) {
  const out = new Float32Array(classes.length);
  for (let i = 0; i < classes.length; i++) {
    const w = weights[classes[i]];
    out[i] = Number.isFinite(w) ? w : 1;
  }
  return out;
}

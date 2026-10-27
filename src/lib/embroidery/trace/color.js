/**
 * Colour helpers for the tracer: sRGB <-> CIELAB (D65), colour distance, and a few small numeric helpers.
 * Everything here is plain numbers (no DOM), so it runs in a Web Worker and under node.
 */

/** sRGB byte (0..255) to linear light (0..1), one table lookup. */
const SRGB_TO_LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const XN = 0.95047;
const YN = 1;
const ZN = 1.08883;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

const labF = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

/** Convert one sRGB colour (0..255 each) to CIELAB and write it into `out` at `o`, `o + 1`, `o + 2`. */
export function rgbToLab(r, g, b, out, o = 0) {
  const lr = SRGB_TO_LINEAR[r < 0 ? 0 : r > 255 ? 255 : Math.round(r)];
  const lg = SRGB_TO_LINEAR[g < 0 ? 0 : g > 255 ? 255 : Math.round(g)];
  const lb = SRGB_TO_LINEAR[b < 0 ? 0 : b > 255 ? 255 : Math.round(b)];
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / XN;
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) / YN;
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / ZN;
  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);
  out[o] = 116 * fy - 16;
  out[o + 1] = 500 * (fx - fy);
  out[o + 2] = 200 * (fy - fz);
}

/** Same, for float sRGB values that are not whole bytes (cluster means). */
export function rgbFloatToLab(r, g, b, out, o = 0) {
  const lin = (v) => {
    const c = (v < 0 ? 0 : v > 255 ? 255 : v) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lr = lin(r);
  const lg = lin(g);
  const lb = lin(b);
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / XN;
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) / YN;
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / ZN;
  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);
  out[o] = 116 * fy - 16;
  out[o + 1] = 500 * (fx - fy);
  out[o + 2] = 200 * (fy - fz);
}

/** Straight (CIE76) colour distance between two Lab colours stored in arrays. */
export function labDist(a, ia, b, ib) {
  const dl = a[ia] - b[ib];
  const da = a[ia + 1] - b[ib + 1];
  const db = a[ia + 2] - b[ib + 2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

/** "#rrggbb" for bytes. */
export function toHex(r, g, b) {
  const h = (v) => (v < 16 ? "0" : "") + v.toString(16);
  return "#" + h(r) + h(g) + h(b);
}

/** Small deterministic random generator (mulberry32): same seed, same numbers, in any JS engine. */
export function makeRng(seed) {
  let a = (seed | 0) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Milliseconds clock that works in a page, a worker and node. */
export const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

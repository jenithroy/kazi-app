/**
 * A thin frame round a picture. A catalogue or chart picture often comes with a one to three pixel line round its edge (a stitch chart's border, a
 * screenshot's outline). To the tracer it is the one colour that touches the whole border of the picture, so it was taken for the BACKGROUND: the page
 * made the cloth black (a "dark background means the picture was made for that garment") and every black line, whisker and pupil in the picture was left
 * unsewn as "like the cloth", while the white paper inside the frame was sewn as a shape.
 *
 * `removeFrame` finds such a frame and paints it over with the colour just inside it (the picture keeps its size and every pixel its place), so the paper
 * inside is the border colour as it should be. It is careful: the outer ring must be ONE colour all the way round, thin (at most 1.6 % of the shorter
 * side, 10 pixels), and the band just inside it must be a plain margin of a clearly different lightness. A design that simply reaches the edge of its
 * picture (a badge, a dark photograph) has no plain margin inside its outermost pixels, so it is left alone.
 */

const MAX_SHARE = 0.016; // the thickest a frame is taken to be, as a share of the shorter side
const MAX_PX = 10;
const SAME = 48; // a pixel is the frame's colour when no channel is further than this from it (JPEG noise)
const MARGIN_SAME = 40;
const MARGIN_SHARE = 0.75; // this much of the band inside the frame must be one plain colour
const LIGHTNESS_GAP = 70; // and its lightness (0..255) must differ from the frame's by at least this

/** The pixel indexes (of RGBA) of ring `r` (0 = the outermost row and column), as a flat list. */
function ringIndexes(w, h, r) {
  const out = [];
  const x0 = r, x1 = w - 1 - r, y0 = r, y1 = h - 1 - r;
  if (x1 <= x0 || y1 <= y0) return out;
  for (let x = x0; x <= x1; x++) { out.push(y0 * w + x); out.push(y1 * w + x); }
  for (let y = y0 + 1; y < y1; y++) { out.push(y * w + x0); out.push(y * w + x1); }
  return out;
}

const median = (arr) => { const s = Array.from(arr).sort((a, b) => a - b); return s[s.length >> 1]; };

/** The median colour [r, g, b] of a list of pixel indexes. */
function medianColour(data, idx) {
  const r = new Uint8Array(idx.length), g = new Uint8Array(idx.length), b = new Uint8Array(idx.length);
  for (let i = 0; i < idx.length; i++) { const p = idx[i] * 4; r[i] = data[p]; g[i] = data[p + 1]; b[i] = data[p + 2]; }
  return [median(r), median(g), median(b)];
}

/** The share of the pixels of `idx` that are within `tol` (every channel) of `c`. */
function shareNear(data, idx, c, tol) {
  if (!idx.length) return 0;
  let n = 0;
  for (const i of idx) {
    const p = i * 4;
    if (Math.abs(data[p] - c[0]) <= tol && Math.abs(data[p + 1] - c[1]) <= tol && Math.abs(data[p + 2] - c[2]) <= tol) n++;
  }
  return n / idx.length;
}

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} image  RGBA
 * @returns {null | { image: { width, height, data }, px: number, colour: number[] }}  a copy with the frame painted over, and how thick it was; null when there is none
 */
export function removeFrame(image) {
  const w = image.width, h = image.height, data = image.data;
  const short = Math.min(w, h);
  if (short < 64) return null;
  const maxT = Math.max(1, Math.min(MAX_PX, Math.round(short * MAX_SHARE)));
  const ring0 = ringIndexes(w, h, 0);
  // a picture with see-through edges has no frame to remove
  let clear = 0;
  for (const i of ring0) if (data[i * 4 + 3] < 250) clear++;
  if (clear > ring0.length * 0.05) return null;
  const F = medianColour(data, ring0);
  if (shareNear(data, ring0, F, SAME) < 0.9) return null;
  // how many rings in a row are the frame's colour
  let t = 1;
  while (t <= maxT) {
    const idx = ringIndexes(w, h, t);
    if (!idx.length || shareNear(data, idx, F, SAME) < 0.9) break;
    t++;
  }
  if (t > maxT) return null; // a solid border thicker than a frame (a dark background, a letterbox): not ours to take off
  // the band just inside must be a plain margin of another lightness
  const m = Math.max(3, Math.round(short * 0.02));
  const band = [];
  for (let r = t; r < t + m; r++) for (const i of ringIndexes(w, h, r)) band.push(i);
  if (!band.length) return null;
  const M = medianColour(data, band);
  if (shareNear(data, band, M, MARGIN_SAME) < MARGIN_SHARE) return null;
  if (Math.abs(lum(F) - lum(M)) < LIGHTNESS_GAP) return null;
  // paint it over with what is just inside (the nearest pixel one ring further in than the frame: JPEG leaves a faint shadow on the first ring inside it)
  const pad = t + 1;
  const out = new Uint8ClampedArray(data);
  for (let y = 0; y < h; y++) {
    const inside = y >= pad && y < h - pad;
    for (let x = 0; x < w; x++) {
      if (inside && x >= pad && x < w - pad) continue;
      const sx = Math.min(w - 1 - pad, Math.max(pad, x)), sy = Math.min(h - 1 - pad, Math.max(pad, y));
      const p = (y * w + x) * 4, q = (sy * w + sx) * 4;
      out[p] = data[q]; out[p + 1] = data[q + 1]; out[p + 2] = data[q + 2]; out[p + 3] = data[q + 3];
    }
  }
  return { image: { width: w, height: h, data: out }, px: t, colour: F };
}

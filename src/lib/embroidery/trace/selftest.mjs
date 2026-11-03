/**
 * Self test of the tracer. Plain node, no browser, no files: every picture is drawn in code.
 *
 *   node src/lib/embroidery/trace/selftest.mjs            checks + the numbers
 *   node src/lib/embroidery/trace/selftest.mjs --perf     also times a 1500 x 1500 logo and a 4000 x 4000 photo-like picture
 *
 * Exit code 0 when every check passes, 1 otherwise.
 */
import { traceImage, renderTrace, quantize, detectBackground } from "./index.js";
import { detailLimits, limitsFor } from "./detail.js";
import { contentBox, fillScale, objectsFromTrace, mergeTraceObjects, changedColours, bleedUnder, CLOTH_FINE_MM, CLOTH_FIELD_MM } from "../../digitizer/convert.js";
import { serializeDesign, parseDesign, engineDesign, newDesign, breakApart, hitObject, objectBox } from "../../digitizer/model.js";
import { generate } from "../stitch/engine.js";
import { unionShapes, intersectRings, offsetRings } from "../geometry/clip.js";
import { bboxOf, islandsOf, ringArea } from "../geometry/poly.js";

// ---------------------------------------------------------------- tiny drawing kit (exact anti-aliasing)

function makeImage(w, h, bg = [255, 255, 255]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = bg[0]; data[i * 4 + 1] = bg[1]; data[i * 4 + 2] = bg[2]; data[i * 4 + 3] = 255; }
  return { width: w, height: h, data };
}

/** Paint closed contours (even-odd, so a second contour inside the first is a hole) with exact pixel coverage (8 x 8 samples). */
function paint(img, contours, color, ss = 8) {
  const { width: w, height: h, data } = img;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of contours) for (const p of c) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const ix0 = Math.max(0, Math.floor(x0)), ix1 = Math.min(w - 1, Math.ceil(x1));
  const iy0 = Math.max(0, Math.floor(y0)), iy1 = Math.min(h - 1, Math.ceil(y1));
  for (let y = iy0; y <= iy1; y++) {
    const cover = new Float64Array(ix1 - ix0 + 1);
    for (let sy = 0; sy < ss; sy++) {
      const yy = y + (sy + 0.5) / ss;
      const xs = [];
      for (const c of contours) {
        for (let i = 0; i < c.length; i++) {
          const a = c[i], b = c[(i + 1) % c.length];
          if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) xs.push(a[0] + ((yy - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(ix0, Math.floor(xs[k])); x <= Math.min(ix1, Math.ceil(xs[k + 1]) - 1); x++) {
          const l = Math.max(xs[k], x), r = Math.min(xs[k + 1], x + 1);
          if (r > l) cover[x - ix0] += (r - l) / ss;
        }
      }
    }
    for (let x = ix0; x <= ix1; x++) {
      const a = Math.min(1, cover[x - ix0]);
      if (a <= 0) continue;
      const o = (y * w + x) * 4;
      data[o] = data[o] * (1 - a) + color[0] * a;
      data[o + 1] = data[o + 1] * (1 - a) + color[1] * a;
      data[o + 2] = data[o + 2] * (1 - a) + color[2] * a;
    }
  }
}

const circle = (cx, cy, r, n = 720) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)]);
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** Deterministic Gaussian + 8 x 8 block noise: what a JPEG at quality 60 does to flat colour, roughly. */
function addNoise(img, sigma, blockSigma, seed = 5) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const { width: w, height: h, data } = img;
  const bw = Math.ceil(w / 8), bh = Math.ceil(h / 8);
  const bn = new Float64Array(bw * bh * 3);
  for (let i = 0; i < bn.length; i++) bn[i] = gauss() * blockSigma;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    const b = ((y >> 3) * bw + (x >> 3)) * 3;
    for (let c = 0; c < 3; c++) data[o + c] += gauss() * sigma + bn[b + c];
  }
  return img;
}

// block letters drawn from polygons (each is a list of contours; a second contour is a hole)
const letterK = (x, y, s) => [[[x, y], [x + 0.28 * s, y], [x + 0.28 * s, y + 0.42 * s], [x + 0.62 * s, y], [x + 0.98 * s, y], [x + 0.56 * s, y + 0.5 * s], [x + 1.0 * s, y + s], [x + 0.62 * s, y + s], [x + 0.28 * s, y + 0.58 * s], [x + 0.28 * s, y + s], [x, y + s]]];
const letterA = (x, y, s) => [[[x + 0.5 * s, y], [x + 0.78 * s, y], [x + 1.12 * s, y + s], [x + 0.84 * s, y + s], [x + 0.77 * s, y + 0.78 * s], [x + 0.35 * s, y + 0.78 * s], [x + 0.28 * s, y + s], [x, y + s]], [[x + 0.43 * s, y + 0.56 * s], [x + 0.69 * s, y + 0.56 * s], [x + 0.56 * s, y + 0.2 * s]]];
const letterZ = (x, y, s) => [[[x, y], [x + 0.95 * s, y], [x + 0.95 * s, y + 0.2 * s], [x + 0.32 * s, y + 0.8 * s], [x + 0.95 * s, y + 0.8 * s], [x + 0.95 * s, y + s], [x, y + s], [x, y + 0.8 * s], [x + 0.63 * s, y + 0.2 * s], [x, y + 0.2 * s]]];
const letterI = (x, y, s) => [rect(x, y, 0.28 * s, s)];

// ---------------------------------------------------------------- checks

let failures = 0;
let checks = 0;
const log = (...a) => console.log(...a);
function check(name, ok, detail = "") {
  checks++;
  if (!ok) failures++;
  log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? "  (" + detail + ")" : ""}`);
}

const area = (c) => { let s = 0; for (let i = 0; i < c.length; i++) { const p = c[i], q = c[(i + 1) % c.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };

function segCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return ((o1 > 1e-9 && o2 < -1e-9) || (o1 < -1e-9 && o2 > 1e-9)) && ((o3 > 1e-9 && o4 < -1e-9) || (o3 < -1e-9 && o4 > 1e-9));
}
const selfCrossings = (c) => {
  let n = 0;
  for (let i = 0; i < c.length; i++) for (let j = i + 2; j < c.length; j++) {
    if (i === 0 && j === c.length - 1) continue;
    if (segCross(c[i], c[(i + 1) % c.length], c[j], c[(j + 1) % c.length])) n++;
  }
  return n;
};
function inside(p, c) {
  let r = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const a = c[i], b = c[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) r = !r;
  }
  return r;
}
const insideShape = (p, s) => inside(p, s.contours[0]) && !s.contours.slice(1).some((h) => inside(p, h));

/** Winding, bounds, no repeated points, no self-crossing, holes inside outers, palette indices, no background shape. */
function structure(name, res) {
  let bad = [];
  for (const s of res.shapes) {
    if (!res.palette[s.color]) bad.push(`shape ${s.id}: no palette entry`);
    else if (res.palette[s.color].background) bad.push(`shape ${s.id}: sits on a background colour`);
    s.contours.forEach((c, ci) => {
      if (c.length < 3) bad.push(`shape ${s.id}/${ci}: ${c.length} points`);
      const a = area(c);
      if (Math.abs(a) < 0.01) bad.push(`shape ${s.id}/${ci}: area ~0`);
      if (ci === 0 && !(a > 0)) bad.push(`shape ${s.id}: outer contour not clockwise`);
      if (ci > 0 && !(a < 0)) bad.push(`shape ${s.id}: hole not counter-clockwise`);
      for (let i = 0; i < c.length; i++) {
        const p = c[i], q = c[(i + 1) % c.length];
        if (!(p[0] >= 0 && p[0] <= res.width && p[1] >= 0 && p[1] <= res.height)) bad.push(`shape ${s.id}: point outside the picture`);
        if (p[0] === q[0] && p[1] === q[1]) bad.push(`shape ${s.id}: repeated point`);
      }
      if (selfCrossings(c)) bad.push(`shape ${s.id}/${ci}: crosses itself`);
      if (ci > 0 && !inside(c[0], s.contours[0])) bad.push(`shape ${s.id}: hole outside its outer contour`);
    });
  }
  check(`${name}: structure (winding, bounds, simple contours, holes inside)`, bad.length === 0, bad.slice(0, 2).join("; "));
}

/** How many pixels (at 2x) are claimed by two different shapes. */
function overlap(res) {
  const k = 2, W = res.width * k, H = res.height * k;
  const owner = new Int32Array(W * H).fill(-1);
  let n = 0;
  for (const s of res.shapes) {
    const edges = [];
    for (const c of s.contours) for (let i = 0; i < c.length; i++) { const a = c[i], b = c[(i + 1) % c.length]; edges.push([a[0] * k, a[1] * k, b[0] * k, b[1] * k]); }
    for (let y = 0; y < H; y++) {
      const yc = y + 0.5, xs = [];
      for (const e of edges) if ((e[1] <= yc && e[3] > yc) || (e[3] <= yc && e[1] > yc)) xs.push(e[0] + ((yc - e[1]) * (e[2] - e[0])) / (e[3] - e[1]));
      xs.sort((p, q) => p - q);
      for (let j = 0; j + 1 < xs.length; j += 2) for (let x = Math.max(0, Math.ceil(xs[j] - 0.5)); x <= Math.min(W - 1, Math.ceil(xs[j + 1] - 0.5) - 1); x++) {
        const o = y * W + x;
        if (owner[o] >= 0 && owner[o] !== s.id) n++;
        owner[o] = s.id;
      }
    }
  }
  return n;
}

const holes = (res, colorTest) => res.shapes.filter((s) => colorTest(res.palette[s.color])).reduce((a, s) => a + s.contours.length - 1, 0);
const nonBg = (res) => res.palette.filter((p) => !p.background);
const isWhite = (p) => p.r > 240 && p.g > 240 && p.b > 240;

/**
 * Share of the picture covered by shapes, and how well the render agrees with the source away from edges.
 * The truth: a pixel is "page" when it has the background colour and is connected to the picture edge through such
 * pixels; everything else (including page-coloured pixels that other colours enclose) is to be sewn.
 */
function coverage(img, res) {
  const r = renderTrace(res, 1);
  const w = img.width, h = img.height, n = w * h;
  const bg = res.palette.find((p) => p.background);
  const same = (i) => bg && img.data[i * 4 + 3] > 100 && Math.abs(img.data[i * 4] - bg.r) + Math.abs(img.data[i * 4 + 1] - bg.g) + Math.abs(img.data[i * 4 + 2] - bg.b) < 60;
  const page = new Uint8Array(n);
  const stack = [];
  const push = (i) => { if (!page[i] && (img.data[i * 4 + 3] < 100 || same(i))) { page[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < n - w) push(i + w);
  }
  let painted = 0, ink = 0, agree = 0, compared = 0;
  for (let i = 0; i < n; i++) {
    const p = r.data[i * 4 + 3] > 0;
    if (p) painted++;
    if (!page[i]) ink++;
    const x = i % w, y = (i - x) / w;
    if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) continue;
    let flat = true;
    for (const d of [-2, -1, 1, 2]) if (page[i + d] !== page[i] || page[i + d * w] !== page[i]) flat = false;
    if (!flat) continue;
    compared++;
    if (p === !page[i]) agree++;
  }
  return { painted: painted / n, ink: ink / n, agreement: compared ? agree / compared : 1 };
}

function iou(a, b) {
  let both = 0, either = 0;
  for (let i = 0; i < a.width * a.height; i++) {
    const pa = a.data[i * 4 + 3] > 0, pb = b.data[i * 4 + 3] > 0;
    if (pa || pb) either++;
    if (pa && pb) both++;
  }
  return either ? both / either : 1;
}

// ---------------------------------------------------------------- the pictures

const NAVY = [20, 40, 110], BLACK = [0, 0, 0], RED = [200, 30, 40], WHITE = [255, 255, 255];
const numbers = [];

log("1. two-colour logo: black ring and black square on white");
{
  const img = makeImage(300, 160);
  paint(img, [circle(90.4, 80.6, 60, 720), circle(90.4, 80.6, 34, 720)], BLACK);
  paint(img, [rect(180.3, 40.7, 90.2, 80.4)], BLACK);
  const res = traceImage(img);
  structure("two-colour", res);
  const cov = coverage(img, res);
  const ink = nonBg(res);
  log(`     palette ${res.palette.length} entries (${ink.length} to sew), shapes ${res.shapes.length}, holes ${holes(res, () => true)}, shapes cover ${(cov.painted * 100).toFixed(1)} % of the picture (source ink ${(cov.ink * 100).toFixed(1)} %), agreement away from edges ${(cov.agreement * 100).toFixed(2)} %`);
  numbers.push(["two-colour logo", res.palette.length, res.shapes.length, cov.painted, cov.agreement]);
  check("one background entry (white) and the black", res.palette.filter((p) => p.background).length === 1 && res.palette.some((p) => !p.background && p.r < 10));
  const black = res.shapes.filter((s) => res.palette[s.color].r < 10);
  check("black: the ring (1 hole) and the square (no hole)", black.length === 2 && black.filter((s) => s.contours.length === 2).length === 1);
  const enclosed = res.shapes.filter((s) => res.palette[s.color].enclosedBackground);
  check("the white inside the ring comes back as a shape of the enclosed-white entry, the page does not", enclosed.length === 1 && !res.shapes.some((s) => insideShape([1, 1], s)), `${enclosed.length} enclosed shape(s)`);
  check("enclosed entry has the colour of the background entry", (() => { const b = res.palette.find((p) => p.background); const e = res.palette.find((p) => p.enclosedBackground); return b && e && b.r === e.r && b.g === e.g && b.b === e.b && e.background === false; })());
  check("no overlap between shapes", overlap(res) <= 2);
  check("shapes agree with the source away from edges (99 % or more)", cov.agreement >= 0.99);
  // geometry: roundness of the ring and the corners of the square
  const ringOuter = black.find((s) => s.contours.length === 2).contours[0];
  let dev = 0;
  for (let i = 0; i < ringOuter.length; i++) {
    const a = ringOuter[i], b = ringOuter[(i + 1) % ringOuter.length];
    for (let k = 0; k < 6; k++) dev = Math.max(dev, Math.abs(Math.hypot(a[0] + ((b[0] - a[0]) * k) / 6 - 90.4, a[1] + ((b[1] - a[1]) * k) / 6 - 80.6) - 60));
  }
  check("ring: outer edge within 0.15 px of the true circle", dev < 0.15, `max ${dev.toFixed(3)} px, ${ringOuter.length} points`);
  check("ring: sane number of points (40 to 200)", ringOuter.length >= 40 && ringOuter.length <= 200);
  const sq = black.find((s) => s.contours.length === 1).contours[0];
  const truth = [[180.3, 40.7], [270.5, 40.7], [270.5, 121.1], [180.3, 121.1]];
  const cornerErr = Math.max(...truth.map((t) => Math.min(...sq.map((p) => Math.hypot(p[0] - t[0], p[1] - t[1])))));
  check("square: 4 points, every corner within 0.5 px", sq.length === 4 && cornerErr < 0.5, `${sq.length} points, worst corner ${cornerErr.toFixed(3)} px`);
}

log("2. logo with text: K A Z I in black on white");
let textImg, textRes;
{
  const img = makeImage(300, 110);
  const s = 70;
  for (const [f, x] of [[letterK, 12.3], [letterA, 85.6], [letterZ, 165.2], [letterI, 242.4]]) for (const part of [f(x, 20.6, s)]) paint(img, part, BLACK);
  textImg = img;
  const res = traceImage(img);
  textRes = res;
  structure("text", res);
  const cov = coverage(img, res);
  const blackShapes = res.shapes.filter((q) => res.palette[q.color].r < 10);
  log(`     palette ${res.palette.length} entries (${nonBg(res).length} to sew), shapes ${res.shapes.length} (${blackShapes.length} black), holes ${holes(res, (p) => p.r < 10)}, shapes cover ${(cov.painted * 100).toFixed(1)} % of the picture (source ink ${(cov.ink * 100).toFixed(1)} %), agreement away from edges ${(cov.agreement * 100).toFixed(2)} %, ${res.stats.vertices} points`);
  numbers.push(["logo with text", res.palette.length, res.shapes.length, cov.painted, cov.agreement]);
  check("four black letters, only the A has a hole", blackShapes.length === 4 && holes(res, (p) => p.r < 10) === 1);
  check("the counter of the A is the only enclosed white shape", res.shapes.filter((q) => res.palette[q.color].enclosedBackground).length === 1);
  check("few points (straight sides stay straight): under 80 points for the whole word", res.stats.vertices < 80, `${res.stats.vertices}`);
  check("no overlap between shapes", overlap(res) <= 2);
  check("shapes agree with the source away from edges (99 % or more)", cov.agreement >= 0.99);
  const kShape = blackShapes.find((q) => q.bbox[0] < 40);
  {
    // every corner of the true K has a traced point close to it (the two notches where the arms meet the stem are acute,
    // so their corner can be off by up to about a pixel; the other nine are within a quarter of a pixel)
    const truthK = letterK(12.3, 20.6, s)[0];
    const pts = kShape.contours[0];
    const dist = truthK.map((t) => Math.min(...pts.map((p) => Math.hypot(p[0] - t[0], p[1] - t[1]))));
    check("K: every corner of the true K has a traced point within 1 px (nine of eleven within 0.25 px), at most 14 points", dist.every((d) => d < 1) && dist.filter((d) => d < 0.25).length >= 9 && pts.length <= 14, dist.map((d) => d.toFixed(2)).join(" ") + ", " + pts.length + " points");
  }
}

log("3. the same logo as a JPEG-like picture (noise, blocks, soft edges)");
{
  const img = makeImage(300, 110);
  const s = 70;
  for (const [f, x] of [[letterK, 12.3], [letterA, 85.6], [letterZ, 165.2], [letterI, 242.4]]) paint(img, f(x, 20.6, s), BLACK);
  addNoise(img, 3, 2.5);
  const res = traceImage(img);
  structure("jpeg-like", res);
  const cov = coverage(img, res);
  log(`     palette ${res.palette.length} entries (${nonBg(res).length} to sew), shapes ${res.shapes.length}, shapes cover ${(cov.painted * 100).toFixed(1)} % of the picture, agreement away from edges ${(cov.agreement * 100).toFixed(2)} %, noise seen ${(res.stats.noise.fraction * 100).toFixed(0)} % of neighbour pairs`);
  numbers.push(["jpeg-like logo", res.palette.length, res.shapes.length, cov.painted, cov.agreement]);
  check("same palette size and shape count as the clean picture", res.palette.length === textRes.palette.length && res.shapes.length === textRes.shapes.length, `${res.palette.length}/${textRes.palette.length} colours, ${res.shapes.length}/${textRes.shapes.length} shapes`);
  const a = renderTrace(res, 1), b = renderTrace(textRes, 1);
  const overlapIoU = iou(a, b);
  check("overlap with the clean trace is 97 % or more", overlapIoU >= 0.97, `${(overlapIoU * 100).toFixed(2)} %`);
  check("no sliver or speck shapes (smallest shape at least 50 px^2)", Math.min(...res.shapes.map((q) => q.area)) >= 50, `smallest ${Math.min(...res.shapes.map((q) => q.area)).toFixed(0)} px^2`);
  check("no overlap between shapes", overlap(res) <= 2);
  check("no colour of its own for the soft edge (no grey in a black and white logo)", nonBg(res).filter((p) => p.r > 20 && p.r < 235).length === 0);
}

log("4. navy disc on a white page with WHITE letters inside the disc (the enclosed-white rule)");
{
  const img = makeImage(300, 300);
  paint(img, [circle(150.2, 149.8, 130, 720)], NAVY);
  paint(img, [circle(150.2, 149.8, 110, 720), circle(150.2, 149.8, 100, 720)], WHITE);
  for (const [f, x] of [[letterK, 78.4], [letterA, 138.3]]) paint(img, f(x, 120.5, 50), WHITE);
  const res = traceImage(img);
  structure("navy disc", res);
  const cov = coverage(img, res);
  const outerWhite = res.palette.filter((p) => p.background && isWhite(p));
  const enclosed = res.shapes.filter((s) => res.palette[s.color].enclosedBackground);
  log(`     palette ${res.palette.length} entries, shapes ${res.shapes.length}, enclosed white shapes ${enclosed.length}`);
  numbers.push(["navy disc, white letters", res.palette.length, res.shapes.length, cov.painted, cov.agreement]);
  check("the outer white page is background and is not a shape", outerWhite.length === 1 && !res.shapes.some((s) => insideShape([2, 2], s) || insideShape([297, 297], s)));
  check("the white ring and both letters come back as shapes of the enclosed-white entry", enclosed.length === 3, `${enclosed.length} shapes`);
  check("shape.color of those shapes points at an entry with background false", enclosed.every((s) => res.palette[s.color].background === false && isWhite(res.palette[s.color])));
  check("the navy disc is one shape, the white ring is not merged with the page", res.shapes.filter((s) => res.palette[s.color].b > 80 && res.palette[s.color].r < 40).length >= 1);
  check("shapes agree with the source away from edges (99 % or more)", cov.agreement >= 0.99, `${(cov.agreement * 100).toFixed(2)} %`);
}

log("5. transparent picture: a ring with a see-through hole, soft alpha edge");
{
  const img = makeImage(200, 200, [0, 0, 0]);
  for (let i = 0; i < 200 * 200; i++) img.data[i * 4 + 3] = 0;
  const cx = 100.3, cy = 99.7;
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    const cover = Math.max(0, Math.min(1, 80.5 - d)) * Math.max(0, Math.min(1, d - 39.5)); // ring 40..80, one pixel soft edges
    const o = (y * 200 + x) * 4;
    img.data[o] = 240; img.data[o + 1] = 130; img.data[o + 2] = 20;
    img.data[o + 3] = Math.round(255 * cover);
  }
  const res = traceImage(img);
  structure("transparent ring", res);
  log(`     palette ${res.palette.length} entries, shapes ${res.shapes.length}, holes ${holes(res, () => true)}, background ${res.stats.background}`);
  check("see-through pixels are the background entry", res.stats.background === "transparent" && res.palette.some((p) => p.background && p.transparent));
  check("one shape (the ring) with one hole; the see-through hole is not a shape", res.shapes.length === 1 && res.shapes[0].contours.length === 2);
  const o = res.shapes[0].contours[0];
  const devOuter = Math.max(...o.map((p) => Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - 80)));
  check("outer edge within 0.3 px of the true circle", devOuter < 0.3, `max ${devOuter.toFixed(3)} px`);
}

log("6. two touching regions share their boundary exactly");
{
  const img = makeImage(240, 140);
  paint(img, [rect(30.3, 30.2, 90, 80.6)], RED);
  paint(img, [rect(120.3, 30.2, 90, 80.6)], NAVY);
  const res = traceImage(img);
  structure("touching", res);
  const key = (p) => p[0].toFixed(9) + "," + p[1].toFixed(9);
  const edges = new Set();
  for (const s of res.shapes) for (const c of s.contours) for (let i = 0; i < c.length; i++) edges.add(key(c[i]) + ">" + key(c[(i + 1) % c.length]));
  let shared = 0;
  for (const e of edges) { const [a, b] = e.split(">"); if (edges.has(b + ">" + a)) shared++; }
  check("two shapes", res.shapes.length === 2);
  check("the line between them is made of identical points in both (traversed backwards)", shared >= 2, `${shared} shared edge(s)`);
  check("no overlap between shapes", overlap(res) <= 2);
}

log("7. options, previews, odd inputs");
{
  const img = makeImage(300, 160);
  paint(img, [circle(90.4, 80.6, 60, 360)], RED);
  paint(img, [circle(210.4, 80.6, 50, 360)], NAVY);
  const a = JSON.stringify(traceImage(img).shapes), b = JSON.stringify(traceImage(img).shapes);
  check("same input and options give identical shapes", a === b);
  const q = quantize(img);
  check("quantize gives palette, labels, width, height", q.palette.length >= 3 && q.labels instanceof Uint8Array && q.labels.length === q.width * q.height);
  const bgd = detectBackground(img);
  check("detectBackground finds the white page", bgd.type === "color" && bgd.color.every((v) => v > 250));
  const two = traceImage(img, { colors: 2 });
  check("colors: 2 keeps at most one colour besides the background", two.palette.filter((p) => !p.background && !p.enclosedBackground).length <= 1);
  const none = traceImage(img, { background: "none" });
  check('background: "none" stitches the page too', none.palette.every((p) => !p.background) && none.shapes.length >= 3);
  let ok = true;
  try {
    traceImage({ width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) });
    traceImage({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) });
    traceImage({ width: 40, height: 40, data: new Uint8ClampedArray(40 * 40 * 4) });
  } catch (e) { ok = false; }
  check("tiny, solid and fully transparent pictures do not throw", ok);
  let threw = false;
  try { traceImage({ width: 10, height: 10 }); } catch (e) { threw = e instanceof TypeError; }
  check("a picture without data is a TypeError", threw);
  const big = makeImage(2400, 1200);
  paint(big, [rect(600.2, 300.4, 1200.8, 600.6)], RED, 2);
  const rb = traceImage(big);
  const bb = rb.shapes.find((s) => !rb.palette[s.color].background).bbox;
  check("pictures over 1600 px are traced smaller but coordinates stay in the original grid", Math.abs(bb[0] - 600.2) < 1.5 && Math.abs(bb[2] - 1801) < 1.5 && Math.abs(bb[3] - 901) < 1.5, bb.map((v) => v.toFixed(1)).join(","));
}

log("8. thin lines and lettering are kept, widened, and keep their colour; kinds of picture; fitting to the hoop");
{
  // what the page asks for (convert.js traceOptions): 0.2 mm a pixel, details down to 0.8 mm
  const page = { mode: "logo", thicken: true, mmPerPx: 0.2, minFeatureMm: 0.8, minAreaMm2: 1.2, simplifyMm: 0.05 };

  // two hairlines 0.4 mm wide on white (4 px at 0.1 mm a pixel): thinner than a line of thread. They are made as wide as one (about
  // 0.6 mm), no wider (not a millimetre, as they once were): the stitch engine sews anything that thin as a single line of stitches.
  for (const [name, ink] of [["black", BLACK], ["red", RED]]) {
    const img = makeImage(400, 400);
    paint(img, [rect(80, 198, 240, 4)], ink);
    paint(img, [rect(198, 80, 4, 240)], ink);
    const res = traceImage(img, { ...page, mmPerPx: 0.1 });
    const sew = res.palette.find((p) => !p.background && !p.enclosedBackground);
    const area = res.shapes.reduce((s, q) => s + q.area, 0);
    check(`thin ${name} lines are kept as shapes`, res.shapes.length >= 1 && res.stats.widenedPixels > 0, `${res.shapes.length} shapes, ${res.stats.widenedPixels} px widened`);
    check(`thin ${name} hairlines are widened to about a line of thread, not a millimetre (source ink 1904 px^2; a millimetre wide would be 4760)`, area > 1904 * 1.2 && area < 1904 * 1.9, `${area.toFixed(0)} px^2`);
    const far = sew ? Math.abs(sew.r - ink[0]) + Math.abs(sew.g - ink[1]) + Math.abs(sew.b - ink[2]) : 999;
    check(`thin ${name} lines keep their own colour, not a washed-out mix with the page`, far < 100, sew ? `${sew.hex} for [${ink}]` : "no colour");
  }
  // lines 0.6 mm wide (3 px) are already as wide as a line of thread: they are left as they are, not made a millimetre wide
  {
    const img = makeImage(200, 200);
    paint(img, [rect(40.3, 99.4, 120, 3)], BLACK);
    paint(img, [rect(98.6, 40.2, 3, 120)], BLACK);
    const res = traceImage(img, page);
    const area = res.shapes.reduce((s, q) => s + q.area, 0);
    check("lines 0.6 mm wide are not made wider (source ink 720 px^2)", res.shapes.length >= 1 && area < 720 * 1.25, `${area.toFixed(0)} px^2`);
  }

  // thin white lettering inside a dark disc (a bar of white 3 px wide each): the letters are not filled in
  {
    const img = makeImage(240, 240);
    paint(img, [circle(120.2, 120.4, 100, 720)], NAVY);
    for (let i = 0; i < 5; i++) paint(img, [rect(78.3 + i * 20, 100.2, 3, 40)], WHITE);
    const res = traceImage(img, page);
    const bars = res.shapes.filter((s) => res.palette[s.color].enclosedBackground);
    check("five thin white bars inside a navy disc all come back as shapes", bars.length >= 5, `${bars.length}`);
  }

  // the shapes made from widened strokes are as clean as any others (no crossing contour, holes inside, winding right)
  {
    const img = makeImage(240, 160);
    paint(img, [rect(30.3, 40.2, 180, 3)], BLACK);
    paint(img, [rect(100.6, 20.4, 3, 120)], BLACK);
    paint(img, [circle(60.2, 100.4, 22, 360), circle(60.2, 100.4, 20, 360)], RED);
    structure("thin lines and a thin ring, widened", traceImage(img, page));
  }

  // a photograph's patches of colour are not strokes: turning the widening on does not turn them into slivers
  {
    const photo = makeImage(420, 300);
    let seed = 9;
    const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let y = 0; y < 300; y++) for (let x = 0; x < 420; x++) {
      const o = (y * 420 + x) * 4;
      const v = Math.sin(x * 0.045 + y * 0.03) * 55 + Math.sin(x * 0.09 - y * 0.05) * 30 + (rnd() - 0.5) * 10;
      photo.data[o] = 128 + v; photo.data[o + 1] = 120 + v * 0.7; photo.data[o + 2] = 110 - v * 0.5;
    }
    const opts = { mode: "photo", mmPerPx: 0.2, minFeatureMm: 0.8, minAreaMm2: 1.2, simplifyMm: 0.05 };
    const plain = traceImage(photo, { ...opts, thicken: false }).shapes.length;
    const widened = traceImage(photo, { ...opts, thicken: true });
    check("widening strokes adds almost no shapes to a photograph", widened.shapes.length <= plain * 1.25 + 3, `${plain} -> ${widened.shapes.length}`);
    check("and none of them is a sliver (smallest shape at least 3 px^2 ... 0.12 mm^2)", Math.min(...widened.shapes.map((q) => q.area)) >= 3, `${Math.min(...widened.shapes.map((q) => q.area)).toFixed(1)} px^2`);
  }

  // the Detail slider: a portrait or a photograph is read half a step further up it than a logo (its small shapes are the eyes and wrinkles)
  {
    check("a logo at Balanced keeps the limits of Balanced", limitsFor("logo", 0.5).minAreaMm2 === detailLimits(0.5).minAreaMm2 && limitsFor("logo", 0.5).minFeatureMm === detailLimits(0.5).minFeatureMm);
    check("a photograph or artwork at Balanced gets the limits of Detailed, and never more than that", limitsFor("photo", 0.5).minAreaMm2 === detailLimits(1).minAreaMm2 && limitsFor("art", 0.5).minFeatureMm === detailLimits(1).minFeatureMm && limitsFor("photo", 1).minAreaMm2 === detailLimits(1).minAreaMm2);
    check("Simple stays simpler than Balanced for a photograph too", limitsFor("photo", 0).minAreaMm2 > limitsFor("photo", 0.5).minAreaMm2);
    const photo = makeImage(420, 300);
    let seed = 5;
    const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let y = 0; y < 300; y++) for (let x = 0; x < 420; x++) {
      const o = (y * 420 + x) * 4, v = Math.sin(x * 0.07 + y * 0.05) * 60 + Math.sin(x * 0.19 - y * 0.11) * 35 + (rnd() - 0.5) * 12;
      photo.data[o] = 128 + v; photo.data[o + 1] = 120 + v * 0.7; photo.data[o + 2] = 110 - v * 0.5;
    }
    const base = { mode: "photo", mmPerPx: 0.2 };
    const bySlider = traceImage(photo, { ...base, detail: 0.5 }).shapes.length;
    const detailed = traceImage(photo, { ...base, ...detailLimits(1) }).shapes.length;
    const balanced = traceImage(photo, { ...base, ...detailLimits(0.5) }).shapes.length;
    check("the tracer reads a photograph's slider setting half a step higher (the shapes of Detailed, not of Balanced)", bySlider === detailed && detailed > balanced, `slider ${bySlider}, Detailed ${detailed}, Balanced ${balanced}`);
    check("a logo is not given more detail by the slider", traceImage(makeImage(120, 80), { mode: "logo", detail: 0.5 }).shapes.length === traceImage(makeImage(120, 80), { mode: "logo", ...detailLimits(0.5) }).shapes.length);
  }

  // kinds of picture, found by looking
  {
    // ten flat colours (as many as a logo can have) with JPEG-like noise: still a logo, not "a photograph"
    const ten = makeImage(300, 200);
    const cols = [[200, 30, 40], [250, 140, 20], [250, 220, 40], [40, 160, 60], [20, 190, 190], [30, 90, 200], [120, 50, 160], [230, 90, 160], [20, 20, 20], [120, 120, 120]];
    cols.forEach((c, i) => paint(ten, [rect(10 + (i % 5) * 56, 15 + Math.floor(i / 5) * 90, 52, 80)], c));
    addNoise(ten, 2, 1.5, 21);
    check("ten flat colours with noise are a logo", traceImage(ten, { mode: "auto" }).stats.kind === "logo", traceImage(ten, { mode: "auto" }).stats.kind);
    const flat = makeImage(300, 200);
    paint(flat, [circle(100.4, 100.2, 70, 360)], NAVY);
    paint(flat, [rect(180.2, 50.3, 90, 100)], RED);
    check('a clean flat-colour logo is a "logo"', traceImage(flat, { mode: "auto" }).stats.kind === "logo");
    addNoise(flat, 3, 2, 11);
    check('the same logo with JPEG-like noise is still not taken for a photograph', traceImage(flat, { mode: "auto" }).stats.kind !== "photo");
    const grad = makeImage(300, 300);
    for (let y = 0; y < 300; y++) for (let x = 0; x < 300; x++) {
      const o = (y * 300 + x) * 4;
      grad.data[o] = 20 + (x / 300) * 220; grad.data[o + 1] = 40 + (y / 300) * 160; grad.data[o + 2] = 200 - ((x + y) / 600) * 150;
    }
    check('a smooth gradient is a "photo"', traceImage(grad, { mode: "auto" }).stats.kind === "photo");
  }

  // a picture with margins is made bigger so that what is stitched fills the hoop (the page does it once, when it is placed)
  {
    const hoop = { w: 100, h: 100 };
    check("a small box in a big hoop is scaled up to 92 % of it", Math.abs(fillScale({ x0: -20, y0: -5, x1: 20, y1: 5 }, hoop) - 2.3) < 0.001);
    check("a box that already fills the hoop is left alone", fillScale({ x0: -45, y0: -30, x1: 45, y1: 30 }, hoop) === 1);
    check("nothing to stitch changes nothing", fillScale(null, hoop) === 1);
    check("a tiny box is not scaled up more than 2.5 times", fillScale({ x0: -1, y0: -1, x1: 1, y1: 1 }, hoop) === 2.5);
    const img = makeImage(200, 100);
    paint(img, [rect(50.2, 30.3, 100, 40)], RED);
    const res = traceImage(img, page);
    const box = contentBox(res, { originX: -10, originY: -5, mmPerPx: 0.1, fabric: "#f4f1ea" });
    check("contentBox is the stitched part in hoop millimetres (not the page round it)", box && Math.abs(box.x0 - (-10 + 50.2 * 0.1)) < 0.2 && Math.abs(box.x1 - (-10 + 150.2 * 0.1)) < 0.2, JSON.stringify(box));
    const hidden = contentBox(res, { originX: 0, originY: 0, mmPerPx: 0.1, fabric: "#c82228" });
    check("a colour like the cloth is not part of it", hidden === null, JSON.stringify(hidden));
  }

  // A narrow shape of the cloth's colour is stitched only where it is ink: in a hole of a WIDE shape (white lettering on a badge). The white inside a
  // letter (its counter: the hole of an o, a, e, B, D) sits in the hole of a narrow shape and is left as cloth, and so is a white outline round the
  // whole design, which sits in no hole at all (hatching the counters of every letter in white thread was a real mistake).
  {
    const opts = { originX: 0, originY: 0, mmPerPx: 0.2, fabric: "#f4f1ea" };
    const rings = makeImage(300, 120);
    for (let i = 0; i < 4; i++) { paint(rings, [circle(45.2 + i * 70, 60.4, 16, 360)], NAVY); paint(rings, [circle(45.2 + i * 70, 60.4, 6, 180)], WHITE); } // four letter Os, 2 mm strokes, 2.4 mm counters
    const o = objectsFromTrace(traceImage(rings, { ...page, mmPerPx: 0.2 }), opts);
    const white = o.palette.filter((p) => p.sameAsCloth && !p.background);
    check(`the white inside four narrow letter Os (strokes under ${CLOTH_FIELD_MM} mm) is left as cloth: no white objects, the white is not stitched`, white.length >= 1 && white.every((p) => p.skipped && !p.fineOnly) && o.objects.every((ob) => !o.palette[ob.pal].sameAsCloth), JSON.stringify(white.map((p) => ({ skipped: p.skipped, fineOnly: p.fineOnly }))));
    check("and the four letters themselves are stitched", o.objects.length === 4, `${o.objects.length} objects`);

    const halo = makeImage(300, 300);
    paint(halo, [circle(150.2, 150.4, 120, 720)], WHITE); // a thin white outline round a navy disc, on a see-through page
    paint(halo, [circle(150.2, 150.4, 114, 720)], NAVY);
    for (let y = 0; y < 300; y++) for (let x = 0; x < 300; x++) if (Math.hypot(x + 0.5 - 150.2, y + 0.5 - 150.4) > 121) halo.data[(y * 300 + x) * 4 + 3] = 0;
    const h = objectsFromTrace(traceImage(halo, { ...page, mmPerPx: 0.2 }), opts);
    check("a thin white outline round the whole design (in no shape's hole) is the cloth: not stitched", h.palette.filter((p) => p.sameAsCloth && !p.background).every((p) => !p.fineOnly) && h.objects.every((ob) => !h.palette[ob.pal].sameAsCloth), JSON.stringify(h.palette.map((p) => [p.hex, p.sameAsCloth, p.skipped, p.fineOnly])));
  }

  // The overlap under later shapes, done the fast way, comes out the same as the slow way (every later shape in reach united, then cut).
  {
    // a mosaic of touching tiles (they share their corner points, as traced shapes do), some round, some with a hole
    const tiles = [];
    for (let gy = 0; gy < 6; gy++) for (let gx = 0; gx < 6; gx++) {
      const x = gx * 4, y = gy * 4;
      const t = [[x, y], [x + 4, y], [x + 4, y + 4], [x, y + 4]];
      tiles.push((gx + gy) % 3 === 0 ? [t, [[x + 1.2, y + 1.2], [x + 1.2, y + 2.8], [x + 2.8, y + 2.8], [x + 2.8, y + 1.2]]] : [t]);
    }
    const slow = (list, bleed) => {
      const boxes = list.map((r) => bboxOf(r));
      return list.map((own, i) => {
        const near = [];
        for (let j = i + 1; j < list.length; j++) { const a = boxes[i], b = boxes[j]; if (b[0] > a[2] + bleed || b[2] < a[0] - bleed || b[1] > a[3] + bleed || b[3] < a[1] - bleed) continue; near.push(list[j]); }
        if (!near.length) return own;
        const extra = intersectRings(offsetRings(own, bleed), near.length === 1 ? near[0] : unionShapes(near));
        return extra.length ? unionShapes([own, extra]) : own;
      });
    };
    const area = (rings) => islandsOf(rings).reduce((a, is) => a + ringArea(is.outer) - is.holes.reduce((q, h) => q + ringArea(h), 0), 0);
    const a = slow(tiles, 0.4), b = bleedUnder(tiles, 0.4);
    let worst = 0;
    for (let i = 0; i < tiles.length; i++) worst = Math.max(worst, Math.abs(area(a[i]) - area(b[i])));
    const grew = b.filter((r, i) => area(r) > area(tiles[i]) + 0.5).length;
    check("the fast overlap under later shapes has the same area as the slow one (every tile, to 0.01 mm²)", worst < 0.01 && grew > 20, `worst ${worst.toFixed(4)}, ${grew} tiles grew`);
    const last = b[b.length - 1];
    check("and the last shape, which has nothing sewn after it, is left as it is", area(last) === area(tiles[tiles.length - 1]));
  }

  // White inside a navy disc, on a pale cloth: the white is "like the cloth". A wide white area is left as bare cloth, but narrow white
  // strokes (lettering, a thin ring) are stitched in white over the navy round them: a gap that narrow cannot be kept clean in a fill.
  {
    const img = makeImage(300, 300);
    paint(img, [circle(150.2, 150.4, 130, 720)], NAVY);
    for (let i = 0; i < 5; i++) paint(img, [rect(88 + i * 30, 100, 8, 60)], WHITE); // five bars, 1.6 mm wide and 12 mm tall
    paint(img, [rect(100, 200, 100, 40)], WHITE); // a patch 20 mm wide and 8 mm tall
    const res = traceImage(img, { ...page, mmPerPx: 0.2 });
    const opts = { originX: -30, originY: -30, mmPerPx: 0.2, fabric: "#f4f1ea" };
    const made = objectsFromTrace(res, opts);
    const white = made.palette.filter((p) => p.sameAsCloth && !p.background);
    const whiteObjects = (m, idx) => m.objects.filter((o) => idx.includes(o.pal)).length;
    const idx = white.map((p) => p.index);
    check("white like the cloth is a colour of its own, with only its fine parts stitched", white.length === 1 && white[0].fineOnly && !white[0].skipped, JSON.stringify(white));
    check(`the five narrow bars (narrower than ${CLOTH_FINE_MM} mm) are stitched, the wide patch is left as cloth`, whiteObjects(made, idx) === 5, `${whiteObjects(made, idx)} white objects`);
    check("the navy is stitched as before", made.objects.some((o) => made.palette[o.pal].hex === "#16255c" || !made.palette[o.pal].sameAsCloth));
    const all = objectsFromTrace(res, { ...opts, include: new Set(idx) });
    check("ticking the colour stitches all of it, the wide patch too", whiteObjects(all, idx) === 6 && !all.palette[idx[0]].fineOnly, `${whiteObjects(all, idx)}`);
    const none = objectsFromTrace(res, { ...opts, skip: new Set(idx) });
    check("unticking it leaves all of it out", whiteObjects(none, idx) === 0 && none.palette[idx[0]].skipped);
    // changing the cloth colour changes which parts of the white are stitched: the design is updated for that colour only
    {
      const next = objectsFromTrace(res, { ...opts, fabric: "#16255c", before: made.palette });
      const merged = mergeTraceObjects(made.objects, next.objects, { before: made.palette, after: next.palette, rank: next.rank });
      check("on a change of cloth colour the shapes that now need stitching are added (white: fine parts only, then all of it)", whiteObjects({ objects: merged }, idx) === 6, `${whiteObjects({ objects: merged }, idx)} white objects`);
      const back = objectsFromTrace(res, { ...opts, before: next.palette });
      const again = mergeTraceObjects(merged, back.objects, { before: next.palette, after: back.palette, rank: back.rank });
      check("and taken away again when the cloth goes back to pale", whiteObjects({ objects: again }, idx) === 5, `${whiteObjects({ objects: again }, idx)} white objects`);
      // The page asks the worker (digitizer/engineCore.js) for the shapes of the colours that CHANGED. The white went from "fine parts only" to all of it, which is a change although
      // it was never switched off: the worker has to send its shapes too (looking only at on and off, it sent none and the white was gone from the design after a cloth change).
      check("the white is among the colours the change of cloth changed", idx.every((i) => changedColours(next.palette, made.palette).has(i)));
      const core = await import("../../digitizer/engineCore.js");
      core.run("trace", { image: img, options: { ...page, mmPerPx: 0.2 }, keep: 1 });
      const sent = core.run("shapes", { token: 1, originX: -30, originY: -30, mmPerPx: 0.2, skip: [], include: [], fabric: "#16255c", snap: false, before: made.palette, fresh: false }).result;
      const whiteSent = sent.packed.meta.filter((o) => idx.includes(o.pal)).length;
      check("and the worker sends the shapes of the white (all six) when asked for them", whiteSent === 6, `${whiteSent} white shapes sent`);
    }
    const dark = objectsFromTrace(res, { ...opts, fabric: "#16255c" });
    check("on a navy cloth the white is stitched whole and the navy is the cloth", whiteObjects(dark, idx) === 6 && dark.palette.some((p) => p.sameAsCloth && p.skipped && p.hex !== "#ffffff"));
  }
}

log("8b. fine lines and dots on top (photographs and artwork), and what the converter makes of them");
{
  // drawn in code: a smooth blue gradient with a faint dark twig across it (2 px at 0.25 mm a pixel = 0.5 mm wide)
  const disc = (img, cx, cy, r, c) => {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const a = Math.max(0, Math.min(1, r + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)));
      if (a <= 0 || x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const o = (y * img.width + x) * 4;
      for (let k = 0; k < 3; k++) img.data[o + k] = img.data[o + k] * (1 - a) + c[k] * a;
    }
  };
  const stroke = (img, a, b, w, c) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2); for (let i = 0; i <= n; i++) disc(img, a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, w / 2, c); };
  const W = 400, H = 300;
  const twig = [[40, 230], [120, 190], [200, 150], [300, 120], [360, 60]];
  const drawn = () => {
    const img = makeImage(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, v = 90 + (y / H) * 110 + Math.sin(x * 0.02) * 8; img.data[o] = v * 0.45; img.data[o + 1] = v * 0.7; img.data[o + 2] = v; }
    for (let i = 1; i < twig.length; i++) stroke(img, twig[i - 1], twig[i], 2, (() => { const v = 90 + (twig[i][1] / H) * 110; return [v * 0.45 * 0.78, v * 0.7 * 0.78, v * 0.78]; })());
    return img;
  };
  const distToTwig = (p) => { let best = Infinity; for (let i = 1; i < twig.length; i++) { const a = twig[i - 1], b = twig[i], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)); } return best; };
  const img = drawn();
  const opt = { mode: "art", mmPerPx: 0.25, colors: 6, maxColors: 6, details: true, fineDetail: 0.75 };
  const off = traceImage(img, { ...opt, details: false });
  check("without the option there are no details in the answer", !("details" in off));
  const art = traceImage(img, opt);
  const d = art.details;
  check("artwork: the faint twig the colour layer lost is found as one line, 55 to 80 mm long", !!d && d.lines.length === 1 && d.lines[0].lengthMm > 55 && d.lines[0].lengthMm < 80, d && JSON.stringify(d.lines.map((l) => l.lengthMm)));
  check("... lying on the twig (within 0.5 mm all along, in the picture's pixels)", !!d && d.lines.length === 1 && d.lines[0].pts.every((p) => distToTwig(p) < 2), d && d.lines[0] && Math.max(...d.lines[0].pts.map(distToTwig)).toFixed(2) + " px");
  check("... one thread wide (about 0.5 mm), darker than what is round it, and it says which colour of the colour layer lies under it", !!d && d.lines.length === 1 && d.lines[0].widthMm > 0.25 && d.lines[0].widthMm < 0.9 && Number.isInteger(d.lines[0].under), d && JSON.stringify([d.lines[0].widthMm, d.lines[0].under]));
  check("the same input gives the same details", JSON.stringify(traceImage(img, opt).details.lines) === JSON.stringify(d.lines));
  const logoRes = traceImage(img, { ...opt, mode: "logo" });
  check("a logo has none (the answer says null) and its shapes are the same as without the option", logoRes.details === null && JSON.stringify(logoRes.shapes) === JSON.stringify(traceImage(img, { ...opt, mode: "logo", details: false }).shapes));
  const photo = traceImage(img, { ...opt, mode: "photo" });
  check("a photograph: the colour layer already carries that twig as a thin shape, so it is found but NOT added a second time", !!photo.details && photo.details.lines.length === 0 && photo.details.stats.droppedLines >= 1, photo.details && JSON.stringify(photo.details.stats.found) + " dropped " + photo.details.stats.droppedLines);

  // the converter: colours, threads, order, amount (a made-up answer: three threads in the colour layer, details of several colours)
  const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
  const pal = (r, g, b, fraction) => ({ r, g, b, fraction, background: false });
  const fake = (extra = {}) => ({
    width: 400, height: 300,
    palette: [pal(20, 40, 110, 0.5), pal(200, 30, 40, 0.3), pal(60, 150, 70, 0.2)],
    shapes: [{ id: 0, color: 0, contours: [sq(0, 0, 200)], area: 40000, bbox: [0, 0, 200, 200] }, { id: 1, color: 1, contours: [sq(200, 0, 200)], area: 40000, bbox: [200, 0, 400, 200] }, { id: 2, color: 2, contours: [sq(0, 200, 400).map((p) => [p[0], p[1] * 0.5 + 100])], area: 20000, bbox: [0, 200, 400, 300] }],
    order: [0, 1, 2],
    stats: { kind: "photo" },
    details: { lines: [], spots: [], stats: { found: { lines: 0, spots: 0 } } },
    ...extra,
  });
  const line = (x, y, len, rgb, under, strength = 30) => ({ pts: [[x, y], [x + len / 2, y + 4], [x + len, y]], lengthMm: len * 0.1, widthMm: 0.45, rgb, strength, dark: true, under });
  const spot = (x, y, rgb, under) => ({ ring: [[x, y], [x + 12, y], [x + 12, y + 12], [x, y + 12]], areaMm2: 1.44, rgb, strength: 40, dark: true, centre: [x + 6, y + 6], under });
  const run = (details, o = {}) => objectsFromTrace(fake({ details: { stats: { found: { lines: details.lines.length, spots: details.spots.length } }, ...details } }), { originX: 0, originY: 0, mmPerPx: 0.25, fabric: "#f4f1ea", ...o });
  const OBJ = (r) => r.objects.filter((o) => o.layer === "detail");

  const mixed = run({
    lines: [line(20, 20, 300, [18, 36, 104], 1), line(30, 60, 300, [24, 44, 112], 1), line(40, 100, 300, [66, 156, 76], 0), line(50, 140, 300, [56, 146, 66], 0), line(60, 180, 300, [28, 50, 118], 1)],
    spots: [spot(100, 100, [10, 10, 20], 0)],
  });
  const lines = OBJ(mixed).filter((o) => o.open), dots = OBJ(mixed).filter((o) => !o.open);
  check("details: every colour is a thread the colour layer already has (no new needle), at most three threads for the lines", lines.length >= 1 && lines.length <= 3 && OBJ(mixed).every((o) => mixed.objects.some((b) => !b.layer && b.fill.color === o.fill.color)) && mixed.details.newColours === 0, JSON.stringify(lines.map((o) => o.fill.color)));
  check("details: lines are open objects with no fill and a bean stroke 0.45 mm; dots are small fills; all follow the picture and belong to no colour", lines.every((o) => o.open && o.fill.type === "none" && o.stroke.type === "bean" && o.stroke.width === 0.45 && o.source === "image" && o.pal === undefined) && dots.every((o) => !o.open && o.fill.type === "auto" && o.source === "image" && o.pal === undefined));
  check("details: sewn after every shape of the colour layer, the dots before the lines", mixed.objects.findIndex((o) => o.layer === "detail") === mixed.objects.filter((o) => !o.layer).length && OBJ(mixed).findIndex((o) => o.open) >= dots.length);
  check("details: a detail whose thread is the colour under it is left out (it would not show)", (() => { const r = run({ lines: [line(20, 20, 300, [20, 40, 110], 0), line(30, 60, 300, [200, 30, 40], 0)], spots: [] }); return r.details && r.details.left.invisible >= 1 && OBJ(r).every((o) => o.fill.color !== "#142870"); })());
  const orange = run({ lines: [line(20, 20, 300, [230, 140, 20], 0), line(30, 60, 300, [232, 138, 22], 0)], spots: [] });
  const near = (hex, r, g, b) => { const n = parseInt(hex.slice(1), 16); return Math.abs((n >> 16) - r) < 8 && Math.abs(((n >> 8) & 255) - g) < 8 && Math.abs((n & 255) - b) < 8; };
  check("details: a colour no thread is near becomes ONE new colour when the machine has needles to spare ...", orange.details.newColours === 1 && OBJ(orange).length === 1 && near(OBJ(orange)[0].fill.color, 231, 139, 21), JSON.stringify(OBJ(orange).map((o) => o.fill.color)));
  const full = run({ lines: [line(20, 20, 300, [230, 140, 20], 0), line(30, 60, 300, [232, 138, 22], 0)], spots: [] }, { maxColors: 3 });
  check("... and none when the machine is full (the detail is sewn in the nearest thread or left out)", full.details === null || full.details.newColours === 0);
  const thick = run({ lines: [line(20, 20, 300, [18, 36, 104], 1)], spots: [] }, { detailThick: true });
  check("details: thicker lines are a narrow satin column (0.7 mm)", OBJ(thick).some((o) => o.open && o.stroke.type === "satin" && o.stroke.width === 0.7));
  const many = run({ lines: Array.from({ length: 400 }, (_, i) => line(5, 4 + (i % 100) * 2, 380, [18, 36, 104], 1, 20 + (i % 7))), spots: [] });
  const cost = (r) => r.details ? r.details.stitchesEst : 0;
  // (the same details in a colour layer of 403 shapes, so the cap on pieces is 81 and the stitch budget is what holds them back: the area is the same 6,250 mm²)
  const crowdShapes = [...fake().shapes, ...Array.from({ length: 400 }, (_, i) => ({ id: 10 + i, color: 0, contours: [sq(190 + (i % 10), Math.floor(i / 10) * 2, 1)], area: 1, bbox: [0, 0, 1, 1] }))];
  const crowd = objectsFromTrace(fake({ shapes: crowdShapes, details: { stats: { found: { lines: 400, spots: 0 } }, lines: Array.from({ length: 400 }, (_, i) => line(5, 4 + (i % 100) * 2, 380, [18, 36, 104], 1, 20 + (i % 7))), spots: [] } }), { originX: 0, originY: 0, mmPerPx: 0.25, fabric: "#f4f1ea" });
  check("details: their stitches stay under 30 % of the colour layer's (about 2 stitches a mm²)", cost(crowd) > 0 && cost(crowd) <= 0.3 * 2 * 6250 + 1 && crowd.details.lines > 12 && crowd.details.lines <= 81, `${cost(crowd)} stitches, ${crowd.details.lines} lines`);
  // saved and opened again: the fine lines keep their openness and their place at the end, and sew the same
  const design = newDesign({ objects: mixed.objects });
  const again = parseDesign(serializeDesign(design));
  const g1 = generate(engineDesign(design), {}), g2 = generate(engineDesign(again), {});
  check("a saved design with fine lines opens again as it was (open lines, detail layer) and sews the same", again.objects.filter((o) => o.open).length === lines.length && again.objects.every((o, i) => o.layer === mixed.objects[i].layer) && Math.abs(g1.pattern.stitches.length - g2.pattern.stitches.length) <= 3 && g1.pattern.threads.length === g2.pattern.threads.length, `${g1.pattern.stitches.length} vs ${g2.pattern.stitches.length}`);
  const lineObj = lines[0];
  const mid = lineObj.rings[0][1], onLine = [lineObj.transform.x + mid[0], lineObj.transform.y + mid[1]];
  check("a fine line can be picked with the pointer on it, from half the usual reach (it must not steal clicks meant for the shape under it)", hitObject({ objects: [lineObj] }, onLine[0], onLine[1], 0.6) === lineObj.id && hitObject({ objects: [lineObj] }, onLine[0] + 0.5, onLine[1] + 0.5, 0.6) === null && hitObject({ objects: [lineObj] }, onLine[0] + 30, onLine[1] + 30, 0.6) === null);
  check("Break apart makes one object per line", breakApart(lineObj).length === lineObj.rings.length && breakApart(lineObj).every((o) => o.open && o.rings.length === 1 && o.layer === "detail"));
  check("details: the separate pieces (each may cost a thread cut) stay under a fifth of the colour layer's shapes, and at least 12 are allowed", many.details.lines + many.details.dots === 12 && many.details.left.budget >= 388, JSON.stringify([many.details.lines, many.details.dots, many.details.left]));
  const alone = run({ lines: [], spots: [] });
  check("no details found: the same objects as before and no summary", alone.objects.every((o) => !o.layer) && alone.details === null);
}

if (process.argv.includes("--perf")) {
  log("9. speed");
  const logo = (size) => {
    const k = size / 1500;
    const img = makeImage(size, size);
    paint(img, [circle(750 * k, 750 * k, 700 * k, 3000)], NAVY, 2);
    paint(img, [circle(750 * k, 750 * k, 600 * k, 3000), circle(750 * k, 750 * k, 560 * k, 3000)], WHITE, 2);
    paint(img, [circle(750 * k, 750 * k, 480 * k, 3000)], RED, 2);
    for (let i = 0; i < 6; i++) paint(img, [rect((330 + i * 190) * k, 1150 * k, 120 * k, 200 * k)], [240, 190, 20], 2);
    return img;
  };
  const l = logo(1500);
  traceImage(l);
  let t0 = performance.now();
  const r1 = traceImage(l);
  const ms1 = performance.now() - t0;
  log(`     1500 x 1500 logo: ${ms1.toFixed(0)} ms, ${r1.shapes.length} shapes`);
  check("1500 x 1500 logo in under 1.5 s", ms1 < 1500, `${ms1.toFixed(0)} ms`);
  const photo = makeImage(4000, 4000);
  let seed = 3;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let y = 0; y < 4000; y++) for (let x = 0; x < 4000; x++) {
    const o = (y * 4000 + x) * 4;
    const v = Math.sin(x * 0.011 + y * 0.007) * 50 + Math.sin(x * 0.023 - y * 0.013) * 30 + (rnd() - 0.5) * 24;
    photo.data[o] = 128 + v; photo.data[o + 1] = 120 + v * 0.7; photo.data[o + 2] = 110 - v * 0.5;
  }
  t0 = performance.now();
  const r2 = traceImage(photo);
  const ms2 = performance.now() - t0;
  log(`     4000 x 4000 photo-like picture: ${ms2.toFixed(0)} ms, ${r2.shapes.length} shapes`);
  check("4000 x 4000 picture in under 4 s", ms2 < 4000, `${ms2.toFixed(0)} ms`);
}

log("");
log("numbers (palette entries incl. background, shapes, share of the picture the shapes cover, agreement away from edges):");
for (const [n, p, s, c, a] of numbers) log(`  ${n.padEnd(26)} ${String(p).padStart(2)} colours  ${String(s).padStart(2)} shapes  ${(c * 100).toFixed(1).padStart(5)} % covered  ${(a * 100).toFixed(2)} % agree`);
log(failures ? `\n${failures} of ${checks} checks FAILED` : `\nall ${checks} checks passed`);
process.exit(failures ? 1 : 0);

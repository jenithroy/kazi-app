/**
 * Self test of the tracer. Plain node, no browser, no files: every picture is drawn in code.
 *
 *   node src/lib/embroidery/trace/selftest.mjs            checks + the numbers
 *   node src/lib/embroidery/trace/selftest.mjs --perf     also times a 1500 x 1500 logo and a 4000 x 4000 photo-like picture
 *
 * Exit code 0 when every check passes, 1 otherwise.
 */
import { traceImage, renderTrace, quantize, detectBackground } from "./index.js";

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

if (process.argv.includes("--perf")) {
  log("8. speed");
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

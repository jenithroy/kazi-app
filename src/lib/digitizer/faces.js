/**
 * Faces: what MediaPipe's face landmarker (478 points per face, see faceFinder.js) says about a picture, turned into things the tracer and the page can use.
 * Pure functions on plain arrays: no DOM, no wasm, so they run in the worker, on the page and under node (the self-test feeds them saved landmarks).
 *
 * A landmark is [x, y, z] with x and y as a share of the picture (0..1). The groups below are MediaPipe's own (FaceLandmarker.FACE_LANDMARKS_*).
 *
 *   faceParts          one face -> its eyes, brows, irises, lips and outline, in the picture's pixels, and how big they are
 *   plausibleFace      the landmarker will fit a "face" onto a cat or a pattern: its proportions say whether this is a person's
 *   faceMeasures       how big the face and its eyes come out on the cloth, in millimetres (what the page tells the person)
 *   paintFeatureClasses  the facial features as four more classes of the region map (regions.js: eyes and brows, lips, the white of the eye, the open mouth), inside the person only, so the eyes and lips get colours of their own
 *   featureAnchors     the white of the eyes and of the teeth, measured on the picture: colours the palette must have (the finder's flat-patch palette never gets a
 *                      white of its own, they are too small and too blurred, so teeth came out the colour of the lips and the eye whites the colour of the skin)
 *
 * Why classes and not lines: the landmarks say WHERE the eyes are, the picture says what they look like. Painting the eye as a region lets the tracer find the
 * dark of the iris and the white round it from the picture's own pixels, so every face keeps its own eyes instead of a generic drawing of them.
 */

import { rgbToLab } from "../embroidery/trace/color.js";

/** The classes added to the region map (regions.js has 0..5). */
export const FACE_REGION = Object.freeze({ FEATURES: 6, LIPS: 7, EYE_WHITE: 8, MOUTH: 9 });

// MediaPipe's index groups (the order of each loop is the order round it)
const RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]; // the person's right eye (left in the picture)
const LEFT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const RIGHT_BROW = [[46, 53, 52, 65, 55], [70, 63, 105, 66, 107]]; // two edges of the brow, each running from the outer end to the inner
const LEFT_BROW = [[276, 283, 282, 295, 285], [300, 293, 334, 296, 336]];
const RIGHT_IRIS = [469, 470, 471, 472]; // the ring; the middle is 468
const LEFT_IRIS = [474, 475, 476, 477]; // the middle is 473
const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const LIPS_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** The two edges of a brow joined into one polygon (the pairing of ends with the smaller gap). */
function browPolygon(upper, lower) {
  const a = upper, b = lower;
  const straight = dist(a[a.length - 1], b[b.length - 1]) + dist(b[0], a[0]); // a then b reversed
  const crossed = dist(a[a.length - 1], b[0]) + dist(b[b.length - 1], a[0]); // a then b
  return straight <= crossed ? [...a, ...[...b].reverse()] : [...a, ...b];
}

function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return [x0, y0, x1, y1];
}

/**
 * One face in the picture's pixels.
 * @param {number[][]} landmarks  478 (or 468) points [x, y, z], x and y 0..1
 * @returns {null | object}  null when the landmarks are not usable
 */
export function faceParts(landmarks, W, H) {
  // the landmarks as a list of [x, y, z] or as one flat Float32Array (x, y, z, x, y, z ...), which is how the worker hands them over
  const flat = ArrayBuffer.isView(landmarks);
  const n = flat ? Math.floor(landmarks.length / 3) : Array.isArray(landmarks) ? landmarks.length : 0;
  if (n < 468) return null;
  const P = new Array(n);
  for (let i = 0; i < n; i++) P[i] = flat ? [landmarks[i * 3] * W, landmarks[i * 3 + 1] * H] : [landmarks[i][0] * W, landmarks[i][1] * H];
  const pick = (idx) => idx.map((i) => P[i]);
  const ring = (idx, centreIdx) => {
    const pts = pick(idx);
    const c = P[centreIdx] || mid(pts[0], pts[2]);
    return { cx: c[0], cy: c[1], r: pts.reduce((s, p) => s + dist(p, c), 0) / pts.length };
  };
  const oval = pick(OVAL);
  const rightEye = pick(RIGHT_EYE);
  const leftEye = pick(LEFT_EYE);
  const lipsOuter = pick(LIPS_OUTER);
  const lipsInner = pick(LIPS_INNER);
  const box = bboxOf(oval);
  const rightIris = n >= 478 ? ring(RIGHT_IRIS, 468) : null;
  const leftIris = n >= 478 ? ring(LEFT_IRIS, 473) : null;
  // the eyes' own corners (33/133 and 263/362) give the width of an eye whatever way the face is turned
  const rightEyeW = dist(P[33], P[133]);
  const leftEyeW = dist(P[263], P[362]);
  const rightC = mid(P[33], P[133]);
  const leftC = mid(P[263], P[362]);
  const mouthC = mid(P[13], P[14]);
  const chin = P[152];
  const brow = P[10];
  return {
    oval, rightEye, leftEye, lipsOuter, lipsInner, rightIris, leftIris,
    rightBrow: browPolygon(pick(RIGHT_BROW[0]), pick(RIGHT_BROW[1])),
    leftBrow: browPolygon(pick(LEFT_BROW[0]), pick(LEFT_BROW[1])),
    box, widthPx: box[2] - box[0], heightPx: box[3] - box[1],
    eyeWidthPx: (rightEyeW + leftEyeW) / 2, rightEyeWidthPx: rightEyeW, leftEyeWidthPx: leftEyeW,
    ipdPx: dist(rightIris ? [rightIris.cx, rightIris.cy] : rightC, leftIris ? [leftIris.cx, leftIris.cy] : leftC),
    eyeCentres: [rightC, leftC], mouthCentre: mouthC, chin, forehead: brow,
    // how far apart the lips are in the middle (the inner edges of the upper and the lower lip), and how wide the mouth is: the lip line curves, so the height of the
    // inner outline's box says nothing about whether the mouth is open
    mouthOpenPx: dist(P[13], P[14]), mouthWidthPx: dist(P[78], P[308]),
    rollDeg: (Math.atan2(leftC[1] - rightC[1], leftC[0] - rightC[0]) * 180) / Math.PI,
  };
}

/**
 * Is this a person's face? The landmarker fits its face model onto anything with two dark spots and a nose (a cat, a toy, a pattern), so the proportions are
 * checked: the two eyes about the same size, the mouth under the eyes by about one eye-distance, the face about as wide as it is long.
 * Measured on the test pictures (a person, a painting, a cat): see the self-test.
 */
export function plausibleFace(parts) {
  if (!parts || !(parts.widthPx > 4)) return false;
  const eyeRatio = parts.rightEyeWidthPx / Math.max(1e-6, parts.leftEyeWidthPx);
  if (eyeRatio < 0.45 || eyeRatio > 2.2) return false; // (a face turned away shows one eye smaller, but not by that much)
  const [r, l] = parts.eyeCentres;
  const eyeMid = mid(r, l);
  const axis = [parts.mouthCentre[0] - eyeMid[0], parts.mouthCentre[1] - eyeMid[1]];
  const eyeToMouth = Math.hypot(axis[0], axis[1]);
  const between = dist(r, l);
  if (!(between > 1e-6)) return false;
  const ratio = eyeToMouth / between; // a person: about 0.8 to 1.15 face-on (a bit more looking down, less looking up)
  if (ratio < 0.45 || ratio > 1.9) return false;
  // the mouth must lie on the chin's side of the eyes
  const toChin = [parts.chin[0] - eyeMid[0], parts.chin[1] - eyeMid[1]];
  if (axis[0] * toChin[0] + axis[1] * toChin[1] <= 0) return false;
  const aspect = parts.heightPx / Math.max(1e-6, parts.widthPx);
  return aspect > 0.55 && aspect < 2.6;
}

/**
 * An eye (corner to corner) narrower than this, on the cloth, sews as dark marks and not as an eye: the thread is 0.4 mm wide and an eye is drawn with a lid line,
 * an iris and a white round it. Found by sewing one face at eight sizes, in real scale (the astronaut, faces 4.9 to 26 mm wide): at 0.8 to 1.4 mm an eye is a smudge or
 * nothing, at 1.7 mm two dark marks, at 2.3 mm a lid line and an iris, from about 3 mm an eye with its white.
 */
export const FACE_EYE_MIN_MM = 2;

/** How big the face and its parts are on the cloth, in millimetres. */
export function faceMeasures(parts, mmPerPx) {
  return {
    faceMm: +(parts.widthPx * mmPerPx).toFixed(1),
    faceHeightMm: +(parts.heightPx * mmPerPx).toFixed(1),
    eyeMm: +(parts.eyeWidthPx * mmPerPx).toFixed(1), // corner to corner of one eye
    ipdMm: +(parts.ipdPx * mmPerPx).toFixed(1), // between the middles of the eyes
    irisMm: parts.rightIris && parts.leftIris ? +(((parts.rightIris.r + parts.leftIris.r) / 2) * 2 * mmPerPx).toFixed(1) : null,
  };
}

// ------------------------------------------------------------------------------------------------------ painting classes
/** Even-odd scanline fill of a polygon into a mask. */
function fillPolygon(mask, W, H, poly) {
  if (poly.length < 3) return;
  let y0 = Infinity, y1 = -Infinity;
  for (const p of poly) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(H - 1, Math.ceil(y1));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let i = 0, n = poly.length; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) mask[y * W + x] = 1;
    }
  }
}

function fillDisc(mask, W, H, cx, cy, r) {
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
    const xa = Math.max(0, Math.ceil(cx - dx - 0.5)), xb = Math.min(W - 1, Math.floor(cx + dx - 0.5));
    for (let x = xa; x <= xb; x++) mask[y * W + x] = 1;
  }
}

/** `mask` grown by `r` pixels (a square: two passes with running sums). */
function dilate(mask, W, H, r) {
  if (r < 1) return mask;
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  const sum = new Int32Array(Math.max(W, H) + 1);
  for (let y = 0; y < H; y++) {
    sum[0] = 0;
    for (let x = 0; x < W; x++) sum[x + 1] = sum[x] + mask[y * W + x];
    for (let x = 0; x < W; x++) tmp[y * W + x] = sum[Math.min(W, x + r + 1)] - sum[Math.max(0, x - r)] > 0 ? 1 : 0;
  }
  for (let x = 0; x < W; x++) {
    sum[0] = 0;
    for (let y = 0; y < H; y++) sum[y + 1] = sum[y] + tmp[y * W + x];
    for (let y = 0; y < H; y++) out[y * W + x] = sum[Math.min(H, y + r + 1)] - sum[Math.max(0, y - r)] > 0 ? 1 : 0;
  }
  return out;
}

export const FEATURE_GROW_MM = Object.freeze({ eye: 0.45, brow: 0.35, lips: 0.3 });

/**
 * The facial features as classes of the region map, painted over the pixels the person finder calls person (never over the background):
 *   FACE_REGION.FEATURES   the eyes with their lids and irises, and the brows
 *   FACE_REGION.LIPS       the lips
 *   FACE_REGION.EYE_WHITE  inside the outline of an eye, outside the iris: the white of the eye
 *   FACE_REGION.MOUTH      the opening of a mouth that is open (teeth, tongue, the dark behind them); a closed mouth is only lips
 * The last two are zones inside the first two: they are where the whites measured on the picture (featureAnchors) may be used, and nowhere else, so a thread of the white
 * cannot spread over the lids, the brows or the lips. Returns a new class map and says what was painted.
 * @param {Uint8Array} classes  the person finder's classes (0 background, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 other)
 * @param {object[]} faces  from faceParts (only the plausible ones are used)
 * @param {{ mmPerPx: number, grow?: object }} o
 */
export function paintFeatureClasses(classes, W, H, faces, o) {
  const out = Uint8Array.from(classes);
  const grow = { ...FEATURE_GROW_MM, ...(o.grow || {}) };
  const px = (mm) => Math.max(0, Math.round(mm / o.mmPerPx));
  const feat = new Uint8Array(W * H);
  const lips = new Uint8Array(W * H);
  const white = new Uint8Array(W * H);
  const mouth = new Uint8Array(W * H);
  // What the landmarks put INSIDE an eye or the open mouth is the person's, whatever the person finder said of it: teeth and the white of an eye are the lightest things in a
  // face, and where the finder took them for the wall behind they were cut out of the stitching (a hole in the face). Only on a face that is mostly person already
  // (a face on a poster behind the person has no body round it: its eyes are no part of the person).
  const inEye = new Uint8Array(W * H); // inside an eye's outline: 1 the white of it, 2 the iris
  const inMouth = new Uint8Array(W * H); // inside the opening of the mouth: 1 an open mouth, 2 a closed one
  let used = 0;
  for (const f of faces) {
    if (!f) continue;
    used++;
    const eyePoly = new Uint8Array(W * H);
    fillPolygon(eyePoly, W, H, f.rightEye);
    fillPolygon(eyePoly, W, H, f.leftEye);
    const iris = new Uint8Array(W * H); // (the iris with its dark rim: not the white of the eye)
    const irisOnly = new Uint8Array(W * H);
    for (const ir of [f.rightIris, f.leftIris]) if (ir) { fillDisc(iris, W, H, ir.cx, ir.cy, ir.r * IRIS_GROW); fillDisc(irisOnly, W, H, ir.cx, ir.cy, ir.r * 1.05); }
    const open = mouthIsOpen(f);
    const opening = new Uint8Array(W * H);
    fillPolygon(opening, W, H, f.lipsInner);
    for (let i = 0; i < white.length; i++) {
      if (eyePoly[i] && !iris[i]) white[i] = 1;
      if (open && opening[i]) mouth[i] = 1;
    }
    const oval = new Uint8Array(W * H);
    fillPolygon(oval, W, H, f.oval);
    let ovalPx = 0, personPx = 0;
    for (let i = 0; i < oval.length; i++) if (oval[i]) { ovalPx++; if (classes[i] !== 0) personPx++; }
    if (ovalPx > 0 && personPx >= RECLAIM_MIN_PERSON * ovalPx) {
      for (let i = 0; i < eyePoly.length; i++) {
        if (eyePoly[i]) inEye[i] = iris[i] ? 2 : 1;
        if (opening[i]) inMouth[i] = open ? 1 : 2;
      }
    }
    const eyeMask = new Uint8Array(W * H);
    for (let i = 0; i < eyeMask.length; i++) eyeMask[i] = eyePoly[i] || irisOnly[i] ? 1 : 0;
    const eyes = dilate(eyeMask, W, H, px(grow.eye));
    const browMask = new Uint8Array(W * H);
    fillPolygon(browMask, W, H, f.rightBrow);
    fillPolygon(browMask, W, H, f.leftBrow);
    const brows = dilate(browMask, W, H, px(grow.brow));
    for (let i = 0; i < feat.length; i++) if (eyes[i] || brows[i]) feat[i] = 1;
    const lipMask = new Uint8Array(W * H);
    fillPolygon(lipMask, W, H, f.lipsOuter);
    const lipsG = dilate(lipMask, W, H, px(grow.lips));
    for (let i = 0; i < lips.length; i++) if (lipsG[i]) lips[i] = 1;
  }
  const n = new Float64Array(10);
  let nBack = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === 0) {
      // (only the inside of the eye and of the mouth are taken back, not the ring round them that the classes below grow)
      if (inMouth[i]) { out[i] = inMouth[i] === 1 ? FACE_REGION.MOUTH : FACE_REGION.LIPS; n[out[i]]++; nBack++; } else if (inEye[i]) { out[i] = inEye[i] === 1 ? FACE_REGION.EYE_WHITE : FACE_REGION.FEATURES; n[out[i]]++; nBack++; }
      continue; // otherwise only inside the person
    }
    if (mouth[i]) out[i] = FACE_REGION.MOUTH;
    else if (lips[i]) out[i] = FACE_REGION.LIPS;
    else if (white[i]) out[i] = FACE_REGION.EYE_WHITE;
    else if (feat[i]) out[i] = FACE_REGION.FEATURES;
    else continue;
    n[out[i]]++;
  }
  return { classes: out, faces: used, featurePx: n[FACE_REGION.FEATURES], lipPx: n[FACE_REGION.LIPS], whitePx: n[FACE_REGION.EYE_WHITE], mouthPx: n[FACE_REGION.MOUTH], reclaimedPx: nBack };
}

/** A face is a person's (and its eyes and mouth are taken back from the background) when at least this share of its outline is person. */
const RECLAIM_MIN_PERSON = 0.6;

/** The iris as the landmarks give it, grown by this much: the dark rim of the iris is not the white of the eye. */
const IRIS_GROW = 1.15;

/** Is the mouth open (the lips apart, in the middle, by at least WHITES.teeth.minOpen of the mouth's width)? Only then is there anything to see between them. */
function mouthIsOpen(f) {
  return f.mouthWidthPx > 0 && f.mouthOpenPx >= WHITES.teeth.minOpen * f.mouthWidthPx;
}

// ------------------------------------------------------------------------------------------------------ the whites of a face
/**
 * What counts as the white of an eye and of the teeth, in CIELAB (L lightness 0..100, chroma = distance from grey): bright and hardly coloured. `top` is the share
 * of those pixels (the lightest first) the colour is taken from, so the shadow at the lid and the edge where the white meets the skin do not darken it; `minDE` is how
 * far the white must be from the skin round the eye to be worth a thread of its own; `minOpen` is how open the mouth must be to show teeth (the gap between the lips in
 * the middle, over the width of the mouth: a mouth at rest is 0.00 to 0.02, a smile with teeth 0.1 to 0.3).
 */
export const WHITES = Object.freeze({
  sclera: Object.freeze({ minL: 50, maxChroma: 22, top: 0.4, minDE: 10, minPx: 6 }),
  teeth: Object.freeze({ minL: 50, maxChroma: 24, top: 0.6, minPx: 8, minShare: 0.12, minOpen: 0.06 }),
});

/** `mask` shrunk by one pixel (a pixel stays when its four neighbours are in it too). */
function erode(mask, W, H) {
  const out = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - W] && mask[i + W]) out[i] = 1;
    }
  }
  return out;
}

const medianOf = (a) => { const s = Float64Array.from(a).sort(); return s.length ? s[s.length >> 1] : 0; };

/**
 * The white of the eyes and of the teeth, measured on the picture (RGBA, the same size as the region map), for the tracer's palette. The palette of a face is found
 * from flat patches of each region, and an eye white or a row of teeth is never one: a few pixels, blurred into the lid and the lips. So a face came out with no white
 * at all: the teeth the colour of the lips, the eyes a dark disc in skin. Here the white is found where the landmarks say it is (inside the eye outline round the iris;
 * inside the open mouth) as the lightest uncoloured part of those pixels, and handed over as a colour the palette must keep (trace option `regionAnchors`).
 * A white is returned only when it is there: the eye whites only when they differ from the skin round the eye by `minDE` (CIELAB), the teeth only in a mouth that is open.
 * @param {{ width, height, data }} image  RGBA
 * @param {object[]} faces  from mainFaces (faceParts)
 * @returns {{ kind: "sclera" | "teeth", rgb: number[], classes: number[], px: number }[]}  `classes` are the region classes the colour belongs to (the white of the eye, the open mouth)
 */
export function featureAnchors(image, faces, tune = {}) {
  const out = [];
  if (!image || !image.data || !(image.width > 0) || !(image.height > 0) || !faces || !faces.length) return out;
  const A = { sclera: { ...WHITES.sclera, ...(tune.sclera || {}) }, teeth: { ...WHITES.teeth, ...(tune.teeth || {}) } };
  const W = image.width, H = image.height, d = image.data;
  const lab = new Float64Array(3);
  /** the lightest `rule.top` of the uncoloured bright pixels of `mask`: [rgb...] and how many pixels passed the test at all */
  const whites = (mask, rule) => {
    const got = [];
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || d[i * 4 + 3] < 200) continue;
      rgbToLab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2], lab, 0);
      if (lab[0] >= rule.minL && Math.hypot(lab[1], lab[2]) <= rule.maxChroma) got.push([lab[0], i]);
    }
    got.sort((a, b) => b[0] - a[0]);
    return { passed: got.length, lightest: got.slice(0, Math.max(0, Math.ceil(got.length * rule.top))).map((g) => g[1]) };
  };
  const medianRgb = (idx) => [0, 1, 2].map((c) => Math.round(medianOf(idx.map((i) => d[i * 4 + c]))));
  const scleraPx = [], teethPx = [], skin = [[], [], []];
  for (const f of faces) {
    if (!f) continue;
    // the eye whites: inside the outline of the eye, outside the iris (grown a little: its dark rim is not white)
    const eyeMask = new Uint8Array(W * H);
    fillPolygon(eyeMask, W, H, f.rightEye);
    fillPolygon(eyeMask, W, H, f.leftEye);
    const iris = new Uint8Array(W * H);
    for (const ir of [f.rightIris, f.leftIris]) if (ir) fillDisc(iris, W, H, ir.cx, ir.cy, ir.r * (IRIS_GROW + 0.05)); // (a little more than the zone itself: the white is measured well away from the rim)
    let cand = new Uint8Array(W * H);
    for (let i = 0; i < cand.length; i++) cand[i] = eyeMask[i] && !iris[i] ? 1 : 0;
    if (f.eyeWidthPx >= 30) cand = erode(cand, W, H); // (the pixels on the outline are lid and lashes)
    const s = whites(cand, A.sclera);
    if (s.lightest.length >= A.sclera.minPx) {
      for (const i of s.lightest) scleraPx.push(i);
      // the skin round the eye, to tell whether the white is a white (a ring from a tenth of an eye's width out to half of it; no lashes, no brows)
      const r0 = Math.max(1, Math.round(0.1 * f.eyeWidthPx)), r1 = Math.max(r0 + 1, Math.round(0.5 * f.eyeWidthPx));
      const outer = dilate(eyeMask, W, H, r1), inner = dilate(eyeMask, W, H, r0);
      const ls = [], as = [], bs = [];
      for (let i = 0; i < outer.length; i++) {
        if (!outer[i] || inner[i] || d[i * 4 + 3] < 200) continue;
        rgbToLab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2], lab, 0);
        if (lab[0] < 25 || lab[0] > 97) continue;
        ls.push(lab[0]); as.push(lab[1]); bs.push(lab[2]);
      }
      if (ls.length >= 12) { skin[0].push(medianOf(ls)); skin[1].push(medianOf(as)); skin[2].push(medianOf(bs)); }
    }
    // the teeth: inside the opening of the mouth, only when it is open
    const mouth = new Uint8Array(W * H);
    fillPolygon(mouth, W, H, f.lipsInner);
    let y0 = Infinity, y1 = -Infinity, area = 0;
    for (const p of f.lipsInner) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let i = 0; i < mouth.length; i++) area += mouth[i];
    if (area > 0 && mouthIsOpen(f)) {
      const t = whites(y1 - y0 >= 8 ? erode(mouth, W, H) : mouth, A.teeth);
      if (t.lightest.length >= A.teeth.minPx && t.passed >= A.teeth.minShare * area) for (const i of t.lightest) teethPx.push(i);
    }
  }
  if (scleraPx.length >= A.sclera.minPx && skin[0].length) {
    const rgb = medianRgb(scleraPx);
    rgbToLab(rgb[0], rgb[1], rgb[2], lab, 0);
    const de = Math.hypot(lab[0] - medianOf(skin[0]), lab[1] - medianOf(skin[1]), lab[2] - medianOf(skin[2]));
    if (de >= A.sclera.minDE) out.push({ kind: "sclera", rgb, classes: [FACE_REGION.EYE_WHITE], px: scleraPx.length });
  }
  if (teethPx.length >= A.teeth.minPx) out.push({ kind: "teeth", rgb: medianRgb(teethPx), classes: [FACE_REGION.MOUTH], px: teethPx.length });
  return out;
}

/** The face that is the subject: the biggest plausible one, with the others that are at least a third as big as it. */
export function mainFaces(allLandmarks, W, H) {
  const parts = (allLandmarks || []).map((lm) => faceParts(lm, W, H)).filter((p) => p && plausibleFace(p));
  if (!parts.length) return [];
  parts.sort((a, b) => b.widthPx - a.widthPx);
  return parts.filter((p) => p.widthPx >= parts[0].widthPx / 3);
}

/**
 * A crop that frames the head and shoulders round the faces: about two and a half face-widths wide, the hair above and the neck and shoulders below.
 * [x0, y0, x1, y1] in the picture's pixels, kept inside the picture; null when it would not be much smaller than the picture (cropping would not help).
 */
export function faceCropBox(faces, W, H, { widths = 2.5, above = 0.6, below = 0.95, keep = 0.8 } = {}) {
  if (!faces || !faces.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of faces) { x0 = Math.min(x0, f.box[0]); y0 = Math.min(y0, f.box[1]); x1 = Math.max(x1, f.box[2]); y1 = Math.max(y1, f.box[3]); }
  const fw = x1 - x0, fh = y1 - y0, cx = (x0 + x1) / 2;
  const w = Math.max(fw * widths, fh * 1.8);
  const box = [Math.max(0, cx - w / 2), Math.max(0, y0 - fh * above), Math.min(W, cx + w / 2), Math.min(H, y1 + fh * below)];
  const area = (box[2] - box[0]) * (box[3] - box[1]);
  return area >= keep * W * H ? null : box.map(Math.round);
}

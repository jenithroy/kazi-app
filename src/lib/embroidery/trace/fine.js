/**
 * The fine lines and small dots of a picture, as the tracer hands them on: found on the picture itself (details.js), then checked against
 * the colour layer the tracer has made, because the two are sewn together: the colour layer is left exactly as it is (it keeps lettering,
 * logos and crests right), and the details are added on top of it, last. So a detail that the colour layer already carries (a thin shape
 * of its own along the same vein, a small shape on the same spot) is not added a second time, or the same thread would be sewn twice.
 *
 * Every line and dot also says which colour of the colour layer lies under it (`under`, a palette index or -1), so the page can tell
 * whether a detail would show at all (a vein in the leaf's own colour is invisible once the colours are reduced to a few threads).
 */
import { prepare } from "./prep.js";
import { extractDetails, detailParams } from "./details.js";
import { rgbToLab } from "./color.js";

/** A line shorter than this (mm) is never kept, whatever its strength (a stitch of a bean line is 2 mm). */
export const MIN_LINE_MM = 1.5;
/** What the colour layer is taken to carry already: a shape whose mean width is under this (mm), or whose area is under FINE_AREA_MM2. */
const THIN_MM = 1.3; // (the widest ridge the finder takes for a line, details.js maxWidthMm: a stroke it can find is a stroke the colour layer can already carry)
const FINE_AREA_MM2 = 6;
/** How far (mm) round such a shape a detail still counts as the same thing. */
const NEAR_MM = 0.25;
/** A line this much covered by the colour layer's own thin shapes is dropped whole; less, and only its uncovered stretches stay. */
const COVERED_DROP = 0.6;
/**
 * A shape of the colour layer carries a detail only when its own colour is this near (CIELAB distance) the detail's colour. A dark whisker that runs over an
 * orange patch is not carried by the patch: the patch is small, but it is orange. (Before this a small shape of ANY colour carried every detail on it, and on
 * a picture made of thousands of small patches nearly every fine line was thrown away as "already there".) It is the same distance a detail may have to the
 * thread it is sewn in (`DETAIL_MATCH_DE` in the converter, 18): a shape the detail could be sewn in carries it, one it could not be sewn in does not. At 26 a
 * dark line over a blue-grey patch counted as carried by it; on the tiger of the acceptance picture 18 gives 10 lines in place of 6, the strict line recall
 * .483 -> .506, for 60 stitches, and no other picture of the check changed.
 */
export const CARRY_DE = 18;
/**
 * The finder is asked for this many times its usual budget of lines, and the budget is applied here, AFTER the lines the colour layer carries are dropped.
 * Asked for its usual budget the finder spent it on the long outlines the colour layer already sews, those were then dropped, and the lines that were
 * missing (whiskers, veins, tendrils: nothing in the colour layer has them) never got in.
 */
export const OVERFETCH = 3;

/** Even-odd scanline fill of closed rings (pixel coordinates) into a typed array: `value` inside. */
function fillRings(mask, w, h, rings, value = 1) {
  let y0 = Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(h - 1, Math.ceil(y1));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (const r of rings) {
      for (let i = 0, n = r.length; i < n; i++) {
        const a = r[i], b = r[i + 1 === n ? 0 : i + 1];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) mask[y * w + x] = value;
    }
  }
}

const polyLenPx = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };

/** Points along a polyline, about `stepPx` apart, with the position along it ([x, y, distance]). */
function along(pts, stepPx) {
  const out = [];
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(d / stepPx));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, acc + (d * k) / n]);
    acc += d;
  }
  const last = pts[pts.length - 1];
  out.push([last[0], last[1], acc]);
  return out;
}

/**
 * @param {{ width, height, data }} image  the picture the tracer was given (RGBA, at most 1600 px on its long side)
 * @param {object} o  the tracer's normalised options (mmPerPx, fineDetail)
 * @param {string} kind  "logo" | "art" | "photo": a logo has none
 * @param {{ labels, w, h, K, wk, pal }} a  the tracer's analysis (the colour layer's label of each pixel of its work grid)
 * @param {{ color: number, area: number, contours: number[][][] }[]} shapes  the colour layer's shapes, in the picture's pixels
 * @returns {null | { lines, spots, stats }}  in the picture's pixels, x right, y down
 */
export function findFineDetails(image, o, kind, a, shapes, hairlines = null) {
  if (kind === "logo") return null;
  const longSide = Math.max(image.width, image.height);
  const pic = prepare(image, longSide, 0); // the picture as it is (no shrinking), the see-through parts filled from what is next to them
  const w = pic.w, h = pic.h, mm = o.mmPerPx;
  // The usual numbers of the finder for this picture (what is kept in the end), and the same asked for OVERFETCH times over (what the finder is asked to bring).
  const base = detailParams(kind, o.fineDetail, o.fineParams);
  const areaCm2 = (w * mm) * (h * mm) / 100;
  const budgetMm = Math.max(30, base.lineMmPerCm2 * areaCm2), maxLines = Math.max(4, Math.round(base.linesPerCm2 * areaCm2)), maxSpots = Math.round(base.spotsPerCm2 * areaCm2);
  const asked = { ...(o.fineParams || {}), budgetScale: ((o.fineParams && o.fineParams.budgetScale) || 1) * OVERFETCH };
  const res = extractDetails({ w, h, rgb: pic.rgb, cov: pic.cov, mmPerPx: mm, kind, detail: o.fineDetail, params: asked, mask: false });
  const stats = { ...res.stats, found: { lines: res.lines.length, spots: res.spots.length }, droppedLines: 0, droppedSpots: 0, droppedBudget: 0, cutLines: 0 };
  if (!res.lines.length && !res.spots.length) return { lines: [], spots: [], stats };

  // What the colour layer already carries: its thin shapes and its small ones (not the background, which is not sewn), each with its colour.
  const K = a.K, pal = a.pal;
  const palLab = new Float32Array(K * 3);
  for (let k = 0; k < K; k++) rgbToLab(pal.rgb[k * 3], pal.rgb[k * 3 + 1], pal.rgb[k * 3 + 2], palLab, k * 3);
  const carrier = new Int16Array(w * h).fill(-1);
  for (const s of shapes) {
    if (pal.bg[s.color]) continue;
    let per = 0;
    for (const c of s.contours) { for (let i = 0, n = c.length; i < n; i++) { const p = c[i], q = c[i + 1 === n ? 0 : i + 1]; per += Math.hypot(q[0] - p[0], q[1] - p[1]); } }
    const meanW = per > 0 ? (2 * s.area * mm) / per : 0, areaMm2 = s.area * mm * mm;
    if (meanW <= THIN_MM || areaMm2 <= FINE_AREA_MM2) fillRings(carrier, w, h, s.contours, s.color);
  }
  // the hairlines (hairlines.js) are sewn too: a line of the finder that runs along one is carried by it, as by a shape
  if (hairlines) {
    for (const hl of hairlines) {
      const col = hl.color < K ? hl.color : -1;
      if (col < 0) continue;
      for (let i = 0; i + 1 < hl.pts.length; i++) {
        const p = hl.pts[i], q = hl.pts[i + 1], steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.5));
        for (let t = 0; t <= steps; t++) {
          const cx = Math.floor(p[0] + ((q[0] - p[0]) * t) / steps), cy = Math.floor(p[1] + ((q[1] - p[1]) * t) / steps);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < w && y < h) carrier[y * w + x] = col; }
        }
      }
    }
  }
  const nearPx = Math.max(1, Math.round(NEAR_MM / mm));
  const labOf = (rgb) => { const out = new Float32Array(3); rgbToLab(rgb[0], rgb[1], rgb[2], out, 0); return out; };
  /** Is the point carried: is a shape of the colour layer within NEAR_MM of it whose colour is near the detail's own (`lab`)? */
  const at = (p, lab) => {
    const cx = Math.round(p[0] - 0.5), cy = Math.round(p[1] - 0.5);
    for (let y = Math.max(0, cy - nearPx); y <= Math.min(h - 1, cy + nearPx); y++) {
      for (let x = Math.max(0, cx - nearPx); x <= Math.min(w - 1, cx + nearPx); x++) {
        const k = carrier[y * w + x];
        if (k < 0) continue;
        const dL = palLab[k * 3] - lab[0], dA = palLab[k * 3 + 1] - lab[1], dB = palLab[k * 3 + 2] - lab[2];
        if (dL * dL + dA * dA + dB * dB <= CARRY_DE * CARRY_DE) return 1;
      }
    }
    return 0;
  };

  // The colour of the colour layer under a point (palette index, or -1 for the background or the see-through part).
  const labels = a.labels, lw = a.w, lh = a.h, sx = a.wk.sx, sy = a.wk.sy;
  const under = (pts) => {
    const votes = new Map();
    const n = pts.length;
    for (const t of [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1]) {
      const p = pts[Math.min(n - 1, Math.round(t * (n - 1)))];
      const x = Math.min(lw - 1, Math.max(0, Math.floor(p[0] / sx))), y = Math.min(lh - 1, Math.max(0, Math.floor(p[1] / sy)));
      const l = labels[y * lw + x];
      const k = l < a.K && !a.pal.bg[l] ? l : -1;
      votes.set(k, (votes.get(k) || 0) + 1);
    }
    let best = -1, bn = 0;
    for (const [k, c] of votes) if (c > bn || (c === bn && k > best)) { best = k; bn = c; }
    return best;
  };

  // The region of the person (regions.js) a detail lies in, when the picture has a region map: the class most of its points are in (0 = none).
  const classes = a.regionCls || null;
  const regionOf = (pts) => {
    if (!classes) return 0;
    const votes = new Uint8Array(8);
    const n = pts.length;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const p = pts[Math.min(n - 1, Math.round(t * (n - 1)))];
      const x = Math.min(lw - 1, Math.max(0, Math.floor(p[0] / sx))), y = Math.min(lh - 1, Math.max(0, Math.floor(p[1] / sy)));
      votes[classes[y * lw + x] & 7]++;
    }
    let best = 0;
    for (let c = 1; c < 8; c++) if (votes[c] > votes[best]) best = c;
    return best;
  };

  const stepPx = Math.max(1, 0.3 / mm), minPx = MIN_LINE_MM / mm;
  const lines = [];
  for (const ln of res.lines) {
    const s = along(ln.pts, stepPx);
    const lab = labOf(ln.rgb);
    let covered = 0;
    for (const p of s) if (at(p, lab)) covered++;
    if (covered / s.length >= COVERED_DROP) { stats.droppedLines++; continue; }
    if (!covered) { if (ln.lengthMm >= MIN_LINE_MM) lines.push({ ...ln, under: under(ln.pts), region: regionOf(ln.pts) }); else stats.droppedLines++; continue; }
    // some of it is covered: keep the stretches that are not
    let from = -1, cut = false;
    for (let i = 0; i <= s.length; i++) {
      const free = i < s.length && !at(s[i], lab);
      if (free && from < 0) from = i;
      if (!free && from >= 0) {
        const part = s.slice(from, i), d0 = part[0][2], d1 = part[part.length - 1][2];
        from = -1;
        if (d1 - d0 < minPx || part.length < 2) { cut = true; continue; }
        const pts = part.map((p) => [p[0], p[1]]);
        lines.push({ ...ln, pts, lengthMm: +(polyLenPx(pts) * mm).toFixed(2), under: under(pts), region: regionOf(pts) });
        cut = true;
      }
    }
    if (cut) stats.cutLines++;
  }
  const spots = [];
  for (const sp of res.spots) {
    const lab = labOf(sp.rgb);
    let covered = 0;
    for (const p of sp.ring) if (at(p, lab)) covered++;
    if (at(sp.centre, lab) || covered / sp.ring.length >= 0.5) { stats.droppedSpots++; continue; }
    spots.push({ ...sp, under: under([sp.centre]), region: regionOf([sp.centre]) });
  }

  // The usual budget, now that what the colour layer carries is out of the way: the strongest and longest first (the finder's own order of worth).
  const worth = (l) => l.strength * Math.pow(Math.min(l.lengthMm, 30), base.lenExp);
  lines.sort((p, q) => worth(q) - worth(p));
  let spent = 0, keep = 0;
  while (keep < lines.length && keep < maxLines && spent < budgetMm) spent += lines[keep++].lengthMm;
  stats.droppedBudget = lines.length - keep;
  lines.length = keep;
  if (spots.length > maxSpots) { spots.sort((p, q) => q.strength * Math.sqrt(q.areaMm2) - p.strength * Math.sqrt(p.areaMm2)); stats.droppedBudget += spots.length - maxSpots; spots.length = maxSpots; }

  let lengthMm = 0, spotArea = 0;
  for (const l of lines) lengthMm += l.lengthMm;
  for (const s of spots) spotArea += s.areaMm2;
  stats.lines = lines.length; stats.spots = spots.length; stats.lengthMm = Math.round(lengthMm);
  stats.stitchesEst = Math.round(lengthMm * 1.5 + spotArea * 1.0 + spots.length * 12 + lines.length * 8);
  return { lines, spots, stats };
}

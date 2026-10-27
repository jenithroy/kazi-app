/**
 * Draw a pattern into a picture without a browser: each sewn stitch becomes a short thread, `threadMm` wide, in the colour
 * of its block. It is how the tests look at what the engine made, and how the app can make a flat preview picture of a
 * design (the editor itself draws the same thing on a canvas). Positions are 0.1 mm units as in a pattern.
 */
import { CMD, UNITS_PER_MM } from "../pattern.js";

const hexToRgb = (t) => [t.r | 0, t.g | 0, t.b | 0];

/**
 * @param {object} pattern  { threads, stitches }
 * @param {object} o  pxPerMm (default 10), marginMm (default 2), threadMm (default 0.38), background ([r, g, b, a], default white), shade (0..1: how much a thread is darker at its edges, default 0.35)
 * @returns {{ width: number, height: number, data: Uint8ClampedArray, originX: number, originY: number, pxPerMm: number }}
 *   RGBA picture; pixel = (mm - origin) * pxPerMm.
 */
export function rasterizePattern(pattern, o = {}) {
  const pxPerMm = o.pxPerMm || 10;
  const margin = o.marginMm ?? 2;
  const threadMm = o.threadMm || 0.38;
  const shade = o.shade ?? 0.35;
  const bg = o.background || [255, 255, 255, 255];
  const st = pattern.stitches;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, c] of st) {
    if (c !== CMD.STITCH && c !== CMD.JUMP) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x0 === Infinity) { x0 = y0 = 0; x1 = y1 = 0; }
  const originX = x0 / UNITS_PER_MM - margin, originY = y0 / UNITS_PER_MM - margin;
  const width = Math.max(1, Math.ceil((x1 - x0) / UNITS_PER_MM * pxPerMm + 2 * margin * pxPerMm));
  const height = Math.max(1, Math.ceil((y1 - y0) / UNITS_PER_MM * pxPerMm + 2 * margin * pxPerMm));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) { data[i * 4] = bg[0]; data[i * 4 + 1] = bg[1]; data[i * 4 + 2] = bg[2]; data[i * 4 + 3] = bg[3]; }

  const half = (threadMm / 2) * pxPerMm;
  let color = pattern.threads[0] ? hexToRgb(pattern.threads[0]) : [20, 20, 20];
  let thread = 0;
  let px = null, py = null;

  const dot = (ax, ay, bx, by) => {
    const minx = Math.max(0, Math.floor(Math.min(ax, bx) - half - 1)), maxx = Math.min(width - 1, Math.ceil(Math.max(ax, bx) + half + 1));
    const miny = Math.max(0, Math.floor(Math.min(ay, by) - half - 1)), maxy = Math.min(height - 1, Math.ceil(Math.max(ay, by) + half + 1));
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    for (let y = miny; y <= maxy; y++) {
      for (let x = minx; x <= maxx; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / l2));
        const d = Math.hypot(cx - (ax + t * dx), cy - (ay + t * dy));
        const cover = Math.max(0, Math.min(1, half - d + 0.5));
        if (cover <= 0) continue;
        // Thread look: lighter along the middle, darker at the edges.
        const edge = Math.min(1, d / Math.max(half, 0.5));
        const k = 1 - shade * edge * edge;
        const i = (y * width + x) * 4;
        data[i] = data[i] * (1 - cover) + color[0] * k * cover;
        data[i + 1] = data[i + 1] * (1 - cover) + color[1] * k * cover;
        data[i + 2] = data[i + 2] * (1 - cover) + color[2] * k * cover;
        data[i + 3] = Math.max(data[i + 3], 255 * cover);
      }
    }
  };

  for (const [x, y, c] of st) {
    const sx = (x / UNITS_PER_MM - originX) * pxPerMm, sy = (y / UNITS_PER_MM - originY) * pxPerMm;
    if (c === CMD.COLOR_CHANGE) {
      thread = Math.min(thread + 1, pattern.threads.length - 1);
      if (pattern.threads[thread]) color = hexToRgb(pattern.threads[thread]);
      px = null;
    } else if (c === CMD.STITCH) {
      if (px !== null) dot(px, py, sx, sy);
      px = sx; py = sy;
    } else if (c === CMD.JUMP || c === CMD.TRIM) {
      if (c === CMD.JUMP) { px = null; }
    }
  }
  return { width, height, data, originX, originY, pxPerMm };
}

/**
 * How well do stitches cover a shape? Draw the shape and the threads on one fine grid and compare: how much of the shape has
 * thread on it (`covered`), how much thread lies where it should not (`spill`, as a share of the shape's area) and how much is
 * piled up (`dense`: under four or more threads at once, a tangle). The engine
 * uses it to check a satin attempt before keeping it, and the tests use it to check everything the engine makes.
 *
 * A thread has width, so a stitch that ends exactly on the edge still reaches half its width past it: that is not spill.
 * Spill is thread more than `slackMm` beyond the edge of the shape (default: half the thread width plus 0.15 mm).
 */
import { rasterizeRings } from "../geometry/skeleton.js";
import { offsetRings } from "../geometry/clip.js";

/**
 * @param {number[][][]} paths  runs of [x, y] points (every step is a thread)
 * @param {number[][][]} rings  the shape (even-odd)
 * @param {object} o  threadMm (drawn thread width, default 0.5), res (grid pixels per mm, default 8), slackMm
 * @returns {{ covered: number, spill: number, dense: number }}  dense = the share of the shape lying under four or more threads at once
 */
export function coverageOf(paths, rings, { threadMm = 0.5, res = 8, slackMm } = {}) {
  const slack = slackMm ?? threadMm / 2 + 0.15;
  const g = rasterizeRings(rings, res, Math.ceil(slack * res) + 6);
  const { w, h, ox, oy, mask } = g;
  // The shape grown by the slack: thread inside it is acceptable.
  const grown = rasterizeRings(offsetRings(rings, slack, { join: "round" }), res, 2);
  const paint = new Uint8Array(w * h);
  const r = (threadMm / 2) * res;
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      const ax = (path[i - 1][0] - ox) * res - 0.5, ay = (path[i - 1][1] - oy) * res - 0.5;
      const bx = (path[i][0] - ox) * res - 0.5, by = (path[i][1] - oy) * res - 0.5;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + r));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + r));
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
          const ex = x - (ax + t * dx), ey = y - (ay + t * dy);
          if (ex * ex + ey * ey <= r * r && paint[y * w + x] < 255) paint[y * w + x]++;
        }
      }
    }
  }
  // `grown` has its own origin: look it up by position.
  const gAt = (x, y) => {
    const gx = Math.round(x + (ox - grown.ox) * res), gy = Math.round(y + (oy - grown.oy) * res);
    return gx >= 0 && gy >= 0 && gx < grown.w && gy < grown.h && grown.mask[gy * grown.w + gx] === 1;
  };
  let inside = 0, covered = 0, spill = 0, dense = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i]) { inside++; if (paint[i]) covered++; if (paint[i] >= 4) dense++; } else if (paint[i] && !gAt(x, y)) spill++;
    }
  }
  return { covered: inside ? covered / inside : 1, spill: inside ? spill / inside : 0, dense: inside ? dense / inside : 0 };
}

/**
 * Parts of a letter that no thread reaches.
 *
 * A dense letter is sewn in a copy of its shape taken in where it is thick (lightenThick), and its rows are cut by minRow and the planner's shortest
 * stitch. Where a thin neck or a junction is taken in to nothing, or a stem falls between two rows, a piece of the letter is left bare: a notch in a
 * letter, or a whole stem. This looks at the finished rows and returns where such a piece is, so the caller can put the drawn shape back there and
 * sew the rows again (the stitches that result belong to the same rows: no extra thread, tie stitch or jump).
 *
 * The check is a small grid (`cell` mm) over the letter: the shape, the thread laid along every stitch (`half` mm either side of it) and what is left.
 * Everything is millimetres.
 */
import { bboxOf } from "../geometry/poly.js";

/**
 * @param {number[][][]} rings  the letter's shape (outer ring and holes, read even-odd), the drawn one, not the taken-in copy the rows were laid in
 * @param {number[][][]} paths  the stitched rows, as tatamiFill returns them (runs of [x, y], same frame as `rings`)
 * @param {{ half?: number, cell?: number, erode?: number, minArea?: number }} o  `half`: how far a thread is taken to reach either side of its stitch (a thread is
 *   about 0.45 mm wide); `erode`: the rim of the shape this far in from its edge is not looked at (a thread's overhang covers it, and a fringe is not a hole);
 *   `minArea`: smaller bare pieces (mm2) are left alone, a needle cannot do anything with them
 * @returns {{ x: number, y: number, r: number, area: number, rects: number[][][] }[]}  (with `.total`: the area of everything bare, mm2, pieces under `minArea` included: a number to compare two
 *   sewings of the same letter by, `erode: 0` making it look at the rim and hairlines too)  the bare pieces: centre, a radius that holds the piece, area (mm2), and the piece itself as
 *   rectangles (rings: one per run of cells in a row, so a caller can union them into the piece's shape)
 */
export function unsewnPatches(rings, paths, o = {}) {
  const half = o.half ?? 0.2, cell = o.cell ?? 0.05, erode = Math.round((o.erode ?? 0.08) / cell), minCells = Math.ceil((o.minArea ?? 0.06) / (cell * cell));
  const box = bboxOf(rings);
  if (!box || !paths || !paths.length) return [];
  const x0 = box[0] - 2 * cell, y0 = box[1] - 2 * cell;
  const W = Math.ceil((box[2] - box[0]) / cell) + 5, H = Math.ceil((box[3] - box[1]) / cell) + 5;
  if (W * H > 800000) return []; // not lettering of a size a needle works at (about 100 x 40 mm at the default cell): the check is for those

  // the shape, at the cell centres (even-odd)
  const inside = new Uint8Array(W * H);
  const hits = Array.from({ length: H }, () => []);
  for (const ring of rings) {
    for (let i = 0, m = ring.length; i < m; i++) {
      const p = ring[i], q = ring[(i + 1) % m];
      if (p[1] === q[1]) continue;
      const lo = Math.min(p[1], q[1]), hi = Math.max(p[1], q[1]);
      for (let j = Math.max(0, Math.floor((lo - y0) / cell) - 1); j <= Math.min(H - 1, Math.ceil((hi - y0) / cell) + 1); j++) {
        const y = y0 + (j + 0.5) * cell;
        if ((p[1] <= y) !== (q[1] <= y)) hits[j].push(p[0] + ((q[0] - p[0]) * (y - p[1])) / (q[1] - p[1]));
      }
    }
  }
  for (let j = 0; j < H; j++) {
    const h = hits[j].sort((a, b) => a - b);
    for (let i = 0; i + 1 < h.length; i += 2) for (let x = Math.max(0, Math.ceil((h[i] - x0) / cell - 0.5)); x <= Math.min(W - 1, Math.floor((h[i + 1] - x0) / cell - 0.5)); x++) inside[j * W + x] = 1;
  }

  // the shape without its rim (two passes of a square minimum)
  let core = inside;
  if (erode > 0) {
    const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let x = 0; x < W; x++) { let v = 1; for (let d = -erode; d <= erode && v; d++) { const xx = x + d; if (xx < 0 || xx >= W || !inside[j * W + xx]) v = 0; } tmp[j * W + x] = v; }
    for (let j = 0; j < H; j++) for (let x = 0; x < W; x++) { let v = 1; for (let d = -erode; d <= erode && v; d++) { const jj = j + d; if (jj < 0 || jj >= H || !tmp[jj * W + x]) v = 0; } out[j * W + x] = v; }
    core = out;
  }

  // the thread: every cell within `half` of a stitch
  const covered = new Uint8Array(W * H), reach = Math.ceil(half / cell) + 1;
  for (const path of paths) {
    for (let s = 0; s + 1 < path.length; s++) {
      const a = path[s], b = path[s + 1];
      const ax = (a[0] - x0) / cell, ay = (a[1] - y0) / cell, bx = (b[0] - x0) / cell, by = (b[1] - y0) / cell;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, hc = half / cell;
      for (let j = Math.max(0, Math.floor(Math.min(ay, by)) - reach); j <= Math.min(H - 1, Math.ceil(Math.max(ay, by)) + reach); j++) {
        for (let x = Math.max(0, Math.floor(Math.min(ax, bx)) - reach); x <= Math.min(W - 1, Math.ceil(Math.max(ax, bx)) + reach); x++) {
          const px = x + 0.5, py = j + 0.5;
          const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
          const ex = px - (ax + t * dx), ey = py - (ay + t * dy);
          if (ex * ex + ey * ey <= hc * hc) covered[j * W + x] = 1;
        }
      }
    }
  }

  // what is left, in pieces
  const seen = new Uint8Array(W * H), patches = [];
  let total = 0; // all of it, the pieces too small to be returned as well
  for (let k0 = 0; k0 < W * H; k0++) {
    if (!core[k0] || covered[k0] || seen[k0]) continue;
    const stack = [k0];
    seen[k0] = 1;
    let n = 0, sx = 0, sy = 0, bx0 = W, by0 = H, bx1 = 0, by1 = 0;
    const cells = [];
    while (stack.length) {
      const k = stack.pop(), x = k % W, y = (k / W) | 0;
      n++; sx += x; sy += y; cells.push(k);
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
      if (x > 0 && core[k - 1] && !covered[k - 1] && !seen[k - 1]) { seen[k - 1] = 1; stack.push(k - 1); }
      if (x < W - 1 && core[k + 1] && !covered[k + 1] && !seen[k + 1]) { seen[k + 1] = 1; stack.push(k + 1); }
      if (y > 0 && core[k - W] && !covered[k - W] && !seen[k - W]) { seen[k - W] = 1; stack.push(k - W); }
      if (y < H - 1 && core[k + W] && !covered[k + W] && !seen[k + W]) { seen[k + W] = 1; stack.push(k + W); }
    }
    total += n * cell * cell;
    if (n < minCells) continue;
    const ext = (Math.max(bx1 - bx0, by1 - by0) + 1) * cell;
    cells.sort((a, b) => a - b);
    const rects = [];
    for (let i = 0; i < cells.length; ) {
      let e = i;
      while (e + 1 < cells.length && cells[e + 1] === cells[e] + 1 && (cells[e + 1] % W) !== 0) e++;
      const j = (cells[i] / W) | 0, xa = cells[i] % W, xb = cells[e] % W + 1;
      rects.push([[x0 + xa * cell, y0 + j * cell], [x0 + xb * cell, y0 + j * cell], [x0 + xb * cell, y0 + (j + 1) * cell], [x0 + xa * cell, y0 + (j + 1) * cell]]);
      i = e + 1;
    }
    patches.push({ x: x0 + (sx / n + 0.5) * cell, y: y0 + (sy / n + 0.5) * cell, r: ext / 2, area: n * cell * cell, rects });
  }
  patches.total = total;
  return patches;
}

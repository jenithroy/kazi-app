/**
 * Which shapes lie over which? The engine sews a shape that lies on another after it, so it needs to know the pairs that overlap.
 * Testing every pair with polygon clipping takes for ever when there are thousands of shapes (a traced photograph), so the shapes
 * are drawn onto a fine grid instead: each cell remembers which shapes cover it, and two shapes overlap where they share cells.
 * The edges are exact to about a tenth of a millimetre, which is all that sewing order needs, and the work grows with the area
 * drawn, not with the square of the number of shapes.
 */

/**
 * @param {number[][][][]} shapes  each a list of rings (millimetres, read even-odd, so a ring inside a ring is a hole)
 * @param {number} minArea  pairs that overlap by less than this (mm²) are left out
 * @param {object} o  cell (grid cell side in mm, default 0.1), maxCells (the grid is made coarser rather than bigger than this, default 6 million)
 * @returns {Array<[number, number]>} the pairs [i, j] with i < j that overlap by at least minArea
 */
export function overlappingPairs(shapes, minArea, { cell = 0.1, maxCells = 6e6 } = {}) {
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
  for (const rings of shapes) for (const r of rings) for (const p of r) {
    if (p[0] < X0) X0 = p[0];
    if (p[0] > X1) X1 = p[0];
    if (p[1] < Y0) Y0 = p[1];
    if (p[1] > Y1) Y1 = p[1];
  }
  if (!(X1 > X0 && Y1 > Y0)) return [];
  const c = Math.max(cell, Math.sqrt(((X1 - X0) * (Y1 - Y0)) / maxCells));
  const W = Math.ceil((X1 - X0) / c) + 1, H = Math.ceil((Y1 - Y0) / c) + 1;
  const first = new Int32Array(W * H).fill(-1); // the first shape on each cell
  const second = new Int32Array(W * H).fill(-1); // the second
  const more = new Map(); // cell -> the others (three shapes meeting on a cell is rare)
  const counts = new Map(); // pair -> cells they share
  const n = shapes.length;
  const meet = (a, b) => { const k = a < b ? a * n + b : b * n + a; counts.set(k, (counts.get(k) || 0) + 1); };

  for (let k = 0; k < n; k++) {
    const rings = shapes[k];
    // The crossings of every outline with the middle of each row of cells it spans.
    let r0 = Infinity, r1 = -Infinity;
    for (const ring of rings) for (const p of ring) {
      const r = (p[1] - Y0) / c;
      if (r < r0) r0 = r;
      if (r > r1) r1 = r;
    }
    if (!(r1 >= r0)) continue;
    const rowMin = Math.max(0, Math.floor(r0 - 0.5)), rowMax = Math.min(H - 1, Math.ceil(r1 - 0.5));
    if (rowMax < rowMin) continue;
    const cross = Array.from({ length: rowMax - rowMin + 1 }, () => []);
    for (const ring of rings) {
      for (let i = 0, m = ring.length; i < m; i++) {
        const p = ring[i], q = ring[(i + 1) % m];
        if (p[1] === q[1]) continue;
        const [lo, hi] = p[1] < q[1] ? [p, q] : [q, p];
        const a = Math.max(rowMin, Math.ceil((lo[1] - Y0) / c - 0.5)), b = Math.min(rowMax, Math.ceil((hi[1] - Y0) / c - 0.5) - 1);
        for (let r = a; r <= b; r++) {
          const y = Y0 + (r + 0.5) * c;
          cross[r - rowMin].push(lo[0] + ((hi[0] - lo[0]) * (y - lo[1])) / (hi[1] - lo[1]));
        }
      }
    }
    for (let r = rowMin; r <= rowMax; r++) {
      const xs = cross[r - rowMin];
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let t = 0; t + 1 < xs.length; t += 2) {
        const c0 = Math.max(0, Math.ceil((xs[t] - X0) / c - 0.5)), c1 = Math.min(W - 1, Math.ceil((xs[t + 1] - X0) / c - 0.5) - 1);
        for (let x = c0; x <= c1; x++) {
          const at = r * W + x;
          if (first[at] < 0) first[at] = k;
          else {
            meet(first[at], k);
            if (second[at] < 0) second[at] = k;
            else {
              meet(second[at], k);
              const rest = more.get(at);
              if (rest) { for (const o of rest) meet(o, k); rest.push(k); } else more.set(at, [k]);
            }
          }
        }
      }
    }
  }
  const out = [];
  const cellArea = c * c;
  for (const [key, count] of counts) if (count * cellArea >= minArea) out.push([Math.floor(key / n), key % n]);
  return out;
}

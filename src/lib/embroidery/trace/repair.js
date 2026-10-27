/**
 * Last-resort repair of an outline that crosses itself.
 *
 * It only happens where an outline passes within a fraction of a pixel of itself: two letters of one colour touching at
 * a point, with a V-shaped gap ending on the baseline; the corner of a very acute wedge. The smoothed points can then
 * poke a little through the other side. The repair pulls the offending needle back along its own bisector until the
 * crossing is gone (at most a few pixels). It works on shared chain points, so both regions that use a line still see
 * identical points afterwards. Points that are junctions (where chains meet) are never moved.
 */

function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const o1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const o2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const o3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const o4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return ((o1 > 1e-12 && o2 < -1e-12) || (o1 < -1e-12 && o2 > 1e-12)) && ((o3 > 1e-12 && o4 < -1e-12) || (o3 < -1e-12 && o4 > 1e-12));
}

/**
 * Find a pair of segments of a closed polygon (flat xy, n points) that cross each other. Returns [i, j] with i < j
 * (segment i runs from point i to point i + 1, wrapping), or null.
 */
export function findCrossing(xy, n) {
  if (n < 4) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const x = xy[i * 2];
    const y = xy[i * 2 + 1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    const j = i + 1 === n ? 0 : i + 1;
    total += Math.abs(xy[j * 2] - x) + Math.abs(xy[j * 2 + 1] - y);
  }
  const cell = Math.max(1, (2 * total) / n);
  const gw = Math.floor((x1 - x0) / cell) + 1;
  const gh = Math.floor((y1 - y0) / cell) + 1;
  // bucket the segments in a grid (counting sort)
  const counts = new Int32Array(gw * gh + 1);
  const range = (i) => {
    const j = i + 1 === n ? 0 : i + 1;
    const ax = xy[i * 2], ay = xy[i * 2 + 1], bx = xy[j * 2], by = xy[j * 2 + 1];
    return [
      Math.floor((Math.min(ax, bx) - x0) / cell), Math.floor((Math.max(ax, bx) - x0) / cell),
      Math.floor((Math.min(ay, by) - y0) / cell), Math.floor((Math.max(ay, by) - y0) / cell),
    ];
  };
  for (let i = 0; i < n; i++) {
    const [ga, gb, gc, gd] = range(i);
    for (let gy = gc; gy <= gd; gy++) for (let gx = ga; gx <= gb; gx++) counts[gy * gw + gx + 1]++;
  }
  for (let k = 1; k < counts.length; k++) counts[k] += counts[k - 1];
  const items = new Int32Array(counts[counts.length - 1]);
  const fill = counts.slice();
  for (let i = 0; i < n; i++) {
    const [ga, gb, gc, gd] = range(i);
    for (let gy = gc; gy <= gd; gy++) for (let gx = ga; gx <= gb; gx++) items[fill[gy * gw + gx]++] = i;
  }
  for (let g = 0; g < gw * gh; g++) {
    for (let u = counts[g]; u < counts[g + 1]; u++) {
      const i = items[u];
      const i2 = i + 1 === n ? 0 : i + 1;
      for (let v = u + 1; v < counts[g + 1]; v++) {
        const j = items[v];
        if (j === i) continue;
        const a = i < j ? i : j;
        const b = i < j ? j : i;
        if (b - a <= 1 || (a === 0 && b === n - 1)) continue;
        const j2 = j + 1 === n ? 0 : j + 1;
        if (segCross(xy[i * 2], xy[i * 2 + 1], xy[i2 * 2], xy[i2 * 2 + 1], xy[j * 2], xy[j * 2 + 1], xy[j2 * 2], xy[j2 * 2 + 1])) return [a, b];
      }
    }
  }
  return null;
}

/** Does any segment next to point k cross any other segment of the polygon? (brute force, used only after a move) */
function crossesAround(xy, n, k) {
  const prev = (k - 1 + n) % n;
  const next = (k + 1) % n;
  const segs = [prev, k];
  for (const s of segs) {
    const s2 = (s + 1) % n;
    for (let j = 0; j < n; j++) {
      if (j === s || (j + 1) % n === s || j === (s + 1) % n) continue;
      const j2 = (j + 1) % n;
      if (segCross(xy[s * 2], xy[s * 2 + 1], xy[s2 * 2], xy[s2 * 2 + 1], xy[j * 2], xy[j * 2 + 1], xy[j2 * 2], xy[j2 * 2 + 1])) return true;
    }
  }
  void next;
  return false;
}

/**
 * Try to remove the crossing between segments i and j of a closed polygon by pulling one point back. `fixed(k)` says a
 * point may not move. Returns the index of the point that moved, or -1.
 */
export function pullBack(xy, n, i, j, fixed) {
  const cand = [i, (i + 1) % n, j, (j + 1) % n];
  const scored = [];
  for (const k of cand) {
    if (fixed(k)) continue;
    const p = (k - 1 + n) % n;
    const q = (k + 1) % n;
    const ux = xy[p * 2] - xy[k * 2];
    const uy = xy[p * 2 + 1] - xy[k * 2 + 1];
    const vx = xy[q * 2] - xy[k * 2];
    const vy = xy[q * 2 + 1] - xy[k * 2 + 1];
    const lu = Math.hypot(ux, uy);
    const lv = Math.hypot(vx, vy);
    if (lu < 1e-9 || lv < 1e-9) continue;
    const cos = (ux * vx + uy * vy) / (lu * lv); // 1 = a needle, -1 = straight
    scored.push({ k, cos, bx: ux / lu + vx / lv, by: uy / lu + vy / lv, mx: xy[p * 2] / 2 + xy[q * 2] / 2, my: xy[p * 2 + 1] / 2 + xy[q * 2 + 1] / 2 });
  }
  scored.sort((a, b) => b.cos - a.cos);
  for (const c of scored) {
    let bl = Math.hypot(c.bx, c.by);
    if (bl < 1e-6) continue;
    const dx = c.bx / bl;
    const dy = c.by / bl;
    const ox = xy[c.k * 2];
    const oy = xy[c.k * 2 + 1];
    for (let s = 0.15; s <= 3.0001; s += 0.15) {
      xy[c.k * 2] = ox + dx * s;
      xy[c.k * 2 + 1] = oy + dy * s;
      if (!crossesAround(xy, n, c.k)) return c.k;
    }
    // a needle with its two neighbours close by: collapse it onto the middle of them
    if (Math.hypot(c.mx - ox, c.my - oy) <= 3) {
      xy[c.k * 2] = c.mx;
      xy[c.k * 2 + 1] = c.my;
      if (!crossesAround(xy, n, c.k)) return c.k;
    }
    xy[c.k * 2] = ox;
    xy[c.k * 2 + 1] = oy;
  }
  return -1;
}

/**
 * Hairlines: the thin lines of a picture (a whisker, a hair, a twig: one pixel wide, or two) as the centre lines they are, not as strips.
 *
 * The tracer keeps the thin features it finds in artwork and photographs (photo.js thinLines) and widens every one of them to something a needle can sew
 * (labels.js thickenKept). A line of a pixel or two comes out three or four pixels wide, a bundle of them (the whiskers of a tiger: seven lines that leave
 * the same point, a pixel or three apart) runs together into one blob, and the stitch engine fills the blob: a fan of 0.15 mm lines became a patch of
 * 3 mm with a stub or two. `extractHairlines` takes the pieces that are this thin out of the label map before they are widened and returns their
 * centre lines. The converter (convert.js fineObjects) sews each as one line of thread, a bean stitch, the thinnest thing a needle makes (0.45 mm),
 * in the colour the line has in the picture.
 *
 * A piece is thin when it has no more pixels than `maxWidthPx` times the length of its skeleton. The skeleton is found by thinning (Zhang and Suen,
 * 1984, "A fast parallel algorithm for thinning digital patterns": a published algorithm, written here from the paper) and followed from end to end;
 * a chain shorter than `minChainPx` is the burr thinning leaves where a piece is thick, or the little tangle where a bundle of lines meets, and is dropped.
 * Where lines meet (the root of the whiskers) the chains end at the junction: the engine joins runs that end within a millimetre of each other without a thread cut.
 */

/** The numbers the tracer asks for (index.js): a line is a hairline when it is at most this wide, is worth this much length, and the picture is given this much of it. */
export const HAIRLINE = Object.freeze({
  maxWidthMm: 0.36, // a piece of pixels whose width is more than this is not a hairline (it is a stroke: the colour layer widens and sews it as before)
  minLenMm: 2, // the least length of a piece's lines together
  minChainMm: 0.8, // and of one line of it: shorter ones are the burr thinning leaves, or the tangle where a bundle of lines meets
  budgetMmPerCm2: 12, // all hairlines together: the longest pieces first, so a furry animal keeps its longest hairs and not every hair of its coat
  maxChains: 150, // and no more separate lines than this (each may cost a thread cut)
});

const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/** The biggest piece looked at (pixels): a thin line is never this big, a texture is, and thinning it would take long for nothing. */
const MAX_PIECE_PX = 20000;

/** Zhang-Suen thinning of a binary image (Uint8Array w*h, 1 = on), in place. */
function thin(img, w, h) {
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img[y * w + x]);
  const kill = [];
  for (let changed = true; changed;) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      kill.length = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!img[y * w + x]) continue;
          // the eight neighbours clockwise from the north: p2 .. p9
          const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1), p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let A = 0;
          for (let k = 0; k < 8; k++) if (seq[k] === 0 && seq[k + 1] === 1) A++;
          if (A !== 1) continue;
          if (step === 0) { if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue; }
          else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          kill.push(y * w + x);
        }
      }
      if (kill.length) { changed = true; for (const i of kill) img[i] = 0; }
    }
  }
}

/** Douglas-Peucker on a polyline. */
function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let bi = -1, bd = tol;
    const dx = pts[b][0] - pts[a][0], dy = pts[b][1] - pts[a][1], len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - pts[a][0]) * dy - (pts[i][1] - pts[a][1]) * dx) / len;
      if (d > bd) { bd = d; bi = i; }
    }
    if (bi >= 0) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** A moving average along a polyline (the ends stay): takes the one pixel staircase out of a thinned line. */
function smooth(pts, passes = 2) {
  let p = pts;
  for (let k = 0; k < passes; k++) {
    if (p.length < 3) return p;
    const q = [p[0]];
    for (let i = 1; i < p.length - 1; i++) q.push([(p[i - 1][0] + 2 * p[i][0] + p[i + 1][0]) / 4, (p[i - 1][1] + 2 * p[i][1] + p[i + 1][1]) / 4]);
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

/**
 * @param {Uint8Array} mask  1 where a pixel is part of a piece to look at (w * h)
 * @param {Uint8Array} lab   the palette entry each pixel is drawn in: a piece is the 8-connected pixels of the mask that have the same one
 * @param {{ maxWidthPx: number, minLenPx: number, minChainPx?: number, tolPx?: number }} o
 *   maxWidthPx: a piece with more pixels than this times its skeleton's length is too thick to be a hairline; minLenPx: the least total length of a piece's lines;
 *   minChainPx (2.5): a chain shorter than this is dropped (when the piece has others); tolPx (0.5): how far a line may stray from its simplified polyline
 * @returns {{ comps: { label: number, pixels: number[], chains: { pts: number[][], lenPx: number }[], lenPx: number }[] }}
 *   one entry for every hairline piece: the pixels it was made of, and its lines in pixel units (the centre of pixel x, y is x + 0.5, y + 0.5)
 */
export function extractHairlines(mask, lab, w, h, o) {
  const minChainPx = o.minChainPx ?? 2.5, tolPx = o.tolPx ?? 0.5;
  const seen = new Uint8Array(w * h);
  const comps = [];
  const stack = [];
  for (let i0 = 0; i0 < w * h; i0++) {
    if (!mask[i0] || seen[i0]) continue;
    const comp = [];
    stack.length = 0; stack.push(i0); seen[i0] = 1;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    while (stack.length) {
      const i = stack.pop(); comp.push(i);
      const x = i % w, y = (i - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const [dx, dy] of N8) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (mask[j] && !seen[j] && lab[j] === lab[i0]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (comp.length < 4 || comp.length > MAX_PIECE_PX) continue;
    // thin it in a window of its own
    const lw = x1 - x0 + 3, lh = y1 - y0 + 3;
    const loc = new Uint8Array(lw * lh);
    for (const i of comp) { const x = i % w, y = (i - x) / w; loc[(y - y0 + 1) * lw + (x - x0 + 1)] = 1; }
    thin(loc, lw, lh);
    const sk = [];
    for (let k = 0; k < loc.length; k++) if (loc[k]) sk.push(k);
    if (sk.length < 3 || comp.length > o.maxWidthPx * sk.length) continue; // too thick to be a hairline: the colour layer keeps it
    // each skeleton pixel's neighbours (a diagonal step beside an orthogonal one is no branch)
    const nbr = new Map();
    for (const k of sk) {
      const x = k % lw, y = (k - x) / lw, list = [];
      for (const [dx, dy] of N8) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= lw || yy >= lh || !loc[yy * lw + xx]) continue;
        if (dx && dy && (loc[y * lw + xx] || loc[yy * lw + x])) continue;
        list.push(yy * lw + xx);
      }
      nbr.set(k, list);
    }
    const deg = (k) => nbr.get(k).length;
    // follow the chains from every end and every junction (then any loop that has neither)
    const done = new Set();
    const edgeKey = (a, b) => (a < b ? a * 1e6 + b : b * 1e6 + a);
    const trace = (start, first) => {
      const path = [start];
      let prev = start, cur = first;
      done.add(edgeKey(start, first));
      for (;;) {
        path.push(cur);
        const nb = nbr.get(cur);
        if (nb.length !== 2) break;
        const next = nb[0] === prev ? nb[1] : nb[0];
        if (done.has(edgeKey(cur, next))) break;
        done.add(edgeKey(cur, next));
        prev = cur; cur = next;
        if (cur === start) { path.push(cur); break; }
      }
      return path;
    };
    const paths = [];
    for (const k of sk) if (deg(k) !== 2) for (const n of nbr.get(k)) if (!done.has(edgeKey(k, n))) paths.push(trace(k, n));
    for (const k of sk) if (deg(k) === 2) for (const n of nbr.get(k)) if (!done.has(edgeKey(k, n))) paths.push(trace(k, n));
    let total = 0;
    const out = [];
    for (const p of paths) {
      let pts = p.map((k) => [(k % lw) + x0 - 1 + 0.5, ((k / lw) | 0) + y0 - 1 + 0.5]);
      pts = smooth(pts);
      if (p.length > 6 && p[0] === p[p.length - 1]) { // a loop: simplified in two halves (its two ends are the same point)
        const m = p.length >> 1;
        pts = [...rdp(pts.slice(0, m + 1), tolPx), ...rdp(pts.slice(m), tolPx).slice(1)];
      } else pts = rdp(pts, tolPx);
      if (pts.length < 2) continue;
      let len = 0; // (the length of the line itself: the steps of the pixel path are longer on a slant)
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      // a burr thinning leaves at a thick spot, and the little tangle where a bundle of lines meet, are not lines: a chain this short is left out (a line that is all of its piece stays)
      if (len < minChainPx && paths.length > 1) continue;
      out.push({ pts, lenPx: len });
      total += len;
    }
    if (out.length && total >= o.minLenPx) comps.push({ label: lab[i0], pixels: comp, chains: out, lenPx: total });
  }
  return { comps };
}

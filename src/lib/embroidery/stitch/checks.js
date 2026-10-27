/**
 * Looks over a finished stitch list for the things that make a design sew badly, so the person is told before the machine
 * finds out. Works on the flat array of [x, y, command] triples (0.1 mm units) a pattern is sent around as.
 *
 *   tooShort    stitches shorter than 0.3 mm: wasted time, and the thread can cut the cloth there
 *   tooLong     stitches longer than 7 mm: they snag and loop
 *   piledUp     places where 7 or more needle holes fall inside half a millimetre: the cloth tears or the needle breaks
 *               (each is { x, y, holes } in millimetres, worst first)
 *   jumpsLong   jumps over 25 mm: a lot of loose thread and time
 */
import { CMD } from "../pattern.js";

export function checkStitches(flat, { shortMm = 0.3, longMm = 7, pileHoles = 7, cell = 0.5, jumpMm = 25 } = {}) {
  const n = flat.length / 3;
  let tooShort = 0, tooLong = 0, jumpsLong = 0;
  let px = null, py = null;
  const cells = new Map();
  const key = (cx, cy) => cx * 100003 + cy;
  for (let i = 0; i < n; i++) {
    const x = flat[i * 3], y = flat[i * 3 + 1], c = flat[i * 3 + 2];
    if (c === CMD.STITCH) {
      if (px !== null) {
        const d = Math.hypot(x - px, y - py) / 10;
        if (d < shortMm && d > 0) tooShort++;
        if (d > longMm) tooLong++;
      }
      const cx = Math.floor(x / 10 / cell), cy = Math.floor(y / 10 / cell);
      const k = key(cx, cy);
      cells.set(k, (cells.get(k) || 0) + 1);
      px = x; py = y;
    } else if (c === CMD.JUMP) {
      if (px !== null && Math.hypot(x - px, y - py) / 10 > jumpMm) jumpsLong++;
      px = null;
    }
  }
  // A cluster is a cell (and its neighbours) holding many holes: look at each cell with its 3 x 3 neighbourhood so a pile
  // that straddles two cells is not missed, and report each pile once.
  const piles = [];
  const seen = new Set();
  for (const [k, count] of cells) {
    if (count < Math.ceil(pileHoles / 2) || seen.has(k)) continue;
    const cx = Math.round(k / 100003), cy = k - cx * 100003;
    let holes = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) holes += cells.get(key(cx + dx, cy + dy)) || 0;
    if (holes >= pileHoles * 1.6) {
      piles.push({ x: (cx + 0.5) * cell, y: (cy + 0.5) * cell, holes });
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) seen.add(key(cx + dx, cy + dy));
    }
  }
  piles.sort((a, b) => b.holes - a.holes);
  return { tooShort, tooLong, jumpsLong, piledUp: piles.slice(0, 200), piledCount: piles.length };
}

/** The checks as sentences a person can act on (an empty list when all is well). */
export function checkMessages(r) {
  const out = [];
  if (r.tooLong) out.push({ kind: "long", message: `${r.tooLong} stitch${r.tooLong === 1 ? " is" : "es are"} longer than 7 mm and may snag.` });
  if (r.piledCount) out.push({ kind: "pile", message: `${r.piledCount} place${r.piledCount === 1 ? " has" : "s have"} many needle holes close together (marked in red on the preview). The cloth can tear or a needle break there: make the stitching less dense or the shape bigger.` });
  if (r.tooShort > 40) out.push({ kind: "short", message: `${r.tooShort} stitches are shorter than 0.3 mm. That slows the machine; a bigger design or a lower density helps.` });
  if (r.jumpsLong) out.push({ kind: "jump", message: `${r.jumpsLong} jump${r.jumpsLong === 1 ? "" : "s"} longer than 25 mm: a lot of loose thread to cut. Put the pieces closer together or in a better order.` });
  return out;
}

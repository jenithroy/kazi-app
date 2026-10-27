/**
 * The numbers a person wants about a finished stitch design: how many stitches, which colours in what order, how big, how
 * long it will take. Read straight from the flat stitch array the engine returns ([x, y, cmd] triples, 0.1 mm units).
 */
import { CMD } from "../embroidery/pattern.js";

/** A rough sewing speed of one head, stitches a minute, and the time a colour change and a trim take, in minutes. */
export const MACHINE = { spm: 700, colorChange: 0.5, trim: 0.06, jump: 0.015 };

export function summarize(flat, threads) {
  const n = flat.length / 3;
  const blocks = [];
  let cur = { index: 0, stitches: 0, jumps: 0, trims: 0, lengthMm: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let px = null, py = null;
  let stitches = 0, jumps = 0, trims = 0, changes = 0;
  for (let i = 0; i < n; i++) {
    const x = flat[i * 3], y = flat[i * 3 + 1], c = flat[i * 3 + 2];
    if (c === CMD.STITCH) {
      stitches++; cur.stitches++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (px !== null) cur.lengthMm += Math.hypot(x - px, y - py) / 10;
      px = x; py = y;
    } else if (c === CMD.JUMP) { jumps++; cur.jumps++; px = null; }
    else if (c === CMD.TRIM) { trims++; cur.trims++; }
    else if (c === CMD.COLOR_CHANGE) {
      blocks.push(cur);
      changes++;
      cur = { index: blocks.length, stitches: 0, jumps: 0, trims: 0, lengthMm: 0 };
      px = null;
    }
  }
  if (cur.stitches || !blocks.length) blocks.push(cur);
  const has = stitches > 0;
  const minutes = has ? stitches / MACHINE.spm + changes * MACHINE.colorChange + trims * MACHINE.trim + jumps * MACHINE.jump : 0;
  return {
    stitches,
    jumps,
    trims,
    colorChanges: changes,
    widthMm: has ? (maxX - minX) / 10 : 0,
    heightMm: has ? (maxY - minY) / 10 : 0,
    bounds: has ? [minX / 10, minY / 10, maxX / 10, maxY / 10] : null,
    threadMetres: blocks.reduce((s, b) => s + b.lengthMm, 0) / 1000,
    minutes,
    blocks: blocks.map((b, i) => ({ ...b, thread: threads[i] || null })),
  };
}

export function formatMinutes(m) {
  if (!m) return "–";
  if (m < 1) return "under a minute";
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return h ? `${h} h ${r} min` : `${Math.round(m)} min`;
}
